# Library API

```ts
import { auditPwd, open, pack, readMeta, readPub } from "astral-packager";
```

## `auditPwd(password)`

Runs the same local password auditor used by the CLI and browser page.

```ts
const audit = auditPwd(password);
console.log(audit.score, audit.label, audit.suggestions);
```

Scores run from `0` to `4`. New containers require `audit.ok === true`, currently at least 10 characters and a Strong or Excellent score.

## `pack(source, password, progress?)`

Parses one strict JSON value, extracts any public Astrology signs, canonicalises the complete value for identity derivation, generates private entropy, encodes typed protobuf, applies one balanced lossless compression pass and encrypts a version-3 container.

```ts
const value = await pack(jsonText, password, ({ pct, stage }) => {
  console.log(`${pct}%`, stage);
});
await writeFile("profile.astral", value.bytes);
console.log(value.pub);
console.log(value.signs);
console.log(value.info);
```

`value.signs` contains:

```ts
interface Signs {
  solar: string;
  lunar: string;
  ascending: string;
  midheaven: string;
  descending: string;
  imumCoeli: string;
}
```

The values are lowercase zodiac names or blank strings. The complete JSON remains inside the encrypted payload; extraction only adds authenticated public copies to the header.

Progress values are monotonic integers from `0` to `100`. Fast parsing, identity and protobuf preparation occupy the first 1%. Compression occupies most of the visible range, followed by password-key derivation and AES-GCM.

Production packaging performs at most one moderate compression pass and preserves raw protobuf when compression is unavailable, times out in the browser or does not reduce size.

`value.info` reports canonical JSON, uncompressed protobuf and stored payload sizes:

```ts
interface PackInfo {
  json: number;
  pb: number;
  packed: number;
  codec: 0 | 1 | 2 | 3;
}
```

## `readPub(bytes)`

Returns only the plaintext Ed25519 public key. Versions 1, 2 and 3 are supported.

## `readMeta(bytes)`

Reads all public metadata without a password, decompression or decryption:

```ts
const meta = readMeta(bytes);
console.log(meta.ver);
console.log(meta.pub);
console.log(meta.signs);
```

Version-3 files expose all six signs. Version-1 and version-2 files return blank sign fields because those formats did not place them in the public header.

## `open(bytes, password)`

Authenticates and decrypts the container, decompresses its recorded codec, decodes protobuf, reconstructs canonical JSON and regenerates the identity. For version 3, it also re-extracts the six public signs from the decrypted chart and requires an exact match with the authenticated header.

```ts
const value = await open(bytes, password);
console.log(value.signs);
const signature = await value.id.sign(message);
const readingKey = await value.id.key("reading", readingId);
value.id.drop();
```

`Id.key()` prefixes and domain-separates every scope. Context bytes distinguish individual readings, revisions or devices.
