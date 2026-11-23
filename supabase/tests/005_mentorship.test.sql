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

--__GROUP_B__
--__GROUP_C__

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out where line !~ '^ok' order by seq;
rollback;
