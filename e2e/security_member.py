import json, re, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
B="http://localhost:3000"
env=dict(l.strip().split("=",1) for l in open(str(__import__("pathlib").Path(__file__).resolve().parents[1] / ".env.local"),encoding="utf-8") if "=" in l and not l.startswith("#"))
U,K=env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
def api(path,method="GET",body=None,tok=None):
    h={"apikey":K,"Content-Type":"application/json"}
    if tok:h["Authorization"]="Bearer "+tok
    r=urllib.request.Request(U+path,method=method,headers=h,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r) as x:
            t=x.read().decode(); return x.status,(json.loads(t) if t else None)
    except urllib.error.HTTPError as e: return e.code,e.read().decode()[:200]
EM,PW="audit-user@example.com","Audit-Throwaway-7741!"
print("signup",api("/auth/v1/signup","POST",{"email":EM,"password":PW,"data":{"full_name":"Audit User"}})[0])
def out(n,v): print(n,"->",v)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context().new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    # login with hostile next
    for nxt in ["//evil.com","https://evil.com","/\\evil.com"]:
        pg.goto(B+"/sign-in?next="+nxt); pg.wait_for_timeout(1200)
        f=pg.locator("main form:visible").first
        f.locator('input[type="email"]').fill(EM); f.locator('input[name="password"]').fill(PW); f.locator('button[type="submit"]').click()
        pg.wait_for_url(re.compile(r"localhost:3000"),timeout=20000); pg.wait_for_timeout(2500)
        out("login next="+nxt,pg.url)
        pg.context.clear_cookies()
    f=None
    pg.goto(B+"/sign-in"); pg.wait_for_timeout(1200)
    f=pg.locator("main form:visible").first
    f.locator('input[type="email"]').fill(EM); f.locator('input[name="password"]').fill(PW); f.locator('button[type="submit"]').click()
    pg.wait_for_url(re.compile(r"/dashboard"),timeout=20000); pg.wait_for_timeout(1500)
    # unverified access
    for path in ["/directory","/admin/verifications","/sessions","/members/"+api("/auth/v1/token?grant_type=password","POST",{"email":EM,"password":PW})[1]["user"]["id"]]:
        r=pg.goto(B+path); pg.wait_for_timeout(2000)
        out("unverified "+path[:25],(r.status,pg.url.replace(B,""),pg.inner_text("main")[:110].replace("\n"," | ")))
    # XSS in profile
    pg.goto(B+"/profile?edit=1"); pg.wait_for_timeout(1500)
    pf=pg.locator("main form:visible").first
    payload='<img src=x onerror=window.__x=1>"><script>window.__x=1</script>'
    pf.get_by_label(re.compile("Headline")).fill(payload)
    pf.get_by_role("button",name=re.compile("Save",re.I)).click(); pg.wait_for_timeout(3000)
    out("xss executed",pg.evaluate("window.__x||false"))
    out("profile after save",pg.inner_text("main")[:200].replace("\n"," | "))
    # privileged column writes via API
    t=api("/auth/v1/token?grant_type=password","POST",{"email":EM,"password":PW})[1]["access_token"]
    uid=api("/auth/v1/user","GET",None,t)[1]["id"]
    for col,val in [("role","admin"),("verification_status","verified_alumni"),("affiliation","alumni"),("reputation_score",999)]:
        out("PATCH "+col,api(f"/rest/v1/profiles?id=eq.{uid}","PATCH",{col:val},t)[0])
    out("self-approve request",api("/rest/v1/verification_requests","POST",{"user_id":uid,"status":"approved","claimed_affiliation":"alumni"},t)[0])
    out("read others' profile_private",api("/rest/v1/profile_private?select=*",tok=t))
    out("storage foreign path",api("/storage/v1/object/verification-documents/"+"00000000-0000-0000-0000-000000000000/x.png",tok=t)[0])
    out("page errors",errs)
    b.close()
