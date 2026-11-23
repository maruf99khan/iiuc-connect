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

