-- =============================================================================
-- IIUC Connect — Migration 001: identity schema
-- Sprint 1. Creates the identity tables, the verification state machine,
-- the append-only verification audit log, and all Row Level Security rules.
--
-- Design rules enforced here (see Decision Log D-004, D-006, D-008):
--   * RLS is enabled on every table in the same migration that creates it.
--   * Users can never write role, verification_status, affiliation or
--     reputation_score. Those change only through SECURITY DEFINER functions.
--   * Sensitive personal fields live in profile_private, not in profiles,
--     because RLS filters rows and cannot hide columns.
--   * verification_events is append-only for every role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Private schema for helper functions (not exposed through the Data API)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('member', 'admin');

create type public.affiliation as enum ('student', 'alumni');

create type public.verification_status as enum (
  'unverified',
  'email_verified',
  'affiliation_pending',
  'verified_student',
  'verified_alumni',
  'trusted_member'
);

create type public.profile_visibility as enum ('public', 'iiuc_community', 'private');

create type public.verification_method as enum ('institutional_email', 'document');

create type public.verification_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create type public.document_kind as enum (
  'student_id_card',
  'certificate',
  'transcript',
  'other'
);

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- 2.1 profiles: fields that are safe for anyone allowed to see the row.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '',
  headline            text,
  bio                 text,
  department          text,
  batch               text,
  graduation_year     integer,
  job_title           text,
  company             text,
  location            text,
  industry            text,
  skills              text[] not null default '{}',
  linkedin_url        text,
  avatar_path         text,
  visibility          public.profile_visibility not null default 'iiuc_community',
  onboarded_at        timestamptz,
  -- Privileged columns: never writable by API roles (see grants below).
  role                public.user_role not null default 'member',
  affiliation         public.affiliation,
  verification_status public.verification_status not null default 'unverified',
  reputation_score    integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_full_name_len check (char_length(full_name) <= 120),
  constraint profiles_headline_len check (headline is null or char_length(headline) <= 160),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 2000),
  constraint profiles_department_len check (department is null or char_length(department) <= 80),
  constraint profiles_batch_len check (batch is null or char_length(batch) <= 20),
  constraint profiles_graduation_year_range
    check (graduation_year is null or graduation_year between 1995 and 2100),
  constraint profiles_job_title_len check (job_title is null or char_length(job_title) <= 120),
  constraint profiles_company_len check (company is null or char_length(company) <= 120),
  constraint profiles_location_len check (location is null or char_length(location) <= 120),
  constraint profiles_industry_len check (industry is null or char_length(industry) <= 80),
  constraint profiles_skills_count check (cardinality(skills) <= 30),
  constraint profiles_linkedin_url_format
    check (linkedin_url is null
           or (char_length(linkedin_url) <= 300 and linkedin_url ~ '^https://')),
  constraint profiles_avatar_path_len check (avatar_path is null or char_length(avatar_path) <= 300),
  constraint profiles_reputation_nonnegative check (reputation_score >= 0)
);

comment on table public.profiles is
  'One row per user. Holds only fields safe for any viewer allowed to see the row. Sensitive fields are in profile_private.';

-- 2.2 profile_private: owner-and-admin-only fields.
create table public.profile_private (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  student_id          text,
  institutional_email text,
  phone               text,
  personal_email      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profile_private_student_id_len
    check (student_id is null or char_length(student_id) between 3 and 20),
  constraint profile_private_institutional_email_len
    check (institutional_email is null or char_length(institutional_email) <= 254),
  constraint profile_private_phone_len check (phone is null or char_length(phone) <= 20),
  constraint profile_private_personal_email_len
    check (personal_email is null or char_length(personal_email) <= 254)
);

comment on table public.profile_private is
  'Sensitive personal fields. Readable only by the owner and admins.';

-- 2.3 verification_requests: a claim of IIUC affiliation awaiting evidence or review.
create table public.verification_requests (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  method                  public.verification_method not null,
  claimed_affiliation     public.affiliation not null,
  claimed_student_id      text,
  claimed_department      text,
  claimed_batch           text,
  claimed_graduation_year integer,
  status                  public.verification_request_status not null default 'pending',
  reviewer_id             uuid references public.profiles (id) on delete set null,
  review_notes            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  decided_at              timestamptz,

  constraint verification_requests_student_id_len
    check (claimed_student_id is null or char_length(claimed_student_id) between 3 and 20),
  constraint verification_requests_department_len
    check (claimed_department is null or char_length(claimed_department) <= 80),
  constraint verification_requests_batch_len
    check (claimed_batch is null or char_length(claimed_batch) <= 20),
  constraint verification_requests_graduation_year_range
    check (claimed_graduation_year is null or claimed_graduation_year between 1995 and 2100),
  constraint verification_requests_review_notes_len
    check (review_notes is null or char_length(review_notes) <= 1000),
  constraint verification_requests_decision_consistent
    check ((status = 'pending' and decided_at is null)
           or (status <> 'pending' and decided_at is not null))
);

comment on table public.verification_requests is
  'Affiliation claims. Written only by SECURITY DEFINER functions; users and admins read through RLS.';

-- 2.4 verification_documents: evidence files in the private storage bucket.
create table public.verification_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.verification_requests (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.document_kind not null,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  purged_at    timestamptz,

  constraint verification_documents_storage_path_len
    check (char_length(storage_path) between 1 and 400)
);

comment on table public.verification_documents is
  'Pointers to identity documents in a private bucket. purged_at records when the file was deleted after the retention period.';

-- 2.5 verification_events: append-only audit log of every status transition.
create table public.verification_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  from_status  public.verification_status not null,
  to_status    public.verification_status not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  evidence_ref text,
  notes        text,
  created_at   timestamptz not null default now(),

  constraint verification_events_evidence_ref_len
    check (evidence_ref is null or char_length(evidence_ref) <= 400),
  constraint verification_events_notes_len
    check (notes is null or char_length(notes) <= 1000),
  constraint verification_events_status_changes check (from_status <> to_status)
);

comment on table public.verification_events is
  'Append-only audit log. No role may update or delete rows; user references are nulled when an account is deleted.';

-- -----------------------------------------------------------------------------
-- 3. Indexes (foreign keys and RLS predicate columns)
-- -----------------------------------------------------------------------------
create index profiles_verification_status_idx on public.profiles (verification_status);
create index profiles_visibility_idx on public.profiles (visibility);
create index profiles_dept_batch_year_idx
  on public.profiles (department, batch, graduation_year);
create index profiles_role_admin_idx on public.profiles (id) where role = 'admin';

create unique index profile_private_student_id_key
  on public.profile_private (student_id) where student_id is not null;
create unique index profile_private_institutional_email_key
  on public.profile_private (lower(institutional_email))
  where institutional_email is not null;

create index verification_requests_user_id_idx on public.verification_requests (user_id);
create index verification_requests_reviewer_id_idx on public.verification_requests (reviewer_id);
create index verification_requests_queue_idx
  on public.verification_requests (created_at) where status = 'pending';
-- At most one open claim per user.
create unique index verification_requests_one_pending_per_user
  on public.verification_requests (user_id) where status = 'pending';

create index verification_documents_request_id_idx on public.verification_documents (request_id);
create index verification_documents_user_id_idx on public.verification_documents (user_id);

create index verification_events_user_id_created_idx
  on public.verification_events (user_id, created_at desc);
create index verification_events_actor_id_idx on public.verification_events (actor_id);

-- -----------------------------------------------------------------------------
-- 4. Helper functions
-- -----------------------------------------------------------------------------

-- 4.1 updated_at maintenance
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profile_private_set_updated_at
  before update on public.profile_private
  for each row execute function private.set_updated_at();

create trigger verification_requests_set_updated_at
  before update on public.verification_requests
  for each row execute function private.set_updated_at();

-- 4.2 Role checks used inside policies. SECURITY DEFINER so they can read
--     profiles without re-entering the profiles policies (no recursion).
create function private.is_admin()
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
      and p.role = 'admin'
  );
$$;

create function private.is_verified()
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
      and p.verification_status in ('verified_student', 'verified_alumni', 'trusted_member')
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_verified() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_verified() to anon, authenticated, service_role;

-- 4.3 The verification state machine.
create function private.is_allowed_transition(
  p_from public.verification_status,
  p_to   public.verification_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'unverified' then p_to in ('email_verified')
    when 'email_verified' then p_to in ('affiliation_pending', 'verified_student')
    when 'affiliation_pending' then p_to in ('verified_student', 'verified_alumni', 'email_verified')
    when 'verified_student' then p_to in ('verified_alumni', 'trusted_member', 'email_verified')
    when 'verified_alumni' then p_to in ('trusted_member', 'email_verified')
    when 'trusted_member' then p_to in ('verified_student', 'verified_alumni', 'email_verified')
    else false
  end;
$$;

comment on function private.is_allowed_transition(public.verification_status, public.verification_status) is
  'Single source of truth for which verification status changes are legal.';

-- The only code path that may change profiles.verification_status.
-- It changes the status and writes the audit event in one transaction.
create function private.transition_verification(
  p_user_id      uuid,
  p_to           public.verification_status,
  p_actor_id     uuid,
  p_evidence_ref text,
  p_notes        text
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.verification_status;
begin
  select p.verification_status
    into v_from
    from public.profiles p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if not private.is_allowed_transition(v_from, p_to) then
    raise exception 'invalid verification transition: % -> %', v_from, p_to
      using errcode = '22023';
  end if;

  update public.profiles
     set verification_status = p_to
   where id = p_user_id;

  insert into public.verification_events
    (user_id, from_status, to_status, actor_id, evidence_ref, notes)
  values
    (p_user_id, v_from, p_to, p_actor_id, p_evidence_ref, p_notes);

  return p_to;
end;
$$;

revoke all on function private.is_allowed_transition(public.verification_status, public.verification_status) from public;
revoke all on function private.transition_verification(uuid, public.verification_status, uuid, text, text) from public;
-- Deliberately no grant to anon/authenticated: callable only from other
-- SECURITY DEFINER functions and by the service role.
grant execute on function private.transition_verification(uuid, public.verification_status, uuid, text, text) to service_role;

-- 4.4 Append-only enforcement for verification_events.
create function private.verification_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'verification_events is append-only' using errcode = '42501';
  end if;

  -- The only permitted UPDATE is the foreign-key action that nulls a user
  -- reference when an account is deleted.
  if new.id is distinct from old.id
     or new.from_status is distinct from old.from_status
     or new.to_status is distinct from old.to_status
     or new.evidence_ref is distinct from old.evidence_ref
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or (new.user_id is not null and new.user_id is distinct from old.user_id)
     or (new.actor_id is not null and new.actor_id is distinct from old.actor_id)
  then
    raise exception 'verification_events is append-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger verification_events_no_update_delete
  before update or delete on public.verification_events
  for each row execute function private.verification_events_guard();

create function private.verification_events_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'verification_events is append-only' using errcode = '42501';
end;
$$;

create trigger verification_events_no_truncate
  before truncate on public.verification_events
  for each statement execute function private.verification_events_no_truncate();

-- 4.5 Create profile rows when an auth user is created, and record the
--     unverified -> email_verified transition when the email is confirmed.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.profile_private (user_id) values (new.id);

  if new.email_confirmed_at is not null then
    perform private.transition_verification(
      new.id, 'email_verified', null, 'auth:email_confirmed', null
    );
  end if;

  return new;
end;
$$;

create function private.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = new.id and p.verification_status = 'unverified'
  ) then
    perform private.transition_verification(
      new.id, 'email_verified', null, 'auth:email_confirmed', null
    );
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
revoke all on function private.handle_email_confirmed() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_email_confirmed();

-- -----------------------------------------------------------------------------
-- 5. Privileges
--    Start from nothing, then grant exactly what each role needs.
-- -----------------------------------------------------------------------------
revoke all on public.profiles               from anon, authenticated;
revoke all on public.profile_private        from anon, authenticated;
revoke all on public.verification_requests  from anon, authenticated;
revoke all on public.verification_documents from anon, authenticated;
revoke all on public.verification_events    from anon, authenticated;

-- profiles: everyone may attempt to read (RLS decides which rows);
-- signed-in users may update only the listed, non-privileged columns.
grant select on public.profiles to anon, authenticated;
grant update (
  full_name, headline, bio, department, batch, graduation_year,
  job_title, company, location, industry, skills, linkedin_url,
  avatar_path, visibility, onboarded_at
) on public.profiles to authenticated;

-- profile_private: owner reads; owner may edit contact fields only.
-- student_id and institutional_email are set by verification functions.
grant select on public.profile_private to authenticated;
grant update (phone, personal_email) on public.profile_private to authenticated;

-- Verification tables: read-only through the API. All writes go through
-- SECURITY DEFINER functions added with the verification flow.
grant select on public.verification_requests  to authenticated;
grant select on public.verification_documents to authenticated;
grant select on public.verification_events    to authenticated;

-- The audit log is append-only even for the service role.
revoke update, delete, truncate on public.verification_events from service_role;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.profile_private        enable row level security;
alter table public.verification_requests  enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_events    enable row level security;

-- 6.1 profiles
create policy profiles_select_anon
  on public.profiles for select
  to anon
  using (
    visibility = 'public'
    and verification_status in ('verified_student', 'verified_alumni', 'trusted_member')
  );

create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or (
      verification_status in ('verified_student', 'verified_alumni', 'trusted_member')
      and (
        visibility = 'public'
        or (visibility = 'iiuc_community' and (select private.is_verified()))
      )
    )
  );

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT or DELETE policy: rows are created by the auth trigger and
-- removed only by deleting the auth user.

-- 6.2 profile_private
create policy profile_private_select_own_or_admin
  on public.profile_private for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy profile_private_update_own
  on public.profile_private for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6.3 verification_requests
create policy verification_requests_select_own_or_admin
  on public.verification_requests for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- 6.4 verification_documents
create policy verification_documents_select_own_or_admin
  on public.verification_documents for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- 6.5 verification_events
create policy verification_events_select_own_or_admin
  on public.verification_events for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
