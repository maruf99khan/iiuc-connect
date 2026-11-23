# IIUC Connect — Master File v2.1

Last updated: 2026-11-16 · Supersedes `iiucconnectmasterfile.pdf` (v1) and v2.0

**Team**: Maruf Khan and Md Minhajul Alam · **Supervisor**: Jamil As-ad, Associate Professor, Dept. of CSE, IIUC · **Pre-defense**: 5 December 2026

This file is the source of truth for scope, design decisions, thesis claims and the plan. The SQL in `supabase/migrations/` is the source of truth for the database. Companion docs: `Build_State.md` (where we are), `Decision_Log.md` (Appendix F), `Dev_Journal.md` (daily record, including mistakes), `Report_Plan.md` (report structure and the evidence each chapter needs).

---

## 1. What we are building

IIUC Connect is a verified alumni and professional networking platform for International Islamic University Chittagong, built as a CSE undergraduate thesis. The contribution is an engineering system: a verified, university-scoped network whose core recurring action is short, structured mentorship, designed for mobile-first users in Bangladesh.

## 2. Two hard constraints

1. **19 days.** Everything, including the report, is due before 5 December. Features are ordered by thesis value so that anything cut comes off the bottom.
2. **Free tiers only.** No paid service anywhere. Each tool below is the best free option; paid upgrades are listed as future work.

## 3. Problem statement — figures pending source audit

The v1 unemployment figures (13.5%, 885,000, 9.7% → 27.8%) have no matching bibliography entry and disagree with source B1. No figure enters the report until traced to a primary source with a page number.

## 4. Scope, in priority order

| Priority | Module | Thesis claim it supports |
|---|---|---|
| Must | Identity and tiered verification | 1 |
| Must | Profiles with privacy | all |
| Must | Admin console: verification queue, audit trail | 1, 2 |
| Must | Alumni directory and search | 3 |
| Must | Flash mentorship | 4 |
| Should | Jobs board: post, apply, track | 6 |
| Should | Email notifications and reminders | 4, 6 |
| Should | Installable PWA with measured performance | 5 |
| Could | Events with RSVP | 6 |
| Could | Weekly digest | 6 |
| Could | Web push, offline reading | 5 |

**Future work (Chapter 8)**: business directory, halal tags, maps, scholarship board, pride walls, forums, vouching beyond a basic version, dedicated search engine in production, payments, native app, SIS sign-on, AI matching.

If time runs short, "Could" items are described in the report as designed but not implemented. That is normal and honest for a pre-defense.

## 5. Stack — all free

| Need | Choice | Free-tier limit that matters |
|---|---|---|
| Framework | Next.js 16, TypeScript strict, Tailwind | — |
| Hosting | Vercel Hobby | Scheduled jobs run at most daily |
| Database, auth, storage | Supabase Free | Small storage; project pauses if left idle |
| Search | PostgreSQL full-text search + `pg_trgm` inside Supabase | None |
| Booking | Native slots in PostgreSQL | None |
| Auth and app email | Custom SMTP. Resend free if we have a domain; otherwise a Gmail account with an app password | Supabase's built-in mailer sends 2 per hour, to team members only, so it cannot be used |
| Background jobs | `pg_cron` in Supabase | — |
| Validation / client data | Zod / TanStack Query | — |
| Tests | pgTAP, Vitest, Playwright, Lighthouse, k6 | — |
| Source control, CI | GitHub Free + Actions | — |
| Surveys | Google Forms | — |

Typesense is no longer the production search: self-hosting needs a paid server and Typesense Cloud offers only a one-time 720-hour credit. That credit is enough for a time-boxed comparison experiment in evaluation week if time allows.

## 6. Architecture decisions

### 6.1 Identity and verification

Status enum: `unverified → email_verified → affiliation_pending → verified_student | verified_alumni → trusted_member`.

- **Sign-in**: email OTP via Supabase Auth. One flow for sign-in and sign-up, identical response either way, so the form never reveals whether an email is registered.
- **Students**: IIUC issues addresses of the form `c231226@ugrad.iiuc.ac.bd` (a department letter followed by the ID digits). Proving control of such a mailbox by OTP moves the user to `verified_student`, and the student ID and department are derived from the address. This proves mailbox control, not current enrolment; the report states that limitation.
- **Alumni and anyone without a working institutional mailbox**: upload a document (ID card, certificate) to a private bucket; an admin reviews it.
- **Transitions** happen only through `SECURITY DEFINER` functions that write to `verification_events` in the same transaction.
- **Audit**: `verification_events` is append-only for every role.
- **Vouching** (basic): two verified members can raise a verified user to `trusted_member`. No self-vouch.
- **Documents** are deleted 30 days after a decision.

### 6.2 Authorization

- RLS on every table, separate policies per operation, written in the migration that creates the table.
- `role`, `verification_status` and `reputation_score` are not user-writable: column-level grants limit what `authenticated` can update.
- Admin checks go through a `SECURITY DEFINER` function in a non-exposed schema.
- Server code uses a session-bound client so RLS applies. The privileged key is used only in webhooks and scheduled jobs.
- Every policy has a pgTAP test, including cross-user denial.

### 6.3 Privacy

- `profiles`: fields safe for anyone allowed to see the row.
- `profile_private`: student ID, phone, personal email; owner and admin only.
- `profile_visibility` per profile: `public`, `iiuc_community`, `private`.

### 6.4 Search

- A generated `tsvector` column with weights: name (A), job title and skills (B), company and department (C), bio (D).
- `pg_trgm` similarity on name for typo tolerance.
- Filters: department, batch, graduation year, location, industry, mentor availability.
- Search runs through one SQL function so RLS and visibility apply.
- Evaluation: 20 representative queries, precision@10 and p95 latency. Optional: the same queries against Typesense on its free credit.

### 6.5 Flash mentorship

- Mentor sets weekly availability; the system generates bookable slots.
- Request: mentee picks a slot, a duration (15, 20 or 30 minutes), a goal, and one or two questions. All required.
- One pending request per mentee–mentor pair: partial unique index `WHERE status = 'pending'`.
- No double booking: unique constraint on the booked slot.
- Request: `pending → accepted | declined | expired | cancelled`. Expiry at 72 hours by `pg_cron`.
- Session: `scheduled → completed | cancelled | no_show`.
- Mentor supplies the meeting link. Confirmation email with an `.ics` file. Reminder emails at 24 hours and 1 hour.
- Feedback is double-blind: hidden until both submit or 7 days pass.
- Weekly cap per mentor.

### 6.6 PWA

Manifest and install prompt, app-shell caching, performance budget measured on throttled 3G. Push and offline reading are "Could".

## 7. Data model

Exact DDL lives in migrations.

- **Identity**: `profiles`, `profile_private`, `verification_requests`, `verification_documents`, `verification_events`, `vouches`
- **Mentorship**: `mentor_profiles`, `mentor_availability_rules`, `mentor_slots`, `mentorship_requests`, `sessions`, `session_feedback`
- **Jobs**: `jobs`, `job_applications`
- **Community**: `events`, `event_registrations`
- **Platform**: `notifications`, `notification_preferences`, `audit_log`

Rules: UUID keys; `created_at` and `updated_at`; every status is an enum; no reserved words as column names (v1's `current_role` is now `job_title`); indexes on foreign keys and RLS predicate columns; keyset pagination; named columns in every select.

## 8. RLS matrix (design level)

| Table | anon | verified student | verified alumni | admin |
|---|---|---|---|---|
| profiles | S: public | S: public + community; U: own editable columns | same | S all |
| profile_private | — | S, U: own | S, U: own | S |
| verification_requests / documents | — | S, I: own | S, I: own | S, U |
| verification_events | — | S: own | S: own | S |
| vouches | — | S: own | S: own; I if eligible | S |
| mentor_profiles / slots | — | S | S; I, U, D: own | S |
| mentorship_requests | — | S: own; I as mentee; U: cancel | S: addressed to self; U: accept or decline | S |
| sessions | — | S: own | S: own; U: outcome | S |
| session_feedback | — | I: own; S: own, counterpart's after reveal | same | S |
| jobs | S: active | S: active | S: active; I, U, D: own | S, U, D |
| job_applications | — | S, I: own; U: withdraw | S: to own jobs; U: status | S |
| events / registrations | S: published | S; I, D own RSVP | S; I, U own events | all |
| notifications / preferences | — | S, U: own | S, U: own | — |
| audit_log | — | — | — | S |

S select, I insert, U update, D delete. Unverified users can reach only their own profile and verification records.

## 9. Thesis claims

1. A tiered, audit-logged verification model (email OTP, institutional mailbox proof, private document review, community vouching) implemented as a database state machine with an append-only event log.
2. Database-first multi-role authorization: RLS, column-level privilege protection, and a pgTAP suite proving denial across roles and users.
3. A weighted, typo-tolerant, filterable people search built inside PostgreSQL at zero infrastructure cost, evaluated on precision@10 and latency.
4. A structured flash-mentorship workflow with database-enforced request limits, slot integrity, automatic expiry, reminders and double-blind feedback.
5. A mobile-first installable web app with measured performance on throttled 3G.
6. A whole system delivered on free tiers, with the cost and limits documented, making it reproducible by other universities.

No "first in Bangladesh" claims.

## 10. Evaluation (Chapter 6)

| What | Measure | Tool |
|---|---|---|
| Authorization | Denial tests passed per role and table | pgTAP |
| Search | precision@10, p95 latency on 20 queries | SQL scripts |
| Performance | LCP, INP, bundle size on throttled 3G | Lighthouse |
| Load | p95 under concurrent search | k6 |
| Security | Enumeration, bucket access, privilege escalation | Manual, pgTAP, Supabase advisors |
| Usability | Task completion, time on task, 10-item SUS | 10 participants |

## 11. Ethics and law

- The Digital Security Act 2018 cited in v1 is repealed. Cite the current personal data protection law (originating in the Personal Data Protection Ordinance 2025) and the current cyber security law after confirming exact titles.
- Written consent from every UAT participant. Ask the supervisor whether IIUC needs an ethics sign-off.
- Seed data is fictional. Identity documents: private bucket, admin-only, deleted after 30 days.

## 12. Plan — 16 November to 5 December

| Date | Build | Report |
|---|---|---|
| Mon 16 | Plan reset (done) | — |
| Tue 17 | Accounts, repo, scaffold, identity schema + RLS, first deploy | Collect IIUC template; Ch 1 outline |
| Wed 18 | OTP auth, onboarding | Ch 1 draft |
| Thu 19 | Verification: institutional mailbox, document upload, state machine, audit | Ch 2 sources verified |
| Fri 20 | Admin queue; profile view and edit; privacy | Ch 2 draft |
| Sat 21 | Directory, search, filters | Ch 3 requirements, use cases |
| Sun 22 | Identity test suite; fixes; buffer | Ch 4 data model, ER diagram |
| Mon 23 – Wed 25 | Mentorship end to end | Ch 4 state machines, RLS matrix |
| Thu 26 | Jobs | Ch 5 implementation |
| Fri 27 | Notifications, reminders; events if time | Ch 5 |
| Sat 28 | PWA, performance pass, security pass | Ch 6 method |
| Sun 29 | **Feature freeze.** Full test run, evaluation scripts | Ch 6 results (technical) |
| Mon 30 – Wed 2 | UAT with 10 participants; bug fixes only | Ch 6 usability, Ch 7 |
| Thu 3 | — | Ch 8, abstract, final assembly, slides |
| Fri 4 | Rehearsal and buffer | Proofread |
| Sat 5 | Pre-defense | |

## 13. How the team works

**Claude**: architecture, code, migrations, RLS, tests, running and checking the app, debugging, citation verification, diagrams, report drafting, keeping these docs current.

**Maruf (build lead)**: accounts and secrets, repo, connecting the project folder, testing each feature the day it is built, real-phone testing.

**Minhajul (report and evaluation lead, suggested)**: IIUC template and supervisor contact, Perplexity runs, wireframes and screenshots, recruiting UAT participants, running UAT sessions, proofreading.

Both: supervisor meetings, UAT, pre-defense slides.

**Each session**: read `Build_State.md` → build one thing → test → update `Build_State.md`, `Decision_Log.md`, `Dev_Journal.md`.
