-- ============================================================================
--  CALCIO AC — FRESH PROJECT SETUP (single-club)
--  ----------------------------------------------------------------------------
--  Run this ONCE, top to bottom, in a brand-new Supabase project's SQL Editor.
--  This is a single-club schema: there is no academy/multi-tenant layer —
--  every authenticated user (super_admin or analyst) works on the same one
--  club's data. `role` still distinguishes you (super_admin: full control,
--  including destructive/admin actions and account management) from your
--  analysts (full read/write on match data, no admin actions).
--
--  After running this file:
--    1. Create your own login: Dashboard → Authentication → Add User.
--    2. Run the `insert` statement at the very bottom of this file
--       (Section 7) to make yourself super_admin.
--    3. Log into CAC-input with that account → Admin Portal → Analysts tab
--       to create accounts for the other analysts (this app creates their
--       `profiles` row automatically, you don't need to touch SQL for them).
--    4. In Supabase Dashboard → Authentication → Providers → Email, turn OFF
--       "Confirm email" (or analysts won't be able to log in until they click
--       a confirmation link they may never receive, since CAC-input creates
--       accounts on their behalf rather than having them self-register).
-- ============================================================================


-- ============================================================================
-- SECTION 0 — CLEAN SLATE
-- Makes this script safely re-runnable (safe here since this is a brand-new
-- project with no real data yet).
-- ============================================================================

drop table if exists public.action_flow_rules cascade;
drop table if exists public.match_notes cascade;
drop table if exists public.match_assignments cascade;
drop table if exists public.processed_match_events cascade;
drop table if exists public.match_events cascade;
drop table if exists public.lineups cascade;
drop table if exists public.tournament_academies cascade;
drop table if exists public.matches cascade;
drop table if exists public.players cascade;
drop table if exists public.teams cascade;
drop table if exists public.profiles cascade;
drop table if exists public.tournaments cascade;
drop table if exists public.academies cascade;

drop function if exists public.is_super_admin() cascade;
drop function if exists public.current_academy_id() cascade;
drop function if exists public.matches_set_academy_id() cascade;
drop function if exists public.merge_teams(uuid, uuid) cascade;
drop function if exists public.merge_players(uuid, uuid) cascade;
drop function if exists public.release_stale_locks() cascade;
drop function if exists public.acquire_match_lock(uuid, uuid) cascade;
drop function if exists public.refresh_match_lock(uuid, uuid) cascade;
drop function if exists public.release_match_lock(uuid, uuid) cascade;


-- ============================================================================
-- SECTION 1 — BASE SCHEMA
-- Tables created in FK-safe order (referenced tables first). No academies /
-- tournament_academies tables, no academy_id column anywhere.
-- ============================================================================

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid not null,
  username text unique,
  role text default 'analyst'::text check (role = any (array['super_admin'::text, 'analyst'::text])),
  created_at timestamp with time zone default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id)
);

create table public.tournaments (
  tournament_id uuid not null default gen_random_uuid(),
  tournament_name text not null,
  season text,
  start_date date,
  end_date date,
  created_at timestamp with time zone default now(),
  created_by uuid,
  constraint tournaments_pkey primary key (tournament_id),
  constraint tournaments_created_by_fkey foreign key (created_by) references auth.users(id)
);

create table public.teams (
  team_id uuid not null default gen_random_uuid(),
  team_name text not null,
  is_home boolean default false,
  created_by uuid,
  created_at timestamp with time zone default now(),
  constraint teams_pkey primary key (team_id),
  constraint teams_created_by_fkey foreign key (created_by) references public.profiles(id)
);

create table public.players (
  player_id uuid not null default gen_random_uuid(),
  team_id uuid,
  player_name text not null,
  position text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  linked_user_id uuid,
  constraint players_pkey primary key (player_id),
  constraint players_team_id_fkey foreign key (team_id) references public.teams(team_id),
  constraint players_created_by_fkey foreign key (created_by) references public.profiles(id),
  constraint players_linked_user_id_fkey foreign key (linked_user_id) references auth.users(id)
);

create table public.matches (
  match_id uuid not null default gen_random_uuid(),
  home_team_id uuid,
  away_team_id uuid,
  status text default 'Doing'::text,
  created_at timestamp with time zone default now(),
  match_name text not null,
  match_date date,
  is_futsal boolean default true,
  video_url text,
  tournament_name text default 'Demo'::text,
  created_by uuid,
  locked_by uuid,
  locked_at timestamp with time zone,
  assigned_to uuid,
  tournament_id uuid,
  home_team_score bigint,
  away_team_score bigint,
  constraint matches_pkey primary key (match_id),
  constraint matches_home_team_id_fkey foreign key (home_team_id) references public.teams(team_id),
  constraint matches_away_team_id_fkey foreign key (away_team_id) references public.teams(team_id),
  constraint matches_created_by_fkey foreign key (created_by) references public.profiles(id),
  constraint matches_locked_by_fkey foreign key (locked_by) references auth.users(id),
  constraint matches_assigned_to_fkey foreign key (assigned_to) references auth.users(id),
  constraint matches_tournament_id_fkey foreign key (tournament_id) references public.tournaments(tournament_id)
);

create table public.lineups (
  lineup_id uuid not null default gen_random_uuid(),
  match_id uuid,
  team_id uuid,
  player_id uuid,
  jersey_no integer,
  starting_xi boolean default false,
  subbed_off boolean default false,
  match_duration integer,
  substitution_in_time integer,
  substitution_off_time integer,
  position text,
  created_by uuid,
  constraint lineups_pkey primary key (lineup_id),
  constraint lineups_player_id_fkey foreign key (player_id) references public.players(player_id),
  constraint lineups_match_id_fkey foreign key (match_id) references public.matches(match_id),
  constraint lineups_team_id_fkey foreign key (team_id) references public.teams(team_id)
);

create table public.match_events (
  match_event_id bigint generated always as identity not null,
  match_id uuid not null,
  analyst_id uuid not null,
  match_time_seconds integer not null,
  start_x numeric not null,
  start_y numeric not null,
  end_x numeric,
  end_y numeric,
  end_z numeric,
  action text not null,
  outcome text not null,
  type text,
  body_part text,
  player_id uuid not null,
  reaction_player_id uuid,
  team_direction text not null,
  notes text,
  created_at timestamp with time zone default now(),
  is_futsal boolean not null default false,
  pressure_on boolean not null default false,
  shot_technique text,
  first_time_shot smallint,
  assist_type text,
  gk_x numeric,
  gk_y numeric,
  constraint match_events_pkey primary key (match_event_id),
  constraint match_events_analyst_id_fkey foreign key (analyst_id) references public.profiles(id),
  constraint match_events_player_id_fkey foreign key (player_id) references public.players(player_id),
  constraint match_events_reaction_player_id_fkey foreign key (reaction_player_id) references public.players(player_id),
  constraint match_events_match_id_fkey foreign key (match_id) references public.matches(match_id)
);

create table public.processed_match_events (
  processed_event_id uuid not null default gen_random_uuid(),
  match_event_id bigint not null,
  match_id uuid not null,
  half text,
  match_minute integer,
  match_time_seconds integer not null,
  start_x numeric not null,
  start_y numeric not null,
  end_x numeric,
  end_y numeric,
  end_z numeric,
  team_direction text not null,
  action text not null,
  outcome text not null,
  type text,
  body_part text,
  player_id uuid not null,
  reaction_player_id uuid,
  processed_at timestamp with time zone default now(),
  version_number integer default 1,
  is_futsal boolean not null default false,
  pressure_on boolean default false,
  shot_technique text,
  first_time_shot smallint,
  assist_type text,
  original_team_direction text,
  gk_x numeric,
  gk_y numeric,
  constraint processed_match_events_pkey primary key (processed_event_id),
  constraint processed_match_events_player_id_fkey foreign key (player_id) references public.players(player_id),
  constraint processed_match_events_reaction_player_id_fkey foreign key (reaction_player_id) references public.players(player_id),
  constraint processed_match_events_match_event_id_fkey foreign key (match_event_id) references public.match_events(match_event_id),
  constraint processed_match_events_match_id_fkey foreign key (match_id) references public.matches(match_id)
);

create table public.match_assignments (
  match_id uuid not null,
  user_id uuid not null,
  assigned_at timestamp with time zone default now(),
  constraint match_assignments_pkey primary key (match_id, user_id),
  constraint match_assignments_match_id_fkey foreign key (match_id) references public.matches(match_id),
  constraint match_assignments_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.match_notes (
  match_id uuid not null,
  analysis_text text,
  generated_at timestamp with time zone default now(),
  notes_it text,
  notes_fr text,
  notes_sp text,
  notes_polish text,
  constraint match_notes_pkey primary key (match_id),
  constraint match_notes_match_id_fkey foreign key (match_id) references public.matches(match_id)
);

create table public.action_flow_rules (
  -- BY DEFAULT (not ALWAYS) — the Section 4 seed below inserts explicit
  -- ids (1-100) to preserve the existing rule numbering; ALWAYS would
  -- reject that without an OVERRIDING SYSTEM VALUE clause on every insert.
  id integer generated by default as identity primary key,
  current_action text not null,
  current_outcome text not null,
  current_type text not null default 'ANY'::text,
  next_action text not null default 'Pass'::text,
  next_outcome text,
  next_type text,
  next_action_player text,
  next_reaction_player text,
  updated_at timestamp with time zone default now(),
  updated_by uuid references auth.users(id),
  unique (current_action, current_outcome, current_type)
);
create index if not exists idx_flow_rules_lookup on public.action_flow_rules(current_action, current_outcome, current_type);


-- ============================================================================
-- SECTION 2 — RLS HELPER FUNCTION
-- ============================================================================

create or replace function public.is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'super_admin'
  );
$$;


-- ============================================================================
-- SECTION 3 — ROW LEVEL SECURITY (internal / authenticated app users)
-- Single-club: any authenticated user (super_admin or analyst) can read and
-- tag match data. super_admin-only for destructive actions (delete, merge)
-- and admin management (creating other users' profiles, editing action-flow
-- rules, deleting teams/players/tournaments).
-- ============================================================================

alter table public.profiles               enable row level security;
alter table public.teams                  enable row level security;
alter table public.players                enable row level security;
alter table public.tournaments            enable row level security;
alter table public.matches                enable row level security;
alter table public.match_events           enable row level security;
alter table public.processed_match_events enable row level security;
alter table public.lineups                enable row level security;
alter table public.match_assignments      enable row level security;
alter table public.match_notes            enable row level security;
alter table public.action_flow_rules      enable row level security;

-- ── PROFILES ────────────────────────────────────────────────────────────────
-- Everyone on the team can see each other (small squad, needed for
-- assignment dropdowns / leaderboards); only super_admin creates/deletes
-- accounts; anyone can update their own profile.
create policy profiles_select on public.profiles for select
  using (auth.uid() is not null);
create policy profiles_insert on public.profiles for insert
  with check (is_super_admin() or id = auth.uid());
create policy profiles_update on public.profiles for update
  using (is_super_admin() or id = auth.uid())
  with check (is_super_admin() or id = auth.uid());
create policy profiles_delete on public.profiles for delete
  using (is_super_admin());

-- ── TEAMS ───────────────────────────────────────────────────────────────────
create policy teams_select on public.teams for select
  using (auth.uid() is not null);
create policy teams_insert on public.teams for insert
  with check (auth.uid() is not null);
create policy teams_update on public.teams for update
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy teams_delete on public.teams for delete
  using (is_super_admin());

-- ── PLAYERS ─────────────────────────────────────────────────────────────────
create policy players_select on public.players for select
  using (auth.uid() is not null);
create policy players_insert on public.players for insert
  with check (auth.uid() is not null);
create policy players_update on public.players for update
  using (auth.uid() is not null);
create policy players_delete on public.players for delete
  using (is_super_admin());

-- ── TOURNAMENTS ─────────────────────────────────────────────────────────────
create policy tournaments_select on public.tournaments for select
  using (auth.uid() is not null);
create policy tournaments_insert on public.tournaments for insert
  with check (is_super_admin());
create policy tournaments_update on public.tournaments for update
  using (is_super_admin());
create policy tournaments_delete on public.tournaments for delete
  using (is_super_admin());

-- ── MATCHES ─────────────────────────────────────────────────────────────────
create policy matches_select on public.matches for select
  using (auth.uid() is not null);
create policy matches_insert on public.matches for insert
  with check (auth.uid() is not null);
create policy matches_update on public.matches for update
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy matches_delete on public.matches for delete
  using (is_super_admin());

-- ── MATCH_EVENTS ────────────────────────────────────────────────────────────
create policy match_events_select on public.match_events for select
  using (auth.uid() is not null);
create policy match_events_insert on public.match_events for insert
  with check (auth.uid() is not null);
create policy match_events_update on public.match_events for update
  using (auth.uid() is not null);
create policy match_events_delete on public.match_events for delete
  using (auth.uid() is not null);

-- ── PROCESSED_MATCH_EVENTS ──────────────────────────────────────────────────
create policy pme_select on public.processed_match_events for select
  using (auth.uid() is not null);
create policy pme_insert on public.processed_match_events for insert
  with check (auth.uid() is not null);
create policy pme_update on public.processed_match_events for update
  using (auth.uid() is not null);
create policy pme_delete on public.processed_match_events for delete
  using (auth.uid() is not null);

-- ── LINEUPS ─────────────────────────────────────────────────────────────────
create policy lineups_select on public.lineups for select
  using (auth.uid() is not null);
create policy lineups_insert on public.lineups for insert
  with check (auth.uid() is not null);
create policy lineups_update on public.lineups for update
  using (auth.uid() is not null);
create policy lineups_delete on public.lineups for delete
  using (auth.uid() is not null);

-- ── MATCH_ASSIGNMENTS ───────────────────────────────────────────────────────
create policy ma_select on public.match_assignments for select
  using (auth.uid() is not null);
create policy ma_insert on public.match_assignments for insert
  with check (is_super_admin() or exists (
    select 1 from public.matches m where m.match_id = match_assignments.match_id and m.created_by = auth.uid()));
create policy ma_delete on public.match_assignments for delete
  using (is_super_admin() or exists (
    select 1 from public.matches m where m.match_id = match_assignments.match_id and m.created_by = auth.uid()));

-- ── MATCH_NOTES ─────────────────────────────────────────────────────────────
-- Internal scouting notes — any team member, not public.
create policy match_notes_select on public.match_notes for select
  using (auth.uid() is not null);
create policy match_notes_write on public.match_notes for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── ACTION_FLOW_RULES ───────────────────────────────────────────────────────
-- Global table — every analyst reads, only super_admin writes.
create policy afr_select on public.action_flow_rules for select using (true);
create policy afr_write  on public.action_flow_rules for all
  using (is_super_admin()) with check (is_super_admin());


-- ============================================================================
-- SECTION 4 — RPCs (team/player merge, match locking)
-- ============================================================================

create or replace function public.merge_teams(source_id uuid, target_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can merge teams';
  end if;
  update public.matches set home_team_id = target_id where home_team_id = source_id;
  update public.matches set away_team_id = target_id where away_team_id = source_id;
  update public.players set team_id      = target_id where team_id      = source_id;
  delete from public.teams where team_id = source_id;
end$$;

create or replace function public.merge_players(source_id uuid, target_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can merge players';
  end if;
  update public.match_events           set player_id          = target_id where player_id          = source_id;
  update public.match_events           set reaction_player_id = target_id where reaction_player_id = source_id;
  update public.processed_match_events set player_id          = target_id where player_id          = source_id;
  update public.processed_match_events set reaction_player_id = target_id where reaction_player_id = source_id;
  update public.lineups                set player_id          = target_id where player_id          = source_id;
  delete from public.players where player_id = source_id;
end$$;

create or replace function public.release_stale_locks()
returns void language plpgsql security definer as $$
begin
  update public.matches
     set locked_by = null, locked_at = null
   where locked_at < now() - interval '10 minutes';
end$$;

create or replace function public.acquire_match_lock(p_match_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare
  current_lock uuid;
begin
  perform public.release_stale_locks();
  select locked_by into current_lock from public.matches where match_id = p_match_id;
  if current_lock is null or current_lock = p_user_id then
    update public.matches set locked_by = p_user_id, locked_at = now() where match_id = p_match_id;
    return true;
  end if;
  return false;
end$$;

create or replace function public.refresh_match_lock(p_match_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer as $$
declare
  current_lock uuid;
begin
  select locked_by into current_lock from public.matches where match_id = p_match_id;
  if current_lock = p_user_id then
    update public.matches set locked_at = now() where match_id = p_match_id;
    return true;
  end if;
  return false;
end$$;

create or replace function public.release_match_lock(p_match_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.matches
     set locked_by = null, locked_at = null
   where match_id = p_match_id
     and (locked_by = p_user_id or locked_by is null);
end$$;


-- ============================================================================
-- SECTION 5 — SEED: action_flow_rules
-- This is the exact, currently-tuned production rule set (not the generic
-- migration defaults) — carried over because it's system configuration for
-- the tagging workflow, not match data, and has already been refined via the
-- Admin Portal's rule editor. `updated_by` is nulled out — those UUIDs
-- referenced a staff member's auth.users id from the old project, which
-- doesn't exist here.
-- ============================================================================

INSERT INTO "public"."action_flow_rules" ("id", "current_action", "current_outcome", "current_type", "next_action", "next_outcome", "next_type", "next_action_player", "next_reaction_player", "updated_at", "updated_by") VALUES
(1, 'Pass', 'Successful', 'Normal Pass', 'Pass', 'Successful', null, 'prevReaction_or_prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(2, 'Pass', 'Successful', 'Goalkick', 'Pass', 'Successful', null, 'prevReaction_or_prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(3, 'Pass', 'Successful', 'Goalkeeper Throw', 'Pass', 'Successful', null, 'prevReaction_or_prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(4, 'Pass', 'Successful', 'Corner Kick', 'Pass', 'Successful', 'Normal Pass', 'prevReaction_or_prevAction', null, '2026-03-30 11:37:52.463+00', null),
(5, 'Pass', 'Successful', 'Free Kick', 'Pass', 'Successful', 'Normal Pass', 'prevReaction_or_prevAction', null, '2026-03-30 11:37:53.12+00', null),
(6, 'Pass', 'Successful', 'Throw-in', 'Pass', 'Successful', null, 'prevReaction_or_prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(7, 'Pass', 'Successful', 'Penalty', 'Pass', 'Successful', null, 'prevReaction_or_prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(8, 'Pass', 'Assist', 'Normal Pass', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:53.364+00', null),
(9, 'Pass', 'Assist', 'Goalkick', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:53.56+00', null),
(10, 'Pass', 'Assist', 'Goalkeeper Throw', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:53.753+00', null),
(11, 'Pass', 'Assist', 'Corner Kick', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:53.967+00', null),
(12, 'Pass', 'Assist', 'Free Kick', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:54.169+00', null),
(13, 'Pass', 'Assist', 'Throw-in', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:54.368+00', null),
(14, 'Pass', 'Assist', 'Penalty', 'Shoot', 'Goal', null, 'prevReaction', null, '2026-03-30 11:37:54.568+00', null),
(15, 'Pass', 'Key Pass', 'Normal Pass', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:54.784+00', null),
(16, 'Pass', 'Key Pass', 'Goalkick', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:54.985+00', null),
(17, 'Pass', 'Key Pass', 'Goalkeeper Throw', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:55.181+00', null),
(18, 'Pass', 'Key Pass', 'Corner Kick', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:55.377+00', null),
(19, 'Pass', 'Key Pass', 'Free Kick', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:55.583+00', null),
(20, 'Pass', 'Key Pass', 'Throw-in', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:55.773+00', null),
(21, 'Pass', 'Key Pass', 'Penalty', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:37:55.961+00', null),
(22, 'Pass', 'Missed', 'Normal Pass', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:56.151+00', null),
(23, 'Pass', 'Missed', 'Goalkick', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:56.332+00', null),
(24, 'Pass', 'Missed', 'Goalkeeper Throw', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:56.555+00', null),
(25, 'Pass', 'Missed', 'Corner Kick', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:56.746+00', null),
(26, 'Pass', 'Missed', 'Free Kick', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:56.927+00', null),
(27, 'Pass', 'Missed', 'Throw-in', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:57.115+00', null),
(28, 'Pass', 'Missed', 'Penalty', 'Pass', 'Successful', null, null, null, '2026-03-30 11:37:57.287+00', null),
(29, 'Pass', 'Intercepted', 'Normal Pass', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(30, 'Pass', 'Intercepted', 'Goalkick', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(31, 'Pass', 'Intercepted', 'Goalkeeper Throw', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(32, 'Pass', 'Intercepted', 'Corner Kick', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 11:37:57.484+00', null),
(33, 'Pass', 'Intercepted', 'Free Kick', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(34, 'Pass', 'Intercepted', 'Throw-in', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(35, 'Pass', 'Intercepted', 'Penalty', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(36, 'Pass', 'Off-Side', 'Normal Pass', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:57.639+00', null),
(37, 'Pass', 'Off-Side', 'Goalkick', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:57.814+00', null),
(38, 'Pass', 'Off-Side', 'Goalkeeper Throw', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:57.977+00', null),
(39, 'Pass', 'Off-Side', 'Corner Kick', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:58.148+00', null),
(40, 'Pass', 'Off-Side', 'Free Kick', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:58.335+00', null),
(41, 'Pass', 'Off-Side', 'Penalty', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:37:58.534+00', null),
(42, 'Shoot', 'Save', 'Normal', 'Save', null, null, 'prevReaction', 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(43, 'Shoot', 'Save', 'Penalty', 'Save', null, null, 'prevReaction', 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(44, 'Shoot', 'Save', 'Free Kick', 'Save', null, null, 'prevReaction', 'prevAction', '2026-03-30 09:49:33.498121+00', null),
(45, 'Shoot', 'Block', 'Normal', 'Block', 'Successful', null, 'prevReaction', 'prevAction', '2026-03-30 11:37:58.702+00', null),
(46, 'Shoot', 'Block', 'Penalty', 'Block', 'Successful', null, 'prevReaction', 'prevAction', '2026-03-30 11:37:58.868+00', null),
(47, 'Shoot', 'Block', 'Free Kick', 'Block', 'Successful', null, 'prevReaction', 'prevAction', '2026-03-30 11:37:59.051+00', null),
(48, 'Shoot', 'Goal', 'Normal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(49, 'Shoot', 'Goal', 'Penalty', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(50, 'Shoot', 'Goal', 'Free Kick', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(51, 'Shoot', 'Woodwork', 'Normal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(52, 'Shoot', 'Woodwork', 'Penalty', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(53, 'Shoot', 'Woodwork', 'Free Kick', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(54, 'Shoot', 'Off-Target', 'Normal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(55, 'Shoot', 'Off-Target', 'Penalty', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(56, 'Shoot', 'Off-Target', 'Free Kick', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(57, 'Carry', 'Successful', 'NA', 'Pass', 'Successful', null, 'prevAction', null, '2026-03-30 11:37:59.242+00', null),
(58, 'Dribble', 'Successful', 'NA', 'Pass', 'Successful', null, 'prevAction', null, '2026-03-30 11:37:59.413+00', null),
(59, 'Dribble', 'Unsuccessful', 'NA', 'Standing Tackle', null, null, 'prevReaction', 'prevAction', '2026-03-30 12:39:39.702+00', null),
(60, 'Dribble', 'Foul Won', 'NA', 'Standing Tackle', 'Foul', null, 'prevReaction', 'prevAction', '2026-04-21 12:04:28.643+00', null),
(61, 'Standing Tackle', 'Successful', 'With Possession', 'Pass', 'Successful', 'Normal Pass', 'prevAction', null, '2026-03-30 11:37:59.985+00', null),
(62, 'Standing Tackle', 'Successful', 'Without Possession', 'Pass', 'Successful', 'Normal Pass', null, null, '2026-03-30 11:38:00.184+00', null),
(63, 'Standing Tackle', 'Unsuccessful', 'NA', 'Pass', 'Successful', 'Normal Pass', null, null, '2026-03-30 11:38:00.368+00', null),
(64, 'Standing Tackle', 'Foul', 'No Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:00.55+00', null),
(65, 'Standing Tackle', 'Foul', 'Yellow Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:00.748+00', null),
(66, 'Standing Tackle', 'Foul', 'Red Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:00.909+00', null),
(67, 'Sliding Tackle', 'Successful', 'With Possession', 'Pass', 'Successful', null, 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(68, 'Sliding Tackle', 'Successful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(69, 'Sliding Tackle', 'Unsuccessful', 'NA', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(70, 'Sliding Tackle', 'Foul', 'No Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:01.07+00', null),
(71, 'Sliding Tackle', 'Foul', 'Yellow Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:01.254+00', null),
(72, 'Sliding Tackle', 'Foul', 'Red Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 11:38:01.47+00', null),
(73, 'Save', 'Gripping', 'NA', 'Pass', 'Successful', 'Goalkeeper Throw', 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(74, 'Save', 'Pushing-in', 'NA', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(75, 'Save', 'Pushing-out', 'NA', 'Pass', 'Successful', 'Corner Kick', null, null, '2026-03-30 09:49:33.498121+00', null),
(76, 'Block', 'Successful', 'With Possession', 'Pass', 'Successful', null, 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(77, 'Block', 'Successful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(78, 'Block', 'Unsuccessful', 'Hand Ball', 'Discipline', 'Foul', null, 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(79, 'Block', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(80, 'Clearance', 'Successful', 'With Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 11:38:01.647+00', null),
(81, 'Clearance', 'Successful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(82, 'Clearance', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(83, 'Clearance', 'Unsuccessful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(84, 'Pass Intercept', 'Successful', 'With Possession', 'Pass', 'Successful', null, 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(85, 'Pass Intercept', 'Successful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(86, 'Pass Intercept', 'Unsuccessful', 'Hand Ball', 'Discipline', 'Foul', null, 'prevAction', null, '2026-03-30 09:49:33.498121+00', null),
(87, 'Pass Intercept', 'Unsuccessful', 'Without Possession', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(88, 'Pass Intercept', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(89, 'Pressure', 'Foul', 'No Card', 'Discipline', 'Foul', null, null, null, '2026-03-30 11:38:01.826+00', null),
(90, 'Through Ball', 'Successful', 'Normal', 'Pass', 'Successful', null, 'prevReaction', null, '2026-03-30 11:38:02.025+00', null),
(91, 'Through Ball', 'Assist', 'Normal', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:38:02.193+00', null),
(92, 'Through Ball', 'Key Pass', 'Normal', 'Shoot', null, null, 'prevReaction', null, '2026-03-30 11:38:02.369+00', null),
(93, 'Through Ball', 'Missed', 'Normal', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(94, 'Through Ball', 'Missed', 'Off-Side', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(95, 'Through Ball', 'Intercepted', 'Normal', 'Pass Intercept', null, null, null, 'prevAction', '2026-03-30 11:38:02.546+00', null),
(96, 'Discipline', 'Foul', 'No Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 09:49:33.498121+00', null),
(97, 'Discipline', 'Foul', 'Yellow Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 09:49:33.498121+00', null),
(98, 'Discipline', 'Foul', 'Red Card', 'Pass', 'Successful', 'Free Kick', null, null, '2026-03-30 09:49:33.498121+00', null),
(99, 'Substitution', 'Off', 'Tactical', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null),
(100, 'Substitution', 'Off', 'Injury', 'Pass', 'Successful', null, null, null, '2026-03-30 09:49:33.498121+00', null)
ON CONFLICT (current_action, current_outcome, current_type) DO NOTHING;

-- The seed above inserted explicit ids 1-100; advance the identity sequence
-- past them so the next rule created via the Admin Portal doesn't collide.
select setval(
  pg_get_serial_sequence('public.action_flow_rules', 'id'),
  (select max(id) from public.action_flow_rules)
);


-- ============================================================================
-- SECTION 6 — SEED: the MKS Podlasie team
-- Single-club schema — no academy wrapper needed. Copy the returned
-- team_id: it's VITE_TEAM_ID for CAC-player-report and
-- NEXT_PUBLIC_MKS_TEAM_ID for CAC-Match-Report.
-- ============================================================================

insert into public.teams (team_name, is_home) values
  ('MKS Podlasie Sokołów Podlaski', true)
  returning team_id;


-- ============================================================================
-- SECTION 7 — PUBLIC READ ADDENDUM
-- Lets the two public report sites read match data with just the anon key,
-- no login required. Since this is a single-club database, there's no
-- multi-tenant data to accidentally leak — every row in these tables already
-- belongs to MKS Podlasie (or an opponent they played), so anon read is
-- simply "on", full stop. `match_notes` stays analyst-only (internal
-- scouting notes, never exposed to anon).
-- ============================================================================

create policy anon_read_teams on public.teams for select to anon using (true);
create policy anon_read_players on public.players for select to anon using (true);
create policy anon_read_matches on public.matches for select to anon using (true);
create policy anon_read_lineups on public.lineups for select to anon using (true);
create policy anon_read_match_events on public.match_events for select to anon using (true);
create policy anon_read_pme on public.processed_match_events for select to anon using (true);


-- ============================================================================
-- SECTION 8 — BOOTSTRAP: making yourself super_admin
-- Prerequisite: create your login first via Dashboard → Authentication →
-- Add User, then copy that user's UUID and run this (no auto-trigger creates
-- a `profiles` row on signup in this schema, so this must be an INSERT, not
-- an UPDATE, for the very first user):
-- ============================================================================

-- insert into public.profiles (id, username, role) values
--   ('<PASTE_YOUR_AUTH_USER_UUID_HERE>', 'precious', 'super_admin');

-- ============================================================================
-- DONE. Verify with:
--   select * from public.teams;
--   select role from public.profiles;
--   select count(*) from public.action_flow_rules;   -- should be 100
-- ============================================================================
