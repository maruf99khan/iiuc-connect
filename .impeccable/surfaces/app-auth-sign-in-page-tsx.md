---
version: 1
slug: "app-auth-sign-in-page-tsx"
primary_target: "app/(auth)/sign-in/page.tsx"
related_targets: ["app/(auth)/sign-up/page.tsx","app/dashboard/page.tsx"]
---

# Account screens: sign up, sign in, dashboard

Scope: `/sign-up`, `/sign-in`, `/dashboard`. Visitor mode: Operate.

Audience and job: an IIUC student or graduate, usually on a phone, creating an account and finding out where they stand on verification. Constraints: system fonts, no images, works without JavaScript for the first paint, WCAG 2.2 AA.

Extends the incumbent world in `app/globals.css`. No new identity.

Unresolved: password reset and resending the confirmation email are not built. Affiliation verification is not open yet, and the dashboard says so.

## Direction contract

THESIS: An account screen is a checkpoint with one task. One column, nothing beside the form. It refuses the split-screen marketing panel and the floating card on a tinted backdrop.

OWN-WORLD: IIUC green on white (mint on near-black green in dark), system sans, 1px green-grey hairlines, 12px corners, no shadows. Green appears only on the primary action, links, focus and the completed-step marker.

STORY: The visitor learns that an account is step one and verification is what earns membership. They create the account, confirm their email, and see exactly which step they are on.

FIRST VIEWPORT: Wordmark top left, linking home. Heading at 30px. Email and password fields full width, at least 44px tall. Full-width primary button, then the link to the other form. On the dashboard: the status as a plain sentence in the heading position, then the verification steps as an ordered list with the current step marked.

FORM: single-column form page and a status ladder; seed: none (pinned) "sign-up and sign-in forms, and a signed-in dashboard showing verification status".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
