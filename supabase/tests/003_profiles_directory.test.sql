-- =============================================================================
-- IIUC Connect — pgTAP tests for migration 004 (profiles and directory search)
--
-- What this proves:
--   * Free-text search works through one trigram-indexed column that the
--     database keeps in step with the profile, and only ever returns rows the
--     viewer is already allowed to read.
--   * Members can edit their own profile text, but not the department, batch or
--     graduation year an admin approved, and not their name once verified.
--
-- Runs in one transaction that is rolled back; results go through a temp table
-- so the file works with `supabase test db` and as a single SQL call.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

insert into _tap_out (line) select extensions.plan(19);

-- Fixtures: 01 Vera (verified, community), 02 Una (email confirmed only),
-- 03 Carl (verified, community), 04 Hidden (verified, private).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values
  ('f0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vera@test.invalid',   now()),
  ('f0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'una@test.invalid',    now()),
  ('f0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carl@test.invalid',   now()),
  ('f0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hidden@test.invalid', now());

select private.transition_verification('f0000000-0000-4000-8000-000000000001', 'verified_student', null, 'test', null);
select private.transition_verification('f0000000-0000-4000-8000-000000000003', 'verified_student', null, 'test', null);
select private.transition_verification('f0000000-0000-4000-8000-000000000004', 'verified_student', null, 'test', null);

update public.profiles set full_name = 'Vera Rahman', department = 'CSE', batch = '45',
       headline = 'Backend engineer', skills = '{python,react}', visibility = 'iiuc_community'
 where id = 'f0000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Una Test' where id = 'f0000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Carl Khan', visibility = 'iiuc_community'
 where id = 'f0000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Hidden Person', visibility = 'private'
 where id = 'f0000000-0000-4000-8000-000000000004';

-- -----------------------------------------------------------------------------
-- 1. The search column
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'profiles_search_text_idx'),
  1,
  'a trigram index backs profile search');

insert into _tap_out (line) select extensions.ok(
  (select search_text like '%vera rahman%' and search_text like '%cse%'
          and search_text like '%python%' and search_text like '%backend engineer%'
     from public.profiles where id = 'f0000000-0000-4000-8000-000000000001'),
  'search_text collects name, department, headline and skills in lower case');

update public.profiles set headline = 'Data scientist' where id = 'f0000000-0000-4000-8000-000000000001';

insert into _tap_out (line) select extensions.ok(
  (select search_text like '%data scientist%' and search_text not like '%backend engineer%'
     from public.profiles where id = 'f0000000-0000-4000-8000-000000000001'),
  'search_text follows an edit');

-- -----------------------------------------------------------------------------
-- 2. Searching is limited by who may see the row
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_text ilike '%vera%'),
  1,
  'a verified member finds a community profile by name');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_text ilike '%vera%' and search_text ilike '%python%'),
  1,
  'every search word must match');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_text ilike '%vera%' and search_text ilike '%java%'),
  0,
  'a search word that does not match excludes the profile');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_text ilike '%hidden%'),
  0,
  'a private profile cannot be found');

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_text ilike '%vera%' or search_text ilike '%carl%'),
  0,
  'a member who is not verified finds no community profiles');

-- -----------------------------------------------------------------------------
-- 3. What a member may edit
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles
        set headline = 'Platform engineer', bio = 'Hello', job_title = 'Engineer', company = 'Acme',
            location = 'Chattogram', industry = 'Software', skills = '{go,sql}',
            linkedin_url = 'https://www.linkedin.com/in/vera', visibility = 'public'
      where id = 'f0000000-0000-4000-8000-000000000001' $$,
  'a member can edit their own profile text and visibility');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set department = 'EEE' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a member cannot change the department an admin approved');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set batch = '10' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a member cannot change the batch an admin approved');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set graduation_year = 2001 where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a member cannot change the graduation year an admin approved');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set full_name = 'Somebody Else' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a verified member cannot change their name');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set linkedin_url = 'http://linkedin.com/in/vera' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a LinkedIn address must use https');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set linkedin_url = 'https://linkedin.com.evil.example/in/vera' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a LinkedIn address on another host is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set linkedin_url = 'https://linkedin.com@evil.example/' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a LinkedIn address with hidden credentials is refused');

insert into _tap_out (line) select extensions.throws_ok(
  $$ update public.profiles set skills = (select array_agg('s' || n) from generate_series(1, 31) n)
      where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'more than 30 skills are refused');

select set_config('request.jwt.claims', '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.lives_ok(
  $$ update public.profiles set full_name = 'Una Tester' where id = 'f0000000-0000-4000-8000-000000000002' $$,
  'a member who is not yet verified can still correct their name');

reset role;

insert into _tap_out (line) select extensions.is(
  (select concat_ws('/', department, batch, graduation_year::text, full_name)
     from public.profiles where id = 'f0000000-0000-4000-8000-000000000001'),
  'CSE/45/Vera Rahman',
  'the approved details and the name are unchanged after the refused edits');

insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;

rollback;
