-- =============================================================================
-- IIUC Connect — pgTAP tests for the mentorship request flow (Sprint 6)
-- Fixtures (ids a6000000-0000-4000-8000-0000000000NN):
--   01 Mona   graduate mentor        02 Sam   verified student
--   03 Sue    verified student       04 Uma   email confirmed only
--   05 Pete   graduate mentor, private profile
--   06 Ada    admin                  07-10 graduate mentors with one slot each
--   11 Gary   graduate, makes his mentor profile in the tests
--   12-14 verified students          15 Gus  graduate, never makes a mentor profile
-- Runs in one transaction that is rolled back.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

-- Slot ids picked once, so later statements do not shift as slots change state.
create temp table _ctx (k text primary key, v uuid not null);
grant all on _ctx to public;

-- Switch the signed-in user: select public._as(2) is "Sam".
create function public._as(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'),
                      'role', 'authenticated')::text, true);
$$;
grant execute on function public._as(int) to public;

select extensions.no_plan();

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'm' || n || '@test.invalid', now()
  from generate_series(1, 15) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
select private.transition_verification(id, 'verified_alumni', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
select private.transition_verification(id, 'verified_student', null, 'test', null)
  from public.profiles
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 12, 13, 14]) n);

update public.profiles set affiliation = 'alumni',  full_name = 'Graduate ' || right(id::text, 2)
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 5, 7, 8, 9, 10, 11, 15]) n);
update public.profiles set affiliation = 'student', full_name = 'Student ' || right(id::text, 2)
 where id in (select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 12, 13, 14]) n);
update public.profiles set visibility = 'private' where id = 'a6000000-0000-4000-8000-000000000005';
update public.profiles set role = 'admin'         where id = 'a6000000-0000-4000-8000-000000000006';

-- Mentor profiles for 01, 05, 07-10 (Gary 11 makes his own in the tests).
insert into public.mentor_profiles (id, expertise_areas)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, array['backend']
  from unnest(array[1, 5, 7, 8, 9, 10]) n;

-- One slot each for Pete (private) and mentors 07-10, inserted as the owner.
insert into public.mentor_slots (mentor_id, starts_at)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       now() + interval '2 days' + (n || ' minutes')::interval
  from unnest(array[5, 7, 8, 9, 10]) n;

-- -----------------------------------------------------------------------------
-- A. Mentor profiles, weekly rules, generated slots
-- -----------------------------------------------------------------------------
set local role authenticated;

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_profiles (expertise_areas) values ('{x}') $$,
  '42501', null, 'a student cannot create a mentor profile');

select public._as(11);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_profiles (expertise_areas, bio) values ('{java,sql}', 'Hello') $$,
  'a verified graduate can create a mentor profile');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set max_sessions_per_week = 0 where id = auth.uid() $$,
  '23514', null, 'a weekly cap of 0 is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set max_sessions_per_week = 11 where id = auth.uid() $$,
  '23514', null, 'a weekly cap above 10 is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_profiles set expertise_areas = '{a,b,c,d,e,f,g,h,i}' where id = auth.uid() $$,
  '23514', null, 'more than 8 expertise areas is refused');

select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_profiles), 6,
  'a verified member sees the 6 visible mentor profiles (a private one is hidden)');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_profiles), 0,
  'a member who is not verified sees no mentor profiles');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.mentor_profiles $$, '42501', null,
  'a signed-out visitor cannot read mentor profiles');
reset role; set local role authenticated;

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:00', '10:00') $$,
  '42501', null, 'a student cannot add an availability rule');
select public._as(15);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:00', '10:00') $$,
  '42501', null, 'a graduate without a mentor profile cannot add a rule');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '09:15', '10:00') $$,
  '23514', null, 'a rule must start on the hour or half hour');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '10:00', '09:00') $$,
  '23514', null, 'a rule must end after it starts');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time) values (1, '08:00', '17:00') $$,
  '23514', null, 'a rule longer than 8 hours is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time)
     select d, '09:00', '11:00' from generate_series(0, 6) d $$,
  'a graduate with a mentor profile can add weekly rules');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_availability_rules (weekday, start_time, end_time)
     select d, '12:00', '13:00' from generate_series(0, 3) d $$,
  '54000', null, 'one statement cannot push a mentor past 10 rules');

insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000001') > 0,
  'saving rules generates slots');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001'
      and not (extract(hour   from starts_at at time zone 'Asia/Dhaka') in (9, 10)
           and extract(minute from starts_at at time zone 'Asia/Dhaka') in (0, 30))),
  0, 'generated slots fall in the rule window, in Bangladesh time');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001'
      and (starts_at < now() + interval '30 minutes' or starts_at > now() + interval '14 days')),
  0, 'generated slots are 30 minutes to 14 days ahead');

reset role;
insert into _tap_out (line) select extensions.is(
  (select private.generate_slots('a6000000-0000-4000-8000-000000000001')), 0,
  'running generation again adds nothing');

-- Slot ids for later groups: s1-s8 from day+5 on (4 per day); c1-c4 on day+3.
insert into _ctx (k, v)
select 's' || row_number() over (order by starts_at), id
  from (select id, starts_at from public.mentor_slots
         where mentor_id = 'a6000000-0000-4000-8000-000000000001'
           and (starts_at at time zone 'Asia/Dhaka')::date >= (now() at time zone 'Asia/Dhaka')::date + 5
         order by starts_at limit 8) q;
insert into _ctx (k, v)
select 'c' || row_number() over (order by starts_at), id
  from (select id, starts_at from public.mentor_slots
         where mentor_id = 'a6000000-0000-4000-8000-000000000001'
           and (starts_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date + 3
         order by starts_at limit 4) q;

set local role authenticated;
select public._as(2);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status = 'open') > 0,
  'a verified member sees a mentor''s open slots');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where mentor_id = 'a6000000-0000-4000-8000-000000000005'), 0,
  'a private mentor''s slots are hidden');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentor_slots (mentor_id, starts_at) values ('a6000000-0000-4000-8000-000000000001', now() + interval '3 days') $$,
  '42501', null, 'nobody can insert slots directly');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentor_slots set starts_at = now() + interval '9 days' where id = (select v from _ctx where k = 's1') $$,
  '42501', null, 'a member cannot move a slot');
update public.mentor_slots set status = 'cancelled' where id = (select v from _ctx where k = 's1');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'a member cannot cancel a mentor''s slot');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots), 0,
  'a member who is not verified sees no slots');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.mentor_slots $$, '42501', null, 'a signed-out visitor cannot read slots');
reset role; set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentor_slots set status = 'cancelled' where id = (select v from _ctx where k = 's6') $$,
  'a mentor can cancel their own open slot');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots where id = (select v from _ctx where k = 's6')), 0,
  'a cancelled slot disappears for other members');

-- -----------------------------------------------------------------------------
-- B. Requests, responses, sessions, feedback
-- -----------------------------------------------------------------------------
reset role;
insert into _ctx (k, v) select 'p1', id from public.mentor_slots
 where mentor_id = 'a6000000-0000-4000-8000-000000000005';
set local role authenticated;

-- Requesting
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?') $$,
  'a verified student can request an open slot');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'held',
  'the slot is held while the request is pending');

select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'short', 'What now?') $$,
  '23514', null, 'a goal under 10 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'hi') $$,
  '23514', null, 'a first question under 5 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 45, 'A proper goal here', 'A real question?') $$,
  '23514', null, 'only 15, 20 and 30 minute sessions are allowed');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 15, 'A proper goal here', 'A real question?') $$,
  '22023', null, 'a slot that is already held cannot be requested');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     select (select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?' from generate_series(1, 2) $$,
  '23505', null, 'one statement cannot hold the same slot twice');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 'p1'), 15, 'A proper goal here', 'A real question?') $$,
  '42501', null, 'a private mentor''s slot cannot be requested even with its id');

select public._as(4);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?') $$,
  '42501', null, 'a member who is not verified cannot request');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's3'), 15, 'A proper goal here', 'A real question?') $$,
  '22023', null, 'a mentor cannot request their own slot');

select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's2'), 15, 'A proper goal here', 'A real question?') $$,
  '23505', null, 'one pending request per mentee and mentor pair');

-- Who sees requests
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 0, 'another member sees no requests');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 1, 'the mentee sees their request');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 1, 'the mentor sees the request addressed to them');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests), 0, 'a member who is not verified sees no requests');
select public._as(6);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentorship_requests) >= 1, 'an admin sees requests');

-- Edits and forbidden moves
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set goal = 'Changed my mind about it' $$,
  '42501', null, 'a request''s goal cannot be edited');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/x' $$,
  '22023', null, 'a mentee cannot accept their own request (the state machine refuses)');

select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted' $$,
  '23514', null, 'accepting needs a meeting link');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'http://meet.example/x' $$,
  '23514', null, 'the meeting link must use https');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'expired' $$,
  '22023', null, 'a member cannot expire a request (the state machine refuses)');

-- The same two moves with the trigger switched off: the policy must refuse them alone.
reset role;
alter table public.mentorship_requests disable trigger requests_before_update;
set local role authenticated;
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/x' $$,
  '42501', null, 'the policy alone refuses a mentee accepting their own request');
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'expired' $$,
  '42501', null, 'the policy alone refuses a member expiring a request');
reset role;
alter table public.mentorship_requests enable trigger requests_before_update;
set local role authenticated;

-- Cancel, re-request, accept
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'pending' $$,
  'a mentee can cancel a pending request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'cancelling reopens the slot');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?') $$,
  'the slot can be requested again');

select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-1'
      where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000002' $$,
  'the mentor can accept with a meeting link');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'booked',
  'accepting books the slot');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.sessions where status = 'scheduled'), 1,
  'accepting creates a scheduled session');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select meeting_url from public.mentorship_requests where status = 'accepted'), 'https://meet.example/room-1',
  'the mentee can read the meeting link once accepted');
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.sessions), 0, 'another member cannot see the session');

-- Cancelling an accepted request
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'accepted' $$,
  'a mentee can cancel an accepted request before it starts');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select status::text from public.sessions order by created_at limit 1), 'cancelled',
  'cancelling cancels the session');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's1')), 'open',
  'cancelling an accepted request reopens the slot');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests where meeting_url is not null), 0,
  'the meeting link is cleared on cancellation');

-- Second session on s1: Sam requests again, Mona accepts
select public._as(2);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's1'), 20, 'Learn how to land a backend job', 'What should I build first?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-2'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000002';

-- Declining and invalid transitions
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.mentorship_requests set status = 'declined' where status = 'pending' $$,
  'a mentor can decline a request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's2')), 'open',
  'declining reopens the slot');
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/late' where status = 'declined';
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentorship_requests where status = 'declined'), 1,
  'a declined request cannot be accepted afterwards');
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'cancelled' where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000003' $$,
  '22023', null, 'only the mentee can cancel a pending request');
select public._as(3);
update public.mentorship_requests set status = 'cancelled' where status = 'pending';

-- Sessions: closing them
reset role;
insert into _ctx (k, v) select 'sess2', id from public.sessions where status = 'scheduled';
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2') $$,
  '22023', null, 'a session cannot be closed before it ends');
reset role;
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess2');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(2);
update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.sessions where id = (select v from _ctx where k = 'sess2')), 'scheduled',
  'a mentee cannot close the session');
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess2') $$,
  'the mentor can mark a finished session completed');
insert into _tap_out (line) select extensions.ok(
  (select outcome_at is not null from public.sessions where id = (select v from _ctx where k = 'sess2')),
  'closing a session records when');

-- A no-show session (Sue on s2)
select public._as(3);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's2'), 15, 'Review my CV before applying', 'Is my CV too long?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-3'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000003';
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.sessions set status = 'cancelled' where status = 'scheduled' $$,
  '42501', null, 'a member cannot cancel a session directly');
reset role;
insert into _ctx (k, v) select 'sess3', id from public.sessions where status = 'scheduled';
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess3');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.sessions set status = 'no_show' where id = (select v from _ctx where k = 'sess3') $$,
  'the mentor can mark a no-show');

-- Feedback
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess3'), 4) $$,
  '22023', null, 'a no-show session cannot be rated');
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 6) $$,
  '23514', null, 'a rating above 5 is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.session_feedback (session_id, rating, comment) values ((select v from _ctx where k = 'sess2'), 5, 'Very helpful') $$,
  'the mentee can rate a completed session');
insert into _tap_out (line) select extensions.is(
  (select reviewee_id from public.session_feedback), 'a6000000-0000-4000-8000-000000000001'::uuid,
  'the rating is about the other person in the session');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4) $$,
  '23505', null, 'one rating per person per session');
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4) $$,
  '22023', null, 'someone outside the session cannot rate it');

select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 0,
  'the mentor cannot see the rating before rating back');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 1, 'a reviewer always sees their own rating');
select public._as(1);
insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess2'), 4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 2, 'once both have rated, the mentor sees both');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback), 2, 'once both have rated, the mentee sees both');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.session_feedback set rating = 1 $$, '42501', null, 'ratings cannot be edited');
insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.session_feedback $$, '42501', null, 'ratings cannot be deleted');

-- Reveal after 7 days (Stu12 on s5)
select public._as(12);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's5'), 30, 'Mock interview practice', 'How do I explain gaps?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/room-4'
 where status = 'pending' and mentee_id = 'a6000000-0000-4000-8000-000000000012';
reset role;
insert into _ctx (k, v) select 'sess4', id from public.sessions where status = 'scheduled';
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set starts_at = now() - interval '2 hours' where id = (select v from _ctx where k = 'sess4');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
update public.sessions set status = 'completed' where id = (select v from _ctx where k = 'sess4');
select public._as(12);
insert into public.session_feedback (session_id, rating) values ((select v from _ctx where k = 'sess4'), 5);
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback where session_id = (select v from _ctx where k = 'sess4')), 0,
  'a rating stays hidden from the other person while only one has rated');
reset role;
alter table public.sessions disable trigger sessions_before_update;
update public.sessions set outcome_at = now() - interval '8 days' where id = (select v from _ctx where k = 'sess4');
alter table public.sessions enable trigger sessions_before_update;
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.session_feedback where session_id = (select v from _ctx where k = 'sess4')), 1,
  'a rating is revealed 7 days after the session even if the other has not rated');

select public._as(6);
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.sessions) >= 3 and (select count(*) from public.session_feedback) >= 3,
  'an admin sees all sessions and ratings');

-- Limits that one statement must not slip past
select public._as(14);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
     select id, 15, 'A proper goal here', 'A real question?' from public.mentor_slots
      where mentor_id in ('a6000000-0000-4000-8000-000000000007', 'a6000000-0000-4000-8000-000000000008',
                          'a6000000-0000-4000-8000-000000000009', 'a6000000-0000-4000-8000-000000000010') $$,
  '54000', null, 'one statement cannot give a member more than 3 live requests');

reset role;
insert into public.mentorship_requests (slot_id, mentee_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'c1'), 'a6000000-0000-4000-8000-000000000002', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c2'), 'a6000000-0000-4000-8000-000000000003', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c3'), 'a6000000-0000-4000-8000-000000000012', 15, 'A proper goal here', 'A real question?'),
       ((select v from _ctx where k = 'c4'), 'a6000000-0000-4000-8000-000000000013', 15, 'A proper goal here', 'A real question?');
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/cap'
      where slot_id in (select v from _ctx where k like 'c%') $$,
  '54000', null, 'one statement cannot accept past the weekly cap');
-- -----------------------------------------------------------------------------
-- C. Scheduled jobs and rule removal
-- -----------------------------------------------------------------------------
reset role;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from cron.job
    where jobname in ('expire-mentorship-requests', 'generate-mentor-slots')), 2,
  'both scheduled jobs exist');

set local role authenticated;
select public._as(14);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 's7'), 15, 'A proper goal here', 'A real question?');
insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.expire_requests() $$, '42501', null, 'a member cannot run the expiry job');

reset role;
select set_config('request.jwt.claims', '', true);   -- the job runs with no signed-in user
update public.mentorship_requests set expires_at = now() - interval '1 minute'
 where mentee_id = 'a6000000-0000-4000-8000-000000000014';
insert into _tap_out (line) select extensions.is(
  (select private.expire_requests()), 1, 'the job expires the one overdue request');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentorship_requests where mentee_id = 'a6000000-0000-4000-8000-000000000014'),
  'expired', 'the request is marked expired');
insert into _tap_out (line) select extensions.is(
  (select status::text from public.mentor_slots where id = (select v from _ctx where k = 's7')), 'open',
  'expiry reopens the slot');

set local role authenticated;
select public._as(1);
delete from public.mentor_availability_rules;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status = 'open' and starts_at > now()),
  0, 'removing every rule withdraws the open slots');
insert into _tap_out (line) select extensions.ok(
  (select count(*) from public.mentor_slots
    where mentor_id = 'a6000000-0000-4000-8000-000000000001' and status in ('held', 'booked')) > 0,
  'slots that already have a request stay');

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;
rollback;
