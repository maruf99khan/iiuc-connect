-- =============================================================================
-- IIUC Connect — pgTAP tests for the jobs board (plan day 26 Nov)
-- Fixtures (ids a7000000-0000-4000-8000-0000000000NN):
--   01 Alice graduate (poster)       02 Gus graduate (poster, fills the cap)
--   03 Sam   verified student        04 Sue verified student
--   05 Uma   email confirmed only    06 Ada admin
--   07 Ned   graduate                08 Stu verified student (application cap)
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
    json_build_object('sub', 'a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'),
                      'role', 'authenticated')::text, true);
$$;
grant execute on function public._as(int) to public;

insert into _tap_out (line) select extensions.plan(57);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'j' || n || '@test.invalid', now()
  from generate_series(1, 8) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles
 where id in (select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2, 3, 4, 7, 8]) n);
select private.transition_verification(id, 'verified_alumni', null, 'test', null)
  from public.profiles
 where id in (select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2, 7]) n);
select private.transition_verification(id, 'verified_student', null, 'test', null)
  from public.profiles
 where id in (select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[3, 4, 8]) n);

update public.profiles set affiliation = 'alumni',  full_name = 'Graduate ' || right(id::text, 2)
 where id in (select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2, 7]) n);
update public.profiles set affiliation = 'student', full_name = 'Student ' || right(id::text, 2)
 where id in (select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[3, 4, 8]) n);
update public.profiles set role = 'admin' where id = 'a7000000-0000-4000-8000-000000000006';

set local role authenticated;

-- -----------------------------------------------------------------------------
-- A. Posting
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Backend Engineer', 'Acme', 'full_time', 'Build and run our payment services.') $$,
  '42501', null, 'a student cannot post a job');
select public._as(5);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Backend Engineer', 'Acme', 'full_time', 'Build and run our payment services.') $$,
  '42501', null, 'a member who is not verified cannot post a job');

select public._as(1);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, location, job_type, description)
     values ('Backend Engineer', 'Acme', 'Dhaka', 'full_time', 'Build and run our payment services.') $$,
  'a verified graduate can post a job');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Hi', 'Acme', 'full_time', 'Build and run our payment services.') $$,
  '23514', null, 'a title under 3 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Short description', 'Acme', 'full_time', 'Too short') $$,
  '23514', null, 'a description under 20 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Odd type', 'Acme', 'volunteer', 'Build and run our payment services.') $$,
  '22P02', null, 'an unknown job type is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (poster_id, title, company, job_type, description)
     values ('a7000000-0000-4000-8000-000000000002', 'In his name', 'Acme', 'full_time',
             'Build and run our payment services.') $$,
  '42501', null, 'a graduate cannot post in someone else''s name');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description, status)
     values ('Already closed', 'Acme', 'full_time', 'Build and run our payment services.', 'closed') $$,
  '42501', null, 'status cannot be chosen when posting');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Closed Role', 'Acme', 'internship', 'A role that will be closed soon.') $$,
  'a graduate can post a second job');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.jobs set status = 'closed' where title = 'Closed Role' $$,
  'the poster can close a job');

-- Limit: 10 active jobs per poster.
select public._as(7);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     select 'Ned job ' || n, 'Acme', 'contract', 'A description that is long enough.'
       from generate_series(1, 11) n $$,
  '54000', null, 'one statement cannot post 11 active jobs');
select public._as(2);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     select 'Gus job ' || n, 'Acme', 'part_time', 'A description that is long enough.'
       from generate_series(1, 10) n $$,
  'a graduate can have 10 active jobs');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Gus job 11', 'Acme', 'part_time', 'A description that is long enough.') $$,
  '54000', null, 'an 11th active job is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.jobs set status = 'closed' where title = 'Gus job 1' $$,
  'closing a job frees a place');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Gus job 11', 'Acme', 'part_time', 'A description that is long enough.') $$,
  'a new job fits after one is closed');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.jobs set status = 'active' where title = 'Gus job 1' $$,
  '54000', null, 'reopening a job past the limit is refused');

-- Capture ids as the owner, so later denial tests use real ids.
reset role;
insert into _ctx select 'backend', id from public.jobs where title = 'Backend Engineer';
insert into _ctx select 'closed',  id from public.jobs where title = 'Closed Role';
set local role authenticated;

-- -----------------------------------------------------------------------------
-- B. Who can read jobs
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs where title = 'Backend Engineer'), 1,
  'a verified student sees an active job');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs where title = 'Closed Role'), 0,
  'a verified student does not see a closed job');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs where title = 'Closed Role'), 1,
  'the poster still sees their closed job');
select public._as(6);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs where title = 'Closed Role'), 1,
  'an admin sees a closed job');
select public._as(5);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs), 0,
  'a member who is not verified sees no jobs');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.jobs $$, '42501', null,
  'a signed-out visitor cannot read jobs');
reset role; set local role authenticated;

-- -----------------------------------------------------------------------------
-- C. Who can change or delete a job
-- -----------------------------------------------------------------------------
select public._as(2);
update public.jobs set title = 'Hacked' where title = 'Backend Engineer';
delete from public.jobs where title = 'Backend Engineer';
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.jobs where title = 'Backend Engineer'), 1,
  'another graduate can neither edit nor delete a job');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.jobs set description = 'Build and run our payment services at scale.'
      where title = 'Backend Engineer' $$,
  'the poster can edit their job');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.jobs set poster_id = 'a7000000-0000-4000-8000-000000000002'
      where title = 'Backend Engineer' $$,
  '42501', null, 'a job cannot be handed to someone else');

-- -----------------------------------------------------------------------------
-- D. Applying
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (job_id, message)
     values ((select v from _ctx where k = 'backend'), 'I would love to join.') $$,
  'a verified student can apply');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'backend')) $$,
  '23505', null, 'a member cannot apply twice to the same job');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'closed')) $$,
  '42501', null, 'a member cannot apply to a closed job');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id, applicant_id)
     values ((select v from _ctx where k = 'backend'), 'a7000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'a member cannot apply in someone else''s name');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id, status)
     values ((select v from _ctx where k = 'backend'), 'shortlisted') $$,
  '42501', null, 'an applicant cannot choose the status when applying');
select public._as(5);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'backend')) $$,
  '42501', null, 'a member who is not verified cannot apply');
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'backend')) $$,
  '42501', null, 'a poster cannot apply to their own job');
select public._as(4);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (job_id, message)
     values ((select v from _ctx where k = 'backend'), 'Please consider me.') $$,
  'a second student can apply');

-- -----------------------------------------------------------------------------
-- E. Who can read applications
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.job_applications), 1,
  'an applicant sees only their own application');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.job_applications), 2,
  'the poster sees every application to their job');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.job_applications), 0,
  'another graduate sees no applications to someone else''s job');
select public._as(6);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.job_applications), 2,
  'an admin sees applications');
reset role; set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select 1 from public.job_applications $$, '42501', null,
  'a signed-out visitor cannot read applications');
reset role; set local role authenticated;

-- -----------------------------------------------------------------------------
-- F. Status moves
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set status = 'shortlisted' where applicant_id = auth.uid() $$,
  '22023', null, 'an applicant cannot shortlist themselves');
select public._as(4);
update public.job_applications set status = 'withdrawn'
 where applicant_id = 'a7000000-0000-4000-8000-000000000003';
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select status::text from public.job_applications
    where applicant_id = 'a7000000-0000-4000-8000-000000000003'),
  'submitted', 'another applicant cannot change someone else''s application');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.job_applications set status = 'shortlisted'
      where applicant_id = 'a7000000-0000-4000-8000-000000000003' $$,
  'the poster can shortlist an application');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.job_applications set status = 'rejected'
      where applicant_id = 'a7000000-0000-4000-8000-000000000004' $$,
  'the poster can reject an application');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set status = 'shortlisted'
      where applicant_id = 'a7000000-0000-4000-8000-000000000004' $$,
  '22023', null, 'a rejected application cannot be reopened');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set status = 'withdrawn'
      where applicant_id = 'a7000000-0000-4000-8000-000000000003' $$,
  '22023', null, 'the poster cannot withdraw an application for the applicant');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set message = 'rewritten'
      where applicant_id = 'a7000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'the poster cannot edit an applicant''s message');
select public._as(4);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set status = 'withdrawn' where applicant_id = auth.uid() $$,
  '22023', null, 'a rejected applicant cannot withdraw');
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.job_applications set status = 'withdrawn' where applicant_id = auth.uid() $$,
  'an applicant can withdraw a shortlisted application');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set status = 'submitted' where applicant_id = auth.uid() $$,
  '22023', null, 'a withdrawn application cannot be reopened');
insert into _tap_out (line) select extensions.throws_ok(
  $$ delete from public.job_applications $$, '42501', null,
  'an application cannot be deleted by a member');

-- -----------------------------------------------------------------------------
-- G. Closing, deleting and the application limit
-- -----------------------------------------------------------------------------
select public._as(1);
update public.jobs set status = 'closed' where title = 'Backend Engineer';
select public._as(7);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'backend')) $$,
  '42501', null, 'nobody can apply once the job is closed');
select public._as(1);
update public.jobs set status = 'active' where title = 'Backend Engineer';

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     values ('Temp Role', 'Acme', 'contract', 'A role that will be deleted soon.') $$,
  'the poster can post a job to delete');
reset role;
insert into _ctx select 'temp', id from public.jobs where title = 'Temp Role';
set local role authenticated;
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (job_id, message)
     values ((select v from _ctx where k = 'temp'), 'temp') $$,
  'an application to the job to delete is accepted');
select public._as(1);
delete from public.jobs where title = 'Temp Role';
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.job_applications where message = 'temp'), 0,
  'deleting a job removes its applications');

-- Ned fills his 10 places; then Stu hits the 20 live applications limit.
select public._as(7);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.jobs (title, company, job_type, description)
     select 'Ned job ' || n, 'Acme', 'contract', 'A description that is long enough.'
       from generate_series(1, 10) n $$,
  'a graduate can post 10 active jobs in one statement');
select public._as(8);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     select id from public.jobs where status = 'active' $$,
  '54000', null, 'one statement cannot create more than 20 live applications');
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (job_id)
     select id from public.jobs where title like 'Gus job%' and status = 'active'
     union all
     select id from public.jobs where title like 'Ned job%' and status = 'active'
     limit 20 $$,
  'a member can hold 20 live applications');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'backend')) $$,
  '54000', null, 'a 21st live application is refused');

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;
rollback;
