# Calcio AC — Match Tagging Center

Internal event-tagging tool used by Calcio AC analysts to log football match
events (passes, shots, tackles, etc.) against video, with real-world pitch
coordinates and video-synced timestamps. This is Calcio AC's own multi-client
product — each client (currently: MKS Podlasie Sokołów Podlaski) is an
**academy** in the database, so the same tool can serve multiple clubs
without any code changes.

## Stack

Vite + vanilla JS, no framework. Hash-based routing (`src/router.js`).
Supabase for auth, database, and file storage.

## Setup

```bash
npm install
cp .env.example .env.local
# fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the Supabase project
npm run dev
```

The database schema, RLS policies, and seed data for a fresh Supabase project
live in `supabase/000_fresh_project_setup.sql` — run it once, top to bottom,
in the new project's SQL Editor. It has inline instructions for bootstrapping
your own `super_admin` login.

In Supabase Dashboard → Authentication → Providers → Email, turn **off**
"Confirm email" — analyst accounts are created on their behalf from inside
this app (see below), not via self-registration, so they won't get a
confirmation email to click.

## Roles

Two roles only:

- **`super_admin`** — the Calcio AC account (you). Creates academies (clients),
  creates analyst accounts and assigns them to an academy, sees every
  academy's data, edits the `action_flow_rules` table via the Admin Portal.
- **`analyst`** — the only other account type. Scoped to exactly one academy
  via `profiles.academy_id`; sees and tags only that academy's matches.
  Analyst accounts are created by a super_admin from **Admin Portal → Analysts**
  — there's no public sign-up.

## How tagging works

1. **Create Match** — set up a match (teams, date, video source, futsal vs.
   standard 11-a-side pitch dimensions, roster upload via Excel).
2. **Tagger** — the core workspace: play the video, click on the pitch canvas
   to place events, fill in the outcome/type detail form. After every event,
   the tagger needs to know what to ask for next (e.g. after a successful
   pass, prompt for the next pass; after a shot that's saved, prompt for the
   goalkeeper's save detail). That "what comes next" logic lives in the
   **`action_flow_rules`** table (edited via Admin Portal → Flow Rules) and is
   read by `src/lib/actionFlow.js` — so it can be retuned without a code
   deploy. `src/lib/cacLogic.js` holds the underlying action → outcome → type
   taxonomy those rules are built from.
3. **QC Portal** — a second pass to review and correct tagged events for a
   match before it's finalized.
4. **Analytics** — tagging-progress dashboards (events/day, top taggers,
   action breakdown).
5. **Admin Portal** (super_admin only) — manage academies, analysts, teams,
   players (with merge tools for duplicate records), match assignments, and
   the action-flow rules above.

Tagged events land in `match_events`; a post-processing step derives
`processed_match_events` (half/minute, xG, coordinate normalization) — this is
what the two public report sites (`CAC-player-report`, `CAC-Match-Report`)
read from.

## Deployment

Configured for Vercel (`vercel.json`). Set the two `VITE_SUPABASE_*` env vars
in the Vercel project settings.
