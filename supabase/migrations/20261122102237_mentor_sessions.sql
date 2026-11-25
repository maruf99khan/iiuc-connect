-- =============================================================================
-- IIUC Connect — Migration 007: mentorship sessions
-- Sprint 5. A verified graduate offers short time slots (15 or 30 minutes); a
-- verified member books one; the meeting link is shared only between the two.
--
-- Design (same approach as Sprint 3):
--   * No public RPC functions. Members write to the tables under Row Level
--     Security with column-level grants; triggers enforce the fixed state
--     machine and the limits.
--   * Every WITH CHECK branch repeats its whole condition (who AND which
--     values), because permissive-policy checks are OR-ed (see migration 002).
--   * The meeting link lives in its own table: RLS filters rows, not columns, and
--     the slot row is visible to every verified member while it is open.
--   * Limits: at most 10 open slots per mentor, 3 active bookings per member,
--     slots between 30 minutes and 60 days ahead, 15 or 30 minutes long. The
--     two counts are checked in AFTER triggers: a BEFORE row trigger cannot see
--     the other rows of the same statement, so one request inserting or booking
--     many rows at once would slip past it.
-- =============================================================================

-- A verified graduate may offer sessions.
create function private.is_verified_alumni()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.affiliation = 'alumni'
      and p.verification_status in ('verified_alumni', 'trusted_member')
  );
$$;

revoke all on function private.is_verified_alumni() from public;
grant execute on function private.is_verified_alumni() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.mentor_slots (
  id               uuid primary key default gen_random_uuid(),
  mentor_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at        timestamptz not null,
  duration_minutes smallint not null,
  topic            text not null,
  status           text not null default 'open',
  booked_by        uuid references public.profiles (id) on delete set null,
  booked_at        timestamptz,
  booker_note      text,
  created_at       timestamptz not null default now(),

  constraint mentor_slots_duration check (duration_minutes in (15, 30)),
  constraint mentor_slots_topic_len check (char_length(btrim(topic)) between 2 and 120),
  constraint mentor_slots_status check (status in ('open', 'booked', 'cancelled')),
  constraint mentor_slots_note_len check (booker_note is null or char_length(booker_note) <= 500),
  -- An open slot has nobody on it. A cancelled one keeps who had booked it.
  constraint mentor_slots_open_has_no_booker check (status <> 'open' or booked_by is null)
);

comment on table public.mentor_slots is
  'Time slots offered by verified graduates. Visible to verified members while open; afterwards only to the mentor and the person who booked.';

create table public.mentor_slot_links (
  slot_id     uuid primary key references public.mentor_slots (id) on delete cascade,
  meeting_url text not null,

  constraint mentor_slot_links_https check (
    char_length(meeting_url) <= 300 and meeting_url ~* '^https://[^[:space:]]+$'
  )
);

comment on table public.mentor_slot_links is
  'Meeting link for a slot. Readable only by the mentor and the person who booked.';

create index mentor_slots_mentor_idx on public.mentor_slots (mentor_id, starts_at);
create index mentor_slots_booked_by_idx on public.mentor_slots (booked_by) where booked_by is not null;
create index mentor_slots_open_idx on public.mentor_slots (starts_at) where status = 'open';

-- -----------------------------------------------------------------------------
-- 2. Rules enforced by triggers
-- -----------------------------------------------------------------------------
create function private.mentor_slots_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at < now() + interval '30 minutes'
     or new.starts_at > now() + interval '60 days' then
    raise exception 'a slot must start between 30 minutes and 60 days from now'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

-- The only legal moves: open -> booked, booked -> open (released by the person
-- who booked), open or booked -> cancelled (by the mentor). Who may do which
-- is decided by the policy; this decides what a move does to the other fields.
create function private.mentor_slots_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.duration_minutes is distinct from old.duration_minutes
     or new.topic is distinct from old.topic
     or new.mentor_id is distinct from old.mentor_id then
    raise exception 'a slot cannot be changed once created' using errcode = '22023';
  end if;

  if old.status = 'open' and new.status = 'booked' then
    new.booked_at := now();

  elsif old.status = 'booked' and new.status = 'open' then
    new.booked_by := null;
    new.booked_at := null;
    new.booker_note := null;

  elsif old.status in ('open', 'booked') and new.status = 'cancelled' then
    -- Cancelling must not rewrite who had booked.
    if new.booked_by is distinct from old.booked_by
       or new.booker_note is distinct from old.booker_note then
      raise exception 'cancelling cannot change the booking' using errcode = '22023';
    end if;

  elsif new.status = old.status then
    if new.booked_by is distinct from old.booked_by
       or new.booker_note is distinct from old.booker_note then
      raise exception 'the booking can only change when the status changes' using errcode = '22023';
    end if;

  else
    raise exception 'invalid slot status change: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- Counts run after the statement's rows are in, so they see all of them.
create function private.mentor_slots_after_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*)
        from public.mentor_slots s
       where s.mentor_id = new.mentor_id
         and s.status = 'open'
         and s.starts_at > now()) > 10 then
    raise exception 'a mentor can have at most 10 open slots'
      using errcode = '54000';
  end if;
  return null;
end;
$$;

create function private.mentor_slots_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status = 'booked' and new.booked_by is not null
     and (select count(*)
            from public.mentor_slots s
           where s.booked_by = new.booked_by
             and s.status = 'booked'
             and s.starts_at > now()) > 3 then
    raise exception 'a member can have at most 3 active bookings'
      using errcode = '54000';
  end if;
  return null;
end;
$$;

revoke all on function private.mentor_slots_before_insert() from public;
revoke all on function private.mentor_slots_before_update() from public;
revoke all on function private.mentor_slots_after_insert() from public;
revoke all on function private.mentor_slots_after_update() from public;

create trigger mentor_slots_before_insert
  before insert on public.mentor_slots
  for each row execute function private.mentor_slots_before_insert();

create trigger mentor_slots_before_update
  before update on public.mentor_slots
  for each row execute function private.mentor_slots_before_update();

create trigger mentor_slots_after_insert
  after insert on public.mentor_slots
  for each row execute function private.mentor_slots_after_insert();

create trigger mentor_slots_after_update
  after update on public.mentor_slots
  for each row execute function private.mentor_slots_after_update();

-- -----------------------------------------------------------------------------
-- 3. Privileges
-- -----------------------------------------------------------------------------
revoke all on public.mentor_slots, public.mentor_slot_links from anon, authenticated;

grant select on public.mentor_slots to authenticated;
grant insert (starts_at, duration_minutes, topic) on public.mentor_slots to authenticated;
grant update (status, booked_by, booker_note) on public.mentor_slots to authenticated;

grant select on public.mentor_slot_links to authenticated;
grant insert (slot_id, meeting_url) on public.mentor_slot_links to authenticated;
grant update (meeting_url) on public.mentor_slot_links to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.mentor_slots enable row level security;
alter table public.mentor_slot_links enable row level security;

-- Own slots, slots you booked, or an open future slot of a mentor whose profile
-- you may read (so a private mentor's slots stay hidden) while you are verified.
create policy mentor_slots_select
  on public.mentor_slots for select
  to authenticated
  using (
    mentor_id = (select auth.uid())
    or booked_by = (select auth.uid())
    or (
      status = 'open'
      and starts_at > now()
      and (select private.is_verified())
      and exists (select 1 from public.profiles p where p.id = mentor_slots.mentor_id)
    )
  );

create policy mentor_slots_insert
  on public.mentor_slots for insert
  to authenticated
  with check (
    mentor_id = (select auth.uid())
    and status = 'open'
    and booked_by is null
    and (select private.is_verified_alumni())
  );

create policy mentor_slots_update
  on public.mentor_slots for update
  to authenticated
  using (
    -- the mentor, on their own open or booked slot
    (mentor_id = (select auth.uid()) and status in ('open', 'booked'))
    -- the person who booked
    or (booked_by = (select auth.uid()) and status = 'booked')
    -- a verified member, on someone else's open future slot
    or (
      status = 'open'
      and booked_by is null
      and starts_at > now()
      and mentor_id <> (select auth.uid())
      and (select private.is_verified())
    )
  )
  with check (
    -- the mentor may only cancel
    (mentor_id = (select auth.uid()) and status = 'cancelled')
    -- a member may only book for themselves, never their own slot
    or (
      booked_by = (select auth.uid())
      and status = 'booked'
      and mentor_id <> (select auth.uid())
    )
    -- or release a slot they booked
    or (
      booked_by is null
      and status = 'open'
      and mentor_id <> (select auth.uid())
    )
  );

-- The link: the mentor and the person who booked, via the slot's own visibility.
create policy mentor_slot_links_select
  on public.mentor_slot_links for select
  to authenticated
  using (
    exists (
      select 1
        from public.mentor_slots s
       where s.id = mentor_slot_links.slot_id
         and (s.mentor_id = (select auth.uid()) or s.booked_by = (select auth.uid()))
    )
  );

create policy mentor_slot_links_insert
  on public.mentor_slot_links for insert
  to authenticated
  with check (
    exists (
      select 1 from public.mentor_slots s
       where s.id = slot_id and s.mentor_id = (select auth.uid())
    )
  );

create policy mentor_slot_links_update
  on public.mentor_slot_links for update
  to authenticated
  using (
    exists (
      select 1 from public.mentor_slots s
       where s.id = mentor_slot_links.slot_id and s.mentor_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.mentor_slots s
       where s.id = slot_id and s.mentor_id = (select auth.uid())
    )
  );
