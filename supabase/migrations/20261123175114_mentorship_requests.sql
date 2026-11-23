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
