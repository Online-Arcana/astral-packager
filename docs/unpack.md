# Decrypting and unpacking

This is the clean-room unpacking contract for Astral Packager containers. An implementation should be able to read, decrypt, decompress, decode and validate a file without importing this repository.

## Byte conventions

- Byte offsets are zero-based.
- Header integers are unsigned 32-bit big-endian values.
- Text fields are UTF-8.
- Base64url text is unpadded.
- Reject trailing bytes, truncated fields, unsupported versions or algorithms, and unsafe lengths.

## Detect the version

Read the first eight bytes as ASCII:

- `ASTRPKG3`: current format with public signs.
- `ASTRPKG2`: typed protobuf and compression, without public signs.
- `ASTRPKG1`: legacy canonical-JSON protobuf, without compression.
- anything else: reject.

## Version 3 header

Version 3 begins with this fixed section:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG3` |
| 8 | 1 | major version, must be `3` |
| 9 | 1 | minor version, must be `0` |
| 10 | 1 | KDF, must be `1` for PBKDF2-HMAC-SHA-256 |
| 11 | 1 | cipher, must be `1` for AES-256-GCM |
| 12 | 1 | codec: `0` raw, `1` Brotli, `2` raw DEFLATE, `3` Zstandard |
| 13 | 1 | payload format, must be `2` |
| 14 | 1 | flags, must be `0` |
| 15 | 1 | reserved, must be `0` |
| 16 | 4 | PBKDF2 iterations |
| 20 | 4 | uncompressed protobuf length |
| 24 | 4 | ciphertext length including the 16-byte GCM tag |
| 28 | 4 | complete header length |
| 32 | 16 | PBKDF2 salt |
| 48 | 12 | AES-GCM nonce |
| 60 | 43 | unpadded base64url Ed25519 public key |
| 103 | variable | UTF-8 public sign block |

The header length must be at least 103 and no more than 359 bytes. The ciphertext starts exactly at the recorded header length, and the complete file length must equal `header length + ciphertext length`.

The public block is every byte from offset 103 to the header length. It begins with a newline that terminates the public-key text, then contains exactly these six labelled lines and a final newline:

```text

solar_sign=<value>
lunar_sign=<value>
ascending_sign=<value>
midheaven_sign=<value>
descending_sign=<value>
imum_coeli_sign=<value>
```

Each value is either blank or one lowercase member of:

```text
aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces
```

The complete variable-length header is authenticated additional data. A public-only reader may parse the key and signs without a password, but they become trusted only after authenticated decryption and the payload cross-check below.

## Password key

For every version:

1. Normalise the password with Unicode NFKC.
2. Encode the result as UTF-8.
3. Run PBKDF2-HMAC-SHA-256 with the recorded salt and iteration count.
4. Produce exactly 32 bytes and use them as the AES-256 key.

Accept iteration counts from `100000` through `10000000`. New files currently use `1200000`; readers must use the recorded value.

## AES-GCM decryption

For version 3:

- nonce: header bytes 48 through 59;
- tag length: 128 bits;
- tag representation: appended to the ciphertext;
- additional authenticated data: the exact complete header, including the public sign block.

A tag failure means the password is wrong or the file was altered. Do not continue parsing unauthenticated plaintext.

## Decompression

Interpret header byte 12:

- `0`: copy the decrypted bytes unchanged.
- `1`: decode one RFC 7932 Brotli stream.
- `2`: decode one raw DEFLATE stream without zlib or gzip framing.
- `3`: decode one Zstandard frame.

The output must exactly match the uncompressed length at header offset 20. Reject a mismatch.

## Typed protobuf payload

Versions 2 and 3 use standard Protocol Buffers wire format with this schema:

```proto
message Pack {
  uint32 version = 1;       // required value: 2
  bytes entropy = 2;        // required length: 32
  repeated string key = 3;  // sorted global object-key table
  Value root = 4;           // exactly one root value
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

Additional rules:

- `Pack.version` must be `2`.
- `Pack.entropy` must be exactly 32 bytes.
- Each `Value` selects exactly one supported kind.
- Object key references are one-based and must resolve inside `Pack.key`.
- Duplicate object keys are invalid.
- Arrays preserve encoded order.
- `sint64` uses protobuf zig-zag encoding and must decode to a JavaScript-safe integer.
- `double` is finite IEEE-754 binary64.
- Strings and keys are valid UTF-8 and contain no unpaired UTF-16 surrogates after decoding.
- Unknown fields may be skipped using normal protobuf wire rules, but known singular fields must not be duplicated.

The decoded `root` is the complete recovered semantic JSON value. The six public fields are not removed from it.

## Public sign cross-check

For version 3, read these payload paths:

```text
astral-calculation.system.points.sun.position.value.sign
astral-calculation.system.points.moon.position.value.sign
astral-calculation.system.points.ascendant.position.value.sign
astral-calculation.system.points.midheaven.position.value.sign
astral-calculation.system.points.descendant.position.value.sign
astral-calculation.system.points.imum_coeli.position.value.sign
```

Map them respectively to `solar_sign`, `lunar_sign`, `ascending_sign`, `midheaven_sign`, `descending_sign` and `imum_coeli_sign`.

- A missing or null path becomes a blank public value.
- A present value must be a string containing one zodiac name.
- Compare the six recovered values with the parsed public block exactly.
- Reject any mismatch before returning chart data or keys.

## Canonical JSON reconstruction

Rebuild identity JSON from the semantic value with:

- no insignificant whitespace;
- object keys sorted with ECMAScript string ordering;
- arrays in original order;
- ECMAScript `JSON.stringify` escaping for strings and keys;
- ECMAScript JSON number serialisation for finite numbers;
- literal `true`, `false` and `null`;
- rejection of duplicate keys, non-finite numbers and unpaired surrogates.

Encode the canonical string as UTF-8.

## Identity verification

Let:

```text
json = UTF8(canonical JSON)
doc  = SHA-256(json)
```

Derive the 32-byte identity root with HKDF-SHA-256:

```text
IKM  = Pack.entropy
salt = doc
info = UTF8("astral-pack/root/v1")
L    = 32
```

Derive the 32-byte Ed25519 signing seed:

```text
IKM  = root
salt = doc
info = UTF8("astral-pack/sign/ed25519/v1")
L    = 32
```

Generate the raw 32-byte Ed25519 public key, encode it as unpadded base64url and require an exact match with header bytes 60 through 102.

For PKCS#8 seed import, prepend this 16-byte prefix to the 32-byte seed:

```text
30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20
```

## Child keys

Application keys are 32-byte HKDF-SHA-256 outputs:

```text
IKM  = root
salt = doc || context
info = UTF8("astral-pack/key/v1/" || name)
L    = 32
```

`||` is direct byte concatenation. `context` may be empty or contain a stable reading, device or revision identifier.

## Version 2

Version 2 has the same fixed fields as version 3 through the public key, but:

- magic is `ASTRPKG2`;
- major version is `2`;
- header length must be exactly `103`;
- there is no public sign block;
- AES-GCM authenticates the exact 103-byte header;
- typed protobuf and decompression rules are unchanged.

A public-only read returns the key and blank sign fields. After decryption, signs may still be extracted from the recovered payload for application use.

## Version 1

Version 1 has a 99-byte header:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG1` |
| 8 | 1 | major version, must be `1` |
| 9 | 1 | minor version, must be `0` |
| 10 | 1 | KDF, must be `1` |
| 11 | 1 | cipher, must be `1` |
| 12 | 4 | PBKDF2 iterations |
| 16 | 1 | salt length, must be `16` |
| 17 | 1 | nonce length, must be `12` |
| 18 | 1 | public-key length, must be `43` |
| 19 | 1 | flags, must be `0` |
| 20 | 4 | ciphertext length including tag |
| 24 | 4 | header length, must be `99` |
| 28 | 16 | salt |
| 44 | 12 | nonce |
| 56 | 43 | public-key text |

Use the same password and AES-GCM rules, with the exact 99-byte header as additional authenticated data.

The decrypted plaintext is uncompressed protobuf:

```proto
message PackV1 {
  uint32 version = 1; // required value: 1
  bytes json = 2;     // non-empty canonical UTF-8 JSON
  bytes entropy = 3;  // exactly 32 bytes
}
```

Parse and canonicalise field 2, require byte equality with the stored JSON, then derive and verify the identity as above.

## Failure handling

Reject the complete file on any failure involving:

- magic, version, algorithm or flags;
- length or safety bounds;
- public block syntax;
- password authentication;
- decompression or decompressed length;
- protobuf structure;
- semantic or canonical JSON;
- public sign cross-check;
- entropy length;
- regenerated public-key comparison.

Do not return partial chart data or derived secrets after failure. Clear password-derived, decrypted, entropy, root and signing-seed buffers where the runtime permits.
