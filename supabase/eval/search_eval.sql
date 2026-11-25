-- =============================================================================
-- IIUC Connect — search evaluation (thesis claim 3, Chapter 6)
--
-- Measures public.search_members against the substring search it replaced, on
-- synthetic members, with the 20 queries below.
--
--   * Ground truth comes from the structured fields (a person's actual skill,
--     job title, company, ...), never from the search code. A bio that merely
--     mentions a skill is NOT relevant; about a quarter of bios do, on purpose.
--   * "normalised P@10" = relevant results in the top 10 / min(10, relevant that
--     exist). Raw P@10 = relevant in top 10 / 10 (capped below 1 when fewer than
--     ten people can match).
--   * Latency is server-side execution time as the signed-in role (so Row Level
--     Security is included); it excludes network time. 200 samples = 20 queries
--     x 10 repeats. Run on the hosted free-tier database; results vary with load.
--
-- HOW TO RUN: on a database you can throw away data from. The script deletes
-- every auth user and rolls everything back at the end, so nothing is kept.
-- Change the 200 on the line marked N to try other sizes. Output is the last
-- SELECT; saved runs are in docs/evidence/.
-- =============================================================================
begin;
delete from auth.users;

create temp table _cfg as select 200 as n;   -- N: number of members

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('e0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'e' || i || '@eval.invalid', now()
  from generate_series(0, (select n from _cfg)) i;

with pool as (
  select
    array['Rahim','Nusrat','Tanvir','Sadia','Imran','Farhana','Karim','Mizanur','Tasnim','Arif','Sumaiya','Jahid','Rafiq','Ayesha','Hasan','Mahmuda','Shakil','Lamia','Nazmul','Fahim'] as fn,
    array['Chowdhury','Jahan','Hasan','Akter','Hossain','Islam','Uddin','Rahman','Khan','Ahmed','Begum','Sarker','Mia','Talukder','Siddique','Karim','Alam','Das','Barua','Khatun'] as ln,
    array['cse','eee','bba','law','english'] as dept,
    array[array['software engineer','backend engineer','data analyst','qa engineer'],
          array['network engineer','electrical engineer','power engineer','telecom engineer'],
          array['product manager','marketing executive','accountant','business analyst'],
          array['legal officer','compliance officer','advocate','paralegal'],
          array['content writer','teacher','translator','editor']] as jobs,
    array['bkash','nagad','grameenphone','robi','pathao','brain station 23','bracbank','square pharma','daraz','iiuc'] as co,
    array['fintech','fintech','telecom','telecom','software','software','banking','pharma','ecommerce','education'] as ind,
    array['dhaka','chattogram','sylhet','remote','khulna'] as loc,
    array['python','react','postgresql','golang','java','docker','machine learning','networking','sql','figma','excel','research'] as sk
), src as (
  select p.id, n.i,
         abs(hashtext(n.i::text || 'k1')) as h1, abs(hashtext(n.i::text || 'k2')) as h2,
         abs(hashtext(n.i::text || 'k3')) as h3, abs(hashtext(n.i::text || 'k4')) as h4,
         abs(hashtext(n.i::text || 'k5')) as h5, abs(hashtext(n.i::text || 'k6')) as h6,
         abs(hashtext(n.i::text || 'k7')) as h7, abs(hashtext(n.i::text || 'k8')) as h8,
         abs(hashtext(n.i::text || 'k9')) as h9, abs(hashtext(n.i::text || 'k10')) as h10,
         abs(hashtext(n.i::text || 'k11')) as h11, abs(hashtext(n.i::text || 'k12')) as h12
    from public.profiles p
   cross join lateral (select right(p.id::text, 12)::int as i) n
   where p.id::text like 'e0000000-%' and n.i > 0
)
update public.profiles p set
  full_name = pool.fn[1 + s.h1 % 20] || ' ' || pool.ln[1 + s.h2 % 20],
  department = pool.dept[1 + s.h3 % 5],
  job_title = pool.jobs[1 + s.h3 % 5][1 + s.h4 % 4],
  company = pool.co[1 + s.h5 % 10],
  industry = pool.ind[1 + s.h5 % 10],
  location = pool.loc[1 + s.h6 % 5],
  batch = (30 + s.h7 % 26)::text,
  skills = (select array_agg(distinct x) from unnest(array[pool.sk[1 + s.h8 % 12], pool.sk[1 + s.h9 % 12], pool.sk[1 + s.h10 % 12]]) x),
  headline = pool.jobs[1 + s.h3 % 5][1 + s.h4 % 4] || ' at ' || pool.co[1 + s.h5 % 10],
  bio = case when s.h11 % 4 = 0 then 'Currently exploring ' || pool.sk[1 + s.h12 % 12] || ' in my free time.'
             else 'Studied at IIUC and now working in ' || pool.ind[1 + s.h5 % 10] || '.' end,
  visibility = (case when s.i % 20 = 7 then 'private' else 'iiuc_community' end)::public.profile_visibility,
  affiliation = (case when s.i % 10 = 3 then 'alumni' else 'student' end)::public.affiliation,
  verification_status = (case when s.i % 10 = 3 then 'verified_alumni' else 'verified_student' end)::public.verification_status
from src s cross join pool
where p.id = s.id;

-- A few known people for the name queries (and near-name distractors).
update public.profiles set full_name = 'Rahim Chowdhury' where id = 'e0000000-0000-4000-8000-000000000020';
update public.profiles set full_name = 'Nusrat Jahan'    where id = 'e0000000-0000-4000-8000-000000000021';
update public.profiles set full_name = 'Rahim Uddin'     where id = 'e0000000-0000-4000-8000-000000000022';
update public.profiles set full_name = 'Karim Chowdhury' where id = 'e0000000-0000-4000-8000-000000000023';
-- The searcher.
update public.profiles set full_name = 'Viewer Zero', verification_status = 'verified_student', affiliation = 'student'
 where id = 'e0000000-0000-4000-8000-000000000000';

-- The 20 queries and what makes a person relevant to each.
create temp table _q (qid int primary key, q text, kind text, rule jsonb);
insert into _q values
 (1,'python','plain','{"skill":"python"}'),
 (2,'react','plain','{"skill":"react"}'),
 (3,'postgresql','plain','{"skill":"postgresql"}'),
 (4,'machine learning','plain','{"skill":"machine learning"}'),
 (5,'product manager','plain','{"job":"product manager"}'),
 (6,'software engineer','plain','{"job":"software engineer"}'),
 (7,'network engineer','plain','{"job":"network engineer"}'),
 (8,'cse python','plain','{"dept":"cse","skill":"python"}'),
 (9,'dhaka fintech','plain','{"loc":"dhaka","ind":"fintech"}'),
 (10,'bkash','plain','{"co":"bkash"}'),
 (11,'grameenphone telecom','plain','{"co":"grameenphone"}'),
 (12,'45','plain','{"batch":"45"}'),
 (13,'rahim chowdhury','plain','{"name":"Rahim Chowdhury"}'),
 (14,'nusrat jahan','plain','{"name":"Nusrat Jahan"}'),
 (15,'rahmin chowdhury','typo','{"name":"Rahim Chowdhury"}'),
 (16,'chowdury','typo','{"last":"Chowdhury"}'),
 (17,'pythn','typo','{"skill":"python"}'),
 (18,'postgrsql','typo','{"skill":"postgresql"}'),
 (19,'enginer','typo','{"jobpat":"%engineer%"}'),
 (20,'grameenpone','typo','{"co":"grameenphone"}');

create temp table _truth as
select q.qid, p.id
  from _q q
  join public.profiles p
    on p.verification_status in ('verified_student','verified_alumni','trusted_member')
   and p.visibility <> 'private'
   and p.id <> 'e0000000-0000-4000-8000-000000000000'
   and (q.rule->>'skill'  is null or q.rule->>'skill' = any(p.skills))
   and (q.rule->>'dept'   is null or p.department = q.rule->>'dept')
   and (q.rule->>'job'    is null or p.job_title = q.rule->>'job')
   and (q.rule->>'jobpat' is null or p.job_title like q.rule->>'jobpat')
   and (q.rule->>'co'     is null or p.company = q.rule->>'co')
   and (q.rule->>'loc'    is null or p.location = q.rule->>'loc')
   and (q.rule->>'ind'    is null or p.industry = q.rule->>'ind')
   and (q.rule->>'batch'  is null or p.batch = q.rule->>'batch')
   and (q.rule->>'name'   is null or p.full_name = q.rule->>'name')
   and (q.rule->>'last'   is null or p.full_name like ('% ' || (q.rule->>'last')));

create temp table _res (qid int, sys text, pos int, id uuid);
create temp table _lat (sys text, qid int, ms numeric);
grant all on _q, _truth, _res, _lat to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000000","role":"authenticated"}', true);

-- New search: top 10 per query.
insert into _res
select q.qid, 'new', s.ordinality, s.id
  from _q q
 cross join lateral public.search_members(q.q, null, 10, 0) with ordinality as s;

-- Old search (the substring query the directory used before D-029): every word
-- must appear in search_text; alphabetical order.
insert into _res
select qid, 'old', pos, id from (
  select q.qid, p.id, row_number() over (partition by q.qid order by p.full_name, p.id) as pos
    from _q q
    join public.profiles p
      on p.verification_status in ('verified_student','verified_alumni','trusted_member')
     and p.visibility <> 'private'
     and p.id <> (select auth.uid())
   where not exists (select 1 from unnest(string_to_array(lower(q.q), ' ')) w where p.search_text not like '%' || w || '%')
) x where pos <= 10;

-- Latency: 10 repeats of each query, both searches, first page of 20.
do $$
declare r record; t0 timestamptz; i int;
begin
  for i in 1..10 loop
    for r in select qid, q from _q loop
      t0 := clock_timestamp();
      perform count(*) from public.search_members(r.q, null, 20, 0);
      insert into _lat values ('new', r.qid, extract(epoch from clock_timestamp() - t0) * 1000);
      t0 := clock_timestamp();
      perform count(*) from (
        select p.id from public.profiles p
         where p.verification_status in ('verified_student','verified_alumni','trusted_member')
           and p.visibility <> 'private' and p.id <> (select auth.uid())
           and not exists (select 1 from unnest(string_to_array(lower(r.q), ' ')) w where p.search_text not like '%' || w || '%')
         order by p.full_name, p.id limit 20) z;
      insert into _lat values ('old', r.qid, extract(epoch from clock_timestamp() - t0) * 1000);
    end loop;
  end loop;
end $$;

reset role;

with per as (
  select q.qid, q.q, q.kind,
    (select count(*) from _truth t where t.qid = q.qid) as rel,
    (select count(*) from _res r join _truth t on t.qid = r.qid and t.id = r.id where r.qid = q.qid and r.sys = 'old') as oh,
    (select count(*) from _res r join _truth t on t.qid = r.qid and t.id = r.id where r.qid = q.qid and r.sys = 'new') as nh,
    (select count(*) from _res r where r.qid = q.qid and r.sys = 'old') as oret,
    (select count(*) from _res r where r.qid = q.qid and r.sys = 'new') as nret
  from _q q
)
select line from (
  select 0 as ord, format('profiles=%s  visible_non_private=%s',
           (select count(*) from public.profiles where id::text like 'e0000000-%'),
           (select count(*) from public.profiles where id::text like 'e0000000-%' and visibility <> 'private' and verification_status <> 'unverified')) as line
  union all
  select 10 + qid, format('q%-2s %-5s %-22s relevant=%-3s | OLD top10: %s relevant of %s returned | NEW top10: %s relevant of %s returned',
           qid, kind, '"' || q || '"', rel, oh, oret, nh, nret) from per
  union all
  select 100 + row_number() over (), format('%-5s normalised P@10 (relevant in top 10 / min(10, relevant))  OLD=%s  NEW=%s   raw P@10 OLD=%s NEW=%s',
           kind,
           round(avg(least(oh, 10)::numeric / least(10, rel)), 3),
           round(avg(least(nh, 10)::numeric / least(10, rel)), 3),
           round(avg(oh / 10.0), 3), round(avg(nh / 10.0), 3))
    from per where rel > 0 group by kind
  union all
  select 200 + row_number() over (), format('latency %s (ms, server side, %s samples): p50=%s p95=%s max=%s', sys, count(*),
           round(percentile_cont(0.5) within group (order by ms)::numeric, 1),
           round(percentile_cont(0.95) within group (order by ms)::numeric, 1),
           round(max(ms), 1))
    from _lat group by sys
) z order by ord;

rollback;
