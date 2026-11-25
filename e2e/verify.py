"""End-to-end check of the Sprint 3 verification flow against the dev server.

Accounts (created beforehand, deleted afterwards):
  member  e2e-member@example.com   admin  e2e-admin@example.com
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
MEMBER = ("e2e-member@example.com", "Member-Throwaway-5512!")
ADMIN = ("e2e-admin@example.com", "Admin-Throwaway-5512!")
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + detail) if detail else "")


def form(page):
    # The shared header holds the Sign out form, so look inside <main>.
    return page.locator("main form:visible").first


def sign_in(page, creds):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = form(page)
    f.locator('input[type="email"]').fill(creds[0])
    f.locator('input[name="password"]').fill(creds[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
    page.get_by_role("heading", level=1).wait_for(timeout=10000)


def fill_claim(page, *, alumni=False, student_id="C201001", file=None):
    f = form(page)
    f.get_by_label("Full name").fill("Rahim Uddin")
    f.get_by_label("A graduate" if alumni else "A current student").check()
    f.get_by_label("Student ID").fill(student_id)
    f.get_by_label("Department").fill("CSE")
    f.get_by_label("Batch").fill("30" if alumni else "45")
    if alumni:
        f.get_by_label("Year you graduated").fill("2019")
        f.get_by_label("Document").select_option("certificate")
    if file:
        f.get_by_label("Photo or scan").set_input_files(file)


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    def new_ctx(width=375, height=812, scheme="light", mobile=True):
        ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile, color_scheme=scheme)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        return ctx, pg

    mctx, mem = new_ctx()

    # A real JPEG, made by the browser itself.
    shot_page = browser.new_page()
    shot_page.set_content("<body style='background:#0f5132;color:white;font:40px sans-serif'>IIUC ID CARD</body>")
    jpeg = shot_page.screenshot(type="jpeg", clip={"x": 0, "y": 0, "width": 320, "height": 200})
    shot_page.close()
    tmp = pathlib.Path(__file__).parent / "tmp_uploads"
    tmp.mkdir(exist_ok=True)
    good = tmp / "id-card.jpg"
    good.write_bytes(jpeg)
    fake = tmp / "evidence.jpg"
    fake.write_bytes(b"MZ\x90\x00 this is a program, not a photo")
    big = tmp / "huge.jpg"
    big.write_bytes(jpeg + b"\x00" * (5 * 1024 * 1024))  # valid header, over 5 MB

    # 1. Member: dashboard offers the next step.
    sign_in(mem, MEMBER)
    body = mem.inner_text("main")
    check("dashboard offers 'Verify my IIUC affiliation'", "Verify my IIUC affiliation" in body)
    check("a member sees no admin section", "Review verification requests" not in body)
    mem.get_by_role("link", name="Verify my IIUC affiliation").click()
    mem.wait_for_url(re.compile(r"/verify"), timeout=10000)
    mem.get_by_role("heading", level=1).wait_for()
    mem.wait_for_timeout(1500)
    check("/verify shows the claim form", form(mem).get_by_label("Student ID").is_visible())
    check("graduation year is hidden for a student", form(mem).get_by_label("Year you graduated").count() == 0)
    form(mem).get_by_label("A graduate").check()
    check("graduation year appears for a graduate", form(mem).get_by_label("Year you graduated").is_visible())
    form(mem).get_by_label("A current student").check()
    mem.screenshot(path=str(OUT / "verify-form-mobile-light.png"), full_page=True)

    # 2. Server-side file checks.
    fill_claim(mem, file=str(fake))
    form(mem).locator('button[type="submit"]').click()
    err = form(mem).locator("p[id$='-error']")
    err.first.wait_for(timeout=15000)
    check("a program renamed .jpg is refused by its content", "JPG, PNG, WebP or PDF" in err.first.inner_text(), err.first.inner_text())
    check("the form keeps the typed values after a failed attempt", form(mem).get_by_label("Student ID").input_value() == "C201001")

    fill_claim(mem, file=str(big))
    form(mem).locator('button[type="submit"]').click()
    mem.wait_for_timeout(1500)
    err = form(mem).locator("p[id$='-error']")
    err.first.wait_for(timeout=20000)
    check("a file over 5 MB is refused", "5 MB" in err.first.inner_text(), err.first.inner_text())

    # 3. A valid claim.
    fill_claim(mem, file=str(good))
    form(mem).locator('button[type="submit"]').click()
    mem.get_by_role("heading", name="Your request is being reviewed").wait_for(timeout=25000)
    main = mem.inner_text("main")
    check("submitting moves the member to the pending screen", True)
    check("pending screen shows the claim details", all(s in main for s in ["C201001", "CSE", "45", "Student ID card"]))
    mem.screenshot(path=str(OUT / "verify-pending-mobile-light.png"), full_page=True)
    mem.goto(f"{BASE}/dashboard")
    mem.get_by_role("heading", level=1).wait_for()
    check("dashboard now says the request is being reviewed", mem.get_by_role("heading", level=1).inner_text() == "Your affiliation is being reviewed")
    mem.goto(f"{BASE}/verify")
    mem.get_by_role("heading", level=1).wait_for()
    check("a member with a pending request is not shown the form again", mem.get_by_role("heading", level=1).inner_text() == "Your request is being reviewed")

    # 4. A member cannot open the admin page.
    mem.goto(f"{BASE}/admin/verifications")
    mem.wait_for_url(re.compile(r"/dashboard"), timeout=10000)
    check("a non-admin is sent away from /admin/verifications", "/dashboard" in mem.url)

    # 5. Admin reviews.
    actx, adm = new_ctx(1100, 900, mobile=False)
    sign_in(adm, ADMIN)
    check("an admin sees the review link on the dashboard", adm.get_by_role("link", name="Review verification requests").is_visible())
    adm.get_by_role("link", name="Review verification requests").click()
    adm.wait_for_url(re.compile(r"/admin/verifications"), timeout=10000)
    adm.get_by_role("heading", name="Rahim Uddin").wait_for(timeout=15000)
    amain = adm.inner_text("main")
    check("queue shows the member's name and claim", all(s in amain for s in ["Rahim Uddin", "Current student", "CSE", "batch 45", "C201001"]))
    adm.screenshot(path=str(OUT / "admin-queue-desktop-light.png"), full_page=True)

    link = adm.get_by_role("link", name=re.compile(r"Student ID card"))
    href = link.get_attribute("href")
    check("document link is a short-lived signed URL", bool(href) and "token=" in href, (href or "")[:60] + "…")
    r = adm.request.get(href)
    check("the signed link returns the uploaded image", r.status == 200 and r.headers.get("content-type", "").startswith("image/"), f"{r.status} {r.headers.get('content-type')}")
    r_bad = adm.request.get(re.sub(r"token=[^&]+", "token=tampered", href))
    check("a tampered link is refused", r_bad.status in (400, 401, 403, 404), str(r_bad.status))
    path_part = re.search(r"/object/sign/verification-documents/(.+?)\?", href).group(1)
    origin = re.match(r"https://[^/]+", href).group(0)
    try:
        public_status = urllib.request.urlopen(f"{origin}/storage/v1/object/public/verification-documents/{path_part}", timeout=15).status
    except urllib.error.HTTPError as e:
        public_status = e.code
    check("the file is not reachable through a public URL", public_status in (400, 401, 403, 404), str(public_status))

    # Reject without a reason, then with one.
    adm.get_by_role("button", name="Reject").click()
    ealert = adm.locator('form:visible [role="alert"]').first
    ealert.wait_for(timeout=10000)
    check("rejecting without a reason is refused", "reason" in ealert.inner_text().lower(), ealert.inner_text())
    adm.get_by_label("Note to the member").fill("The photo is too blurry to read.")
    adm.get_by_role("button", name="Reject").click()
    adm.get_by_text("Request rejected.").wait_for(timeout=15000)
    check("rejecting with a reason shows a confirmation", True)
    check("the queue is empty after the decision", "No requests are waiting." in adm.inner_text("main"))

    # 6. Member sees the reason and can try again; then withdraws.
    mem.goto(f"{BASE}/verify")
    mem.get_by_role("heading", level=1).wait_for()
    mem.wait_for_timeout(1500)
    mtext = mem.inner_text("main")
    check("the member sees the rejection reason", "The photo is too blurry to read." in mtext)
    check("the member can send a new request", form(mem).get_by_label("Student ID").is_visible())
    mem.screenshot(path=str(OUT / "verify-rejected-mobile-light.png"), full_page=True)

    fill_claim(mem, file=str(good))
    form(mem).locator('button[type="submit"]').click()
    mem.get_by_role("heading", name="Your request is being reviewed").wait_for(timeout=25000)
    mem.get_by_role("button", name="Withdraw this request").click()
    mem.get_by_role("heading", name="Verify your IIUC affiliation").wait_for(timeout=15000)
    check("a member can withdraw a pending request", True)

    # 7. Alumni claim, approved.
    mem.wait_for_timeout(1500)
    fill_claim(mem, alumni=True, student_id="C190002", file=str(good))
    form(mem).locator('button[type="submit"]').click()
    mem.get_by_role("heading", name="Your request is being reviewed").wait_for(timeout=25000)
    check("the pending screen shows the graduation year", "2019" in mem.inner_text("main"))

    adm.goto(f"{BASE}/admin/verifications")
    adm.get_by_role("heading", name="Rahim Uddin").wait_for(timeout=15000)
    check("the admin queue shows a graduate claim", "Graduate, 2019" in adm.inner_text("main"))
    adm.get_by_role("button", name="Approve").click()
    adm.get_by_text("Request approved.").wait_for(timeout=15000)
    check("approving shows a confirmation", True)

    mem.goto(f"{BASE}/dashboard")
    h = mem.get_by_role("heading", level=1)
    h.wait_for()
    check("the member's dashboard says they are a verified graduate", h.inner_text() == "You are a verified IIUC graduate", h.inner_text())
    check("all three steps are marked done", mem.locator('ol li[aria-current="step"]').count() == 0)
    mem.goto(f"{BASE}/verify")
    mem.get_by_role("heading", level=1).wait_for()
    check("/verify now shows the verified summary", mem.get_by_role("heading", level=1).inner_text() == "You are verified" and "IIUC graduate" in mem.inner_text("main"))
    mem.screenshot(path=str(OUT / "verify-approved-mobile-light.png"), full_page=True)

    # dark render of the admin queue on a phone
    dctx, dark = new_ctx(375, 812, scheme="dark")
    sign_in(dark, ADMIN)
    dark.goto(f"{BASE}/admin/verifications")
    dark.get_by_role("heading", level=1).wait_for(timeout=15000)
    dark.screenshot(path=str(OUT / "admin-queue-mobile-dark.png"), full_page=True)

    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
pathlib.Path(__file__).with_name("verify_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
