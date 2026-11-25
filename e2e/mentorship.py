"""End-to-end check of the mentorship flow (Sprint 6) against the dev server.

Seed first (see README "Browser checks"): four accounts e2e-mentor, e2e-student1,
e2e-student2 and e2e-private @example.com, verified, with mentor profiles for the
two graduates. Two steps need SQL run by hand; the script prints NEED_SQL and
waits for the marker file named in the message.

  expiry:   update public.mentorship_requests set expires_at = now() - interval '1 minute'
              where status = 'pending';
            select private.expire_requests();
  session:  alter table public.sessions disable trigger sessions_before_update;
            update public.sessions set starts_at = now() - interval '2 hours'
              where status = 'scheduled';
            alter table public.sessions enable trigger sessions_before_update;
"""
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
MENTOR = ("e2e-mentor@example.com", "Mentor-Throwaway-6103!")
S1 = ("e2e-student1@example.com", "Student1-Throwaway-6103!")
S2 = ("e2e-student2@example.com", "Student2-Throwaway-6103!")
PRIVATE = ("e2e-private@example.com", "Private-Throwaway-6103!")
LINK = "https://meet.example.com/e2e-room"
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "shots"
OUT.mkdir(exist_ok=True)
results = []
env = dict(
    l.strip().split("=", 1)
    for l in open(ROOT.parent / ".env.local", encoding="utf-8")
    if "=" in l and not l.startswith("#")
)
SB_URL, SB_KEY = env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + str(detail)) if detail else "", flush=True)


def api(method, path, token=None, body=None):
    h = {"apikey": SB_KEY, "Content-Type": "application/json", "Prefer": "return=representation"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        SB_URL + path, method=method, headers=h,
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def token_for(c):
    s, b = api("POST", "/auth/v1/token?grant_type=password", body={"email": c[0], "password": c[1]})
    assert s == 200, (s, b)
    return b["access_token"]


def wait_marker(name, minutes=10):
    marker = ROOT / f"{name}.done"
    marker.unlink(missing_ok=True)
    print(f"NEED_SQL {name}: run the SQL for this step, then create {marker}", flush=True)
    end = time.time() + minutes * 60
    while time.time() < end:
        if marker.exists():
            marker.unlink()
            return
        time.sleep(2)
    raise SystemExit(f"timed out waiting for {marker}")


def sign_in(page, c):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(c[0])
    f.locator('input[name="password"]').fill(c[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=30000)
    page.get_by_role("heading", level=1).wait_for(timeout=15000)


def open_sessions(page):
    page.goto(f"{BASE}/sessions")
    page.get_by_role("heading", level=1, name="Sessions").wait_for(timeout=30000)
    page.wait_for_timeout(1200)


def form_with(page, label):
    return page.locator("main form").filter(has=page.get_by_label(label)).first


def open_member(page, mentor_id):
    page.goto(f"{BASE}/members/{mentor_id}")
    page.get_by_role("heading", level=1).wait_for(timeout=30000)
    page.wait_for_timeout(1200)
    return page.locator('section[aria-labelledby="request-heading"] ul > li')


def request_slot(page, index, goal, q1, q2=None):
    li = page.locator('section[aria-labelledby="request-heading"] ul > li').nth(index)
    if li.locator("details[open]").count() == 0:
        li.locator("summary").click()
    li.get_by_label("What do you want from this session?").fill(goal)
    li.get_by_label("Your first question").fill(q1)
    if q2:
        li.get_by_label("A second question (optional)").fill(q2)
    li.get_by_role("button", name="Request this session").click()
    return li


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(scheme="light"):
        c = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme=scheme)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return pg

    mtoken = token_for(MENTOR)
    s, rows = api("GET", "/rest/v1/profiles?select=id,full_name", mtoken)
    ids = {r["full_name"]: r["id"] for r in rows}
    mentor_id = ids["Mia Mentor"]

    # 1. Weekly windows and generated slots
    m = new_ctx()
    sign_in(m, MENTOR)
    open_sessions(m)
    check("mentor sees the weekly availability section", m.get_by_role("heading", name="Weekly availability").is_visible())
    for day, value in (("Sunday", "0"), ("Monday", "1")):
        f = form_with(m, "Day")
        f.get_by_label("Day").select_option(value)
        f.get_by_label("From").select_option("09:00")
        f.get_by_label("To").select_option("11:00")
        f.get_by_role("button", name="Add this window").click()
        m.wait_for_url(re.compile(r"rule=1"), timeout=30000)
        m.get_by_text("Window added.").wait_for(timeout=15000)
        m.wait_for_timeout(800)
    s, open_slots = api("GET", "/rest/v1/mentor_slots?select=id&status=eq.open", mtoken)
    check("adding windows confirms and generates open slots", s == 200 and len(open_slots) > 0, f"{len(open_slots) if s == 200 else s} open slots")

    # 2. A window ending before it starts
    f = form_with(m, "Day")
    f.get_by_label("Day").select_option("2")
    f.get_by_label("From").select_option("11:00")
    f.get_by_label("To").select_option("09:00")
    f.get_by_role("button", name="Add this window").click()
    err = m.locator("main form p[id$='-error']").first
    err.wait_for(timeout=20000)
    s, rules = api("GET", "/rest/v1/mentor_availability_rules?select=id", mtoken)
    check("a window ending before its start is refused and adds nothing", "after the start" in err.inner_text() and len(rules) == 2, err.inner_text())

    # 3. Mentor profile: a cap of 0 is refused, 3 is saved
    f = form_with(m, "Most sessions per week")
    f.get_by_label("Most sessions per week").evaluate(
        "el => { const o = document.createElement('option'); o.value = '0'; o.text = '0'; el.add(o); el.value = '0'; }"
    )
    f.get_by_role("button", name="Save mentor profile").click()
    err = f.locator("p[id$='-error']").first
    err.wait_for(timeout=20000)
    check("a weekly cap of 0 is refused", "1 to 10" in err.inner_text(), err.inner_text())
    f.get_by_label("Most sessions per week").select_option("3")
    f.get_by_role("button", name="Save mentor profile").click()
    m.wait_for_url(re.compile(r"saved=1"), timeout=30000)
    check("a valid mentor profile saves", m.get_by_text("Mentor profile saved.").is_visible())
    m.screenshot(path=str(OUT / "mentorship-mentor-mobile-light.png"), full_page=True)

    # 4. Student 1 requests a slot
    a = new_ctx()
    sign_in(a, S1)
    lis = open_member(a, mentor_id)
    before = lis.count()
    check("a graduate's page lists open times to request", a.get_by_role("heading", name="Request a session").is_visible() and before > 1, f"{before} times")
    lis.first.locator("summary").click()
    a.screenshot(path=str(OUT / "mentorship-request-form-mobile-light.png"), full_page=True)
    li = request_slot(a, 0, "short", "What should I learn first?")
    err = li.locator("p[id$='-error']").first
    err.wait_for(timeout=20000)
    check("a goal that is too short shows the field error", "at least 10" in err.inner_text(), err.inner_text())
    li.get_by_label("What do you want from this session?").fill("I want to move into backend work.")
    li.get_by_role("button", name="Request this session").click()
    a.wait_for_url(re.compile(r"requested=1"), timeout=30000)
    a.get_by_text("Request sent.").wait_for(timeout=15000)
    check("a valid request redirects and confirms", "Request sent." in a.inner_text("main"))
    a.screenshot(path=str(OUT / "mentorship-student-mobile-light.png"), full_page=True)

    # 5. A second request to the same mentor while one is pending
    lis = open_member(a, mentor_id)
    request_slot(a, 0, "A second request for the same mentor.", "Is this allowed?")
    a.locator("main form p[role='alert']").first.wait_for(timeout=20000)
    msg = a.locator("main form p[role='alert']").first.inner_text()
    s1token = token_for(S1)
    s, mine = api("GET", "/rest/v1/mentorship_requests?select=id&status=eq.pending", s1token)
    check("a second pending request to the same mentor is refused", len(mine) == 1, msg)

    # 6. Student 2: smaller list, no access to others' data
    b = new_ctx()
    sign_in(b, S2)
    lis2 = open_member(b, mentor_id)
    check("another member sees one fewer open time", lis2.count() == before - 1, f"{lis2.count()} vs {before}")
    s2token = token_for(S2)
    s, reqs = api("GET", "/rest/v1/mentorship_requests?select=id", s2token)
    check("API: another member cannot read the mentor's requests", s == 200 and reqs == [], str(reqs))
    ptoken = token_for(PRIVATE)
    s, pslots = api("GET", "/rest/v1/mentor_slots?select=id&status=eq.open&limit=1", ptoken)
    s, bad = api("POST", "/rest/v1/mentorship_requests", s2token, {
        "slot_id": pslots[0]["id"], "duration_minutes": 20,
        "goal": "Trying a private mentor's slot.", "question_1": "Can I get in?",
    })
    check("API: a private graduate's slot cannot be requested", s in (401, 403), str(s))

    # 7. Mentor answers: http refused, https accepted
    open_sessions(m)
    body = m.inner_text("main")
    check("the mentor sees the goal and the first question", "I want to move into backend work." in body and "What should I learn first?" in body)
    rf = form_with(m, "Meeting link")
    rf.get_by_label("Meeting link").fill("http://meet.example.com/x")
    rf.get_by_role("button", name="Accept").click()
    err = rf.locator("p[id$='-error']").first
    err.wait_for(timeout=20000)
    check("accepting with an http link shows the field error", "https://" in err.inner_text(), err.inner_text())
    rf.get_by_label("Meeting link").fill(LINK)
    rf.get_by_role("button", name="Accept").click()
    m.wait_for_url(re.compile(r"accepted=1"), timeout=30000)
    check("accepting with an https link redirects and confirms", "Request accepted." in m.inner_text("main"))

    # 8. Student 1 sees the link, student 2 sees no sessions
    open_sessions(a)
    link = a.get_by_role("link", name=re.compile("Join the meeting")).first
    check("the mentee sees the link, opening safely", link.get_attribute("href") == LINK and "noopener" in (link.get_attribute("rel") or "") and link.get_attribute("target") == "_blank")
    s, hid = api("GET", "/rest/v1/sessions?select=id", s2token)
    check("API: another member reads no sessions", s == 200 and hid == [], str(hid))

    # 9. Student 1 cancels; the slot opens again
    s, rq = api("GET", "/rest/v1/mentorship_requests?select=id,slot_id&status=eq.accepted", s1token)
    slot_id = rq[0]["slot_id"]
    a.get_by_role("button", name="Cancel session").first.click()
    a.wait_for_url(re.compile(r"cancelled=1"), timeout=30000)
    s, sl = api("GET", f"/rest/v1/mentor_slots?select=status&id=eq.{slot_id}", mtoken)
    check("cancelling reopens the slot and removes the link", sl and sl[0]["status"] == "open" and a.get_by_role("link", name=re.compile("Join the meeting")).count() == 0, str(sl))

    # 10. Request again, mentor declines
    open_member(a, mentor_id)
    request_slot(a, 0, "Trying again after cancelling.", "Another time then?")
    a.wait_for_url(re.compile(r"requested=1"), timeout=30000)
    open_sessions(m)
    rf = form_with(m, "Meeting link")
    rf.get_by_role("button", name="Decline").click()
    m.wait_for_url(re.compile(r"declined=1"), timeout=30000)
    open_sessions(a)
    check("a declined request shows as declined", "Declined" in a.inner_text("main"))

    # A third request, accepted, becomes the session used for closing and rating
    open_member(a, mentor_id)
    request_slot(a, 0, "A request that will be accepted.", "What is your daily routine?")
    a.wait_for_url(re.compile(r"requested=1"), timeout=30000)
    open_sessions(m)
    rf = form_with(m, "Meeting link")
    rf.get_by_label("Meeting link").fill(LINK)
    rf.get_by_role("button", name="Accept").click()
    m.wait_for_url(re.compile(r"accepted=1"), timeout=30000)

    # 11. Expiry (SQL by hand)
    open_member(b, mentor_id)
    request_slot(b, 0, "A request that will expire.", "Will anyone answer?")
    b.wait_for_url(re.compile(r"requested=1"), timeout=30000)
    wait_marker("expiry")
    open_sessions(b)
    check("an unanswered request expires", "Expired" in b.inner_text("main"))
    lis2 = open_member(b, mentor_id)
    check("the expired request's slot is open again", lis2.count() >= 1, f"{lis2.count()} times")

    # 12. Close and rate (SQL by hand moves the session into the past)
    wait_marker("session")
    open_sessions(m)
    check("after the session the mentor sees both outcome buttons", m.get_by_role("button", name="Mark completed").count() >= 1 and m.get_by_role("button", name="Mark no-show").count() >= 1)
    m.get_by_role("button", name="Mark completed").first.click()
    m.wait_for_url(re.compile(r"closed=1"), timeout=30000)
    open_sessions(a)
    fb = form_with(a, "A short comment (optional)")
    fb.get_by_label("5", exact=True).check()
    fb.get_by_role("button", name="Send rating").click()
    a.wait_for_url(re.compile(r"rated=1"), timeout=30000)
    open_sessions(m)
    check("blind rating: the mentor does not yet see the student's rating", "Their rating: 5" not in m.inner_text("main"))
    fb = form_with(m, "A short comment (optional)")
    fb.get_by_label("4", exact=True).check()
    fb.get_by_role("button", name="Send rating").click()
    m.wait_for_url(re.compile(r"rated=1"), timeout=30000)
    open_sessions(m)
    open_sessions(a)
    check("after both rate, each sees the other's rating", "Their rating: 5" in m.inner_text("main") and "Their rating: 4" in a.inner_text("main"))

    # 13. Dark screenshots
    d = new_ctx("dark")
    sign_in(d, MENTOR)
    open_sessions(d)
    d.screenshot(path=str(OUT / "mentorship-mentor-mobile-dark.png"), full_page=True)
    open_sessions(a)
    a.screenshot(path=str(OUT / "mentorship-student-sessions-mobile-light.png"), full_page=True)

    real = [x for x in errors if "Failed to load resource" not in x]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "mentorship_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
