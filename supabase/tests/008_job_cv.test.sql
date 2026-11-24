-- =============================================================================
-- IIUC Connect — pgTAP tests for application CVs and profile links (D-025)
-- Fixtures (ids a8000000-0000-4000-8000-0000000000NN):
--   01 Alice graduate (poster of Job A)  02 Gus graduate (poster of Job B)
--   03 Sam   verified student (applies with a CV)
--   04 Sue   verified student (another member)
--   05 Ada   admin                      06 Uma email confirmed only
-- Application ids: ...00a1 Sam to Job A (with a CV), ...00a6 Sue to Job B (purge fixture)
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

insert into _tap_out (line) select extensions.plan(46);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'c' || n || '@test.invalid', now()
  from generate_series(1, 6) n;

select private.transition_verification(id, 'affiliation_pending', null, 'test', null)
  from public.profiles
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2, 3, 4]) n);
select private.transition_verification(id, 'verified_alumni', null, 'test', null)
  from public.profiles
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2]) n);
select private.transition_verification(id, 'verified_student', null, 'test', null)
  from public.profiles
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[3, 4]) n);

update public.profiles set affiliation = 'alumni',  full_name = 'Graduate ' || right(id::text, 2)
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[1, 2]) n);
update public.profiles set affiliation = 'student', full_name = 'Student ' || right(id::text, 2)
 where id in (select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[3, 4]) n);
update public.profiles set role = 'admin' where id = 'a8000000-0000-4000-8000-000000000005';

-- -----------------------------------------------------------------------------
-- B. The bucket (read before switching role)
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select public from storage.buckets where id = 'application-cvs'),
  false, 'the application-cvs bucket exists and is private');
insert into _tap_out (line) select extensions.is(
  (select file_size_limit from storage.buckets where id = 'application-cvs'),
  2097152::bigint, 'the bucket limits a file to 2 MB');
insert into _tap_out (line) select extensions.is(
  (select allowed_mime_types from storage.buckets where id = 'application-cvs'),
  array['application/pdf'], 'the bucket accepts PDF only');

set local role authenticated;

-- -----------------------------------------------------------------------------
-- A. Profile links
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles set portfolio_url = 'https://example.com/sam',
            github_url = 'https://github.com/sam'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  'a member can set a portfolio and a GitHub address on their own profile');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set portfolio_url = 'http://example.com/sam'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a portfolio address that is not https is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set portfolio_url = 'javascript:alert(1)'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a javascript: address is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set portfolio_url = 'https://exa mple.com/x'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'an address with a space is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set portfolio_url = ''
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'an empty string is refused (blank must be stored as null)');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set portfolio_url = 'https://example.com/' || repeat('a', 300)
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'an address over 300 characters is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set github_url = 'https://gitlab.com/sam'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a GitHub address on another host is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set github_url = 'https://github.com.evil.example/sam'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a look-alike GitHub host is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set github_url = 'https://github.com@evil.example/'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a user-info trick on the GitHub host is refused');
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles set github_url = 'https://www.github.com/sam'
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  'the www.github.com host is accepted');
select public._as(4);
-- Policy filters the row out, so the statement runs and changes nothing.
update public.profiles set portfolio_url = 'https://evil.example/'
 where id = 'a8000000-0000-4000-8000-000000000003';
insert into _tap_out (line) select extensions.is(
  (select portfolio_url from public.profiles where id = 'a8000000-0000-4000-8000-000000000003'),
  'https://example.com/sam', 'a member cannot change another member''s portfolio address');
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles set portfolio_url = null, github_url = null
      where id = 'a8000000-0000-4000-8000-000000000003' $$,
  'a member can clear both addresses');

-- -----------------------------------------------------------------------------
-- C. Applications with a CV path
-- -----------------------------------------------------------------------------
select public._as(1);
insert into public.jobs (title, company, job_type, description)
values ('Job A', 'Acme', 'full_time', 'A job with a description that is long enough.');
insert into _ctx select 'jobA', id from public.jobs where title = 'Job A';
select public._as(2);
insert into public.jobs (title, company, job_type, description)
values ('Job B', 'Acme', 'full_time', 'Another job with a long enough description.');
insert into _ctx select 'jobB', id from public.jobs where title = 'Job B';

select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (id, job_id, message, cv_path)
     values ('a8000000-0000-4000-8000-0000000000a1', (select v from _ctx where k = 'jobA'), 'Hello',
             'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000a1.pdf') $$,
  'a member can apply with a CV path that matches their id and the application id');
select public._as(4);
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.job_applications (job_id)
     values ((select v from _ctx where k = 'jobA')) $$,
  'a member can still apply without a CV');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (id, job_id, cv_path)
     values ('a8000000-0000-4000-8000-0000000000a3', (select v from _ctx where k = 'jobB'),
             'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000a3.pdf') $$,
  '23514', null, 'a CV path in another member''s folder is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (id, job_id, cv_path)
     values ('a8000000-0000-4000-8000-0000000000a4', (select v from _ctx where k = 'jobB'),
             'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a1.pdf') $$,
  '23514', null, 'a CV path naming a different application is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.job_applications (id, job_id, cv_path)
     values ('a8000000-0000-4000-8000-0000000000a5', (select v from _ctx where k = 'jobB'),
             'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a5.png') $$,
  '23514', null, 'a CV path that does not end in .pdf is refused');
select public._as(3);
insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.job_applications set cv_path = null
      where id = 'a8000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'a CV path cannot be changed after the application is sent');

-- -----------------------------------------------------------------------------
-- D. Uploading
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000a1.pdf') $$,
  'a verified member can upload a PDF to their own folder');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000b1.pdf') $$,
  '42501', null, 'a member cannot upload into another member''s folder');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000b2.png') $$,
  '42501', null, 'a file that is not named .pdf is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs', 'a8000000-0000-4000-8000-000000000003/my-cv.pdf') $$,
  '42501', null, 'a file whose name is not an application id is refused');
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000003/deeper/a8000000-0000-4000-8000-0000000000b3.pdf') $$,
  '42501', null, 'a file in a sub-folder is refused');
-- No update policy exists, so the statement runs and changes nothing.
update storage.objects
   set name = 'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a1.pdf'
 where bucket_id = 'application-cvs';
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects
    where bucket_id = 'application-cvs'
      and name = 'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a1.pdf'),
  0, 'an uploaded file cannot be renamed or moved through the API');
select public._as(6);
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000006/a8000000-0000-4000-8000-0000000000b4.pdf') $$,
  '42501', null, 'a member who is not verified cannot upload');
reset role;
set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('application-cvs',
             'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000b5.pdf') $$,
  '42501', null, 'a visitor who is signed out cannot upload');
reset role;
set local role authenticated;

-- -----------------------------------------------------------------------------
-- E. Reading
-- -----------------------------------------------------------------------------
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  1, 'the applicant can read their own CV');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  1, 'the poster of the job can read the CV');
select public._as(2);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'the poster of a different job cannot read it');
select public._as(4);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'another member cannot read it');
select public._as(5);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'an admin cannot read it');
select public._as(6);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'an unverified member cannot read it');
reset role;
set local role anon;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'a visitor who is signed out cannot read it');
reset role;
set local role authenticated;
select public._as(3);
insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.job_applications set status = 'withdrawn'
      where id = 'a8000000-0000-4000-8000-0000000000a1' $$,
  'the applicant withdraws the application');
select public._as(1);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  0, 'after withdrawal the poster can no longer read the CV');
select public._as(3);
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'application-cvs'),
  1, 'after withdrawal the applicant can still read their own file');

-- -----------------------------------------------------------------------------
-- F. Files that must be deleted (listed for the server job)
-- -----------------------------------------------------------------------------
reset role;
-- Sam's file: the application was withdrawn just now.
update storage.objects set created_at = now() - interval '3 days'
 where bucket_id = 'application-cvs';
-- An old file with no application, and a young one.
insert into storage.objects (bucket_id, name, created_at) values
  ('application-cvs', 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000c1.pdf',
   now() - interval '3 days'),
  ('application-cvs', 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000c2.pdf',
   now());
-- A live application with an old file.
insert into public.job_applications (id, job_id, applicant_id, cv_path)
values ('a8000000-0000-4000-8000-0000000000a6', (select v from _ctx where k = 'jobB'),
        'a8000000-0000-4000-8000-000000000004',
        'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a6.pdf');
insert into storage.objects (bucket_id, name, created_at) values
  ('application-cvs', 'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a6.pdf',
   now() - interval '3 days');

set local role service_role;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.cv_purge_candidates(100)
    where path = 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000c1.pdf'
      and reason = 'orphan'),
  1, 'an old file with no application is listed as an orphan');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.cv_purge_candidates(100)
    where path = 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000c2.pdf'),
  0, 'a file less than a day old is not listed');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.cv_purge_candidates(100)
    where path = 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000a1.pdf'),
  0, 'a withdrawn application''s file is kept for a day after withdrawal');
reset role;
-- A trigger stamps updated_at on every update, so backdating the withdrawal
-- needs triggers off for this one statement.
set local session_replication_role = replica;
update public.job_applications set updated_at = now() - interval '3 days'
 where id = 'a8000000-0000-4000-8000-0000000000a1';
set local session_replication_role = origin;
set local role service_role;
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.cv_purge_candidates(100)
    where path = 'a8000000-0000-4000-8000-000000000003/a8000000-0000-4000-8000-0000000000a1.pdf'
      and reason = 'withdrawn'),
  1, 'a file of an application withdrawn over a day ago is listed');
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.cv_purge_candidates(100)
    where path = 'a8000000-0000-4000-8000-000000000004/a8000000-0000-4000-8000-0000000000a6.pdf'),
  0, 'the file of a live application is never listed');
reset role;
set local role authenticated;
select public._as(1);
insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.cv_purge_candidates(100) $$,
  '42501', null, 'a signed-in member cannot run the purge listing');
reset role;
set local role anon;
insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.cv_purge_candidates(100) $$,
  '42501', null, 'a visitor who is signed out cannot run the purge listing');

reset role;
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;
rollback;
