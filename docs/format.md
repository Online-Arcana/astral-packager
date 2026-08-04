# Container format

`.astral` is an Astral Packager container, not a plain protobuf file. Version 1 has a fixed binary header followed by AES-GCM ciphertext.

## Header

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG1` |
| 8 | 1 | major version: `1` |
| 9 | 1 | minor version: `0` |
| 10 | 1 | KDF: `1` = PBKDF2-HMAC-SHA-256 |
| 11 | 1 | cipher: `1` = AES-256-GCM |
| 12 | 4 | PBKDF2 iterations, unsigned big-endian |
| 16 | 1 | salt length: `16` |
| 17 | 1 | nonce length: `12` |
| 18 | 1 | public-key text length: `43` |
| 19 | 1 | flags: `0` |
| 20 | 4 | ciphertext length, unsigned big-endian |
| 24 | 4 | complete header length, unsigned big-endian |
| 28 | 16 | password salt |
| 44 | 12 | AES-GCM nonce |
| 56 | 43 | raw base64url Ed25519 public key text |

The complete header is AES-GCM additional authenticated data. Its public key can be read without decrypting the file but cannot be replaced without invalidating the ciphertext.

## Encrypted protobuf

The decrypted bytes use protobuf wire encoding:

```proto
message Pack {
  uint32 version = 1; // currently 1
  bytes json = 2;     // RFC 8785-style canonical UTF-8 JSON
  bytes entropy = 3;  // 32 random identity bytes
}
```

Unknown protobuf fields are skipped for forward compatibility. Known fields must occur exactly once.

## Limits

Version 1 accepts ciphertext up to 64 MiB. The raw input may use any filename extension but must contain one strict JSON value. Duplicate object keys, non-finite numbers and malformed Unicode are rejected.
