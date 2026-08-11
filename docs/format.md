# Container format

`.astral` is an Astral Packager binary container, not a plain protobuf file. Version 5 stores the exact raw Ed25519 public identity key plus a versioned cleartext astrological identity block in the authenticated header. The complete JSON value and private identity entropy remain inside compressed, encrypted typed protobuf.

Versions 1–4 remain readable.

## Version 5 header

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG5` |
| 8 | 1 | major version: `5` |
| 9 | 1 | minor version: `0` |
| 10 | 1 | password KDF: `1` = PBKDF2-HMAC-SHA-256 |
| 11 | 1 | cipher: `1` = AES-256-GCM |
| 12 | 1 | compression codec |
| 13 | 1 | payload format: `2` = typed JSON protobuf |
| 14 | 1 | flags: `0` |
| 15 | 1 | reserved: `0` |
| 16 | 4 | PBKDF2 iterations, unsigned big-endian |
| 20 | 4 | uncompressed protobuf length, unsigned big-endian |
| 24 | 4 | ciphertext length including the 16-byte GCM tag |
| 28 | 4 | complete header length, unsigned big-endian |
| 32 | 16 | random password salt |
| 48 | 12 | random AES-GCM nonce |
| 60 | 32 | exact raw Ed25519 public identity key |
| 92 | variable | canonical UTF-8 public metadata JSON |

The 32 bytes at offsets `60–91` are the public identity key itself. Tools may expose the same bytes as canonical unpadded base64url text for display.

The public metadata block begins at offset `92` and ends at the complete header length stored at offset `28`. It is canonical JSON with schema `astral-public-meta/1.0.0`:

```json
{
  "schema": "astral-public-meta/1.0.0",
  "signs": {
    "solar": "capricorn",
    "lunar": "virgo",
    "ascending": "capricorn",
    "midheaven": "libra",
    "descending": "cancer",
    "imumCoeli": "aries"
  },
  "wheel": {
    "schema": "astral-public-wheel/1.0.0",
    "calculationFingerprint": "sha256:...",
    "primaryHouseSystem": "placidus",
    "points": {
      "sun": 281.25,
      "moon": 166.5,
      "ascendant": 294.125
    },
    "houses": {
      "status": "calculated",
      "houses": {
        "1": {
          "number": 1,
          "cuspLongitudeDegrees": 294.125,
          "endLongitudeDegrees": 324.125
        }
      }
    },
    "aspects": [
      {
        "id": "sun-trine-mars",
        "a": "sun",
        "b": "mars",
        "kind": "trine",
        "class": "major",
        "character": "flowing"
      }
    ]
  }
}
```

The example is abbreviated. The actual `points` map contains every point recognised by the shared wheel contract and the house map contains all twelve houses. A point or house longitude may be `null` where timed geometry is unavailable.

The six sign values are copied from:

```text
astral-calculation.system.points.sun.position.value.sign
astral-calculation.system.points.moon.position.value.sign
astral-calculation.system.points.ascendant.position.value.sign
astral-calculation.system.points.midheaven.position.value.sign
astral-calculation.system.points.descendant.position.value.sign
astral-calculation.system.points.imum_coeli.position.value.sign
```

The `wheel` object contains only fields used to reconstruct the deterministic natal wheel:

- `astral-calculation.provenance.calculationFingerprint`
- `astral-calculation.settings.primaryHouseSystem`
- `astral-calculation.system.points.*.position.value.longitudeDegrees`
- the selected house chart's status, cusp longitudes and end longitudes
- aspect id, endpoints, kind, class and character

It deliberately excludes the subject name, birth record, interpretations, compatibility, dignity and unrelated deterministic calculation fields. Generic JSON without the required wheel structure receives blank signs and `wheel: null`.

The complete variable-length header is AES-GCM additional authenticated data. Any change to the raw key, public metadata, algorithms, lengths, salt or nonce invalidates authentication. After decryption, the reader regenerates the raw public key and re-extracts the complete public metadata from the encrypted chart, requiring exact canonical equality.

## Compression codecs

| ID | Encoding |
|---:|---|
| 0 | uncompressed typed protobuf |
| 1 | Brotli stream defined by RFC 7932 |
| 2 | raw DEFLATE without zlib or gzip framing |
| 3 | Zstandard frame |

Packaging performs one balanced compression pass. Payloads below 1,024 bytes remain raw protobuf. Node prefers Zstandard level 3 and otherwise uses Brotli quality 4. Browsers prefer Zstandard, raw DEFLATE, then Brotli. Browser compression has a 20-second budget and falls back to raw protobuf. Compressed output is retained only when smaller.

Compression happens before encryption and is not an identity input.

## Typed protobuf payload

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

message Object { repeated Pair field = 1; }
message Pair { uint32 key = 1; Value value = 2; }
message Array { repeated Value item = 1; }
```

Object keys are collected once, sorted lexicographically and referenced by one-based integer. Object fields use ascending key-reference order. Safe JSON integers use protobuf zig-zag integers; other finite numbers use little-endian IEEE-754 binary64. Strings are UTF-8 and arrays retain order.

## Packing order

```text
strict JSON
  → semantic value
  → extract public identity signs and natal-wheel metadata
  → canonical JSON for identity derivation
  → typed protobuf containing the complete value and private entropy
  → balanced lossless compression or raw protobuf
  → AES-256-GCM ciphertext
  → authenticated ASTRPKG5 header + ciphertext
```

## Unpacking order

1. Validate `ASTRPKG5`, algorithms, lengths and limits.
2. Copy the 32 raw public-key bytes from offsets `60–91`.
3. Parse and validate the public metadata block beginning at offset `92`.
4. Derive the AES key from the supplied password.
5. Authenticate the complete header and decrypt the ciphertext.
6. Decompress according to header byte 12.
7. Require the exact uncompressed length from offset 20.
8. Decode typed protobuf and reconstruct canonical JSON.
9. Re-extract the public signs and wheel metadata and compare them canonically with the header.
10. Derive the identity root and Ed25519 signing seed.
11. Regenerate the raw 32-byte public key and compare it byte-for-byte with the header.

Any failure rejects the container.

## Legacy versions

- `ASTRPKG4`: exact raw 32-byte key at offsets `60–91`, followed by the old six-line sign block at offset `92`.
- `ASTRPKG3`: 43-character base64url public-key text at offsets `60–102`, followed by the sign block at offset `103`.
- `ASTRPKG2`: the same 43-character text key and a fixed 103-byte header, without public signs.
- `ASTRPKG1`: a 99-byte header and an uncompressed protobuf envelope containing canonical JSON bytes and identity entropy.

Legacy readers recover the same 32 raw public-key bytes. Versions 3 and 4 retain their original sign comparison on open. New writers produce version 5 only.

## Limits

- maximum ciphertext: 64 MiB
- maximum uncompressed protobuf: 64 MiB
- maximum version 5 public metadata block: 64 KiB
- raw public key: exactly 32 bytes
- automatic compression threshold: 1 KiB
- browser compression budget: 20 seconds
- private entropy: exactly 32 bytes
- salt: 16 bytes
- nonce: 12 bytes

The raw input may use any filename extension but must contain one strict JSON value. Duplicate object keys, malformed Unicode and non-finite numbers are rejected.
