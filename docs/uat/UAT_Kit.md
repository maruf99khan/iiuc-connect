# IIUC Connect — User Acceptance Test (UAT) Kit

For Report Chapter 6 (usability) and Appendix D. Sessions: 30 Nov to 2 Dec 2026. Target: 10 participants (5 current students, 5 alumni). Seed for RQ4 ("usability of verification and mentorship").

**Status:** drafted 25 Nov 2026. Not yet run. The consent wording has not been seen by the supervisor, and whether IIUC needs an ethics sign-off is still an open question (Build_State, "Waiting on the team"). Do not recruit until both are answered.

## 1. What this measures

| Measure | How | Why |
|---|---|---|
| Task completion | Observer marks each task: 2 = alone, 1 = after a hint, 0 = failed or gave up | Master File section 10 |
| Time on task | Observer's stopwatch, start when the participant begins reading the task card, stop when they say "done" or the cap is hit | Same |
| Errors and confusion | Observer notes wrong clicks, hesitations over 10 seconds, quotes | Finds what to fix |
| SUS | 10-item System Usability Scale after the tasks (section 5) | Same |

Limits to state in the report: ten people recruited by the authors are not a random sample; SUS from ten people has a wide margin; tasks run on fictional data on a free-tier site; the observers are the builders, which biases toward kindness.

## 2. Before each session (observer, 15 minutes)

1. Deployed site `https://iiuc-connect.vercel.app` is up (open `/sign-in`).
2. Demo data is loaded (`supabase/demo/demo_data.sql`): six members, two mentors with open slots, five jobs.
3. One **pre-made, already verified** test account per participant, student or alumni to match them (see decision D-030). Create it before the session, write the email and a one-time password on the participant's card, and delete the account after the session. Never ask a participant for their real password.
4. One signed-in admin window for the observer, to approve the verification claim in task V. Because the pre-made accounts are already verified, task V needs one extra account that is **not** yet verified (a "fresh" account per participant is simplest: seed it confirmed but unverified, like the e2e accounts in README "Browser checks").
5. A free mentor slot exists for the student tasks (demo mentors have slots for the next 14 days).
6. Printed or on-screen: this kit's consent form, task cards, SUS form. A phone or laptop for the participant. Prefer the participant's own phone, since the product is mobile-first.
7. Stopwatch. Observer sheet (one per participant, section 4).

If Supabase confirmation emails still link to localhost (Site URL unset), do not give a sign-up task; the pre-made accounts avoid it.

## 3. Script

Read aloud, keep it short.

1. **Welcome (2 min).** "Thank you. We are testing the website, not you. Nothing you do is wrong; if something is confusing, that is our fault, and that is what we need to find out. You can stop at any time."
2. **Consent (3 min).** Hand over the consent form (section 6). Wait for a signature. Answer questions. Do not continue without it.
3. **Background (1 min).** Student or alumni, department, how often they use LinkedIn or Facebook groups to find seniors or jobs. Write on the observer sheet.
4. **Tasks (20 to 25 min).** Hand over one task card at a time. Say: "Please think aloud while you do this. I will not help unless you are stuck for more than two minutes; then I will give a hint and write it down." Cap each task at its limit; at the cap say "let's move on" and mark 0.
5. **SUS (3 min).** Hand over section 5. "Answer quickly, first reaction."
6. **Debrief (4 min).** Ask the three questions in section 7. Thank them.

Total about 35 to 40 minutes.

## 4. Tasks and observer sheet

Task cards use plain words and never the names of buttons. The person reads the card; the observer does not explain how.

### Everyone

| # | Card text | Success means | Cap |
|---|---|---|---|
| V | "You have just joined and want the site to know you are from IIUC. Do whatever the site asks so that your account becomes verified." (observer approves the claim in the admin window when it is submitted) | Claim submitted with a document; observer sees it in the admin queue | 5 min |
| D | "Find a person who works in software and has experience with Python." Observer then says "now search for the same thing again, but type it however you normally would" and records whether the participant misspells it | Opens a profile of a person who lists Python | 3 min |
| P | "You do not want strangers outside IIUC to see your profile. Change who can see it." | Visibility changed and saved | 3 min |

### Students (T1 to T3 on the sheet)

| # | Card text | Success means | Cap |
|---|---|---|---|
| S1 | "You want career advice from a graduate. Ask one of them for a session." | Request sent for a free slot | 5 min |
| S2 | "Find out whether they answered." (observer accepts or declines the request from the mentor demo account) | Finds the answer on the sessions page or in notifications | 3 min |
| S3 | "Find a job that suits you and apply with a short message." | Application sent | 5 min |

### Alumni (T1 to T3 on the sheet)

| # | Card text | Success means | Cap |
|---|---|---|---|
| A1 | "You are willing to mentor students. Set yourself up so that students can book time with you on weekday evenings." | Mentor profile and a weekly availability rule saved | 5 min |
| A2 | "A student has asked for a session. Reply to them and make it happen." (observer sends a request beforehand) | Request accepted with a meeting link, or declined | 4 min |
| A3 | "Your company is hiring a junior developer. Post the job." | Job visible on the jobs board | 5 min |

### Observer sheet (one per participant)

```
Participant ID: P__   Date: ____   Role: student / alumni   Department: ______
Device: phone / laptop   Browser: ______   Observer: ______
Uses LinkedIn/Facebook to find seniors or jobs: never / sometimes / often

Task | Score (0/1/2) | Seconds | Hint given? | Errors / hesitations / quotes
V    |               |         |             |
D    |               |         |             |  misspelled the search? Y/N  found after typo? Y/N
P    |               |         |             |
T1   |               |         |             |  (S1 or A1)
T2   |               |         |             |  (S2 or A2)
T3   |               |         |             |  (S3 or A3)

SUS total (from sus_score.py): ____
Bugs found (what, where, severity): 
Top thing that confused them:
Top thing they liked:
```

Severity: 3 blocks the task, 2 slows or confuses, 1 cosmetic. Fix severity 3 before the next participant if it takes under an hour. Log every bug in `Dev_Journal.md`; fix only bugs, no new features (feature freeze is 29 Nov).

## 5. SUS questionnaire

Hand this over with the word "system" replaced by "website". Each item is 1 (strongly disagree) to 5 (strongly agree).

1. I think that I would like to use this website frequently.
2. I found the website unnecessarily complex.
3. I thought the website was easy to use.
4. I think that I would need the support of a technical person to be able to use this website.
5. I found the various functions in this website were well integrated.
6. I thought there was too much inconsistency in this website.
7. I would imagine that most people would learn to use this website very quickly.
8. I found the website very cumbersome to use.
9. I felt very confident using the website.
10. I needed to learn a lot of things before I could get going with this website.

Scoring is in `sus_score.py`: odd items score minus 1, even items 5 minus the answer, sum times 2.5, giving 0 to 100. A score near 68 is the commonly cited average; report the mean, the range and n, and do not call the result "good" or "bad" from ten people.

## 6. Consent form

> **Title:** Usability study of IIUC Connect
> **Researchers:** Maruf Khan and Md Minhajul Alam, Department of CSE, International Islamic University Chittagong. Supervisor: Jamil As-ad.
>
> **What this is.** We built a website for IIUC students and alumni to find each other, arrange mentoring sessions and see jobs. For our undergraduate thesis we want to see whether people can use it. You will do about six short tasks on the website, fill in a 10-question form, and answer three questions. It takes about 40 minutes.
>
> **What we record.** Your role (student or alumni), department, how long each task took, whether you finished it, what you said while doing it, and your answers on the form. We give you a code (for example P03) and do not write your name on any of these. This signature page is the only place your name appears, and it is kept apart from the results.
>
> **The website.** You will use a test account and fictional data. Please do not type any real personal details, password or ID number into the website.
>
> **Your choice.** Taking part is voluntary. You can stop at any time or skip any question, without giving a reason and without any effect on your studies or standing. If you stop, we delete your results.
>
> **Use of results.** Combined results and short unnamed quotes may appear in our thesis, and the thesis may be kept in the university library. We will not publish anything that identifies you. We do not audio or video record unless you tick the box below.
>
> **Data.** Paper forms are kept by the researchers and typed into a spreadsheet by participant code. Test accounts are deleted after your session. Results are kept until the thesis is assessed, then deleted unless the university requires otherwise. *(Retention wording to be confirmed with the supervisor.)*
>
> **Questions.** Ask the researchers now, or later at the address on the thesis cover page. *(Insert a contact the researchers are happy to publish; do not use a personal email without checking.)*
>
> ☐ I have read this form and understand it. I agree to take part.
> ☐ I agree to a screen recording of my session (optional; tick only if you agree).
>
> Name: ________________  Signature: ____________  Date: ________
> Researcher: ____________  Signature: ____________  Participant code: P__

Offer a Bangla version if a participant prefers one; the authors translate and the supervisor checks it before use (not yet written).

## 7. Debrief questions

1. What was the most confusing part?
2. What did you like?
3. Would you use this instead of the Facebook or WhatsApp groups you use now? Why or why not?

## 8. After the sessions

1. Type observer sheets into `results_template.csv` (copy it to `results.csv`; the codes are anonymous, but keep the file out of git until the supervisor has said what may be stored).
2. Run `python docs/uat/sus_score.py docs/uat/results.csv`.
3. Report: completion rate per task (share scored 2, share scored 1 or 2), median time per task, mean and range of SUS, list of bugs by severity with what was fixed, quotes. Say how many of the ten were students and how many alumni.
4. Save the evidence in `docs/evidence/` and update `Requirements.md` (R-VER-01, R-MEN-01, R-MEN-02) and `Build_State.md`.
5. Delete every test account created for the sessions.
