# Decrypting and unpacking

This is the clean-room contract for reading Astral Packager containers without importing this repository.

## Byte conventions

- Offsets are zero-based.
- Header integers are unsigned 32-bit big-endian values.
- Text is UTF-8.
- Base64url display text is unpadded.
- Reject unsupported versions, algorithms, unsafe lengths, truncation and trailing bytes.

## Version detection

Read the first eight bytes as ASCII:

- `ASTRPKG4`: current raw-key format.
- `ASTRPKG3`: legacy text-key format with public signs.
- `ASTRPKG2`: legacy text-key format without public signs.
- `ASTRPKG1`: legacy canonical-JSON protobuf.

Anything else is invalid.

## ASTRPKG4 public header

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG4` |
| 8 | 1 | major version, must be `4` |
| 9 | 1 | minor version, must be `0` |
| 10 | 1 | KDF, must be `1` |
| 11 | 1 | cipher, must be `1` |
| 12 | 1 | codec: `0` raw, `1` Brotli, `2` raw DEFLATE, `3` Zstandard |
| 13 | 1 | payload format, must be `2` |
| 14 | 1 | flags, must be `0` |
| 15 | 1 | reserved, must be `0` |
| 16 | 4 | PBKDF2 iteration count |
| 20 | 4 | uncompressed protobuf length |
| 24 | 4 | ciphertext length including the 16-byte tag |
| 28 | 4 | complete header length |
| 32 | 16 | PBKDF2 salt |
| 48 | 12 | AES-GCM nonce |
| 60 | 32 | exact raw Ed25519 public key |
| 92 | variable | UTF-8 public sign block |

The header length must be between 92 and 348 bytes inclusive. The ciphertext begins at the recorded header length. The file length must equal `header length + ciphertext length`.

Copy offsets `60–91` unchanged as the public key. Do not hash, decode, normalise or reinterpret those bytes. To display the key, encode the 32 bytes as canonical unpadded base64url; this yields 43 characters.

The sign block begins with a newline and contains exactly six labelled lines plus the final newline:

```text

solar_sign=<value>
lunar_sign=<value>
ascending_sign=<value>
midheaven_sign=<value>
descending_sign=<value>
imum_coeli_sign=<value>
```

Each value is blank or one lowercase zodiac name:

```text
aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces
```

A public-only consumer may read the raw key and signs without a password. They become authenticated only after successful AES-GCM decryption because the complete header is additional authenticated data.

## Password key

For every version:

1. Normalise the password with Unicode NFKC.
2. Encode it as UTF-8.
3. Run PBKDF2-HMAC-SHA-256 with the stored salt and iteration count.
4. Produce exactly 32 bytes for AES-256.

Accept iteration counts from `100000` through `10000000`. Current writers use `1200000`.

## AES-GCM

For ASTRPKG4:

- key: the 32-byte PBKDF2 output;
- nonce: bytes `48–59`;
- tag: 128 bits, appended to the ciphertext;
- additional authenticated data: the exact complete header from byte 0 to `header length - 1`.

Authentication failure means the password is wrong or the file changed. Do not parse unauthenticated plaintext.

## Decompression

Use header byte 12:

- `0`: copy plaintext unchanged;
- `1`: decode one RFC 7932 Brotli stream;
- `2`: decode one raw DEFLATE stream without zlib/gzip framing;
- `3`: decode one Zstandard frame.

The result must exactly match the uncompressed length at offset 20.

## Typed protobuf

ASTRPKG2–4 use this standard protobuf wire schema:

```proto
message Pack {
  uint32 version = 1;       // required value: 2
  bytes entropy = 2;        // exactly 32 bytes
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

message Object { repeated Pair field = 1; }
message Pair { uint32 key = 1; Value value = 2; }
message Array { repeated Value item = 1; }
```

Validation rules:

- `Pack.version` is `2`;
- entropy is exactly 32 bytes;
- each `Value` selects exactly one kind;
- key references are one-based and in range;
- duplicate object keys are invalid;
- arrays retain encoded order;
- `sint64` uses protobuf zig-zag and must be a JavaScript-safe integer;
- `double` is finite IEEE-754 binary64;
- strings and keys are valid UTF-8 without unpaired surrogates;
- unknown fields may be skipped, but known singular fields may not repeat.

The root is the complete semantic JSON value. Public sign fields remain present inside it.

## Public sign verification

Read these paths from the recovered value:

```text
astral-calculation.system.points.sun.position.value.sign
astral-calculation.system.points.moon.position.value.sign
astral-calculation.system.points.ascendant.position.value.sign
astral-calculation.system.points.midheaven.position.value.sign
astral-calculation.system.points.descendant.position.value.sign
astral-calculation.system.points.imum_coeli.position.value.sign
```

Map them in order to the six public labels. A missing or null path becomes blank. A present value must be a valid zodiac string. Compare all six values exactly with the header and reject any mismatch.

## Canonical JSON

Reconstruct identity JSON with:

- no insignificant whitespace;
- object keys sorted using ECMAScript string ordering;
- original array order;
- ECMAScript `JSON.stringify` escaping;
- ECMAScript finite-number serialisation;
- literal `true`, `false` and `null`;
- rejection of duplicate keys, non-finite values and unpaired surrogates.

Encode the result as UTF-8.

## Identity and public-key verification

```text
json = UTF8(canonical JSON)
doc  = SHA-256(json)
```

Identity root:

```text
HKDF-SHA-256
IKM  = Pack.entropy
salt = doc
info = UTF8("astral-pack/root/v1")
L    = 32
```

Ed25519 signing seed:

```text
HKDF-SHA-256
IKM  = root
salt = doc
info = UTF8("astral-pack/sign/ed25519/v1")
L    = 32
```

Generate the raw 32-byte Ed25519 public key and compare it byte-for-byte with header offsets `60–91`. This is the authoritative comparison for ASTRPKG4.

For PKCS#8 seed import, prepend this 16-byte prefix to the signing seed:

```text
30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20
```

## Child keys

```text
HKDF-SHA-256
IKM  = root
salt = doc || context
info = UTF8("astral-pack/key/v1/" || name)
L    = 32
```

`||` is direct byte concatenation. Context may be empty or contain a stable reading, device or revision identifier.

## Legacy formats

### ASTRPKG3

- raw public-key equivalent is stored as 43 canonical unpadded base64url characters at offsets `60–102`;
- sign block starts at offset `103`;
- decode the text key to exactly 32 bytes before comparing it with the regenerated key.

### ASTRPKG2

- fixed 103-byte header;
- same 43-character text key at offsets `60–102`;
- no public sign block;
- typed protobuf and compression rules match ASTRPKG4.

### ASTRPKG1

Header:

| Offset | Size | Meaning |
|---:|---:|---|
| 0 | 8 | ASCII `ASTRPKG1` |
| 8 | 1 | major `1` |
| 9 | 1 | minor `0` |
| 10 | 1 | KDF `1` |
| 11 | 1 | cipher `1` |
| 12 | 4 | iterations |
| 16 | 1 | salt length `16` |
| 17 | 1 | nonce length `12` |
| 18 | 1 | public-key text length `43` |
| 19 | 1 | flags `0` |
| 20 | 4 | ciphertext length including tag |
| 24 | 4 | header length `99` |
| 28 | 16 | salt |
| 44 | 12 | nonce |
| 56 | 43 | canonical base64url public-key text |

Its decrypted plaintext is uncompressed protobuf:

```proto
message PackV1 {
  uint32 version = 1;
  bytes json = 2;
  bytes entropy = 3;
}
```

Field 2 must already equal the reconstructed canonical UTF-8 JSON bytes.

## Failure handling

Reject the complete file on any failure involving:

- magic, versions, algorithms or flags;
- lengths or safety bounds;
- public sign syntax;
- password authentication;
- decompression or output length;
- protobuf structure;
- semantic/canonical JSON;
- sign cross-check;
- entropy length;
- raw public-key comparison.

Return no partial chart or derived secret after failure. Clear password-derived, decrypted, entropy, root and signing-seed buffers where the runtime permits.
