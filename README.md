# Astral Packager

Turn any strict JSON astral profile into a compact, portable and password-encrypted `.astral` identity container. The CLI and GitHub Pages interface use the same local core.

## Use

Requires Node.js 22 or later.

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

Read the visible public key without decrypting:

```sh
node dist/bin.js pub chart.astral
```

Decrypt to a local inspection copy:

```sh
node dist/bin.js open chart.astral
```

## Container

Version 2 uses this order:

```text
strict JSON
  → canonical semantic value
  → typed protobuf
  → smallest available lossless encoding
  → AES-256-GCM
  → readable public-key header + ciphertext
```

The packager compares uncompressed protobuf, Brotli and raw DEFLATE and stores the smallest result. Node uses maximum Brotli and DEFLATE settings; browsers use the lossless encoders exposed by their runtime. Compression never participates in identity generation.

Only the base64url Ed25519 public key is a readable identity field. Binary KDF, codec and length metadata are also visible so tools can identify and unpack the format. The complete header is authenticated.

The encrypted typed protobuf contains the full JSON value and 256 bits of private identity entropy. The file plus its password regenerates the signing identity and every labelled child key. Neither item is useful alone.

Version-1 containers remain readable.

## Passwords

New files require at least 10 characters and a Strong or Excellent local score. Common phrases, dates, sequences, keyboard walks and predictable substitutions are rejected even when long. Passwords never leave the local browser or process.

## Web page

```sh
npm run build:site
npm start
```

GitHub Pages deploys automatically after relevant changes reach `main`. The workflow can also be run manually.

## Documentation

- [Container and unpacking rules](docs/format.md)
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
