-- Demo data for manual testing, UAT and the defense demo. NOT a migration.
-- Run in the Supabase SQL editor (or execute_sql). Remove with demo_cleanup.sql.
-- Six members (4 alumni, 2 students; demo1 and demo2 are mentors), five jobs,
-- one application. They cannot sign in (@demo.invalid, no password); they exist
-- so a real test account sees a filled directory, jobs board and mentor slots.
-- Every row is tied to an auth user id starting 'd3000000-', so cascade deletes it all.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('d3000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'demo' || n || '@demo.invalid', now()
  from generate_series(1, 6) n;

update public.profiles p set
  full_name = d.full_name, headline = d.headline, bio = d.bio, department = d.dept, batch = d.batch,
  graduation_year = d.gy, job_title = d.job_title, company = d.company, location = d.loc,
  industry = d.industry, skills = d.skills, onboarded_at = now()
from (values
 (1,'Rahim Chowdhury','Backend engineer building payment systems','Graduated 2022. Happy to help with interviews, first-job advice and system design.','cse','45',2022,'Software Engineer','Brain Station 23','Dhaka','Software',array['Node.js','PostgreSQL','System design']),
 (2,'Nusrat Jahan','Network engineer in telecom','Radio and core network work at a mobile operator. Can talk about EEE to telecom careers.','eee','42',2019,'Network Engineer','Grameenphone','Dhaka','Telecom',array['5G','Networking','Python']),
 (3,'Tanvir Hasan','Product manager in fintech','Moved from BBA into product. Ask me about breaking into product roles.','bba','40',2018,'Product Manager','bKash','Dhaka','Fintech',array['Product','Analytics','SQL']),
 (4,'Sadia Akter','Final-year CSE student','Interested in machine learning and open source.','cse','54',null,null,null,'Chattogram','Software',array['Python','React']),
 (5,'Imran Hossain','Engineering manager','Hiring engineers and interns. Alumni referrals welcome.','cse','38',2016,'Engineering Manager','Pathao','Dhaka','Software',array['Leadership','Go','Hiring']),
 (6,'Farhana Islam','Law student','Interested in tech law and compliance.','law','53',null,null,null,'Chattogram','Legal',array['Research','Writing'])
) as d(n, full_name, headline, bio, dept, batch, gy, job_title, company, loc, industry, skills)
where p.id = ('d3000000-0000-4000-8000-0000000000' || lpad(d.n::text, 2, '0'))::uuid;

select private.transition_verification(id, 'affiliation_pending', null, 'demo', null) from public.profiles where id::text like 'd3000000-%';
select private.transition_verification(id, 'verified_alumni', null, 'demo', null) from public.profiles where id::text like 'd3000000-%' and id::text ~ '0[1235]$';
select private.transition_verification(id, 'verified_student', null, 'demo', null) from public.profiles where id::text like 'd3000000-%' and id::text ~ '0[46]$';

-- The app sets affiliation when a claim is submitted; slot generation needs it.
update public.profiles set affiliation = case when verification_status = 'verified_student' then 'student'::public.affiliation else 'alumni'::public.affiliation end where id::text like 'd3000000-%';

insert into public.mentor_profiles (id, expertise_areas, bio, max_sessions_per_week, accepting_requests) values
 ('d3000000-0000-4000-8000-000000000001','{"Interviews","System design","First job"}','Backend engineer, two years in industry.',3,true),
 ('d3000000-0000-4000-8000-000000000002','{"Telecom","Networking","Higher studies"}','Telecom engineer, glad to help EEE and CSE juniors.',2,true);
-- Weekdays: 0 = Sunday. Rules make slots for the next 14 days; the nightly job keeps them coming.
insert into public.mentor_availability_rules (mentor_id, weekday, start_time, end_time) values
 ('d3000000-0000-4000-8000-000000000001',0,'20:00','22:00'),
 ('d3000000-0000-4000-8000-000000000001',2,'20:00','22:00'),
 ('d3000000-0000-4000-8000-000000000002',4,'19:00','21:00');
select private.generate_slots(id) from public.mentor_profiles where id::text like 'd3000000-%';

insert into public.jobs (poster_id, title, company, location, job_type, description, status) values
 ('d3000000-0000-4000-8000-000000000005','Junior Backend Engineer','Pathao','Dhaka','full_time','Work on the dispatch services in Go and PostgreSQL. Fresh graduates welcome; we pair every new hire with a mentor.','active'),
 ('d3000000-0000-4000-8000-000000000005','Software Engineering Intern','Pathao','Dhaka (hybrid)','internship','Three-month internship on the rider app team. Strong data structures basics and one finished project required.','active'),
 ('d3000000-0000-4000-8000-000000000003','Associate Product Analyst','bKash','Dhaka','full_time','Own weekly product metrics and write SQL for the merchant payments team. No prior product experience needed.','active'),
 ('d3000000-0000-4000-8000-000000000002','Part-time Network Lab Assistant','Grameenphone','Chattogram','part_time','Help run the regional test lab two days a week. Suitable for final-year EEE and CSE students.','active'),
 ('d3000000-0000-4000-8000-000000000001','Contract Frontend Developer','Brain Station 23','Remote','contract','Six-week contract to rebuild an internal dashboard in React. This role has been filled.','closed');

insert into public.job_applications (job_id, applicant_id, message)
select id, 'd3000000-0000-4000-8000-000000000004', 'I am a final-year CSE student and have built two Go projects. I would love to join the team.'
  from public.jobs where title = 'Software Engineering Intern';
