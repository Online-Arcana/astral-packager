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

Changing either the semantic JSON document or the private entropy changes every user key. Formatting, object-key order, protobuf encoding and compression do not.

Child keys use labelled HKDF scopes. Consumers can derive independent profile, reading, device or ledger keys without reusing signing material.

## Storage pipeline

```text
semantic JSON
  → typed protobuf
  → smallest supported lossless encoding
  → password-derived AES-256-GCM encryption
```

Compression happens before encryption and is not an identity input. Repacking the same private payload with another supported codec preserves the public identity and every derived key.

Version 2 records the codec and uncompressed protobuf length in the authenticated public header. The reader decrypts, decompresses, decodes protobuf, reconstructs canonical JSON, regenerates the identity and checks that its public key matches the header.

## Password lock

The chosen password is normalised with Unicode NFKC and derives a 256-bit unlock key with PBKDF2-HMAC-SHA-256, a random 16-byte salt and 1,200,000 iterations. AES-256-GCM encrypts and authenticates the compressed protobuf payload and binds the complete visible header as additional authenticated data.

The password is not part of identity generation. Re-encrypting the same private payload under another password preserves the public identity and all derived keys.

The KDF and cipher are versioned in the header. A later Argon2id container version can strengthen password guessing resistance without changing identity derivation.

## Password audit

New containers require at least 10 Unicode characters and a local score of 3/4 or 4/4. Length is only one input. The auditor also considers the usable character space and penalises common passwords, predictable word chains, dates, sequences, keyboard walks, repeats and familiar capitalise-number-symbol shapes.

A random 10-character password can pass. A much longer predictable sentence can fail. There is no required uppercase, number or symbol checklist.

The score is a conservative estimate, not a guarantee or a precise entropy measurement. No password, hash, prefix or audit request leaves the process or browser.

Opening an existing container does not reapply the current creation policy. A correct older password must remain usable even after the auditor evolves.

## Possession model

- File without password: exposes only the public key and binary encryption metadata.
- Password without file: contains no identity entropy or chart.
- File and password: regenerates the user signing identity and all child keys.

A stolen file allows unlimited offline guesses. Prefer a password manager, genuinely random characters, or unrelated words selected randomly. Do not rely on familiar phrases with predictable substitutions.
