"""End-to-end check of sign-up with email confirmation switched off.

Run: python e2e_signup.py   (dev server on http://localhost:3000)
Creates one account in the hosted project; the caller deletes it afterwards.
"""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL = "e2e-signup@example.com"
PASSWORD = "Sign-Up-Throwaway-8830!"
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + detail) if detail else "")


def form(page):
    return page.locator("form:visible").first


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme="light")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # 1. Server-side validation (browser checks removed so the server is tested).
    page.goto(f"{BASE}/sign-up")
    f = form(page)
    page.wait_for_timeout(2000)  # let React hydrate before touching the DOM
    f.locator('input[name="password"]').evaluate("e => e.removeAttribute('minlength')")
    f.locator('input[type="email"]').fill(EMAIL)
    f.locator('input[name="password"]').fill("short")
    f.locator('button[type="submit"]').click()
    err = f.locator("p.text-danger")
    err.first.wait_for(timeout=10000)
    check("short password is refused by the server with a clear message", "at least 8" in err.first.inner_text().lower(), err.first.inner_text())
    check("email survives the failed attempt", f.locator('input[type="email"]').input_value() == EMAIL)
    check("password field has aria-invalid and a described-by error", f.locator('input[name="password"]').get_attribute("aria-invalid") == "true")
    page.screenshot(path=str(OUT / "signup-short-password-mobile.png"))

    # 2. Real sign-up. With Confirm email off Supabase returns a session.
    page.goto(f"{BASE}/sign-up")
    f = form(page)
    f.locator('input[type="email"]').fill(EMAIL)
    f.locator('input[name="password"]').fill(PASSWORD)
    f.locator('button[type="submit"]').click()
    try:
        page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
        landed = True
    except Exception:
        landed = False
    check("sign-up signs the member in and lands on /dashboard (Confirm email is off)", landed, page.url.replace(BASE, ""))

    if landed:
        h1 = page.get_by_role("heading", level=1)
        h1.wait_for(timeout=10000)
        check("new member's dashboard says the email is confirmed", h1.inner_text() == "Your email is confirmed", h1.inner_text())
        check("dashboard shows the new member's email", EMAIL in page.inner_text("main"))
        page.screenshot(path=str(OUT / "signup-dashboard-mobile.png"), full_page=True)

        # 3. Sign out, then sign in with the new credentials.
        page.get_by_role("button", name="Sign out").click()
        page.wait_for_url(f"{BASE}/", timeout=10000)
        page.goto(f"{BASE}/sign-in")
        f = form(page)
        f.locator('input[type="email"]').fill(EMAIL)
        f.locator('input[name="password"]').fill(PASSWORD)
        f.locator('button[type="submit"]').click()
        page.wait_for_url(re.compile(r"/dashboard"), timeout=15000)
        check("the new member can sign out and back in", True)

        # 4. Same email again, signed out.
        page.get_by_role("button", name="Sign out").click()
        page.wait_for_url(f"{BASE}/", timeout=10000)
        page.goto(f"{BASE}/sign-up")
        f = form(page)
        f.locator('input[type="email"]').fill(EMAIL.upper())
        f.locator('input[name="password"]').fill("A-Different-Password-1!")
        f.locator('button[type="submit"]').click()
        page.wait_for_timeout(4000)
        body = page.inner_text("main")
        signed_in_as_someone = "/dashboard" in page.url
        check("signing up again with the same email does not sign anyone in", not signed_in_as_someone, page.url.replace(BASE, ""))
        leaks = re.search(r"already (registered|exists|in use|taken)|account exists|email (is )?taken", body, re.I)
        check("a duplicate sign-up does not say the account exists", leaks is None)
        page.get_by_role("button", name="That is not my email").click()
        f = form(page)
        check("'That is not my email' returns to the form with the address filled in", f.locator('input[type="email"]').input_value().lower() == EMAIL and f.locator('input[name="password"]').input_value() == "")
        page.screenshot(path=str(OUT / "signup-duplicate-mobile.png"))

        # 5. The original password still works; the duplicate attempt changed nothing.
        page.goto(f"{BASE}/sign-in")
        f = form(page)
        f.locator('input[type="email"]').fill(EMAIL)
        f.locator('input[name="password"]').fill(PASSWORD)
        f.locator('button[type="submit"]').click()
        page.wait_for_url(re.compile(r"/dashboard"), timeout=15000)
        check("the original password still works after the duplicate attempt", True)

    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:300])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
pathlib.Path(__file__).with_name("signup_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
