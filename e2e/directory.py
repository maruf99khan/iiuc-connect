"""End-to-end check of Sprint 4 (profiles and directory) against the dev server."""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
VIEWER = ("e2e-viewer@example.com", "Viewer-Throwaway-7741!")
ADMIN = ("e2e-diradmin@example.com", "DirAdmin-Throwaway-7741!")
UNVERIFIED = ("e2e-unverified@example.com", "Unverified-Throwaway-7741!")
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
ROOT = pathlib.Path(__file__).resolve().parents[0]
results = []

env = dict(
    line.strip().split("=", 1)
    for line in open(str(__import__("pathlib").Path(__file__).resolve().parents[1] / ".env.local"), encoding="utf-8")
    if "=" in line and not line.startswith("#")
)
SB_URL, SB_KEY = env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + str(detail)) if detail else "")


def api(method, path, token=None, body=None):
    headers = {"apikey": SB_KEY, "Content-Type": "application/json", "Prefer": "return=representation"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(SB_URL + path, method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
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


def token_for(creds):
    s, b = api("POST", "/auth/v1/token?grant_type=password", body={"email": creds[0], "password": creds[1]})
    assert s == 200, (s, b)
    return b["access_token"]


def sign_in(page, creds):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(creds[0])
    f.locator('input[name="password"]').fill(creds[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
    page.get_by_role("heading", level=1).wait_for(timeout=10000)


def names(page):
    page.get_by_role("heading", level=1).wait_for(timeout=15000)
    page.wait_for_timeout(300)
    return page.locator("main ul li h2 a").all_inner_texts()


def status(page):
    return page.locator('main p[role="status"]').first.inner_text()


def search(page, q="", who="", page_no=1):
    params = {}
    if q:
        params["q"] = q
    if who:
        params["who"] = who
    if page_no > 1:
        params["page"] = str(page_no)
    page.goto(f"{BASE}/directory" + ("?" + urllib.parse.urlencode(params) if params else ""))
    return names(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(width=375, height=812, scheme="light", mobile=True):
        ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile, color_scheme=scheme)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return ctx, pg

    # ids, read through the admin's own session (admins can read every row)
    admin_token = token_for(ADMIN)
    s, rows = api("GET", "/rest/v1/profiles?select=id,full_name", admin_token)
    ids = {r["full_name"]: r["id"] for r in rows}

    vctx, v = new_ctx()
    sign_in(v, VIEWER)
    body = v.inner_text("main")
    check("dashboard links to the directory and the profile editor", "Browse the member directory" in body and "Edit your profile" in body)
    check("the shared nav has Directory and Profile", v.get_by_role("navigation", name="Main").get_by_role("link", name="Directory").is_visible())

    # Browsing and paging
    first = search(v)
    check("page 1 lists 20 members", len(first) == 20, str(len(first)))
    check("the count and page are shown", status(v) == "23 members, page 1 of 2", status(v))
    v.screenshot(path=str(OUT / "directory-mobile-light.png"), full_page=True)
    v.get_by_role("link", name="Next page").click()
    v.wait_for_url(re.compile(r"page=2"))
    second = names(v)
    check("page 2 holds the rest, in name order", second == ["Filler 20", "Public Priya", "Sara Ahmed"], str(second))
    everyone = first + second
    check("a private profile is never listed", "Hidden Hasan" not in everyone)
    check("an unverified member is never listed", "Unverified Umar" not in everyone and "Una Unverified" not in everyone)
    check("the viewer is not listed in their own directory", "Vic Viewer" not in everyone)
    search(v, page_no=99)
    past = v.inner_text("main")
    check("a page past the end does not error", "could not load" not in past.lower())
    check("a page past the end says so instead of 'no match'", "No members match" not in past, past[-160:].replace("\n", " "))

    # Searching
    check("search by skill finds the member, not the private or unverified ones", search(v, "python") == ["Sara Ahmed"])
    check("every word must match (found)", search(v, "sara python") == ["Sara Ahmed"])
    check("every word must match (excluded)", search(v, "sara java") == [])
    check("search ignores case", search(v, "SARA") == ["Sara Ahmed"])
    check("search by city", search(v, "chattogram") == ["Sara Ahmed"])
    check("search by department", search(v, "eee") == ["Public Priya"])
    check("search by batch and department together", search(v, "cse 28") == ["Sara Ahmed"])
    check("filter: graduates", search(v, who="alumni") == ["Sara Ahmed"])
    check("filter: students narrow a search", search(v, "cse", who="student") == ["Ada Admin"])
    for hostile in ["%", "_", "a,b)", "' or 1=1 --", "\\", "<script>alert(1)</script>", "x" * 300]:
        got = search(v, hostile)
        ok = got == [] and "could not load" not in v.inner_text("main").lower()
        check(f"hostile search {hostile[:18]!r} returns nothing and no error", ok, str(got)[:60])
    v.goto(f"{BASE}/directory?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    v.get_by_role("heading", level=1).wait_for()
    check("the search box shows typed markup as text", v.locator("#directory-q").input_value() == "<script>alert(1)</script>")

    # A member page
    search(v, "sara")
    v.get_by_role("link", name="Sara Ahmed").click()
    v.wait_for_url(re.compile(r"/members/"))
    v.get_by_role("heading", level=1).wait_for()
    mtext = v.inner_text("main")
    check("member page shows name, status line and work line", all(s in mtext for s in ["Sara Ahmed", "IIUC graduate · CSE · batch 28 · class of 2018", "Senior Engineer at Acme Ltd · Chattogram"]))
    check("member page keeps the bio lines", "I build data pipelines." in mtext and "Previously at a startup in Dhaka." in mtext)
    check("member page lists the skills", v.locator("main section ul li").count() == 3)
    li = v.get_by_role("link", name=re.compile("LinkedIn profile"))
    check("LinkedIn link is the stored address and opens safely", li.get_attribute("href") == "https://www.linkedin.com/in/sara-ahmed" and "noopener" in li.get_attribute("rel") and li.get_attribute("target") == "_blank")
    v.screenshot(path=str(OUT / "member-mobile-light.png"), full_page=True)

    for label, ident in [("a private profile", ids["Hidden Hasan"]), ("an unverified member's profile", ids["Unverified Umar"]), ("a malformed id", "not-a-uuid")]:
        v.goto(f"{BASE}/members/{ident}")
        v.wait_for_timeout(1500)
        page_text = v.inner_text("body")
        check(f"{label} shows the not-found page and no member data", "could not be found" in page_text.lower() and "Hidden Hasan" not in page_text and "Unverified Umar" not in page_text, page_text[:80].replace(chr(10), " "))
    v.goto(f"{BASE}/members/{ids['Vic Viewer']}")
    v.get_by_role("heading", level=1).wait_for()
    check("your own page says it is how others see you", "This is how other members see your profile." in v.inner_text("main"))

    # Editing the profile
    v.goto(f"{BASE}/profile?edit=1")
    v.get_by_role("heading", level=1).wait_for()
    v.wait_for_timeout(1200)
    check("a verified member has no name field", v.locator('main input[name="fullName"]').count() == 0)
    check("it explains the locked details", "cannot be changed here" in v.inner_text("main"))
    check("the public option says visitors who are not signed in can read it", "even visitors who are not signed in" in v.inner_text("main"))
    f = v.locator("main form:visible").first
    f.get_by_label("Headline", exact=True).fill("Platform engineer")
    f.get_by_label("Job title", exact=True).fill("Engineer")
    f.get_by_label("Company", exact=True).fill("Acme")
    f.get_by_label("City", exact=True).fill("Dhaka")
    f.get_by_label("Skills", exact=True).fill("go, SQL, go")
    f.get_by_label("About you", exact=True).fill("Hello\nWorld")
    f.get_by_label("LinkedIn address", exact=True).fill("https://evil.example/in/vic")
    f.get_by_role("button", name="Save profile").click()
    err = v.locator("main form:visible p[id$='-error']").first
    err.wait_for(timeout=15000)
    check("a LinkedIn address on another site is refused", "LinkedIn address" in err.inner_text(), err.inner_text())
    check("the other typed values are kept", v.locator("main form:visible").first.get_by_label("Headline", exact=True).input_value() == "Platform engineer")
    f = v.locator("main form:visible").first
    f.get_by_label("Skills", exact=True).fill(", ".join(f"s{i}" for i in range(31)))
    f.get_by_label("LinkedIn address", exact=True).fill("https://bd.linkedin.com/in/vic")
    f.get_by_role("button", name="Save profile").click()
    v.wait_for_timeout(1500)
    err = v.locator("main form:visible p[id$='-error']").first
    err.wait_for(timeout=15000)
    check("more than 30 skills are refused", "at most 30" in err.inner_text(), err.inner_text())
    f = v.locator("main form:visible").first
    f.get_by_label("Skills", exact=True).fill("go, SQL, go")
    f.get_by_role("button", name="Save profile").click()
    v.wait_for_url(re.compile(r"saved=1"), timeout=20000)
    check("a valid profile saves and says so", "Profile saved." in v.inner_text("main"))
    f = v.locator("main form:visible").first
    check("saved values are shown again, with duplicate skills removed", f.get_by_label("Skills", exact=True).input_value() == "go, SQL" and f.get_by_label("Company", exact=True).input_value() == "Acme")
    v.screenshot(path=str(OUT / "profile-mobile-light.png"), full_page=True)

    # Visibility: private hides the member from other members
    actx, a = new_ctx(1100, 900, mobile=False)
    sign_in(a, ADMIN)
    check("a saved profile is searchable by its new text", "Vic Viewer" in search(a, "platform engineer acme"))
    f = v.locator("main form:visible").first
    f.locator('input[name="visibility"][value="private"]').check()
    f.get_by_role("button", name="Save profile").click()
    v.wait_for_url(re.compile(r"saved=1"), timeout=20000)
    check("choosing 'Only me' removes the member from the directory", "Vic Viewer" not in search(a, "viewer"))
    check("the admin's directory never lists a private profile", search(a, "hasan") == [])
    check("the admin's own entry is not listed to themselves", "Ada Admin" not in search(a, "ada"))
    f = v.locator("main form:visible").first
    f.locator('input[name="visibility"][value="iiuc_community"]').check()
    f.get_by_role("button", name="Save profile").click()
    v.wait_for_url(re.compile(r"saved=1"), timeout=20000)
    check("choosing verified members lists the member again", "Vic Viewer" in search(a, "viewer"))
    a.screenshot(path=str(OUT / "directory-desktop-light.png"), full_page=True)

    # Not verified
    uctx, u = new_ctx()
    sign_in(u, UNVERIFIED)
    u.goto(f"{BASE}/directory")
    u.get_by_role("heading", level=1).wait_for()
    check("an unverified member sees the gate, not the directory", "Verify my IIUC affiliation" in u.inner_text("main") and u.locator("#directory-q").count() == 0)
    u.goto(f"{BASE}/members/{ids['Sara Ahmed']}")
    u.wait_for_url(re.compile(r"/verify"), timeout=15000)
    check("an unverified member opening a profile is sent to /verify", "/verify" in u.url)
    u.goto(f"{BASE}/profile?edit=1")
    u.get_by_role("heading", level=1).wait_for()
    u.wait_for_timeout(1200)
    check("an unverified member can still edit their name", u.locator('main input[name="fullName"]').is_visible())
    f = u.locator("main form:visible").first
    f.get_by_label("Full name", exact=True).fill("Una Unverified Edited")
    f.get_by_role("button", name="Save profile").click()
    u.wait_for_url(re.compile(r"saved=1"), timeout=20000)
    check("and the new name is saved", u.locator("main form:visible").first.get_by_label("Full name", exact=True).input_value() == "Una Unverified Edited")

    # Dark render
    dctx, dk = new_ctx(375, 812, scheme="dark")
    sign_in(dk, VIEWER)
    search(dk, "python")
    dk.screenshot(path=str(OUT / "directory-mobile-dark.png"), full_page=True)

    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

# Straight at the API, the way an attacker would
vt = token_for(VIEWER)
vid = ids["Vic Viewer"]
for label, body, codes in [
    ("department", {"department": "EEE"}, (401, 403)),
    ("batch", {"batch": "1"}, (401, 403)),
    ("graduation year", {"graduation_year": 2001}, (401, 403)),
    ("name", {"full_name": "Somebody Else"}, (401, 403)),
    ("a LinkedIn address on another host", {"linkedin_url": "https://linkedin.com.evil.example/x"}, (400,)),
    ("role", {"role": "admin"}, (401, 403)),
]:
    s, b = api("PATCH", f"/rest/v1/profiles?id=eq.{vid}", vt, body)
    check(f"API: a verified member cannot change their {label}", s in codes, f"{s}")
s, b = api("PATCH", f"/rest/v1/profiles?id=eq.{vid}", vt, {"headline": "API edit"})
check("API: editing the headline is allowed", s == 200)
s, b = api("GET", "/rest/v1/profiles?select=full_name&search_text=ilike.%25hasan%25", vt)
check("API: a private profile is not searchable by another member", s == 200 and b == [], str(b)[:80])
s, b = api("GET", "/rest/v1/profiles?select=full_name")
public_names = sorted(r["full_name"] for r in b) if s == 200 else b
check("API: a visitor who is not signed in can read only 'public' verified profiles", public_names == ["Public Priya"], str(public_names))

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "dir_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
