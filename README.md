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
| `/forgot-password` | Ask for a password-reset email (same answer whether or not the address has an account) |
| `/auth/reset` | Landing point for the reset link Supabase emails |
| `/reset-password` | Choose a new password; every other session is signed out |

Supabase dashboard settings these routes rely on (Authentication → URL Configuration):

- **Site URL**: the address the app is served from (`http://localhost:3000` in development).
- **Redirect URLs**: add `<site URL>/auth/confirm` **and** `<site URL>/auth/reset` for every address the app is served from.

With Supabase's default email template, the confirmation link signs the member in only in the browser where they signed up; opened elsewhere it still confirms the email, and they sign in normally. To make the link work on any device, change the "Confirm signup" template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

Supabase's built-in email service is for development only: it sends very few emails per hour (see Authentication → Rate Limits) and, per Supabase's documentation, delivers only to members of the project's organization. Once that hourly limit is reached, sign-up shows "We cannot send another email right now". Before anyone outside the team signs up, connect an SMTP provider under Authentication → Emails → SMTP Settings.

Members who are not confirmed can ask for the confirmation email again (on the "Check your email" screen and when sign-in says the email is not confirmed). Members who forget their password use `/forgot-password`.

## Before real members sign up

These need your Supabase dashboard or GitHub account, so the code cannot do them for you. Until they are done, the app is fine for development and demos but not for real members.

1. **Connect an email provider.** Supabase → Authentication → Emails → SMTP Settings (Resend and Brevo both have free tiers). The built-in mailer sends only a couple of emails an hour for the whole project and, per Supabase's documentation, delivers only to members of your Supabase organization. One typo plus one retry can lock everyone out for an hour.
2. **Switch "Confirm email" back on.** Authentication → Sign In / Providers → Email. With it off, nothing checks that an address belongs to the person who typed it.
3. **Set the URLs.** Authentication → URL Configuration: Site URL is the production address; Redirect URLs include `/auth/confirm` and `/auth/reset` for production and for `http://localhost:3000`.
4. **Make email links work on any device (recommended).** Authentication → Emails → Templates. Confirm signup: link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Reset password: link to `{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery`. With the default templates a link works only in the browser that asked for it.
5. **Schedule the evidence clean-up** (below).
6. **Create the first admin** (above) and delete any test files left in Storage.
7. **Merge the sprint branches** once the GitHub Actions run on them is green.

### Evidence clean-up

ID photos must not outlive their purpose. `GET /api/cron/purge-evidence` deletes two kinds of file: documents whose claim was decided more than `EVIDENCE_RETENTION_DAYS` days ago (default 30), and stored files that no claim points to (for example, the account was deleted), once they are a day old. It records `purged_at` only after a file is confirmed gone, and does at most 100 of each kind per run.

- It needs two server-only settings on the host: `SUPABASE_SECRET_KEY` (dashboard → Project Settings → API Keys → secret key; it bypasses Row Level Security, so keep it out of the repo and out of `NEXT_PUBLIC_` names) and `CRON_SECRET` (any random string of 24+ characters). Without them the route answers 503 and does nothing.
- Callers must send `Authorization: Bearer <CRON_SECRET>`. On Vercel, add `{"crons":[{"path":"/api/cron/purge-evidence","schedule":"0 3 * * *"}]}` to `vercel.json`; Vercel sends that header when `CRON_SECRET` is set.
- Only the service role can run the two database functions behind it (`evidence_purge_candidates`, `mark_evidence_purged`); members and visitors cannot.

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

## Profiles and the member directory

| Route | Who | What it does |
|---|---|---|
| `/profile` | Members | Edit headline, job, company, city, industry, skills, about, LinkedIn address and who can find you |
| `/directory` | Verified members | Search and browse verified members, 20 per page |
| `/members/[id]` | Verified members | One member's profile |

- **Search** matches every word you type against name, headline, job, company, city, industry, department, batch and skills (case-insensitive, any part of a word). Filter by students or graduates. It runs on one `search_text` column kept up to date by a database trigger and indexed with `pg_trgm`; at 20,000 profiles a two-word search uses the index and takes about a millisecond.
- **Who can find you** (each member chooses): *Verified IIUC members* (the default), *Everyone* (public), or *Only me*. The *Everyone* setting means visitors who are not signed in can read the profile through the database API, so the form says so in plain words. There is no public profile page yet.
- **What an admin approved cannot be edited**: department, batch and graduation year have no member write access, and a verified member's name is locked (the database enforces both). Contact details (`profile_private`) never appear in the directory.
- The LinkedIn address must be on `linkedin.com` over https. The database refuses anything else, and the member page re-checks it before showing a link.
- Pages return HTTP 200 for a not-found member (the not-found screen is shown, no data leaks). Next streams the page before the check runs.

## Security model

Authorization is enforced in the database with Row Level Security. The app only ever talks to the database with the signed-in user's session and the publishable key, so the UI cannot grant access the database would refuse.

- Users cannot write `role`, `verification_status`, `affiliation` or `reputation_score`. Those change only through database functions that also write an audit event.
- Sensitive personal fields live in `profile_private`, readable only by the owner and admins.
- `verification_events` is append-only for every role.

## Database tests

`supabase/tests/*.test.sql` are pgTAP tests. Each file runs inside one transaction that is rolled back, so it leaves no data behind. Run a file against the database (Supabase SQL editor, or `supabase test db` with the CLI) and read the TAP report it returns. Saved runs are in `docs/evidence/`.
