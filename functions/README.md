# TN-170 Cloud Functions

This public GitHub repo ships **portal UI + thin Steward client** only. Steward now runs on a **Cloudflare Worker** (`workers/steward/`) — not Firebase Functions.

## Functions in this project

| Callable | Public repo | Notes |
|----------|-------------|-------|
| `stewardCore` | **Deprecated** for GitHub Pages | Use `workers/steward/` Cloudflare Worker instead |
| `importProcessor` | `src/shared/` parsers | Import/OCR pipeline (separate from Steward) |
| `ocrProcessor` | Stub | Not enabled |

## Steward (current path)

Deploy the Cloudflare Worker — see [workers/steward/README.md](../workers/steward/README.md):

```bash
cd workers/steward
npm install
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Then set `stewardWorkerUrl` in `js/firebase-config.js` to your deployed worker URL.

## Deploy import processor (optional)

```bash
cd functions && npm install && cd ..
firebase deploy --only functions:importProcessor
```

## Legacy: Firebase `stewardCore` (deprecated)

The callable in `src/index.js` remains for private mirrors that still deploy the Steward brain under `functions/src/steward/`. **Do not use this path for the public GitHub Pages portal.**

If you maintain a private checkout with the brain modules:

```bash
cd functions && npm install && cd ..
firebase deploy --only functions:stewardCore
```

## Security

- Steward Worker requires Firebase Auth and an **approved** profile (`profiles/{uid}`).
- Role checks and write confirmations run **server-side** only; the GitHub Pages frontend never exposes action registries or approval logic.
- `OPENAI_API_KEY` must live in Cloudflare Worker secrets only — never in GitHub or frontend JS.

## Local emulator (import / legacy steward)

```bash
cd functions && npm install && npm run serve
```

Ensure `functions/src/steward/` exists locally before starting the emulator for legacy `stewardCore`.
