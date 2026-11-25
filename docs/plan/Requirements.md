# IIUC Connect — Requirements and Traceability

Created 2026-11-25. This is the seed for Report Chapter 3.3 and 3.6 and for the Chapter 7 table (objective → requirement → test → result). Each requirement has an ID that tests and the report quote.

**How to read the Evidence column.** It names the test file that covers the requirement, not the single assertion. The mapping was made from file names, module scope and the sprint records on 25 Nov; it has **not yet been checked assertion by assertion**. Before the report is written, each row must be tightened to the assertion or check name, and any row that does not hold up is downgraded. A row marked *none* has no automated test and must be tested by hand or dropped from the claims.

**Status values:** Tested (an automated test covers it and passed), Built (code exists, no automated test), Planned (in the Master File, not built), Future (Chapter 8).

**Wording.** These statements were written from the Master File and the code. They have not been reviewed by the supervisor and some will need rewording for the report.

## Functional requirements

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| R-AUTH-01 | A visitor can create an account with an email and password and must confirm the email address before using the app | Must | `lib/auth/schemas.test.ts`, `e2e/signup.py`, `e2e/auth.py`; confirmation link tried by hand 24 Nov | Tested; the "confirm email" switch was turned on 24 Nov and the link tried by hand |
| R-AUTH-02 | A member can reset a forgotten password through an emailed link | Must | `e2e/recovery.py`, `lib/auth/schemas.test.ts`; reset link tried by hand 24 Nov | Tested |
| R-AUTH-03 | Signed-out visitors cannot read any member data | Must | `supabase/tests/001_identity_rls.test.sql`, `e2e/security_anon.py` | Tested |
| R-AUTH-04 | A new member completes onboarding (name, department, batch) before using the app | Must | `lib/profile/schema.test.ts`, `e2e/auth.py` | Tested |
| R-VER-01 | A member can claim to be an IIUC student or graduate and upload a document | Must | `supabase/tests/002_verification_flow.test.sql`, `lib/verification/claim.test.ts`, `e2e/verify.py` | Tested |
| R-VER-02 | Verification moves only along allowed steps and every move is logged append-only | Must | `supabase/tests/001_identity_rls.test.sql`, `002_verification_flow.test.sql` | Tested |
| R-VER-03 | An admin can approve or reject a claim, never their own, and rejection needs a reason | Must | `supabase/tests/002_verification_flow.test.sql`, `e2e/verify.py`; approval tried by hand 24 Nov | Tested |
| R-VER-04 | Uploaded documents are private, readable by the owner and by admins through short links, and are purged after review | Must | `supabase/tests/002_verification_flow.test.sql`, `lib/evidence/purge.test.ts`, `lib/evidence/cron.test.ts` | Tested; the purge has not been seen running on schedule |
| R-VER-05 | Institutional mailbox verification | Should | none | Planned; ID format of the mailbox still unconfirmed |
| R-PRF-01 | A member can edit their own profile and cannot edit protected fields (role, verification status) | Must | `supabase/tests/001_identity_rls.test.sql`, `lib/profile/schema.test.ts` | Tested |
| R-PRF-02 | A profile's visibility (public, IIUC community, private) is enforced by the database | Must | `supabase/tests/001_identity_rls.test.sql`, `003_profiles_directory.test.sql` | Tested |
| R-PRF-03 | Contact details are readable only by the owner and admins | Must | `supabase/tests/001_identity_rls.test.sql` | Tested |
| R-DIR-01 | A verified member can search and filter the directory by name, skill, department, batch and industry; results are ranked by field weight and tolerate typos (D-029) | Must | `supabase/tests/009_search_members.test.sql`, `supabase/eval/search_eval.sql`, `e2e/search.py`, `lib/directory/query.test.ts` | Tested; precision@10 and latency measured on synthetic data 25 Nov (`docs/evidence/2026-11-25_search_checks.txt`); `e2e/directory.py` predates D-029 and was not re-run |
| R-DIR-02 | Search never returns a profile the viewer may not read | Must | `supabase/tests/003_profiles_directory.test.sql`, `009_search_members.test.sql` | Tested |
| R-MEN-01 | A verified graduate can create a mentor profile and weekly availability, from which 30-minute slots are generated | Must | `supabase/tests/005_mentorship.test.sql`, `lib/mentorship/time.test.ts`, `e2e/mentorship.py` | Tested |
| R-MEN-02 | A verified member can request a session; a slot cannot be double-booked | Must | `supabase/tests/005_mentorship.test.sql`, `e2e/mentorship.py` | Tested |
| R-MEN-03 | A mentor can accept (with a meeting link) or decline; unanswered requests expire after 72 hours | Must | `supabase/tests/005_mentorship.test.sql` | Tested; expiry job not seen firing on schedule |
| R-MEN-04 | After a session each side leaves feedback that stays hidden until both have submitted | Should | `supabase/tests/005_mentorship.test.sql`, `lib/mentorship/schemas.test.ts` | Tested |
| R-MEN-05 | Session reminders and a calendar file | Could | none | Planned |
| R-JOB-01 | A verified member can post, close and delete a job; a poster has at most 10 active jobs | Should | `supabase/tests/006_jobs.test.sql`, `lib/jobs/schemas.test.ts`, `e2e/jobs.py` | Tested |
| R-JOB-02 | A verified member can apply once per job, with an optional message, and withdraw | Should | `supabase/tests/006_jobs.test.sql`, `e2e/jobs.py` | Tested |
| R-JOB-03 | Only the poster sees the applications to their job; the poster can shortlist or reject | Should | `supabase/tests/006_jobs.test.sql`, `e2e/jobs.py` | Tested |
| R-JOB-04 | An application can carry an optional PDF CV that only the applicant and the poster can open, and the poster loses access when the application is withdrawn (D-025) | Should | `supabase/tests/008_job_cv.test.sql` (46), `lib/jobs/cv.test.ts`, `lib/jobs/cv-purge.test.ts`, `e2e/jobs.py` | Tested; the cleanup route has not deleted a real file yet (needs the service key) |
| R-JOB-05 | The poster can open an applicant's profile from the application list; a private profile is not opened (D-025) | Should | `e2e/jobs.py` (profile link and links shown to the poster) | Tested for a public profile; the private-profile case is written but not exercised in a browser |
| R-PRF-04 | A member can add optional portfolio and GitHub addresses; only https, GitHub only on github.com, no credentials in the host (D-025) | Should | `supabase/tests/008_job_cv.test.sql`, `lib/profile/schema.test.ts`, `e2e/jobs.py` | Tested |
| R-NOT-01 | A member sees in-app notifications for mentorship and job events, and no one can read another member's | Should | `supabase/tests/007_notifications.test.sql`, `lib/notifications/text.test.ts`, `e2e/notifications.py` | Tested |
| R-NOT-02 | Email notifications and reminders | Could | none | Planned; needs the app's own email sender |
| R-ADM-01 | An admin can be created only by the database owner, never through sign-up | Must | `supabase/tests/001_identity_rls.test.sql`; first admin made by SQL 24 Nov | Tested |
| R-EVT-01 | Events | Could | none | Planned, may be dropped |

## Non-functional requirements

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| R-NFR-01 | All authorization is enforced by the database (row level security), not only by the app | Must | all `supabase/tests/*.test.sql`, `e2e/security_anon.py`, `e2e/security_member.py` | Tested |
| R-NFR-02 | The server sends security headers on every response | Must | `lib/security-headers.test.ts`, `e2e/security_anon.py` | Tested |
| R-NFR-03 | The app is installable on a phone, without offline caching (D-024) | Should | `app/manifest.test.ts` | Built; installing on a real phone not tested |
| R-NFR-04 | The app works on a slow mobile connection | Should | `docs/evidence/2026-11-25_performance_checks.txt`, `docs/evidence/lighthouse/` | Partly measured, one run only, signed-out sign-in page: LCP 1.6 s on Slow 4G and 4.9 s on Slow 3G (4x CPU), CLS 0.00, Lighthouse accessibility, best practices and SEO all 100. Functions moved to Singapore next to the database (D-028): median query round trip 799 ms to 37 ms, 15 samples each. Signed-in pages, repeat runs and a real phone are not measured |
| R-NFR-05 | The whole system runs on free tiers | Must | `Build_State.md` key identifiers (Vercel Hobby, Supabase free) | Built; the limits it imposes are to be written up for RQ3 |
| R-NFR-06 | The schema, policies and tests can be rebuilt from the repository alone | Must | CI job `database` (all migrations, then pgTAP) | Tested in CI |
| R-NFR-07 | Required environment variables are validated at start-up | Should | `lib/env.schema.test.ts` | Tested |

## Research questions and the requirements that answer them

| Question (Report Plan 1.3) | Answered by |
|---|---|
| RQ1: access control at the database layer, verified by denial tests | R-NFR-01, R-AUTH-03, R-PRF-02, R-PRF-03, R-DIR-02, R-VER-04, R-JOB-03 |
| RQ2: search inside PostgreSQL, precision@10 and latency | R-DIR-01 (measured on synthetic data: 20 queries, 2,000 members; real-user relevance is for the UAT) |
| RQ3: complete platform on free infrastructure | R-NFR-05 |
| RQ4: usability of verification and mentorship | R-VER-01, R-MEN-01, R-MEN-02 and the UAT (30 Nov to 2 Dec) |

## Gaps this file shows

1. The search measurement for R-DIR-01 is on synthetic data with relevance rules written by one person, and its latency grows linearly with membership (274 ms p95 at 5,000 members). For R-NFR-04 only the signed-out sign-in page has been measured, once.
2. R-JOB-04's file cleanup has not been seen deleting a real file, and the private-applicant case of R-JOB-05 has not been exercised in a browser.
3. Several "Tested" rows depend on cron jobs that have not been seen firing on schedule (R-VER-04, R-MEN-03).
4. The institutional-mailbox requirement, R-VER-05, is open until the student ID format is confirmed.
5. The evidence mapping above has not been checked assertion by assertion.

Update this file at the end of each session with the status changes.
