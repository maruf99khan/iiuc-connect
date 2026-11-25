-- =============================================================================
-- IIUC Connect — Migration 009b: break a policy cycle
-- The slot policy read mentorship_requests and the request insert policy read
-- mentor_slots. Postgres reports any cycle between the two tables as infinite
-- recursion, even for different commands. The slot policy now asks a definer
-- function, which is not expanded into the outer query.
-- =============================================================================

create function private.is_slot_requester(p_slot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mentorship_requests r
     where r.slot_id = p_slot and r.mentee_id = (select auth.uid())
  );
$$;

revoke all on function private.is_slot_requester(uuid) from public;
grant execute on function private.is_slot_requester(uuid) to authenticated;

drop policy mentor_slots_select on public.mentor_slots;
create policy mentor_slots_select
  on public.mentor_slots for select to authenticated
  using (
    mentor_id = (select auth.uid())
    or (select private.is_admin())
    or (select private.is_slot_requester(id))
    or (
      status = 'open'
      and starts_at > now()
      and (select private.is_verified())
      and exists (select 1 from public.profiles p where p.id = mentor_slots.mentor_id)
    )
  );
