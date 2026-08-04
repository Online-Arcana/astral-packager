# Cryptography

## Two unrelated signatures

An authority signature inside an Astrology-generated document proves which generator produced that document. Astral Packager does not reuse that authority key.

The user identity is generated after packaging from the canonical JSON and fresh private entropy stored inside the encrypted payload.

## Identity

```text
JSON digest = SHA-256(canonical JSON)
root        = HKDF-SHA-256(identity entropy, JSON digest, "astral-pack/root/v1")
sign seed   = HKDF-SHA-256(root, JSON digest, "astral-pack/sign/ed25519/v1")
public key  = Ed25519(sign seed)
```

Changing either the semantic JSON document or the private entropy changes every user key. Formatting and object-key order do not.

Child keys use labelled HKDF scopes. Consumers can derive independent profile, reading, device or ledger keys without reusing signing material.

## Password lock

Version 1 normalises the chosen password with Unicode NFKC and derives a 256-bit unlock key with PBKDF2-HMAC-SHA-256, a random 16-byte salt and 1,200,000 iterations. AES-256-GCM encrypts and authenticates the protobuf payload.

The password is not part of identity generation. Re-encrypting the same private payload under another password preserves the public identity and all derived keys.

The KDF and cipher are versioned in the header. A later Argon2id container version can strengthen password guessing resistance without changing identity derivation.

## Possession model

- File without password: exposes only the public key and binary encryption metadata.
- Password without file: contains no identity entropy or chart.
- File and password: regenerates the user signing identity and all child keys.

A stolen file allows offline password guesses. Use a long, unique passphrase; the application enforces a minimum of 16 characters but cannot measure whether a memorable password is truly unpredictable.
