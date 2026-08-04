# Cryptography

## Two unrelated signatures

An authority signature inside an Astrology-generated document proves which generator produced that document. Astral Packager does not reuse that authority key.

The user identity is generated after packaging from canonical JSON and fresh private entropy stored inside the encrypted payload.

## Identity

```text
JSON digest = SHA-256(canonical JSON)
root        = HKDF-SHA-256(identity entropy, JSON digest, "astral-pack/root/v1")
sign seed   = HKDF-SHA-256(root, JSON digest, "astral-pack/sign/ed25519/v1")
public key  = Ed25519(sign seed)
```

Changing either the semantic JSON document or the private entropy changes every user key. Formatting, object-key order, protobuf encoding, compression and the public sign copies do not.

Child keys use labelled HKDF scopes. Consumers can derive independent profile, reading, device or ledger keys without reusing signing material. The exact byte-level derivation is specified in [Decrypting and unpacking](unpack.md).

## Storage pipeline

```text
semantic JSON
  → extract public sign copies
  → typed protobuf containing the complete JSON value
  → balanced lossless compression or raw protobuf
  → password-derived AES-256-GCM encryption
```

The six signs remain inside the encrypted payload. Version 3 also writes authenticated plaintext copies for public use. After decryption, the reader re-extracts the signs from the recovered chart and requires an exact match with the public header.

Compression happens before encryption and is not an identity input. Repacking the same private payload with another supported codec preserves the public identity and every derived key.

Version 3 records the codec, uncompressed protobuf length, public key and six public signs in the authenticated header. Versions 1 and 2 remain readable.

## Password lock

The chosen password is normalised with Unicode NFKC, encoded as UTF-8 and derives a 256-bit unlock key with PBKDF2-HMAC-SHA-256, a random 16-byte salt and the iteration count stored in the header. New files currently use 1,200,000 iterations. AES-256-GCM uses a 12-byte nonce and a 128-bit tag, encrypts the protobuf payload and binds the complete visible header as additional authenticated data.

The password is not part of identity generation. Re-encrypting the same private payload under another password preserves the public identity and all derived keys.

The KDF and cipher are versioned in the header. A later Argon2id container version can strengthen password guessing resistance without changing identity derivation.

## Public information

A version-3 file reveals without a password:

- the Ed25519 public key;
- solar sign;
- lunar sign;
- ascending sign;
- Midheaven sign;
- descending sign;
- Imum Coeli sign;
- binary algorithm and length metadata required to parse the container.

It does not reveal the remaining chart, private identity entropy, private signing seed, identity root or child keys.

## Password audit

New containers require at least 10 Unicode characters and a local score of 3/4 or 4/4. Length is only one input. The auditor also considers the usable character space and penalises common passwords, predictable word chains, dates, sequences, keyboard walks, repeats and familiar capitalise-number-symbol shapes.

A random 10-character password can pass. A much longer predictable sentence can fail. There is no required uppercase, number or symbol checklist.

The score is a conservative estimate, not a guarantee or a precise entropy measurement. No password, hash, prefix or audit request leaves the process or browser.

Opening an existing container does not reapply the current creation policy. A correct older password must remain usable even after the auditor evolves.

## Possession model

- File without password: exposes the public key, six public signs and binary encryption metadata.
- Password without file: contains no identity entropy or chart.
- File and password: regenerates the user signing identity and all child keys.

A stolen file allows unlimited offline guesses. Prefer a password manager, genuinely random characters, or unrelated words selected randomly. Do not rely on familiar phrases with predictable substitutions.
