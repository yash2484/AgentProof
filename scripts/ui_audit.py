"""Ledger visual + accessibility audit.

The browser half of the gate described in `docs/handover-ledger-frontend.md`:
zero horizontal overflow, zero console errors, WCAG AA contrast, at 1440px
and 390px across every route.

Walks each route at both viewports and reports, per page:
  - console errors and page errors
  - horizontal overflow (documentElement.scrollWidth > clientWidth) and the
    specific elements responsible, which is the part that makes it fixable
  - computed body background and the three font families actually resolved
    (this is what catches a font stack that silently failed to apply)
  - a WCAG AA contrast sweep over every rendered text node, measured against
    the nearest painted ancestor rather than an assumed background

Screenshots land in --shots-dir at device_scale_factor=2, which is the
capture setting for anything that will be looked at rather than diffed.

Requires the stack up (`docker compose up -d`) and playwright installed.

Usage:
    python scripts/ui_audit.py
    python scripts/ui_audit.py --only overview,traces --shots-dir shots

Exits 0 always; read the summary table. It reports rather than gates so it
can be run mid-change without fighting you — `demo_check.py` is the one
that fails the build.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

ROUTES = {
    "overview": "/",
    "traces": "/traces",
    "evals": "/evals",
    "security": "/security",
    # faithfulness is the judged metric present in both corpora, and the one
    # the demo path opens.
    "metric": "/evals/faithfulness",
}

# Routes that need a real id from the API, resolved at run time.
DYNAMIC_ROUTES = {"trace": "/traces/{trace_id}"}

VIEWPORTS = {"desktop": (1440, 900), "mobile": (390, 844)}

# Reports every text node's computed contrast against its nearest painted
# ancestor background. Elements are skipped when they are invisible, empty,
# or sit on an image/gradient where a single ratio would be a lie.
CONTRAST_JS = r"""
() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });

  const bgOf = (el) => {
    let node = el, acc = null;
    while (node && node !== document.documentElement.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // unmeasurable
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 1) return acc; }
      node = node.parentElement;
    }
    return acc || { r: 255, g: 255, b: 255, a: 1 };
  };

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a === 0) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const r = ratio(over(fg, bg), bg);
    const floor = large ? 3.0 : 4.5;
    if (r < floor) {
      out.push({
        text: el.textContent.trim().slice(0, 60),
        tag: el.tagName.toLowerCase(),
        ratio: Math.round(r * 100) / 100,
        floor, size, weight,
        color: cs.color, background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  }
  return out;
}
"""

OVERFLOW_JS = r"""
() => {
  const de = document.documentElement;
  const overflow = de.scrollWidth - de.clientWidth;
  const culprits = [];
  // An element inside a scrollable/clipped ancestor still reports a wide
  // rect even though it is visually clipped and contributes nothing to the
  // document's own scrollWidth. Reporting those buries the one element that
  // is actually pushing the page wide (a DataGrid alone yields six).
  const clipped = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n);
      if (/auto|scroll|hidden/.test(o.overflowX + o.overflowY)) return true;
    }
    return false;
  };
  if (overflow > 0) {
    for (const el of document.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.right > de.clientWidth + 1 && b.width > 0 && !clipped(el)) {
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
          right: Math.round(b.right), width: Math.round(b.width),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    }
  }
  return { overflow, culprits: culprits.slice(0, 8) };
}
"""

STYLE_JS = r"""
() => {
  const body = getComputedStyle(document.body);
  const pick = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '') : null; };
  return {
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    bodyFont: body.fontFamily.split(',')[0].replace(/"/g, ''),
    colorScheme: document.querySelector('meta[name=color-scheme]')?.content ?? null,
    loadedFonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family),
    serifSample: pick('h1, h2, h3, h4, h5, h6'),
  };
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated route names")
    ap.add_argument("--shots-dir", default="shots")
    ap.add_argument("--query", default="", help="extra query string, e.g. project=demo-research-agent")
    args = ap.parse_args()

    routes = dict(ROUTES)

    # The full-trace page needs a real id. Take the first trace the API
    # returns rather than hard-coding one, so this works against either
    # corpus.
    try:
        import urllib.request

        with urllib.request.urlopen("http://localhost:8000/api/v1/traces?limit=1", timeout=10) as r:
            traces = json.loads(r.read())["traces"]
        if traces:
            routes["trace"] = DYNAMIC_ROUTES["trace"].format(trace_id=traces[0]["trace_id"])
    except Exception as exc:  # noqa: BLE001 - diagnostic only
        print(f"! could not resolve a trace id, skipping /traces/:id ({exc})", file=sys.stderr)

    if args.only:
        want = {s.strip() for s in args.only.split(",")}
        routes = {k: v for k, v in routes.items() if k in want}

    shots = Path(args.shots_dir)
    shots.mkdir(parents=True, exist_ok=True)

    report: dict = {}
    failures = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for vp_name, (w, h) in VIEWPORTS.items():
            ctx = browser.new_context(
                viewport={"width": w, "height": h}, device_scale_factor=2
            )
            for name, path in routes.items():
                page = ctx.new_page()
                errors: list[str] = []
                page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

                url = f"{BASE}{path}"
                if args.query:
                    url += ("&" if "?" in url else "?") + args.query
                page.goto(url, wait_until="networkidle", timeout=60_000)
                page.wait_for_timeout(1200)  # charts settle

                styles = page.evaluate(STYLE_JS)
                of = page.evaluate(OVERFLOW_JS)
                contrast = page.evaluate(CONTRAST_JS)

                page.screenshot(path=str(shots / f"{name}-{vp_name}.png"), full_page=True)

                key = f"{name}/{vp_name}"
                report[key] = {
                    "console_errors": errors,
                    "overflow_px": of["overflow"],
                    "overflow_culprits": of["culprits"],
                    "contrast_failures": contrast,
                    "styles": styles,
                }
                if errors or of["overflow"] > 0 or contrast:
                    failures += 1
                page.close()
            ctx.close()
        browser.close()

    print(json.dumps(report, indent=1))
    print("\n" + "=" * 60)
    for key, r in report.items():
        bits = []
        if r["console_errors"]:
            bits.append(f"{len(r['console_errors'])} console err")
        if r["overflow_px"] > 0:
            bits.append(f"overflow {r['overflow_px']}px")
        if r["contrast_failures"]:
            bits.append(f"{len(r['contrast_failures'])} contrast")
        print(f"{key:24} {'CLEAN' if not bits else ' | '.join(bits)}")
    print("=" * 60)
    print(f"pages with findings: {failures}/{len(report)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
