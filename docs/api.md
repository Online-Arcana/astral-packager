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

Scores run from `0` to `4`. New containers require `audit.ok === true`, currently at least 10 characters and a Strong or Excellent score.

## `pack(source, password, progress?)`

Parses one strict JSON value, canonicalises it for identity derivation, generates private entropy, encodes the semantic value as typed protobuf, applies one balanced lossless compression pass when useful and encrypts it into a version-2 container.

```ts
const value = await pack(jsonText, password, ({ pct, stage }) => {
  console.log(`${pct}%`, stage);
});
await writeFile("profile.astral", value.bytes);
console.log(value.pub);
console.log(value.info);
```

Progress values are monotonic integers from `0` to `100`. Fast parsing, identity and protobuf preparation occupy the first 1%. Compression occupies most of the visible range, followed by password-key derivation and AES-GCM. ETA should not be calculated from the initial 1% because those setup stages are intentionally weighted as near-instantaneous.

Production packaging does not compare multiple codecs. It performs at most one moderate compression pass and preserves raw protobuf when compression is unavailable, times out in the browser or does not reduce the payload.

`value.info` reports canonical JSON, uncompressed protobuf and stored payload sizes:

```ts
interface PackInfo {
  json: number;
  pb: number;
  packed: number;
  codec: 0 | 1 | 2 | 3; // raw, Brotli, raw DEFLATE, Zstandard
}
```

The compression choice is not part of identity derivation.

## `readPub(bytes)`

Reads the plaintext public-key header without requesting the password, decompressing or decrypting the payload. Version-1 and version-2 containers are supported.

## `open(bytes, password)`

Authenticates and decrypts the container, decompresses its recorded codec, decodes protobuf, reconstructs canonical JSON and regenerates the identity. It returns canonical JSON and an unlocked `Id` handle.

```ts
const value = await open(bytes, password);
const signature = await value.id.sign(message);
const readingKey = await value.id.key("reading", readingId);
value.id.drop();
```

`Id.key()` prefixes and domain-separates every scope. Context bytes distinguish individual readings, revisions or devices.
