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

Later the same evening: made the app installable (manifest, three icons, Apple icon), decision D-024, evidence `docs/evidence/2026-11-24_pwa_checks.txt`. No service worker on purpose. The manifest test was written first and seen failing; the files are served to signed-out visitors (the proxy does not redirect them). Not tested: an actual install on a phone.

Next: performance measurement (Lighthouse, throttled network) and the rest of the security pass (28 Nov); the remaining owner-only setup.

## 2026-11-24 night to 2026-11-25 — Day 8 (late) — Email links tested by hand, demo data, records audit

The owner came back and we went through the manual items one task at a time. Edited the two Supabase email templates (confirmation and reset) to link to the app's own pages, with a designed layout; turned "Confirm email" on; the owner signed up with a real mailbox, clicked the confirmation link, and reset the password through the emailed link. Both worked. A second account was promoted to admin with the README's SQL and approved the first account's student claim; the database showed the new status. The app was then empty, so I wrote `supabase/demo/demo_data.sql` (six members, two mentors with open slots, five jobs, one application) and `demo_cleanup.sql`.

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | The demo mentors had no open slots after the seed ran | Slot generation only serves members whose `affiliation` is `alumni`. The app sets it when a claim is submitted; my seed promoted members through the database function, which does not set it | Set `affiliation` in the seed, then ran the generator: 16 and 8 slots | Minutes |
| 2 | The owner asked whether job applications carry more than a message, and whether a CV is needed | Applications hold the applicant's name and an optional message only; the plan never mentioned a CV. A profile link alone would not cover tailored CVs | Brainstormed three approaches; the owner chose a PDF per application. Logged as D-025, Proposed. Nothing built | A conversation |
| 3 | The owner asked whether the main plan is kept current for the thesis | Decisions were being logged in the Decision Log only after they were built. The Master File had no note of its departures, the Report Plan still described OTP login, there were no requirement IDs, and the screenshots rule was not being followed | Added section 14 "Amendments since v2.1" to the Master File, refreshed the Report Plan, created `Requirements.md`, logged D-026 (records once per session, screenshots in one pass near the end) | About an hour |

Lesson: seeding through internal functions skips side effects the app performs on the way, so a seed has to be checked by looking at what the screens show, not only at row counts. For the report: a plan file is only a source of truth if departures are written into it the same day.

Not verified: the mapping of requirements to tests in `Requirements.md` has not been checked assertion by assertion; the screens with demo data have not been looked at by Claude, only by the owner on request.

Next: owner approval of D-025; then, if approved, the CV build (migration and pgTAP first), the profile link and the profile fields.

## 2026-11-25 — Day 9 — Application CVs and profile links (D-025, sprint-7-job-cv)

The owner approved the design, so I committed the records and cut `sprint-7-job-cv`. Order of work: pgTAP file first (46 assertions; the bucket, both columns and the purge function were shown absent before the migrations), then two migrations, then unit tests written and seen failing before each piece of code, then the screens, then browser checks. Evidence: `docs/evidence/2026-11-25_job_cv_checks.txt`.

| # | What happened | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | The test file errored on its first run | A data-changing `WITH` inside a subquery is not allowed in PostgreSQL; I had used it for the two "cannot change" assertions | Ran the update as a plain statement, then asserted the state was unchanged (a stronger test as well) | One rerun |
| 2 | pgTAP 45/46: "a file of an application withdrawn over a day ago is listed" failed | The code was right. A trigger stamps `updated_at` on every update, so my attempt to backdate the withdrawal in the test was overwritten | Turned triggers off for that one backdating statement in the test | One rerun |
| 3 | Plan said 45 assertions | Miscounted the reading section (10, not 9) | Corrected to 46 | Seconds |
| 4 | The e2e scripts could not seed accounts the old way | "Confirm email" is now on, so sign-ups wait for an email | Inserted three confirmed accounts straight into `auth.users` with a bcrypt password, then moved them through the verification function; deleted them afterwards | Minutes |
| 5 | The cleanup route could not be exercised | `SUPABASE_SECRET_KEY` and `CRON_SECRET` are not set locally (owner-only). Deleting storage rows from SQL is blocked | Tested the pure logic with fake dependencies and the listing function in the database; wrote down that no real file has been deleted. Two test CV files remain in the bucket | Open item |

A negative control was run on the read policy: swapping in a policy that lets any member read the bucket made a third member see the file, so the "cannot read" assertions can fail.

Decisions worth recording: upload first, then insert the application, so an application never points at a missing file (the cost is an orphan file if the insert fails, which the purge removes). The CV link is a route that makes a 60-second signed link when clicked, not a link made when the page is built, so a page left open does not hold a dead link. Admins can read the application row but not the file: the route checks both and answers 404 to an admin.

Not verified: a real phone; the private-applicant case (no link, a note) in a browser; the 2 MB limit enforced by Storage itself rather than by the app; the new migrations and file 008 in CI. CI was green on a162155, f8b8cba and 0a8a507 (files 001 to 007 have now run in CI).

Next: push the branch and read CI; then the remaining owner items (production URLs, Vercel keys, supervisor answers, UAT participants), the screenshot pass, performance measurement.

## 2026-11-25 (afternoon) — Day 9 — Deploy for a tester, and merge to main (D-027)

The owner wanted a friend to test the app while they keep building. Vercel was already building every pushed branch (GitHub integration, both Supabase environment variables set), so the CV commit was live as a preview. I checked it through Vercel's own access link: the sign-in page rendered fully, the manifest was served and all security headers were present.

Two blockers for a tester: Vercel's login wall is on for every address including the automatic production one, and Supabase's Site URL is still `http://localhost:3000`, so confirmation emails would link to the owner's machine. I tried to switch the wall off through the Vercel connector and the permission system refused; I did not work around it and handed the one click to the owner. The owner then pointed out that stacked sprint branches were too much ceremony for a one-person coding workflow. I agreed: a branch address changes every sprint, and Supabase's Site URL would need editing each time.

Decision D-027: merge once, then work on `main`. I chose a merge commit over a squash (the 42 commits are cited in the report), over a rebase (it would change every hash that the evidence files quote) and over a long-lived `develop` branch (nobody to review into it). I fast-forwarded `sprint-6-mentorship` to `sprint-7-job-cv`, so PR 1 carried everything without a new commit; the first CI summary I read came from the app's cache and still showed the previous head, so I read the checks for the real head commit before merging (`verify`, `database`, Vercel all green on `05059f6`). Merged as `9586ec8`; `main` has 45 commits. `CLAUDE.md` still said "do not merge to main" and "Confirm email is off"; both were stale and are fixed.

Not verified at the time of writing: the production deployment of `main` (building when this was written); the owner's two dashboard steps (Vercel login wall off, Supabase Site URL).

Later the same afternoon: the production deployment was READY and the address opened without a login (the owner had moved it to a custom domain, which the protection setting exempts); the Site URL was set (the reset email's link now names `iiuc-connect.vercel.app`). I then measured the sign-in page: Lighthouse accessibility, best practices and SEO all 100; LCP 1.6 s on Slow 4G and 4.9 s on Slow 3G, both with a 4x slower CPU, one run each (`docs/evidence/2026-11-25_performance_checks.txt`).

The functions were running in US East while the database is in Singapore. I wanted to measure signed-in pages for that, and the owner gave me authority to create a test account. That does not cover typing the account's password into the live site: only localhost or a marked test host is allowed, whatever the owner says, so I did not. I measured the suspected cause directly instead, with no sign-in: a throwaway route timing five round trips to Supabase, on two previews of the same code (default region, and `vercel.json` with `sin1`), three calls each. Median 799 ms from US East against 37 ms from Singapore, about 21 times lower per query. Applied to `main` (`ae0db18`), D-028; verified after the deploy from the response header (`bom1::sin1`). The throwaway route and its two branches were deleted. Not measured: a signed-in page before and after. That still needs a signed-in browser session, so the page-level gain is unknown and certainly smaller than 21 times.

Also saved a memory note about the owner's delegation and where it stops.

## 2026-11-25 (evening) — Day 9 — Search rebuilt to the claimed design (D-029)

The owner asked for a review of the plan against what is done. Reading the code rather than the records, I found that the directory search (`ILIKE '%word%'` per word, A to Z) was not what Master File 6.4 and thesis claim 3 describe (weighted `tsvector`, `pg_trgm` typo tolerance, ranking), and the deviation was in no log. The owner said to build what the claim says (D-029) rather than rewrite the claim.

Tests first (pgTAP file 009), then migration `20261125140000_search_members`, then the page, then an evaluation of 20 queries against the old search, then a browser check. Result and limits are in `docs/evidence/2026-11-25_search_checks.txt`: on synthetic data normalised P@10 is 1.000 against 0.914 (plain queries) and 1.000 against 0.000 (typo queries); server-side p95 is 109 ms at 2,000 members and 274 ms at 5,000, against 3 and 6 ms for the old search, because the new one scans every profile.

| # | What went wrong | Cause | Fix | Cost |
|---|---|---|---|---|
| 1 | Plan said 30 assertions | Miscounted; 33 after the first draft, 35 at the end | Corrected the plan number each time | Seconds |
| 2 | `create function` failed: permission denied to set `pg_trgm.word_similarity_threshold` | The hosted role cannot set that setting on a function | Dropped the setting | One rerun |
| 3 | First run: 10 of 33 failed | The hosted database already holds demo members and two real test accounts, so counts were wrong. One failure was real: "xylophone" matched "grameenphone" | Ran later passes with every account deleted inside the rolled-back transaction. Replaced trigram typo matching with edit distance (trigram scores could not separate "rahmin" 0.43 from "xylophone" 0.40) | Two reruns |
| 4 | A check of mine returned nothing and looked like a pass | I called the function with no signed-in user, so `auth.uid()` is null and every row is excluded | Ran it as a signed-in role through the real test file | Noticed at once |
| 5 | Design gap found before measuring | The typo path only filtered and added no rank, so a skill match and a bio mention tied on a misspelt word | Scored each word by the weight of the best field it matches; test 15 | One rewrite |
| 6 | The first evaluation run showed the new search worse on "network engineer" (4 of 10 against 6) | "network" is a prefix of the skill "networking", which scored the same as the job title | Exact words now outscore prefixes (1.0 against 0.9); 10 of 10 at 2,000 members | One rerun |
| 7 | A query of only punctuation listed everyone | Cleaning removed every character, leaving no word to match | A non-blank query with no searchable character now matches nobody; test 30 | One rerun |
| 8 | Browser sign-in failed with "Database error querying schema" | My seeded accounts had no `created_at`, `updated_at` or `auth.identities` row | Added them; the seed in `e2e/search.py` now has them | Ten minutes |
| 9 | My first draft of the evidence file overstated two things ("18 of 20 queries"; who two extra results were) | Written from memory of the table | Corrected to what the output shows before saving | Caught on reread |

Decisions worth recording: edit distance (1 edit for 4 to 5 letters, 2 for 6 or more, none below 4) instead of trigram similarity; ranking by best field per word instead of `ts_rank_cd`; no index, with the ceiling measured and written down; the old helpers and their 13 unit tests deleted rather than left dead.

Not verified: pgTAP 009 in CI; `e2e/directory.py` against the new search (its fixture needs an empty database, and this one holds the demo data and the owner's two test accounts, which I did not touch); real users' judgement of relevance; Bangla-script names; latency at more than 5,000 members (10,000 is extrapolated).

Cleaned up: the five `e2e-search-*` accounts are deleted; the demo data and the two real test accounts are intact (checked by count).
