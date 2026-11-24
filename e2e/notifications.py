"""End-to-end check of in-app notifications against the dev server.

Seed first (see README "Browser checks"): e2e-poster, e2e-student1 and e2e-student2
@example.com, verified (the poster as a graduate named "Pia Poster", the students
"Sid Student" and "Sue Student"). Uses the jobs flow to cause events.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
POSTER = ("e2e-poster@example.com", "Poster-Throwaway-6103!")
S1 = ("e2e-student1@example.com", "Student1-Throwaway-6103!")
S2 = ("e2e-student2@example.com", "Student2-Throwaway-6103!")
TITLE = "E2E Notification Role"
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


def sign_in(page, c):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(c[0])
    f.locator('input[name="password"]').fill(c[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=30000)
    page.get_by_role("heading", level=1).wait_for(timeout=15000)


def open_notifications(page):
    page.goto(f"{BASE}/notifications")
    page.get_by_role("heading", level=1, name="Notifications").wait_for(timeout=30000)
    page.wait_for_timeout(1000)


def badge(page):
    page.goto(f"{BASE}/dashboard")
    page.get_by_role("heading", level=1).wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    el = page.get_by_label(re.compile(r"\d+ unread"))
    return el.first.inner_text() if el.count() else ""


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(scheme="light"):
        c = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme=scheme)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return pg

    po = new_ctx()
    sign_in(po, POSTER)
    a = new_ctx()
    sign_in(a, S1)
    b = new_ctx()
    sign_in(b, S2)

    # A fresh member has nothing
    open_notifications(a)
    check("a member with no events sees the empty state", "Nothing yet." in a.inner_text("main"))
    check("no badge when there is nothing unread", badge(a) == "")

    # The poster posts a job through the page
    po.goto(f"{BASE}/jobs/new")
    po.get_by_label("Job title").wait_for(timeout=30000)
    po.get_by_label("Job title").fill(TITLE)
    po.get_by_label("Company").fill("Acme")
    po.get_by_label("About the job").fill("Build and run our payment services.")
    po.get_by_role("button", name="Post this job").click()
    po.wait_for_url(re.compile(r"/jobs/[0-9a-f-]{36}\?posted=1"), timeout=30000)
    job_id = re.search(r"/jobs/([0-9a-f-]{36})", po.url).group(1)

    # A student applies; the poster is notified
    a.goto(f"{BASE}/jobs/{job_id}")
    a.get_by_label("A short message (optional)").wait_for(timeout=30000)
    a.get_by_label("A short message (optional)").fill("I would love to join.")
    a.get_by_role("button", name="Apply to this job").click()
    a.wait_for_url(re.compile(r"applied=1"), timeout=30000)
    check("the poster's nav shows one unread", badge(po) == "1", badge(po))
    open_notifications(po)
    body = po.inner_text("main")
    check("the poster sees the application notification", "Someone applied to your job." in body)
    check("the notification holds no name or message", "Sid Student" not in body and "I would love to join." not in body)
    po.screenshot(path=str(OUT / "notifications-poster-mobile-light.png"), full_page=True)

    # Opening it marks it read and goes to the job
    po.get_by_role("button", name="Open").first.click()
    po.wait_for_url(re.compile(rf"/jobs/{job_id}"), timeout=30000)
    check("opening a notification goes to its job", job_id in po.url)
    check("opening a notification marks it read", badge(po) == "")

    # The poster shortlists; the applicant is notified, the bystander is not
    po.goto(f"{BASE}/jobs/{job_id}")
    po.get_by_role("button", name="Shortlist").wait_for(timeout=30000)
    po.get_by_role("button", name="Shortlist").first.click()
    po.wait_for_url(re.compile(r"decided=1"), timeout=30000)
    check("the applicant's nav shows one unread", badge(a) == "1", badge(a))
    open_notifications(a)
    check("the applicant sees the shortlist notification", "You were shortlisted for a job." in a.inner_text("main"))
    open_notifications(b)
    check("a bystander sees no notifications", "Nothing yet." in b.inner_text("main"))
    s2token = token_for(S2)
    s, rows = api("GET", "/rest/v1/notifications?select=id", s2token)
    check("API: a bystander reads no notifications", s == 200 and rows == [], str(rows))
    s, bad = api("POST", "/rest/v1/notifications", s2token, {"user_id": "00000000-0000-0000-0000-000000000000", "kind": "request_received", "link": "/sessions"})
    check("API: a member cannot create a notification", s in (401, 403), str(s))

    # Mark all read, then delete
    open_notifications(a)
    a.get_by_role("button", name="Mark all as read").click()
    a.wait_for_url(re.compile(r"allread=1"), timeout=30000)
    a.get_by_text("Everything is marked as read.").wait_for(timeout=15000)
    check("mark all as read clears the badge", badge(a) == "")
    open_notifications(a)
    a.get_by_role("button", name="Delete").first.click()
    a.wait_for_url(re.compile(r"deleted=1"), timeout=30000)
    a.get_by_text("Notification deleted.").wait_for(timeout=15000)
    check("deleting removes the notification", "Nothing yet." in a.inner_text("main"))
    a.screenshot(path=str(OUT / "notifications-empty-mobile-light.png"), full_page=True)

    # Layout and dark mode
    for w in (320, 375):
        a.set_viewport_size({"width": w, "height": 700})
        open_notifications(po)
        po.set_viewport_size({"width": w, "height": 700})
        po.goto(f"{BASE}/notifications")
        po.wait_for_timeout(1500)
        check(f"no horizontal overflow at {w}px", not po.evaluate("document.documentElement.scrollWidth > innerWidth"))
    d = new_ctx("dark")
    sign_in(d, POSTER)
    open_notifications(d)
    d.screenshot(path=str(OUT / "notifications-poster-mobile-dark.png"), full_page=True)

    real = [x for x in errors if "Failed to load resource" not in x]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "notifications_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
