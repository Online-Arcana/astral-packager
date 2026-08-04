# Library API

```ts
import {
  auditPwd,
  open,
  pack,
  readMeta,
  readPub,
  readPubRaw
} from "astral-packager";
```

## `auditPwd(password)`

Runs the local password auditor used by the CLI and browser page. New containers require at least 10 characters and a Strong or Excellent score.

## `pack(source, password, progress?)`

Parses one strict JSON value, extracts public Astrology signs, canonicalises the complete value, generates private entropy, encodes typed protobuf, applies balanced lossless compression and encrypts an ASTRPKG4 container.

```ts
const value = await pack(jsonText, password, ({ pct, stage }) => {
  console.log(`${pct}%`, stage);
});

await writeFile("profile.astral", value.bytes);
console.log(value.pubRaw); // exact 32 key bytes
console.log(value.pub);    // canonical 43-character base64url display
console.log(value.signs);
```

Returned public-key fields:

```ts
interface Packed {
  bytes: Uint8Array;
  pubRaw: Uint8Array; // 32 exact Ed25519 public-key bytes
  pub: string;        // canonical unpadded base64url display
  signs: Signs;
  info: PackInfo;
}
```

The raw key is written at container offsets `60–91`. `pub` is derived from `pubRaw`; it is retained for display and compatibility rather than storage.

Signs are lowercase zodiac names or blank strings:

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

The complete JSON and all six source fields remain inside the encrypted payload.

Progress is monotonic from `0` to `100`. Fast parsing, identity and protobuf preparation occupy the first 1%; compression and password-key derivation dominate the remaining range.

## `readPubRaw(bytes)`

Returns a new `Uint8Array` containing the exact 32-byte public key.

- ASTRPKG4: copies offsets `60–91` directly.
- ASTRPKG1–3: decodes their canonical base64url text key to the equivalent 32 bytes.

No password, decompression or payload access is required.

## `readPub(bytes)`

Returns the canonical 43-character unpadded base64url display form of the public key. It is derived from the same raw bytes returned by `readPubRaw()`.

## `readMeta(bytes)`

Reads public metadata without a password:

```ts
const meta = readMeta(bytes);
console.log(meta.ver);
console.log(meta.pubRaw);
console.log(meta.pub);
console.log(meta.signs);
```

ASTRPKG4 exposes raw key bytes and all six signs. ASTRPKG3 exposes the same signs and its decoded raw key. ASTRPKG1–2 return blank public signs.

## `open(bytes, password)`

Authenticates and decrypts the header and payload, decompresses, decodes protobuf, reconstructs canonical JSON and regenerates the identity.

For ASTRPKG4 it requires:

- byte-for-byte equality between the regenerated raw Ed25519 public key and header offsets `60–91`;
- exact equality between all six re-extracted signs and the authenticated public sign block.

```ts
const value = await open(bytes, password);
console.log(value.pubRaw);
console.log(value.pub);
console.log(value.signs);

const signature = await value.id.sign(message);
const readingKey = await value.id.key("reading", readingId);
value.id.drop();
```

`Id.key()` domain-separates every name and optional context.
