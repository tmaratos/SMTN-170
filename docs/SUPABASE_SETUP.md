# Supabase setup for SMTN-170 portal

## 1. Project URL

Edit `js/supabase-config.js` and set:

```javascript
SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
```

The anon key is already in that file. Find your URL in **Supabase Dashboard → Project Settings → API**.

## 2. Run database migration

In **SQL Editor**, run:

- `supabase/migrations.sql` (core tables)
- `supabase/steward-phase1.sql` (Steward conversations + messages, if not already created)
- `supabase/steward-phase2-tables.sql` (meetings, portal_tasks, flight_reviews, inspection_items, audit_log)
- `supabase/steward-phase3.sql` (Steward `pending_action` column)

This creates: `profiles`, `org_positions`, `schedules`, `uploaded_files`, operational tables for Steward Phase 2, RLS policies, and the new-user profile trigger.

## 3. Storage bucket

1. **Storage → New bucket** → name: `squadron-files` (private).
2. Add policies so **approved** members can read/upload (match RLS pattern in migrations comments).

Example policy (authenticated upload):

```sql
create policy "approved_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'squadron-files' and public.is_approved_member(auth.uid()));
```

## 4. Auth

Enable **Email** provider in Authentication → Providers.

Members sign in at `login.html`. New users get `awaiting_verification` until Commander/Command Staff sets `account_status = 'approved'` on their `profiles` row.

## 5. GitHub Pages

Static site loads Supabase from CDN. No build step required. Do not commit service role keys — only the **anon** key belongs in the frontend config.

## 6. Tables wired in the app

| Table | Module |
|-------|--------|
| `profiles` | `portal-auth.js`, `profile-page.js` (first_name, last_name, preferred_name, rank, cap_id, phone, duty_position, profile_photo_url) |
| `steward_conversations` | `steward.js` |
| `steward_chat_messages` | `steward.js` |
| `meetings`, `portal_tasks`, `flight_reviews`, `inspection_items` | `steward-brain.js` + `steward-actions.js` (Phase 2) |
## 7. Steward Phase 3 — Edge Function (required for Steward chat)

Steward’s brain runs **only** on the server, not in public GitHub JavaScript.

1. Run `supabase/steward-phase3.sql` (adds `pending_action` on conversations).
2. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and link your project.
3. Deploy:

```bash
supabase functions deploy steward-core
```

4. Frontend calls `https://YOUR_PROJECT.supabase.co/functions/v1/steward-core` with the user’s JWT (anon key + session). No service role key in GitHub.

| Component | Location |
|-----------|----------|
| Steward UI | `js/steward.js`, `css/steward-workspace.css` (GitHub Pages) |
| API client | `js/steward-api.js` (thin fetch wrapper only) |
| Brain + actions + CAP search | `supabase/functions/steward-core/` (private) |

Future: add LLM integration inside `steward-core` after the auth/profile checks in `index.ts`.
| `audit_log` | `steward-actions.js` (Steward write actions) |
| `uploaded_files` + `squadron-files` bucket | `file-library.js` |
| `org_positions` | `org-chart.js` |
| `schedules` | `schedule-builder.js` |
