# IIUC Connect: rules for Claude Code

CSE thesis by Maruf Khan and Md Minhajul Alam (supervisor Jamil As-ad). Pre-defense **5 Dec 2026**, feature freeze **29 Nov 2026**. Free tiers only.

## Read first, every session

1. `docs/plan/Build_State.md`: sprint map, what is done, what is blocked.
2. `docs/plan/IIUC_Connect_Master_File_v2.md`: scope and priorities. It is the source of truth; do not contradict it silently.
3. `docs/plan/Decision_Log.md`: thesis Appendix F. Log every significant choice, including deviations from the master file.
4. `docs/plan/Project_Instructions_v2.md`: the working rules (judgment before obedience, honesty, engineering standards). They apply here too.

`docs/plan/Project_Instructions_current.md` is the old v1-era text (Next.js 14, Typesense, Cal.com). Where it disagrees with the Master File or Decision Log, the Master File and Decision Log win.

## How to work

- One thing at a time, finished fully: schema, RLS, pgTAP tests, server code, UI, loading/empty/error states.
- Never say something works unless you ran it and saw the result. Say exactly what is unverified.
- Evaluate instructions before obeying them. If a better way exists, say so first with the cost of each option.
- At the end of each session update `Build_State.md`, `Decision_Log.md` and `Dev_Journal.md`, and save evidence in `docs/evidence/`.

## Mechanics

- Git (D-027): work on `main`; it deploys to Vercel at `iiuc-connect.vercel.app`, where the testers are. Run the checks below before every push, and push small, descriptive commits. Use a short-lived branch only for something risky (Vercel previews it), merge it with a **merge commit** (never squash: the history is thesis evidence), and never force-push or rewrite history without the user saying so.
- Database: hosted Supabase project `zhogqnudiosaqihzvkiq` is the development database (D-016) and holds the demo data from `supabase/demo/` for testers (remove it with `demo_cleanup.sql`). pgTAP files run in one rolled-back transaction. Delete any other test accounts and storage files you create.
- Checks before calling anything done: `npm run lint`, `npm run typecheck`, `npm test`, the pgTAP files via `execute_sql`, the Supabase security advisors after every schema change, and the relevant `e2e/*.py` against `npm run dev`.
- Next.js here is v16 with Cache Components. Read `node_modules/next/dist/docs/` before writing against its APIs.
- "Confirm email" is **on** (since 24 Nov), so e2e accounts are seeded straight into `auth.users` already confirmed (see README "Browser checks").
- Windows 11, Git Bash and PowerShell available. The repo's own hooks may ask for facts before edits; state them and retry.
