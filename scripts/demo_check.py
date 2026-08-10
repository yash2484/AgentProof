"""Demo-readiness gate.

The handover's §4.4 in executable form: the landing view must be the
measured corpus, and no generated-data marker may appear anywhere a
screenshot could catch it.

Fails loudly rather than reporting, because the whole point is that this
cannot be waved through.
"""

import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
EXPECTED_PROJECT = "demo-research-agent"
# The badge's own text and the generated project's id. Deliberately not a
# bare "generated": the judge's real reasoning says things like "agents
# generate false or fabricated information", and flagging that would be
# flagging the evidence rather than the fabrication.
FORBIDDEN = ["generated data", "synthetic-showcase"]


def main() -> int:
    with urllib.request.urlopen("http://localhost:8000/api/v1/traces?limit=1") as r:
        trace_id = json.loads(r.read())["traces"][0]["trace_id"]

    routes = {
        "overview": "/",
        "traces": "/traces",
        "evals": "/evals",
        "security": "/security",
        "metric": "/evals/faithfulness",
        "trace": f"/traces/{trace_id}",
    }

    failures: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        for name, path in routes.items():
            page = ctx.new_page()
            page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=60_000)
            page.wait_for_timeout(1200)

            badge = page.locator("[data-testid=synthetic-badge]").count()
            if badge:
                failures.append(f"{name}: {badge} synthetic badge(s) on screen")

            body = (page.inner_text("body") or "").lower()
            for term in FORBIDDEN:
                if term in body:
                    failures.append(f"{name}: page text contains {term!r}")

            page.close()

        # The landing scope itself, read from the rail rather than assumed.
        page = ctx.new_page()
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)
        scope = page.locator("[data-testid=scope-bar]").inner_text()
        if EXPECTED_PROJECT not in scope:
            failures.append(f"landing scope is {scope!r}, expected {EXPECTED_PROJECT!r}")
        page.close()
        browser.close()

    if failures:
        print("DEMO CHECK FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print(f"DEMO CHECK PASSED — landing on {EXPECTED_PROJECT}, no generated-data marker on any route")
    return 0


if __name__ == "__main__":
    sys.exit(main())
