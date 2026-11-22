-- =============================================================================
-- IIUC Connect — pgTAP tests for migration 002 (affiliation verification flow)
--
-- What this proves:
--   * A member who has confirmed their email can submit one affiliation claim;
--     nobody else can submit it for them, or at a later stage than they are.
--   * Members cannot decide, edit or read other members' claims.
--   * Only an admin other than the claimant can approve or reject, rejection
--     needs a reason, and the outcome (status, profile fields, student ID,
--     audit event) is written in one transaction.
--   * Evidence files live in a private bucket, one folder per member.
--
-- Runs inside one transaction that is rolled back. Results are collected in a
-- temp table so the file works with `supabase test db` and as a single SQL call.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

insert into _tap_out (line) select extensions.plan(55);

-- -----------------------------------------------------------------------------
-- Fixtures (fictional people). 01 unconfirmed, 02 Alice, 03 Bob, 04 Admin,
-- 05 Dana, 06 Erin, 07 Frank, 08 Gita.
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconfirmed@test.invalid', null),
  ('c0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@test.invalid', now()),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@test.invalid',   now()),
  ('c0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', now()),
  ('c0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dana@test.invalid',  now()),
  ('c0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erin@test.invalid',  now()),
  ('c0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frank@test.invalid', now()),
  ('c0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gita@test.invalid',  now());

update public.profiles set role = 'admin' where id = 'c0000000-0000-4000-8000-000000000004';

-- -----------------------------------------------------------------------------
-- 1. Structure
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select public from storage.buckets where id = 'verification-documents'),
  false,
  'the verification-documents bucket exists and is private');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public still has RLS enabled');

-- -----------------------------------------------------------------------------
-- 2. Submitting a claim
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C200000', 'CSE', '40') $$,
  '22023', null,
  'a member who has not confirmed their email cannot submit a claim');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C201001', 'CSE', '45') $$,
  'a member with a confirmed email can submit a student claim');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C201001', 'CSE', '45') $$,
  '23505', null,
  'a member cannot have two open claims');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (user_id, method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('c0000000-0000-4000-8000-000000000003', 'document', 'student', 'C201002', 'CSE', '45') $$,
  '42501', null,
  'a member cannot submit a claim in someone else''s name');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (status, method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('approved', 'document', 'student', 'C201003', 'CSE', '45') $$,
  '42501', null,
  'a member cannot submit a claim that is already approved');

reset role;

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'c0000000-0000-4000-8000-000000000002'),
  'affiliation_pending',
  'submitting a claim moves the member to affiliation_pending');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_events
    where user_id = 'c0000000-0000-4000-8000-000000000002'
      and from_status = 'email_verified' and to_status = 'affiliation_pending'
      and actor_id = 'c0000000-0000-4000-8000-000000000002'),
  1,
  'the submission is written to the audit log with the member as actor');

-- Claim rules enforced by the table itself (run as the owner to skip RLS)
insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (user_id, method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('c0000000-0000-4000-8000-000000000003', 'document', 'student', null, 'CSE', '45') $$,
  '23514', null,
  'a document claim must include a student ID');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (user_id, method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('c0000000-0000-4000-8000-000000000003', 'document', 'alumni', 'C190001', 'CSE', '30') $$,
  '23514', null,
  'an alumni claim must include a graduation year');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('institutional_email', 'student', 'C201002', 'CSE', '45') $$,
  '42501', null,
  'the institutional-email method is not open yet');

-- -----------------------------------------------------------------------------
-- 3. Other members cannot see or change a claim
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_requests),
  0,
  'another member cannot see Alice''s claim');

update public.verification_requests set status = 'cancelled'
 where user_id = 'c0000000-0000-4000-8000-000000000002';

reset role;

insert into _tap_out (line) select extensions.is(
  (select status::text from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000002'),
  'pending',
  'another member cannot cancel Alice''s claim');

-- -----------------------------------------------------------------------------
-- 4. The claimant's own limits and evidence files
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set status = 'approved' where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a member cannot approve their own claim');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set claimed_student_id = 'C999999' where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a member cannot edit a claim after submitting it');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'student_id_card', r.user_id::text || '/' || r.id::text || '/front.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  'a member can attach a document to their open claim');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'student_id_card', 'c0000000-0000-4000-8000-000000000003/' || r.id::text || '/x.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a document path inside another member''s folder is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'student_id_card', r.user_id::text || '/00000000-0000-4000-8000-000000000000/x.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a document path that does not match the claim is refused');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'certificate', r.user_id::text || '/' || r.id::text || '/back.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  'a second document is accepted');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'other', r.user_id::text || '/' || r.id::text || '/extra.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  'a third document is accepted');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_documents (request_id, kind, storage_path)
     select r.id, 'other', r.user_id::text || '/' || r.id::text || '/fourth.jpg'
       from public.verification_requests r where r.user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '54000', null,
  'a fourth document is refused');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('verification-documents', 'c0000000-0000-4000-8000-000000000002/evidence/front.jpg') $$,
  'a member can upload a file to their own folder');

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('verification-documents', 'c0000000-0000-4000-8000-000000000003/evidence/front.jpg') $$,
  '42501', null,
  'a member cannot upload into another member''s folder');

-- Supabase blocks DELETE on storage.objects outright, so deletion cannot be
-- tried here; the structural check below covers it instead.
update storage.objects set name = 'c0000000-0000-4000-8000-000000000002/evidence/renamed.jpg'
 where bucket_id = 'verification-documents';

insert into _tap_out (line) select extensions.is(
  (select array_agg(name) from storage.objects where bucket_id = 'verification-documents'),
  array['c0000000-0000-4000-8000-000000000002/evidence/front.jpg'],
  'a member can read, but not rename, their uploaded evidence');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%verification-documents%'),
  0,
  'no policy lets anyone update or delete evidence files through the API');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'verification-documents'),
  0,
  'another member cannot see Alice''s uploaded evidence');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_documents),
  0,
  'another member cannot see Alice''s document records');

reset role;

-- -----------------------------------------------------------------------------
-- 5. Review by an admin
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000002'),
  1,
  'an admin can see a member''s claim');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.verification_documents where user_id = 'c0000000-0000-4000-8000-000000000002'),
  3,
  'an admin can see the claim''s document records');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from storage.objects where bucket_id = 'verification-documents'),
  1,
  'an admin can read uploaded evidence');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set status = 'rejected'
      where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '23514', null,
  'rejecting a claim requires a reason');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set status = 'cancelled'
      where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', null,
  'an admin cannot cancel a member''s claim');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.verification_requests set status = 'approved', review_notes = 'Card matches the claim'
      where user_id = 'c0000000-0000-4000-8000-000000000002' $$,
  'an admin can approve a claim');

reset role;

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'c0000000-0000-4000-8000-000000000002'),
  'verified_student',
  'approving a student claim makes the member a verified student');

insert into _tap_out (line) select extensions.is(
  (select concat_ws('/', affiliation::text, department, batch) from public.profiles where id = 'c0000000-0000-4000-8000-000000000002'),
  'student/CSE/45',
  'approval copies affiliation, department and batch onto the profile');

insert into _tap_out (line) select extensions.is(
  (select student_id from public.profile_private where user_id = 'c0000000-0000-4000-8000-000000000002'),
  'C201001',
  'approval records the student ID');

insert into _tap_out (line) select extensions.ok(
  (select status = 'approved' and decided_at is not null
          and reviewer_id = 'c0000000-0000-4000-8000-000000000004'
     from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000002'),
  'the claim records who decided it and when');

insert into _tap_out (line) select extensions.is(
  (select actor_id::text from public.verification_events
    where user_id = 'c0000000-0000-4000-8000-000000000002' and to_status = 'verified_student'),
  'c0000000-0000-4000-8000-000000000004',
  'the audit log records the admin who approved');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

update public.verification_requests set status = 'rejected', review_notes = 'changed my mind'
 where user_id = 'c0000000-0000-4000-8000-000000000002';

reset role;

insert into _tap_out (line) select extensions.is(
  (select status::text from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000002'),
  'approved',
  'a decided claim cannot be decided again');

-- Admin cannot approve their own claim
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C201900', 'EEE', '44') $$,
  'an admin can submit their own claim');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set status = 'approved'
      where user_id = 'c0000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'an admin cannot approve their own claim');

reset role;

-- -----------------------------------------------------------------------------
-- 6. Rejection and cancellation return the member to email_verified
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
values ('document', 'student', 'C201004', 'BBA', '46');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
update public.verification_requests set status = 'rejected', review_notes = 'The photo is unreadable'
 where user_id = 'c0000000-0000-4000-8000-000000000005';
reset role;

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'c0000000-0000-4000-8000-000000000005'),
  'email_verified',
  'a rejected member returns to email_verified');

insert into _tap_out (line) select extensions.is(
  (select actor_id::text from public.verification_events
    where user_id = 'c0000000-0000-4000-8000-000000000005' and from_status = 'affiliation_pending'),
  'c0000000-0000-4000-8000-000000000004',
  'the rejection is written to the audit log with the admin as actor');

insert into _tap_out (line) select extensions.is(
  (select notes from public.verification_events
    where user_id = 'c0000000-0000-4000-8000-000000000005' and from_status = 'affiliation_pending'),
  'The photo is unreadable',
  'the audit log keeps the reason for a rejection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select review_notes from public.verification_requests
    where user_id = 'c0000000-0000-4000-8000-000000000005' and status = 'rejected'),
  'The photo is unreadable',
  'a rejected member can read the reason');

insert into _tap_out (line) select extensions.lives_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C201004', 'BBA', '46') $$,
  'a rejected member can submit a new claim');

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
values ('document', 'student', 'C201005', 'LAW', '46');

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.verification_requests set status = 'cancelled' where user_id = 'c0000000-0000-4000-8000-000000000006' $$,
  'a member can withdraw their own open claim');

reset role;

insert into _tap_out (line) select extensions.is(
  (select verification_status::text from public.profiles where id = 'c0000000-0000-4000-8000-000000000006'),
  'email_verified',
  'withdrawing a claim returns the member to email_verified');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

-- RLS hides a closed claim from UPDATE, so this changes nothing and raises nothing.
update public.verification_requests set status = 'pending' where user_id = 'c0000000-0000-4000-8000-000000000006';

reset role;

insert into _tap_out (line) select extensions.is(
  (select status::text from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000006'),
  'cancelled',
  'a withdrawn claim cannot be reopened');

-- -----------------------------------------------------------------------------
-- 7. A student ID can belong to one member only
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
values ('document', 'student', 'C201001', 'CSE', '45');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.verification_requests set status = 'approved'
      where user_id = 'c0000000-0000-4000-8000-000000000007' $$,
  '23505', null,
  'approving a claim for a student ID already linked to someone else fails');

reset role;

insert into _tap_out (line) select extensions.is(
  (select status::text from public.verification_requests where user_id = 'c0000000-0000-4000-8000-000000000007'),
  'pending',
  'a failed approval leaves the claim open');

-- -----------------------------------------------------------------------------
-- 8. Alumni claims
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch, claimed_graduation_year)
values ('document', 'alumni', 'C190002', 'CSE', '30', 2019);
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
update public.verification_requests set status = 'approved', review_notes = 'Certificate verified'
 where user_id = 'c0000000-0000-4000-8000-000000000008';
reset role;

insert into _tap_out (line) select extensions.is(
  (select concat_ws('/', verification_status::text, affiliation::text, graduation_year::text)
     from public.profiles where id = 'c0000000-0000-4000-8000-000000000008'),
  'verified_alumni/alumni/2019',
  'approving an alumni claim makes the member a verified alumnus with their graduation year');

-- -----------------------------------------------------------------------------
-- 9. Signed-out visitors
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into _tap_out (line) select extensions.throws_ok(
  $$ insert into public.verification_requests (method, claimed_affiliation, claimed_student_id, claimed_department, claimed_batch)
     values ('document', 'student', 'C201006', 'CSE', '45') $$,
  '42501', null,
  'a signed-out visitor cannot submit a claim');

insert into _tap_out (line) select extensions.throws_ok(
  $$ select count(*) from public.verification_documents $$,
  '42501', null,
  'a signed-out visitor cannot read document records');

reset role;

-- -----------------------------------------------------------------------------
-- Report
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;

rollback;
