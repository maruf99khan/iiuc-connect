# IIUC Connect — Report Plan

Updated: 2026-11-16. The outline below is the one the team supplied, adjusted to match what is actually being built. If the department has an official template, it overrides the layout; the content mapping stays.

## Outline

### Front matter
Title Page · Declaration of Originality · Supervisor Approval Page · Abstract (250–300 words) · Acknowledgements · Table of Contents · List of Figures · List of Tables · List of Abbreviations

### Chapter 1: Introduction
1.1 Background and Motivation
1.2 Problem Statement
1.3 Project Objectives and Research Questions
1.4 Scope and Limitations
1.5 Significance of the Work
1.6 Report Organization

### Chapter 2: Literature Review
2.1 Graduate Unemployment in Bangladesh
2.2 Alumni Engagement Platforms — Global Survey
2.3 Existing Solutions in Bangladesh (DUNITE, Facebook groups)
2.4 Identity Verification and Trust in Online Communities *(added)*
2.5 Mentorship Platforms *(added)*
2.6 People Search and Database-Level Authorization *(added)*
2.7 Mobile Web for Low-Bandwidth Users *(added)*
2.8 Identified Gaps
2.9 Summary and Positioning of IIUC Connect

### Chapter 3: Requirements Analysis
3.1 Stakeholder Analysis
3.2 User Personas
3.3 Functional Requirements (by module, with IDs)
3.4 Non-Functional Requirements (performance, security, mobile, cost)
3.5 Use Case Diagrams
3.6 Requirements Traceability Matrix

### Chapter 4: System Design
4.1 System Architecture Overview
4.2 Technology Stack Justification (including the zero-cost constraint)
4.3 Database Design (ER diagram, tables, relationships)
4.4 Data Access Design: Server Actions, route handlers, authentication flow *(was "API Design")*
4.5 Security Architecture (RLS, OTP, verification layers, privilege protection)
4.6 State Machines: verification and mentorship *(added)*
4.7 UI/UX Design Decisions (mobile-first, PWA rationale)
4.8 Deployment Architecture (Vercel, Supabase)

### Chapter 5: Implementation
5.1 Development Methodology (Agile sprints; why not Waterfall)
5.2 Sprint-by-Sprint Implementation Log (5.2.1 to 5.2.12, one per sprint)
5.3 Key Technical Challenges and How They Were Solved
5.4 Notable Logic
 5.4.1 Verification state machine (OTP → institutional mailbox or document → vouching)
 5.4.2 Search and ranking (weighted full-text search, trigram matching)
 5.4.3 Mentorship booking logic (request limits, slot integrity, expiry, double-blind feedback)
 5.4.4 Privacy logic (row visibility and the private-fields table)
5.5 Code Architecture Decisions

### Chapter 6: Testing and Quality Assurance
6.1 Testing Strategy
6.2 Unit Tests
6.3 Integration and End-to-End Tests
6.4 User Acceptance Testing
6.5 Security Testing (RLS denial, privilege escalation, enumeration, storage access)
6.6 Performance Testing (page load on throttled 3G, search latency, load)
6.7 Search Relevance Evaluation (precision@10) *(added)*
6.8 Test Results Summary
6.9 Known Issues and Limitations

### Chapter 7: Evaluation and Discussion
7.1 Achievement of Objectives
7.2 Comparison with DUNITE and Other Systems
7.3 User Feedback (SUS and open responses)
7.4 Pilot Usage Metrics *(was "Platform Metrics at Launch")*
7.5 Limitations and Future Work

### Chapter 8: Conclusion
8.1 Summary of Contributions
8.2 Research Questions Answered
8.3 Recommendations for Deployment and Scaling (paid-tier upgrade path)

### References
IEEE, consistently, unless the department requires APA.

### Appendices
A: Full Database Schema (SQL)
B: Server Actions and Route Handlers Reference; RLS Policies
C: UI Wireframes and Screenshots
D: UAT Script, SUS Questionnaire, Consent Form, Results
E: Sprint Plan, Planned-versus-Actual Chart
F: Decision Log
G: GitHub Commit History Summary
H: Development Journal Extract
I: Test Outputs

## Why the outline was changed

| Change | Reason |
|---|---|
| Four sections added to Chapter 2 | The original reviewed only unemployment and alumni platforms. The thesis claims are about verification, authorization, search and mentorship, and each needs literature behind it. |
| "API Design" renamed | The app uses Server Actions; there are only a few HTTP endpoints. Describing a REST API that does not exist would be inaccurate. |
| Typesense removed from 4.7, 5.4.2, 6.6 | Search runs in PostgreSQL (D-009). |
| "Mentorship Matching Logic" → "booking logic" | There is no matching algorithm. Students choose mentors by filter. Claiming matching would not survive a question from the panel. |
| "Per-field visibility" reworded | Privacy is by row visibility plus a private table (D-008). |
| "Platform Metrics at Launch" → "Pilot Usage Metrics" | There will be no public launch before 5 December. Numbers come from the UAT pilot only and are reported as such. |
| "Burndown Charts" → planned-versus-actual chart | Built from real dates in `Build_State.md`. |
| Sections 4.6 and 6.7 added | State machines and search evaluation are core evidence for claims 1, 3 and 4. |

## Suggested research questions (1.3)

Each is answerable by a measurement in Chapter 6.

- RQ1: Can multi-role access control for a university network be enforced entirely at the database layer, and verified by automated denial tests?
- RQ2: How well does search built inside PostgreSQL find people by name, skill and affiliation, measured by precision@10 and latency?
- RQ3: Can a complete, usable alumni platform be delivered on free infrastructure, and what limits does that impose?
- RQ4: How usable do IIUC students and alumni find the verification and mentorship flows (SUS, task completion)?

## Evidence each chapter needs, and when it is captured

| Chapter | Evidence | When |
|---|---|---|
| 1 | Verified statistics with page numbers; dated screenshot of IIUC's current alumni page | Sprints 1–2 |
| 2 | Audited `Bibliography.md`; feature comparison table | Sprints 1–4 |
| 3 | Requirements with IDs that Chapter 6 tests trace back to | Sprints 3–5 |
| 4 | Diagrams generated from the real schema | As each module lands |
| 5 | Sprint log from `Dev_Journal.md`; code excerpts; screenshots at 375 px and desktop | As each module lands |
| 6 | pgTAP output; advisor reports; query set with relevance judgments; Lighthouse reports; k6 summary; UAT sheets; SUS scores; consent forms | Sprints 11–12 |
| 7 | Traceability table: objective → requirement → test → result | Sprint 12 |
| 8 | Deferred-features list | Sprint 12 |

## Evidence rules

1. Every reported test run is saved as a file in `docs/evidence/` in the repo, dated.
2. Every screen is screenshotted at 375 px and desktop width the day it is finished.
3. Every measurement records its conditions: device profile, network throttle, data size, date.
4. Every problem goes into `Dev_Journal.md` the day it happens.
5. Planned and actual dates are tracked in `Build_State.md`.
6. Small, descriptive commits under each member's own account.

## Writing principles

- Each chapter opens by saying what it covers and closes by linking to the next.
- Every design choice is stated with its reason and the rejected alternative.
- Every objective in Chapter 1 has a matching measurement in Chapter 6.
- Numbers go in tables; one sentence under each says what it shows.
- Every figure and table is numbered, captioned and referred to in the text.
- Limitations are stated plainly.
- No source is cited that a team member has not opened.
- Dates and durations are reported as they happened.

## Open questions for the supervisor

- Is there an official department template, and is this outline acceptable?
- IEEE or APA?
- Pre-defense: full report or progress report? Demo expected?
- What is the department's rule on using AI tools in thesis work, and how should it be acknowledged?
- Is ethics sign-off needed for the user study?

## Slide outline for pre-defense

Problem → gap → objectives → architecture → verification model → authorization and tests → search → mentorship flow → demo → evaluation results → limitations → future work → planned-versus-actual timeline
