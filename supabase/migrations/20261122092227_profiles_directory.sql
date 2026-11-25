-- =============================================================================
-- IIUC Connect — Migration 004: profile editing and directory search
-- Sprint 4.
--
--   * One lower-case search_text column, kept in step by a trigger and indexed
--     with pg_trgm, so a case-insensitive "contains" search over name, headline,
--     job, company, place, industry, department, batch and skills is fast.
--     The app searches it with ILIKE, one condition per word. It adds no new
--     visibility: a query only ever returns rows the viewer may already read
--     (the Sprint 1 policies), and it holds nothing that is not already in the row.
--   * What an admin approved is no longer editable by the member: department,
--     batch and graduation year lose their column grant, and a verified member's
--     name is locked. Both are what a directory filtered by those fields relies on.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Search column
-- -----------------------------------------------------------------------------
alter table public.profiles add column search_text text not null default '';

create function private.profiles_set_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(btrim(
    coalesce(new.full_name, '')  || ' ' || coalesce(new.headline, '')   || ' ' ||
    coalesce(new.job_title, '')  || ' ' || coalesce(new.company, '')    || ' ' ||
    coalesce(new.location, '')   || ' ' || coalesce(new.industry, '')   || ' ' ||
    coalesce(new.department, '') || ' ' || coalesce(new.batch, '')      || ' ' ||
    array_to_string(new.skills, ' ')
  ));
  return new;
end;
$$;

revoke all on function private.profiles_set_search_text() from public;

create trigger profiles_set_search_text
  before insert or update on public.profiles
  for each row execute function private.profiles_set_search_text();

-- Fill the column for rows that already exist (fires the trigger).
update public.profiles set full_name = full_name;

create index profiles_search_text_idx
  on public.profiles using gin (search_text extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 2. Lock what an admin approved
-- -----------------------------------------------------------------------------
-- Approval sets these through a SECURITY DEFINER trigger, which is unaffected.
revoke update (department, batch, graduation_year) on public.profiles from authenticated;

-- Column grants cannot depend on a row's state, so the name is guarded by a
-- trigger. It only applies to callers signed in through the API (auth.uid() is
-- set); the SQL editor and the service role are not affected.
create function private.profiles_lock_verified_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name
     and old.verification_status in ('verified_student', 'verified_alumni', 'trusted_member')
     and (select auth.uid()) is not null then
    raise exception 'a verified member cannot change their name'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.profiles_lock_verified_name() from public;

create trigger profiles_lock_verified_name
  before update of full_name on public.profiles
  for each row execute function private.profiles_lock_verified_name();
