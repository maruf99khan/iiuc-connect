"""Lab performance of signed-in pages (LCP, CLS, TTFB, bytes) under Slow 4G and 4x CPU.

Run against a PRODUCTION build (npm run build; npm run start), not npm run dev.
Needs one verified account; seed and clean-up SQL are in the evidence file
docs/evidence/2026-11-25_signed_in_performance.txt.

    python e2e/perf_signed_in.py [runs] [3g]

A second argument "3g" uses Chrome's "Slow 3G" preset (400 kbps both ways, 2000 ms latency).
"first byte" is the pre-rendered shell, sent at once; "doc end" is when the streamed, database-backed
part of the document finishes, which is where the server and database time shows.

Signs in once with no throttle, saves the cookies, then for every page and run opens a
NEW context with those cookies (cold HTTP cache) and throttles through the DevTools
protocol: 1.6 Mbps down, 750 kbps up, 562.5 ms latency (Chrome's "Slow 4G" preset, as in the
sign-in measurement), CPU 4x, 375x812 at device pixel ratio 2, mobile.
The server runs on this machine, so the throttle supplies all network delay; the database
is the real hosted one in Singapore. Prints one line per page and writes e2e/perf_results.json.
"""
import json
import pathlib
import re
import statistics
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
CREDS = ("e2e-perf-viewer@example.com", "Perf-Throwaway-5521!")
PAGES = {
    "dashboard": "/dashboard",
    "directory": "/directory",
    "directory ?q=python": "/directory?q=python",
    "jobs": "/jobs",
    "sessions": "/sessions",
}
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 5
SLOW3G = "3g" in sys.argv[2:]
NET = (400e3, 400e3, 2000) if SLOW3G else (1.6e6, 750e3, 562.5)

OBSERVE = """
window.__lcp = 0; window.__cls = 0;
new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
  .observe({type: 'largest-contentful-paint', buffered: true});
new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
  .observe({type: 'layout-shift', buffered: true});
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 375, "height": 812})
    page = ctx.new_page()
    page.goto(f"{BASE}/sign-in")
    page.wait_for_timeout(1500)
    f = page.locator("main form:visible").first
    f.locator('input[type="email"]').fill(CREDS[0])
    f.locator('input[name="password"]').fill(CREDS[1])
    f.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/dashboard"), timeout=20000)
    state = ctx.storage_state()
    ctx.close()

    out = {}
    for name, path in PAGES.items():
        rows = []
        for _ in range(RUNS):
            c = browser.new_context(storage_state=state, viewport={"width": 375, "height": 812},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
            c.add_init_script(OBSERVE)
            pg = c.new_page()
            cdp = c.new_cdp_session(pg)
            cdp.send("Network.enable")
            cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {
                "offline": False, "latency": NET[2],
                "downloadThroughput": NET[0] / 8, "uploadThroughput": NET[1] / 8})
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            nbytes = [0]
            cdp.on("Network.loadingFinished", lambda e: nbytes.__setitem__(0, nbytes[0] + e["encodedDataLength"]))
            pg.goto(BASE + path, wait_until="load", timeout=90000)
            pg.get_by_role("heading", level=1).first.wait_for(timeout=30000)
            pg.wait_for_timeout(2500)  # let LCP and layout shifts settle
            nav = pg.evaluate("(() => { const n = performance.getEntriesByType('navigation')[0];"
                              " return {ttfb: n.responseStart, docend: n.responseEnd, load: n.loadEventEnd}; })()")
            rows.append({"lcp": pg.evaluate("window.__lcp"), "cls": pg.evaluate("window.__cls"),
                         "ttfb": nav["ttfb"], "docend": nav["docend"], "load": nav["load"], "kb": nbytes[0] / 1024,
                         "url": pg.url})
            c.close()
        out[name] = rows
        m = lambda k: statistics.median(r[k] for r in rows)
        landed = {r["url"].replace(BASE, "") for r in rows}
        print(f"{name:<22} LCP med {m('lcp'):6.0f} ms  (min {min(r['lcp'] for r in rows):.0f}, "
              f"max {max(r['lcp'] for r in rows):.0f})  first byte {m('ttfb'):4.0f}  doc end {m('docend'):5.0f}  load {m('load'):6.0f}  "
              f"CLS {max(r['cls'] for r in rows):.3f}  {m('kb'):5.0f} kB  -> {sorted(landed)}")
    pathlib.Path(__file__).with_name("perf_results_3g.json" if SLOW3G else "perf_results.json").write_text(json.dumps(out, indent=1))
    browser.close()
