# Flash mentorship: design (Sprint 6)

Date: 2026-11-23 · Branch: `sprint-6-mentorship` · Source of truth for scope: `docs/plan/IIUC_Connect_Master_File_v2.md` §6.5 and §7 · Thesis claim 4.

## Goal

Replace the simple slot-booking of Sprint 5 with the request flow the master file specifies, and prove its rules in the database: a mentee requests a mentor's slot with a goal and questions; the mentor accepts (with a meeting link) or declines; unanswered requests expire after 72 hours; sessions are completed or marked no-show; each side rates the other, blind.

## Decisions taken (to be logged as D-018 to D-020)

- **D-018** Rebuild to the plan's model instead of layering requests on the Sprint 5 booking. Reason: one model to explain, matches ER diagram and booking state machine in the report. Cost: Sprint 5 mentorship tables and tests are replaced (hosted database holds no data).
- **D-019** Member writes use column grants, RLS and triggers, not public RPCs (same pattern as Sprints 3 and 5). Multi-table effects (booking a slot, creating the session) run in `SECURITY DEFINER` triggers in the `private` schema. Deviates from the letter of D-014, which asks for definer functions; the trigger form was chosen because it cannot be bypassed by a direct table write.
- **D-020** `pg_cron` runs request expiry and nightly slot generation inside the database. No external scheduler.

## Data model

Enums: `request_status` (`pending`, `accepted`, `declined`, `expired`, `cancelled`), `session_status` (`scheduled`, `completed`, `cancelled`, `no_show`), `slot_status` (`open`, `held`, `booked`, `cancelled`).

| Table | Columns that matter | Constraints |
|---|---|---|
| `mentor_profiles` | `id` (= profile id), `expertise_areas text[]` (max 8), `bio` (max 500), `max_sessions_per_week` (1 to 10, default 3), `accepting_requests` (default true) | Insert and update only by the owner, who must be a verified graduate |
| `mentor_availability_rules` | `mentor_id`, `weekday` (0 to 6, Bangladesh time), `start_time`, `end_time` | Times on 30-minute boundaries, start before end, window at most 8 hours; unique per (mentor, weekday, start); at most 10 rules per mentor |
| `mentor_slots` | `mentor_id`, `starts_at`, `status` | 30-minute slots; unique (mentor, `starts_at`); between 30 minutes and 14 days ahead when generated |
| `mentorship_requests` | `slot_id`, `mentee_id`, `mentor_id`, `duration_minutes` (15, 20 or 30), `goal` (10 to 500), `question_1` (5 to 300, required), `question_2` (optional), `status`, `meeting_url` (https, required exactly when accepted), `expires_at`, `responded_at` | Partial unique (`mentee_id`, `mentor_id`) where pending; partial unique (`slot_id`) where pending or accepted; mentee is not mentor |
| `sessions` | `request_id` (unique), `mentor_id`, `mentee_id`, `starts_at`, `duration_minutes`, `meeting_url`, `status`, `outcome_at` | Created only by the accept trigger |
| `session_feedback` | `session_id`, `reviewer_id`, `reviewee_id`, `rating` (1 to 5), `comment` (max 500) | Unique (`session_id`, `reviewer_id`); no update or delete |

Indexes on every foreign key and every column used in a policy. `expires_at` defaults to the earlier of 72 hours after creation and the slot start.

## State machines

- **Request**: `pending` goes to `accepted` or `declined` (mentor only), `cancelled` (mentee only) or `expired` (cron only). `accepted` goes to `cancelled` (either party, before the start). Every other change is refused.
- **Slot**: `open` to `held` when a request is created; `held` to `booked` on accept, or back to `open` on decline, expiry or cancel (if still in the future). The mentor can set an unheld slot to `cancelled`.
- **Session**: `scheduled` to `completed` or `no_show` (mentor only, after the end time) or `cancelled` (with its request).

Immutable after creation: ids, `mentor_id`, `mentee_id`, `slot_id`, `goal`, questions, `duration_minutes`, `starts_at`.

## Rules the database enforces

1. Only a verified graduate can mentor; only a verified member can request. A private graduate's slots are hidden.
2. One pending request per mentee and mentor pair, and one live request per slot (partial unique indexes, so concurrent inserts cannot both win).
3. A mentor cannot exceed `max_sessions_per_week` accepted sessions in a Bangladesh-time week, counted in an AFTER trigger so one statement cannot accept past the cap.
4. A mentee can have at most 3 live requests (pending or upcoming accepted), counted in an AFTER trigger.
5. A mentee cannot request their own slot or a slot less than 30 minutes away.
6. The meeting link exists only on accepted requests and their sessions, both readable by the two parties only.
7. Feedback: only after the session is `completed`, only by a party about the other, once each, immutable. A rating is hidden from the other party until both have rated or 7 days after `outcome_at`; own rating always visible; admins read all.
8. Deleting an availability rule removes that mentor's future open slots inside its window.

## Scheduled jobs (`pg_cron`)

- Every 15 minutes: `private.expire_requests()` sets overdue pending requests to `expired`; the slot trigger reopens the slot.
- Nightly: `private.generate_slots()` creates 30-minute slots 14 days ahead from each active mentor's rules, idempotent on (mentor, `starts_at`). The same function runs from a trigger when a rule is saved, so new rules show slots at once.

## Screens

- `/sessions` (hub). As mentee: my requests with status, upcoming sessions with the link, a rating form after completion. As mentor: incoming requests (accept with link, or decline), availability rules, mentor profile, upcoming sessions with a "completed / no-show" action, ratings once revealed. Existing sessions page sections for slots are removed.
- `/members/[id]`: a graduate's page shows open slots with a "Request a session" form (slot, 15/20/30 minutes, goal, question 1, optional question 2).
- All screens: loading, empty and error states; 375 px first; accessible forms; times shown in Bangladesh time.

## Server code

Zod schemas in `lib/mentorship/` for request, response, rule, profile and feedback; reuse `parseDhakaLocal`, `formatDhaka` and the https check from `lib/sessions/slot.ts` (move the shared parts, do not copy). Server Actions only, session-bound client, no privileged key.

## Tests and evidence

- pgTAP `005_mentorship.test.sql`: cross-role denial per table (anon, unverified, student, other graduate, mentor, mentee, admin); both state machines including refused transitions; every constraint above; burst cases (two requests for one slot, one UPDATE accepting past the weekly cap, one INSERT past the live-request limit); expiry function; slot generation in Bangladesh time and idempotence; feedback reveal both ways; immutability. The Sprint 5 file `004` is retired with its tables.
- Vitest for the new schemas and the week-boundary helper, written before the code.
- Playwright (`e2e/mentorship.py`): request, accept, decline, expiry (by moving `expires_at` in a rolled-back setup), cancel, no-show, feedback reveal, phone and dark screenshots.
- Supabase security and performance advisors after the migration. Evidence file in `docs/evidence/`. `Build_State.md`, `Decision_Log.md`, `Dev_Journal.md` updated.

## Out of scope (stated as limitations in the report)

- `.ics` file and the 24-hour and 1-hour reminder emails: need the project Gmail sender (D-010).
- No-show penalty (warning, then temporary restriction): `no_show` is recorded only.
- Calendar sync, mentor matching, directory filter for "mentor available" (small follow-up).
- Two-person chat or messaging.

## Risks

- `pg_cron` must be enabled on the hosted project and in CI's local stack. First task of the plan is a spike to confirm both before the migration is written.
- Replacing Sprint 5 tables breaks `e2e/sessions.py` and `004`; both are retired in the same change.
- Time: planned for 23 to 25 Nov. Jobs, notifications and evaluation depend on it finishing.
