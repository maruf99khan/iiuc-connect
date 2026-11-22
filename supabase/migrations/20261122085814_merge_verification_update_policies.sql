-- =============================================================================
-- IIUC Connect — Migration 003: one UPDATE policy for verification_requests
--
-- Migration 002 used two permissive UPDATE policies (withdraw own, decide as
-- admin). Postgres OR-s permissive policies together, so every query evaluated
-- both, and the Supabase performance advisor flags the pair. One policy states
-- the same rule in one place, which is also easier to audit: each branch pairs
-- "who" with "which values", in both USING and WITH CHECK.
-- Behaviour is unchanged; supabase/tests/002_verification_flow.test.sql covers it.
-- =============================================================================

drop policy verification_requests_withdraw_own on public.verification_requests;
drop policy verification_requests_decide_admin on public.verification_requests;

create policy verification_requests_update
  on public.verification_requests for update
  to authenticated
  using (
    status = 'pending'
    and (
      -- a member's own open claim
      user_id = (select auth.uid())
      -- or, for an admin, someone else's open claim
      or ((select private.is_admin()) and user_id <> (select auth.uid()))
    )
  )
  with check (
    -- a member may only withdraw their own claim
    (user_id = (select auth.uid()) and status = 'cancelled')
    -- an admin may only approve or reject someone else's claim
    or (
      (select private.is_admin())
      and user_id <> (select auth.uid())
      and status in ('approved', 'rejected')
    )
  );
