# Decrypting and unpacking

This document is the clean-room unpacking contract for Astral Packager containers. An implementation should be able to read, decrypt, decompress, decode and validate a file without importing this repository's source code.

## Byte conventions

- Byte offsets are zero-based.
- Every multi-byte integer in a container header is an unsigned 32-bit big-endian integer.
- Text fields are UTF-8.
- Base64url text is unpadded.
- Reject a container with trailing bytes, truncated fields, unsupported versions, unsupported algorithms or lengths outside the documented limits.

## Detect the container version

Read the first eight bytes as ASCII:

- `ASTRPKG2`: use the version-2 rules below.
- `ASTRPKG1`: use the legacy version-1 rules below.
- anything else: reject the file.

## Version 2

### Header

Version 2 has a fixed 103-byte header:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG2` |
| 8 | 1 | major version, must be `2` |
| 9 | 1 | minor version, must be `0` |
| 10 | 1 | password KDF, must be `1` for PBKDF2-HMAC-SHA-256 |
| 11 | 1 | cipher, must be `1` for AES-256-GCM |
| 12 | 1 | compression codec: `0` raw, `1` Brotli, `2` raw DEFLATE, `3` Zstandard |
| 13 | 1 | payload format, must be `2` |
| 14 | 1 | flags, must be `0` |
| 15 | 1 | reserved, must be `0` |
| 16 | 4 | PBKDF2 iteration count |
| 20 | 4 | uncompressed protobuf length |
| 24 | 4 | ciphertext length, including the 16-byte GCM tag |
| 28 | 4 | header length, must be `103` |
| 32 | 16 | PBKDF2 salt |
| 48 | 12 | AES-GCM nonce |
| 60 | 43 | unpadded base64url Ed25519 public key |

The ciphertext starts at offset 103 and must contain exactly the number of bytes declared at offset 24. The final 16 bytes of the ciphertext are the AES-GCM authentication tag, matching the combined `ciphertext || tag` representation returned by Web Crypto.

Reject values outside these bounds:

- PBKDF2 iterations: `100000` through `10000000` inclusive;
- ciphertext: at least 16 bytes and at most 64 MiB;
- uncompressed protobuf: at least 1 byte and at most 64 MiB;
- public key: exactly 43 ASCII base64url characters matching `[A-Za-z0-9_-]`.

### Password key

1. Normalise the password as Unicode NFKC.
2. Encode the normalised string as UTF-8.
3. Run PBKDF2-HMAC-SHA-256 with:
   - input: the UTF-8 password bytes;
   - salt: header bytes 32 through 47;
   - iterations: the unsigned integer at header offset 16;
   - output length: 32 bytes.
4. Use the 32-byte result as the AES-256 key.

The production writer currently stores `1200000` iterations, but readers must use the value recorded in the header after enforcing the safe range.

### AES-GCM decryption

Decrypt the bytes after the header with:

- cipher: AES-256-GCM;
- key: the PBKDF2 result;
- nonce: header bytes 48 through 59;
- authentication tag: 128 bits, appended to the ciphertext;
- additional authenticated data: the exact complete 103-byte header, byte for byte.

A tag failure means the password is wrong or the container was altered. Do not continue parsing unauthenticated plaintext.

### Decompression

Interpret header byte 12:

- `0`: plaintext is already the typed protobuf payload; copy it unchanged.
- `1`: decode one RFC 7932 Brotli stream.
- `2`: decode one raw DEFLATE stream with no zlib or gzip wrapper.
- `3`: decode one Zstandard frame.

The decompressed result must be exactly the byte length declared at header offset 20. Reject any mismatch.

Compression level and encoder settings do not affect unpacking and are not identity inputs.

### Typed protobuf payload

Decode standard Protocol Buffers wire format using this schema:

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
    bool null = 7;          // must be true when selected
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

Rules beyond the protobuf schema:

- `Pack.version` must equal `2`.
- `Pack.entropy` must contain exactly 32 bytes.
- Each `Value` must select exactly one supported kind.
- Object key references are one-based and must resolve inside `Pack.key`.
- Duplicate object keys are invalid.
- Arrays preserve their encoded order.
- `sint64` uses standard protobuf zig-zag encoding and must decode to a JavaScript-safe integer.
- `double` is IEEE-754 binary64 and must be finite.
- Strings and keys must be valid UTF-8 and must not contain unpaired UTF-16 surrogates after decoding.
- Unknown fields may be skipped according to normal protobuf wire rules, but known singular fields must not be duplicated.

The decoded `root` is the recovered semantic JSON value.

## Canonical JSON reconstruction

Reconstruct the identity JSON from the semantic value using these rules:

- no insignificant whitespace;
- object keys sorted lexicographically using ECMAScript string ordering, which compares UTF-16 code units;
- arrays retain their original order;
- strings and object keys use ECMAScript `JSON.stringify` escaping;
- finite numbers use ECMAScript JSON number serialisation;
- booleans are `true` or `false`;
- null is `null`;
- duplicate keys, non-finite numbers and unpaired surrogates are invalid.

Encode the resulting canonical JSON string as UTF-8. Storage formatting, protobuf field ordering and compression settings must not influence these bytes.

## Reconstructing and checking the identity

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

Derive the 32-byte Ed25519 signing seed with HKDF-SHA-256:

```text
IKM  = root
salt = doc
info = UTF8("astral-pack/sign/ed25519/v1")
L    = 32
```

Generate the Ed25519 public key from that seed, encode its raw 32 bytes as unpadded base64url, and require an exact match with header bytes 60 through 102. The plaintext header key is only a claimed identity until this comparison succeeds.

For an Ed25519 implementation that imports PKCS#8 seed material, the writer uses this 16-byte prefix followed by the 32-byte seed:

```text
30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20
```

## Deriving child keys

Application keys are 32-byte HKDF-SHA-256 outputs:

```text
IKM  = root
salt = doc || context
info = UTF8("astral-pack/key/v1/" || name)
L    = 32
```

`||` means direct byte concatenation. `context` may be empty or may contain an application-defined stable identifier such as a reading ID. Distinct names and contexts produce separated keys.

## Version 1

Version 1 has no compression and uses a 99-byte header.

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG1` |
| 8 | 1 | major version, must be `1` |
| 9 | 1 | minor version, must be `0` |
| 10 | 1 | password KDF, must be `1` |
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

Use the same password normalisation, PBKDF2 and AES-GCM rules as version 2, with the exact 99-byte header as additional authenticated data.

The decrypted plaintext is an uncompressed protobuf message:

```proto
message PackV1 {
  uint32 version = 1; // required value: 1
  bytes json = 2;     // non-empty canonical UTF-8 JSON
  bytes entropy = 3;  // exactly 32 bytes
}
```

Parse `json` as strict JSON, canonicalise it using the rules above, and require the reconstructed UTF-8 bytes to match field 2 exactly. Then derive and verify the identity using the same root and signing rules.

## Failure handling

Reject the complete container when any of these checks fails:

- magic, version, algorithm or flags;
- length or safety bounds;
- password authentication;
- decompression or decompressed length;
- protobuf structure;
- semantic JSON validity;
- canonical JSON reconstruction;
- entropy length;
- regenerated public-key comparison.

Do not return partial chart data or derived secret keys after a failed check. Clear temporary password-derived, decrypted, entropy, root and signing-seed buffers where the runtime permits.
