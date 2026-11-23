# IIUC Connect — Decision Log (Thesis Appendix F)

---

Decision #: D-001
Date: 2026-11-16
Module: Platform
Decision: Build on Next.js 16 instead of Next.js 14.
Rationale: Next.js 14 reached end of life on 26 October 2025 and receives no security patches. A thesis claiming security as a contribution cannot pin an unsupported framework.
Alternatives considered: Next.js 14 (unsupported); Next.js 15 (maintenance ended October 2026).
Trade-offs accepted: Fewer tutorials for the newest major; v1 notes written for 14 need re-checking against current docs.
Source: Next.js Support Policy, https://nextjs.org/support-policy
Status: Accepted

---

Decision #: D-002
Date: 2026-11-16
Module: Scope
Decision: Reduce from nine modules to a prioritized core (see D-012 for the final priority order).
Rationale: The thesis claims depend only on the core; breadth would cost depth of testing and evaluation.
Alternatives considered: Full v1 scope; mentorship-only.
Trade-offs accepted: Less feature breadth in the demo.
Source: Master File v2.1, section 4.
Status: Accepted

---

Decision #: D-003
Date: 2026-11-16
Module: Mentorship
Decision: Implement availability and booking natively in PostgreSQL instead of integrating Cal.com.
Rationale: Booking integrity (one pending request per pair, no double-booked slot, 72-hour expiry) is enforced and tested with database constraints, which is itself a contribution. It is free with no external limit, and mentors need no second account.
Alternatives considered: Cal.com free plan (per-mentor account friction, webhook dependency, core logic outside the evaluated system).
Trade-offs accepted: No sync with mentors' personal calendars; mentors paste their own meeting link; we send an .ics file.
Source: PostgreSQL documentation, Partial Indexes and Unique Constraints.
Status: Accepted (team asked for the best free option, 2026-11-16)

---

Decision #: D-004
Date: 2026-11-16
Module: Authorization
Decision: Protect role, verification_status, affiliation and reputation_score with column-level grants; change them only through SECURITY DEFINER functions.
Rationale: RLS is row-level. An "update own row" policy alone lets a user set their own role or verification status.
Alternatives considered: BEFORE UPDATE trigger; separate table for privileged columns.
Trade-offs accepted: Every new editable profile column must be added to the grant list.
Source: Supabase, Row Level Security; PostgreSQL, GRANT.
Status: Accepted. Implemented in migration 20261116104143; proven by pgTAP tests 29–31 and 45.

---

Decision #: D-005
Date: 2026-11-16
Module: Mentorship
Decision: Enforce "one pending request per mentee–mentor pair" with a partial unique index WHERE status = 'pending'.
Rationale: v1's UNIQUE (mentee_id, mentor_id, status) also blocked any second completed or declined request between the same two people, and an RLS-only check is unsafe under concurrent inserts.
Alternatives considered: RLS WITH CHECK subquery; application-level check. Both have race conditions.
Trade-offs accepted: None significant.
Source: PostgreSQL documentation, Partial Indexes.
Status: Accepted

---

Decision #: D-006
Date: 2026-11-16
Module: Authorization
Decision: Server code uses a session-bound Supabase client by default; the privileged key is confined to webhooks and scheduled jobs.
Rationale: v1 specified the service-role key for the general server client, which bypasses RLS and makes every policy and test meaningless for server-rendered pages.
Alternatives considered: Privileged client everywhere with manual checks.
Trade-offs accepted: Some admin operations need explicit SECURITY DEFINER functions.
Source: Supabase, Server-Side Auth for Next.js (creating-a-client guide and the official `examples/auth/nextjs` code).
Status: Accepted. Implemented in `lib/supabase/server.ts`. No privileged client exists in the codebase yet.

---

Decision #: D-007
Date: 2026-11-16
Module: Search
Decision: Build on PostgreSQL full-text search first, then add Typesense, and report both.
Status: Superseded by D-009

---

Decision #: D-008
Date: 2026-11-16
Module: Privacy
Decision: Store student ID, institutional email, phone and personal email in a separate owner-and-admin-only table instead of per-field visibility flags on profiles.
Rationale: RLS cannot hide individual columns.
Alternatives considered: Masking views; per-field flags enforced in application code.
Trade-offs accepted: Coarser privacy control than v1 promised.
Source: Supabase, Row Level Security.
Status: Accepted. Implemented as `profile_private`; proven by pgTAP tests 20, 25, 41, 43.

---

Decision #: D-009
Date: 2026-11-16
Module: Search
Decision: PostgreSQL full-text search with weighted tsvector and pg_trgm is the production search. Typesense is used, at most, for a time-boxed comparison on its one-time free credit.
Rationale: The project is free-tier only. Self-hosted Typesense needs a paid server; Typesense Cloud gives a one-time 720-hour credit that does not renew. PostgreSQL search runs inside the existing free Supabase database, needs no sync pipeline, and respects RLS natively.
Alternatives considered: Typesense self-hosted (paid VPS); Typesense Cloud (credit expires); Algolia free plan (external index of personal data, sync pipeline to build in limited time).
Trade-offs accepted: Weaker typo tolerance and ranking control than a dedicated engine; no instant-search-as-you-type at scale.
Source: PostgreSQL documentation, Full Text Search and pg_trgm; Typesense Cloud free tier terms.
Status: Accepted

---

Decision #: D-010
Date: 2026-11-16
Module: Email
Decision: Use custom SMTP for authentication and application email through a dedicated project Gmail account with an app password. Move to Resend if the team later obtains a domain.
Rationale: Supabase's built-in mailer is limited to 2 emails per hour and delivers only to project team members, so real users could never receive an OTP. Resend's free tier needs a verified domain to send to arbitrary recipients, and the team has none.
Alternatives considered: Supabase default mailer (unusable); personal Gmail (exposes a personal address to participants and stores its app password in project settings); paid email plans (excluded).
Trade-offs accepted: Gmail has daily sending caps and weaker deliverability; acceptable for a prototype and UAT with about 10 users.
Source: Supabase, Send emails with custom SMTP, https://supabase.com/docs/guides/auth/auth-smtp
Status: Accepted. Account being created by the team; wiring happens in Sprint 2.

---

Decision #: D-011
Date: 2026-11-16
Module: Verification
Decision: Students verify by OTP to their institutional mailbox (pattern like c231226@ugrad.iiuc.ac.bd), with student ID and department derived from the address. Alumni verify by document review.
Rationale: The institutional mailbox is an existing, free proof of affiliation. Alumni may not retain mailbox access, so they need a separate path.
Alternatives considered: Document review for everyone (slow, admin bottleneck); domain check without OTP (trivially spoofed).
Trade-offs accepted: Mailbox control does not prove current enrolment; stated as a limitation.
Source: Team knowledge of IIUC email format; Supabase Auth OTP documentation.
Status: Accepted (ID format breakdown to be confirmed)

---

Decision #: D-012
Date: 2026-11-16
Module: Scope
Decision: Execute the 12-sprint plan in 19 days with a Must / Should / Could priority order and a feature freeze on 29 November.
Rationale: Pre-defense is 5 December 2026 and the report is due with it. Ordering by thesis value means anything cut comes from the bottom, and the last week is reserved for evaluation and user testing, which the report cannot do without.
Alternatives considered: Attempting the full v2.0 scope (no time left for evaluation); building until the last day (no measured results).
Trade-offs accepted: Events, weekly digest, web push and offline reading may be documented as designed but not implemented.
Source: Master File v2.1, sections 4 and 12.
Status: Accepted

---

Decision #: D-013
Date: 2026-11-16
Module: Identity
Decision: Split the single "role" idea into two columns: `role` (member or admin) for privileges, and `affiliation` (student or alumni) for what the person is. Whether someone may act as a verified student or alumnus is read from `verification_status`.
Rationale: The v1 enum (student, alumni, faculty, admin) forced one value to answer two questions. An admin is also a student or an alumnus, and a new user has no affiliation until they claim one.
Alternatives considered: One enum with combined values (grows combinatorially); a boolean `is_admin` (less extensible than an enum).
Trade-offs accepted: Policies read `verification_status` rather than a single role field.
Source: Design review while writing migration 20261116104143.
Status: Accepted

---

Decision #: D-014
Date: 2026-11-16
Module: Verification
Decision: Every verification table is read-only through the API. All writes, including a user submitting their own claim, go through SECURITY DEFINER functions. One internal function, `private.transition_verification`, is the only code that changes `verification_status`, and it writes the audit event in the same transaction. Legal transitions are defined in one place, `private.is_allowed_transition`.
Rationale: A status change without its audit event, or an audit event without a status change, must be impossible. Direct inserts cannot guarantee that; a single function can.
Alternatives considered: INSERT policies with WITH CHECK on requests plus triggers to move status (logic spread across policies and triggers, harder to test and to explain).
Trade-offs accepted: Each user action in the verification flow needs its own small database function.
Source: Supabase, Row Level Security (security definer functions); PostgreSQL, CREATE FUNCTION.
Status: Accepted. Core implemented in Sprint 1; user-facing and admin-facing functions come in Sprints 3 and 4.

---

Decision #: D-015
Date: 2026-11-16
Module: Audit
Decision: Make `verification_events` append-only with three layers: no UPDATE/DELETE/TRUNCATE privilege for any API role including the service role; a row trigger that rejects every UPDATE and DELETE; a statement trigger that rejects TRUNCATE. The single exception is the foreign-key action that nulls a user reference when an account is deleted.
Rationale: Privileges alone do not stop the table owner or a future privileged function. The trigger makes tampering fail for every role.
Alternatives considered: Privileges only (owner can still edit); a separate audit database (not available on the free tier).
Trade-offs accepted: A database superuser can still disable the trigger; this is stated as a limitation.
Source: PostgreSQL, CREATE TRIGGER.
Status: Accepted. Proven by pgTAP tests 13–18 and 46.

---

Decision #: D-016
Date: 2026-11-16
Module: Testing
Decision: Write pgTAP tests so each assertion is inserted into a temporary table and the file ends with one SELECT of that table, all inside a transaction that is rolled back.
Rationale: The team has no local Docker database, and the hosted SQL endpoint returns only the last result set. This shape lets the same file run through `supabase test db` and through a single SQL call against the hosted database, and it leaves no test data behind.
Alternatives considered: Standard pgTAP with one SELECT per assertion (only the last line is visible through the hosted endpoint); a local Supabase stack in Docker (heavy for the team's hardware and time).
Trade-offs accepted: Tests run against the shared development database rather than an isolated one; fixtures use fixed fictional IDs and every query filters on them.
Source: Supabase, Testing RLS with pgTAP; pgTAP documentation.
Status: Accepted

---

Decision #: D-017
Date: 2026-11-16
Module: Frontend
Decision: Use the system font stack instead of downloaded web fonts, and keep Cache Components and Partial Prefetching enabled as generated by create-next-app 16.4.
Rationale: System fonts cost zero bytes on slow mobile data, which supports the low-bandwidth claim. Cache Components is the framework's current default model; it requires uncached data to sit behind Suspense, which matches the rule that every data view has a loading state and that personalized data is never cached.
Alternatives considered: Geist via next/font (extra download, build-time network dependency); disabling Cache Components (works against framework defaults and documentation).
Trade-offs accepted: Typography varies slightly between devices.
Source: Next.js 16.4 documentation shipped in the package, "Caching" guide.
Status: Accepted
