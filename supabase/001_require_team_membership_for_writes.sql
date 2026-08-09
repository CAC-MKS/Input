-- ============================================================================
--  REQUIRE TEAM MEMBERSHIP FOR WRITES
--  ----------------------------------------------------------------------------
--  ADDITIVE migration — safe to run on your live project, does NOT touch
--  existing data (unlike 000_fresh_project_setup.sql, this does not drop
--  anything).
--
--  Problem this fixes: every write policy currently just checks
--  `auth.uid() is not null` — meaning ANY valid Supabase Auth login in this
--  project can insert/update match data via a direct API call, not just
--  recognized analysts/super_admin. That's too permissive once you have
--  accounts that exist ONLY to unlock gated sections on the public report
--  sites (e.g. a coach account) — those accounts should never be able to
--  touch match data, even by hand-crafting a request.
--
--  Fix: a new is_team_member() check (has a `profiles` row) replaces the
--  bare "is logged in" check on every write policy. Accounts without a
--  profiles row (like a coach-only login) can still authenticate — that's
--  what unlocks gated report content — they just can't write anything.
--  `match_notes` (internal scouting notes) is also tightened on SELECT,
--  since those aren't meant for a coach-only account either.
-- ============================================================================

create or replace function public.is_team_member()
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ── TEAMS ───────────────────────────────────────────────────────────────────
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert
  with check (public.is_team_member());
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update
  using (public.is_team_member()) with check (public.is_team_member());

-- ── PLAYERS ─────────────────────────────────────────────────────────────────
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert
  with check (public.is_team_member());
drop policy if exists players_update on public.players;
create policy players_update on public.players for update
  using (public.is_team_member());

-- ── TOURNAMENTS ─────────────────────────────────────────────────────────────
-- (already is_super_admin()-gated for insert/update — unchanged)

-- ── MATCHES ─────────────────────────────────────────────────────────────────
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert
  with check (public.is_team_member());
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update
  using (public.is_team_member()) with check (public.is_team_member());

-- ── MATCH_EVENTS ────────────────────────────────────────────────────────────
drop policy if exists match_events_select on public.match_events;
create policy match_events_select on public.match_events for select
  using (public.is_team_member());
drop policy if exists match_events_insert on public.match_events;
create policy match_events_insert on public.match_events for insert
  with check (public.is_team_member());
drop policy if exists match_events_update on public.match_events;
create policy match_events_update on public.match_events for update
  using (public.is_team_member());
drop policy if exists match_events_delete on public.match_events;
create policy match_events_delete on public.match_events for delete
  using (public.is_team_member());

-- ── PROCESSED_MATCH_EVENTS ──────────────────────────────────────────────────
drop policy if exists pme_select on public.processed_match_events;
create policy pme_select on public.processed_match_events for select
  using (public.is_team_member());
drop policy if exists pme_insert on public.processed_match_events;
create policy pme_insert on public.processed_match_events for insert
  with check (public.is_team_member());
drop policy if exists pme_update on public.processed_match_events;
create policy pme_update on public.processed_match_events for update
  using (public.is_team_member());
drop policy if exists pme_delete on public.processed_match_events;
create policy pme_delete on public.processed_match_events for delete
  using (public.is_team_member());

-- ── LINEUPS ─────────────────────────────────────────────────────────────────
drop policy if exists lineups_select on public.lineups;
create policy lineups_select on public.lineups for select
  using (public.is_team_member());
drop policy if exists lineups_insert on public.lineups;
create policy lineups_insert on public.lineups for insert
  with check (public.is_team_member());
drop policy if exists lineups_update on public.lineups;
create policy lineups_update on public.lineups for update
  using (public.is_team_member());
drop policy if exists lineups_delete on public.lineups;
create policy lineups_delete on public.lineups for delete
  using (public.is_team_member());

-- ── MATCH_ASSIGNMENTS ───────────────────────────────────────────────────────
drop policy if exists ma_select on public.match_assignments;
create policy ma_select on public.match_assignments for select
  using (public.is_team_member());

-- ── MATCH_NOTES ─────────────────────────────────────────────────────────────
-- Internal scouting notes — team members only, not a coach-only account.
drop policy if exists match_notes_select on public.match_notes;
create policy match_notes_select on public.match_notes for select
  using (public.is_team_member());
drop policy if exists match_notes_write on public.match_notes;
create policy match_notes_write on public.match_notes for all
  using (public.is_team_member()) with check (public.is_team_member());

-- ============================================================================
-- DONE. A coach-only login (a Supabase Auth user with NO row in
-- public.profiles) can still authenticate — that's what unlocks the "Coach
-- Login" gated sections on the two public report sites, which only check
-- "is there a session," nothing more — but can no longer read or write any
-- match data directly. Only accounts with a profiles row (super_admin or
-- analyst) can.
-- ============================================================================
