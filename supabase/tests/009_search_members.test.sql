-- =============================================================================
-- IIUC Connect — pgTAP tests for migration 009 (ranked, typo-tolerant search)
--
-- What this proves (thesis claim 3):
--   * Profiles carry a weighted search vector: name A, job title / headline /
--     skills B, company / department / place C, bio D.
--   * public.search_members ranks by those weights (name before skill before bio,
--     also for a misspelt word), finds names despite a typo, matches word
--     prefixes, needs every word.
--   * It runs with the caller's rights, so it never returns a private profile,
--     an unverified member or the caller, even for an admin; anon cannot call it.
--   * Hostile input is inert; paging and the page-size cap hold.
--
-- Runs in one transaction that is rolled back; results go through a temp table
-- so the file works with `supabase test db` and as a single SQL call.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

create temp table _tap_out (seq serial primary key, line text not null);
grant all on _tap_out to public;
grant all on sequence _tap_out_seq_seq to public;

insert into _tap_out (line) select extensions.plan(35);

-- Fixtures (all verified students unless noted):
-- 01 Vera Viewer (the caller)         02 Rahim Chowdhury (alumni, name + skill)
-- 03 Nusrat Jahan (bio mentions Rahim) 04 Dana Python (name)
-- 05 Sara Lee (skill python)           06 Tom Roy (bio python)
-- 07 Hidden Python (private)           08 Una Python (not verified)
-- 09 Karim Uddin                       10 Admin Anna (admin, not verified)
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('f9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'u' || n || '@test.invalid', now()
  from generate_series(1, 10) n;

select private.transition_verification(('f9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                                       'verified_student', null, 'test', null)
  from generate_series(1, 9) n
 where n <> 8;

update public.profiles set full_name = 'Vera Viewer' where id = 'f9000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Rahim Chowdhury', headline = 'Backend engineer',
       skills = '{postgresql}', department = 'cse' where id = 'f9000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Nusrat Jahan', headline = 'Network engineer',
       bio = 'I once worked with Rahim on a telecom project.' where id = 'f9000000-0000-4000-8000-000000000003';
update public.profiles set full_name = 'Dana Python', skills = '{react}' where id = 'f9000000-0000-4000-8000-000000000004';
update public.profiles set full_name = 'Sara Lee', skills = '{python}' where id = 'f9000000-0000-4000-8000-000000000005';
update public.profiles set full_name = 'Tom Roy', bio = 'I enjoy python on weekends.' where id = 'f9000000-0000-4000-8000-000000000006';
update public.profiles set full_name = 'Hidden Python', skills = '{python}', visibility = 'private' where id = 'f9000000-0000-4000-8000-000000000007';
update public.profiles set full_name = 'Una Python', skills = '{python}' where id = 'f9000000-0000-4000-8000-000000000008';
update public.profiles set full_name = 'Karim Uddin', skills = '{react}' where id = 'f9000000-0000-4000-8000-000000000009';
update public.profiles set full_name = 'Admin Anna', role = 'admin' where id = 'f9000000-0000-4000-8000-000000000010';

update public.profiles set affiliation = 'alumni'  where id = 'f9000000-0000-4000-8000-000000000002';
update public.profiles set affiliation = 'student'
 where id::text like 'f9000000-%' and id <> 'f9000000-0000-4000-8000-000000000002';

-- -----------------------------------------------------------------------------
-- 1. Structure and weights
-- -----------------------------------------------------------------------------
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.profiles where search_vector is null),
  0, 'every profile has a weighted search vector');

insert into _tap_out (line) select extensions.is(
  (select prosecdef from pg_proc where oid = 'public.search_members(text, public.affiliation, integer, integer)'::regprocedure),
  false, 'search_members runs with the caller''s rights, so Row Level Security applies');

insert into _tap_out (line) select extensions.ok(
  (select search_vector @@ to_tsquery('simple', 'rahim:A')
          and search_vector @@ to_tsquery('simple', 'postgresql:B')
          and search_vector @@ to_tsquery('simple', 'cse:C')
     from public.profiles where id = 'f9000000-0000-4000-8000-000000000002'),
  'name is weight A, skills B, department C');

insert into _tap_out (line) select extensions.ok(
  (select search_vector @@ to_tsquery('simple', 'rahim:D') and not search_vector @@ to_tsquery('simple', 'rahim:A')
     from public.profiles where id = 'f9000000-0000-4000-8000-000000000003'),
  'a word in the bio is weight D only');

update public.profiles set skills = '{postgresql,golang}' where id = 'f9000000-0000-4000-8000-000000000002';
insert into _tap_out (line) select extensions.ok(
  (select search_vector @@ to_tsquery('simple', 'golang:B') from public.profiles where id = 'f9000000-0000-4000-8000-000000000002'),
  'the search vector follows an edit');
update public.profiles set skills = '{postgresql}' where id = 'f9000000-0000-4000-8000-000000000002';

insert into _tap_out (line) select extensions.is(
  (select has_function_privilege('anon', 'public.search_members(text, public.affiliation, integer, integer)', 'execute')),
  false, 'anon cannot execute the search');

insert into _tap_out (line) select extensions.is(
  (select has_function_privilege('authenticated', 'public.search_members(text, public.affiliation, integer, integer)', 'execute')),
  true, 'signed-in users can execute the search');

-- -----------------------------------------------------------------------------
-- 2. As a verified member
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Ranking
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('python')),
  3, '"python" finds the name, skill and bio matches, and not the private or unverified ones');

insert into _tap_out (line) select extensions.is(
  (select full_name from public.search_members('python') limit 1),
  'Dana Python', 'a name match ranks first');

insert into _tap_out (line) select extensions.ok(
  (select max(rank) filter (where full_name = 'Dana Python') > max(rank) filter (where full_name = 'Sara Lee')
      and max(rank) filter (where full_name = 'Sara Lee')   > max(rank) filter (where full_name = 'Tom Roy')
     from public.search_members('python')),
  'rank falls from name to skill to bio');

insert into _tap_out (line) select extensions.is(
  (select full_name from public.search_members('rahim') limit 1),
  'Rahim Chowdhury', 'the person named Rahim ranks above the one whose bio mentions Rahim');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('rahim')),
  2, 'both Rahim matches are returned');

-- Typo tolerance and prefixes
insert into _tap_out (line) select extensions.is(
  (select full_name from public.search_members('rahmin') limit 1),
  'Rahim Chowdhury', 'a transposed letter ("rahmin") still finds Rahim');

insert into _tap_out (line) select extensions.is(
  (select full_name from public.search_members('chowdury') limit 1),
  'Rahim Chowdhury', 'a dropped letter ("chowdury") still finds Chowdhury');

insert into _tap_out (line) select extensions.ok(
  (select max(rank) filter (where full_name = 'Dana Python') > max(rank) filter (where full_name = 'Sara Lee')
      and max(rank) filter (where full_name = 'Sara Lee')   > max(rank) filter (where full_name = 'Tom Roy')
     from public.search_members('pythn')),
  'a misspelt word ("pythn") still ranks name, then skill, then bio');

insert into _tap_out (line) select extensions.ok(
  exists (select 1 from public.search_members('rah') where full_name = 'Rahim Chowdhury'),
  'the start of a word ("rah") matches');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('zq')),
  0, 'a short word with no match is not fuzzy-matched to everyone');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('xylophone')),
  0, 'a word that is not close to anything returns nothing');

-- Several words
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('rahim backend')),
  1, 'every word must match: "rahim backend" is only Rahim');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('rahim sailing')),
  0, 'a second word with no match removes the result');

-- Scope
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('')),
  6, 'an empty search lists every other verified, non-private member');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('vera')),
  0, 'the caller is not in their own results');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('', 'alumni')),
  1, 'the alumni filter keeps only alumni');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('', 'student')),
  5, 'the student filter keeps only students');

-- Paging
insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('', null, 2, 2)),
  2, 'limit and offset page the results');

insert into _tap_out (line) select extensions.is(
  (select min(total)::int from public.search_members('', null, 2, 2)),
  6, 'every row carries the full match count');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('', null, 20, 100)),
  0, 'a page past the end is empty, not an error');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('', null, 0, 0)),
  1, 'a limit below 1 is raised to 1');

-- Hostile or odd input
insert into _tap_out (line) select extensions.lives_ok(
  $$ select * from public.search_members('''); drop table public.profiles; --%_\ & | ! : * ( )') $$,
  'quotes, wildcards and tsquery operators are inert');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('%') ) + (select count(*)::int from public.search_members('\ _ ,)')),
  0, 'a query with nothing searchable in it ("%", "\ _ ,)") matches nobody');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('   ')),
  6, 'a query of only spaces lists everyone, like an empty one');

insert into _tap_out (line) select extensions.lives_ok(
  $$ select * from public.search_members('a b c d e f g h i j k l') $$,
  'more than five words is accepted');

reset role;

-- -----------------------------------------------------------------------------
-- 3. An admin can read private profiles, but the directory still hides them
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f9000000-0000-4000-8000-000000000010","role":"authenticated"}', true);

insert into _tap_out (line) select extensions.ok(
  (select count(*) = 1 from public.profiles where full_name = 'Hidden Python'),
  'fixture check: the admin can read the private profile directly');

insert into _tap_out (line) select extensions.is(
  (select count(*)::int from public.search_members('python')),
  3, 'the admin''s directory search still hides the private and unverified profiles');

reset role;

-- -----------------------------------------------------------------------------
-- 4. anon
-- -----------------------------------------------------------------------------
set local role anon;

insert into _tap_out (line) select extensions.throws_ok(
  $$ select * from public.search_members('rahim') $$,
  '42501', null, 'anon is refused');

reset role;

insert into _tap_out (line) select * from extensions.finish();
select line from _tap_out order by seq;

rollback;
