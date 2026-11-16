# Product

<!-- impeccable:product-schema 1 -->

> Status: drafted from the repository on 2026-11-16 without an interview.
> Lines marked (inferred) are not confirmed by the project owners. Correct
> them here; design work reads this file as product truth.

## Platform

web

## Users

- IIUC students looking for alumni in their field, department or city. (inferred from the landing page copy)
- IIUC alumni who want to be findable by, and useful to, students and each other. (inferred)
- Admins who review affiliation claims and identity documents. (from the database schema)
- Most use is expected on phones over slow mobile data in Bangladesh. (inferred from the system-font comment in `app/globals.css`)

## Product Purpose

A verified alumni and professional network for International Islamic University Chittagong. It exists so that a member can trust that the person they find is really an IIUC student or graduate. It is a CSE undergraduate thesis project by Maruf Khan and Md Minhajul Alam, supervised by Jamil As-ad.

## Positioning

Membership is verified against IIUC affiliation, by institutional email or by a reviewed document, and every change of verification status is written to an append-only audit log. Authorization is enforced in the database with Row Level Security, not in the interface.

## Operating Context

- Verification states: unverified, email verified, affiliation pending, verified student, verified alumni, trusted member.
- Profile visibility: public, IIUC community, private.
- Everything runs on free tiers (Vercel, Supabase).

## Capabilities and Constraints

- Built: identity schema with RLS; email and password accounts.
- Planned, per the landing page: search by name, skill, department, batch and city; short mentorship sessions of 15 to 30 minutes.
- Undecided: the sprint plan and decision log live outside this repository and have not been imported.
- No font downloads; system fonts only, for slow connections.

## Brand Commitments

- Name: IIUC Connect.
- Green brand colour (`#0f5132`) and system typefaces, already in `app/globals.css`.
- No logo or other brand assets exist in the repository.

## Evidence on Hand

- No testimonials, member counts, photographs or partner logos. Do not invent any.
- Test and audit output for the thesis report is kept in `docs/evidence/`.

## Product Principles

1. Trust is earned by verification, and the interface never claims more than the database enforces.
2. Private by default: sensitive fields are visible only to their owner and admins.
3. Works on a cheap phone and a slow connection.
4. State things plainly; a thesis examiner and a first-year student should both understand every screen.

## Accessibility & Inclusion

No standard has been set by the owners. Work so far targets WCAG 2.2 AA. (inferred)
