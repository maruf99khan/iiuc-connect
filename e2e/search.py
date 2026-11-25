"""Browser check of the ranked, typo-tolerant directory search (D-029) against the dev server.

Unlike directory.py this needs no empty database: it uses rare made-up words
("zymurgy", "quillfeather") that cannot collide with the demo data or real
accounts, and it only creates (and afterwards deletes) its own five accounts.

Seed (run with execute_sql or the SQL editor) before the script:

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
        encrypted_password, raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
        created_at, updated_at)
    select ('e2e50000-0000-4000-8000-0000000000' || lpad(v.n::text, 2, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           v.email, now(), extensions.crypt('<PASSWORD below>', extensions.gen_salt('bf')),
           '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '',
           now(), now()
      from (values (1,'e2e-search-viewer@example.com'), (2,'e2e-search-b@example.com'),
                   (3,'e2e-search-c@example.com'), (4,'e2e-search-d@example.com'),
                   (5,'e2e-search-e@example.com')) v(n, email);
    -- Password sign-in fails with "Database error querying schema" without created_at,
    -- updated_at and an identity row.
    insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                 last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', u.id::text, now(), now(), now()
      from auth.users u where u.email like 'e2e-search-%@example.com';
    select private.transition_verification(id, 'verified_student', null, 'e2e', null)
      from public.profiles where id::text like 'e2e50000-%';
    update public.profiles set full_name = 'Vic Searcher'                  where id = 'e2e50000-0000-4000-8000-000000000001';
    update public.profiles set full_name = 'Zoran Zymurgy'                 where id = 'e2e50000-0000-4000-8000-000000000002';
    update public.profiles set full_name = 'Zafar Quillfeather', skills = '{zymurgy}', headline = 'Data engineer',
                               affiliation = 'alumni'                      where id = 'e2e50000-0000-4000-8000-000000000003';
    update public.profiles set full_name = 'Zeba Marlowe', bio = 'I dabble in zymurgy at weekends.'
                                                                           where id = 'e2e50000-0000-4000-8000-000000000004';
    update public.profiles set full_name = 'Zara Hiddenfield', skills = '{zymurgy}', visibility = 'private'
                                                                           where id = 'e2e50000-0000-4000-8000-000000000005';
    update public.profiles set affiliation = 'student' where id::text like 'e2e50000-%' and affiliation is null;

Clean up afterwards:  delete from auth.users where email like 'e2e-search-%@example.com';
"""
import json
import pathlib
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
VIEWER = ("e2e-search-viewer@example.com", "Search-Throwaway-7741!")
OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + str(detail)) if detail else "")


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


def search(page, q="", who=""):
    params = {}
    if q:
        params["q"] = q
    if who:
        params["who"] = who
    page.goto(f"{BASE}/directory" + ("?" + urllib.parse.urlencode(params) if params else ""))
    return names(page)


RANKED = ["Zoran Zymurgy", "Zafar Quillfeather", "Zeba Marlowe"]  # name, skill, bio

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    ctx = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme="light")
    v = ctx.new_page()
    v.on("pageerror", lambda e: errors.append(str(e)))
    v.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    sign_in(v, VIEWER)

    # Ranking: a name match, then a skill match, then a bio mention
    check("'zymurgy' ranks name, then skill, then bio", search(v, "zymurgy") == RANKED, str(names(v)))
    check("the private member with that skill is never listed", "Zara Hiddenfield" not in names(v))
    check("the count is shown", status(v) == "3 members", status(v))

    # Typo tolerance
    check("a misspelt word ('zymurgi') still finds all three, in the same order", search(v, "zymurgi") == RANKED, str(names(v)))
    v.screenshot(path=str(OUT / "search-typo-mobile-light.png"), full_page=True)
    check("a misspelt name ('quilfeather') finds the person", search(v, "quilfeather") == ["Zafar Quillfeather"])
    check("search ignores case", search(v, "QUILLFEATHER") == ["Zafar Quillfeather"])
    check("the start of a word ('quillf') finds the person", search(v, "quillf") == ["Zafar Quillfeather"])

    # Every word must match; filters
    check("every word must match", search(v, "zymurgy sailing") == [])
    check("no match says so", "No members match" in status(v), status(v))
    check("the graduates filter narrows a search", search(v, "zymurgy", who="alumni") == ["Zafar Quillfeather"])
    check("the students filter keeps the order", search(v, "zymurgy", who="student") == ["Zoran Zymurgy", "Zeba Marlowe"])

    # Hostile input: nothing found, no error
    for hostile in ["%", "_", "\\", "' or 1=1 --", "<script>alert(1)</script>", "x" * 300]:
        got = search(v, hostile)
        ok = got == [] and "could not load" not in v.inner_text("main").lower()
        check(f"hostile search {hostile[:18]!r} returns nothing and no error", ok, str(got)[:60])
    v.goto(f"{BASE}/directory?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    v.get_by_role("heading", level=1).wait_for()
    check("the search box shows typed markup as text", v.locator("#directory-q").input_value() == "<script>alert(1)</script>")

    # Through the form, as a person would
    v.goto(f"{BASE}/directory")
    v.get_by_role("heading", level=1).wait_for()
    v.locator("#directory-q").fill("zymurgi")
    v.get_by_role("button", name="Search").click()
    v.wait_for_url(re.compile(r"q=zymurgi"), timeout=15000)
    check("typing a misspelt word into the form and pressing Search works", names(v) == RANKED, str(names(v)))

    # Dark render
    dctx = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, color_scheme="dark")
    d = dctx.new_page()
    d.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(d, VIEWER)
    search(d, "zymurgi")
    d.screenshot(path=str(OUT / "search-typo-mobile-dark.png"), full_page=True)

    real = [e for e in errors if "Failed to load resource" not in e]
    check("no uncaught page errors during the run", len(real) == 0, "; ".join(real)[:400])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
(pathlib.Path(__file__).parent / "search_results.json").write_text(json.dumps(results, indent=2))
sys.exit(1 if bad else 0)
