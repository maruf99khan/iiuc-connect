-- =============================================================================
-- IIUC Connect — pgTAP tests for migration 001 (identity schema)
--
-- What this proves:
--   * RLS is on for every table.
--   * The auth triggers create profile rows and record the first transition.
--   * The verification state machine rejects illegal transitions.
--   * verification_events is append-only for every role, including owners.
--   * anon, signed-in, verified, admin and service roles each see and change
--     exactly what the RLS matrix allows, and are denied everything else.
--
-- How to run:
--   The whole file is one transaction that is rolled back, so it leaves no
--   data behind. Each assertion is written into a temp table (_tap_out) and
--   the final SELECT returns the TAP report. This makes the file runnable
--   both with `supabase test db` and through a single SQL call against the
--   hosted database.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

insert into _tap_out (line) select extensions.plan(46);

-- -----------------------------------------------------------------------------
-- Fixtures (fictional users)
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconfirmed@test.invalid', null),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plain@test.invalid',       now()),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'student@test.invalid',     now()),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumni@test.invalid',      now()),
  ('a0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hidden@test.invalid',      now()),
  ('a0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid',       now()),
  ('a0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gone@test.invalid',        now()),
  ('a0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pubunverified@test.invalid', now());

-- -----------------------------------------------------------------------------
-- 1. Structure
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public has RLS enabled');

-- -----------------------------------------------------------------------------
-- 2. Auth triggers
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'unverified',
  'unconfirmed signup gets a profile with status unverified');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events where user_id = 'a0000000-0000-4000-8000-000000000001'),
  0,
  'unconfirmed signup has no verification events');

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000002'),
  'email_verified',
  'confirmed signup is moved to email_verified');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events
    where user_id = 'a0000000-0000-4000-8000-000000000002'
      and from_status = 'unverified' and to_status = 'email_verified'),
  1,
  'confirmed signup has exactly one audit event for that transition');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profile_private
    where user_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002')),
  2,
  'signup also creates the profile_private row');

update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-4000-8000-000000000001';

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'email_verified',
  'confirming the email later moves the user to email_verified');

-- -----------------------------------------------------------------------------
-- 3. State machine
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.transition_verification('a0000000-0000-4000-8000-000000000002', 'verified_alumni', null, 'test', null) $$,
  '22023', null,
  'illegal transition email_verified -> verified_alumni is rejected');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.transition_verification('a0000000-0000-4000-8000-000000000002', 'trusted_member', null, 'test', null) $$,
  '22023', null,
  'illegal transition email_verified -> trusted_member is rejected');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.transition_verification('b0000000-0000-4000-8000-00000000dead', 'email_verified', null, 'test', null) $$,
  'P0002', null,
  'transition for a missing profile is rejected');

-- Legal paths used to build the remaining fixtures.
select private.transition_verification('a0000000-0000-4000-8000-000000000003', 'verified_student', null, 'test:mailbox', null);
select private.transition_verification('a0000000-0000-4000-8000-000000000004', 'affiliation_pending', null, 'test:request', null);
select private.transition_verification('a0000000-0000-4000-8000-000000000004', 'verified_alumni', 'a0000000-0000-4000-8000-000000000006', 'test:document', 'approved');
select private.transition_verification('a0000000-0000-4000-8000-000000000005', 'affiliation_pending', null, 'test:request', null);
select private.transition_verification('a0000000-0000-4000-8000-000000000005', 'verified_alumni', 'a0000000-0000-4000-8000-000000000006', 'test:document', 'approved');
select private.transition_verification('a0000000-0000-4000-8000-000000000007', 'verified_student', null, 'test:gone-marker', null);

update public.profiles set visibility = 'public',         full_name = 'Test Student' where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set visibility = 'iiuc_community', full_name = 'Test Alumni'  where id = 'a0000000-0000-4000-8000-000000000004';
update public.profiles set visibility = 'private',        full_name = 'Test Hidden'  where id = 'a0000000-0000-4000-8000-000000000005';
update public.profiles set role = 'admin',                full_name = 'Test Admin'   where id = 'a0000000-0000-4000-8000-000000000006';
update public.profiles set visibility = 'public',         full_name = 'Test Public Unverified' where id = 'a0000000-0000-4000-8000-000000000008';
update public.profile_private set student_id = 'T000003' where user_id = 'a0000000-0000-4000-8000-000000000003';

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events where user_id = 'a0000000-0000-4000-8000-000000000004'),
  3,
  'each legal transition writes exactly one audit event');

insert into _tap_out (line) select extensions.is(
  (select actor_id::text from public.verification_events
    where user_id = 'a0000000-0000-4000-8000-000000000004' and to_status = 'verified_alumni'),
  'a0000000-0000-4000-8000-000000000006',
  'the audit event records the acting admin');

-- -----------------------------------------------------------------------------
-- 4. Audit log is append-only, even for the table owner
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_events set notes = 'tampered' where user_id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'owner cannot UPDATE verification_events');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_events set to_status = 'trusted_member' where user_id = 'a0000000-0000-4000-8000-000000000004' and to_status = 'verified_alumni' $$,
  '42501', null,
  'owner cannot rewrite the status recorded in an event');

insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.verification_events where user_id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'owner cannot DELETE from verification_events');

insert into _tap_out (line) select extensions.throws_ok(
  $$ truncate public.verification_events $$,
  '42501', null,
  'owner cannot TRUNCATE verification_events');

insert into _tap_out (line) select extensions.lives_ok(
  $$ delete from auth.users where id = 'a0000000-0000-4000-8000-000000000007' $$,
  'deleting an account is still possible');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events
    where evidence_ref = 'test:gone-marker' and user_id is null),
  1,
  'after account deletion the audit event survives with the user reference nulled');

-- -----------------------------------------------------------------------------
-- 5. anon
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into _tap_out (line) select extensions.is(
  (select array_agg(full_name order by full_name) from public.profiles
    where id::text like 'a0000000-0000-4000-8000-%'),
  array['Test Student'],
  'anon sees only verified profiles that are public');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.profile_private $$, '42501', null,
  'anon cannot read profile_private');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.verification_events $$, '42501', null,
  'anon cannot read verification_events');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.verification_requests $$, '42501', null,
  'anon cannot read verification_requests');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set full_name = 'x' where id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', null,
  'anon cannot update profiles');

reset role;

-- -----------------------------------------------------------------------------
-- 6. Signed-in but not yet verified (user 2)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select array_agg(id::text order by id::text) from public.profiles
    where id::text like 'a0000000-0000-4000-8000-%'),
  array['a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003'],
  'unverified member sees own profile and public verified profiles only');

insert into _tap_out (line) select extensions.is(
  (select array_agg(user_id::text) from public.profile_private),
  array['a0000000-0000-4000-8000-000000000002'],
  'member sees only their own profile_private row');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events
    where user_id <> 'a0000000-0000-4000-8000-000000000002'),
  0,
  'member cannot see other users'' verification events');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events
    where user_id = 'a0000000-0000-4000-8000-000000000002'),
  1,
  'member can see their own verification events');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles set full_name = 'Plain Member', headline = 'Hello' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  'member can update their own editable profile fields');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set verification_status = 'verified_alumni' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'member cannot change their own verification_status');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'member cannot make themselves admin');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set reputation_score = 999, affiliation = 'alumni' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'member cannot change reputation_score or affiliation');

-- Cross-user write: RLS hides the row, so the statement succeeds but changes nothing.
update public.profiles set full_name = 'HACKED' where id = 'a0000000-0000-4000-8000-000000000003';

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.profiles (id) values ('b0000000-0000-4000-8000-000000000099') $$,
  '42501', null,
  'member cannot insert profiles');

insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.profiles where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'member cannot delete profiles');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.transition_verification('a0000000-0000-4000-8000-000000000002', 'verified_student', null, 'self', null) $$,
  '42501', null,
  'member cannot call the transition function directly');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_events (user_id, from_status, to_status) values ('a0000000-0000-4000-8000-000000000002', 'email_verified', 'verified_student') $$,
  '42501', null,
  'member cannot forge an audit event');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (user_id, method, claimed_affiliation) values ('a0000000-0000-4000-8000-000000000002', 'document', 'alumni') $$,
  '42501', null,
  'member cannot insert verification_requests directly');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profile_private set student_id = 'C999999' where user_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'member cannot set their own student_id');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profile_private set phone = '01700000000' where user_id = 'a0000000-0000-4000-8000-000000000002' $$,
  'member can update their own contact fields');

reset role;

insert into _tap_out (line) select extensions.is(
  (select full_name from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
  'Test Student',
  'cross-user profile update changed nothing');

-- -----------------------------------------------------------------------------
-- 7. Verified student (user 3)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select array_agg(full_name order by full_name) from public.profiles
    where id::text like 'a0000000-0000-4000-8000-%'),
  array['Test Alumni', 'Test Student'],
  'verified member sees public and community profiles, not private or unverified ones');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profile_private
    where user_id <> 'a0000000-0000-4000-8000-000000000003'),
  0,
  'verified member still cannot read other users'' private fields');

reset role;

-- -----------------------------------------------------------------------------
-- 8. Admin (user 6)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where id::text like 'a0000000-0000-4000-8000-%'),
  7,
  'admin sees every profile');

insert into _tap_out (line) select extensions.is(
  (select student_id from public.profile_private where user_id = 'a0000000-0000-4000-8000-000000000003'),
  'T000003',
  'admin can read private fields for review');

insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.verification_events
    where user_id = 'a0000000-0000-4000-8000-000000000004') = 3,
  'admin can read any user''s verification events');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set verification_status = 'trusted_member' where id = 'a0000000-0000-4000-8000-000000000003' $$,
  '42501', null,
  'even an admin cannot change verification_status with a direct update');

reset role;

-- -----------------------------------------------------------------------------
-- 9. Service role
-- -----------------------------------------------------------------------------
set local role service_role;

insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.verification_events $$, '42501', null,
  'service role cannot delete audit events');

reset role;

-- -----------------------------------------------------------------------------
-- Report
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select * from extensions.finish();
-- One column only: pg_prove (behind `supabase test db`) parses each row as a
-- TAP line, so a leading sequence number would hide every result from it.
select line from _tap_out order by seq;

rollback;
