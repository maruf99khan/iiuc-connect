-- =============================================================================
-- IIUC Connect — Migration 010: scheduled mentorship jobs (pg_cron)
-- Sprint 6, part 3. Expiry and nightly slot generation run inside the database.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Marks pending requests whose time is up as expired. The request trigger lets
-- only a caller with no signed-in user make this move; its AFTER trigger then
-- reopens the slot.
create function private.expire_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.mentorship_requests
     set status = 'expired'
   where status = 'pending' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.expire_requests() from public;

select cron.schedule(
  'expire-mentorship-requests', '*/15 * * * *', 'select private.expire_requests()');
select cron.schedule(
  'generate-mentor-slots', '0 20 * * *', 'select private.generate_slots(null)');
