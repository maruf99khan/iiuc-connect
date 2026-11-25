# IIUC Connect — Build State

Updated: 2026-11-25 · Feature freeze: 29 Nov 2026 · Pre-defense: 5 December 2026 · Days to freeze: 4

## Today's position

Accounts, verification, the member directory and the mentorship request flow are built and checked on Claude's side. Everything was merged into `main` on 25 Nov 2026 with a merge commit (`9586ec8`, 45 commits kept, CI green on the head `05059f6`; D-027). Work now happens on `main`, which Vercel deploys to `iiuc-connect.vercel.app`. The old `sprint-*` branches remain on GitHub as history. The jobs board and in-app notifications were built the same day, ahead of plan. Email notifications, reminders and the calendar file are next and need the app's own email sender. The Supabase auth email sender (Gmail SMTP) now works.

## Key identifiers

| Thing | Value |
|---|---|
| GitHub repo | `maruf99khan/iiuc-connect` |
| Local folder | `D:\dev\iiuc-connect` (Maruf) |
| Supabase project | `iiuc-connect`, ref `zhogqnudiosaqihzvkiq`, Singapore, free plan; the development database (D-016), kept empty between runs |
| Vercel project | `iiuc-connect`, id `prj_Pm4jRUeatW9D3bYDXO7DIi2Mj5wl`, team `maruf khan's projects` |
| Framework | Next.js 16.4.6, React 19.3, Tailwind 4, Node 22+ |
| Latest migration | `20261125100100_job_cv` |
| CI | GitHub Actions: `verify` (lint, typecheck, test, build) and `database` (all migrations, pgTAP). Supabase CLI pinned to 3.3.0 |

## Plan against actual (dates from Master File v2.1, section 12)

| Plan date | Work | Status |
|---|---|---|
| 17 Nov | Accounts, repo, scaffold, identity schema and RLS | Done |
| 18 Nov | Authentication, onboarding | Done, with password sign-in instead of email OTP (D-021, Proposed) |
| 19 Nov | Verification: institutional mailbox, document upload, state machine, audit | Done; institutional-mailbox ID format still unconfirmed |
| 20 Nov | Admin queue, profile view and edit, privacy | Done |
| 21–22 Nov | Directory, search, filters; identity tests | Done |
| 23–25 Nov | Mentorship end to end | Core done 24 Nov (rebuilt to the plan, D-018 to D-020); reminders and `.ics` not built |
| 26 Nov | Jobs | Done 24 Nov: post, apply, shortlist or reject, withdraw, close, delete (D-022). No editing, search or notifications. 25 Nov: CV per application, profile link and portfolio and GitHub fields added (D-025) |
| 27 Nov | Notifications, reminders, events | In-app notifications done 24 Nov (D-023). Email, reminders and events not started; they need the app's email sender |
| 28 Nov | PWA, performance, security pass | Security headers done. Installable manifest and icons done 24 Nov, no service worker (D-024). Performance measurement not started |
| 29 Nov | Feature freeze, full test run, evaluation scripts | |
| 30 Nov – 2 Dec | UAT with 10 participants | Participants not found yet |

## What exists now

- Database: identity, verification (state machine, append-only audit), directory, and mentorship (`mentor_profiles`, `mentor_availability_rules`, `mentor_slots`, `mentorship_requests`, `sessions`, `session_feedback`), with RLS, triggers, and pg_cron jobs for expiry and nightly slot generation.
- App: sign-up and sign-in, password reset, onboarding, verification submit and admin review, profiles with privacy, directory with search and filters, mentorship screens at `/sessions` and `/members/[id]`.
- Jobs board: `jobs` and `job_applications` with RLS, limits and status moves; screens at `/jobs`, `/jobs/new`, `/jobs/[id]`. Applications can carry an optional PDF CV (private bucket, applicant and poster only, admins excluded) and the poster can open the applicant's profile, which can list GitHub and portfolio addresses (D-025).
- In-app notifications: trigger-made rows for mentorship and job events, owner-only read, `/notifications` and an unread count in the nav.
- Tests: 347 pgTAP assertions across seven files (the first 301, files 001 to 007, passed in CI; file 008, 46 assertions, passed on the hosted database and has not run in CI yet), 299 unit tests, `e2e/*.py` Playwright scripts including `mentorship.py` (25 checks), `jobs.py` (44) and `notifications.py` (17).
- Demo data: `supabase/demo/demo_data.sql` fills a test database with six members, two mentors with open slots, five jobs and an application; `demo_cleanup.sql` removes it all. The hosted development database currently holds the demo data and two real test accounts (a verified student and an admin), to be deleted after testing.
- Report records: `docs/plan/Requirements.md` (requirement IDs mapped to tests, seeded 25 Nov, not yet checked line by line) and the Master File's new section 14, "Amendments since v2.1".
- Evidence for each sprint in `docs/evidence/`; the latest are `2026-11-24_sprint6_checks.txt`, `2026-11-24_jobs_checks.txt` and `2026-11-24_notifications_checks.txt`.

## Next up

0. **Done 25 Nov (D-025), merged to `main`, CI green:** an optional PDF CV per job application, a profile link for the poster, and portfolio and GitHub profile fields. Evidence: `docs/evidence/2026-11-25_job_cv_checks.txt`. Not proven: the cleanup route deleting a real file (needs the service key and cron secret). Email notifications and the performance measurement move after the freeze.

1. CI is green on the merged head, so pgTAP files 001 to 008 and every migration have run from scratch in CI. From now on: tests first, lint, typecheck and unit tests before every push to `main`, and read the CI result after it (a broken push reaches the testers).
2. PWA, performance and security pass (28 Nov). Email notifications and reminders once the app's server has the Gmail sender (a Vercel environment setting).
3. Negative control for `005_mentorship.test.sql` (a deliberately broken policy must fail it).
4. Citation audit of the v1 bibliography → `Bibliography.md`. Known wrong: A5 (Farrow and Yuan), M3 (Lall, Chen and Mason). Suspect: R2, A2, M1, M2. Trace problem-statement statistics to primary sources.

## Waiting on the team

- [ ] Invite Minhajul to the GitHub repository and the Supabase project.
- [x] Project Gmail account, 2-Step Verification, app password, entered in Supabase SMTP settings (D-010). Done 24 Nov; an invitation email arrived. Supabase's SMTP covers auth emails only; app emails need the same sender in the server's environment.
- [x] "Confirm email" turned back on 24 Nov. A real sign-up, the confirmation link and the password-reset link were each tried by hand with real mailboxes and worked.
- [x] Redirect URLs for `/auth/confirm` and `/auth/reset` on `http://localhost:3000` (done 24 Nov).
- [x] The two email templates (Confirm signup, Reset password) now link to the app's own pages, with a designed layout. Done 24 Nov.
- [ ] Production address is now known: `https://iiuc-connect.vercel.app`. In Supabase Authentication → URL Configuration set the Site URL to it and keep `/auth/confirm` and `/auth/reset` redirect URLs for it (and for `http://localhost:3000`). Until then confirmation emails link to localhost and testers cannot finish signing up.
- [ ] Vercel → project Settings → Deployment Protection → Vercel Authentication: switch off, so testers can open the address without a Vercel login (a free database with dummy data, so the owner accepted the exposure on 25 Nov).
- [ ] `SUPABASE_SECRET_KEY` and `CRON_SECRET` on Vercel, and the daily `vercel.json` cron for `/api/cron/purge-evidence`.
- [x] First admin on the development database made 24 Nov with the README's SQL; approval of a real student claim was tried by hand and worked. Repeat on any other database.
- [ ] Delete leftover synthetic images in the verification storage bucket, if any, and the two test CV files in the `application-cvs` bucket (dashboard → Storage), or let the purge do it once the keys are set.
- [ ] Turn on leaked-password protection (Authentication, password security). The security advisor flags it; it is an Auth setting, not code.
- [ ] Decide D-021: keep password sign-in or build email OTP.
- [ ] Student ID format: what each character of `c231226` means; letters for other departments.
- [ ] Do alumni keep access to their `ugrad.iiuc.ac.bd` mailbox?
- [ ] Supervisor's answers: report template, citation style, pre-defense expectations, AI-use policy, ethics sign-off.
- [ ] 10 UAT participants (5 students, 5 alumni) for 30 Nov – 2 Dec.
- [ ] May Claude read `IIUC_Connect_Project_Proposal.docx` and the presentation template? The proposal may promise features the plan cut.
- [ ] Manual tests on real accounts and phones (list in the 24 Nov checklist; iOS Safari and dark mode included).

## Open technical items

- Lock `department`, `batch`, `graduation_year` after institutional verification.
- `npm audit`: moderate advisories in the ESLint toolchain, development only. Re-check before the defense.
- Performance advisor INFO: `session_feedback_reviewer_id_fkey` has no covering index; `profiles_dept_batch_year_idx` unused.
- pg_cron jobs were created but have not been seen firing on schedule. The CV cleanup in the daily purge route has not deleted a real file either (needs `SUPABASE_SECRET_KEY` and `CRON_SECRET`).
- Docker Desktop does not start on Maruf's machine, so the local Supabase stack runs only in CI.

## Risks

- Five days to the freeze. "Could" items drop first.
- Finding 5 alumni for UAT at short notice.
- Supabase free projects pause when idle; keep it active through the defense.
- Email deliverability on a free sender.
- AI-use policy unknown; must be settled before the report is written.
