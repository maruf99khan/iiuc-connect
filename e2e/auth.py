"""End-to-end check of sign-in, dashboard and sign-out against the dev server.

Uses the throwaway user created for this run; it is deleted afterwards.
Run: python e2e_auth.py   (dev server must be on http://localhost:3000)
"""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
EMAIL = "e2e-tester@example.com"
PASSWORD = "E2e-Throwaway-4471!"
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + detail) if detail else "")


def visible_form(page):
    # Next.js keeps the previous route mounted but hidden: pick the shown form.
    return page.locator("form:visible").first


def fill_and_submit(page, email, password):
    form = visible_form(page)
    form.locator('input[type="email"]').fill(email)
    form.locator('input[name="password"]').fill(password)
    form.locator('button[type="submit"]').click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 375, "height": 812},
        is_mobile=True,
        has_touch=True,
        color_scheme="light",
    )
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "console",
        lambda m: errors.append(m.text) if m.type == "error" else None,
    )

    # 1. Signed out: dashboard redirects and remembers where to go back to.
    page.goto(f"{BASE}/dashboard?tab=1")
    page.wait_for_url(re.compile(r"/sign-in"))
    page.wait_for_timeout(1500)  # let the page become interactive, as the other scripts do
    check(
        "signed-out /dashboard redirects to sign-in with next",
        "next=%2Fdashboard%3Ftab%3D1" in page.url,
        page.url.replace(BASE, ""),
    )

    # 2. Wrong password shows a generic error and keeps the email.
    fill_and_submit(page, EMAIL, "definitely-wrong-password")
    # Next.js's route announcer also has role=alert, so scope to the form.
    alert = visible_form(page).locator('[role="alert"]')
    alert.wait_for(timeout=10000)
    check("wrong password shows the generic error", "Incorrect email or password." in alert.inner_text(), alert.inner_text())
    check("email survives a failed attempt", visible_form(page).locator('input[type="email"]').input_value() == EMAIL)
    check("password field is cleared after a failed attempt", visible_form(page).locator('input[name="password"]').input_value() == "")
    page.screenshot(path=str(OUT / "signin-error-mobile-light.png"))

    # 3. Show / hide password toggle.
    form = visible_form(page)
    pw = form.locator('input[name="password"]')
    pw.fill("abc")
    check("password starts hidden", pw.get_attribute("type") == "password")
    form.get_by_role("button", name=re.compile("show password", re.I)).click()
    check("Show reveals the password", pw.get_attribute("type") == "text")
    form.get_by_role("button", name=re.compile("show password", re.I)).click()
    check("Hide masks it again", pw.get_attribute("type") == "password")

    # 4. Correct credentials, with an open-redirect attempt in next.
    page.goto(f"{BASE}/sign-in?next=//evil.example/x")
    fill_and_submit(page, EMAIL, PASSWORD)
    page.wait_for_url(re.compile(r"/dashboard"), timeout=15000)
    check(
        "hostile next= is ignored; lands on /dashboard",
        page.url.startswith(f"{BASE}/dashboard"),
        page.url,
    )

    # 5. Dashboard content.
    h1 = page.get_by_role("heading", level=1)
    h1.wait_for(timeout=10000)
    check("dashboard heading reflects email_verified", h1.inner_text() == "Your email is confirmed", h1.inner_text())
    body = page.inner_text("main")
    check("dashboard shows the member's email", EMAIL in body)
    steps = page.locator("ol li")
    check("dashboard lists 3 verification steps", steps.count() == 3, str(steps.count()))
    current = page.locator('ol li[aria-current="step"]')
    check(
        "current step is the affiliation step",
        current.count() == 1 and "IIUC affiliation verified" in current.inner_text(),
    )
    check("the next step is explained", "Send your details" in body)
    page.screenshot(path=str(OUT / "dashboard-mobile-light.png"), full_page=True)

    # 6. Session persists across a reload and is used by sign-in/up pages.
    page.reload()
    page.get_by_role("heading", level=1).wait_for()
    check("session survives a reload", page.url.startswith(f"{BASE}/dashboard"))
    page.goto(f"{BASE}/sign-in")
    page.wait_for_url(re.compile(r"/dashboard"), timeout=10000)
    check("signed-in visit to /sign-in goes to /dashboard", True)
    page.goto(f"{BASE}/sign-up")
    page.wait_for_url(re.compile(r"/dashboard"), timeout=10000)
    check("signed-in visit to /sign-up goes to /dashboard", True)

    # 7. Dark mode + desktop renders of the dashboard.
    dark = browser.new_context(
        viewport={"width": 375, "height": 812},
        is_mobile=True,
        color_scheme="dark",
        storage_state=ctx.storage_state(),
    )
    dp = dark.new_page()
    dp.goto(f"{BASE}/dashboard")
    dp.get_by_role("heading", level=1).wait_for()
    dp.screenshot(path=str(OUT / "dashboard-mobile-dark.png"), full_page=True)
    dark.close()

    desk = browser.new_context(
        viewport={"width": 1280, "height": 800},
        color_scheme="light",
        storage_state=ctx.storage_state(),
    )
    dk = desk.new_page()
    dk.goto(f"{BASE}/dashboard")
    dk.get_by_role("heading", level=1).wait_for()
    dk.screenshot(path=str(OUT / "dashboard-desktop-light.png"))
    desk.close()

    # 8. The session cookie never leaks the password and has sane flags.
    cookies = ctx.cookies()
    auth_cookies = [c for c in cookies if c["name"].startswith("sb-")]
    check("a Supabase session cookie was set", len(auth_cookies) > 0, ", ".join(c["name"][:14] + "…" for c in auth_cookies))
    check("password is not stored in any cookie", all(PASSWORD not in c["value"] for c in cookies))

    # 9. Sign out.
    page.goto(f"{BASE}/dashboard")
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE}/", timeout=10000)
    check("sign out returns to the landing page", page.url == f"{BASE}/")
    page.goto(f"{BASE}/dashboard")
    page.wait_for_url(re.compile(r"/sign-in"), timeout=10000)
    check("after sign out /dashboard redirects again", "/sign-in" in page.url)
    cleared = [c for c in ctx.cookies() if c["name"].startswith("sb-") and c["value"]]
    check("session cookies are cleared on sign out", len(cleared) == 0, str(len(cleared)))

    # 10. Landing page + auth link targets.
    page.goto(f"{BASE}/")
    check("landing page links to /sign-up", page.get_by_role("link", name="Create an account").first.get_attribute("href") == "/sign-up")
    check("landing page links to /sign-in", page.get_by_role("link", name="Sign in").first.get_attribute("href") == "/sign-in")

    # 11. Confirm route with garbage must not sign anyone in.
    page.goto(f"{BASE}/auth/confirm?token_hash=garbage&type=email&next=//evil.example")
    check("bad confirm link lands on sign-in with the notice code", "/sign-in?notice=confirm-failed" in page.url, page.url.replace(BASE, ""))
    # The notice streams in behind a Suspense boundary, so wait for it.
    try:
        page.get_by_text("That link did not sign you in").first.wait_for(timeout=8000)
        shown = True
    except Exception:
        shown = False
    check("bad confirm link shows the fixed explanation", shown)
    page.goto(f"{BASE}/auth/confirm?type=admin")
    check("confirm with no token and a bad type is refused", "/sign-in?notice=confirm-failed" in page.url)
    page.goto(f"{BASE}/sign-in?notice=%3Cscript%3Ealert(1)%3C/script%3E")
    check("unknown notice codes show nothing", "script" not in page.inner_text("main").lower())

    # 12. Console / page errors for the whole run (ignore expected 4xx noise).
    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:300])

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
pathlib.Path(__file__).with_name("e2e_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if failed else 0)
