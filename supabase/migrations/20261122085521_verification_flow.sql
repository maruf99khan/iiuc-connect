-- =============================================================================
-- IIUC Connect — Migration 002: affiliation verification flow (document method)
-- Sprint 3. A member who has confirmed their email claims to be an IIUC student
-- or graduate and attaches evidence; an admin approves or rejects the claim.
--
-- Design (extends Decision Log D-004, D-006, D-008):
--   * No public RPC functions. Members and admins write to verification_requests
--     under Row Level Security with column-level grants; SECURITY DEFINER
--     triggers in the private schema do the privileged part (moving the
--     verification status, copying approved details onto the profile, writing
--     the audit event) in the same transaction as the write.
--   * A permissive UPDATE policy's WITH CHECK is OR-ed with every other
--     permissive policy's WITH CHECK, not just the one that exposed the row.
--     So each WITH CHECK below repeats its whole condition (who may do it AND
--     which values are allowed). Dropping a clause lets a member approve their
--     own claim. supabase/tests/002_verification_flow.test.sql guards this.
--   * Evidence files go in a private bucket, one folder per member. Members can
--     upload and read their own files; nobody but the service role can change
--     or delete them (retention purging is a later sprint).
--   * Only the 'document' method is open. The 'institutional_email' method
--     needs the IIUC email domain and a working mailer; both are undecided.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table rules
-- -----------------------------------------------------------------------------
-- The owner of a new row is the caller; the API never needs to send user_id.
alter table public.verification_requests  alter column user_id set default auth.uid();
alter table public.verification_documents alter column user_id set default auth.uid();

alter table public.verification_requests
  add constraint verification_requests_document_claim_complete
    check (method <> 'document'
           or (claimed_student_id is not null
               and claimed_department is not null
               and claimed_batch is not null)),
  add constraint verification_requests_alumni_needs_graduation_year
    check (claimed_affiliation <> 'alumni' or claimed_graduation_year is not null),
  add constraint verification_requests_rejection_needs_reason
    check (status <> 'rejected'
           or (review_notes is not null and btrim(review_notes) <> ''));

-- -----------------------------------------------------------------------------
-- 2. Trigger functions
-- -----------------------------------------------------------------------------

-- 2.1 Before a claim is decided: stamp who and when. A decided claim is final.
create function private.verification_requests_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pending' then
    raise exception 'a decided verification request cannot be changed'
      using errcode = '22023';
  end if;

  if new.status = 'pending' then
    return new;
  end if;

  new.decided_at := now();
  if new.status in ('approved', 'rejected') then
    new.reviewer_id := auth.uid();
  end if;

  return new;
end;
$$;

-- 2.2 After a claim is submitted: the member becomes affiliation_pending.
--     The state machine rejects this unless the email is already confirmed.
create function private.verification_requests_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.transition_verification(
    new.user_id, 'affiliation_pending', new.user_id,
    'request:' || new.id::text, null
  );
  return new;
end;
$$;

-- 2.3 After a claim is decided or withdrawn.
create function private.verification_requests_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'pending' or new.status = 'pending' then
    return new;
  end if;

  if new.status = 'approved' then
    perform private.transition_verification(
      new.user_id,
      case new.claimed_affiliation
        when 'student' then 'verified_student'::public.verification_status
        else 'verified_alumni'::public.verification_status
      end,
      new.reviewer_id, 'request:' || new.id::text, new.review_notes
    );

    update public.profiles
       set affiliation     = new.claimed_affiliation,
           department      = new.claimed_department,
           batch           = new.claimed_batch,
           graduation_year = coalesce(new.claimed_graduation_year, graduation_year)
     where id = new.user_id;

    -- Raises unique_violation when another member already holds this ID, which
    -- rolls the whole approval back and tells the admin why.
    update public.profile_private
       set student_id = new.claimed_student_id
     where user_id = new.user_id;
  else
    -- rejected or cancelled: back to a confirmed email, nothing else changes.
    perform private.transition_verification(
      new.user_id, 'email_verified',
      coalesce(new.reviewer_id, auth.uid()),
      'request:' || new.id::text,
      case when new.status = 'rejected' then new.review_notes end
    );
  end if;

  return new;
end;
$$;

-- 2.4 At most three evidence files per claim.
create function private.verification_documents_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*)
        from public.verification_documents d
       where d.request_id = new.request_id) >= 3 then
    raise exception 'a verification request can have at most 3 documents'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.verification_requests_before_update()  from public;
revoke all on function private.verification_requests_after_insert()   from public;
revoke all on function private.verification_requests_after_update()   from public;
revoke all on function private.verification_documents_limit()         from public;

create trigger verification_requests_before_update
  before update on public.verification_requests
  for each row execute function private.verification_requests_before_update();

create trigger verification_requests_after_insert
  after insert on public.verification_requests
  for each row execute function private.verification_requests_after_insert();

create trigger verification_requests_after_update
  after update of status on public.verification_requests
  for each row execute function private.verification_requests_after_update();

create trigger verification_documents_limit
  before insert on public.verification_documents
  for each row execute function private.verification_documents_limit();

-- -----------------------------------------------------------------------------
-- 3. Privileges (column level: nothing else is writable through the API)
-- -----------------------------------------------------------------------------
grant insert (method, claimed_affiliation, claimed_student_id, claimed_department,
              claimed_batch, claimed_graduation_year)
  on public.verification_requests to authenticated;

-- One grant serves two roles; the policies below decide who may use it.
grant update (status, review_notes)
  on public.verification_requests to authenticated;

grant insert (request_id, kind, storage_path)
  on public.verification_documents to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

-- 4.1 verification_requests
create policy verification_requests_insert_own
  on public.verification_requests for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and method = 'document'
  );

-- A member may withdraw their own open claim, and nothing else.
create policy verification_requests_withdraw_own
  on public.verification_requests for update
  to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'cancelled');

-- An admin may decide someone else's open claim, and nothing else.
create policy verification_requests_decide_admin
  on public.verification_requests for update
  to authenticated
  using (
    (select private.is_admin())
    and user_id <> (select auth.uid())
    and status = 'pending'
  )
  with check (
    (select private.is_admin())
    and user_id <> (select auth.uid())
    and status in ('approved', 'rejected')
  );

-- 4.2 verification_documents: attach evidence to your own open claim.
create policy verification_documents_insert_own
  on public.verification_documents for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.verification_requests r
       where r.id = request_id
         and r.user_id = (select auth.uid())
         and r.status = 'pending'
    )
    and starts_with(
      storage_path,
      (select auth.uid())::text || '/' || request_id::text || '/'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Private storage bucket for evidence files
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents', 'verification-documents', false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- First path segment is the owner's user id. No UPDATE or DELETE policy exists,
-- so evidence cannot be swapped or removed after upload.
create policy verification_documents_upload_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy verification_documents_read_own_or_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );
