# Container format

`.astral` is an Astral Packager binary container, not a plain protobuf file. Version 3 keeps selected identity metadata readable, stores the complete JSON value and private identity entropy inside typed protobuf, compresses that protobuf losslessly, then encrypts it with AES-256-GCM.

Versions 1 and 2 remain readable.

## Version 3 header

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG3` |
| 8 | 1 | major version: `3` |
| 9 | 1 | minor version: `0` |
| 10 | 1 | password KDF: `1` = PBKDF2-HMAC-SHA-256 |
| 11 | 1 | cipher: `1` = AES-256-GCM |
| 12 | 1 | compression codec |
| 13 | 1 | payload format: `2` = typed JSON protobuf |
| 14 | 1 | flags: `0` |
| 15 | 1 | reserved: `0` |
| 16 | 4 | PBKDF2 iterations, unsigned big-endian |
| 20 | 4 | uncompressed protobuf length, unsigned big-endian |
| 24 | 4 | ciphertext length, including the 16-byte GCM tag |
| 28 | 4 | complete header length, unsigned big-endian |
| 32 | 16 | random password salt |
| 48 | 12 | random AES-GCM nonce |
| 60 | 43 | unpadded base64url Ed25519 public-key text |
| 103 | variable | UTF-8 public sign block |

The sign block ends at the complete header length from offset 28 and has this exact line order and final newline:

```text
solar=<sign>
lunar=<sign>
ascending=<sign>
midheaven=<sign>
descending=<sign>
imum_coeli=<sign>
```

Each value is either blank or one lowercase zodiac name:

```text
aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces
```

The packager reads the values from:

```text
astral-calculation.system.points.sun.position.value.sign
astral-calculation.system.points.moon.position.value.sign
astral-calculation.system.points.ascendant.position.value.sign
astral-calculation.system.points.midheaven.position.value.sign
astral-calculation.system.points.descendant.position.value.sign
astral-calculation.system.points.imum_coeli.position.value.sign
```

The fields remain in the encrypted payload. Generic JSON without those paths remains valid and receives blank public values. A present non-zodiac value is rejected.

The complete variable-length header is AES-GCM additional authenticated data. Any change to the public key, signs, codec, lengths, salt or nonce makes authenticated decryption fail. After decryption, the reader re-extracts the six signs from the recovered JSON and requires an exact match with the header.

## Compression codecs

| ID | Encoding |
|---:|---|
| 0 | uncompressed typed protobuf |
| 1 | Brotli stream defined by RFC 7932 |
| 2 | raw DEFLATE stream without zlib or gzip framing |
| 3 | Zstandard frame |

The codec ID determines the exact unpacking rule. Compression settings are not required for decompression and do not participate in identity generation.

### Packaging policy

- payloads smaller than 1,024 bytes remain raw protobuf;
- Node uses Zstandard level 3 when available and otherwise Brotli quality 4;
- browsers prefer Zstandard, then raw DEFLATE, then Brotli according to local support;
- browser compression has a 20-second limit;
- an unavailable, failed or timed-out automatic compression pass falls back to raw protobuf;
- raw protobuf is retained whenever compressed output is not smaller.

Compression happens before encryption. AES-GCM ciphertext must not be compressed afterward.

## Typed protobuf payload

The decrypted and decompressed plaintext follows this schema:

```proto
message Pack {
  uint32 version = 1;       // value 2
  bytes entropy = 2;        // exactly 32 private random bytes
  repeated string key = 3;  // sorted global object-key table
  Value root = 4;           // complete JSON value
}

message Value {
  oneof kind {
    Object object = 1;
    Array array = 2;
    string string = 3;
    sint64 integer = 4;
    double number = 5;
    bool boolean = 6;
    bool null = 7;
  }
}

message Object {
  repeated Pair field = 1;
}

message Pair {
  uint32 key = 1;
  Value value = 2;
}

message Array {
  repeated Value item = 1;
}
```

Object keys are collected once, sorted lexicographically and referenced by one-based integer. Object fields are encoded in ascending key-reference order. Safe JSON integers use protobuf zig-zag integers; other finite JSON numbers use little-endian IEEE-754 doubles. Strings are UTF-8. Arrays preserve input order.

## Packing order

```text
strict JSON
  → semantic value
  → extract six public signs
  → canonical JSON used for identity derivation
  → typed protobuf containing the complete value and private entropy
  → balanced lossless compression or raw protobuf
  → AES-256-GCM ciphertext
  → authenticated version-3 public header + ciphertext
```

## Unpacking order

1. Check `ASTRPKG3`, versions, lengths and limits.
2. Parse the public key and six-sign text block.
3. Derive the AES key from the supplied password.
4. Authenticate the full header and decrypt the ciphertext.
5. Decompress according to header byte 12, or copy bytes directly for codec `0`.
6. Require the exact uncompressed length from header offset 20.
7. Decode payload format `2`.
8. Rebuild canonical JSON from the semantic value.
9. Re-extract the six signs and require an exact match with the public block.
10. Derive the identity root from canonical JSON plus encrypted entropy.
11. Regenerate the Ed25519 public key and require an exact match with the readable key.

A failure at any stage rejects the container.

## Version 2

Version 2 begins with `ASTRPKG2`. It uses the same fixed fields through the public key at offset 60, but its header is exactly 103 bytes and contains no sign block. Its encrypted payload and compression rules are otherwise compatible with payload format `2`.

A version-2 public-only read can return the key but cannot expose signs without decrypting the payload.

## Version 1

Version 1 begins with `ASTRPKG1`. Its ciphertext decrypts directly to an uncompressed protobuf envelope containing canonical JSON bytes and identity entropy. It has no compression or public-sign metadata.

## Limits

- maximum ciphertext: 64 MiB
- maximum uncompressed protobuf: 64 MiB
- maximum version-3 public block: 256 bytes beyond the key
- automatic compression threshold: 1 KiB
- browser compression budget: 20 seconds
- entropy: exactly 32 bytes
- public key: exactly 43 base64url characters
- salt: 16 bytes
- nonce: 12 bytes

The raw input may use any filename extension but must contain one strict JSON value. Duplicate object keys, malformed Unicode and non-finite numbers are rejected.
