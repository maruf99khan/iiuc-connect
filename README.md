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

## Accounts

| Route | What it does |
|---|---|
| `/sign-up` | Create an account with email and password |
| `/sign-in` | Sign in; `?next=/path` returns the member to where they were going |
| `/auth/confirm` | Landing point for the confirmation link Supabase emails |
| `/dashboard` | Signed-in only; shows the member's verification status |

Supabase dashboard settings these routes rely on (Authentication → URL Configuration):

- **Site URL**: the address the app is served from (`http://localhost:3000` in development).
- **Redirect URLs**: add `<site URL>/auth/confirm` for every address the app is served from.

With Supabase's default email template, the confirmation link signs the member in only in the browser where they signed up; opened elsewhere it still confirms the email, and they sign in normally. To make the link work on any device, change the "Confirm signup" template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

Supabase's built-in email service is for development only: it sends very few emails per hour (see Authentication → Rate Limits) and, per Supabase's documentation, delivers only to members of the project's organization. Once that hourly limit is reached, sign-up shows "We cannot send another email right now". Before anyone outside the team signs up, connect an SMTP provider under Authentication → Emails → SMTP Settings.

Not built yet: password reset, and resending the confirmation email.

## Affiliation verification

A member whose email is confirmed claims to be an IIUC student or graduate and uploads a photo or scan of an ID card or certificate. An admin compares it with the details given and approves or rejects it.

| Route | Who | What it does |
|---|---|---|
| `/verify` | Members | Claim form; then the pending, rejected or verified screen |
| `/admin/verifications` | Admins | Queue of open requests with document links; approve, or reject with a reason |

How it is enforced (all in the database, `supabase/migrations/`):

- A member can only create a claim for themselves and only withdraw their own open claim. They cannot edit, approve or reopen one.
- An admin can approve or reject someone else's open claim, never their own. Rejecting needs a reason the member can read.
- Approving copies affiliation, department, batch and student ID onto the profile and moves the member to `verified_student` or `verified_alumni`. A student ID can belong to one member only.
- Every status change is written to the append-only audit log in the same transaction.
- Files go to the private `verification-documents` bucket, one folder per member (5 MB; JPG, PNG, WebP or PDF; the server also checks the file's first bytes). Members can upload and read their own files; admins read through short-lived signed links. Nobody can change or delete a file through the API.

### Creating the first admin

There is no sign-up path to admin on purpose. After the person has created an account, run this once in the Supabase SQL editor (the database owner may write the protected `role` column; members cannot):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

### Known gaps

- **Evidence files outlive accounts.** Deleting an account removes the claim rows but not the files in storage, and Supabase blocks deleting storage rows from SQL. A purge job that uses the service role (the `purged_at` column is ready for it) is still to be built. Until then, delete test files by hand in the dashboard under Storage.
- **Institutional email method** is not open. It needs the IIUC email domain and a working mailer.
- **One file per claim** in the form (the database allows three).
- The queue shows open requests only; decided requests are in the audit log but have no screen yet.

## Security model

Authorization is enforced in the database with Row Level Security. The app only ever talks to the database with the signed-in user's session and the publishable key, so the UI cannot grant access the database would refuse.

- Users cannot write `role`, `verification_status`, `affiliation` or `reputation_score`. Those change only through database functions that also write an audit event.
- Sensitive personal fields live in `profile_private`, readable only by the owner and admins.
- `verification_events` is append-only for every role.

## Database tests

`supabase/tests/*.test.sql` are pgTAP tests. Each file runs inside one transaction that is rolled back, so it leaves no data behind. Run a file against the database (Supabase SQL editor, or `supabase test db` with the CLI) and read the TAP report it returns. Saved runs are in `docs/evidence/`.
