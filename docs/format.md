# Container format

`.astral` is an Astral Packager binary container, not a plain protobuf file. Version 2 keeps the public Ed25519 key readable, stores all private identity material inside typed protobuf, compresses that protobuf losslessly, then encrypts it with AES-256-GCM.

Version 1 remains readable for compatibility.

## Version 2 header

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG2` |
| 8 | 1 | major version: `2` |
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
| 60 | 43 | base64url Ed25519 public-key text |

The version-2 header is always 103 bytes. The complete header is AES-GCM additional authenticated data. Tools may read the public key without a password, but any header change makes authenticated decryption fail.

## Compression codecs

| ID | Encoding |
|---:|---|
| 0 | uncompressed typed protobuf |
| 1 | Brotli stream defined by RFC 7932 |
| 2 | raw DEFLATE stream without zlib or gzip framing |

Packaging always includes raw protobuf as a candidate, so compression can never enlarge the payload. The smallest supported lossless candidate is stored.

The Node CLI compares:

- Brotli quality 11 in generic mode
- Brotli quality 11 in text mode
- raw DEFLATE level 9 with the default strategy
- raw DEFLATE level 9 with the filtered strategy
- uncompressed protobuf

The browser uses the same selection rule with the lossless Brotli and raw-DEFLATE encoders exposed by its Compression Streams implementation. A runtime that lacks one codec simply excludes that candidate. The codec ID in the header determines the exact unpacking rule.

Compression is performed before encryption. AES-GCM ciphertext is intentionally random-looking and must never be passed through another compression stage.

## Typed protobuf payload

The uncompressed plaintext follows this logical schema:

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
    bool null = 7;          // encoded as true
  }
}

message Object {
  repeated Pair field = 1;
}

message Pair {
  uint32 key = 1;           // one-based index into Pack.key
  Value value = 2;
}

message Array {
  repeated Value item = 1;
}
```

Object keys are collected once, sorted lexicographically and referenced by integer. Object fields are encoded in ascending key-reference order. Safe JSON integers use protobuf zig-zag integers; other finite JSON numbers use little-endian IEEE-754 doubles. Strings are UTF-8. Arrays preserve input order.

This generic schema accepts any valid JSON value and does not depend on the current Astrology schema. A future typed Astrology protobuf can receive a new payload-format ID without changing the outer encrypted container.

## Packing order

```text
strict JSON
  → semantic value
  → canonical JSON used for identity derivation
  → typed protobuf with private entropy
  → smallest supported lossless encoding
  → AES-256-GCM ciphertext
  → authenticated public header + ciphertext
```

The compression result does not generate the identity. The identity root is derived from the recovered canonical JSON and private entropy, so changing codec, compression mode or compression library cannot change the user's public key or child keys.

## Unpacking order

1. Check `ASTRPKG2`, versions, lengths and limits.
2. Read the public key and password-lock metadata.
3. Derive the AES key from the supplied password.
4. Authenticate the full header and decrypt the ciphertext.
5. Decompress according to header byte 12.
6. Require the exact uncompressed length from header offset 20.
7. Decode payload format 2 with the schema above.
8. Rebuild canonical JSON from the semantic value.
9. Derive the identity root from canonical JSON plus encrypted entropy.
10. Regenerate the Ed25519 public key and require an exact match with the readable header.

A failure at any stage rejects the container.

## Version 1

Version 1 begins with `ASTRPKG1`. Its ciphertext decrypts directly to a small protobuf envelope containing canonical JSON bytes and identity entropy. It has no compression metadata. Version-2 readers retain this decoder so existing identities are not stranded.

## Limits

- maximum ciphertext: 64 MiB
- maximum uncompressed protobuf: 64 MiB
- entropy: exactly 32 bytes
- public key: exactly 43 base64url characters
- salt: 16 bytes
- nonce: 12 bytes

The raw input may use any filename extension but must contain one strict JSON value. Duplicate object keys, malformed Unicode and non-finite numbers are rejected.
