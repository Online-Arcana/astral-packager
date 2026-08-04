# Astral Packager

Encrypt JSON astral profiles into portable identity containers. The CLI and browser page use the same local cryptographic implementation.

## Use

Requires Node.js 22 or later.

```sh
npm run build
node dist/bin.js chart.astral.raw
```

The CLI requests a password twice without echoing it and writes the output beside the source:

```text
chart.astral.raw → chart.astral
chart.json       → chart.astral
chart.astral     → chart.packed.astral
```

Read the public key without decrypting:

```sh
node dist/bin.js pub chart.astral
```

Decrypt to a local inspection copy:

```sh
node dist/bin.js open chart.astral
```

## Container

The binary `.astral` container has one readable identity field: the base64url Ed25519 public key. Binary KDF metadata and AES-GCM ciphertext follow it. The ciphertext decrypts to a protobuf payload containing canonical JSON and 256 bits of private identity entropy.

The file plus its password regenerates the user identity and all derived keys. Neither item is useful alone. Passwords never leave the local process or browser.

## Web page

```sh
npm run build:site
npm start
```

The repository includes a manual GitHub Pages workflow for deployment after the repository becomes public.

## Documentation

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

# deployment push

Maintained source stays under `src/`. Generated output stays under `dist/`.

## Licence

GPL-3.0-only
