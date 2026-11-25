-- =============================================================================
-- IIUC Connect — Migration 012: in-app notifications
-- Rows are created only by database triggers (members cannot insert) when a
-- mentorship request or a job application changes. A row holds a kind and a
-- link and no names or free text, so it can never leak what a member typed.
-- The app turns the kind into a sentence. Members may read, mark read, and
-- delete their own rows. No email yet (needs the project sender, D-010).
-- =============================================================================

create type public.notification_kind as enum (
  'request_received', 'request_accepted', 'request_declined',
  'request_cancelled', 'request_expired',
  'application_received', 'application_shortlisted',
  'application_rejected', 'application_withdrawn'
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  link       text not null check (link like '/%' and link not like '//%' and char_length(link) <= 200),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- The one place a row is made.
create function private.notify(p_user uuid, p_kind public.notification_kind, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, link)
  select p_user, p_kind, p_link where p_user is not null;
$$;

revoke all on function private.notify(uuid, public.notification_kind, text) from public;

-- Mentorship ------------------------------------------------------------------------
create function private.notify_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.mentor_id, 'request_received', '/sessions');
  return null;
end;
$$;

create function private.notify_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if new.status = old.status then
    return null;
  end if;
  case new.status
    when 'accepted' then perform private.notify(new.mentee_id, 'request_accepted', '/sessions');
    when 'declined' then perform private.notify(new.mentee_id, 'request_declined', '/sessions');
    when 'expired'  then perform private.notify(new.mentee_id, 'request_expired', '/sessions');
    when 'cancelled' then
      -- Tell the other side. A call with no signed-in user tells the mentee.
      if caller = new.mentee_id then
        perform private.notify(new.mentor_id, 'request_cancelled', '/sessions');
      else
        perform private.notify(new.mentee_id, 'request_cancelled', '/sessions');
      end if;
    else null;
  end case;
  return null;
end;
$$;

create trigger notify_request_insert
  after insert on public.mentorship_requests
  for each row execute function private.notify_request_insert();
create trigger notify_request_update
  after update of status on public.mentorship_requests
  for each row execute function private.notify_request_update();

-- Jobs ------------------------------------------------------------------------------
create function private.notify_application_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(
    (select j.poster_id from public.jobs j where j.id = new.job_id),
    'application_received', '/jobs/' || new.job_id);
  return null;
end;
$$;

create function private.notify_application_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return null;
  end if;
  case new.status
    when 'shortlisted' then
      perform private.notify(new.applicant_id, 'application_shortlisted', '/jobs/' || new.job_id);
    when 'rejected' then
      perform private.notify(new.applicant_id, 'application_rejected', '/jobs/' || new.job_id);
    when 'withdrawn' then
      perform private.notify(
        (select j.poster_id from public.jobs j where j.id = new.job_id),
        'application_withdrawn', '/jobs/' || new.job_id);
    else null;
  end case;
  return null;
end;
$$;

create trigger notify_application_insert
  after insert on public.job_applications
  for each row execute function private.notify_application_insert();
create trigger notify_application_update
  after update of status on public.job_applications
  for each row execute function private.notify_application_update();

revoke all on function private.notify_request_insert() from public;
revoke all on function private.notify_request_update() from public;
revoke all on function private.notify_application_insert() from public;
revoke all on function private.notify_application_update() from public;

-- Privileges and Row Level Security ---------------------------------------------------
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.notifications enable row level security;

create policy notifications_select
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
