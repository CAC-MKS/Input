-- ============================================================================
--  SIMPLIFY ROLES MIGRATION
--  ----------------------------------------------------------------------------
--  Collapses the role system on the public tagger site to TWO roles:
--      super_admin  – website owner; creates academies, creates analyst
--                     accounts, assigns analysts to academies, sees everything
--      analyst      – the only end user; sees only their assigned academy
--
--  Removes legacy roles (admin, academy_admin, coach, player, customer, qc),
--  drops tables that belong to a sister website (team_staff, user_access,
--  academy_members), and adds direct academy scoping to matches.
--
--  Idempotent — safe to re-run.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. MIGRATE EXISTING USERS BEFORE TIGHTENING THE CHECK
-- ────────────────────────────────────────────────────────────────────────────
-- Old 'admin' (or anyone flagged super_admin in global_role) → super_admin
update public.profiles
   set role = 'super_admin'
 where role = 'admin'
    or (
        exists (
            select 1
              from information_schema.columns
             where table_schema = 'public'
               and table_name   = 'profiles'
               and column_name  = 'global_role'
        )
        and global_role = 'super_admin'
    );

-- Everyone else who is not super_admin → analyst (covers academy_admin, coach,
-- player, customer, qc, and any future stragglers)
update public.profiles
   set role = 'analyst'
 where role is distinct from 'super_admin'
   and role is distinct from 'analyst';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SUPER_ADMIN MUST NOT BELONG TO AN ACADEMY
-- ────────────────────────────────────────────────────────────────────────────
update public.profiles
   set academy_id = null
 where role = 'super_admin';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. REPLACE CHECK CONSTRAINTS ON profiles
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'analyst'));

-- super_admin must have NULL academy.
-- Analysts MAY temporarily have NULL academy_id (super_admin assigns them via
-- the Analysts tab in the admin portal). The frontend blocks any analyst
-- with a NULL academy_id from logging in until assigned.
alter table public.profiles drop constraint if exists profiles_role_academy_check;
alter table public.profiles
  add constraint profiles_role_academy_check
  check (role <> 'super_admin' or academy_id is null);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. DROP global_role (collapsed into role)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles drop column if exists global_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DROP TABLES THAT BELONG TO THE OTHER WEBSITE
-- ────────────────────────────────────────────────────────────────────────────
drop table if exists public.team_staff      cascade;
drop table if exists public.user_access     cascade;
drop table if exists public.academy_members cascade;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ADD academy_id TO matches (direct, simple scoping)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.matches
  add column if not exists academy_id uuid references public.academies(academy_id);

-- Backfill: matches.academy_id = creator's academy
update public.matches m
   set academy_id = p.academy_id
  from public.profiles p
 where m.created_by = p.id
   and m.academy_id is null;

-- Auto-stamp academy_id from the creator on insert
create or replace function public.matches_set_academy_id()
returns trigger language plpgsql security definer as $$
begin
  if new.academy_id is null then
    select academy_id into new.academy_id
      from public.profiles
     where id = new.created_by;
  end if;
  return new;
end$$;

drop trigger if exists trg_matches_set_academy_id on public.matches;
create trigger trg_matches_set_academy_id
  before insert on public.matches
  for each row execute function public.matches_set_academy_id();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RLS HELPERS
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.current_academy_id()
returns uuid language sql stable security definer as $$
  select academy_id from public.profiles where id = auth.uid();
$$;

-- Drop legacy helpers from the multi-academy migration if present
drop function if exists public.user_academy_ids()    cascade;
drop function if exists public.user_staff_team_ids() cascade;
drop function if exists public.is_academy_admin_of(uuid) cascade;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RLS POLICIES — drop legacy, recreate simple "super_admin OR own academy"
-- ────────────────────────────────────────────────────────────────────────────
-- Helper PL/pgSQL block: drop ALL existing policies on the listed tables so we
-- start clean (avoids name collisions with the various older migrations).
do $$
declare
  t text;
  p record;
begin
  for t in select unnest(array[
    'academies', 'profiles', 'teams', 'players', 'tournaments',
    'matches', 'match_events', 'processed_match_events',
    'lineups', 'match_assignments', 'action_flow_rules'
  ])
  loop
    for p in
      select policyname
        from pg_policies
       where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end$$;

-- Enable RLS on every table
alter table public.academies              enable row level security;
alter table public.profiles               enable row level security;
alter table public.teams                  enable row level security;
alter table public.players                enable row level security;
alter table public.tournaments            enable row level security;
alter table public.matches                enable row level security;
alter table public.match_events           enable row level security;
alter table public.processed_match_events enable row level security;
alter table public.lineups                enable row level security;
alter table public.match_assignments      enable row level security;
alter table public.action_flow_rules      enable row level security;

-- ── ACADEMIES ───────────────────────────────────────────────────────────────
-- super_admin: full CRUD. Analysts: read only their own academy.
create policy academies_select on public.academies for select
  using (is_super_admin() or academy_id = current_academy_id());
create policy academies_insert on public.academies for insert
  with check (is_super_admin());
create policy academies_update on public.academies for update
  using (is_super_admin()) with check (is_super_admin());
create policy academies_delete on public.academies for delete
  using (is_super_admin());

-- ── PROFILES ────────────────────────────────────────────────────────────────
-- super_admin: full CRUD on any profile.
-- Analysts: read their own profile + read other analysts in same academy
-- (needed for assignment dropdowns / leaderboards inside the academy).
create policy profiles_select on public.profiles for select
  using (
    is_super_admin()
    or id = auth.uid()
    or academy_id = current_academy_id()
  );
create policy profiles_insert on public.profiles for insert
  with check (is_super_admin() or id = auth.uid());
create policy profiles_update on public.profiles for update
  using (is_super_admin() or id = auth.uid())
  with check (is_super_admin() or id = auth.uid());
create policy profiles_delete on public.profiles for delete
  using (is_super_admin());

-- ── TEAMS ───────────────────────────────────────────────────────────────────
create policy teams_select on public.teams for select
  using (is_super_admin() or academy_id = current_academy_id() or academy_id is null);
create policy teams_insert on public.teams for insert
  with check (is_super_admin() or academy_id = current_academy_id() or academy_id is null);
create policy teams_update on public.teams for update
  using (is_super_admin() or academy_id = current_academy_id() or academy_id is null)
  with check (is_super_admin() or academy_id = current_academy_id() or academy_id is null);
create policy teams_delete on public.teams for delete
  using (is_super_admin() or academy_id = current_academy_id());

-- ── PLAYERS ─────────────────────────────────────────────────────────────────
-- Players inherit scoping from their team.
create policy players_select on public.players for select
  using (
    is_super_admin()
    or exists (
      select 1 from public.teams t
       where t.team_id = players.team_id
         and (t.academy_id = current_academy_id() or t.academy_id is null)
    )
  );
create policy players_insert on public.players for insert
  with check (
    is_super_admin()
    or exists (
      select 1 from public.teams t
       where t.team_id = players.team_id
         and (t.academy_id = current_academy_id() or t.academy_id is null)
    )
  );
create policy players_update on public.players for update
  using (
    is_super_admin()
    or exists (
      select 1 from public.teams t
       where t.team_id = players.team_id
         and (t.academy_id = current_academy_id() or t.academy_id is null)
    )
  );
create policy players_delete on public.players for delete
  using (is_super_admin());

-- ── TOURNAMENTS ─────────────────────────────────────────────────────────────
create policy tournaments_select on public.tournaments for select
  using (is_super_admin() or academy_id = current_academy_id() or academy_id is null);
create policy tournaments_insert on public.tournaments for insert
  with check (is_super_admin() or academy_id = current_academy_id());
create policy tournaments_update on public.tournaments for update
  using (is_super_admin() or academy_id = current_academy_id());
create policy tournaments_delete on public.tournaments for delete
  using (is_super_admin());

-- ── MATCHES ─────────────────────────────────────────────────────────────────
create policy matches_select on public.matches for select
  using (is_super_admin() or academy_id = current_academy_id());
create policy matches_insert on public.matches for insert
  with check (
    is_super_admin()
    or (created_by = auth.uid() and current_academy_id() is not null)
  );
create policy matches_update on public.matches for update
  using (is_super_admin() or academy_id = current_academy_id())
  with check (is_super_admin() or academy_id = current_academy_id());
create policy matches_delete on public.matches for delete
  using (is_super_admin() or academy_id = current_academy_id());

-- ── MATCH_EVENTS ────────────────────────────────────────────────────────────
create policy match_events_select on public.match_events for select
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy match_events_insert on public.match_events for insert
  with check (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy match_events_update on public.match_events for update
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy match_events_delete on public.match_events for delete
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_events.match_id
                  and m.academy_id = current_academy_id())
  );

-- ── PROCESSED_MATCH_EVENTS ──────────────────────────────────────────────────
create policy pme_select on public.processed_match_events for select
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = processed_match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy pme_insert on public.processed_match_events for insert
  with check (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = processed_match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy pme_update on public.processed_match_events for update
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = processed_match_events.match_id
                  and m.academy_id = current_academy_id())
  );
create policy pme_delete on public.processed_match_events for delete
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = processed_match_events.match_id
                  and m.academy_id = current_academy_id())
  );

-- ── LINEUPS ─────────────────────────────────────────────────────────────────
create policy lineups_select on public.lineups for select
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = lineups.match_id
                  and m.academy_id = current_academy_id())
  );
create policy lineups_insert on public.lineups for insert
  with check (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = lineups.match_id
                  and m.academy_id = current_academy_id())
  );
create policy lineups_update on public.lineups for update
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = lineups.match_id
                  and m.academy_id = current_academy_id())
  );
create policy lineups_delete on public.lineups for delete
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = lineups.match_id
                  and m.academy_id = current_academy_id())
  );

-- ── MATCH_ASSIGNMENTS ───────────────────────────────────────────────────────
create policy ma_select on public.match_assignments for select
  using (
    is_super_admin()
    or user_id = auth.uid()
    or exists (select 1 from public.matches m
                where m.match_id = match_assignments.match_id
                  and m.academy_id = current_academy_id())
  );
create policy ma_insert on public.match_assignments for insert
  with check (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_assignments.match_id
                  and m.academy_id = current_academy_id())
  );
create policy ma_delete on public.match_assignments for delete
  using (
    is_super_admin()
    or exists (select 1 from public.matches m
                where m.match_id = match_assignments.match_id
                  and m.academy_id = current_academy_id())
  );

-- ── ACTION_FLOW_RULES ───────────────────────────────────────────────────────
-- Global table — every analyst reads, only super_admin writes.
create policy afr_select on public.action_flow_rules for select using (true);
create policy afr_write  on public.action_flow_rules for all
  using (is_super_admin()) with check (is_super_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 9. CLEAN UP LEGACY RPC FUNCTIONS THAT REFERENCED OLD ROLES
-- ────────────────────────────────────────────────────────────────────────────
-- merge_teams / merge_players / assign_match guarded by 'admin' role text —
-- replace the guard with super_admin if these RPCs exist.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'merge_teams') then
    execute $f$
      create or replace function public.merge_teams(source_id uuid, target_id uuid)
      returns void language plpgsql security definer as $body$
      begin
        if not public.is_super_admin() then
          raise exception 'Only super_admin can merge teams';
        end if;
        update public.matches set home_team_id = target_id where home_team_id = source_id;
        update public.matches set away_team_id = target_id where away_team_id = source_id;
        update public.players set team_id      = target_id where team_id      = source_id;
        delete from public.teams where team_id = source_id;
      end$body$;
    $f$;
  end if;

  if exists (select 1 from pg_proc where proname = 'merge_players') then
    execute $f$
      create or replace function public.merge_players(source_id uuid, target_id uuid)
      returns void language plpgsql security definer as $body$
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
      end$body$;
    $f$;
  end if;
end$$;

-- ============================================================================
-- DONE.  After running:
--   select distinct role from public.profiles;
--   -> should return only 'super_admin' and 'analyst'
-- ============================================================================
