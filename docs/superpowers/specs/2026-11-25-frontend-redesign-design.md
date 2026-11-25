# IIUC Connect — Complete frontend redesign (design spec)

Date: 2026-11-25 · Status: **proposed, awaiting owner approval** · Decision: D-031 (to be logged on approval)
Owner's reference: dunite.app (Dhaka University network). Owner's verdict on the current UI: "not even 5% of that".
Assets supplied by the owner: IIUC crest (`public/brand/iiuc-crest.webp`, 455x480, transparent) and an aerial campus photo (`public/brand/campus-aerial.webp`, 1851x1060, 375 kB).

## 1. Why the current UI looks thin (measured from the code)

- The signed-in app is one 672 px column (`max-w-2xl`) with a text-link nav that wraps; on a laptop two thirds of the screen is empty.
- 118 lines of CSS, nine colours, system fonts, no icons, no shared components (`components/` does not exist), no imagery, no avatars.
- The landing page is a text block and still says "Search and mentorship are not open yet", which is false.
- Cards, buttons and fields exist only as three CSS classes; each page lays itself out.

What makes dunite.app feel finished: a campus photo hero, member and company imagery, stat cards, a real navigation bar, filter layouts, skeleton loading, consistent cards and badges. Most of it is a design system plus page structure, not decoration.

## 2. Goals and non-goals

Goals
1. Every route looks like one product: tokens, type, spacing, cards, badges, avatars, icons, empty/loading/error states.
2. Desktop uses the screen (up to 1152 px content) and mobile feels native (bottom tab bar, 44 px targets, one-hand reach).
3. Public pages sell the product honestly with the crest and the campus photo.
4. Light first, a properly designed dark mode from the same tokens.
5. No loss of what is already proven: accessibility (Lighthouse 100 on sign-in), signed-in LCP near 1.8 s on Slow 4G, all e2e checks green.

Non-goals (stay out, or the freeze is lost)
- No behaviour, schema, RLS, route or server-action changes. No new filters (the directory search accepts `q` and `who` only; department/batch filters in the Master File are not built and stay unbuilt).
- No profile photo upload (members get initials avatars). No new runtime dependencies (icons are inline SVG).
- No fabricated numbers: unlike dunite.app's "4M+ reach", we show only facts we can prove.

## 3. Brand and tokens

Palette drawn from the crest (sampled: navy `#0f0165`, maroon `#7f0218`, green ribbon) instead of the earlier "green + gold" idea, which was chosen before the crest was seen. **Owner to confirm.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` (green) | `#0f5132` | `#6fcf97` | primary buttons, links, success, active nav |
| `brand-strong` | `#0b3d26` | `#8fdcae` | hover |
| `accent` (maroon) | `#7f0218` | `#ff8a9b` | highlights, alumni badges, key numbers |
| `ink` (navy) | `#0f0165` | `#c9c4ff` | hero overlay, headings on feature bands, avatar tint |
| `background` | `#ffffff` | `#0a0f0c` | page |
| `surface` | `#f6f8f7` | `#111a15` | cards on page, bands |
| `surface-2` | `#eef2f0` | `#18241d` | inset areas, skeletons |
| `border` | `#dde5e0` | `#25352c` | hairlines |
| `muted` | `#4a5a51` | `#a9b9b0` | secondary text |
| `danger` / `warn` / `success` | `#b42318` / `#8a5a00` / `#0f5132` | tinted | states |

Every foreground/background pair must pass WCAG AA (4.5:1 text, 3:1 large text and field outlines); checked with a script before components are built, not by eye.

Type: one self-hosted variable family through `next/font` (Plus Jakarta Sans, Latin subset, `display: swap`) for headings and body, system fallback for Bangla script. Scale 12/14/16/18/20/24/30/40/56, headings tight (`-0.02em`), body 16 px, line height 1.55. Budget: at most +30 kB transferred; if signed-in LCP rises above 2.2 s on Slow 4G the font is dropped and system fonts stay.

Shape and depth: radius 12 px (controls) and 20 px (cards); 1 px borders plus a single soft shadow; interactive cards lift 2 px on hover. Spacing on a 4 px grid, section gaps 48 to 96 px on desktop. Motion: 150 to 200 ms colour/transform transitions, skeleton shimmer, nothing that loops; all disabled under `prefers-reduced-motion`.

## 4. Shared layer (built first, nobody else edits it)

`components/ui/` (server components unless noted; no state libraries):
`Button`, `LinkButton`, `Card`, `Badge`, `Avatar` (initials, tint hashed from the id), `Chip`, `Skeleton`, `PageHeader`, `StatCard`, `EmptyState`, `Alert`, `Field` (label, hint, error), `Segmented` (link-based filter control), `Pagination`, and an `Icon` set (about 20 inline SVGs: home, users, briefcase, calendar, bell, user, search, check-shield, map-pin, building, clock, link, arrow-right, menu, logout, plus, x, info, alert, sparkles).
`components/shell/`: `AppShell` (top bar, bottom tab bar, user menu), `SiteHeader` and `SiteFooter` for public pages, `AuthLayout`.
Existing `.button`, `.field`, `.wordmark` classes are re-pointed to the new tokens first, so any page not yet rebuilt still looks right.

## 5. Shell and navigation

- **Desktop (md and up):** sticky 64 px top bar: crest 36 px and "IIUC Connect" wordmark on the left; Dashboard, Directory, Sessions, Jobs in the middle with an active pill; notification bell with unread badge and a user menu (initials avatar, Profile, Verify status, Admin if admin, Sign out) on the right. The user menu is a native `<details>` popover, so it needs no client JavaScript.
- **Mobile:** slim top bar (crest, wordmark, bell) and a fixed bottom tab bar with five tabs: Home, Directory, Jobs, Sessions, You. Safe-area padding for iOS. Active tab has a filled icon plus label.
- Skip link, `<nav aria-label>` landmarks, `aria-current="page"`.
- Content width 1152 px (`max-w-6xl`); form pages 672 px; reading pages 768 px.

## 6. Page-by-page

Public
1. **Landing `/`.** Full-bleed campus photo hero (next/image, priority, navy-to-transparent gradient), crest, headline "Find your IIUC network. Get a mentor in 30 minutes.", two CTAs (Create account, Sign in). Below: how it works in three numbered steps (Verify with your IIUC record, Find people by skill, Book a 30-minute session); four feature cards (Verified members, Ranked and typo-tolerant search, Mentorship with free slots, Jobs board); a "built for IIUC" band with the crest; honest footer line (thesis project, free to use, contact). No invented statistics. The false "not open yet" text is removed.
2. **Sign-in, sign-up, forgot, reset.** Two columns on large screens: left panel is the campus photo with crest and one line of value; right is the form card. Mobile: card on a soft surface with the crest above. Password show/hide and inline errors keep their current behaviour.

Signed in
3. **Dashboard.** Greeting with avatar and verification badge; a status banner (verify now / pending / verified); four stat tiles from data the page already loads (open requests, upcoming sessions, unread notifications, open jobs); quick actions; "Next session" card; latest notifications; latest jobs.
4. **Directory.** Header with a large search field and a segmented All / Alumni / Students control (the two filters that exist); result count; responsive card grid (1, 2 and 3 columns) with avatar, name, headline, company, department and batch badges, skills chips; skeleton loading; empty state with a tip about typos; pagination.
5. **Member profile.** Cover band (navy-to-green gradient with a subtle pattern), overlapping avatar, name, headline, badges (affiliation, verified, department, batch); About, Skills, Professional, Links cards; right column "Mentorship" card with the existing slot and request flow restyled; mobile stacks it under the header.
6. **Jobs list.** Header with Post a job button; job cards with company-initials avatar, title, company, location, type badge, posted date; empty state. **Job detail:** header card, description, side card with apply form (CV upload, message) and the poster's tools (applications list, shortlist, reject, close) restyled as a clear card list with status pills. **New job:** sectioned form card.
7. **Sessions.** Sections (Upcoming, Requests, Mentor settings) on one page; request and session cards with status pills; availability rule and mentor profile forms as cards; feedback as a short form card.
8. **Notifications.** List with a type icon, text, relative time, unread dot, subtle read/unread contrast, empty state.
9. **Profile.** Sectioned form cards (Basics, Professional, Links, Privacy), sticky save bar on mobile, visibility choice as three radio cards.
10. **Verify.** Three-step visual progress (Submit, In review, Verified) above the claim form; clear state messages for pending, rejected (with reason) and verified.
11. **Admin verifications.** Card list with claimant, claim, an "Open document" link, and Approve / Reject with the reason field; counts at the top.
12. **System pages.** Branded 404 and error pages; `loading.tsx` skeletons for directory, jobs, sessions and dashboard.

## 7. Accessibility, performance, i18n

- AA contrast verified by script on all token pairs, both themes; visible focus ring on everything focusable; 44 px minimum targets; forms keep labels, `aria-invalid` and error text; one `h1` per page; `prefers-reduced-motion` and `prefers-color-scheme` honoured.
- Images: `next/image`, hero `priority` and `sizes`, crest decorative (`alt=""`) beside the wordmark text. Budget: signed-in LCP at most 2.2 s on Slow 4G with 4x CPU (current 1.8 s), CLS 0, added JS at most 30 kB; measured again with `e2e/perf_signed_in.py` and recorded.
- Bangla names and long names: cards truncate with a title attribute, wrap rather than overflow; tested with a Bangla-script profile.
- Two source images only, well inside the Vercel Hobby image-optimisation limit.

## 8. How it is built and checked

- Tests do not change behaviour, so `e2e/*.py` keep passing if roles, headings, labels and button text stay. I keep every accessible name and re-run the relevant script after each page group; any script that breaks because of text I changed is fixed in the script and noted.
- New checks: `e2e/ui_audit.py` takes screenshots at 375, 768 and 1280 px in light and dark for every route (saved in `docs/evidence/ui/`) and runs axe-core rules, failing on serious or critical issues. `axe-core` is a dev dependency only.
- A contrast script (`scripts/contrast.py`) prints every token pair with its ratio.
- Before every push: lint, typecheck, unit tests, build; after: read the CI result.

## 9. Order of work and who works on what

Phase 0 (serial, about one day): tokens, `components/ui`, shell, re-point the old classes, `scripts/contrast.py`, `e2e/ui_audit.py` skeleton. Pages must not start before this lands.
Phase 1 (three disjoint groups, in parallel, each in its own worktree and merged with a merge commit; none edits `components/` or `globals.css`, they ask for a new shared piece instead):
- A: landing, auth pages, 404/error, footer.
- B: dashboard, directory, member profile.
- C: jobs (list, detail, new), sessions, notifications, profile, verify, admin.
Phase 2 (serial): full e2e run, audit, contrast, accessibility fixes, performance re-measure, evidence file, records.

Calendar: Thu 26 Nov Phase 0 and group A. Fri 27 groups B and C. Sat 28 Phase 2 and fixes. Sun 29 Nov freeze, final full test run. **The redesign must be finished before UAT starts on 30 Nov; testers must not see a UI that changes mid-test.** If it slips, cut in this order and let those pages keep the new shell and tokens only: admin, verify, sessions forms, notifications, profile.

## 10. Risks

- Largest: time. A full frontend in three days leaves one day of testing. Mitigation: shared layer first, three parallel groups, a fixed cut order.
- Selector breakage in the 12 e2e scripts. Mitigation: keep accessible names, re-run per group.
- Merge conflicts between groups. Mitigation: disjoint files, shared layer frozen after Phase 0.
- Font or image weight hurting slow-network performance. Mitigation: budgets above, measured; fall back to system fonts.
- Taste is not testable. Mitigation: the owner reviews screenshots of the landing page and one inner page at the end of Phase 0 before Phase 1 starts.

## 11. Decisions the owner is asked to confirm

1. Palette from the crest (green primary, maroon accent, navy ink), gold dropped.
2. Plus Jakarta Sans via `next/font`, with the system-font fallback if the budget fails.
3. Three parallel groups after Phase 0 (this is how a three-day window is possible).
4. The cut order if time runs out.
