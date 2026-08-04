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

Version 4 packages in this order:

```text
strict JSON
  → canonical semantic value
  → typed protobuf
  → balanced lossless compression
  → AES-256-GCM
  → authenticated public header + ciphertext
```

The public header contains the **exact raw 32-byte Ed25519 public key** at fixed offsets `60–91`. It is not stored as 43 text characters, shortened, hashed or transformed. Tools may encode those bytes as canonical unpadded base64url for display, but the container value is the raw 256-bit key.

The key is followed at offset `92` by six readable UTF-8 fields:

```text
solar_sign=capricorn
lunar_sign=virgo
ascending_sign=capricorn
midheaven_sign=libra
descending_sign=cancer
imum_coeli_sign=aries
```

The signs are copied from `astral-calculation.system.points` and remain inside the encrypted payload. Generic JSON remains supported and receives blank public sign values. The complete header is AES-GCM authenticated. Opening the file regenerates the raw public key and re-extracts the signs from the encrypted payload, rejecting any mismatch.

The encrypted typed protobuf contains the complete JSON value and 256 bits of private identity entropy. The file plus its password regenerates the signing identity and every labelled child key. Neither item is useful alone.

`ASTRPKG1`, `ASTRPKG2` and `ASTRPKG3` remain readable. New files use `ASTRPKG4`.

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
