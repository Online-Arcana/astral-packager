# GitHub Pages

The site uses the same `src/core.ts` and `src/pwd.ts` implementations as the CLI. Parsing, password auditing, key derivation and encryption all run locally. The page has no network permission in its content-security policy.

Relevant changes on `main` automatically run the Pages workflow. Manual dispatch remains available under **Actions → Pages**.

1. Open **Settings → Pages**.
2. Select **GitHub Actions** as the source.
3. Push a relevant change to `main` or run the workflow manually.

Local preview:

```sh
npm run build:site
npm start
```

Open `http://127.0.0.1:4768`.
