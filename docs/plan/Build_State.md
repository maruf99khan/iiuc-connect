# IIUC Connect — Build State

Updated: 2026-11-24 · Feature freeze: 29 Nov 2026 · Pre-defense: 5 December 2026 · Days to freeze: 5

## Today's position

Accounts, verification, the member directory and the mentorship request flow are built and checked on Claude's side. Everything sits on stacked branches (`sprint-2-auth` through `sprint-6-mentorship`) in one open pull request into `main`; nothing has been merged. The pull request is not merge-ready until its CI run is green and the owner-only items below are done. Jobs, notifications and reminders are next; reminders and the calendar file need the project email sender.

## Key identifiers

| Thing | Value |
|---|---|
| GitHub repo | `maruf99khan/iiuc-connect` |
| Local folder | `D:\dev\iiuc-connect` (Maruf) |
| Supabase project | `iiuc-connect`, ref `zhogqnudiosaqihzvkiq`, Singapore, free plan; the development database (D-016), kept empty between runs |
| Vercel project | `iiuc-connect`, id `prj_Pm4jRUeatW9D3bYDXO7DIi2Mj5wl`, team `maruf khan's projects` |
| Framework | Next.js 16.4.6, React 19.3, Tailwind 4, Node 22+ |
| Latest migration | `20261123200000_mentorship_jobs` |
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
| 26 Nov | Jobs | Not started |
| 27 Nov | Notifications, reminders, events | Not started; needs the project sender |
| 28 Nov | PWA, performance, security pass | Security headers done; the rest not started |
| 29 Nov | Feature freeze, full test run, evaluation scripts | |
| 30 Nov – 2 Dec | UAT with 10 participants | Participants not found yet |

## What exists now

- Database: identity, verification (state machine, append-only audit), directory, and mentorship (`mentor_profiles`, `mentor_availability_rules`, `mentor_slots`, `mentorship_requests`, `sessions`, `session_feedback`), with RLS, triggers, and pg_cron jobs for expiry and nightly slot generation.
- App: sign-up and sign-in, password reset, onboarding, verification submit and admin review, profiles with privacy, directory with search and filters, mentorship screens at `/sessions` and `/members/[id]`.
- Tests: 217 pgTAP assertions across four files (passing in CI), 226 unit tests, `e2e/*.py` Playwright scripts including `mentorship.py` (25 checks).
- Evidence for each sprint in `docs/evidence/`; the latest is `2026-11-24_sprint6_checks.txt`.

## Next up

1. Read the CI result of the pull request on the pinned CLI; do not merge until it is green and the owner-only items are done.
2. Jobs (26 Nov), then notifications and reminders (27 Nov) once the sender exists.
3. Negative control for `005_mentorship.test.sql` (a deliberately broken policy must fail it).
4. Citation audit of the v1 bibliography → `Bibliography.md`. Known wrong: A5 (Farrow and Yuan), M3 (Lall, Chen and Mason). Suspect: R2, A2, M1, M2. Trace problem-statement statistics to primary sources.

## Waiting on the team

- [ ] Invite Minhajul to the GitHub repository and the Supabase project.
- [ ] Project Gmail account, 2-Step Verification, app password, entered in Supabase SMTP settings (D-010).
- [ ] Turn "Confirm email" back on (it is off for development) before real members sign up.
- [ ] Redirect URLs for `/auth/confirm` and `/auth/reset` (production and localhost) and the two email templates.
- [ ] `SUPABASE_SECRET_KEY` and `CRON_SECRET` on Vercel, and the daily `vercel.json` cron for `/api/cron/purge-evidence`.
- [ ] First admin: the one-off SQL in the README after signing up.
- [ ] Delete leftover synthetic images in the verification storage bucket, if any.
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
- pg_cron jobs were created but have not been seen firing on schedule.
- Docker Desktop does not start on Maruf's machine, so the local Supabase stack runs only in CI.

## Risks

- Five days to the freeze. "Could" items drop first.
- Finding 5 alumni for UAT at short notice.
- Supabase free projects pause when idle; keep it active through the defense.
- Email deliverability on a free sender.
- AI-use policy unknown; must be settled before the report is written.
