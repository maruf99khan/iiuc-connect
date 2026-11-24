# Flash mentorship (Sprint 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sprint 5 slot-booking with the master file's request flow (request, accept or decline, 72-hour expiry, sessions, blind feedback), enforced and tested in the database.

**Architecture:** Three forward migrations (availability and slots, requests and sessions and feedback, cron jobs). Members write under RLS with column grants; `SECURITY DEFINER` triggers in `private` do the multi-table effects. The app is Server Components plus Server Actions on the session-bound client. `pg_cron` runs expiry and slot generation.

**Tech Stack:** Next.js 16.4.6 (Cache Components), TypeScript strict, Zod 4, Supabase Postgres 17 with pgTAP and `pg_cron`, Vitest, Playwright (python).

**Spec:** `docs/superpowers/specs/2026-11-23-mentorship-design.md` (scope source: `docs/plan/IIUC_Connect_Master_File_v2.md` §6.5 and §7).

## Global Constraints

- Free tiers only. No paid service, no new npm dependency.
- Hosted Supabase project `zhogqnudiosaqihzvkiq` is the dev database (D-016). Leave it with 0 users, 0 profiles and no storage objects you created.
- TypeScript strict with `noUncheckedIndexedAccess`; no `any`; every `unknown` narrowed.
- Zod 4 style: `{ error: "…" }` messages, `z.flattenError`, `z.uuid()`, and `.nullish()` for any optional `FormData` field (an absent field is `null`).
- Times are entered and shown in Asia/Dhaka (UTC+6, no DST) and stored as UTC `timestamptz`.
- Never read `Date.now()` in a prerendered component. `getCurrentUser()` calls `await io()` first; pages read the clock only after it.
- Every WITH CHECK branch repeats its full who-and-values condition (permissive policies are OR-ed).
- Counts that limit a statement go in AFTER triggers (BEFORE row triggers cannot see sibling rows of the same statement).
- Migrations are forward-only. Apply with the Supabase `apply_migration` tool, then rename the local file to the version `list_migrations` reports.
- pgTAP files run in one `begin … rollback` transaction through the `_tap_out` temp table. Run them against the hosted database with `execute_sql`; the file ends by selecting only non-`ok` lines.
- After every schema change run `get_advisors` (security and performance); expect 0 security findings.
- Hooks may demand facts before a first Write or Edit; state them in text and retry.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push the branch; do not merge to `main`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<v>_mentor_availability.sql` | Drops Sprint 5 tables; `mentor_profiles`, `mentor_availability_rules`, `mentor_slots`, slot generation |
| `supabase/migrations/<v>_mentorship_requests.sql` | `mentorship_requests`, `sessions`, `session_feedback`, their triggers, policies, grants |
| `supabase/migrations/<v>_mentorship_jobs.sql` | `pg_cron` extension, `private.expire_requests()`, two scheduled jobs |
| `supabase/tests/005_mentorship.test.sql` | pgTAP proof of every rule; replaces `004_mentor_sessions.test.sql` (deleted) |
| `lib/mentorship/time.ts` | `formatDhaka`, `isHttpsLink` (moved from `lib/sessions/slot.ts`) |
| `lib/mentorship/schemas.ts` | Zod schemas for rule, profile, request, response, outcome, feedback |
| `lib/mentorship/form-state.ts` | Shared form state type |
| `app/(app)/sessions/actions.ts` | All Server Actions |
| `app/(app)/sessions/page.tsx` and client forms | The hub |
| `app/(app)/members/[id]/page.tsx`, `request-form.tsx` | Slot list and request form on a graduate's page |
| `e2e/mentorship.py` | Browser and API proof; replaces `e2e/sessions.py` |
| `types/database.types.ts` | Regenerated |
| `docs/evidence/2026-11-2x_sprint6_checks.txt`, `docs/plan/Build_State.md`, `Decision_Log.md`, `Dev_Journal.md`, `README.md` | Evidence and records |

---

## Task 1: Spike, confirm `pg_cron` works on the hosted project

**Files:** none changed.

**Interfaces:** Produces: the exact `create extension` statement that works (used verbatim in Task 4).

- [ ] **Step 1: Try to enable the extension and schedule a throwaway job**

Run with `execute_sql` on project `zhogqnudiosaqihzvkiq`:

```sql
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('spike-job', '0 0 1 1 *', 'select 1');
select jobname, schedule from cron.job where jobname = 'spike-job';
select cron.unschedule('spike-job');
```

Expected: the third statement's result shows `spike-job | 0 0 1 1 *`; no error. Leave the extension enabled (Task 4 uses it).

- [ ] **Step 2: If it fails, stop and report**

If `create extension` is refused, tell the user to enable `pg_cron` in the Supabase dashboard (Database, Extensions) and re-run Step 1. If the free tier blocks it entirely, stop: the fallback is a daily Vercel Cron calling a route that runs `private.expire_requests()` with the service key, which changes D-020 in the spec. Do not continue to Task 2 until the user decides.

- [ ] **Step 3: Note the CI question**

Run: `grep -n "pg_cron\|shared_preload" supabase/config.toml`. Expect no match (the Supabase local image preloads `pg_cron`). Record "CI behaviour unverified until the Actions run" in the evidence file (Task 10).

---

## Task 2: Migration 1, availability, slots and generation

**Files:**
- Create: `supabase/migrations/20261123174737_mentor_availability.sql` (rename to the applied version)
- Create: `supabase/tests/005_mentorship.test.sql` (header, fixtures, group A, tail)
- Delete: `supabase/tests/004_mentor_sessions.test.sql`

**Interfaces:**
- Consumes: `private.is_verified()`, `private.is_admin()`, `private.is_verified_alumni()`, `private.set_updated_at()`, `public.profiles (id, affiliation, verification_status, visibility)`.
- Produces: enum `public.slot_status`; tables `mentor_profiles(id, expertise_areas, bio, max_sessions_per_week, accepting_requests)`, `mentor_availability_rules(id, mentor_id, weekday, start_time, end_time)`, `mentor_slots(id, mentor_id, starts_at, status)`; `private.generate_slots(p_mentor uuid default null) returns integer`; test helpers `public._as(int)` and temp table `_ctx(k, v)` with slot ids `s1`–`s8` (Mona, from day+5 on, four per day) and `c1`–`c4` (Mona, day+3).

- [ ] **Step 1: Write the test file (header, fixtures, group A, tail)**

Create `supabase/tests/005_mentorship.test.sql`:

```sql
-- =============================================================================
-- IIUC Connect — pgTAP tests for the mentorship request flow (Sprint 6)
-- Fixtures (ids a6000000-0000-4000-8000-0000000000NN):
--   01 Mona   graduate mentor        02 Sam   verified student
--   03 Sue    verified student       04 Uma   email confirmed only
--   05 Pete   graduate mentor, private profile
--   06 Ada    admin                  07-10 graduate mentors with one slot each
--   11 Gary   graduate, makes his mentor profile in the tests
--   12-14 verified students          15 Gus  graduate, never makes a mentor profile
-- Runs in one transaction that is rolled back.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

-- Slot ids picked once, so later statements do not shift as slots change state.
create temp table _ctx (k text primary key, v uuid not null);
grant all on _ctx to public;

-- Switch the signed-in user: select public._as(2) is "Sam".
create function public._as(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'),
                      'role', 'authenticated')::text, true);
$$;
grant execute on function public._as(int) to public;

select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm' || n || '@test.invalid', now()
  from generate_series(1, 15) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
select private.transition_verification(id, 'verified_alumni', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
select private.transition_verification(id, 'verified_student', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 12, 13, 14]) n);

update public.profiles set affiliation = 'alumni',  full_name = 'Graduate ' || right(id::text, 2)
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
update public.profiles set affiliation = 'student', full_name = 'Student ' || right(id::text, 2)
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 12, 13, 14]) n);
update public.profiles set visibility = 'private' where id = 'a6000000-0000-4000-8000-000000000005';
update public.profiles set role = 'admin'         where id = 'a6000000-0000-4000-8000-000000000006';

-- Mentor profiles for 01, 05, 07-10 (Gary 11 makes his own in the tests).
insert into public.mentor_profiles (id, expertise_areas)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, array['backend']
  from unnest(array[1, 5, 7, 8, 9, 10]) n;

-- One slot each for Pete (private) and mentors 07-10, inserted as the owner.
insert into public.mentor_slots (mentor_id, starts_at)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       now() + interval '2 days' + (n || ' minutes')::interval
  from unnest(array[5, 7, 8, 9, 10]) n;

-- -----------------------------------------------------------------------------
-- A. Mentor profiles, weekly rules, generated slots
-- -----------------------------------------------------------------------------
set local role authenticated;

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_profiles (expertise_areas) values ('{x}') $$,
  '42501', null, 'a student cannot create a mentor profile');

select public._as(11);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_profiles (expertise_areas, bio) values ('{java,sql}', 'Hello') $$,
  'a verified graduate can create a mentor profile');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set max_sessions_per_week = 0 where id = auth.uid() $$,
  '23514', null, 'a weekly cap of 0 is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set max_sessions_per_week = 11 where id = auth.uid() $$,
  '23514', null, 'a weekly cap above 10 is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set expertise_areas = '{a,b,c,d,e,f,g,h,i}' where id = auth.uid() $$,
  '23514', null, 'more than 8 expertise areas is refused');

select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_profiles), 6,
  'a verified member sees the 6 visible mentor profiles (a private one is hidden)');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_profiles), 0,
  'a member who is not verified sees no mentor profiles');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.mentor_profiles $$, '42501', null,
  'a signed-out visitor cannot read mentor profiles');
reset role; set local role authenticated;

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:00', '10:00') $$,
  '42501', null, 'a student cannot add an availability rule');
select public._as(15);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:00', '10:00') $$,
  '42501', null, 'a graduate without a mentor profile cannot add a rule');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:15', '10:00') $$,
  '23514', null, 'a rule must start on the hour or half hour');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '10:00', '09:00') $$,
  '23514', null, 'a rule must end after it starts');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '08:00', '17:00') $$,
  '23514', null, 'a rule longer than 8 hours is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time)
     select d, '09:00', '11:00' from generate_series(0, 6) d $$,
  'a graduate with a mentor profile can add weekly rules');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time)
     select d, '12:00', '13:00' from generate_series(0, 3) d $$,
  '54000', null, 'one statement cannot push a mentor past 10 rules');

insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000001') > 0,
  'saving rules generates slots');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001'
      and not (extract(hour   from starts_at at time zone 'Asia/Dhaka') in (9, 10)
           and extract(minute from starts_at at time zone 'Asia/Dhaka') in (0, 30))),
  0, 'generated slots fall in the rule window, in Bangladesh time');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001'
      and (starts_at < now() + interval '30 minutes' or starts_at > now() + interval '14 days')),
  0, 'generated slots are 30 minutes to 14 days ahead');

reset role;
insert into _tap_out (line) select extensions.is(
  (select private.generate_slots('a6000000-0000-4000-8000-000000000001')), 0,
  'running generation again adds nothing');

-- Slot ids for later groups: s1-s8 from day+5 on (4 per day); c1-c4 on day+3.
insert into _ctx (k, v)
select 's' || row_number() over (order by starts_at), id
  from (select id, starts_at from public.mentor_slots
         where mentor_id = 'a6000000-0000-4000-8000-000000000001'
           and (starts_at at time zone 'Asia/Dhaka')::date >= (now() at time zone 'Asia/Dhaka')::date + 5
         order by starts_at limit 8) q;
insert into _ctx (k, v)
select 'c' || row_number() over (order by starts_at), id
  from (select id, starts_at from public.mentor_slots
         where mentor_id = 'a6000000-0000-4000-8000-000000000001'
           and (starts_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date + 3
         order by starts_at limit 4) q;

set local role authenticated;
select public._as(2);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status = 'open') > 0,
  'a verified member sees a mentor''s open slots');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000005'), 0,
  'a private mentor''s slots are hidden');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (mentor_id, starts_at) values ('a6000000-0000-4000-8000-000000000001', now() + interval '3 days') $$,
  '42501', null, 'nobody can insert slots directly');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set starts_at = now() + interval '9 days' where id = (select v from _ctx where k = 's1') $$,
  '42501', null, 'a member cannot move a slot');
update public.mentor_slots set status = 'cancelled' where id = (select v from _ctx where k = 's1');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'a member cannot cancel a mentor''s slot');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots), 0,
  'a member who is not verified sees no slots');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.mentor_slots $$, '42501', null, 'a signed-out visitor cannot read slots');
reset role; set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentor_slots set status = 'cancelled' where id = (select v from _ctx where k = 's6') $$,
  'a mentor can cancel their own open slot');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where id = (select v from _ctx where k = 's6')), 0,
  'a cancelled slot disappears for other members');

--__GROUP_B__
--__GROUP_C__

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Delete the old test first: `git rm supabase/tests/004_mentor_sessions.test.sql`. Run the new file through `execute_sql` (paste the whole file). Expected: an error such as `relation "public.mentor_profiles" does not exist`. That is the red state.

- [ ] **Step 3: Write migration 1**

Create `supabase/migrations/20261123174737_mentor_availability.sql`:

```sql
-- =============================================================================
-- IIUC Connect — Migration 008: mentor profiles, weekly availability, slots
-- Sprint 6, part 1. Replaces the Sprint 5 slot-booking tables (the hosted
-- database holds no rows in them). Slots are no longer created by hand: a
-- mentor states weekly availability rules and the database generates 30-minute
-- slots 14 days ahead (on rule change, and nightly in migration 010).
-- =============================================================================

-- 0. Retire Sprint 5 objects.
drop table public.mentor_slot_links;
drop table public.mentor_slots;
drop function private.mentor_slots_before_insert();
drop function private.mentor_slots_before_update();
drop function private.mentor_slots_after_insert();
drop function private.mentor_slots_after_update();

create type public.slot_status as enum ('open', 'held', 'booked', 'cancelled');

-- 1. Mentor profile ------------------------------------------------------------
create table public.mentor_profiles (
  id                    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  expertise_areas       text[] not null default '{}',
  bio                   text,
  max_sessions_per_week smallint not null default 3,
  accepting_requests    boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint mentor_profiles_areas check (cardinality(expertise_areas) <= 8),
  constraint mentor_profiles_bio_len check (bio is null or char_length(bio) <= 500),
  constraint mentor_profiles_cap check (max_sessions_per_week between 1 and 10)
);

create trigger mentor_profiles_set_updated_at
  before update on public.mentor_profiles
  for each row execute function private.set_updated_at();

-- 2. Weekly availability rules --------------------------------------------------
-- weekday follows Postgres: 0 = Sunday ... 6 = Saturday, in Bangladesh time.
create table public.mentor_availability_rules (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  weekday    smallint not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),

  constraint rules_weekday check (weekday between 0 and 6),
  constraint rules_order check (start_time < end_time),
  constraint rules_half_hours check (
    extract(minute from start_time)::int % 30 = 0 and extract(second from start_time) = 0
    and extract(minute from end_time)::int % 30 = 0 and extract(second from end_time) = 0
  ),
  constraint rules_window check (end_time - start_time <= interval '8 hours'),
  constraint rules_unique unique (mentor_id, weekday, start_time)
);

-- 3. Slots (generated; 30 minutes each) -----------------------------------------
create table public.mentor_slots (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null references public.profiles (id) on delete cascade,
  starts_at  timestamptz not null,
  status     public.slot_status not null default 'open',
  created_at timestamptz not null default now(),

  constraint mentor_slots_unique unique (mentor_id, starts_at)
);

create index mentor_slots_open_idx on public.mentor_slots (starts_at) where status = 'open';

-- Legal moves. Who may make them is decided by policy and by the request
-- triggers in migration 009; this only forbids the impossible ones.
create function private.mentor_slots_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mentor_id is distinct from old.mentor_id
     or new.starts_at is distinct from old.starts_at then
    raise exception 'a slot cannot be changed once created' using errcode = '22023';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status::text || '>' || new.status::text in
     ('open>held', 'held>open', 'held>booked', 'booked>open', 'open>cancelled') then
    return new;
  end if;
  raise exception 'invalid slot status change: % -> %', old.status, new.status
    using errcode = '22023';
end;
$$;

create trigger mentor_slots_before_update
  before update on public.mentor_slots
  for each row execute function private.mentor_slots_before_update();

-- 4. Slot generation --------------------------------------------------------------
-- Creates 30-minute slots from the rules for the next 14 Bangladesh-time days,
-- only for verified graduates who are taking requests. Safe to run repeatedly.
create function private.generate_slots(p_mentor uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  made integer;
begin
  insert into public.mentor_slots (mentor_id, starts_at)
  select r.mentor_id, ((d.day + t.slot_time)::timestamp at time zone 'Asia/Dhaka')
    from public.mentor_availability_rules r
    join public.mentor_profiles mp on mp.id = r.mentor_id and mp.accepting_requests
    join public.profiles p
      on p.id = r.mentor_id
     and p.affiliation = 'alumni'
     and p.verification_status in ('verified_alumni', 'trusted_member')
    cross join lateral generate_series(
      ((now() at time zone 'Asia/Dhaka')::date)::timestamp,
      ((now() at time zone 'Asia/Dhaka')::date + 14)::timestamp,
      interval '1 day') as g(day_ts)
    cross join lateral (select g.day_ts::date as day) d
    cross join lateral generate_series(
      timestamp '2000-01-01' + r.start_time,
      timestamp '2000-01-01' + r.end_time - interval '30 minutes',
      interval '30 minutes') as s(slot_ts)
    cross join lateral (select s.slot_ts::time as slot_time) t
   where (p_mentor is null or r.mentor_id = p_mentor)
     and extract(dow from d.day)::int = r.weekday
     and ((d.day + t.slot_time)::timestamp at time zone 'Asia/Dhaka')
         between now() + interval '30 minutes' and now() + interval '14 days'
  on conflict (mentor_id, starts_at) do nothing;

  get diagnostics made = row_count;
  return made;
end;
$$;

-- Rule triggers: at most 10 rules, and fresh slots as soon as a rule is saved.
create function private.rules_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.mentor_availability_rules r
       where r.mentor_id = new.mentor_id) > 10 then
    raise exception 'a mentor can have at most 10 availability rules'
      using errcode = '54000';
  end if;
  perform private.generate_slots(new.mentor_id);
  return null;
end;
$$;

-- Removing a rule withdraws that mentor's future open slots inside its window
-- (unless another rule still covers them). Slots are cancelled, not deleted, so
-- any request history on them survives.
create function private.rules_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mentor_slots s
     set status = 'cancelled'
   where s.mentor_id = old.mentor_id
     and s.status = 'open'
     and s.starts_at > now()
     and extract(dow from (s.starts_at at time zone 'Asia/Dhaka'))::int = old.weekday
     and (s.starts_at at time zone 'Asia/Dhaka')::time >= old.start_time
     and (s.starts_at at time zone 'Asia/Dhaka')::time <  old.end_time
     and not exists (
       select 1 from public.mentor_availability_rules r
        where r.mentor_id = old.mentor_id
          and r.weekday = old.weekday
          and (s.starts_at at time zone 'Asia/Dhaka')::time >= r.start_time
          and (s.starts_at at time zone 'Asia/Dhaka')::time <  r.end_time);
  return null;
end;
$$;

create trigger rules_after_insert
  after insert on public.mentor_availability_rules
  for each row execute function private.rules_after_insert();
create trigger rules_after_delete
  after delete on public.mentor_availability_rules
  for each row execute function private.rules_after_delete();

revoke all on function private.mentor_slots_before_update() from public;
revoke all on function private.generate_slots(uuid) from public;
revoke all on function private.rules_after_insert() from public;
revoke all on function private.rules_after_delete() from public;

-- 5. Privileges -----------------------------------------------------------------
revoke all on public.mentor_profiles, public.mentor_availability_rules, public.mentor_slots
  from anon, authenticated;

grant select on public.mentor_profiles to authenticated;
grant insert (expertise_areas, bio, max_sessions_per_week, accepting_requests)
  on public.mentor_profiles to authenticated;
grant update (expertise_areas, bio, max_sessions_per_week, accepting_requests)
  on public.mentor_profiles to authenticated;

grant select, delete on public.mentor_availability_rules to authenticated;
grant insert (weekday, start_time, end_time) on public.mentor_availability_rules to authenticated;

grant select on public.mentor_slots to authenticated;
grant update (status) on public.mentor_slots to authenticated;

-- 6. Row Level Security ----------------------------------------------------------
alter table public.mentor_profiles enable row level security;
alter table public.mentor_availability_rules enable row level security;
alter table public.mentor_slots enable row level security;

create policy mentor_profiles_select
  on public.mentor_profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or (
      (select private.is_verified())
      and exists (select 1 from public.profiles p where p.id = mentor_profiles.id)
    )
  );

create policy mentor_profiles_insert
  on public.mentor_profiles for insert to authenticated
  with check (id = (select auth.uid()) and (select private.is_verified_alumni()));

create policy mentor_profiles_update
  on public.mentor_profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_verified_alumni()))
  with check (id = (select auth.uid()) and (select private.is_verified_alumni()));

create policy rules_select
  on public.mentor_availability_rules for select to authenticated
  using (mentor_id = (select auth.uid()) or (select private.is_admin()));

create policy rules_insert
  on public.mentor_availability_rules for insert to authenticated
  with check (
    mentor_id = (select auth.uid())
    and (select private.is_verified_alumni())
    and exists (select 1 from public.mentor_profiles mp where mp.id = (select auth.uid()))
  );

create policy rules_delete
  on public.mentor_availability_rules for delete to authenticated
  using (mentor_id = (select auth.uid()));

-- The mentor, an admin, anyone who has a request on the slot (added in 009), or
-- a verified member for an open future slot of a mentor whose profile they may read.
create policy mentor_slots_select
  on public.mentor_slots for select to authenticated
  using (
    mentor_id = (select auth.uid())
    or (select private.is_admin())
    or (
      status = 'open'
      and starts_at > now()
      and (select private.is_verified())
      and exists (select 1 from public.profiles p where p.id = mentor_slots.mentor_id)
    )
  );

-- A mentor may only cancel their own open slot (held and booked slots move
-- through requests).
create policy mentor_slots_update
  on public.mentor_slots for update to authenticated
  using (mentor_id = (select auth.uid()) and status = 'open')
  with check (mentor_id = (select auth.uid()) and status = 'cancelled');

```

- [ ] **Step 4: Apply and run the tests green**

Apply with `apply_migration` (name `mentor_availability`). Run `list_migrations`, rename the local file to the reported version. Re-run the whole test file with `execute_sql`. Expected: the final select returns only `1..N` and `# Looks like you passed all N tests.` style lines, with no `not ok`. Fix any failure in the migration, not the test, unless the test is wrong.

- [ ] **Step 5: Advisors and commit**

Run `get_advisors` for security and performance; expect 0 security findings. Then:

```bash
git add supabase/migrations supabase/tests
git commit -m "Sprint 6 database: mentor profiles, weekly availability, generated slots

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Migration 2, requests, sessions, feedback

**Files:**
- Modify: `supabase/tests/005_mentorship.test.sql` (replace the `--__GROUP_B__` marker)
- Create: `supabase/migrations/20261123190000_mentorship_requests.sql` (rename to the applied version)

**Interfaces:**
- Consumes: everything Task 2 produced; `_ctx` keys `s1`–`s8`, `c1`–`c4`; `public._as(int)`.
- Produces: enums `request_status`, `session_status`; tables `mentorship_requests(id, slot_id, mentee_id, mentor_id, duration_minutes, goal, question_1, question_2, status, meeting_url, expires_at, responded_at)`, `sessions(id, request_id, mentor_id, mentee_id, starts_at, duration_minutes, meeting_url, status, outcome_at)`, `session_feedback(id, session_id, reviewer_id, reviewee_id, rating, comment)`; trigger name `sessions_before_update` (the tests disable it to move time); function `private.feedback_revealed(uuid)`.

- [ ] **Step 1: Write group B (red)**

In `supabase/tests/005_mentorship.test.sql` replace the line `--__GROUP_B__` with:

```sql
-- -----------------------------------------------------------------------------
-- B. Requests, responses, sessions, feedback
-- -----------------------------------------------------------------------------
reset role;
insert into _ctx (k, v) select 'p1', id from public.mentor_slots
 where mentor_id = 'a6000000-0000-4000-8000-000000000005';
set local role authenticated;

-- Requesting
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?') $$,
  'a verified student can request an open slot');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'held',
  'the slot is held while the request is pending');

select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'short', 'What now?') $$,
  '23514', null, 'a goal under 10 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'hi') $$,
  '23514', null, 'a first question under 5 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 45, 'A proper goal here', 'A real question?') $$,
  '23514', null, 'only 15, 20 and 30 minute sessions are allowed');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 15, 'A proper goal here', 'A real question?') $$,
  '22023', null, 'a slot that is already held cannot be requested');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     select (select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?' from generate_series(1, 2) $$,
  '23505', null, 'one statement cannot hold the same slot twice');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 'p1'), 15, 'A proper goal here', 'A real question?') $$,
  '42501', null, 'a private mentor''s slot cannot be requested even with its id');

select public._as(4);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?') $$,
  '42501', null, 'a member who is not verified cannot request');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's3'), 15, 'A proper goal here', 'A real question?') $$,
  '22023', null, 'a mentor cannot request their own slot');

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?') $$,
  '23505', null, 'one pending request per mentee and mentor pair');

-- Who sees requests
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 0, 'another member sees no requests');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 1, 'the mentee sees their request');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 1, 'the mentor sees the request addressed to them');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 0, 'a member who is not verified sees no requests');
select public._as(6);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentorship_requests) >= 1, 'an admin sees requests');

-- Edits and forbidden moves
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set goal = 'Changed my mind about it' $$,
  '42501', null, 'a request''s goal cannot be edited');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/x' $$,
  '22023', null, 'a mentee cannot accept their own request (the state machine refuses)');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted' $$,
  '23514', null, 'accepting needs a meeting link');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'http://meet.example/x' $$,
  '23514', null, 'the meeting link must use https');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'expired' $$,
  '22023', null, 'a member cannot expire a request (the state machine refuses)');

-- The same two moves with the trigger switched off: the policy must refuse them alone.
reset role;
alter table public.mentorship_requests disable trigger requests_before_update;
set local role authenticated;
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/x' $$,
  '42501', null, 'the policy alone refuses a mentee accepting their own request');
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'expired' $$,
  '42501', null, 'the policy alone refuses a member expiring a request');
reset role;
alter table public.mentorship_requests enable trigger requests_before_update;
set local role authenticated;

-- Cancel, re-request, accept
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'pending' $$,
  'a mentee can cancel a pending request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'cancelling reopens the slot');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?') $$,
  'the slot can be requested again');

select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-1'
      where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000002' $$,
  'the mentor can accept with a meeting link');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'booked',
  'accepting books the slot');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.sessions where status = 'scheduled'), 1,
  'accepting creates a scheduled session');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select meeting_url from public.mentorship_requests where status = 'accepted'), 'https://meet.example/room-1',
  'the mentee can read the meeting link once accepted');
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.sessions), 0, 'another member cannot see the session');

-- Cancelling an accepted request
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'accepted' $$,
  'a mentee can cancel an accepted request before it starts');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select status::text from public.sessions order by created_at limit 1), 'cancelled',
  'cancelling cancels the session');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'cancelling an accepted request reopens the slot');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests where meeting_url is not null), 0,
  'the meeting link is cleared on cancellation');

-- Second session on s1: Sam requests again, Mona accepts
select public._as(2);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-2'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000002';

-- Declining and invalid transitions
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'declined' where status = 'pending' $$,
  'a mentor can decline a request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's2')), 'open',
  'declining reopens the slot');
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/late' where status = 'declined';
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests where status = 'declined'), 1,
  'a declined request cannot be accepted afterwards');
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000003' $$,
  '22023', null, 'only the mentee can cancel a pending request');
select public._as(3);
update public.mentorship_requests set status = 'cancelled' where status = 'pending';

-- Sessions: closing them
reset role;
insert into _ctx (k, v) select 'sess2', id from public.sessions where status = 'scheduled';
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2') $$,
  '22023', null, 'a session cannot be closed before it ends');
reset role;
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess2');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(2);
update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.sessions where id = (select v from _ctx where k = 'sess2')), 'scheduled',
  'a mentee cannot close the session');
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2') $$,
  'the mentor can mark a finished session completed');
insert into _tap_out (line) select extensions.ok(
  (select outcome_at is not null from public.sessions where id = (select v from _ctx where k = 'sess2')),
  'closing a session records when');

-- A no-show session (Sue on s2)
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-3'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000003';
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.sessions set status = 'cancelled' where status = 'scheduled' $$,
  '42501', null, 'a member cannot cancel a session directly');
reset role;
insert into _ctx (k, v) select 'sess3', id from public.sessions where status = 'scheduled';
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess3');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.sessions set status = 'no_show' where id = (select v from _ctx where k = 'sess3') $$,
  'the mentor can mark a no-show');

-- Feedback
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess3'), 4) $$,
  '22023', null, 'a no-show session cannot be rated');
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 6) $$,
  '23514', null, 'a rating above 5 is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.session_feedback (session_id, rating, comment) values ((select v from _ctx where k = 'sess2'), 5, 'Very helpful') $$,
  'the mentee can rate a completed session');
insert into _tap_out (line) select extensions.is(
  (select reviewee_id from public.session_feedback), 'a6000000-0000-4000-8000-000000000001'::uuid,
  'the rating is about the other person in the session');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4) $$,
  '23505', null, 'one rating per person per session');
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4) $$,
  '22023', null, 'someone outside the session cannot rate it');

select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 0,
  'the mentor cannot see the rating before rating back');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 1, 'a reviewer always sees their own rating');
select public._as(1);
insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 2, 'once both have rated, the mentor sees both');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 2, 'once both have rated, the mentee sees both');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.session_feedback set rating = 1 $$, '42501', null, 'ratings cannot be edited');
insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.session_feedback $$, '42501', null, 'ratings cannot be deleted');

-- Reveal after 7 days (Stu12 on s5)
select public._as(12);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's5'), 30, 'Mock interview practice', 'How do I explain gaps?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-4'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000012';
reset role;
insert into _ctx (k, v) select 'sess4', id from public.sessions where status = 'scheduled';
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess4');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess4');
select public._as(12);
insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess4'), 5);
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback where session_id = (select v from _ctx where k = 'sess4')), 0,
  'a rating stays hidden from the other person while only one has rated');
reset role;
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set outcome_at = now() - interval '8 days' where id = (select v from _ctx where k = 'sess4');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback where session_id = (select v from _ctx where k = 'sess4')), 1,
  'a rating is revealed 7 days after the session even if the other has not rated');

select public._as(6);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.sessions) >= 3 and (select count(*) from public.session_feedback) >= 3,
  'an admin sees all sessions and ratings');

-- Limits that one statement must not slip past
select public._as(14);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     select id, 15, 'A proper goal here', 'A real question?' from public.mentor_slots
      where mentor_id in ('a6000000-0000-4000-8000-000000000007', 'a6000000-0000-4000-8000-000000000008',
                          'a6000000-0000-4000-8000-000000000009', 'a6000000-0000-4000-8000-000000000010') $$,
  '54000', null, 'one statement cannot give a member more than 3 live requests');

reset role;
insert into public.mentorship_requests (slot_id, mentee_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'c1'), 'a6000000-0000-4000-8000-000000000002', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c2'), 'a6000000-0000-4000-8000-000000000003', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c3'), 'a6000000-0000-4000-8000-000000000012', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c4'), 'a6000000-0000-4000-8000-000000000013', 15, 'A proper goal here', 'A real question?');
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/cap'
      where slot_id in (select v from _ctx where k like 'c%') $$,
  '54000', null, 'one statement cannot accept past the weekly cap');
```

- [ ] **Step 2: Run it to see it fail**

Run the file through `execute_sql`. Expected: failure at the first `mentorship_requests` insert (`relation … does not exist`).

- [ ] **Step 3: Write migration 2**

Create `supabase/migrations/20261123190000_mentorship_requests.sql` with exactly this content:

```sql
-- =============================================================================
-- IIUC Connect — Migration 009: mentorship requests, sessions, feedback
-- Sprint 6, part 2. A mentee requests an open slot with a goal and questions;
-- the mentor accepts (with a meeting link) or declines; unanswered requests
-- expire (migration 010). Accepting books the slot and creates a session; the
-- mentor then closes it as completed or no-show; each side rates the other.
--
-- Same approach as Sprints 3 and 5: members write under RLS and column grants,
-- triggers enforce the state machines, and SECURITY DEFINER triggers do the
-- effects on other tables. Counts that limit a statement run in AFTER triggers.
-- =============================================================================

create type public.request_status as enum ('pending', 'accepted', 'declined', 'expired', 'cancelled');
create type public.session_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');

-- 1. Requests ----------------------------------------------------------------------
-- mentor_id, expires_at and (on feedback) reviewee_id are overwritten by
-- triggers; their defaults exist only so generated insert types do not demand
-- values the client must not choose.
create table public.mentorship_requests (
  id               uuid primary key default gen_random_uuid(),
  slot_id          uuid not null references public.mentor_slots (id) on delete cascade,
  mentee_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mentor_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  duration_minutes smallint not null,
  goal             text not null,
  question_1       text not null,
  question_2       text,
  status           public.request_status not null default 'pending',
  meeting_url      text,
  expires_at       timestamptz not null default now() + interval '72 hours',
  responded_at     timestamptz,
  created_at       timestamptz not null default now(),

  constraint requests_duration check (duration_minutes in (15, 20, 30)),
  constraint requests_goal_len check (char_length(btrim(goal)) between 10 and 500),
  constraint requests_q1_len check (char_length(btrim(question_1)) between 5 and 300),
  constraint requests_q2_len check (question_2 is null or char_length(btrim(question_2)) between 5 and 300),
  constraint requests_link_https check (
    meeting_url is null
    or (char_length(meeting_url) <= 300 and meeting_url ~* '^https://[^[:space:]]+$')
  ),
  constraint requests_link_iff_accepted check ((status = 'accepted') = (meeting_url is not null)),
  constraint requests_not_self check (mentee_id <> mentor_id)
);

create unique index requests_one_pending_per_pair
  on public.mentorship_requests (mentee_id, mentor_id) where status = 'pending';
create unique index requests_one_live_per_slot
  on public.mentorship_requests (slot_id) where status in ('pending', 'accepted');
create index requests_mentee_idx on public.mentorship_requests (mentee_id, status);
create index requests_mentor_idx on public.mentorship_requests (mentor_id, status);
create index requests_slot_idx on public.mentorship_requests (slot_id);
create index requests_expiry_idx on public.mentorship_requests (expires_at) where status = 'pending';

-- 2. Sessions ----------------------------------------------------------------------
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique references public.mentorship_requests (id) on delete cascade,
  mentor_id        uuid not null references public.profiles (id) on delete cascade,
  mentee_id        uuid not null references public.profiles (id) on delete cascade,
  starts_at        timestamptz not null,
  duration_minutes smallint not null,
  meeting_url      text not null,
  status           public.session_status not null default 'scheduled',
  outcome_at       timestamptz,
  created_at       timestamptz not null default now(),

  constraint sessions_outcome_iff_closed check ((status in ('completed', 'no_show')) = (outcome_at is not null))
);

create index sessions_mentor_idx on public.sessions (mentor_id, starts_at);
create index sessions_mentee_idx on public.sessions (mentee_id, starts_at);

-- 3. Feedback ----------------------------------------------------------------------
create table public.session_feedback (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reviewee_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating      smallint not null,
  comment     text,
  created_at  timestamptz not null default now(),

  constraint feedback_rating check (rating between 1 and 5),
  constraint feedback_comment_len check (comment is null or char_length(comment) <= 500),
  constraint feedback_one_each unique (session_id, reviewer_id)
);

create index feedback_reviewee_idx on public.session_feedback (reviewee_id);

-- 4. Request triggers ---------------------------------------------------------------
create function private.requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.mentor_slots%rowtype;
begin
  -- Lock the slot so two requests for it are decided one after the other.
  select * into s from public.mentor_slots where id = new.slot_id for update;
  if not found or s.status <> 'open' or s.starts_at < now() + interval '30 minutes' then
    raise exception 'that slot is not available' using errcode = '22023';
  end if;
  if s.mentor_id = new.mentee_id then
    raise exception 'you cannot request your own slot' using errcode = '22023';
  end if;
  if not exists (select 1 from public.mentor_profiles mp
                  where mp.id = s.mentor_id and mp.accepting_requests) then
    raise exception 'this mentor is not taking requests' using errcode = '22023';
  end if;

  new.mentor_id    := s.mentor_id;
  new.status       := 'pending';
  new.meeting_url  := null;
  new.responded_at := null;
  new.expires_at   := least(now() + interval '72 hours', s.starts_at);
  return new;
end;
$$;

create function private.requests_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mentor_slots set status = 'held' where id = new.slot_id;

  if (select count(*)
        from public.mentorship_requests r
        join public.mentor_slots s on s.id = r.slot_id
       where r.mentee_id = new.mentee_id
         and r.status in ('pending', 'accepted')
         and s.starts_at > now()) > 3 then
    raise exception 'a member can have at most 3 live requests' using errcode = '54000';
  end if;
  return null;
end;
$$;

-- The state machine. Policy decides who may attempt a change; this decides what
-- is legal and who is allowed to make each move.
create function private.requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  s public.mentor_slots%rowtype;
  move text := old.status::text || '>' || new.status::text;
begin
  if new.slot_id is distinct from old.slot_id
     or new.mentee_id is distinct from old.mentee_id
     or new.mentor_id is distinct from old.mentor_id
     or new.goal is distinct from old.goal
     or new.question_1 is distinct from old.question_1
     or new.question_2 is distinct from old.question_2
     or new.duration_minutes is distinct from old.duration_minutes then
    raise exception 'a request cannot be edited' using errcode = '22023';
  end if;

  if new.status = old.status then
    if new.meeting_url is distinct from old.meeting_url then
      raise exception 'the link can only change with the status' using errcode = '22023';
    end if;
    return new;
  end if;

  select * into s from public.mentor_slots where id = old.slot_id;

  if move = 'pending>accepted' then
    if actor is distinct from old.mentor_id then
      raise exception 'only the mentor can accept' using errcode = '22023';
    end if;
    if old.expires_at <= now() then
      raise exception 'this request has expired' using errcode = '22023';
    end if;
    new.responded_at := now();
  elsif move = 'pending>declined' then
    if actor is distinct from old.mentor_id then
      raise exception 'only the mentor can decline' using errcode = '22023';
    end if;
    new.responded_at := now();
  elsif move = 'pending>cancelled' then
    if actor is distinct from old.mentee_id then
      raise exception 'only the mentee can cancel a pending request' using errcode = '22023';
    end if;
    new.responded_at := now();
  elsif move = 'pending>expired' then
    -- Only the scheduled job (no signed-in user) may expire a request.
    if actor is not null or old.expires_at > now() then
      raise exception 'a request can only expire by the scheduled job after its time' using errcode = '22023';
    end if;
    new.responded_at := now();
  elsif move = 'accepted>cancelled' then
    if actor is distinct from old.mentor_id and actor is distinct from old.mentee_id then
      raise exception 'only the mentor or mentee can cancel' using errcode = '22023';
    end if;
    if s.starts_at <= now() then
      raise exception 'a session that has started cannot be cancelled' using errcode = '22023';
    end if;
    new.meeting_url := null;
  else
    raise exception 'invalid request status change: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create function private.requests_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return null;
  end if;

  if new.status = 'accepted' then
    update public.mentor_slots set status = 'booked' where id = new.slot_id;

    insert into public.sessions (request_id, mentor_id, mentee_id, starts_at, duration_minutes, meeting_url)
    select new.id, new.mentor_id, new.mentee_id, s.starts_at, new.duration_minutes, new.meeting_url
      from public.mentor_slots s where s.id = new.slot_id;

    -- Weekly cap, counted after the whole statement so it sees every row.
    if (select count(*)
          from public.mentorship_requests r
          join public.mentor_slots rs on rs.id = r.slot_id
          join public.mentor_slots ns on ns.id = new.slot_id
         where r.mentor_id = new.mentor_id
           and r.status = 'accepted'
           and date_trunc('week', rs.starts_at at time zone 'Asia/Dhaka')
             = date_trunc('week', ns.starts_at at time zone 'Asia/Dhaka'))
       > (select mp.max_sessions_per_week from public.mentor_profiles mp where mp.id = new.mentor_id) then
      raise exception 'the mentor has reached their weekly session limit' using errcode = '54000';
    end if;

  elsif old.status = 'accepted' then
    update public.sessions set status = 'cancelled' where request_id = new.id;
    update public.mentor_slots set status = 'open' where id = new.slot_id and starts_at > now();

  else
    update public.mentor_slots set status = 'open' where id = new.slot_id and starts_at > now();
  end if;

  return null;
end;
$$;

create trigger requests_before_insert before insert on public.mentorship_requests
  for each row execute function private.requests_before_insert();
create trigger requests_after_insert after insert on public.mentorship_requests
  for each row execute function private.requests_after_insert();
create trigger requests_before_update before update on public.mentorship_requests
  for each row execute function private.requests_before_update();
create trigger requests_after_update after update on public.mentorship_requests
  for each row execute function private.requests_after_update();

-- 5. Session and feedback triggers ---------------------------------------------------
create function private.sessions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_id is distinct from old.request_id
     or new.mentor_id is distinct from old.mentor_id
     or new.mentee_id is distinct from old.mentee_id
     or new.starts_at is distinct from old.starts_at
     or new.duration_minutes is distinct from old.duration_minutes
     or new.meeting_url is distinct from old.meeting_url
     or new.outcome_at is distinct from old.outcome_at then
    raise exception 'a session cannot be edited' using errcode = '22023';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status in ('completed', 'no_show') then
    if now() < old.starts_at + (old.duration_minutes || ' minutes')::interval then
      raise exception 'a session can be closed only after it ends' using errcode = '22023';
    end if;
    new.outcome_at := now();
  elsif old.status = 'scheduled' and new.status = 'cancelled' then
    null;
  else
    raise exception 'invalid session status change: % -> %', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger sessions_before_update before update on public.sessions
  for each row execute function private.sessions_before_update();

create function private.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = new.session_id;
  if not found or s.status <> 'completed' then
    raise exception 'only a completed session can be rated' using errcode = '22023';
  end if;
  if new.reviewer_id = s.mentor_id then
    new.reviewee_id := s.mentee_id;
  elsif new.reviewer_id = s.mentee_id then
    new.reviewee_id := s.mentor_id;
  else
    raise exception 'only the mentor or mentee can rate a session' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger feedback_before_insert before insert on public.session_feedback
  for each row execute function private.feedback_before_insert();

-- A rating about you is visible once both people have rated, or 7 days after the
-- session closed. Definer, so it can count rows the caller's policy would hide.
create function private.feedback_revealed(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session
       and (
         (select count(*) from public.session_feedback f where f.session_id = s.id) >= 2
         or now() >= s.outcome_at + interval '7 days'
       )
  );
$$;

revoke all on function private.requests_before_insert() from public;
revoke all on function private.requests_after_insert() from public;
revoke all on function private.requests_before_update() from public;
revoke all on function private.requests_after_update() from public;
revoke all on function private.sessions_before_update() from public;
revoke all on function private.feedback_before_insert() from public;
revoke all on function private.feedback_revealed(uuid) from public;
grant execute on function private.feedback_revealed(uuid) to authenticated;

-- 6. Privileges ----------------------------------------------------------------------
revoke all on public.mentorship_requests, public.sessions, public.session_feedback
  from anon, authenticated;

grant select on public.mentorship_requests to authenticated;
grant insert (slot_id, duration_minutes, goal, question_1, question_2)
  on public.mentorship_requests to authenticated;
grant update (status, meeting_url) on public.mentorship_requests to authenticated;

grant select on public.sessions to authenticated;
grant update (status) on public.sessions to authenticated;

grant select on public.session_feedback to authenticated;
grant insert (session_id, rating, comment) on public.session_feedback to authenticated;

-- 7. Row Level Security ----------------------------------------------------------------
alter table public.mentorship_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.session_feedback enable row level security;

create policy requests_select
  on public.mentorship_requests for select to authenticated
  using (
    mentee_id = (select auth.uid())
    or mentor_id = (select auth.uid())
    or (select private.is_admin())
  );

-- The slot must be visible to the requester (so a private mentor's slot cannot
-- be requested by guessing its id); status is forced to pending by the trigger.
create policy requests_insert
  on public.mentorship_requests for insert to authenticated
  with check (
    mentee_id = (select auth.uid())
    and status = 'pending'
    and (select private.is_verified())
    and exists (select 1 from public.mentor_slots s where s.id = slot_id)
  );

create policy requests_update
  on public.mentorship_requests for update to authenticated
  using (
    (mentor_id = (select auth.uid()) and status in ('pending', 'accepted'))
    or (mentee_id = (select auth.uid()) and status in ('pending', 'accepted'))
  )
  with check (
    (mentor_id = (select auth.uid()) and status in ('accepted', 'declined', 'cancelled'))
    or (mentee_id = (select auth.uid()) and status = 'cancelled')
  );

create policy sessions_select
  on public.sessions for select to authenticated
  using (
    mentor_id = (select auth.uid())
    or mentee_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy sessions_update
  on public.sessions for update to authenticated
  using (mentor_id = (select auth.uid()) and status = 'scheduled')
  with check (mentor_id = (select auth.uid()) and status in ('completed', 'no_show'));

create policy feedback_select
  on public.session_feedback for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or (select private.is_admin())
    or (reviewee_id = (select auth.uid()) and (select private.feedback_revealed(session_id)))
  );

create policy feedback_insert
  on public.session_feedback for insert to authenticated
  with check (reviewer_id = (select auth.uid()));

-- A mentee must see the slot they asked for even after it stops being open.
drop policy mentor_slots_select on public.mentor_slots;
create policy mentor_slots_select
  on public.mentor_slots for select to authenticated
  using (
    mentor_id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.mentorship_requests r
       where r.slot_id = mentor_slots.id and r.mentee_id = (select auth.uid())
    )
    or (
      status = 'open'
      and starts_at > now()
      and (select private.is_verified())
      and exists (select 1 from public.profiles p where p.id = mentor_slots.mentor_id)
    )
  );
```

- [ ] **Step 4: Apply and run the tests green**

Apply with `apply_migration` (name `mentorship_requests`), rename the local file to the reported version, re-run the whole test file. Expected: no `not ok` lines. For each failure decide whether the migration or the test is wrong, and fix that one; never weaken an assertion to pass.

- [ ] **Step 5: Advisors and commit**

`get_advisors` security and performance (expect 0 security findings; unused-index INFO is expected). Then:

```bash
git add supabase/migrations supabase/tests
git commit -m "Sprint 6 database: mentorship requests, sessions, blind feedback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Migration 3, scheduled jobs, and lock the test count

**Files:**
- Modify: `supabase/tests/005_mentorship.test.sql` (replace the `--__GROUP_C__` marker; set the plan count)
- Create: `supabase/migrations/20261123200000_mentorship_jobs.sql` (rename to the applied version)

**Interfaces:**
- Consumes: `public.mentorship_requests`, `private.generate_slots(uuid)`, the extension statement proven in Task 1.
- Produces: `private.expire_requests() returns integer`; cron jobs `expire-mentorship-requests` (every 15 minutes) and `generate-mentor-slots` (20:00 UTC = 02:00 Bangladesh time).

- [ ] **Step 1: Write group C (red)**

Replace the line `--__GROUP_C__` in the test file with:

```sql
-- -----------------------------------------------------------------------------
-- C. Scheduled jobs and rule removal
-- -----------------------------------------------------------------------------
reset role;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from cron.job
    where jobname in ('expire-mentorship-requests', 'generate-mentor-slots')), 2,
  'both scheduled jobs exist');

set local role authenticated;
select public._as(14);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's7'), 15, 'A proper goal here', 'A real question?');
insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.expire_requests() $$, '42501', null, 'a member cannot run the expiry job');

reset role;
select set_config('request.jwt.claims', '', true);   -- the job runs with no signed-in user
update public.mentorship_requests set expires_at = now() - interval '1 minute'
 where mentee_id = 'a6000000-0000-4000-8000-000000000014';
insert into _tap_out (line) select extensions.is(
  (select private.expire_requests()), 1, 'the job expires the one overdue request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentorship_requests where mentee_id = 'a6000000-0000-4000-8000-000000000014'),
  'expired', 'the request is marked expired');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's7')), 'open',
  'expiry reopens the slot');

set local role authenticated;
select public._as(1);
delete from public.mentor_availability_rules;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status = 'open' and starts_at > now()),
  0, 'removing every rule withdraws the open slots');
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status in ('held', 'booked')) > 0,
  'slots that already have a request stay');
```

- [ ] **Step 2: Run it to see it fail**

Expected: the first assertion is `not ok` (no such cron jobs) or the run errors on `private.expire_requests()` not existing.

- [ ] **Step 3: Write migration 3**

Create `supabase/migrations/20261123200000_mentorship_jobs.sql`. Use the `create extension` line that worked in Task 1 (shown here as the Supabase default):

```sql
-- =============================================================================
-- IIUC Connect — Migration 010: scheduled mentorship jobs (pg_cron)
-- Sprint 6, part 3. Expiry and nightly slot generation run inside the database.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Marks pending requests whose time is up as expired. The request trigger lets
-- only a caller with no signed-in user make this move; its AFTER trigger then
-- reopens the slot.
create function private.expire_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.mentorship_requests
     set status = 'expired'
   where status = 'pending' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.expire_requests() from public;

select cron.schedule(
  'expire-mentorship-requests', '*/15 * * * *', 'select private.expire_requests()');
select cron.schedule(
  'generate-mentor-slots', '0 20 * * *', 'select private.generate_slots(null)');
```

- [ ] **Step 4: Apply, then fix the plan count and run green**

Apply with `apply_migration` (name `mentorship_jobs`), rename the file. Then lock the count: run `grep -c "insert into _tap_out" supabase/tests/005_mentorship.test.sql` and call the number N. In the test file replace the line `select extensions.no_plan();` with `insert into _tap_out (line) select extensions.plan(N);`. Run the whole file. Expected: no `not ok` and no "planned N but ran M" line. If the counts differ, an assertion silently did not run: find it.

- [ ] **Step 5: Mutation check, prove the tests can fail**

In a scratch copy of the test (not the file), prove one rule can fail: wrap a `begin; … rollback;` call that re-creates `private.requests_after_update()` with the weekly-cap comparison changed to `> 99`, then run only the weekly-cap assertion. Expected: that assertion is `not ok`. Record the result in the evidence file; this is the negative control (see D-016).

- [ ] **Step 6: Advisors and commit**

`get_advisors` (security 0; performance only unused-index INFO). Then:

```bash
git add supabase/migrations supabase/tests
git commit -m "Sprint 6 database: scheduled expiry and slot generation, complete test file

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Move `lib/sessions` to `lib/mentorship`, regenerate types

**Files:**
- Move: `lib/sessions/` to `lib/mentorship/`
- Create: `lib/mentorship/time.ts`, `lib/mentorship/time.test.ts`
- Delete: `lib/mentorship/slot.ts`, `lib/mentorship/slot.test.ts`
- Modify: `types/database.types.ts`

**Interfaces:**
- Produces: `formatDhaka(iso: string): string`, `isHttpsLink(value: string): boolean` from `@/lib/mentorship/time`.

- [ ] **Step 1: Move the folder**

```bash
git mv lib/sessions lib/mentorship
```

- [ ] **Step 2: Write the failing test**

Create `lib/mentorship/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatDhaka, isHttpsLink } from "@/lib/mentorship/time";

describe("formatDhaka", () => {
  it("shows the day and time in Bangladesh time", () => {
    expect(formatDhaka("2026-12-01T09:30:00.000Z")).toMatch(
      /Tue.*1 Dec.*3:30\s?pm/i,
    );
  });

  it("rolls over to the next local day", () => {
    expect(formatDhaka("2026-11-30T20:15:00.000Z")).toMatch(
      /Tue.*1 Dec.*2:15\s?am/i,
    );
  });
});

describe("isHttpsLink", () => {
  it("accepts an https link", () => {
    expect(isHttpsLink("https://meet.example.com/abc-def")).toBe(true);
  });

  it.each([
    "http://meet.example.com/abc",
    "ftp://meet.example.com/abc",
    "javascript:alert(1)",
    "meet.example.com/abc",
    "https://",
    "https://meet.example.com/a b",
    `https://meet.example.com/${"a".repeat(300)}`,
    "https://user:pass@meet.example.com/abc",
    "",
  ])("rejects %j", (value) => {
    expect(isHttpsLink(value)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run lib/mentorship/time.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/mentorship/time"`.

- [ ] **Step 4: Write `lib/mentorship/time.ts` and delete the old slot files**

```ts
/** "Tue 1 Dec, 3:30 pm" in Bangladesh time, whatever the server's own zone. */
export function formatDhaka(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  });
}

/** An https link with a host, no spaces, no credentials, at most 300 characters. */
export function isHttpsLink(value: string): boolean {
  if (value.length > 300 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
```

```bash
git rm -q lib/mentorship/slot.ts lib/mentorship/slot.test.ts
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run lib/mentorship/time.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Regenerate the database types**

Call the Supabase `generate_typescript_types` tool for project `zhogqnudiosaqihzvkiq` and write its output to `types/database.types.ts`. Run `npm run typecheck`. Expected: errors only in `app/(app)/sessions/*` and `app/(app)/members/[id]/page.tsx` (they still use the old slot tables and `lib/sessions/*`). Those are fixed in Tasks 7 and 8; do not fix them here.

- [ ] **Step 7: Commit**

```bash
git add lib types
git commit -m "Move session helpers to lib/mentorship, regenerate database types

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Zod schemas and form state

**Files:**
- Create: `lib/mentorship/schemas.ts`, `lib/mentorship/schemas.test.ts`
- Modify: `lib/mentorship/form-state.ts`

**Interfaces:**
- Consumes: `isHttpsLink` from `@/lib/mentorship/time`.
- Produces (all from `@/lib/mentorship/schemas`): `WEEKDAYS`, `DURATIONS`, `TIME_OPTIONS`, `idSchema`, `ruleSchema` (parses `{weekday, startTime, endTime}` into `{weekday: number, start_time: string, end_time: string}`), `mentorProfileSchema` (`{expertiseAreas, bio, maxSessions, accepting}` into `{expertise_areas: string[], bio: string | null, max_sessions_per_week: number, accepting_requests: boolean}`), `requestSchema` (`{slotId, duration, goal, question1, question2}` into `{slot_id, duration_minutes: number, goal, question_1, question_2: string | null}`), `respondSchema` (`{requestId, decision, meetingUrl}`, output keeps those names with `meetingUrl: string | null`), `outcomeSchema` (`{sessionId, outcome}`), `feedbackSchema` (`{sessionId, rating, comment}` into `{session_id, rating: number, comment: string | null}`). From `@/lib/mentorship/form-state`: `MentorshipField`, `MentorshipFormState`.

- [ ] **Step 1: Write the failing tests**

Create `lib/mentorship/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  TIME_OPTIONS,
  feedbackSchema,
  mentorProfileSchema,
  outcomeSchema,
  requestSchema,
  respondSchema,
  ruleSchema,
} from "@/lib/mentorship/schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("TIME_OPTIONS", () => {
  it("lists every half hour of the day", () => {
    expect(TIME_OPTIONS).toHaveLength(48);
    expect(TIME_OPTIONS[0]).toBe("00:00");
    expect(TIME_OPTIONS[19]).toBe("09:30");
    expect(TIME_OPTIONS[47]).toBe("23:30");
  });
});

describe("ruleSchema", () => {
  it("accepts a weekday window and returns database columns", () => {
    expect(
      ruleSchema.parse({ weekday: "2", startTime: "09:00", endTime: "11:30" }),
    ).toEqual({ weekday: 2, start_time: "09:00", end_time: "11:30" });
  });

  it.each([
    [{ weekday: "7", startTime: "09:00", endTime: "10:00" }],
    [{ weekday: "-1", startTime: "09:00", endTime: "10:00" }],
    [{ weekday: "1", startTime: "09:15", endTime: "10:00" }],
    [{ weekday: "1", startTime: "10:00", endTime: "09:00" }],
    [{ weekday: "1", startTime: "10:00", endTime: "10:00" }],
    [{ weekday: "1", startTime: "08:00", endTime: "17:00" }],
    [{ weekday: null, startTime: null, endTime: null }],
  ])("rejects %j", (input) => {
    expect(ruleSchema.safeParse(input).success).toBe(false);
  });

  it("accepts exactly 8 hours", () => {
    expect(
      ruleSchema.safeParse({ weekday: "1", startTime: "08:00", endTime: "16:00" })
        .success,
    ).toBe(true);
  });
});

describe("mentorProfileSchema", () => {
  const valid = {
    expertiseAreas: " backend, SQL ,backend ",
    bio: "  Ten years in fintech.  ",
    maxSessions: "3",
    accepting: "on",
  };

  it("splits, trims and de-duplicates areas", () => {
    expect(mentorProfileSchema.parse(valid)).toEqual({
      expertise_areas: ["backend", "SQL"],
      bio: "Ten years in fintech.",
      max_sessions_per_week: 3,
      accepting_requests: true,
    });
  });

  it("treats a missing checkbox as not accepting, and a blank bio as null", () => {
    const parsed = mentorProfileSchema.parse({
      ...valid,
      bio: "  ",
      accepting: null,
    });
    expect(parsed.accepting_requests).toBe(false);
    expect(parsed.bio).toBeNull();
  });

  it.each(["0", "11", "abc", "", "2.5"])("rejects a weekly cap of %j", (maxSessions) => {
    expect(mentorProfileSchema.safeParse({ ...valid, maxSessions }).success).toBe(false);
  });

  it("rejects more than 8 areas and areas over 40 characters", () => {
    expect(
      mentorProfileSchema.safeParse({ ...valid, expertiseAreas: "a,b,c,d,e,f,g,h,i" }).success,
    ).toBe(false);
    expect(
      mentorProfileSchema.safeParse({ ...valid, expertiseAreas: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("rejects a bio over 500 characters", () => {
    expect(mentorProfileSchema.safeParse({ ...valid, bio: "x".repeat(501) }).success).toBe(false);
  });
});

describe("requestSchema", () => {
  const valid = {
    slotId: id,
    duration: "20",
    goal: "  Learn how to land a backend job  ",
    question1: "What should I build first?",
    question2: null,
  };

  it("returns database columns and a null second question", () => {
    expect(requestSchema.parse(valid)).toEqual({
      slot_id: id,
      duration_minutes: 20,
      goal: "Learn how to land a backend job",
      question_1: "What should I build first?",
      question_2: null,
    });
  });

  it("keeps a real second question and drops a blank one", () => {
    expect(requestSchema.parse({ ...valid, question2: " Any tips? " }).question_2).toBe("Any tips?");
    expect(requestSchema.parse({ ...valid, question2: "   " }).question_2).toBeNull();
  });

  it.each([
    { slotId: "nope" },
    { duration: "45" },
    { duration: "" },
    { goal: "short" },
    { goal: "x".repeat(501) },
    { question1: "hi" },
    { question1: "x".repeat(301) },
    { question2: "no" },
  ])("rejects %j", (patch) => {
    expect(requestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("respondSchema", () => {
  it("accepts an accept with an https link", () => {
    expect(
      respondSchema.parse({ requestId: id, decision: "accept", meetingUrl: " https://meet.example/x " }),
    ).toEqual({ requestId: id, decision: "accept", meetingUrl: "https://meet.example/x" });
  });

  it("accepts a decline without a link", () => {
    expect(
      respondSchema.safeParse({ requestId: id, decision: "decline", meetingUrl: null }).success,
    ).toBe(true);
  });

  it.each([null, "", "http://meet.example/x", "meet.example/x"])(
    "rejects accepting with the link %j",
    (meetingUrl) => {
      expect(
        respondSchema.safeParse({ requestId: id, decision: "accept", meetingUrl }).success,
      ).toBe(false);
    },
  );

  it("rejects an unknown decision", () => {
    expect(
      respondSchema.safeParse({ requestId: id, decision: "maybe", meetingUrl: null }).success,
    ).toBe(false);
  });
});

describe("outcomeSchema", () => {
  it("accepts completed and no_show only", () => {
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "completed" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "no_show" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "cancelled" }).success).toBe(false);
  });
});

describe("feedbackSchema", () => {
  it("returns database columns", () => {
    expect(feedbackSchema.parse({ sessionId: id, rating: "5", comment: " Great " })).toEqual({
      session_id: id,
      rating: 5,
      comment: "Great",
    });
  });

  it("turns a blank comment into null", () => {
    expect(feedbackSchema.parse({ sessionId: id, rating: "3", comment: null }).comment).toBeNull();
  });

  it.each(["0", "6", "x", "", null])("rejects a rating of %j", (rating) => {
    expect(feedbackSchema.safeParse({ sessionId: id, rating, comment: null }).success).toBe(false);
  });

  it("rejects a comment over 500 characters", () => {
    expect(
      feedbackSchema.safeParse({ sessionId: id, rating: "4", comment: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/mentorship/schemas.test.ts`
Expected: FAIL, cannot resolve `@/lib/mentorship/schemas`.

- [ ] **Step 3: Write `lib/mentorship/schemas.ts`**

```ts
import { z } from "zod";

import { isHttpsLink } from "@/lib/mentorship/time";

/** Postgres numbering: 0 is Sunday. Rules are in Bangladesh time. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DURATIONS = ["15", "20", "30"] as const;

/** Every half hour of the day: "00:00", "00:30", … "23:30". */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, "0");
  return `${hours}:${i % 2 === 0 ? "00" : "30"}`;
});

export const idSchema = z.uuid();
const idField = z.uuid({ error: "Something went wrong. Reload the page and try again." });

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

const timeOfDay = z
  .string({ error: "Choose a time." })
  .regex(/^([01]\d|2[0-3]):(00|30)$/, { error: "Use a time on the hour or half hour." });

const blankToNull = (value: string | null | undefined) => value || null;

/** One weekly availability window. */
export const ruleSchema = z
  .object({
    weekday: z
      .string({ error: "Choose a day." })
      .regex(/^[0-6]$/, { error: "Choose a day." })
      .transform(Number),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .superRefine((rule, ctx) => {
    if (rule.startTime >= rule.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "The end must be after the start.",
      });
    } else if (minutes(rule.endTime) - minutes(rule.startTime) > 480) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "A window can be at most 8 hours.",
      });
    }
  })
  .transform((rule) => ({
    weekday: rule.weekday,
    start_time: rule.startTime,
    end_time: rule.endTime,
  }));

/** The mentor's own profile settings. */
export const mentorProfileSchema = z
  .object({
    expertiseAreas: z
      .string()
      .trim()
      .nullish()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().max(40, { error: "Each area must be 40 characters or fewer." }))
          .max(8, { error: "List at most 8 areas." }),
      ),
    bio: z
      .string()
      .trim()
      .max(500, { error: "Use 500 characters or fewer." })
      .nullish()
      .transform(blankToNull),
    maxSessions: z
      .string({ error: "Choose a number from 1 to 10." })
      .regex(/^(10|[1-9])$/, { error: "Choose a number from 1 to 10." })
      .transform(Number),
    accepting: z
      .string()
      .nullish()
      .transform((value) => value === "on"),
  })
  .transform((profile) => ({
    expertise_areas: [...new Set(profile.expertiseAreas)],
    bio: profile.bio,
    max_sessions_per_week: profile.maxSessions,
    accepting_requests: profile.accepting,
  }));

const optionalQuestion = z
  .string()
  .trim()
  .max(300, { error: "Use 300 characters or fewer." })
  .nullish()
  .transform(blankToNull)
  .refine((value) => value === null || value.length >= 5, {
    error: "Make the question at least 5 characters, or leave it empty.",
  });

/** A mentee's request for a slot. */
export const requestSchema = z
  .object({
    slotId: idField,
    duration: z.enum(DURATIONS, { error: "Choose 15, 20 or 30 minutes." }),
    goal: z
      .string({ error: "Say what you want from the session." })
      .trim()
      .min(10, { error: "Use at least 10 characters." })
      .max(500, { error: "Use 500 characters or fewer." }),
    question1: z
      .string({ error: "Ask at least one question." })
      .trim()
      .min(5, { error: "Use at least 5 characters." })
      .max(300, { error: "Use 300 characters or fewer." }),
    question2: optionalQuestion,
  })
  .transform((request) => ({
    slot_id: request.slotId,
    duration_minutes: Number(request.duration),
    goal: request.goal,
    question_1: request.question1,
    question_2: request.question2,
  }));

/** A mentor's answer: accept with a meeting link, or decline. */
export const respondSchema = z
  .object({
    requestId: idField,
    decision: z.enum(["accept", "decline"], { error: "Choose accept or decline." }),
    meetingUrl: z.string().trim().nullish().transform(blankToNull),
  })
  .superRefine((answer, ctx) => {
    if (
      answer.decision === "accept" &&
      !(answer.meetingUrl && isHttpsLink(answer.meetingUrl))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["meetingUrl"],
        message: "Add a meeting link that starts with https://",
      });
    }
  });

/** The mentor closes a finished session. */
export const outcomeSchema = z.object({
  sessionId: idField,
  outcome: z.enum(["completed", "no_show"]),
});

/** One person's rating of a completed session. */
export const feedbackSchema = z
  .object({
    sessionId: idField,
    rating: z
      .string({ error: "Choose a rating from 1 to 5." })
      .regex(/^[1-5]$/, { error: "Choose a rating from 1 to 5." })
      .transform(Number),
    comment: z
      .string()
      .trim()
      .max(500, { error: "Use 500 characters or fewer." })
      .nullish()
      .transform(blankToNull),
  })
  .transform((feedback) => ({
    session_id: feedback.sessionId,
    rating: feedback.rating,
    comment: feedback.comment,
  }));
```

- [ ] **Step 4: Replace `lib/mentorship/form-state.ts`**

```ts
/** Shared by the mentorship forms and the server actions behind them. */
export type MentorshipField =
  | "weekday"
  | "startTime"
  | "endTime"
  | "expertiseAreas"
  | "bio"
  | "maxSessions"
  | "accepting"
  | "slotId"
  | "duration"
  | "goal"
  | "question1"
  | "question2"
  | "requestId"
  | "decision"
  | "meetingUrl"
  | "sessionId"
  | "rating"
  | "comment";

export type MentorshipFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<MentorshipField, string[]>>;
  /** What the member typed, so a failed attempt does not wipe the form. */
  values?: Partial<Record<MentorshipField, string>>;
};
```

- [ ] **Step 5: Run to see it pass, then lint and commit**

Run: `npx vitest run lib/mentorship` then `npm run lint`.
Expected: PASS (every test), lint clean. If a test fails because of Zod 4 behaviour (for example `.nullish().transform().refine()` ordering), fix the schema and keep the test unchanged.

```bash
git add lib/mentorship
git commit -m "Mentorship Zod schemas and form state, tested first

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Server Actions

**Files:**
- Rewrite: `app/(app)/sessions/actions.ts`

**Interfaces:**
- Consumes: the schemas and `MentorshipFormState` from Task 6; `getCurrentUser()` from `@/lib/auth/session`; `createClient()` from `@/lib/supabase/server`.
- Produces: `saveMentorProfile`, `addRule`, `requestSession`, `respondRequest`, `submitFeedback` (all `(previous: MentorshipFormState, formData: FormData) => Promise<MentorshipFormState>`); `removeRule`, `cancelRequest`, `markOutcome` (all `(formData: FormData) => Promise<void>`). Every success redirects to `/sessions?<notice>=1`; a failure of a formData-only action redirects to `/sessions?problem=1`.

- [ ] **Step 1: Replace `app/(app)/sessions/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import type { MentorshipField, MentorshipFormState } from "@/lib/mentorship/form-state";
import {
  feedbackSchema,
  idSchema,
  mentorProfileSchema,
  outcomeSchema,
  requestSchema,
  respondSchema,
  ruleSchema,
} from "@/lib/mentorship/schemas";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/sessions");
  return user;
}

/** What the member typed, trimmed to a safe length, so a failed form keeps its text. */
function echo(formData: FormData, fields: readonly MentorshipField[]) {
  const values: Partial<Record<MentorshipField, string>> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 600);
  }
  return values;
}

function raw(formData: FormData, fields: readonly MentorshipField[]) {
  return Object.fromEntries(fields.map((f) => [f, formData.get(f)]));
}

function invalid(
  error: z.ZodError,
  values: MentorshipFormState["values"],
): MentorshipFormState {
  return {
    status: "error",
    message: "Some details need fixing. Check the fields marked below.",
    fieldErrors: z.flattenError(error).fieldErrors as MentorshipFormState["fieldErrors"],
    values,
  };
}

/** Plain-language messages for the database's refusals. Never shows raw errors. */
function dbMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "54000":
      return "You have reached a limit: 3 live requests, the mentor's weekly sessions, or 10 weekly windows. Cancel one first.";
    case "42501":
      return "You are not allowed to do that.";
    case "22023":
      return "That is no longer possible. The slot may have been taken or the time has passed. Reload the page and check.";
    case "23505":
      return "You already have a pending request with this mentor, or the slot was just taken.";
    default:
      return fallback;
  }
}

function log(action: string, code: string | undefined) {
  if (!["54000", "42501", "22023", "23505"].includes(code ?? "")) {
    console.error(`${action} failed:`, code);
  }
}

const PROFILE_FIELDS = ["expertiseAreas", "bio", "maxSessions", "accepting"] as const;

/** A verified graduate creates or updates their mentor profile. */
export async function saveMentorProfile(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  const user = await requireUser();
  const values = echo(formData, PROFILE_FIELDS);
  const parsed = mentorProfileSchema.safeParse(raw(formData, PROFILE_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { data: updated, error: updateError } = await supabase
    .from("mentor_profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("id");

  let code = updateError?.code;
  if (!updateError && updated.length === 0) {
    const { error } = await supabase.from("mentor_profiles").insert(parsed.data);
    code = error?.code;
  }

  if (code) {
    log("save mentor profile", code);
    return {
      status: "error",
      message: dbMessage(code, "We could not save your mentor profile. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?saved=1");
}

const RULE_FIELDS = ["weekday", "startTime", "endTime"] as const;

/** A mentor adds one weekly availability window; slots appear at once. */
export async function addRule(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, RULE_FIELDS);
  const parsed = ruleSchema.safeParse(raw(formData, RULE_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("mentor_availability_rules").insert(parsed.data);
  if (error) {
    log("add rule", error.code);
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "You already have a window starting at that time on that day."
          : dbMessage(error.code, "We could not add the window. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?rule=1");
}

/** A mentor removes a window; its future open slots are withdrawn. */
export async function removeRule(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("ruleId"));
  if (!id.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentor_availability_rules")
    .delete()
    .eq("id", id.data);
  if (error) {
    log("remove rule", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?ruleRemoved=1");
}

const REQUEST_FIELDS = ["slotId", "duration", "goal", "question1", "question2"] as const;

/** A verified member asks for an open slot. */
export async function requestSession(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, REQUEST_FIELDS);
  const parsed = requestSchema.safeParse(raw(formData, REQUEST_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_requests").insert(parsed.data);
  if (error) {
    log("request session", error.code);
    return {
      status: "error",
      message: dbMessage(error.code, "We could not send your request. Nothing was sent. Try again."),
      values,
    };
  }
  redirect("/sessions?requested=1");
}

const RESPOND_FIELDS = ["requestId", "decision", "meetingUrl"] as const;

/** A mentor accepts with a meeting link, or declines. */
export async function respondRequest(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, RESPOND_FIELDS);
  const parsed = respondSchema.safeParse(raw(formData, RESPOND_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const answer = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentorship_requests")
    .update(
      answer.decision === "accept"
        ? { status: "accepted", meeting_url: answer.meetingUrl }
        : { status: "declined" },
    )
    .eq("id", answer.requestId)
    .eq("status", "pending")
    .select("id");

  if (error || data.length === 0) {
    log("respond request", error?.code);
    return {
      status: "error",
      message: error
        ? dbMessage(error.code, "We could not save your answer. Nothing changed. Try again.")
        : "This request is no longer waiting for an answer. It may have expired or been cancelled.",
      values,
    };
  }
  redirect(`/sessions?${answer.decision === "accept" ? "accepted" : "declined"}=1`);
}

/** Either side cancels: a mentee a pending or accepted request, a mentor an accepted one. */
export async function cancelRequest(formData: FormData) {
  await requireUser();
  const id = idSchema.safeParse(formData.get("requestId"));
  if (!id.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_requests")
    .update({ status: "cancelled" })
    .eq("id", id.data)
    .in("status", ["pending", "accepted"]);
  if (error) {
    log("cancel request", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?cancelled=1");
}

/** The mentor closes a finished session as completed or no-show. */
export async function markOutcome(formData: FormData) {
  await requireUser();
  const parsed = outcomeSchema.safeParse({
    sessionId: formData.get("sessionId"),
    outcome: formData.get("outcome"),
  });
  if (!parsed.success) redirect("/sessions?problem=1");
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: parsed.data.outcome })
    .eq("id", parsed.data.sessionId)
    .eq("status", "scheduled");
  if (error) {
    log("mark outcome", error.code);
    redirect("/sessions?problem=1");
  }
  redirect("/sessions?closed=1");
}

const FEEDBACK_FIELDS = ["sessionId", "rating", "comment"] as const;

/** Either person rates a completed session, once. */
export async function submitFeedback(
  _previous: MentorshipFormState,
  formData: FormData,
): Promise<MentorshipFormState> {
  await requireUser();
  const values = echo(formData, FEEDBACK_FIELDS);
  const parsed = feedbackSchema.safeParse(raw(formData, FEEDBACK_FIELDS));
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.from("session_feedback").insert(parsed.data);
  if (error) {
    log("submit feedback", error.code);
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "You have already rated this session."
          : dbMessage(error.code, "We could not save your rating. Nothing changed. Try again."),
      values,
    };
  }
  redirect("/sessions?rated=1");
}
```

- [ ] **Step 2: Typecheck the file**

Run: `npm run typecheck`. Expected: no errors in `actions.ts`. Remaining errors are only in `page.tsx`, `offer-form.tsx`, `book-form.tsx` and `members/[id]/page.tsx` (fixed next). If a Supabase insert type complains about a column, check it against the regenerated `types/database.types.ts` rather than casting.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/sessions/actions.ts"
git commit -m "Mentorship Server Actions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Screens

**Files:**
- Delete: `app/(app)/sessions/offer-form.tsx`, `app/(app)/sessions/book-form.tsx`
- Create: `app/(app)/sessions/mentor-profile-form.tsx`, `rule-form.tsx`, `respond-form.tsx`, `feedback-form.tsx`, `app/(app)/members/[id]/request-form.tsx`
- Rewrite: `app/(app)/sessions/page.tsx`
- Modify: `app/(app)/members/[id]/page.tsx`

**Interfaces:**
- Consumes: the actions from Task 7, `Field` and `aria` from `app/(app)/field.tsx`, `formatDhaka`, `WEEKDAYS`, `TIME_OPTIONS`, `DURATIONS`.
- Produces: the screens below. Existing CSS classes only: `field`, `button button-primary`, `button button-quiet`, `text-danger`, `text-muted`, `rounded-xl border border-border bg-surface p-5`.

Every client form follows the pattern of the file it replaces (`useActionState(action, { status: "idle" })`, `useId`-based ids, `Field` plus `aria(id, error, required)`, a `role="alert"` paragraph for `state.message`, a submit button disabled while `pending`). Read `app/(app)/sessions/book-form.tsx` before deleting it and keep that markup.

- [ ] **Step 1: Write `app/(app)/members/[id]/request-form.tsx`**

```tsx
"use client";

import { useActionState, useId } from "react";

import { DURATIONS } from "@/lib/mentorship/schemas";
import type { MentorshipFormState } from "@/lib/mentorship/form-state";

import { Field, aria } from "../../field";
import { requestSession } from "../../sessions/actions";

const initialState: MentorshipFormState = { status: "idle" };

/** Asks one slot of a graduate: a goal and one or two questions. */
export function RequestForm({ slotId }: { slotId: string }) {
  const [state, formAction, pending] = useActionState(requestSession, initialState);
  const id = useId();
  const err = (f: keyof NonNullable<MentorshipFormState["fieldErrors"]>) =>
    state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slotId" value={slotId} />
      {state.message ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {state.message}
        </p>
      ) : null}
      <Field id={`${id}-duration`} label="Length" error={err("duration")}>
        <select
          id={`${id}-duration`}
          name="duration"
          defaultValue={state.values?.duration ?? "20"}
          {...aria(`${id}-duration`, err("duration"), true)}
          className="field"
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} minutes
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${id}-goal`}
        label="What do you want from this session?"
        hint="At least 10 characters."
        error={err("goal")}
      >
        <textarea
          id={`${id}-goal`}
          name="goal"
          rows={3}
          maxLength={500}
          defaultValue={state.values?.goal}
          {...aria(`${id}-goal`, err("goal"), true)}
          className="field py-3"
        />
      </Field>
      <Field id={`${id}-q1`} label="Your first question" error={err("question1")}>
        <input
          id={`${id}-q1`}
          name="question1"
          maxLength={300}
          defaultValue={state.values?.question1}
          {...aria(`${id}-q1`, err("question1"), true)}
          className="field"
        />
      </Field>
      <Field id={`${id}-q2`} label="A second question (optional)" error={err("question2")}>
        <input
          id={`${id}-q2`}
          name="question2"
          maxLength={300}
          defaultValue={state.values?.question2}
          {...aria(`${id}-q2`, err("question2"), false)}
          className="field"
        />
      </Field>
      <button type="submit" disabled={pending} className="button button-primary self-start">
        {pending ? "Sending…" : "Request this session"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the four forms for `/sessions`**

Each is a `"use client"` component built exactly like `RequestForm`. Fields, labels and copy:

| File and export | Action | Fields (name, label, control) | Submit label |
|---|---|---|---|
| `mentor-profile-form.tsx` `MentorProfileForm({ profile })` | `saveMentorProfile` | `expertiseAreas` "Areas you can help with" (text, hint "Separate with commas, up to 8"); `bio` "About you" (textarea, 500); `maxSessions` "Most sessions per week" (select 1 to 10, default 3); `accepting` "I am taking requests" (checkbox, checked by default). `profile` is `{ expertise_areas: string[]; bio: string \| null; max_sessions_per_week: number; accepting_requests: boolean } \| null` and fills the defaults. | "Save mentor profile" |
| `rule-form.tsx` `RuleForm()` | `addRule` | `weekday` "Day" (select of `WEEKDAYS` with values `"0"` to `"6"`); `startTime` "From" and `endTime` "To" (selects of `TIME_OPTIONS`, defaults `"09:00"` and `"11:00"`); hint "Bangladesh time" | "Add this window" |
| `respond-form.tsx` `RespondForm({ requestId })` | `respondRequest` | hidden `requestId`; `meetingUrl` "Meeting link" (`type="url"`, hint "Needed to accept. Must start with https://"); two submit buttons named `decision`, value `accept` ("Accept") with `button-primary` and value `decline` ("Decline") with `button-quiet` | as listed |
| `feedback-form.tsx` `FeedbackForm({ sessionId })` | `submitFeedback` | hidden `sessionId`; `rating` "Rating" as a `fieldset` of five radio buttons labelled 1 to 5; `comment` "A short comment (optional)" (textarea, 500) | "Send rating" |

A radio group needs `<fieldset><legend>`; give each radio its own `label`. Errors for `rating` go under the fieldset with `role="alert"` and the fieldset `aria-describedby`.

- [ ] **Step 3: Rewrite `app/(app)/sessions/page.tsx`**

Keep the page's existing shell (the `Suspense` boundary, `getCurrentUser()` first, `searchParams` handling, the notice paragraph pattern). Replace its data and sections with this data loading, run in parallel on the session-bound client:

```ts
const supabase = await createClient();
const [mentor, rules, requests, sessions, feedback, verified] = await Promise.all([
  supabase.from("mentor_profiles")
    .select("expertise_areas, bio, max_sessions_per_week, accepting_requests")
    .eq("id", user.id).maybeSingle(),
  supabase.from("mentor_availability_rules")
    .select("id, weekday, start_time, end_time").eq("mentor_id", user.id)
    .order("weekday").order("start_time"),
  supabase.from("mentorship_requests")
    .select("id, status, mentee_id, mentor_id, duration_minutes, goal, question_1, question_2, meeting_url, expires_at, slot:mentor_slots(starts_at), mentee:profiles!mentorship_requests_mentee_id_fkey(full_name), mentor:profiles!mentorship_requests_mentor_id_fkey(full_name)")
    .order("created_at", { ascending: false }).limit(50),
  supabase.from("sessions")
    .select("id, status, mentor_id, mentee_id, starts_at, duration_minutes, meeting_url, outcome_at, request_id")
    .order("starts_at", { ascending: false }).limit(50),
  supabase.from("session_feedback")
    .select("session_id, reviewer_id, reviewee_id, rating, comment"),
  supabase.from("profiles")
    .select("affiliation, verification_status").eq("id", user.id).maybeSingle(),
]);
```

Render these sections in this order, each with an `h2`, an empty-state sentence, and a visible error sentence if its query returned an `error` (log the code, show "We could not load this. Reload the page."):

1. **Notices** from `searchParams`: `requested` "Request sent. The mentor has 72 hours to answer.", `accepted` "Request accepted.", `declined` "Request declined.", `cancelled` "Cancelled.", `closed` "Session closed.", `rated` "Thank you. Your rating is saved.", `saved` "Mentor profile saved.", `rule` "Window added. Slots will appear in a moment.", `ruleRemoved` "Window removed.", `problem` "That did not work. Reload the page and try again." (as an alert).
2. **Your requests** (as mentee: rows where `mentee_id === user.id`): mentor name, `formatDhaka(slot.starts_at)`, `duration_minutes`, a status badge; `pending` shows "Expires {formatDhaka(expires_at)}" and a `cancelRequest` form button "Cancel request"; `accepted` shows a "Join the meeting" link (`target="_blank"`, `rel="noopener noreferrer"`) and "Cancel session"; `declined` and `expired` show a one-line explanation.
3. **Your sessions** (rows from `sessions`, both roles): the other person's name (from the matched request), time, status. Scheduled and upcoming: the link. Scheduled and `now >= starts_at + duration`: if you are the mentor, two `markOutcome` buttons ("Mark completed", "Mark no-show"). Completed and you have not rated (no `feedback` row with `reviewer_id === user.id` for the session): `FeedbackForm`. Show ratings: your own always; the other person's only if a row with `reviewee_id === user.id` is present (the database hides it until revealed). Compute "now" after `await io()` as the existing page does.
4. **Requests to you** (mentor: rows where `mentor_id === user.id`): pending ones with goal, both questions, mentee name (fall back to "A verified member" when the name is not readable), the time, and `RespondForm`; accepted upcoming ones with "Cancel session".
5. **Mentor settings** (only if `verified.data` is a verified graduate: `affiliation === "alumni"` and status in `verified_alumni`, `trusted_member`): `MentorProfileForm`; then **Weekly availability** listing each rule as "{WEEKDAYS[weekday]} {start_time.slice(0,5)} to {end_time.slice(0,5)} (Bangladesh time)" with a `removeRule` form button "Remove", then `RuleForm`. For anyone else show "Verified graduates can offer sessions here." (this exact sentence; the browser test looks for it).

Status badges use the existing badge styling from the dashboard; if none exists, a `span` with `rounded-full border border-border px-2 py-0.5 text-xs`.

- [ ] **Step 4: Update `app/(app)/members/[id]/page.tsx`**

Find the block that selects from `mentor_slots` and renders `BookSlotForm`. Replace it so that it:

1. Loads `mentor_profiles` for the page's member (`accepting_requests`, `expertise_areas`, `max_sessions_per_week`) and, only when that row exists, accepts requests, the viewer is verified and is not the page's owner, loads their open future slots: `.from("mentor_slots").select("id, starts_at").eq("mentor_id", id).eq("status", "open").gt("starts_at", <the page's existing now value>).order("starts_at").limit(40)`.
2. Renders an `h2` "Request a session" with, per slot, a `<li>` showing `formatDhaka(starts_at)` and a `<details>` whose summary is "Request this time" containing `<RequestForm slotId={slot.id} />` (so only one form is open at a time and the page stays short on a phone).
3. Shows "This graduate is not taking requests right now." when the profile exists but `accepting_requests` is false, and nothing when there is no mentor profile.

Delete the import of `BookSlotForm` and any `lib/sessions` import.

- [ ] **Step 5: Delete the old forms and run every check**

```bash
git rm -q "app/(app)/sessions/offer-form.tsx" "app/(app)/sessions/book-form.tsx"
npm run lint && npm run typecheck && npm test
```

Expected: all pass. The design detector hook scans the new files as they are written; expected 0 findings.

- [ ] **Step 6: Look at it**

Start `npm run dev`. Sign in with a throwaway verified graduate (seeded as in Task 9), open `/sessions` at 375 px and in dark mode, and take screenshots of: mentor settings, the rule list, an incoming request, a booked session, the feedback form. Fix anything cramped, clipped or unlabeled before moving on.

- [ ] **Step 7: Commit**

```bash
git add app lib
git commit -m "Mentorship screens: requests, availability, sessions, ratings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Browser and API proof

**Files:**
- Create: `e2e/mentorship.py`
- Delete: `e2e/sessions.py`

**Interfaces:**
- Consumes: the running app on `http://localhost:3000`, `.env.local`, the hosted database.
- Produces: `e2e/mentorship.py` exiting 0 with `N/N checks passed`.

- [ ] **Step 1: Write `e2e/mentorship.py`**

Base it on `e2e/sessions.py` (copy its `check`, `api`, `token_for`, `sign_in` helpers and its `.env.local` loading, then delete that file). Seed by hand before the run with the Supabase tools: four accounts created through `POST /auth/v1/signup`, promoted with `private.transition_verification` exactly as the pgTAP fixtures do, plus `insert into public.mentor_profiles`; remove them afterwards with `delete from auth.users where email like 'e2e-%@example.com'`. Accounts: `e2e-mentor@example.com` (verified graduate "Mia Mentor"), `e2e-student1@example.com` ("Sid Student"), `e2e-student2@example.com` ("Sue Student"), and `e2e-private@example.com` (graduate with `visibility = 'private'`).

The script performs these checks, each with a `check(name, ok, detail)` call:

1. Mentor opens `/sessions`: heading "Weekly availability" visible; adds Sunday and Monday 09:00 to 11:00 windows through the form: after submit the notice "Window added." shows and the API (`mentor_slots` with the mentor's token) returns more than 0 open slots.
2. A window whose end is before its start shows an inline error and adds nothing.
3. Saving the mentor profile with "0" sessions per week is refused (the select does not offer 0, so submit through `page.evaluate` setting the value, expecting the field error); with "3" it saves ("Mentor profile saved.").
4. Student 1 opens the mentor's page: "Request a session" is visible and at least one slot is listed; a short goal shows the field error under the goal; a valid request redirects to `/sessions?requested=1` and shows "Request sent."
5. The same student cannot request a second slot from that mentor while one is pending (the second valid request shows the "pending request" message).
6. Student 2 sees one fewer open slot than before, cannot read the mentor's requests through the API (`mentorship_requests` returns `[]`), and cannot request the private graduate's slot through the API (HTTP 403).
7. Mentor sees the request in "Requests to you" with the goal and both questions; accepting with an `http://` link shows the field error; accepting with `https://meet.example.com/e2e-room` redirects to `?accepted=1`.
8. Student 1 sees "Join the meeting" with `href` equal to the link, `target="_blank"` and `rel` containing `noopener`; student 2 reads no `sessions` through the API.
9. Student 1 cancels the accepted session; the slot is open again (API) and the link is gone from the request.
10. Student 1 requests again; the mentor declines; the request shows as declined.
11. Expiry: student 2 requests; the script prints the SQL `update public.mentorship_requests set expires_at = now() - interval '1 minute' where status = 'pending'; select private.expire_requests();` and waits for a file `expiry.done` to appear next to it; then the request shows as expired on `/sessions` and its slot is open again.
12. Close and rate: the script prints the SQL `alter table public.sessions disable trigger sessions_before_update; update public.sessions set starts_at = now() - interval '2 hours' where status = 'scheduled'; alter table public.sessions enable trigger sessions_before_update;` and waits for `session.done`. Then the mentor sees "Mark completed" and "Mark no-show", clicks completed; student 1 rates 5; the mentor sees no rating from student 1 yet (blind); the mentor rates 4; both ratings then appear for both.
13. Screenshots in `e2e/shots/` at 375 px, light and dark: mentor `/sessions`, student `/sessions`, the request form open on the member page.
14. No uncaught page errors during the run.

- [ ] **Step 2: Seed, run, and clean up**

Seed the four accounts through the Supabase tools. Run `npm run dev` in the background, then `python e2e/mentorship.py`. Perform the two SQL steps when the script asks, then create the marker file. Expected: `N/N checks passed`. Review the screenshots. Afterwards delete the four accounts and confirm `select count(*) from auth.users` and `from public.profiles` are 0.

- [ ] **Step 3: Commit**

```bash
git rm -q e2e/sessions.py
git add e2e/mentorship.py
git commit -m "Browser and API checks for the mentorship flow

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Records, CI, push

**Files:**
- Create: `docs/evidence/2026-11-2x_sprint6_checks.txt` (use the real date)
- Modify: `docs/plan/Build_State.md`, `docs/plan/Decision_Log.md`, `docs/plan/Dev_Journal.md`, `README.md`, `.github/workflows/ci.yml` (only if it names `004`)

- [ ] **Step 1: Run the full set once more and capture the output**

Run `npm run lint`, `npm run typecheck`, `npm test`, the pgTAP file via `execute_sql`, `get_advisors` (security, performance), and `python e2e/security_anon.py`. Save each result, the pgTAP failures-only output, the negative control from Task 4 Step 5, and the list of what was not verified (CI result, `.ics` and reminders, real phone, Safari) to `docs/evidence/…_sprint6_checks.txt`, in the style of `docs/evidence/2026-11-22_sprint5_checks.txt`.

- [ ] **Step 2: Update the records**

- `Decision_Log.md`: add D-018, D-019, D-020 using the entries in the spec (Status: Accepted), plus D-021 "Password sign-up and sign-in instead of email OTP" with Status: Proposed and the alternatives and trade-offs, so the supervisor can see it.
- `Build_State.md`: update the sprint map (what exists, the real sprint numbering, mentorship done, jobs and notifications next, the OTP and institutional-mailbox gaps stated plainly) and "Next up".
- `Dev_Journal.md`: add an entry in the file's format for 2026-11-23 covering the reconciliation, the mistakes made (building from inferred scope; the private-slot request hole found while writing the plan; the single-statement limits lesson), and the evidence file.
- `README.md`: rewrite the "Mentorship sessions" section for the new flow, routes and limits; update the "Browser checks" list (`mentorship` replaces `sessions`).
- CI: `grep -n "004" .github/workflows/ci.yml`; if it names the old file, change it. `supabase test db` runs every file in `supabase/tests`, so no other change is needed.

- [ ] **Step 3: Push and check CI**

```bash
git add -A docs README.md .github
git commit -m "Sprint 6 records: evidence, decisions, journal, build state

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin sprint-6-mentorship
```

Open a PR only if the user asks. Tell the user plainly what remains unverified: the CI `database` job, which cannot be read from here, and anything in the spec's out-of-scope list.

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Six tables and constraints | 2, 3 |
| Request, slot and session state machines | 3 (triggers and tests) |
| Rule 1 verified graduates and verified members | 2, 3 |
| Rule 2 one pending per pair, one live per slot | 3 |
| Rule 3 weekly cap | 3 |
| Rule 4 live-request limit | 3 |
| Rule 5 own slot and slots too soon | 3 |
| Rule 6 link visibility | 3 |
| Rule 7 feedback rules and blind reveal | 3 |
| Rule 8 rule deletion withdraws slots | 2 (trigger), 4 (test) |
| `pg_cron` expiry and nightly generation | 1 (spike), 4 |
| Screens `/sessions` and `/members/[id]` | 8 |
| Server code, Zod, Server Actions | 6, 7 |
| pgTAP, Vitest, Playwright, advisors, evidence, records | 2 to 4, 5, 6, 9, 10 |
| Out of scope stated | 10 (README and journal) |

Differences from the spec, to record in the journal: the spec's "week-boundary helper" Vitest was dropped because the week is computed only in the database and tested there; the insert policy gained a slot-visibility check (found while planning, tested as "a private mentor's slot cannot be requested even with its id"); `mentor_id`, `expires_at` and `reviewee_id` carry harmless defaults so generated insert types stay accurate.

Known limits to state in the report: a mentee whose profile is private shows to the mentor as "A verified member"; weeks run Monday to Sunday in Bangladesh time; a window cannot end at midnight (latest end `23:30`).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-23-mentorship.md`. Two execution options:

1. **Subagent-driven (recommended):** a fresh subagent per task with review between tasks.
2. **Inline execution:** run the tasks in this session with checkpoints.
