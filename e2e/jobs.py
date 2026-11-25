"""End-to-end check of the jobs board against the dev server.

Seed first (see README "Browser checks"): e2e-poster, e2e-student1 and e2e-student2
@example.com, verified (the poster as a graduate named "Pia Poster", the students
"Sid Student" and "Sue Student"). Nothing here needs SQL by hand.

Also covers application CVs (D-025): file checks, who can open a CV, and access ending
on withdrawal. The run uploads one real test PDF to the application-cvs bucket; deleting
the job orphans it, so remove it in the dashboard or let the daily purge do it.
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
TITLE = "E2E Backend Engineer"
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


def open_jobs(page):
    page.goto(f"{BASE}/jobs")
    page.get_by_role("heading", level=1, name="Jobs").wait_for(timeout=30000)
    page.wait_for_timeout(1000)


def open_job(page, job_id):
    page.goto(f"{BASE}/jobs/{job_id}")
    page.get_by_role("heading", level=1).wait_for(timeout=30000)
    page.wait_for_timeout(1000)


PDF = b"%PDF-1.4\n%e2e test CV\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def cv_file(buffer=PDF, name="cv.pdf"):
    return {"name": name, "mimeType": "application/pdf", "buffer": buffer}


def storage_status(token, path):
    """Status and first bytes of a direct Storage API read as this member."""
    req = urllib.request.Request(
        f"{SB_URL}/storage/v1/object/authenticated/application-cvs/{path}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(5)
    except urllib.error.HTTPError as e:
        return e.code, b""


def cv_route(page, job_id, app_id):
    """The CV link as a signed-in browser follows it, one hop at a time."""
    return page.context.request.get(f"{BASE}/jobs/{job_id}/cv/{app_id}", max_redirects=0)


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(scheme="light"):
        c = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme=scheme)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return pg

    # 1. Who sees "Post a job"
    po = new_ctx()
    sign_in(po, POSTER)
    open_jobs(po)
    check("a graduate sees the Post a job button", po.get_by_role("link", name="Post a job").is_visible())
    a = new_ctx()
    sign_in(a, S1)
    open_jobs(a)
    check("a student does not see the Post a job button", a.get_by_role("link", name="Post a job").count() == 0)
    a.goto(f"{BASE}/jobs/new")
    a.get_by_role("heading", level=1).wait_for(timeout=30000)
    check("a student opening the post form is told only graduates can post", "Only verified graduates can post jobs." in a.inner_text("main"))
    s1token = token_for(S1)
    s, bad = api("POST", "/rest/v1/jobs", s1token, {"title": "Sneaky", "company": "X", "job_type": "contract", "description": "A description that is long enough."})
    check("API: a student cannot post a job", s in (401, 403), str(s))

    # 2. Post: validation, then success
    po.goto(f"{BASE}/jobs/new")
    po.get_by_label("Job title").wait_for(timeout=30000)
    po.get_by_label("Job title").fill("Hi")
    po.get_by_label("Company").fill("Acme")
    po.get_by_label("About the job").fill("Build and run our payment services.")
    po.screenshot(path=str(OUT / "jobs-post-form-mobile-light.png"), full_page=True)
    po.get_by_role("button", name="Post this job").click()
    err = po.locator("main form p[id$='-error']").first
    err.wait_for(timeout=20000)
    check("a title that is too short shows the field error", "at least 3" in err.inner_text(), err.inner_text())
    po.get_by_label("Job title").fill(TITLE)
    po.get_by_label("Location (optional)").fill("Dhaka")
    po.get_by_role("button", name="Post this job").click()
    po.wait_for_url(re.compile(r"/jobs/[0-9a-f-]{36}\?posted=1"), timeout=30000)
    job_id = re.search(r"/jobs/([0-9a-f-]{36})", po.url).group(1)
    po.get_by_text("Job posted.").wait_for(timeout=15000)
    check("posting redirects to the job and confirms", "Job posted." in po.inner_text("main") and TITLE in po.inner_text("main"))

    # 3. A student finds it and applies
    open_jobs(a)
    open_section = a.locator('section[aria-labelledby="open-heading"]').inner_text()
    check("a verified student sees the job in the list", TITLE in open_section, open_section[:80].replace("\n", " "))
    a.screenshot(path=str(OUT / "jobs-list-mobile-light.png"), full_page=True)
    open_job(a, job_id)
    # CV checks happen on the server, by content: a text file named .pdf, then a file over 2 MB.
    a.get_by_label("A short message (optional)").fill("I would love to join.")
    a.get_by_label("A CV (optional)").set_input_files(cv_file(b"this is not a pdf", "cv.pdf"))
    a.get_by_role("button", name="Apply to this job").click()
    a.get_by_text("Upload your CV as a PDF file.").wait_for(timeout=20000)
    check("a file that is not a PDF is refused, whatever its name says", True)
    a.get_by_label("A CV (optional)").set_input_files(cv_file(b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024), "big.pdf"))
    a.get_by_role("button", name="Apply to this job").click()
    a.get_by_text("The CV is larger than 2 MB.").wait_for(timeout=30000)
    check("a PDF over 2 MB is refused", True)
    s, none_yet = api("GET", "/rest/v1/job_applications?select=id", token_for(S1))
    check("API: the refused attempts created no application", s == 200 and none_yet == [], str(none_yet))
    a.get_by_label("A short message (optional)").fill("I would love to join.")
    a.get_by_label("A CV (optional)").set_input_files(cv_file())
    a.get_by_role("button", name="Apply to this job").click()
    a.wait_for_url(re.compile(r"applied=1"), timeout=30000)
    check("applying confirms and shows the application status", "Application sent." in a.inner_text("main") and "Your application:" in a.inner_text("main"))
    check("the apply form is gone after applying", a.get_by_role("button", name="Apply to this job").count() == 0)
    s, dup = api("POST", "/rest/v1/job_applications", s1token, {"job_id": job_id})
    check("API: a second application to the same job is refused", s == 409, str(s))

    # 3b. Profile links: validation, then saved and shown to the poster who clicks through
    a.goto(f"{BASE}/profile?edit=1")
    a.get_by_label("GitHub address").wait_for(timeout=30000)
    a.get_by_label("GitHub address").fill("https://gitlab.com/sid")
    a.get_by_role("button", name="Save profile").click()
    a.get_by_text("Use your GitHub address, starting with https://github.com/").wait_for(timeout=20000)
    check("a GitHub address on another site shows the field error", True)
    a.get_by_label("GitHub address").fill("https://github.com/sid-student")
    a.get_by_label("Portfolio or personal site").fill("https://sid.example.com/work")
    a.get_by_role("button", name="Save profile").click()
    a.wait_for_url(re.compile(r"saved=1"), timeout=30000)
    a.get_by_role("link", name="Edit profile").wait_for(timeout=30000)
    check("after saving, the profile is shown, not the form", "https://github.com/sid-student" in a.inner_text("main") and a.get_by_label("GitHub address").count() == 0)
    a.goto(f"{BASE}/profile?edit=1")
    a.get_by_label("GitHub address").wait_for(timeout=30000)
    check("valid GitHub and portfolio addresses are saved",a.get_by_label("GitHub address").input_value() == "https://github.com/sid-student" and a.get_by_label("Portfolio or personal site").input_value() == "https://sid.example.com/work")

    # 4. Second student; poster sees both; students see only their own
    b = new_ctx()
    sign_in(b, S2)
    open_job(b, job_id)
    b.get_by_label("A short message (optional)").fill("Please consider me.")
    b.get_by_role("button", name="Apply to this job").click()
    b.wait_for_url(re.compile(r"applied=1"), timeout=30000)
    s2token = token_for(S2)
    s, mine = api("GET", "/rest/v1/job_applications?select=id", s2token)
    check("API: a student reads only their own application", s == 200 and len(mine) == 1, str(mine))
    open_job(po, job_id)
    body = po.inner_text("main")
    check("the poster sees both applicants and their messages", "Sid Student" in body and "Sue Student" in body and "I would love to join." in body and "Please consider me." in body)
    po.screenshot(path=str(OUT / "jobs-detail-poster-mobile-light.png"), full_page=True)

    # 4b. Application CVs: who can open one
    s, m1 = api("GET", "/rest/v1/job_applications?select=id,cv_path", s1token)
    app1, cv1 = m1[0]["id"], m1[0]["cv_path"]
    s, m2 = api("GET", "/rest/v1/job_applications?select=id,cv_path", s2token)
    app2 = m2[0]["id"]
    check("API: the CV path is the applicant's folder and the application id", bool(re.fullmatch(r"[0-9a-f-]{36}/" + re.escape(app1) + r"\.pdf", cv1 or "")), str(cv1))
    check("API: an application without a CV has no path", m2[0]["cv_path"] is None)
    check("the poster sees Open CV for the applicant who attached one and No CV attached for the other", body.count("Open CV (PDF") == 1 and body.count("No CV attached.") == 1)
    link = po.get_by_role("link", name="Sid Student")
    check("the applicant's name is a link to their profile", link.count() == 1 and "/members/" in (link.get_attribute("href") or ""))
    link.click()
    po.wait_for_url(re.compile(r"/members/[0-9a-f-]{36}"), timeout=30000)
    po.get_by_role("heading", level=1, name="Sid Student").wait_for(timeout=30000)
    gh = po.get_by_role("link", name="GitHub profile (opens in a new tab)")
    pf = po.get_by_role("link", name="Portfolio or personal site (opens in a new tab)")
    check("the poster sees the applicant's GitHub and portfolio links, opening safely", gh.get_attribute("href") == "https://github.com/sid-student" and pf.get_attribute("href") == "https://sid.example.com/work" and "noopener" in (gh.get_attribute("rel") or ""))
    open_job(po, job_id)
    r = cv_route(po, job_id, app1)
    loc = r.headers.get("location", "")
    check("the poster is sent to a signed link for the CV", r.status in (302, 303, 307, 308) and "/storage/v1/object/sign/application-cvs/" in loc, f"{r.status} {loc[:60]}")
    got = po.context.request.get(loc)
    check("the signed link returns the PDF", got.status == 200 and got.body()[:5] == b"%PDF-", str(got.status))
    r = cv_route(a, job_id, app1)
    check("the applicant can open their own CV", r.status in (302, 303, 307, 308), str(r.status))
    r = cv_route(b, job_id, app1)
    check("another applicant cannot open it (404)", r.status == 404, str(r.status))
    r = cv_route(b, job_id, app2)
    check("an application with no CV gives 404", r.status == 404, str(r.status))
    anon = browser.new_context()
    r = anon.request.get(f"{BASE}/jobs/{job_id}/cv/{app1}", max_redirects=0)
    check("a signed-out visitor is sent to sign in, not to the file", r.status in (302, 303, 307, 308) and "sign-in" in r.headers.get("location", ""), f"{r.status} {r.headers.get('location', '')[:50]}")
    anon.close()
    st, head = storage_status(token_for(POSTER), cv1)
    check("API: the poster can read the file directly", st == 200 and head == b"%PDF-", str(st))
    st, head = storage_status(s2token, cv1)
    check("API: another member cannot read the file directly", st != 200, str(st))

    # 5. Shortlist and reject
    po.locator("li").filter(has_text="Sid Student").get_by_role("button", name="Shortlist").click()
    po.wait_for_url(re.compile(r"decided=1"), timeout=30000)
    po.locator("li").filter(has_text="Sue Student").get_by_role("button", name="Not this time").click()
    po.wait_for_url(re.compile(r"decided=1"), timeout=30000)
    open_jobs(a)
    open_jobs(b)
    check("the applicant sees Shortlisted", "Shortlisted" in a.locator('section[aria-labelledby="applied-heading"]').inner_text())
    check("the other applicant sees Not taken forward", "Not taken forward" in b.locator('section[aria-labelledby="applied-heading"]').inner_text())

    # 6. Withdraw
    a.get_by_role("button", name="Withdraw").click()
    a.wait_for_url(re.compile(r"withdrawn=1"), timeout=30000)
    check("withdrawing confirms and shows Withdrawn", "Application withdrawn." in a.inner_text("main") and "Withdrawn" in a.inner_text("main"))
    open_job(po, job_id)
    check("after withdrawal the poster no longer sees an Open CV link", "Open CV (PDF" not in po.inner_text("main"))
    r = cv_route(po, job_id, app1)
    check("after withdrawal the poster's CV link gives 404", r.status == 404, str(r.status))
    st, _ = storage_status(token_for(POSTER), cv1)
    check("API: after withdrawal the poster cannot read the file", st != 200, str(st))
    st, head = storage_status(s1token, cv1)
    check("API: after withdrawal the applicant can still read their file", st == 200 and head == b"%PDF-", str(st))

    # 7. Close hides the job from others; reopen shows it again
    open_job(po, job_id)
    po.get_by_role("button", name="Close this job").click()
    po.wait_for_url(re.compile(r"closed=1"), timeout=30000)
    open_jobs(b)
    check("a closed job leaves the open list", TITLE not in b.locator('section[aria-labelledby="open-heading"]').inner_text())
    b.goto(f"{BASE}/jobs/{job_id}")
    b.wait_for_timeout(2500)
    gone = b.inner_text("body")
    check("a closed job is not found by another member", "could not be found" in gone.lower() and TITLE not in gone, gone[:80].replace("\n", " "))
    open_job(po, job_id)
    po.get_by_role("button", name="Reopen this job").click()
    po.wait_for_url(re.compile(r"reopened=1"), timeout=30000)
    open_jobs(b)
    check("a reopened job is listed again", TITLE in b.locator('section[aria-labelledby="open-heading"]').inner_text())

    # 8. Delete
    open_job(po, job_id)
    po.locator("summary", has_text="Delete this job").click()
    po.get_by_role("button", name="Yes, delete this job").click()
    po.wait_for_url(re.compile(r"deleted=1"), timeout=30000)
    po.get_by_text("Job deleted.").wait_for(timeout=15000)
    check("deleting confirms", "Job deleted." in po.inner_text("main"))
    open_jobs(b)
    check("a deleted job leaves no trace in the applicant's list", TITLE not in b.inner_text("main"))
    s, left = api("GET", "/rest/v1/job_applications?select=id", s2token)
    check("API: no application is left after the job is deleted", s == 200 and left == [], str(left))

    # 9. Dark screenshot
    d = new_ctx("dark")
    sign_in(d, S1)
    open_jobs(d)
    d.screenshot(path=str(OUT / "jobs-list-mobile-dark.png"), full_page=True)

    real = [x for x in errors if "Failed to load resource" not in x]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "jobs_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
