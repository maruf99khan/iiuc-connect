import json, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
B="http://localhost:3000"
env=dict(l.strip().split("=",1) for l in open(str(__import__("pathlib").Path(__file__).resolve().parents[1] / ".env.local"),encoding="utf-8") if "=" in l and not l.startswith("#"))
U,K=env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
def api(path,method="GET",body=None):
    r=urllib.request.Request(U+path,method=method,headers={"apikey":K,"Content-Type":"application/json"},data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(r) as x: return x.status,x.read().decode()[:150]
    except urllib.error.HTTPError as e: return e.code,e.read().decode()[:150]
FAILS=[]
def out(n,v): print(n,"->",v)
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(); pg=c.new_page()
    # signed-out redirects
    for path in ["/dashboard","/verify","/admin/verifications","/profile","/directory","/members/00000000-0000-0000-0000-000000000000","/sessions"]:
        r=pg.goto(B+path); out("redirect "+path,pg.url.replace(B,""))
    # open redirect
    for nxt in ["//evil.com","https://evil.com","/\evil.com","/%2f%2fevil.com","javascript:alert(1)"]:
        pg.goto(B+"/sign-in?next="+nxt); out("next="+nxt,pg.url.replace(B,"") or "/")
    # 404, headers
    r=pg.goto(B+"/nope"); out("404 status",r.status)
    r=pg.goto(B+"/"); h=r.headers
    for k in ["content-security-policy","x-frame-options","x-content-type-options","referrer-policy","strict-transport-security","permissions-policy"]:
        out("header "+k,h.get(k))
        if not h.get(k): FAILS.append("missing header "+k)
    # cron
    out("cron no auth",pg.request.get(B+"/api/cron/purge-evidence").status)
    out("cron bad auth",pg.request.get(B+"/api/cron/purge-evidence",headers={"Authorization":"Bearer x"}).status)
    out("confirm bad",pg.request.get(B+"/auth/confirm?token_hash=x&type=email",max_redirects=0).status)
    out("confirm next evil",pg.request.get(B+"/auth/confirm?token_hash=x&type=email&next=//evil.com",max_redirects=0).headers.get("location"))
    # anon DB
    for t in ["profiles","profile_private","verification_requests","verification_documents","verification_events","mentor_profiles","mentor_availability_rules","mentor_slots","mentorship_requests","sessions","session_feedback","jobs","job_applications","notifications"]:
        out("anon select "+t,api(f"/rest/v1/{t}?select=*&limit=3"))
    out("anon rpc purge",api("/rest/v1/rpc/evidence_purge_candidates","POST",{"p_retention_days":0,"p_limit":5}))
    out("anon storage list",api("/storage/v1/object/list/verification-documents","POST",{"prefix":""}))
    # a11y/overflow on public pages at 320
    c2=b.new_context(viewport={"width":320,"height":640}); q=c2.new_page()
    for path in ["/","/sign-in","/sign-up","/forgot-password"]:
        q.goto(B+path); q.wait_for_timeout(800)
        out("overflow320 "+path,q.evaluate("document.documentElement.scrollWidth>innerWidth"))
    b.close()

import sys
print("FAILED:",FAILS) if FAILS else print("all required headers present")
sys.exit(1 if FAILS else 0)
