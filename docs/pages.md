# GitHub Pages

The site uses the same `src/core.ts` implementation as the CLI. It performs all parsing, key derivation and encryption locally and has no network permission in its content-security policy.

The Pages workflow is manual so creating or updating the repository does not consume an Actions run.

1. Make the repository public.
2. Open **Settings → Pages**.
3. Select **GitHub Actions** as the source.
4. Open **Actions → Pages → Run workflow**.

Local preview:

```sh
npm run build:site
npm start
```

Open `http://127.0.0.1:4768`.
