# Cryptography

## Separate authorities

An authority signature inside an Astrology-generated document proves which generator produced that chart. Astral Packager never reuses the generator authority key as the user's identity.

The user identity is generated from canonical JSON and fresh private entropy stored inside the encrypted payload.

## Identity

```text
JSON digest = SHA-256(canonical JSON)
root        = HKDF-SHA-256(identity entropy, JSON digest, "astral-pack/root/v1")
sign seed   = HKDF-SHA-256(root, JSON digest, "astral-pack/sign/ed25519/v1")
public key  = Ed25519(sign seed)
```

The Ed25519 public key is exactly 32 bytes / 256 bits. ASTRPKG4 stores those raw bytes directly in the authenticated header. The 43-character unpadded base64url form returned by `readPub()` is only the canonical display encoding of those same bytes.

Changing the semantic JSON or private entropy changes every user key. Formatting, object-key order, protobuf encoding, compression, public sign copies and public-key display encoding do not.

Child keys use labelled HKDF scopes so profile, reading, device and ledger keys never reuse signing material. Exact derivations are specified in [Decrypting and unpacking](unpack.md).

## Storage pipeline

```text
semantic JSON
  → extract public sign copies
  → typed protobuf containing the complete JSON and private entropy
  → balanced lossless compression or raw protobuf
  → password-derived AES-256-GCM encryption
  → raw public key + signs + ciphertext
```

The six signs remain inside the encrypted payload. Version 4 also writes authenticated plaintext copies. After decryption, the reader regenerates the raw key and re-extracts the signs, requiring byte-for-byte and value-for-value matches with the header.

Compression occurs before encryption and is not an identity input.

## Password lock

The password is normalised with Unicode NFKC, encoded as UTF-8 and processed with PBKDF2-HMAC-SHA-256, a random 16-byte salt and the iteration count stored in the header. New files use 1,200,000 iterations. The 32-byte result is an AES-256-GCM key.

AES-GCM uses a 12-byte nonce and 128-bit tag. The complete public header—including the raw key and signs—is additional authenticated data.

The password is not part of identity generation. Re-encrypting the same private payload under another password preserves the raw public key, signing identity and every child key.

The KDF and cipher are versioned. A later password-KDF version can strengthen guessing resistance without changing identity derivation.

## Public information

An ASTRPKG4 file reveals without a password:

- exact raw 32-byte Ed25519 public key;
- solar sign;
- lunar sign;
- ascending sign;
- Midheaven sign;
- descending sign;
- Imum Coeli sign;
- algorithm and length metadata needed to parse the container.

It does not reveal the remaining chart, private entropy, signing seed, identity root or child keys.

## Password audit

New containers require at least 10 Unicode characters and a local score of Strong or Excellent. Length is only one signal. Common passwords, predictable word chains, dates, sequences, keyboard walks, repetitions and familiar capitalise-number-symbol patterns are penalised.

A random 10-character password can pass while a much longer predictable phrase can fail. No password, fragment, hash or audit request leaves the process or browser.

Opening an existing container does not reapply the current creation policy.

## Possession model

- File without password: public identity metadata only.
- Password without file: no chart, entropy or identity root.
- File plus password: regenerates signing and child keys.

A stolen file permits offline password guesses. Use a password manager, genuinely random characters or unrelated words selected randomly.
