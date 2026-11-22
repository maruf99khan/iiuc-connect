-- =============================================================================
-- IIUC Connect — pgTAP tests for migration 007 (mentorship sessions)
--
-- What this proves:
--   * Only a verified graduate can offer time slots, within limits.
--   * Only verified members see open slots, and never those of a private mentor.
--   * Booking, releasing and cancelling follow fixed rules; nobody can book for
--     someone else, book their own slot, or forge a booker.
--   * The meeting link is visible only to the mentor and the person who booked.
--
-- Runs in one transaction that is rolled back; results go through a temp table
-- so the file works with `supabase test db` and as a single SQL call.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

insert into _tap_out (line) select extensions.plan(34);

-- Fixtures: 01 Mona (graduate mentor), 02 Sam and 03 Sue (verified students),
-- 04 Uma (email confirmed only), 05 Pete (graduate mentor, private profile).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a5000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'm' || n || '@test.invalid', now()
from generate_series(1, 5) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles where id in ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005');
select private.transition_verification('a5000000-0000-4000-8000-000000000001', 'verified_alumni', null, 'test', null);
select private.transition_verification('a5000000-0000-4000-8000-000000000005', 'verified_alumni', null, 'test', null);
select private.transition_verification('a5000000-0000-4000-8000-000000000002', 'verified_student', null, 'test', null);
select private.transition_verification('a5000000-0000-4000-8000-000000000003', 'verified_student', null, 'test', null);

update public.profiles set full_name = 'Mona Mentor', affiliation = 'alumni', visibility = 'iiuc_community' where id = 'a5000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Pete Private', affiliation = 'alumni', visibility = 'private'        where id = 'a5000000-0000-4000-8000-000000000005';
update public.profiles set full_name = 'Sam Student',  affiliation = 'student', visibility = 'iiuc_community' where id = 'a5000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Sue Student',  affiliation = 'student', visibility = 'iiuc_community' where id = 'a5000000-0000-4000-8000-000000000003';

-- -----------------------------------------------------------------------------
-- 1. Offering slots
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic)
     values (now() + interval '2 days', 30, 'Slot A') $$,
  'a verified graduate can offer a slot');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() - interval '1 day', 30, 'Past') $$,
  '22023', null, 'a slot in the past is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '10 minutes', 30, 'Too soon') $$,
  '22023', null, 'a slot starting within 30 minutes is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '90 days', 30, 'Too far') $$,
  '22023', null, 'a slot more than 60 days away is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '2 days', 20, 'Odd length') $$,
  '23514', null, 'only 15 and 30 minute sessions are allowed');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_slot_links (slot_id, meeting_url)
     select id, 'https://meet.example/abc' from public.mentor_slots where topic = 'Slot A' $$,
  'the mentor can attach a meeting link');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slot_links (slot_id, meeting_url)
     select id, 'http://meet.example/abc' from public.mentor_slots where topic = 'Slot A' $$,
  '23514', null, 'a meeting link must use https');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic)
     select now() + interval '3 days' + (n || ' hours')::interval, 15, 'Open slot ' || n from generate_series(1, 9) n $$,
  'a mentor can have up to 10 open slots');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '4 days', 15, 'Eleventh') $$,
  '54000', null, 'an eleventh open slot is refused');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '2 days', 30, 'Student slot') $$,
  '42501', null, 'a student cannot offer slots');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into public.mentor_slots (starts_at, duration_minutes, topic) values (now() + interval '2 days', 30, 'Private slot');

-- -----------------------------------------------------------------------------
-- 2. Who can see open slots
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots),
  10,
  'a verified member sees a mentor''s 10 open slots');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where topic = 'Private slot'),
  0,
  'a private mentor''s slots are hidden');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slot_links),
  0,
  'the meeting link is hidden before booking');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots),
  0,
  'a member who is not verified sees no slots');

-- -----------------------------------------------------------------------------
-- 3. Booking
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000003' where topic = 'Open slot 1' $$,
  '42501', null, 'a member cannot book a slot in someone else''s name');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'cancelled' where topic = 'Open slot 1' $$,
  '42501', null, 'a member cannot cancel a mentor''s open slot');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set starts_at = now() + interval '5 days' where topic = 'Open slot 1' $$,
  '42501', null, 'a member cannot move a slot');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000002', booker_note = 'Hello'
      where topic = 'Slot A' $$,
  'a verified member can book an open slot');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slot_links),
  1,
  'the person who booked can see the meeting link');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where topic = 'Slot A')
  + (select count(*)::int from public.mentor_slot_links),
  0,
  'another member sees neither a booked slot nor its link');

update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000003' where topic = 'Slot A';

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000001' where topic = 'Open slot 2' $$,
  '42501', null, 'a mentor cannot book their own slot');

insert into _tap_out (line) select extensions.is(
  (select booked_by::text || '/' || booker_note from public.mentor_slots where topic = 'Slot A'),
  'a5000000-0000-4000-8000-000000000002/Hello',
  'the mentor sees who booked and their note, and a second booking attempt changed nothing');

-- -----------------------------------------------------------------------------
-- 4. Releasing, limits and cancelling
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentor_slots set status = 'open', booked_by = null where topic = 'Slot A' $$,
  'the person who booked can release the slot');

insert into _tap_out (line) select extensions.ok(
  (select status = 'open' and booked_by is null and booker_note is null and booked_at is null
     from public.mentor_slots where topic = 'Slot A')
  and (select count(*) from public.mentor_slot_links) = 0,
  'releasing clears the booking and hides the link again');

update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000002' where topic = 'Open slot 1';
update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000002' where topic = 'Open slot 2';
update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000002' where topic = 'Open slot 3';

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000002' where topic = 'Open slot 4' $$,
  '54000', null, 'a fourth active booking is refused');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'cancelled', booked_by = 'a5000000-0000-4000-8000-000000000003' where topic = 'Open slot 5' $$,
  '22023', null, 'a mentor cannot attach a booker while cancelling');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentor_slots set status = 'cancelled' where topic = 'Open slot 1' $$,
  'a mentor can cancel a booked slot');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (starts_at, duration_minutes, topic)
     select now() + interval '6 days' + (n || ' hours')::interval, 15, 'Burst ' || n from generate_series(1, 5) n $$,
  '54000', null, 'one request cannot add more slots than the open-slot limit');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select status from public.mentor_slots where topic = 'Open slot 1'),
  'cancelled',
  'the person who booked sees that it was cancelled');

select set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000003' where topic like 'Open slot%' $$,
  '54000', null, 'one request cannot book more slots than the booking limit');

update public.mentor_slots set status = 'booked', booked_by = 'a5000000-0000-4000-8000-000000000003' where topic = 'Open slot 1';

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where topic = 'Open slot 1'),
  0,
  'a cancelled slot is hidden from other members and cannot be booked');

insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.mentor_slots $$, '42501', null,
  'nobody can delete slots through the API');

-- -----------------------------------------------------------------------------
-- 5. Signed-out visitors
-- -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ select count(*) from public.mentor_slots $$, '42501', null,
  'a signed-out visitor cannot read slots');

reset role;

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where topic = 'Open slot 1' and status = 'cancelled' and booked_by = 'a5000000-0000-4000-8000-000000000002'),
  1,
  'a cancelled booking keeps who had booked it');

insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;

rollback;
