# Library API

```ts
import { auditPwd, open, pack, readPub } from "astral-packager";
```

## `auditPwd(password)`

Runs the same local password auditor used by the CLI and browser page.

```ts
const audit = auditPwd(password);
console.log(audit.score, audit.label, audit.suggestions);
```

Scores run from `0` to `4`. New containers require `audit.ok === true`, which currently means at least 10 characters and a score of Strong or Excellent.

## `pack(source, password)`

Parses and canonicalises one JSON value, creates private identity entropy, derives the Ed25519 identity, and returns the encrypted container plus its public key.

```ts
const value = await pack(jsonText, password);
await writeFile("profile.astral", value.bytes);
console.log(value.pub);
```

## `readPub(bytes)`

Reads the plaintext public-key header without requesting the password or decrypting the payload.

## `open(bytes, password)`

Decrypts and validates a container. It returns canonical JSON and an unlocked `Id` handle.

```ts
const value = await open(bytes, password);
const signature = await value.id.sign(message);
const readingKey = await value.id.key("reading", readingId);
value.id.drop();
```

`Id.key()` prefixes and domain-separates every scope. Context bytes distinguish individual readings, revisions or devices.
