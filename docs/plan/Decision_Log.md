# IIUC Connect — Decision Log (Thesis Appendix F)

---

Decision #: D-001
Date: 2026-11-16
Module: Platform
Decision: Build on Next.js 16 instead of Next.js 14.
Rationale: Next.js 14 reached end of life on 26 October 2025 and receives no security patches. A thesis claiming security as a contribution cannot pin an unsupported framework.
Alternatives considered: Next.js 14 (unsupported); Next.js 15 (maintenance ended October 2026).
Trade-offs accepted: Fewer tutorials for the newest major; v1 notes written for 14 need re-checking against current docs.
Source: Next.js Support Policy, https://nextjs.org/support-policy
Status: Accepted

---

Decision #: D-002
Date: 2026-11-16
Module: Scope
Decision: Reduce from nine modules to a prioritized core (see D-012 for the final priority order).
Rationale: The thesis claims depend only on the core; breadth would cost depth of testing and evaluation.
Alternatives considered: Full v1 scope; mentorship-only.
Trade-offs accepted: Less feature breadth in the demo.
Source: Master File v2.1, section 4.
Status: Accepted

---

Decision #: D-003
Date: 2026-11-16
Module: Mentorship
Decision: Implement availability and booking natively in PostgreSQL instead of integrating Cal.com.
Rationale: Booking integrity (one pending request per pair, no double-booked slot, 72-hour expiry) is enforced and tested with database constraints, which is itself a contribution. It is free with no external limit, and mentors need no second account.
Alternatives considered: Cal.com free plan (per-mentor account friction, webhook dependency, core logic outside the evaluated system).
Trade-offs accepted: No sync with mentors' personal calendars; mentors paste their own meeting link; we send an .ics file.
Source: PostgreSQL documentation, Partial Indexes and Unique Constraints.
Status: Accepted (team asked for the best free option, 2026-11-16)

---

Decision #: D-004
Date: 2026-11-16
Module: Authorization
Decision: Protect role, verification_status, affiliation and reputation_score with column-level grants; change them only through SECURITY DEFINER functions.
Rationale: RLS is row-level. An "update own row" policy alone lets a user set their own role or verification status.
Alternatives considered: BEFORE UPDATE trigger; separate table for privileged columns.
Trade-offs accepted: Every new editable profile column must be added to the grant list.
Source: Supabase, Row Level Security; PostgreSQL, GRANT.
Status: Accepted. Implemented in migration 20261116104143; proven by pgTAP tests 29–31 and 45.

---

Decision #: D-005
Date: 2026-11-16
Module: Mentorship
Decision: Enforce "one pending request per mentee–mentor pair" with a partial unique index WHERE status = 'pending'.
Rationale: v1's UNIQUE (mentee_id, mentor_id, status) also blocked any second completed or declined request between the same two people, and an RLS-only check is unsafe under concurrent inserts.
Alternatives considered: RLS WITH CHECK subquery; application-level check. Both have race conditions.
Trade-offs accepted: None significant.
Source: PostgreSQL documentation, Partial Indexes.
Status: Accepted

---

Decision #: D-006
Date: 2026-11-16
Module: Authorization
Decision: Server code uses a session-bound Supabase client by default; the privileged key is confined to webhooks and scheduled jobs.
Rationale: v1 specified the service-role key for the general server client, which bypasses RLS and makes every policy and test meaningless for server-rendered pages.
Alternatives considered: Privileged client everywhere with manual checks.
Trade-offs accepted: Some admin operations need explicit SECURITY DEFINER functions.
Source: Supabase, Server-Side Auth for Next.js (creating-a-client guide and the official `examples/auth/nextjs` code).
Status: Accepted. Implemented in `lib/supabase/server.ts`. No privileged client exists in the codebase yet.

---

Decision #: D-007
Date: 2026-11-16
Module: Search
Decision: Build on PostgreSQL full-text search first, then add Typesense, and report both.
Status: Superseded by D-009

---

Decision #: D-008
Date: 2026-11-16
Module: Privacy
Decision: Store student ID, institutional email, phone and personal email in a separate owner-and-admin-only table instead of per-field visibility flags on profiles.
Rationale: RLS cannot hide individual columns.
Alternatives considered: Masking views; per-field flags enforced in application code.
Trade-offs accepted: Coarser privacy control than v1 promised.
Source: Supabase, Row Level Security.
Status: Accepted. Implemented as `profile_private`; proven by pgTAP tests 20, 25, 41, 43.

---

Decision #: D-009
Date: 2026-11-16
Module: Search
Decision: PostgreSQL full-text search with weighted tsvector and pg_trgm is the production search. Typesense is used, at most, for a time-boxed comparison on its one-time free credit.
Rationale: The project is free-tier only. Self-hosted Typesense needs a paid server; Typesense Cloud gives a one-time 720-hour credit that does not renew. PostgreSQL search runs inside the existing free Supabase database, needs no sync pipeline, and respects RLS natively.
Alternatives considered: Typesense self-hosted (paid VPS); Typesense Cloud (credit expires); Algolia free plan (external index of personal data, sync pipeline to build in limited time).
Trade-offs accepted: Weaker typo tolerance and ranking control than a dedicated engine; no instant-search-as-you-type at scale.
Source: PostgreSQL documentation, Full Text Search and pg_trgm; Typesense Cloud free tier terms.
Status: Accepted

---

Decision #: D-010
Date: 2026-11-16
Module: Email
Decision: Use custom SMTP for authentication and application email through a dedicated project Gmail account with an app password. Move to Resend if the team later obtains a domain.
Rationale: Supabase's built-in mailer is limited to 2 emails per hour and delivers only to project team members, so real users could never receive an OTP. Resend's free tier needs a verified domain to send to arbitrary recipients, and the team has none.
Alternatives considered: Supabase default mailer (unusable); personal Gmail (exposes a personal address to participants and stores its app password in project settings); paid email plans (excluded).
Trade-offs accepted: Gmail has daily sending caps and weaker deliverability; acceptable for a prototype and UAT with about 10 users.
Source: Supabase, Send emails with custom SMTP, https://supabase.com/docs/guides/auth/auth-smtp
Status: Accepted. Account being created by the team; wiring happens in Sprint 2.

---

Decision #: D-011
Date: 2026-11-16
Module: Verification
Decision: Students verify by OTP to their institutional mailbox (pattern like c231226@ugrad.iiuc.ac.bd), with student ID and department derived from the address. Alumni verify by document review.
Rationale: The institutional mailbox is an existing, free proof of affiliation. Alumni may not retain mailbox access, so they need a separate path.
Alternatives considered: Document review for everyone (slow, admin bottleneck); domain check without OTP (trivially spoofed).
Trade-offs accepted: Mailbox control does not prove current enrolment; stated as a limitation.
Source: Team knowledge of IIUC email format; Supabase Auth OTP documentation.
Status: Accepted (ID format breakdown to be confirmed)

---

Decision #: D-012
Date: 2026-11-16
Module: Scope
Decision: Execute the 12-sprint plan in 19 days with a Must / Should / Could priority order and a feature freeze on 29 November.
Rationale: Pre-defense is 5 December 2026 and the report is due with it. Ordering by thesis value means anything cut comes from the bottom, and the last week is reserved for evaluation and user testing, which the report cannot do without.
Alternatives considered: Attempting the full v2.0 scope (no time left for evaluation); building until the last day (no measured results).
Trade-offs accepted: Events, weekly digest, web push and offline reading may be documented as designed but not implemented.
Source: Master File v2.1, sections 4 and 12.
Status: Accepted

---

Decision #: D-013
Date: 2026-11-16
Module: Identity
Decision: Split the single "role" idea into two columns: `role` (member or admin) for privileges, and `affiliation` (student or alumni) for what the person is. Whether someone may act as a verified student or alumnus is read from `verification_status`.
Rationale: The v1 enum (student, alumni, faculty, admin) forced one value to answer two questions. An admin is also a student or an alumnus, and a new user has no affiliation until they claim one.
Alternatives considered: One enum with combined values (grows combinatorially); a boolean `is_admin` (less extensible than an enum).
Trade-offs accepted: Policies read `verification_status` rather than a single role field.
Source: Design review while writing migration 20261116104143.
Status: Accepted

---

Decision #: D-014
Date: 2026-11-16
Module: Verification
Decision: Every verification table is read-only through the API. All writes, including a user submitting their own claim, go through SECURITY DEFINER functions. One internal function, `private.transition_verification`, is the only code that changes `verification_status`, and it writes the audit event in the same transaction. Legal transitions are defined in one place, `private.is_allowed_transition`.
Rationale: A status change without its audit event, or an audit event without a status change, must be impossible. Direct inserts cannot guarantee that; a single function can.
Alternatives considered: INSERT policies with WITH CHECK on requests plus triggers to move status (logic spread across policies and triggers, harder to test and to explain).
Trade-offs accepted: Each user action in the verification flow needs its own small database function.
Source: Supabase, Row Level Security (security definer functions); PostgreSQL, CREATE FUNCTION.
Status: Accepted. Core implemented in Sprint 1; user-facing and admin-facing functions come in Sprints 3 and 4.

---

Decision #: D-015
Date: 2026-11-16
Module: Audit
Decision: Make `verification_events` append-only with three layers: no UPDATE/DELETE/TRUNCATE privilege for any API role including the service role; a row trigger that rejects every UPDATE and DELETE; a statement trigger that rejects TRUNCATE. The single exception is the foreign-key action that nulls a user reference when an account is deleted.
Rationale: Privileges alone do not stop the table owner or a future privileged function. The trigger makes tampering fail for every role.
Alternatives considered: Privileges only (owner can still edit); a separate audit database (not available on the free tier).
Trade-offs accepted: A database superuser can still disable the trigger; this is stated as a limitation.
Source: PostgreSQL, CREATE TRIGGER.
Status: Accepted. Proven by pgTAP tests 13–18 and 46.

---

Decision #: D-016
Date: 2026-11-16
Module: Testing
Decision: Write pgTAP tests so each assertion is inserted into a temporary table and the file ends with one SELECT of that table, all inside a transaction that is rolled back.
Rationale: The team has no local Docker database, and the hosted SQL endpoint returns only the last result set. This shape lets the same file run through `supabase test db` and through a single SQL call against the hosted database, and it leaves no test data behind.
Alternatives considered: Standard pgTAP with one SELECT per assertion (only the last line is visible through the hosted endpoint); a local Supabase stack in Docker (heavy for the team's hardware and time).
Trade-offs accepted: Tests run against the shared development database rather than an isolated one; fixtures use fixed fictional IDs and every query filters on them.
Source: Supabase, Testing RLS with pgTAP; pgTAP documentation.
Status: Accepted

---

Decision #: D-017
Date: 2026-11-16
Module: Frontend
Decision: Use the system font stack instead of downloaded web fonts, and keep Cache Components and Partial Prefetching enabled as generated by create-next-app 16.4.
Rationale: System fonts cost zero bytes on slow mobile data, which supports the low-bandwidth claim. Cache Components is the framework's current default model; it requires uncached data to sit behind Suspense, which matches the rule that every data view has a loading state and that personalized data is never cached.
Alternatives considered: Geist via next/font (extra download, build-time network dependency); disabling Cache Components (works against framework defaults and documentation).
Trade-offs accepted: Typography varies slightly between devices.
Source: Next.js 16.4 documentation shipped in the package, "Caching" guide.
Status: Accepted

---

Decision #: D-018
Date: 2026-11-23
Module: Mentorship
Decision: Rebuild mentorship to the Master File's model (mentor profiles, weekly availability rules, generated slots, requests, sessions, blind feedback) instead of layering requests on the Sprint 5 "book a slot" design. The Sprint 5 tables, functions and tests were dropped; the hosted database held no data.
Rationale: One model to explain, matching the ER diagram and the booking state machine in the report. The Sprint 5 design was built from an inferred scope before the plan files were in the repository.
Alternatives considered: Keep Sprint 5 and add a request table on top (two overlapping models, harder to defend); keep Sprint 5 as is (does not match the plan's accept/decline flow).
Trade-offs accepted: About a day of Sprint 5 work discarded; the mistake is recorded in the Dev Journal.
Source: IIUC_Connect_Master_File_v2; docs/superpowers/specs/2026-11-23-mentorship-design.md.
Status: Accepted

---

Decision #: D-019
Date: 2026-11-23
Module: Mentorship, authorization
Decision: Member writes use column grants, RLS and triggers, not public RPC functions. Effects across tables (accepting a request creates the session and books the slot) run in SECURITY DEFINER triggers in the private schema. Policy checks that would make two tables' policies reference each other go through a SECURITY DEFINER helper (private.is_slot_requester, migration 009b).
Rationale: A trigger cannot be bypassed by a direct table write. Postgres reports any cycle between two tables' policies as "infinite recursion", even for different commands; a definer function is not expanded into the outer query, which breaks the cycle. Found by the pgTAP run, not by reading.
Alternatives considered: Public RPCs as D-014 asks (a direct table write would skip the rules unless every grant is also removed); a view for slot visibility (adds a second place to keep in step).
Trade-offs accepted: Deviates from the letter of D-014. Logic lives in triggers, so errors surface as database codes (54000 limit, 22023 not possible, 42501 not allowed, 23505 duplicate) that the Server Actions translate to plain messages.
Source: PostgreSQL, CREATE POLICY and CREATE TRIGGER; Supabase, Row Level Security.
Status: Accepted. Proven by pgTAP file 005 (97 assertions) and e2e/mentorship.py (25 checks).

---

Decision #: D-020
Date: 2026-11-23
Module: Mentorship, jobs
Decision: pg_cron inside the database runs request expiry (every 15 minutes) and nightly slot generation (20:00 UTC, which is 02:00 Bangladesh time). No external scheduler.
Rationale: Free tier, no extra service, and the jobs call the same functions the tests exercise. Vercel's free cron is limited to daily runs, which is too coarse for a 72-hour expiry shown to users.
Alternatives considered: Vercel cron (daily only on the free plan); Supabase Edge Function on a schedule (a second runtime to deploy and secure).
Trade-offs accepted: The jobs are only proven by calling their functions; waiting for the schedule to fire was not done. pg_cron must exist on the local test stack too (the migration creates it).
Source: Supabase, pg_cron documentation.
Status: Accepted

---

Decision #: D-021
Date: 2026-11-23
Module: Authentication
Decision: Password sign-up and sign-in is what was built in Sprint 2, in place of the email one-time-code flow the Master File describes.
Rationale: Passwords work with Supabase's built-in email and need no project sender to test; the OTP flow depends on the project Gmail sender (D-010), which is not set up.
Alternatives considered: Email OTP as planned (blocked on the sender); both (more surface to secure and test before the freeze).
Trade-offs accepted: Deviates from the Master File without a prior decision, so this is logged late. Password reset exists and is tested; OTP does not.
Source: Master File v2.1, authentication section.
Status: Proposed. The supervisor and team should confirm or ask for OTP.

---

Decision #: D-022
Date: 2026-11-24
Module: Jobs
Decision: Applications are made inside the app, as a short message to the poster, instead of a link to an external site. Only verified graduates post (at most 10 active jobs); any verified member except the poster applies once per job (at most 20 live applications). The poster sees the applicant's name and message and can shortlist or reject; the applicant can withdraw. This first version has no editing of a posted job, no search or filters, and no notifications.
Rationale: The Master File's RLS matrix defines job_applications with statuses and poster-only visibility, and "post, apply, track" has nothing to track if applying happens elsewhere. Editing, search and notifications are the first things to drop under the freeze on 29 Nov; the board is a flat list of the 50 newest jobs.
Alternatives considered: An external apply link only (nothing to track, no cross-user rules to prove); editing and filters now (time that the Must items still need).
Trade-offs accepted: A poster gets no contact details, only the applicant's name and message; a poster who made a typo must close and repost. Applicants with a private profile show to the poster as "A verified member".
Source: IIUC_Connect_Master_File_v2, sections 6 and 8.
Status: Accepted. Proven by pgTAP file 006 (57 assertions) and e2e/jobs.py (22 checks).

---

Decision #: D-023
Date: 2026-11-24
Module: Notifications
Decision: Build in-app notifications first. A notification is a row made by a database trigger that holds only a kind and an in-app path; the app maps the kind to one fixed sentence. Members read, mark read and delete their own rows and cannot create any. No per-member preferences, no email, and no reminders in this version.
Rationale: Email from the app needs the project sender in the server's environment, which the owner has not set up; Supabase's SMTP setting only covers auth emails. A row with no names or free text cannot leak anything a member typed, and the fixed sentences are testable in one unit test. Preferences have nothing to switch off until email exists.
Alternatives considered: Email first (blocked on the sender); rows carrying a title and body (a place for personal data to leak, and a second copy of the wording to keep in step); a notification_preferences table now (nothing uses it yet).
Trade-offs accepted: A member must open the app to see events. Notifications say "Someone applied to your job", not who; the name is on the job page.
Source: IIUC_Connect_Master_File_v2, sections 7 and 8 (notifications and notification_preferences are in the plan; the preferences table is deferred).
Status: Accepted. Proven by pgTAP file 007 (27 assertions) and e2e/notifications.py (17 checks).

---

Decision #: D-024
Date: 2026-11-24
Module: PWA
Decision: Make the app installable with a web manifest and icons, and do not add a service worker. There is no offline mode and no cached pages.
Rationale: The Master File asks for an installable PWA. A service worker that caches pages would keep signed-in content on a shared or lost phone after the member signs out, which conflicts with the privacy rules the project is built on. Installability on current mobile browsers does not depend on a service worker.
Alternatives considered: A service worker caching static assets only (a small speed gain on repeat visits, more code to secure and to invalidate before the freeze); a full offline shell (needs a policy for what is safe to cache, no time).
Trade-offs accepted: The installed app needs a connection and loads like the website. The claim "works on low bandwidth" rests on small pages and system fonts (D-017), not on caching, and must be measured separately.
Source: MDN, Web app manifest; web.dev, Installation criteria. To be checked again against current browser behaviour before the report cites it.
Status: Accepted. The manifest is unit-tested; an actual install on a phone is not yet tested.

---

Decision #: D-025
Date: 2026-11-25
Module: Jobs
Decision: Let an applicant attach one optional PDF CV to each application, and let the poster open the applicant's profile from the application list. The CV is a file in a new private bucket, `application-cvs` (PDF only, 2 MB), at `{applicant_id}/{application_id}.pdf`. Only the applicant and the poster of that job can open it, through signed links that expire in 60 seconds. Admins cannot open CVs. Access ends when the application is withdrawn or deleted. The daily purge route also deletes CV files of withdrawn or deleted applications and files with no application. Profiles gain optional https-only `portfolio_url` and `github_url` fields. A private profile is not opened to a poster; the apply form warns the applicant instead.
Rationale: The owner pointed out that different jobs call for different CVs and people tailor them per application, so a profile link alone does not replace a CV. The CV therefore belongs to the application, not the profile. It contains phone numbers and addresses, so access is limited to the two people who need it. The upload and signed-link code already exist for verification documents.
Alternatives considered: A CV link field only (half a day, but the poster often cannot open a private Drive link); a CV saved once on the profile (cannot be tailored); keeping the message-only application (the gap the owner raised).
Trade-offs accepted: About two days of the four before the freeze. Email notifications and the performance measurement move to after the freeze. Admins cannot see a CV even to moderate. A CV cannot be replaced; the applicant withdraws and applies again. Files are removed only once the server has the service key and the cron secret (owner-only items).
Source: Master File v2.1 sections 4 and 8 (jobs: post, apply, track; job_applications visible to the poster). The CV is an addition to the plan; the Master File does not mention it.
Status: Accepted by the owner on 25 Nov (admins cannot read CVs; a CV is optional; one PDF per application) and built the same day. Proven by pgTAP file 008 (46 assertions) with a negative control, 27 new unit tests and e2e/jobs.py (44 checks); see docs/evidence/2026-11-25_job_cv_checks.txt. Not yet proven: the cleanup route deleting a real file, which needs the service key and cron secret (owner-only).

---

Decision #: D-026
Date: 2026-11-25
Module: Process
Decision: Update `Decision_Log.md`, `Build_State.md` and `Dev_Journal.md` at the end of every working session, not after every decision. A choice that departs from the Master File is also added to its new "Amendments since v2.1" section in the same session. Screenshots for the report are taken in one pass after the last interface changes, at 375 px and desktop width. Test outputs keep being saved in `docs/evidence/` every session.
Rationale: The owner noted that the interface is not the focus and will still change, so screenshots taken now would not match the final screens. Logging once per session keeps the record complete without interrupting the build. A Master File that contradicts the code is a risk in the defense, so deviations must be visible in one place.
Alternatives considered: Logging each decision as made (more interruptions for the same content); screenshots after every screen (many would be replaced); leaving deviations only in the Decision Log (the Master File would still read as current).
Trade-offs accepted: A decision made early in a session can wait hours for its entry. The screenshot pass is a single larger task near the freeze, so it must be put in the plan.
Source: Report_Plan.md, evidence rules 1 to 5; CLAUDE.md, "How to work".
Status: Accepted. The Report Plan's evidence rule 2 (screenshots the day a screen is finished) is replaced by this entry.

---

Decision #: D-027
Date: 2026-11-25
Module: Process
Decision: Stop using one branch per sprint. The stacked branches `sprint-2-auth` to `sprint-7-job-cv` (42 commits, one open pull request) are merged into `main` once, with a merge commit. From then on work happens on `main`, which Vercel deploys to the stable address `iiuc-connect.vercel.app`; a short-lived branch is used only for something risky. Each push is preceded by lint, typecheck and the unit tests, and CI runs on every push to `main`.
Rationale: The owner will do almost all of the coding, so branches and reviews add ceremony without a second reader. Branch previews change address with every branch, so a tester's link and Supabase's Site URL would need updating each sprint; `main` gives one fixed address. A merge commit keeps the 42 commits, which Appendix G and the planned-versus-actual chart depend on.
Alternatives considered: Keep a branch per sprint (a moving address for testers, a Site URL to edit each time); squash merge (one commit, the history the report cites is lost); a long-lived `develop` branch (a second deploy target with nobody to review into it); rebase merge (rewrites every commit hash, so the references in the evidence files and journal would no longer match).
Trade-offs accepted: A broken push now reaches the tester's address, so the checks must be run first and CI watched. No pre-merge review by a second person (the supervisor and Minhajul can still review the repository). The old rule "do not merge to main without the user saying so" is replaced by the user's instruction of 25 Nov.
Source: CLAUDE.md "Mechanics"; Vercel's documentation on production and preview deployments; the owner's decision in chat on 25 Nov 2026.
Status: Accepted by the owner on 25 Nov ("do whats best practice"). The merge itself is recorded in Build_State and the journal.

---

Decision #: D-028
Date: 2026-11-25
Module: Hosting
Decision: Run the Vercel server functions in Singapore (`sin1`) by adding `vercel.json` with `"regions": ["sin1"]`, next to the Supabase project (Singapore, D-016), instead of Vercel's default US East (`iad1`).
Rationale: The app's pages query Supabase from the server, so the distance between the function and the database is paid on every query. Measured with a throwaway route on two previews of the same code (15 samples per region, no sign-in): median round trip 799 ms from `iad1` against 37 ms from `sin1`, about 21 times lower. Singapore is also closer to users in Bangladesh than Virginia is.
Alternatives considered: Leave the default and accept roughly 0.8 s per query (a signed-in page that waits for several queries in turn would pay it each time); move the Supabase project to the US (the data and the users are in Bangladesh, and the project holds data and policies that would have to be recreated); a second region as well (not on the free plan).
Trade-offs accepted: Visitors outside Asia get slower pages, which does not matter for an IIUC audience. A free plan allows one function region, so this ties the hosting to the database region; moving the database later means changing this file too. The page-level saving is smaller than 21 times because pages also render and ship JavaScript, and it has not been measured on a signed-in page (that needs a signed-in browser session).
Source: `docs/evidence/2026-11-25_performance_checks.txt`; Vercel documentation on function regions.
Status: Accepted and applied on 25 Nov (commit ae0db18). The live address was checked from outside after the deploy (see the evidence file).

---

Decision #: D-029
Date: 2026-11-25
Module: Search
Decision: Replace the directory's substring search with the ranked, typo-tolerant search the Master File promised (6.4, thesis claim 3). A weighted `search_vector` on `profiles` (name A; job title, headline, skills B; company, department, place, industry, batch C; bio D) and one SQL function, `public.search_members()`, which runs as the caller (SECURITY INVOKER) so Row Level Security applies. Every query word must match a word of the profile exactly, as a word start, or, for words of four letters or more, within 1 edit (4 to 5 letters) or 2 edits (6 or more). Each word scores the weight of the best field it matches times 1.0 (exact), 0.9 (prefix) or 0.8 (typo); rank is the sum plus 0.3 times the similarity to the name. A query with nothing searchable in it matches nobody; a blank one lists everyone. The old ILIKE query and its helpers are deleted.
Rationale: The built search matched substrings and ordered results A to Z, with no weighting, ranking or typo tolerance, so claim 3 described something the code did not do (found when reviewing the plan against the code on 25 Nov; the deviation had not been logged). The owner chose to make the code match the claim ("go for option 1").
Alternatives considered: Keep the substring search and rewrite claim 3 and 6.4 to describe it (about an hour, honest, but a weaker claim); trigram similarity for typos (tried first and rejected: "xylophone" scored 0.40 against "grameenphone" through the shared "phone" while a real typo, "rahmin" for "rahim", scored 0.43, so no threshold separates them); `ts_rank_cd` for ranking (it gave a misspelt word no weight, so a skill match and a bio mention tied); a dedicated search engine (Typesense, already ruled out in the Master File for cost).
Trade-offs accepted: The search scans every visible profile and uses no index, so latency grows linearly with membership: server-side p95 13 ms at 200 members, 109 ms at 2,000 and 274 ms at 5,000 (old search: 1 to 6 ms). That is fine for a pilot and would be about half a second at 10,000 (extrapolated, not measured). Upgrade path: a GIN index on `search_vector` and a trigram shortlist before the edit-distance check. The trigram index on `search_text` is no longer used by the directory (the column stays: tests and an API check read it); drop it if it matters. The extension `fuzzystrmatch` is now required. Relevance was judged on synthetic data against rules I wrote, so it shows the search does what it is designed to do, not that members find it better; UAT tests that.
Source: Master File v2.1 6.4 and section 9 claim 3; PostgreSQL documentation on text search (`tsvector`, weights) and `fuzzystrmatch` (`levenshtein_less_equal`).
Status: Accepted by the owner on 25 Nov. Proven by pgTAP file 009 (35 assertions, clean fixture), the evaluation in `docs/evidence/2026-11-25_search_checks.txt` (20 queries, 2,000 members: normalised P@10 1.000 against 0.914 for plain queries and 1.000 against 0.000 for typos) and `e2e/search.py` (20 checks in a browser). Not run: `e2e/directory.py` (needs its own empty world), pgTAP 009 in CI (runs on push).
