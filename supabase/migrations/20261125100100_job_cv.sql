-- =============================================================================
-- IIUC Connect — an optional PDF CV on each job application (D-025)
--
-- Who can open a CV: the applicant, and the poster of the job while the
-- application is not withdrawn. Nobody else, admins included: a CV holds phone
-- numbers and addresses and no one needs it for moderation.
--
-- The file lives in the private bucket application-cvs at
-- {applicant_id}/{application_id}.pdf. A check constraint makes cv_path match
-- that shape, so an application can point only at the applicant's own file for
-- that very application. The path is set when the application is sent and
-- cannot be changed afterwards (to change a CV, withdraw and apply again).
--
-- Supabase blocks deleting storage rows from SQL, so files are removed through
-- the Storage API by the daily server job; public.cv_purge_candidates only
-- tells it which files qualify, and only the service role may call it.
-- =============================================================================

-- 1. The application's CV path -------------------------------------------------
alter table public.job_applications add column cv_path text;

alter table public.job_applications add constraint applications_cv_path_shape
  check (cv_path is null or cv_path = applicant_id::text || '/' || id::text || '.pdf');

-- id is supplied by the app so the file name and the row can agree before insert.
grant insert (id, cv_path) on public.job_applications to authenticated;

-- 2. The private bucket --------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-cvs', 'application-cvs', false, 2 * 1024 * 1024, array['application/pdf'])
on conflict (id) do nothing;

-- Whether the signed-in member may read this file. SECURITY DEFINER so the
-- storage policy does not depend on the caller's own row-level rules for the
-- jobs and applications tables.
create function private.can_read_cv(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] = (select auth.uid())::text
      or exists (
           select 1
             from public.job_applications a
             join public.jobs j on j.id = a.job_id
            where a.cv_path = p_name
              and a.status <> 'withdrawn'
              and j.poster_id = (select auth.uid())
         );
$$;

revoke all on function private.can_read_cv(text) from public;
grant execute on function private.can_read_cv(text) to authenticated, service_role;

-- Upload: a verified member, into their own folder, one PDF named by a uuid.
-- There is no update or delete policy, so a file cannot be swapped through the API.
create policy application_cvs_upload_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'application-cvs'
    and (select private.is_verified())
    and name ~ ('^' || (select auth.uid())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
  );

create policy application_cvs_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'application-cvs'
    and (select private.can_read_cv(name))
  );

-- 3. Files the server job must delete -------------------------------------------
--   orphan:    no application points at the file and it is over a day old
--              (an upload that failed half way, or the job was deleted);
--   withdrawn: the application was withdrawn over a day ago.
create function public.cv_purge_candidates(p_limit integer default 100)
returns table (path text, reason text)
language sql
stable
set search_path = ''
as $$
  select o.name,
         case when a.id is null then 'orphan' else 'withdrawn' end
    from storage.objects o
    left join public.job_applications a on a.cv_path = o.name
   where o.bucket_id = 'application-cvs'
     and o.created_at < now() - interval '1 day'
     and (a.id is null
          or (a.status = 'withdrawn' and a.updated_at < now() - interval '1 day'))
   order by o.created_at
   limit p_limit;
$$;

revoke all on function public.cv_purge_candidates(integer) from public, anon, authenticated;
grant execute on function public.cv_purge_candidates(integer) to service_role;
