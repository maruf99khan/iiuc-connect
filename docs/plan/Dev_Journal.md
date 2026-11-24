# IIUC Connect — Development Journal

A dated record of every working session: what was done, what went wrong, what was learned, and what evidence was saved. Newest entry at the bottom. Mistakes are recorded on purpose; they show how the design improved and feed Chapter 7 (Discussion) and Appendix F.

Entry format:

```
## YYYY-MM-DD — Day N — title
Who:
Goal:
Done:
Problems and mistakes: (what, cause, fix, time lost)
Decisions: (IDs in Decision_Log.md)
Evidence saved: (test output, screenshots, measurements, and where they are)
Lesson:
Next:
```

---

## 2026-11-16 — Day 0 — Plan review and reset

Who: Maruf, Claude

Goal: Review the original master plan before writing any code.

Done:
- Read the full 30-page v1 master file.
- Rewrote the plan as Master File v2.1 for a 19-day, free-tier-only build.
- Recorded 12 decisions.

Problems and mistakes found in our own v1 plan:

| # | Mistake | Cause | Fix |
|---|---|---|---|
| 1 | `current_role` used as a column name; it is a reserved word and the table would not create | Schema was generated and never executed | Renamed `job_title`; rule: every migration is run before it is trusted |
| 2 | `UNIQUE (mentee, mentor, status)` meant to allow one pending request, but it blocked repeat sessions forever | Constraint written without testing the second-request case | Partial unique index on pending rows (D-005) |
| 3 | "Update own profile" policy let users change their own role and verification status | Treated RLS as column-aware; it is row-level | Column-level grants plus definer functions (D-004) |
| 4 | Server client used the service-role key everywhere, bypassing all RLS | Copied a common tutorial pattern | Session-bound client by default (D-006) |
| 5 | Per-field privacy promised but roll number sat in the same row as public fields | Same misunderstanding as #3 | Separate private table (D-008) |
| 6 | Bibliography had wrong authors on at least two papers | AI-generated citations accepted without checking | Every source verified against DOI before use |
| 7 | Unemployment statistics had no source in the bibliography | Same | Trace to primary source or remove |
| 8 | Ethics section cited the repealed Digital Security Act 2018 | Outdated information | Cite current law after confirming titles |
| 9 | Stack pinned Next.js 14, already end of life | Plan written from older material | Next.js 16 (D-001) |
| 10 | Nine modules planned for one team in limited time | Scope set before the deadline was fixed | Priority order and freeze date (D-012) |
| 11 | Plan assumed paid or expiring services (Typesense VPS) | Cost not treated as a constraint | Free-tier audit of every tool (D-009, D-010) |
| 12 | Survey claimed a SUS score without using the SUS questionnaire | Term used loosely | Use the standard 10-item SUS |
| 13 | Master file saved as an image-only PDF, unsearchable | Printed to PDF from a viewer | Docs kept as text in the project |

Decisions: D-001 to D-012.

Evidence saved: v1 master file retained in the project as the "before" artefact.

Lesson: A plan that has never been executed contains bugs just like code. Reviewing it against the database's actual behaviour before building saved days of rework.

Next: Accounts and repo, then Sprint 1.

---

## 2026-11-16 — Day 0 (evening) — Sprint 1: infrastructure and identity schema

Who: Maruf, Claude

Goal: Working scaffold, identity schema with Row Level Security, a security test harness, and a deployment pipeline.

Done:
- Environment: GitHub repo `maruf99khan/iiuc-connect` cloned to `C:\dev\iiuc-connect` (deliberately outside OneDrive). Supabase project `iiuc-connect` created in Singapore on the free plan. Vercel project created, linked to the repo, public environment variables set.
- Scaffold: Next.js 16.4.6, React 19.3, TypeScript strict with extra checks (`noUncheckedIndexedAccess`), Tailwind CSS 4, ESLint, Vitest, Zod-validated environment variables, three Supabase clients (browser, server, session refresh in `proxy.ts`), CI workflow.
- Database: migration `20261116104143_identity_schema` — 7 enums, 5 tables (`profiles`, `profile_private`, `verification_requests`, `verification_documents`, `verification_events`), 14 indexes, the verification state machine, auth triggers, column-level grants, 8 RLS policies.
- Tests: 46 pgTAP assertions covering structure, triggers, state machine, audit immutability and five roles. 5 unit tests for environment validation.
- Landing page (static, mobile-first, system fonts).

Verified, and how:
- Migration applied to the hosted database; the stored migration text has the same MD5 as the file in the repo.
- pgTAP: 46 of 46 passed. A separate negative control confirmed the harness reports failures.
- Database left clean after tests (0 users, 0 profiles, 0 events).
- Supabase security advisor: 0 findings. Performance advisor: only "unused index" notices, expected on an empty database.
- Lint, typecheck, unit tests and production build all pass on Linux with Node 22.
- Production server returns 200 for `/` with the right title and viewport tag, and 404 for an unknown path.

Not verified yet:
- The Supabase HTTP Data API from outside the database (the build sandbox cannot reach it).
- `npm install` and `npm run dev` on the team's Windows machines with Node 26.
- The first Vercel deployment (waits for the first push).
- Real-phone rendering.

Problems and mistakes:

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | Installing Vitest failed with a peer-dependency conflict | The scaffold pins `@types/node` to v20; Vitest 5 needs v22 or newer | Raised `@types/node` to v22 | Minutes |
| 2 | Vitest warned about its config file | ESM syntax in a `.ts` config loaded as CommonJS | Renamed to `vitest.config.mts` | Minutes |
| 3 | First draft of the test file declared 45 planned tests but contained 46 | Miscount while writing | Counted assertions with a script before the first run; corrected the plan | None; caught before running |
| 4 | The negative-control script errored instead of reporting | Claude forgot the pgTAP `plan()` line in the throwaway script | Added it and re-ran | Minutes |
| 5 | A verification command killed its own shell | `pkill -f "next start"` matched the command line that contained it | Re-ran the remaining checks separately | Minutes |
| 6 | Could not check the database over HTTP | The sandbox's network allowlist blocks `supabase.co` | Verified roles inside the database with pgTAP; HTTP check moved to the manual checklist and recorded as unverified | Open |
| 7 | Dependencies cannot be installed from Claude's side into the project folder | Claude's shell is a Linux VM; the team runs Windows, and native packages differ per platform | Claude builds and tests in a Linux copy; the team runs `npm install` on Windows; `node_modules` is never shared | Design constraint |
| 8 | Claude cannot commit or push | Git needs to delete lock files and needs the team's credentials | The team runs the git commands; this also keeps commit authorship truthful | Design constraint |

Decisions: D-013 to D-017. D-004, D-006, D-008 now implemented.

Evidence saved (in the repo under `docs/evidence/`):
- `2026-11-16_sprint1_pgtap_identity_rls.txt` — full TAP output, negative control, clean-up check.
- `2026-11-16_sprint1_checks.txt` — advisors, lint, typecheck, unit tests, build, HTTP checks, npm audit, and the list of what was not verified.

Open observations:
- `npm audit` reports 8 moderate advisories, all inside the ESLint toolchain (development only, not deployed). Re-check before the defense.
- `department`, `batch` and `graduation_year` are user-editable for now. Once a student is verified from their institutional mailbox these should be locked; to be handled in Sprint 3.
- `package.json` allows Node 22 or newer. Vercel will pick the newest matching version; check the build log on first deploy.

Lesson: Writing the denial tests in the same sitting as the policies turned the security design into something that can be re-run in seconds after every schema change. The negative control mattered: a suite that passes 46 of 46 on the first run should be distrusted until it has been shown to fail.

Next: Team commits and pushes; confirm the Vercel deployment; manual checks on Windows and a phone; then Sprint 2 (OTP sign-in and onboarding), which needs the project Gmail app password.

## 2026-11-24 — Day 8 — Sprint 6: mentorship rebuilt to the plan

The journal has no entries for Sprints 2 to 5 (written 16 to 22 Nov); what was built then is in the commit history and `docs/evidence/`. This entry covers the reconciliation with the plan files and Sprint 6.

What happened: the plan files (Master File v2.1, Decision Log, Instructions) were added to `docs/plan/`. Reading them against Sprints 2 to 5 showed Sprint 5 mentorship (publish a slot, someone books it) did not match the plan's request, accept or decline, session and blind-feedback flow. Rebuilt as D-018 to D-020; password sign-in recorded as D-021 (Proposed).

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | Sprint 5 mentorship built to a model the plan did not describe | Built from an inferred scope; the plan files were not in the repository | Dropped and rebuilt (D-018) | About a day |
| 2 | A mentee could request a private graduate's slot | Found while writing the plan: the insert policy did not check slot visibility | Policy requires the slot to be visible to the caller | None; caught before building |
| 3 | "Infinite recursion detected in policy" on the first test run | The new request policy and the slot policy referenced each other | Definer helper `private.is_slot_requester` (migration 009b) | About an hour |
| 4 | One request could add or book past the limits | Counting in BEFORE triggers cannot see the other rows of the same statement (also seen in Sprint 5) | Counts in AFTER triggers, with tests that try it | None |
| 5 | 3 of 88 tests failed | A BEFORE trigger refuses before RLS checks the row, so the error code differs | Corrected the expected codes in the tests | Minutes |
| 6 | CI failed with "planned 97 tests but ran 0" | The hosted SQL tool shows only the last result set, so the test printed only failures; pg_prove needs every line | Test prints every TAP line | Two CI runs |
| 7 | CI failed at setup-cli, "rate limit exceeded" | `version: latest` queries the GitHub API without a token | Pinned the CLI to 3.3.0 | One CI run |
| 8 | My e2e script clicked a `<details>` that was already open | Script bug | Open it only when closed | Minutes |
| 9 | Accepted requests still offered "Cancel session" after the session closed | Found by looking at the dark screenshot | Offered only while a scheduled session exists | Minutes |

Decisions: D-018 to D-021 (D-021 Proposed).

Evidence: `docs/evidence/2026-11-24_sprint6_checks.txt`.

Lesson: Two of the three worst problems (3 and 6) were invisible until the tests ran somewhere other than where they were written. The hosted SQL tool and CI are different runners, so a test that passes in one needs one run in the other. The negative control was skipped for this file and is recorded as not done.

Next: confirm CI on the pinned CLI; the owner-only setup (project sender, Confirm email, redirect URLs, cron secret); then Jobs and notifications if time allows. Feature freeze is 29 Nov.

## 2026-11-24 — Day 8 (later) — Jobs board

Built two days ahead of the plan (26 Nov), reusing the mentorship patterns: column grants, RLS, AFTER-trigger limits, and a rolled-back pgTAP file. Decision D-022. Evidence: `docs/evidence/2026-11-24_jobs_checks.txt`.

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | The jobs test passed 57 of 57 on its first run | Possible real result, possible weak tests | Weakened one policy in a rolled-back transaction and watched the matching assertion fail | Minutes |
| 2 | Three e2e checks failed on the first run | Script bugs: read text before streamed content rendered (twice); expected a 404 status but Next streams a not-found page with status 200; a text match hit two elements | Wait for the text, check the page text, target the summary element | Two reruns |
| 3 | Adding a fifth nav link left no room at 320 px | A flat row of links | Let the nav wrap; measured no overflow at 320 and 375 px | Minutes |

Lesson: a test suite that passes completely on the first run needs one deliberate break before it earns trust. It took one small query here.

Not built, by decision (D-022): editing a posted job, search, and notifications.

Next: notifications and reminders (27 Nov), which need the project email sender; otherwise the PWA, performance and security pass.

## 2026-11-24 — Day 8 (evening) — In-app notifications, built while the owner was away

The owner went out for a couple of hours and asked me to keep building. I chose the work that needed none of their accounts or secrets. Decision D-023. Evidence: `docs/evidence/2026-11-24_notifications_checks.txt`. By then the project email sender had been set up in Supabase; its first test failed because a normal Gmail password was used instead of an app password (Google error 534), and passed after the owner generated an app password.

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | The notifications test passed 27 of 27 on its first run | Possible real result, possible weak tests | Weakened the read policy in a rolled-back transaction and watched the matching assertion fail | Minutes |
| 2 | Every signed-in page logged a "Date.now() while prerendering" error after adding the nav badge | The badge component created the database client before anything marked it request-time; Cache Components rejects that | `await connection()` first in the component | One rerun |
| 3 | The jobs regression run failed | Leftover job and applications from the notifications run, not a code fault | Cleared the data and reran: 22/22 | Minutes |

Lesson: a shared layout that reads per-member data is a rendering risk for every page at once, so one regression run of an older flow is the right check after touching it. The failure in 3 was a cleanup gap: each e2e script should leave the tables empty, and the notifications script does not delete its own job.

Not built, by decision (D-023): email, preferences, reminders.

Next: PWA, performance and security pass (28 Nov); the remaining owner-only setup.
