"""End-to-end check of Sprint 5 (mentorship sessions) against the dev server."""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
MENTOR = ("e2e-mentor@example.com", "Mentor-Throwaway-6103!")
S1 = ("e2e-student1@example.com", "Student1-Throwaway-6103!")
S2 = ("e2e-student2@example.com", "Student2-Throwaway-6103!")
LINK = "https://meet.example.com/e2e-room-one"
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
ROOT = pathlib.Path(__file__).resolve().parent
results = []
env = dict(l.strip().split("=", 1) for l in open(str(__import__("pathlib").Path(__file__).resolve().parents[1] / ".env.local"), encoding="utf-8") if "=" in l and not l.startswith("#"))
SB_URL, SB_KEY = env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + str(detail)) if detail else "")


def api(method, path, token=None, body=None):
    h = {"apikey": SB_KEY, "Content-Type": "application/json", "Prefer": "return=representation"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(SB_URL + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
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


def dhaka_now():
    return dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6)


def dhaka_local(days, hour, minute=0):
    return (dhaka_now() + dt.timedelta(days=days)).strftime(f"%Y-%m-%dT{hour:02d}:{minute:02d}")


def sign_in(page, c):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(c[0])
    f.locator('input[name="password"]').fill(c[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
    page.get_by_role("heading", level=1).wait_for(timeout=10000)


def offer(page, starts, duration, topic, link):
    f = page.locator("main form:visible").last
    f.get_by_label("Date and time (Bangladesh time)").fill(starts)
    f.get_by_label("Length").select_option(duration)
    f.get_by_label("What can you help with?").fill(topic)
    f.get_by_label("Meeting link").fill(link)
    f.get_by_role("button", name="Add this slot").click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(w=375, h=812, scheme="light", mobile=True):
        c = browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, color_scheme=scheme)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return c, pg

    mtoken = token_for(MENTOR)
    s, rows = api("GET", "/rest/v1/profiles?select=id,full_name", mtoken)
    ids = {r["full_name"]: r["id"] for r in rows}

    _, m = new_ctx()
    sign_in(m, MENTOR)
    m.goto(f"{BASE}/sessions")
    m.get_by_role("heading", name="Your availability").wait_for()
    m.wait_for_timeout(1500)
    check("the sessions page links from the nav", m.get_by_role("navigation", name="Main").get_by_role("link", name="Sessions").is_visible())
    m.screenshot(path=str(OUT / "sessions-mentor-empty-mobile-light.png"), full_page=True)

    # Validation
    offer(m, dhaka_local(-1, 10), "30", "Past slot", LINK)
    e = m.locator("main form:visible p[id$='-error']").first
    e.wait_for(timeout=15000)
    check("a slot in the past is refused", "at least 30 minutes" in e.inner_text(), e.inner_text())
    m.wait_for_timeout(800)
    offer(m, dhaka_local(2, 15), "30", "Bad link", "http://meet.example.com/x")
    e2 = m.locator("main form:visible p[id$='-error']").filter(has_text="https").first
    e2.wait_for(timeout=15000)
    check("a meeting link without https is refused", True, e2.inner_text())

    # A good slot, and a second one
    m.wait_for_timeout(800)
    offer(m, dhaka_local(2, 15), "30", "Getting your first backend job", LINK)
    m.wait_for_url(re.compile(r"added=1"), timeout=25000)
    m.get_by_text("Slot added.").wait_for(timeout=15000)
    body = m.inner_text("main")
    check("adding a slot confirms it", "Slot added." in body)
    check("the slot is listed in Bangladesh time", re.search(r"3:00\s?pm", body, re.I) is not None, body[body.find("Your availability"):][:120].replace(chr(10), " "))
    m.wait_for_timeout(1000)
    offer(m, dhaka_local(3, 11), "15", "CV review", "https://meet.example.com/e2e-room-two")
    m.wait_for_url(re.compile(r"added=1"), timeout=25000)
    m.screenshot(path=str(OUT / "sessions-mentor-slots-mobile-light.png"), full_page=True)

    s, slots = api("GET", "/rest/v1/mentor_slots?select=starts_at,topic&topic=eq.Getting%20your%20first%20backend%20job", mtoken)
    check("15:00 Bangladesh time is stored as 09:00 UTC", s == 200 and len(slots) == 1 and "T09:00:00" in slots[0]["starts_at"], str(slots))

    # Student 1 finds the mentor and books
    _, a = new_ctx()
    sign_in(a, S1)
    a.goto(f"{BASE}/members/{ids['Mia Mentor']}")
    a.get_by_role("heading", level=1).wait_for()
    a.wait_for_timeout(1500)
    check("a graduate's page lists open slots to book", a.get_by_role("heading", name="Book a session").is_visible() and a.locator("main section ul li").count() == 2, str(a.locator("main section ul li").count()))
    a.screenshot(path=str(OUT / "member-book-mobile-light.png"), full_page=True)
    first = a.locator("main section ul li").first
    first.get_by_label("A short message (optional)").fill("I want to move into backend work.")
    first.get_by_role("button", name="Book this session").click()
    a.wait_for_url(re.compile(r"booked=1"), timeout=25000)
    a.get_by_text("Session booked.").wait_for(timeout=15000)
    abody = a.inner_text("main")
    check("booking confirms and shows the session", "Session booked." in abody and "Getting your first backend job" in abody)
    link = a.get_by_role("link", name=re.compile("Join the meeting"))
    check("the booker sees the meeting link, opening safely", link.get_attribute("href") == LINK and "noopener" in link.get_attribute("rel") and link.get_attribute("target") == "_blank")
    a.screenshot(path=str(OUT / "sessions-booked-mobile-light.png"), full_page=True)

    # Student 2 cannot see that slot or its link
    _, b = new_ctx()
    sign_in(b, S2)
    b.goto(f"{BASE}/members/{ids['Mia Mentor']}")
    b.get_by_role("heading", level=1).wait_for()
    b.wait_for_timeout(1500)
    check("another member sees only the slot that is still open", b.locator("main section ul li").count() == 1)
    t2 = token_for(S2)
    s, links = api("GET", "/rest/v1/mentor_slot_links?select=meeting_url", t2)
    check("API: another member cannot read any meeting link", s == 200 and links == [], str(links))
    s, hid = api("GET", "/rest/v1/mentor_slots?select=id&topic=eq.Private%20mentor%20slot", t2)
    check("API: a private mentor's slots are hidden", s == 200 and hid == [], str(hid))
    s, bad = api("PATCH", "/rest/v1/mentor_slots?topic=eq.CV%20review", t2, {"starts_at": "2030-01-01T00:00:00Z"})
    check("API: a member cannot move a slot", s in (401, 403), str(s))

    # Mentor sees the booking
    m.goto(f"{BASE}/sessions")
    m.get_by_role("heading", name="Your availability").wait_for()
    m.wait_for_timeout(1500)
    mbody = m.inner_text("main")
    check("the mentor sees who booked and their message", "booked by Sid Student" in mbody and "I want to move into backend work." in mbody)

    # Release, then the other student can see both again
    a.goto(f"{BASE}/sessions")
    a.get_by_role("button", name="Cancel my booking").click()
    a.wait_for_url(re.compile(r"released=1"), timeout=25000)
    a.get_by_text("Booking cancelled.").wait_for(timeout=15000)
    check("the booker can cancel and the slot opens again", "Booking cancelled." in a.inner_text("main"))
    b.goto(f"{BASE}/members/{ids['Mia Mentor']}")
    b.get_by_role("heading", level=1).wait_for()
    b.wait_for_timeout(1500)
    check("a released slot is bookable by someone else", b.locator("main section ul li").count() == 2)

    # Mentor cancels a slot
    m.goto(f"{BASE}/sessions")
    m.get_by_role("heading", name="Your availability").wait_for()
    m.wait_for_timeout(1500)
    m.get_by_role("button", name="Remove this slot").first.click()
    m.wait_for_url(re.compile(r"cancelled=1"), timeout=25000)
    m.get_by_text("Slot cancelled.").wait_for(timeout=15000)
    check("the mentor can remove a slot", "Slot cancelled." in m.inner_text("main"))
    b.goto(f"{BASE}/members/{ids['Mia Mentor']}")
    b.get_by_role("heading", level=1).wait_for()
    b.wait_for_timeout(1500)
    check("a removed slot disappears for members", b.locator("main section ul li").count() == 1)

    # A student cannot offer slots
    a.goto(f"{BASE}/sessions")
    a.get_by_role("heading", name="Your availability").wait_for()
    check("a student is told that graduates offer sessions", "Verified graduates can offer sessions here." in a.inner_text("main") and a.get_by_role("button", name="Add this slot").count() == 0)

    # Dark render
    _, d = new_ctx(375, 812, "dark")
    sign_in(d, MENTOR)
    d.goto(f"{BASE}/sessions")
    d.get_by_role("heading", name="Your availability").wait_for()
    d.wait_for_timeout(1500)
    d.screenshot(path=str(OUT / "sessions-mentor-mobile-dark.png"), full_page=True)

    real = [x for x in errors if "Failed to load resource" not in x]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "sessions_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
