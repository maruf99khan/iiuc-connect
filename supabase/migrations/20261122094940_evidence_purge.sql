-- =============================================================================
-- IIUC Connect — Migration 006: finding evidence files that must be deleted
--
-- Identity documents must not outlive their purpose. Two kinds of file qualify:
--   * retention: a document whose claim was decided (approved, rejected or
--     withdrawn) more than N days ago;
--   * orphan: a stored file that no claim record points to (its account was
--     deleted, or an upload failed half way) and is more than a day old.
--
-- Supabase blocks deleting storage rows from SQL, so the files themselves are
-- removed through the Storage API by a server job (app/api/cron/purge-evidence)
-- that uses the service role. These two functions only tell that job what to
-- delete and record that it did. They are callable by the service role alone;
-- members and visitors cannot execute them even though the schema is exposed.
-- =============================================================================

create function public.evidence_purge_candidates(
  p_retention_days integer default 30,
  p_limit integer default 100
)
returns table (path text, document_id uuid, reason text)
language sql
stable
set search_path = ''
as $$
  (select d.storage_path, d.id, 'retention'::text
     from public.verification_documents d
     join public.verification_requests r on r.id = d.request_id
    where d.purged_at is null
      and r.status <> 'pending'
      and r.decided_at < now() - make_interval(days => p_retention_days)
    order by r.decided_at
    limit p_limit)
  union all
  (select o.name, null::uuid, 'orphan'::text
     from storage.objects o
    where o.bucket_id = 'verification-documents'
      and o.created_at < now() - interval '1 day'
      and not exists (
        select 1 from public.verification_documents d where d.storage_path = o.name
      )
    order by o.created_at
    limit p_limit);
$$;

create function public.mark_evidence_purged(p_document_ids uuid[])
returns integer
language sql
set search_path = ''
as $$
  with marked as (
    update public.verification_documents
       set purged_at = now()
     where id = any (p_document_ids) and purged_at is null
    returning 1
  )
  select count(*)::integer from marked;
$$;

revoke all on function public.evidence_purge_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.mark_evidence_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.evidence_purge_candidates(integer, integer) to service_role;
grant execute on function public.mark_evidence_purged(uuid[]) to service_role;
