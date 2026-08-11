# Astral Packager

Turn any strict JSON astral profile into a compact, portable and password-encrypted `.astral` identity container. The CLI and GitHub Pages interface use the same local core.

## Use

Requires Node.js 22.15 or later.

```sh
npm run build
node dist/bin.js chart.astral.raw
```

The CLI asks for the password twice without echoing it and writes beside the source:

```text
chart.astral.raw → chart.astral
chart.json       → chart.astral
chart.astral     → chart.packed.astral
```

Inspect the public header without a password:

```sh
node dist/bin.js pub chart.astral
node dist/bin.js head chart.astral
```

Decrypt to a local inspection copy:

```sh
node dist/bin.js open chart.astral
```

## Container

Version 5 packages in this order:

```text
strict JSON
  → canonical semantic value
  → typed protobuf
  → balanced lossless compression
  → AES-256-GCM
  → authenticated public header + ciphertext
```

The public header contains the **exact raw 32-byte Ed25519 public identity key** at fixed offsets `60–91`. Tools expose its canonical unpadded base64url form through `readMeta().pub` without decrypting the payload.

Starting with `ASTRPKG5`, the clear header also contains versioned UTF-8 JSON metadata for the public astrological identity. It retains the six literal signs used by the identicon and adds only the deterministic fields required to reconstruct the natal chart wheel:

- Solar, Lunar, Ascendant, Midheaven, Descendant and Imum Coeli signs
- calculation fingerprint and selected house system
- renderable astrological point longitudes, including the four principal angles
- the selected twelve house cusp/end longitudes and house status
- rendered aspect ids, endpoints, kinds, classes and characters

The public block deliberately excludes unrelated chart content such as the subject name, birth record, interpretations, compatibility, dignity and other private payload fields. Generic JSON remains supported and receives blank signs plus `wheel: null`.

The complete header is AES-GCM additional authenticated data. Opening a version 5 file re-extracts the public wheel metadata from the decrypted chart and rejects any mismatch. The complete JSON value and 256 bits of private identity entropy remain inside the compressed encrypted protobuf.

`ASTRPKG1` through `ASTRPKG4` remain readable. New files use `ASTRPKG5`.

## Compression

Packaging performs one moderate lossless pass rather than comparing several maximum-level encoders. Payloads under 1 KiB stay as raw protobuf. Node prefers Zstandard level 3 and falls back to Brotli quality 4. Browsers prefer Zstandard, then raw DEFLATE, then Brotli. Raw protobuf is retained whenever compression does not reduce size.

Browser compression has a 20-second budget and falls back to raw protobuf. The intended total packaging time is below 30 seconds on supported hardware, with ordinary astral files expected to finish much sooner.

## Passwords

New files require at least 10 characters and a Strong or Excellent local score. Common phrases, dates, sequences, keyboard walks and predictable substitutions are rejected even when long. Passwords never leave the local browser or process.

## Web page

```sh
npm run build:site
npm start
```

The page reports packaging percentage, elapsed time and ETA. Fast preparation accounts for only 1%; progress is weighted toward compression and password-key derivation. GitHub Pages deploys automatically after relevant changes reach `main`.

## Documentation

- [Clean-room decryption and unpacking](docs/unpack.md)
- [Container format](docs/format.md)
- [Cryptography](docs/crypto.md)
- [Library API](docs/api.md)
- [GitHub Pages](docs/pages.md)

## Development

```sh
npm run check
npm test
npm run build
```

Maintained source stays under `src/`. Generated output stays under `dist/`.

## Licence

GPL-3.0-only
