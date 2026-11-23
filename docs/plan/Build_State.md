# IIUC Connect — Build State

Updated: 2026-11-16 (evening) · Pre-defense: 5 December 2026 · Days left: 19

## Today's position

Sprint 1 is built and verified on Claude's side one day ahead of plan. It closes when the team has pushed the code, the Vercel deployment is confirmed, and the manual checks below pass.

## Key identifiers

| Thing | Value |
|---|---|
| GitHub repo | `maruf99khan/iiuc-connect` |
| Local folder | `C:\dev\iiuc-connect` |
| Supabase project | `iiuc-connect`, ref `zhogqnudiosaqihzvkiq`, Singapore, free plan |
| Vercel project | `iiuc-connect`, id `prj_Pm4jRUeatW9D3bYDXO7DIi2Mj5wl`, team `maruf khan's projects` |
| Framework | Next.js 16.4.6, React 19.3, Tailwind 4, Node 22+ |
| Latest migration | `20261116104143_identity_schema` |

## Sprint map

Twelve sprints, the same work packages as the original 24-week plan, executed in compressed time. The report's planned-versus-actual chart is built from this table.

| Sprint | Work package | Priority | Planned | Actual | Status |
|---|---|---|---|---|---|
| 1 | Infrastructure, scaffold, identity schema, RLS, test harness, first deploy | Must | 17 Nov | 16 Nov (build) | Built; awaiting push, deploy check, manual checks |
| 2 | OTP authentication, onboarding | Must | 18 Nov | | Blocked on project Gmail app password |
| 3 | Verification: institutional mailbox, document upload, state machine, audit | Must | 19 Nov | | State machine core already done in Sprint 1 |
| 4 | Admin console, profile view and edit, privacy | Must | 20 Nov | | |
| 5 | Directory, search, filters; identity test suite | Must | 21–22 Nov | | |
| 6 | Mentorship I: mentor profiles, availability, slots | Must | 23 Nov | | |
| 7 | Mentorship II: requests, sessions, expiry, feedback | Must | 24–25 Nov | | |
| 8 | Jobs: post, apply, track | Should | 26 Nov | | |
| 9 | Notifications and reminders; events; digest | Should / Could | 27 Nov | | |
| 10 | PWA, performance pass, security hardening | Should | 28 Nov | | |
| 11 | Feature freeze; full test run; search, performance and load measurements | Must | 29 Nov | | |
| 12 | UAT with 10 participants, bug fixes, report assembly, slides, rehearsal | Must | 30 Nov – 4 Dec | | |

Report chapters are drafted alongside: Ch 1–3 during sprints 1–5, Ch 4–5 during sprints 6–10, Ch 6–8 during sprints 11–12.

## What exists now

- Repo scaffold with lint, typecheck, unit tests, build and CI workflow.
- Supabase clients: browser, server (session-bound), session refresh in `proxy.ts`. No privileged client yet.
- Database: `profiles`, `profile_private`, `verification_requests`, `verification_documents`, `verification_events`; verification state machine; auth triggers; column grants; 8 RLS policies.
- Tests: 46 pgTAP assertions (all passing), 5 unit tests (all passing).
- Evidence files in `docs/evidence/`.
- Static landing page.

## Sprint 1 closing checklist (team)

- [ ] `npm install` then `npm run dev` on Windows; page loads at http://localhost:3000.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass on Windows.
- [ ] Commit and push to `main`.
- [ ] GitHub Actions run is green.
- [ ] Vercel deployment is live (Claude confirms from the Vercel side after the push).
- [ ] Page checked on a real phone.
- [ ] HTTP check of the Data API (command in the Sprint 1 hand-over message).

## Next up

1. Close Sprint 1 (above).
2. Sprint 2: OTP sign-in, sign-out, onboarding wizard, protected routes. Needs the Gmail app password entered in Supabase by the team.
3. Citation audit of the v1 bibliography → `Bibliography.md`. Known wrong: A5 (Farrow and Yuan), M3 (Lall, Chen and Mason). Suspect: R2, A2, M1, M2.
4. Trace problem-statement statistics to primary sources.

## Waiting on the team

- [ ] Project Gmail account created, 2-Step Verification on, app password generated (needed for Sprint 2).
- [ ] Project Instructions v2.2 pasted into the Instructions field.
- [ ] Minhajul added as collaborator on GitHub.
- [ ] Is the supplied report outline the department's official template or the team's own?
- [ ] Supervisor's answers: template, citation style, pre-defense expectations, AI-use policy, ethics sign-off.
- [ ] Student ID format: what each character of `c231226` means; letters for other departments (needed for Sprint 3).
- [ ] Do alumni keep access to their `ugrad.iiuc.ac.bd` mailbox?
- [ ] 10 UAT participants (5 students, 5 alumni) for 30 Nov – 2 Dec.

## Open technical items

- Lock `department`, `batch`, `graduation_year` after institutional verification (Sprint 3).
- First admin account must be promoted by a one-off SQL statement after Maruf signs up (Sprint 4).
- `npm audit`: 8 moderate advisories in the ESLint toolchain, development only. Re-check before the defense.
- Supabase Data API over HTTP not yet verified from outside the database.
- Node version on Vercel to be confirmed from the first build log.

## Risks

- 19 days is tight. Feature freeze on 29 Nov is fixed; "Could" items drop first.
- Finding 5 alumni for UAT at short notice.
- Supabase free projects pause when idle; keep it active through the defense.
- Email deliverability on a free sender.
- AI-use policy unknown; must be settled before the report is written.
