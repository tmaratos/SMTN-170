# TN-170 Steward — Cloudflare Worker

Server-side Steward brain for the public GitHub Pages portal. The OpenAI key lives **only** in Cloudflare Worker secrets — never in the repo or frontend.

## Architecture

```
GitHub Pages frontend
  → POST /steward + Authorization: Bearer <Firebase ID token>
  → Cloudflare Worker verifies token + Firestore profile
  → OpenAI (gpt-4o-mini)
  → JSON { reply, intent, suggestions?, openUrl?, pendingConfirmation? }
```

Firebase Cloud Function `stewardCore` is **deprecated** for this path. Use this worker instead.

## Setup

1. Install dependencies:

   ```bash
   cd workers/steward
   npm install
   ```

2. Log in to Cloudflare and set the OpenAI secret (never commit this):

   ```bash
   npx wrangler login
   npx wrangler secret put OPENAI_API_KEY
   ```

3. Deploy:

   ```bash
   npm run deploy
   ```

4. Copy the deployed URL (e.g. `https://tn170-steward.<account>.workers.dev`) into `js/firebase-config.js`:

   ```javascript
   stewardWorkerUrl: "https://tn170-steward.<account>.workers.dev",
   ```

## Local development

```bash
npm run dev
```

Set secrets for local dev:

```bash
npx wrangler secret put OPENAI_API_KEY
```

Test with a Firebase ID token:

```bash
curl -X POST http://localhost:8787/steward \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Find CAPR 60-1","pagePath":"/dashboard.html","pageTitle":"Dashboard"}'
```

## Environment

| Name | Secret? | Notes |
|------|---------|-------|
| `OPENAI_API_KEY` | Yes | `wrangler secret put` only |
| `FIREBASE_PROJECT_ID` | No | Default `tn-170-portal` in `wrangler.toml` |
| `FIREBASE_WEB_API_KEY` | No | Public web API key (optional; JWT verified via JWKS) |

## Security

- Unauthenticated requests are denied.
- Profiles must be `active` or `approved`.
- Admin-only intents require `commander` or `admin` role (checked server-side from Firestore).
- Write requests return `pendingConfirmation` only — the worker does not mutate portal data.
- CORS allows `https://tmaratos.github.io` and localhost origins.
