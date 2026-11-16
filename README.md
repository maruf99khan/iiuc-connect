# IIUC Connect

A verified alumni and professional network for International Islamic University Chittagong (IIUC). CSE undergraduate thesis project by Maruf Khan and Md Minhajul Alam, supervised by Jamil As-ad.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage) · Zod · Vitest · pgTAP. Everything runs on free tiers.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then run the TypeScript compiler |
| `npm test` | Unit tests (Vitest) |

## Project layout

```
app/                  Routes (Server Components by default)
lib/env.ts            Validated environment variables
lib/supabase/         Supabase clients: browser, server, session refresh
proxy.ts              Refreshes the auth session on each request
types/                Generated database types (do not edit by hand)
supabase/migrations/  SQL migrations, one file per schema change
supabase/tests/       pgTAP tests for Row Level Security
docs/evidence/        Saved test and audit output for the thesis report
```

## Security model

Authorization is enforced in the database with Row Level Security. The app only ever talks to the database with the signed-in user's session and the publishable key, so the UI cannot grant access the database would refuse.

- Users cannot write `role`, `verification_status`, `affiliation` or `reputation_score`. Those change only through database functions that also write an audit event.
- Sensitive personal fields live in `profile_private`, readable only by the owner and admins.
- `verification_events` is append-only for every role.

## Database tests

`supabase/tests/*.test.sql` are pgTAP tests. Each file runs inside one transaction that is rolled back, so it leaves no data behind. Run a file against the database (Supabase SQL editor, or `supabase test db` with the CLI) and read the TAP report it returns. Saved runs are in `docs/evidence/`.
