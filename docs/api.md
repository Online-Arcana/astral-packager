# Library API

```ts
import {
  auditPwd,
  open,
  pack,
  readMeta,
  readPub,
  readPubRaw,
  readWheel
} from "astral-packager";
```

## `auditPwd(password)`

Runs the local password auditor used by the CLI and browser page. New containers require at least 10 characters and a Strong or Excellent score.

## `pack(source, password, progress?)`

Parses one strict JSON value, extracts the public astrological identity metadata, canonicalises the complete value, generates private entropy, encodes typed protobuf, applies balanced lossless compression and encrypts an `ASTRPKG5` container.

```ts
const value = await pack(jsonText, password, ({ pct, stage }) => {
  console.log(`${pct}%`, stage);
});

await writeFile("profile.astral", value.bytes);
console.log(value.pubRaw); // exact 32 key bytes
console.log(value.pub);    // canonical 43-character base64url display
console.log(value.signs);
console.log(value.wheel);
```

The complete JSON remains inside the compressed encrypted payload. The public header contains only the identity key, the existing six literal signs and the deterministic fields required to reproduce the natal wheel.

## Public identity metadata

`ASTRPKG5` exposes these fields without a password:

```ts
interface PublicMeta {
  ver: 1 | 2 | 3 | 4 | 5;
  pub: string;
  pubRaw: Uint8Array;
  signs: Signs;
  wheel: PublicWheelMeta | null;
}

interface PublicWheelMeta {
  schema: "astral-public-wheel/1.0.0";
  calculationFingerprint: string;
  primaryHouseSystem: "placidus" | "whole_sign" | "equal" | "porphyry";
  points: Record<PublicPointId, number | null>;
  houses: {
    status: "calculated" | "fallback" | "unavailable";
    houses: Record<string, {
      number: number;
      cuspLongitudeDegrees: number | null;
      endLongitudeDegrees: number | null;
    }>;
  };
  aspects: Array<{
    id: string;
    a: PublicPointId;
    b: PublicPointId;
    kind: string;
    class: "major" | "minor";
    character: "flowing" | "challenging" | "contextual" | "adjusting" | "creative";
  }>;
}
```

The six signs remain lowercase zodiac names or blank strings:

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

For an ordinary Astrology chart, `wheel` contains the selected house system, all wheel point longitudes and every aspect field used by the renderer. It does **not** contain the subject name, birth record, interpretations, compatibility, dignity or the rest of the deterministic calculation.

Generic JSON remains supported and returns `wheel: null`.

## `readPubRaw(bytes)`

Returns a new `Uint8Array` containing the exact 32-byte public identity key. No password, decompression or payload access is required.

- `ASTRPKG4–5`: copies offsets `60–91` directly.
- `ASTRPKG1–3`: decodes their canonical base64url text key to the equivalent 32 bytes.

## `readPub(bytes)`

Returns the canonical 43-character unpadded base64url display form of the public key.

## `readMeta(bytes)`

Reads the complete public identity metadata without a password:

```ts
const meta = readMeta(bytes);
console.log(meta.ver);
console.log(meta.pubRaw);
console.log(meta.pub);
console.log(meta.signs);
console.log(meta.wheel);
```

`ASTRPKG5` exposes the wheel contract. `ASTRPKG3–4` expose the six signs but return `wheel: null`. `ASTRPKG1–2` return blank public signs and `wheel: null`.

## `readWheel(bytes)`

Returns only `PublicWheelMeta | null` and never decrypts, decompresses or decodes the encrypted payload.

This is the intended path for reconstructing the shared natal chart wheel directly from a packaged `.astral` identity.

## `open(bytes, password)`

Authenticates and decrypts the header and payload, decompresses, decodes protobuf, reconstructs canonical JSON and regenerates the identity.

For `ASTRPKG5` it requires:

- byte-for-byte equality between the regenerated raw Ed25519 public key and header offsets `60–91`;
- exact canonical equality between the public identity metadata and the same fields re-extracted from the decrypted chart.

```ts
const value = await open(bytes, password);
console.log(value.pubRaw);
console.log(value.pub);
console.log(value.signs);
console.log(value.wheel);

const signature = await value.id.sign(message);
const readingKey = await value.id.key("reading", readingId);
value.id.drop();
```

Legacy `ASTRPKG3–4` files retain their original six-sign validation. `Id.key()` domain-separates every name and optional context.
