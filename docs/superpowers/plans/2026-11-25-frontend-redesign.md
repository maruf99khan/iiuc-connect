# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every IIUC Connect page one professional, accessible, mobile-first design (crest palette, campus photo, app shell, shared components) without changing behaviour.

**Architecture:** A token layer in `app/globals.css` (Tailwind 4 `@theme`) feeds a small server-component library in `components/ui` and `components/shell`. Phase 0 builds that layer serially; three disjoint page groups then restyle routes in parallel using only those components; Phase 2 verifies everything together.

**Tech Stack:** Next.js 16 (Cache Components), React 19, Tailwind 4, TypeScript strict, `next/font`, `next/image`, Vitest (unit), Playwright (Python, `e2e/`), axe-core (dev only).

**Spec:** `docs/superpowers/specs/2026-11-25-frontend-redesign-design.md` (approved by the owner 25 Nov 2026, D-031). Read it first: it holds the page-by-page content.

## Global Constraints

- Behaviour, schema, RLS, routes and server actions do not change. No new filters. No profile photo upload.
- No new runtime dependency; `axe-core` is a devDependency only. Icons are inline SVG.
- Keep every accessible name, heading, label and button text that `e2e/*.py` rely on (12 scripts).
- WCAG AA: 4.5:1 text, 3:1 large text and field outlines; 44 px minimum touch targets; visible focus ring; one `h1` per page; honour `prefers-reduced-motion` and `prefers-color-scheme`.
- Budgets: signed-in LCP at most 2.2 s on Slow 4G with 4x CPU (was 1.8 s), CLS 0, added JS at most 30 kB. If the web font breaks the budget, fall back to system fonts.
- Palette: brand green `#0f5132`, accent maroon `#7f0218`, ink navy `#0f0165` (from the crest); dark-mode values in the spec, section 3.
- No invented statistics anywhere. Landing copy must not say search or mentorship is "not open".
- Assets: `public/brand/iiuc-crest.webp`, `public/brand/campus-aerial.webp` (use `next/image`).
- Next.js here is v16: read `node_modules/next/dist/docs/` before using `next/font`, `next/image` or `loading.tsx` APIs.
- Git: work on `main` (D-027), small commits, merge commits for group branches, never squash or force-push. Before every push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; read the CI result after.
- After each group, re-run the e2e scripts for the pages it touched against `npm run dev` (README "Browser checks"); delete any test accounts created.
- `app/globals.css` and `components/**` belong to Phase 0; groups A, B, C never edit them (ask for a new shared piece instead).

---

## Phase 0 — Shared layer (serial)

### Task 1: Contrast script and tokens (test first)

**Files:**
- Create: `scripts/contrast.py`

**Interfaces:**
- Produces: `python scripts/contrast.py` exits 0 only if every listed pair meets its minimum ratio; prints a table. The hex values in `LIGHT` and `DARK` are the single source copied into `globals.css`.

- [ ] **Step 1: Write the script with the pairs the design needs** (it fails first if any pair is too low)

```python
"""WCAG contrast of every text/background pair in the design tokens. Exit 1 if any fails."""
import sys

LIGHT = dict(bg="#ffffff", fg="#14201a", surface="#f6f8f7", surface2="#eef2f0", border="#dde5e0",
             field="#76887e", muted="#4a5a51", brand="#0f5132", brand_strong="#0b3d26",
             on_brand="#ffffff", accent="#7f0218", ink="#0f0165", danger="#b42318", warn="#8a5a00")
DARK = dict(bg="#0a0f0c", fg="#e8f0eb", surface="#111a15", surface2="#18241d", border="#25352c",
            field="#5f7669", muted="#a9b9b0", brand="#6fcf97", brand_strong="#8fdcae",
            on_brand="#0a0f0c", accent="#ff8a9b", ink="#c9c4ff", danger="#ffa198", warn="#f2c36b")

# (foreground, background, minimum ratio, what it is)
PAIRS = [
    ("fg", "bg", 4.5, "body text"), ("fg", "surface", 4.5, "text on card"),
    ("muted", "bg", 4.5, "secondary text"), ("muted", "surface", 4.5, "secondary on card"),
    ("muted", "surface2", 4.5, "secondary on inset"),
    ("brand", "bg", 4.5, "link / brand text"), ("brand", "surface", 4.5, "brand on card"),
    ("on_brand", "brand", 4.5, "primary button label"), ("on_brand", "brand_strong", 4.5, "button hover"),
    ("accent", "bg", 4.5, "accent text"), ("accent", "surface", 4.5, "accent on card"),
    ("ink", "bg", 4.5, "ink text"), ("ink", "surface", 4.5, "ink on card"),
    ("danger", "bg", 4.5, "error text"), ("danger", "surface", 4.5, "error on card"),
    ("warn", "bg", 4.5, "warning text"),
    ("field", "bg", 3.0, "field outline"), ("field", "surface", 3.0, "field outline on card"),
]


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def check():
    bad = 0
    for name, pal in (("light", LIGHT), ("dark", DARK)):
        for f, b, need, what in PAIRS:
            r = ratio(pal[f], pal[b])
            ok = r >= need
            bad += not ok
            print(f"{'ok  ' if ok else 'FAIL'} {name:5} {what:24} {pal[f]} on {pal[b]}  {r:5.2f} (need {need})")
    return bad


if __name__ == "__main__":
    assert abs(ratio("#000000", "#ffffff") - 21) < 0.01  # self-check of the formula
    sys.exit(1 if check() else 0)
```

- [ ] **Step 2: Run it:** `python scripts/contrast.py`. Any `FAIL` row names the token to adjust (usually `warn`, dark `accent`, or `muted`); change that hex in `LIGHT` or `DARK` until the script exits 0. These final values are the tokens used in Task 2.
- [ ] **Step 3: Commit:** `git add scripts/contrast.py && git commit -m "Contrast check for the design tokens"`

### Task 2: Tokens, font and base styles

**Files:**
- Modify: `app/globals.css` (rewrite; keep `.button`, `.button-primary`, `.button-quiet`, `.field`, `.wordmark` class names working), `app/layout.tsx` (font, `themeColor`)

**Interfaces:**
- Produces Tailwind color utilities: `bg-background text-foreground bg-surface bg-surface-2 border-border text-muted text-brand bg-brand text-on-brand bg-brand-strong text-accent bg-accent text-ink text-danger text-warn`; radius utilities `rounded-xl` (12 px) and `rounded-2xl` (20 px); `shadow-card` and `shadow-lift`; `font-sans` bound to the loaded font; a `.skeleton` class.

- [ ] **Step 1:** Read `node_modules/next/dist/docs/` for `next/font/google` (Plus Jakarta Sans, `subsets: ["latin"]`, `display: "swap"`, `variable: "--font-jakarta"`).
- [ ] **Step 2:** Rewrite `globals.css`: `:root` and the dark `@media` block take the exact values from `scripts/contrast.py`; `@theme inline` exposes every token as `--color-*`; `--font-sans: var(--font-jakarta), system-ui, ..., "Noto Sans Bengali", sans-serif`; add `--shadow-card`, `--shadow-lift`; keep the focus ring, selection and link rules; add a `prefers-reduced-motion: reduce` block that sets `transition-duration: 0.01ms` and `animation: none`; add `.skeleton` (shimmer on `surface-2`).
- [ ] **Step 3:** `layout.tsx`: apply the font variable on `<html>`; set `themeColor` to the brand colour.
- [ ] **Step 4: Verify:** `npm run lint && npm run typecheck && npm run build`; `npm run dev`, open `/sign-in` and a signed-in page: both render, nothing broken. `python scripts/contrast.py` exits 0.
- [ ] **Step 5: Commit:** `git commit -am "Design tokens, font and base styles"`

### Task 3: Pure helpers with unit tests (test first)

**Files:**
- Create: `lib/ui/avatar.ts`, `lib/ui/avatar.test.ts`, `lib/ui/format.ts`, `lib/ui/format.test.ts`

**Interfaces:**
- Produces: `initials(name: string): string` (up to two letters, upper case, handles Bangla and extra spaces, `"?"` for empty); `avatarTint(id: string): 0|1|2|3|4|5` (stable hash of the id); `relativeTime(iso: string, now?: Date): string` ("just now", "5 min ago", "3 h ago", "2 d ago", then a short date).

- [ ] **Step 1:** Write failing tests: `initials("Rahim Chowdhury") === "RC"`, `initials("  nusrat   jahan ") === "NJ"`, `initials("Madonna") === "M"`, `initials("") === "?"`; `avatarTint` is the same for the same id and always within 0 to 5 for 200 generated ids; `relativeTime` for 30 s, 5 min, 3 h, 2 d and 40 d.
- [ ] **Step 2:** `npm test -- lib/ui`: they fail (modules missing).
- [ ] **Step 3:** Implement the three functions (a 31-multiplier string hash modulo 6 for the tint; `Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric"})` beyond 30 days).
- [ ] **Step 4:** `npm test -- lib/ui` passes. **Step 5:** commit.

### Task 4: UI components

**Files:**
- Create under `components/ui/`: `icons.tsx`, `button.tsx`, `card.tsx`, `badge.tsx`, `avatar.tsx`, `chip.tsx`, `skeleton.tsx`, `page-header.tsx`, `stat-card.tsx`, `empty-state.tsx`, `alert.tsx`, `segmented.tsx`, `pagination.tsx`

**Interfaces (exact; groups A, B and C code against these):**
- `Icon({ name, className?, title? })` with `name` one of `home users briefcase calendar bell user search shield-check map-pin building clock link arrow-right menu logout plus x info alert sparkles check`; 24x24 viewBox, `stroke="currentColor"`, `aria-hidden` unless `title` is given.
- `LinkButton({ href, variant?: "primary"|"quiet"|"ghost", size?: "md"|"lg", icon?, children })` renders `next/link` with `.button` plus the variant; `Button({ type?, disabled?, variant?, size?, icon?, children })` is the same for `<button>`.
- `Card({ as?, padded?: boolean, interactive?: boolean, className?, children })`; `interactive` adds hover lift and a focus ring when it contains the card link.
- `Badge({ tone?: "neutral"|"brand"|"accent"|"ink"|"warn"|"danger", icon?, children })`.
- `Avatar({ id, name, size?: 32|40|56|96, className? })` uses `initials` and `avatarTint`; six tints from the palette, all AA with their text.
- `Chip({ children })`; `Skeleton({ className })` (a `div` with `.skeleton`, `aria-hidden`).
- `PageHeader({ title, description?, actions?, eyebrow? })` renders the page's single `h1`.
- `StatCard({ label, value, icon?, href?, tone? })`; `EmptyState({ icon?, title, description?, action? })`; `Alert({ tone: "info"|"success"|"warn"|"danger", title?, children })` with `role="status"`, or `role="alert"` for danger.
- `Segmented({ label, options: {label, href, active}[] })` as a `<nav aria-label>` of links with `aria-current`; `Pagination({ page, pageCount, hrefFor: (n: number) => string })`.

- [ ] **Step 1:** Write each component to these interfaces and the tokens (rounded-2xl cards, 1 px border, `shadow-card`, 150 ms transitions, targets at least 44 px).
- [ ] **Step 2:** Add a throwaway page `app/(app)/_kit/page.tsx` showing every component in both themes for review; it is deleted in Task 7 and must not ship.
- [ ] **Step 3: Verify:** lint, typecheck, build; open `/_kit` at 375 and 1280 px in light and dark; fix anything misaligned.
- [ ] **Step 4: Commit:** `git commit -m "Shared UI components"`

### Task 5: Shells

**Files:**
- Create: `components/shell/app-shell.tsx`, `user-menu.tsx`, `bottom-nav.tsx`, `site-header.tsx`, `site-footer.tsx`, `auth-layout.tsx`
- Modify: `app/(app)/layout.tsx` (use `AppShell`; keep the `signOut` action, `UnreadCount` in a `Suspense`, and `<main>`), `app/(auth)/layout.tsx` (use `AuthLayout`)

**Interfaces:**
- Consumes: Task 4 components; `signOut` from `app/(auth)/actions`; `UnreadCount` from `app/(app)/unread-count`.
- Produces: `AppShell({ children })`; `SiteHeader()`, `SiteFooter()`, `AuthLayout({ children })`. If the shell needs the user's name or admin flag, reuse the profile fetch the pages already use and note it; add no new data path.

- [ ] **Step 1:** Desktop top bar (sticky 64 px; crest via `next/image` 36 px with `alt=""`, wordmark link; nav links with `aria-current` active pill; bell with unread badge; `<details>` user menu with Profile, Verify, Admin when admin, Sign out). Mobile: slim bar plus a fixed bottom tab bar (Home, Directory, Jobs, Sessions, You), `padding-bottom: env(safe-area-inset-bottom)`, and `main` gets bottom padding so nothing is hidden. Skip link first in the DOM. Content width `max-w-6xl`.
- [ ] **Step 2:** `AuthLayout` two columns from `lg` (campus photo panel with crest and one line; form card), single card below. `SiteHeader` and `SiteFooter` for the landing page.
- [ ] **Step 3: Verify** with a signed-in test account at 375 and 1280 px in light and dark: every nav link reaches its page, the active state is right, the menu opens with the keyboard, the bottom bar never covers content. Run `python e2e/security_anon.py` and `python e2e/notifications.py`.
- [ ] **Step 4: Commit.**

### Task 6: Audit tooling

**Files:**
- Create: `e2e/ui_audit.py`; modify `package.json` (devDependency `axe-core`)

**Interfaces:**
- Produces: `python e2e/ui_audit.py [--routes a,b,c]` signs in with seeded audit accounts (seed SQL in its docstring, like `search.py`), visits every route at 375, 768 and 1280 px in light and dark, saves a screenshot per combination into `e2e/shots/` (git-ignored; a chosen few are copied to `docs/evidence/ui/`), injects `axe-core` and exits 1 on any `serious` or `critical` violation; prints one line per route.

- [ ] **Step 1:** Write the script (routes from spec section 6; Playwright `color_scheme` for dark; `page.add_script_tag(path="node_modules/axe-core/axe.min.js")`; `page.evaluate("axe.run()")`).
- [ ] **Step 2:** Run it for `/dashboard` and `/directory` with the Task 5 shell; fix shell-level violations only.
- [ ] **Step 3: Commit.**

### Task 7: Owner review gate (stop)

- [ ] Remove `app/(app)/_kit/`. Build the landing hero as a proof (Group A's first piece) and take screenshots of landing, dashboard and directory at 375 and 1280 px, light and dark. Show the owner. **Do not start Phase 1 until the owner says the look is right.** Log D-031 as Accepted with the final tokens.

---

## Phase 1 — Page groups (parallel, disjoint files; each in its own worktree, merged with a merge commit)

Each task: read the spec section for the page, rebuild the markup with `components/ui` and `components/shell` only, keep all server actions, data fetching and accessible names, add `loading.tsx` skeletons where listed, then run the named e2e script and `python e2e/ui_audit.py --routes <that group's routes>`. These tasks are specified by files, interfaces and acceptance checks; the page code is written against the components Task 4 actually produces.

### Group A (public)
- **A1 Landing** — `app/page.tsx` (hero with `next/image` `priority`, steps, features, band, footer; remove the false "not open yet" text). Verify: `e2e/security_anon.py`, audit `/`.
- **A2 Auth pages** — `app/(auth)/sign-in|sign-up|forgot-password|reset-password/page.tsx`, `auth-form.tsx`, `forgot-form.tsx`, `reset-form.tsx`, `resend-confirmation.tsx` (visual only). Verify: `e2e/auth.py`, `signup.py`, `recovery.py`.
- **A3 System pages** — `app/not-found.tsx`, `app/error.tsx` (client component). Verify: open a bad URL; trigger the error page once in dev.

### Group B (core member screens)
- **B1 Dashboard** — `app/(app)/dashboard/page.tsx`, add `loading.tsx`. Verify: `e2e/auth.py`, `notifications.py`.
- **B2 Directory** — `app/(app)/directory/page.tsx`, add `loading.tsx` (skeleton grid). Verify: `e2e/search.py` (20 checks pass unchanged).
- **B3 Member profile** — `app/(app)/members/[id]/page.tsx`, `request-form.tsx`. Verify: `e2e/mentorship.py`, `jobs.py` (profile link).

### Group C (everything else)
- **C1 Jobs** — `app/(app)/jobs/page.tsx`, `jobs/new/page.tsx`, `jobs/[id]/page.tsx`, `job-form.tsx`, `apply-form.tsx`, add `loading.tsx`. Verify: `e2e/jobs.py` (44 checks).
- **C2 Sessions** — `app/(app)/sessions/page.tsx`, `feedback-form.tsx`, `mentor-profile-form.tsx`, `respond-form.tsx`, `rule-form.tsx`. Verify: `e2e/mentorship.py` (25 checks).
- **C3 Notifications, profile, verify, admin** — `notifications/page.tsx`, `profile/page.tsx`, `profile-form.tsx`, `verify/page.tsx`, `claim-form.tsx`, `admin/verifications/page.tsx`, `decision-form.tsx`. Verify: `e2e/notifications.py`, `verify.py`, `security_member.py`.
- Cut order if time runs out (spec section 9): admin, verify, sessions forms, notifications, profile keep only the shell and tokens.

## Phase 2 — Verification (serial)

- **P2-1 Full check.** `npm run lint && npm run typecheck && npm test && npm run build`; `python scripts/contrast.py`; every `e2e/*.py` against `npm run dev` (`directory.py` needs its own empty world; note if skipped); `python e2e/ui_audit.py` on every route with zero serious or critical findings; fix what fails.
- **P2-2 Performance.** Production build, `python e2e/perf_signed_in.py 5` and `... 5 3g`; compare with `docs/evidence/2026-11-25_signed_in_performance.txt`. If Slow 4G LCP exceeds 2.2 s, find the cause (font, image, JS) and fix, or drop the web font.
- **P2-3 Records.** `docs/evidence/<date>_frontend_redesign.txt` (what changed, audit results, performance, screenshots, what was cut); update `Build_State.md`, `Decision_Log.md` (D-031 final), `Dev_Journal.md`, `Requirements.md` (R-NFR-03, R-NFR-04), README bullets; push; read the CI result; confirm the live site renders.
