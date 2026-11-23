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
