-- =============================================================================
-- IIUC Connect — Migration 011: jobs board (post, apply, track)
-- A verified graduate posts jobs; a verified member applies once per job; the
-- poster shortlists or rejects; the applicant can withdraw. Limits are counted
-- in AFTER triggers: a BEFORE row trigger cannot see the other rows of the same
-- statement, so one statement could slip past it.
-- =============================================================================

create type public.job_type as enum ('full_time', 'part_time', 'internship', 'contract');
create type public.job_status as enum ('active', 'closed');
create type public.application_status as enum ('submitted', 'shortlisted', 'rejected', 'withdrawn');

-- 1. Tables -----------------------------------------------------------------------
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  poster_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  company     text not null check (char_length(btrim(company)) between 1 and 120),
  location    text check (location is null or char_length(btrim(location)) between 1 and 120),
  job_type    public.job_type not null,
  description text not null check (char_length(btrim(description)) between 20 and 3000),
  status      public.job_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index jobs_poster_idx on public.jobs (poster_id);
create index jobs_active_idx on public.jobs (created_at desc) where status = 'active';

create table public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  applicant_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message      text check (message is null or char_length(btrim(message)) between 1 and 1000),
  status       public.application_status not null default 'submitted',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (job_id, applicant_id)
);

create index job_applications_applicant_idx on public.job_applications (applicant_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function private.set_updated_at();

-- 2. Limits (AFTER triggers) ----------------------------------------------------------
-- At most 10 active jobs per poster, 20 live applications per applicant.
create function private.jobs_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.jobs j
       where j.poster_id = new.poster_id and j.status = 'active') > 10 then
    raise exception 'too many active jobs' using errcode = '54000';
  end if;
  return null;
end;
$$;

create trigger jobs_after_write
  after insert or update of status on public.jobs
  for each row execute function private.jobs_after_write();

create function private.applications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.job_applications a
       where a.applicant_id = new.applicant_id
         and a.status in ('submitted', 'shortlisted')) > 20 then
    raise exception 'too many live applications' using errcode = '54000';
  end if;
  return null;
end;
$$;

create trigger applications_after_insert
  after insert on public.job_applications
  for each row execute function private.applications_after_insert();

-- 3. Status moves ------------------------------------------------------------------------
-- Applicant: submitted or shortlisted -> withdrawn.
-- Poster: submitted -> shortlisted or rejected; shortlisted -> rejected.
-- Rejected and withdrawn are final. A call with no signed-in user (maintenance)
-- is not restricted.
create function private.applications_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or new.status = old.status then
    return new;
  end if;

  if caller = old.applicant_id then
    if new.status <> 'withdrawn' or old.status not in ('submitted', 'shortlisted') then
      raise exception 'that move is not possible' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.jobs j where j.id = old.job_id and j.poster_id = caller) then
    if not (
      (old.status = 'submitted' and new.status in ('shortlisted', 'rejected'))
      or (old.status = 'shortlisted' and new.status = 'rejected')
    ) then
      raise exception 'that move is not possible' using errcode = '22023';
    end if;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger applications_before_update
  before update on public.job_applications
  for each row execute function private.applications_before_update();

revoke all on function private.jobs_after_write() from public;
revoke all on function private.applications_after_insert() from public;
revoke all on function private.applications_before_update() from public;

-- 4. Privileges -------------------------------------------------------------------------
revoke all on public.jobs, public.job_applications from anon, authenticated;

grant select, delete on public.jobs to authenticated;
grant insert (title, company, location, job_type, description) on public.jobs to authenticated;
grant update (title, company, location, job_type, description, status) on public.jobs to authenticated;

grant select on public.job_applications to authenticated;
grant insert (job_id, message) on public.job_applications to authenticated;
grant update (status) on public.job_applications to authenticated;

-- 5. Row Level Security -----------------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;

create policy jobs_select
  on public.jobs for select to authenticated
  using (
    poster_id = (select auth.uid())
    or (select private.is_admin())
    or (status = 'active' and (select private.is_verified()))
  );

create policy jobs_insert
  on public.jobs for insert to authenticated
  with check (poster_id = (select auth.uid()) and (select private.is_verified_alumni()));

create policy jobs_update
  on public.jobs for update to authenticated
  using (poster_id = (select auth.uid()))
  with check (poster_id = (select auth.uid()));

create policy jobs_delete
  on public.jobs for delete to authenticated
  using (poster_id = (select auth.uid()));

-- The applicant, the poster of the job, or an admin.
create policy applications_select
  on public.job_applications for select to authenticated
  using (
    applicant_id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.jobs j
       where j.id = job_applications.job_id and j.poster_id = (select auth.uid())
    )
  );

-- A verified member applies to an active job that is not their own.
create policy applications_insert
  on public.job_applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and (select private.is_verified())
    and exists (
      select 1 from public.jobs j
       where j.id = job_applications.job_id
         and j.status = 'active'
         and j.poster_id <> (select auth.uid())
    )
  );

create policy applications_update
  on public.job_applications for update to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j
       where j.id = job_applications.job_id and j.poster_id = (select auth.uid())
    )
  )
  with check (
    applicant_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j
       where j.id = job_applications.job_id and j.poster_id = (select auth.uid())
    )
  );
