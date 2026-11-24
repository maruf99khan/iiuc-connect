-- =============================================================================
-- IIUC Connect — pgTAP tests for in-app notifications
-- Fixtures (ids a8000000-0000-4000-8000-0000000000NN):
--   01 Mona  graduate mentor (mentor profile, three slots)
--   02 Sam   verified student (mentee)     03 Sue  verified student (bystander)
--   04 Pia   graduate who posts a job      05 Sid  verified student (applicant)
--   06 Sol   verified student (applicant)
-- Runs in one transaction that is rolled back.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

create temp table _ctx (k text primary key, v uuid not null);
grant all on _ctx to public;

create function public._as(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'),
                      'role', 'authenticated')::text, true);
$$;
grant execute on function public._as(int) to public;

insert into _tap_out (line) select extensions.plan(27);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'n' || n || '@test.invalid', now()
  from generate_series(1, 6) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from generate_series(1, 6) n);
select private.transition_verification(id, 'verified_alumni', null, 'test', null)
  from public.profiles
 where id in ('a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004');
select private.transition_verification(id, 'verified_student', null, 'test', null)
  from public.profiles
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 5, 6]) n);

update public.profiles set affiliation = 'alumni'
 where id in ('a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004');
update public.profiles set affiliation = 'student'
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[2, 3, 5, 6]) n);

insert into public.mentor_profiles (id, expertise_areas)
values ('a8000000-0000-4000-8000-000000000001', array['backend']);
insert into public.mentor_slots (mentor_id, starts_at)
select 'a8000000-0000-4000-8000-000000000001',
       now() + interval '2 days' + (n || ' minutes')::interval
  from generate_series(1, 3) n;
insert into _ctx select 'a', id from public.mentor_slots order by starts_at limit 1;
insert into _ctx select 'b', id from public.mentor_slots order by starts_at offset 1 limit 1;
insert into _ctx select 'c', id from public.mentor_slots order by starts_at offset 2 limit 1;

insert into public.jobs (poster_id, title, company, job_type, description)
values ('a8000000-0000-4000-8000-000000000004', 'Backend Engineer', 'Acme', 'full_time',
        'Build and run our payment services.');
insert into _ctx select 'job', id from public.jobs where title = 'Backend Engineer';

set local role authenticated;

-- -----------------------------------------------------------------------------
-- A. Mentorship events
-- -----------------------------------------------------------------------------
select public._as(2);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'a'), 20, 'Learn how to land a backend job', 'What should I build first?');

select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_received'), 1,
  'a new request notifies the mentor');
insert into _tap_out (line) select extensions.is(
  (select link from public.notifications where kind = 'request_received'), '/sessions',
  'the notification links to the sessions page');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications), 0,
  'the person who asked gets no notification for their own request');
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications), 0,
  'a bystander sees no notifications');

select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/x'
 where status = 'pending';
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_accepted'), 1,
  'accepting a request notifies the mentee');

update public.mentorship_requests set status = 'cancelled' where status = 'accepted';
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_cancelled'), 1,
  'a mentee cancelling notifies the mentor');

select public._as(2);
insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'b'), 15, 'A second goal for the mentor', 'A second question?');
select public._as(1);
update public.mentorship_requests set status = 'declined' where status = 'pending';
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_declined'), 1,
  'declining a request notifies the mentee');

insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'c'), 30, 'A third goal for the mentor', 'A third question?');

reset role;
select set_config('request.jwt.claims', '', true);   -- the job runs with no signed-in user
update public.mentorship_requests set expires_at = now() - interval '1 minute'
 where status = 'pending';
select private.expire_requests();
set local role authenticated;
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_expired'), 1,
  'an expired request notifies the mentee');

insert into public.mentorship_requests (slot_id, duration_minutes, goal, question_1)
values ((select v from _ctx where k = 'a'), 20, 'Asking again after cancelling', 'Is the slot free?');
select public._as(1);
update public.mentorship_requests set status = 'accepted', meeting_url = 'https://meet.example/y'
 where status = 'pending';
update public.mentorship_requests set status = 'cancelled' where status = 'accepted';
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_cancelled'), 1,
  'a mentor cancelling notifies the mentee');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'request_received'), 4,
  'every request notified the mentor (four requests)');

-- -----------------------------------------------------------------------------
-- B. Who can read and change a notification
-- -----------------------------------------------------------------------------
select public._as(2);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.notifications (user_id, kind, link)
     values ('a8000000-0000-4000-8000-000000000002', 'request_accepted', '/sessions') $$,
  '42501', null, 'a member cannot make a notification');
insert into _tap_out (line) select extensions.throws_ok(
  $$ select private.notify('a8000000-0000-4000-8000-000000000002', 'request_accepted', '/sessions') $$,
  '42501', null, 'a member cannot call the notify function');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.notifications set kind = 'request_received' $$,
  '42501', null, 'a member can change only the read time');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.notifications set read_at = now() $$,
  'a member can mark their notifications read');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where read_at is null), 0,
  'all their notifications are read');

select public._as(3);
update public.notifications set read_at = now();
delete from public.notifications;
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where read_at is null), 5,
  'another member can neither mark nor delete someone else''s notifications');
insert into _tap_out (line) select extensions.lives_ok(
  $$ delete from public.notifications where kind = 'request_cancelled' $$,
  'a member can delete their own notification');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications), 4,
  'only that notification was deleted');

reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.notifications $$, '42501', null,
  'a signed-out visitor cannot read notifications');
reset role;

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.notifications (user_id, kind, link)
     values ('a8000000-0000-4000-8000-000000000002', 'request_accepted', 'http://evil.example') $$,
  '23514', null, 'a link must be a path inside the app');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.notifications (user_id, kind, link)
     values ('a8000000-0000-4000-8000-000000000002', 'request_accepted', '//evil.example') $$,
  '23514', null, 'a protocol-relative link is refused');

-- -----------------------------------------------------------------------------
-- C. Job events
-- -----------------------------------------------------------------------------
set local role authenticated;
select public._as(5);
insert into public.job_applications (job_id, message)
values ((select v from _ctx where k = 'job'), 'I would love to join.');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'application_received'), 1,
  'an application notifies the poster');
select public._as(6);
insert into public.job_applications (job_id, message)
values ((select v from _ctx where k = 'job'), 'Please consider me.');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'application_received'), 2,
  'a second application notifies the poster again');
update public.job_applications set status = 'shortlisted'
 where applicant_id = 'a8000000-0000-4000-8000-000000000005';
update public.job_applications set status = 'rejected'
 where applicant_id = 'a8000000-0000-4000-8000-000000000006';
select public._as(5);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'application_shortlisted'), 1,
  'shortlisting notifies the applicant');
insert into _tap_out (line) select extensions.is(
  (select link from public.notifications where kind = 'application_shortlisted'),
  '/jobs/' || (select v from _ctx where k = 'job'),
  'the notification links to the job');
select public._as(6);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'application_rejected'), 1,
  'rejecting notifies the applicant');
select public._as(5);
update public.job_applications set status = 'withdrawn' where applicant_id = auth.uid();
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.notifications where kind = 'application_withdrawn'), 1,
  'withdrawing notifies the poster');

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;
rollback;
