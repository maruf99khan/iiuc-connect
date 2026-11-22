"""End-to-end check of password reset and resend-confirmation against the dev server."""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OLD = ("e2e-reset@example.com", "Old-Throwaway-3318!")
NEW_PASSWORD = "New-Throwaway-9027!"
UNCONF = ("e2e-unconf@example.com", "Unconf-Throwaway-3318!")
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
ROOT = pathlib.Path(__file__).resolve().parent
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + str(detail)) if detail else "")


def form(page):
    return page.locator("main form:visible").first


def sign_in(page, creds, expect_dashboard=True):
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = form(page)
    f.locator('input[type="email"]').fill(creds[0])
    f.locator('input[name="password"]').fill(creds[1])
    f.locator('button[type="submit"]').click()
    if expect_dashboard:
        page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
        page.get_by_role("heading", level=1).wait_for(timeout=10000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    ctx = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # 1. Entry points
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1200)
    link = page.get_by_role("link", name="Reset it")
    check("sign-in links to the password reset", link.get_attribute("href") == "/forgot-password")
    link.click()
    page.wait_for_url(re.compile(r"/forgot-password"))
    page.get_by_role("heading", level=1).wait_for()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / "forgot-mobile-light.png"), full_page=True)

    # 2. Forgot-password form
    f = form(page)
    f.get_by_label("Email").fill("a@b")
    f.get_by_role("button", name="Send reset link").click()
    err = page.locator("main form:visible p[id$='-error']").first
    err.wait_for(timeout=10000)
    check("an invalid address is refused with a clear message", "valid email" in err.inner_text().lower(), err.inner_text())
    f = form(page)
    f.get_by_label("Email").fill("nobody-here-9f3a@example.com")
    f.get_by_role("button", name="Send reset link").click()
    done = page.get_by_role("status").filter(has_text="Check your email")
    done.wait_for(timeout=20000)
    check("an address with no account gets the same 'check your email' answer", "has an account" in done.inner_text(), done.inner_text()[:90].replace("\n", " "))
    page.screenshot(path=str(OUT / "forgot-done-mobile-light.png"), full_page=True)

    # 3. Reset page and link handler refuse strangers
    page.goto(f"{BASE}/reset-password")
    page.wait_for_url(re.compile(r"/forgot-password"), timeout=15000)
    page.wait_for_timeout(1000)
    check("/reset-password signed out goes to the expired notice", "expired or was already used" in page.inner_text("main"))
    for label, url in [
        ("a made-up code", "/auth/reset?code=garbage"),
        ("a made-up token", "/auth/reset?token_hash=garbage&type=recovery"),
        ("a hostile next", "/auth/reset?code=garbage&next=//evil.example"),
        ("a bad type", "/auth/reset?token_hash=x&type=admin"),
        ("nothing", "/auth/reset"),
    ]:
        page.goto(f"{BASE}{url}")
        page.wait_for_url(re.compile(r"/forgot-password\?notice=expired"), timeout=15000)
        check(f"/auth/reset with {label} lands on the expired notice", "evil.example" not in page.url)
    page.goto(f"{BASE}/forgot-password?notice=%3Cscript%3E")
    page.wait_for_timeout(1000)
    check("an unknown notice code shows nothing", "script" not in page.inner_text("main").lower())

    # 4. Choosing a new password (a reset link signs the member in; so does this)
    sign_in(page, OLD)
    page.goto(f"{BASE}/reset-password")
    page.get_by_role("heading", level=1).wait_for()
    page.wait_for_timeout(1500)
    f = form(page)
    f.get_by_label("New password").fill(NEW_PASSWORD)
    f.get_by_label("Type it again").fill("Different-Typing-1!")
    f.get_by_role("button", name="Save new password").click()
    err = page.locator("main form:visible p[id$='-error']").first
    err.wait_for(timeout=15000)
    check("two different passwords are refused", "do not match" in err.inner_text(), err.inner_text())
    page.screenshot(path=str(OUT / "reset-mismatch-mobile-light.png"), full_page=True)
    f = form(page)
    f.get_by_label("New password").fill(OLD[1])
    f.get_by_label("Type it again").fill(OLD[1])
    f.get_by_role("button", name="Save new password").click()
    # Wait for the answer to THIS submission, not the earlier mismatch message.
    reuse = page.locator("main form:visible p").filter(has_text=re.compile("not used before|too easy|could not change", re.I))
    try:
        reuse.first.wait_for(timeout=25000)
        reuse_text = reuse.first.inner_text()
    except Exception:
        reuse_text = "(no refusal shown) url=" + page.url.replace(BASE, "")
    check("reusing the current password is refused", "not used before" in reuse_text, reuse_text)
    page.wait_for_timeout(1500)

    f = form(page)
    f.get_by_label("New password").fill(NEW_PASSWORD)
    f.get_by_label("Type it again").fill(NEW_PASSWORD)
    f.get_by_role("button", name="Save new password").click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=25000)
    check("saving a new password signs the member in and lands on the dashboard", True)

    # 5. The old password no longer works; the new one does
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE}/", timeout=10000)
    sign_in(page, OLD, expect_dashboard=False)
    alert = page.locator('main form:visible [role="alert"]').first
    alert.wait_for(timeout=15000)
    check("the old password is refused", "Incorrect email or password" in alert.inner_text(), alert.inner_text())
    sign_in(page, (OLD[0], NEW_PASSWORD))
    check("the new password signs in", True)

    # 6. Unconfirmed account offers a resend
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE}/", timeout=10000)
    sign_in(page, UNCONF, expect_dashboard=False)
    alert = page.locator('main form:visible [role="alert"]').first
    alert.wait_for(timeout=15000)
    check("an unconfirmed account is told to confirm its email", "Confirm your email first" in alert.inner_text(), alert.inner_text())
    resend = page.get_by_role("button", name="Send the confirmation email again")
    check("and is offered a way to get the email again", resend.is_visible())
    check("the resend button is outside the sign-in form", page.locator("form form").count() == 0)
    page.screenshot(path=str(OUT / "signin-unconfirmed-mobile-light.png"), full_page=True)

    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(ROOT / "recovery_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
