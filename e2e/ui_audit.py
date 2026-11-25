"""Visual and accessibility audit of every page (D-031): screenshots plus axe-core.

Visits each route at 375, 768 and 1280 px wide in light and dark mode, saves a screenshot per
combination in e2e/shots/ui/, runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) at 375 and 1280, and
exits 1 on any serious or critical violation. Also fails on horizontal overflow.

    python e2e/ui_audit.py                 # every route
    python e2e/ui_audit.py --routes /,/directory
    python e2e/ui_audit.py --no-shots      # axe and overflow only (faster)

Run against npm run dev (or a production build on :3000). Needs one verified account; seed with
execute_sql or the SQL editor, delete afterwards:

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
        encrypted_password, raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
        created_at, updated_at)
    values ('e2e70000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','e2e-ui-audit@example.com', now(),
        extensions.crypt('<PASSWORD below>', extensions.gen_salt('bf')),
        '{"provider":"email","providers":["email"]}','{}','','','','','','','','', now(), now());
    insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                 last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', u.id::text, now(), now(), now()
      from auth.users u where u.email = 'e2e-ui-audit@example.com';
    select private.transition_verification(id, 'verified_student', null, 'e2e', null)
      from public.profiles where id = 'e2e70000-0000-4000-8000-000000000001';
    update public.profiles set full_name = 'Ayesha Audit', affiliation = 'student',
           department = 'CSE', batch = 2022 where id = 'e2e70000-0000-4000-8000-000000000001';

Clean up afterwards:  delete from auth.users where email = 'e2e-ui-audit@example.com';
The admin page needs an admin account and is not covered here; check it by hand.
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
CREDS = ("e2e-ui-audit@example.com", "Audit-Throwaway-4417!")
ROOT = pathlib.Path(__file__).parent
SHOTS = ROOT / "shots" / "ui"
AXE = ROOT.parent / "node_modules" / "axe-core" / "axe.min.js"

PUBLIC = ["/", "/sign-in", "/sign-up", "/forgot-password"]
SIGNED_IN = ["/dashboard", "/directory", "/directory?q=python", "/jobs", "/jobs/new", "/sessions",
             "/notifications", "/profile", "/verify"]
SIZES = {"375": (375, 812), "768": (768, 1024), "1280": (1280, 800)}
AXE_SIZES = {"375", "1280"}
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

args = sys.argv[1:]
only = None
if "--routes" in args:
    only = args[args.index("--routes") + 1].split(",")
want_shots = "--no-shots" not in args


def slug(route):
    return re.sub(r"[^a-z0-9]+", "-", route.lower()).strip("-") or "home"


def sign_in(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(CREDS[0])
    f.locator('input[name="password"]').fill(CREDS[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=30000)
    state = ctx.storage_state()
    ctx.close()
    return state


def discover(browser, state):
    """First member and first job links, so the detail pages are audited too."""
    ctx = browser.new_context(storage_state=state, viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    found = []
    for listing, prefix in (("/directory", "/members/"), ("/jobs", "/jobs/")):
        page.goto(BASE + listing)
        page.wait_for_timeout(1500)
        for a in page.locator(f'main a[href^="{prefix}"]').all():
            href = a.get_attribute("href")
            if href and href != "/jobs/new" and "/" not in href[len(prefix):]:
                found.append(href)
                break
    ctx.close()
    return found


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        state = sign_in(browser)
        routes = [(r, False) for r in PUBLIC] + [(r, True) for r in SIGNED_IN]
        routes += [(r, True) for r in discover(browser, state)]
        if only:
            routes = [(r, s) for r, s in routes if r in only]
        for route, signed in routes:
            for scheme in ("light", "dark"):
                for size, (w, h) in SIZES.items():
                    ctx = browser.new_context(
                        viewport={"width": w, "height": h}, color_scheme=scheme,
                        is_mobile=(w < 768), has_touch=(w < 768),
                        storage_state=state if signed else None,
                    )
                    page = ctx.new_page()
                    page.goto(BASE + route, wait_until="load")
                    page.wait_for_timeout(1200)
                    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    if over > 0:
                        problems.append(f"{route} {size} {scheme}: horizontal overflow {over}px")
                    if want_shots:
                        page.screenshot(path=str(SHOTS / f"{slug(route)}-{size}-{scheme}.png"), full_page=True)
                    if size in AXE_SIZES:
                        page.add_script_tag(path=str(AXE))
                        res = page.evaluate(
                            "tags => axe.run(document, {runOnly: {type: 'tag', values: tags}})", TAGS)
                        for v in res["violations"]:
                            if v["impact"] in ("serious", "critical"):
                                nodes = "; ".join(n["target"][0] if n["target"] else "?" for n in v["nodes"][:3])
                                problems.append(f"{route} {size} {scheme}: [{v['impact']}] {v['id']} - {v['help']} ({len(v['nodes'])}) e.g. {nodes}")
                    ctx.close()
            print(f"checked {route}")
        browser.close()
    seen = []
    for line in problems:
        if line not in seen:
            seen.append(line)
            print("PROBLEM", line)
    print(f"{len(seen)} problem(s) in {len(routes)} route(s)")
    sys.exit(1 if seen else 0)


main()
