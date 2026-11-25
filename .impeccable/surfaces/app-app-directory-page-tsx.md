---
version: 1
slug: "app-app-directory-page-tsx"
primary_target: "app/(app)/directory/page.tsx"
related_targets: ["app/(app)/jobs/page.tsx","app/(app)/dashboard/page.tsx","app/page.tsx"]
---

# Signed-in app: browse frames (dashboard, directory, member profile, jobs, sessions, notifications, profile, verify, admin)

Scope: every route under `app/(app)/`, plus the public landing page `/`. Visitor mode: Operate for the app, Persuade for `/`.

Audience and job: an IIUC student looking for a graduate to learn from, or a graduate who will mentor and hire; mostly on a phone over slow mobile data. They find a person, request a 30-minute session, apply for a job, answer replies. Constraints: crest palette fixed by the owner (green brand, maroon accent, navy ink); no behaviour, schema or route changes; no new filters (only q and Alumni/Students exist); initials avatars, no photo upload; WCAG 2.2 AA; works on a cheap phone.

Reference: dunite.app (owner's own). Supersedes the old account-screens brief for these routes (D-031).

## Direction contract

THESIS: Every list in the app is one browse frame: a filter column beside a grid of rich cards. A page is never a narrow column of stacked text. It refuses the single-column text page and the stat-tile dashboard.

OWN-WORLD: Crest palette on a pale surface ground, white bordered cards with 16px corners, initials avatars in six calm tints, green for the one primary action, maroon for alumni and key numbers, navy only on photo overlays and bands. Plus Jakarta Sans. Elevation is a hairline at rest and a lift on hover. Recognisable with content removed: a left filter rail, a card grid, a count-and-sort bar.

STORY: The member sees how many people or jobs match, narrows them in one tap, opens a card, and acts (request a session, apply). Verification and replies are surfaced as short banners at the top of the home page.

FIRST VIEWPORT: Directory at 1280: page title and search field across the top, filter rail 260px on the left (Who, with count), count and sort bar, then a three-column card grid, avatar and name and role and badges and three skills per card. On a phone: search, a Filters button that opens a sheet, one card per row. Primary action on a card is its own link; the page's primary action is Search.

FORM: browse grid with filter rail, position 2 of 7 on my ordered list, the roll dealt it as an alternate; seed: seed:63029f8268c5230b

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
