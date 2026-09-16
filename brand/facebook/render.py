"""Render every src/*.html to out/<name>.png at the WxH in its filename (headless Chromium, css scale)."""
import re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
src = Path(__file__).parent / "src"; out = Path(__file__).parent / "out"; out.mkdir(exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for html in sorted(src.glob("*.html")):
        w, h = map(int, re.search(r"(\d+)x(\d+)", html.stem).groups())
        p = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        p.goto(html.resolve().as_uri()); p.wait_for_timeout(400)  # fonts are inlined; settle
        p.evaluate("document.fonts.ready")
        p.screenshot(path=str(out / f"{html.stem}.png"), scale="css", full_page=False)
        print("rendered", html.stem, w, h); p.close()
    b.close()
