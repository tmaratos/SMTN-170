# TN-170 Cloud Functions

This public GitHub repo ships **portal UI + thin Steward client** only. The Steward **brain** (`functions/src/steward/`) is **not** published here — deploy it from a private checkout or local copy.

## Functions in this project

| Callable | Public repo | Notes |
|----------|-------------|-------|
| `stewardCore` | Entry in `src/index.js` only | Requires private `src/steward/` modules |
| `importProcessor` | `src/shared/` parsers | Import/OCR pipeline (separate from Steward brain) |
| `ocrProcessor` | Stub | Not enabled |

## Deploy Steward (maintainers)

1. Install [Firebase CLI](https://firebase.google.com/docs/cli) and sign in: `firebase login`
2. Clone or copy the **private** Steward brain into `functions/src/steward/`:
   - `brain.js`, `actions.js`, `cap.js`
   - Source of truth: `supabase/functions/steward-core/` in a private mirror, or run `node scripts/build-steward.js` after copying TypeScript sources.
3. From repo root:
   ```bash
   cd functions
   npm install
   npm run lint
   cd ..
   firebase deploy --only functions:stewardCore
   ```
4. Verify from the portal: sign in, open Steward, send a test message.

## Deploy import processor (optional)

```bash
cd functions && npm install && cd ..
firebase deploy --only functions:importProcessor
```

## Security

- `stewardCore` requires Firebase Auth and an **approved** profile (`profiles/{uid}`).
- Role checks and Firestore writes run **server-side** only; the GitHub Pages frontend never exposes action registries or approval logic.

## Local emulator

```bash
cd functions && npm install && npm run serve
```

Ensure `functions/src/steward/` exists locally before starting the emulator.
