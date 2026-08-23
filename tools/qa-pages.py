#!/usr/bin/env python3
"""
qa-pages.py — the codified pre-deploy gate for the Applied Intelligence site.

Re-runnable at any time, from anywhere:

    python3 tools/qa-pages.py            # serves the repo on :8808, runs, tears down
    python3 tools/qa-pages.py --port 9100
    python3 tools/qa-pages.py --pages work.html --configs mobile

It starts its OWN static server (a threaded http.server with gzip + Range, so
the byte numbers look like GitHub Pages rather than like a naked file dump),
drives real Chromium through Playwright, and kills the server on the way out.
Nothing outside this file is touched, and nothing is written to disk.

The matrix is 4 pages x 3 configs. Every assertion collects ALL failures rather
than stopping at the first, so one run tells you everything that is wrong.

  1  no console errors, no page errors, no failed or 4xx+ requests
  2  no horizontal overflow (scrollWidth === clientWidth) after a full scroll
  3  exactly one <h1>, and no heading level skips
  4  form inputs >= 16px (every page); a/button tap targets >= 44x44 (mobile)
  5  CLS < 0.1, on every page, at both viewports
  6  work.html reels: load + play in view, pause out of view, never two at once;
     under reduced motion no <video> ever gets a src and none ever plays, and
     every poster is present, decodable and painted
  7  byte budgets: index first view <= 320 kB, work first view <= 600 kB,
     work full scroll <= 8 MB (measured over the wire, gzip where applicable)
  8  every internal link and anchor resolves; no target=_blank without noopener
  9  every ld+json parses; index has Organization + WebSite (+ the injected
     FAQPage matching SITE.faq); work has CollectionPage (3 CreativeWork
     hasPart) + BreadcrumbList; NO Review or AggregateRating anywhere
 10  honesty strings: the work disclosure is rendered and visible, no
     "before/after" wording near the Goldy chapter, the Goldy self-assessment
     scale caption is rendered, Karine's photograph-derived motion is stated,
     no bare percentages anywhere on work.html, and the 30-Day Promise appears
     in terms.html verbatim from content.js
 11  work.html loads neither gsap nor ScrollTrigger; no page touches a
     non-localhost origin
 12  mark[data-todo] (the ABN gate) is reported as a deploy-blocking WARN
 13  head/social: title, meta description, og:title, og:description and
     og:image on every page, and the og:image resolves to a file on disk
 14  the footer legal links (Terms + Privacy) are present on every page
 15  sitemap.xml lists /, /work.html, /terms.html and /privacy.html, and
     robots.txt points at the sitemap (a one-off, site-level row)

Scrolling is always wheel-driven (the site runs Lenis; scrollTo would skip the
whole scroll-linked layer and hide exactly the bugs this gate is for).

Exit code is 1 if anything FAILs, otherwise 0. Warnings never fail the gate,
they are things a human has to sign off before the deploy.
"""

from __future__ import annotations

import argparse
import gzip as gziplib
import http.server
import json
import os
import re
import socket
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from functools import partial
from pathlib import Path
from urllib.parse import unquote, urlparse

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - environment problem, not a site problem
    sys.stderr.write("playwright is not installed: pip3 install playwright && playwright install chromium\n")
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "work.html", "terms.html", "privacy.html"]
N_CHECKS = 15
ALL_CHECKS = list(range(1, N_CHECKS + 1))
# the four URLs the sitemap has to carry, as site-root-relative paths
SITEMAP_PATHS = {"/", "/work.html", "/terms.html", "/privacy.html"}
PROD_ORIGIN = "https://appliedintelligence.biz"

# ---------------------------------------------------------------------------
# budgets and thresholds (single place to change them)
# ---------------------------------------------------------------------------
BUDGET_FIRST_VIEW = {"index.html": 320_000, "work.html": 600_000}
BUDGET_FULL_SCROLL = {"work.html": 8_000_000}
CLS_LIMIT = 0.1
MIN_INPUT_PX = 16.0
MIN_TAP_PX = 44.0

CONFIGS = {
    # name          viewport            dsf  mobile  touch  reduced
    "desktop":   dict(width=1440, height=900, dsf=1, mobile=False, touch=False, reduced="no-preference"),
    "mobile":    dict(width=390,  height=844, dsf=3, mobile=True,  touch=True,  reduced="no-preference"),
    "mobile-rm": dict(width=390,  height=844, dsf=3, mobile=True,  touch=True,  reduced="reduce"),
}

# ---------------------------------------------------------------------------
# static server: threaded, gzip for text, Range for media, quiet, no caching
# ---------------------------------------------------------------------------
GZIP_TYPES = {
    "text/html", "text/css", "text/plain", "text/xml",
    "application/javascript", "text/javascript", "application/json",
    "image/svg+xml", "application/xml",
}
EXTRA_TYPES = {
    ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4",
    ".webm": "video/webm", ".svg": "image/svg+xml", ".js": "application/javascript",
    ".avif": "image/avif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
}


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # noqa: D102 - silence the access log
        pass

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        return super().guess_type(path)

    def do_GET(self):
        self._serve(with_body=True)

    def do_HEAD(self):
        self._serve(with_body=False)

    def _serve(self, with_body: bool):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if not os.path.isfile(path):
            self.send_error(404, "Not Found")
            return
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_error(404, "Not Found")
            return

        ctype = self.guess_type(path)
        base = (ctype or "").split(";")[0].strip()

        rng = self.headers.get("Range")
        if rng and base not in GZIP_TYPES:
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if m and (m.group(1) or m.group(2)):
                total = len(data)
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else total - 1
                else:  # suffix range: bytes=-500
                    start = max(0, total - int(m.group(2)))
                    end = total - 1
                end = min(end, total - 1)
                if start > end:
                    self.send_error(416, "Requested Range Not Satisfiable")
                    return
                chunk = data[start:end + 1]
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
                self.send_header("Content-Length", str(len(chunk)))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                if with_body:
                    self.wfile.write(chunk)
                return

        encoding = None
        accepts = self.headers.get("Accept-Encoding", "")
        if base in GZIP_TYPES and "gzip" in accepts:
            data = gziplib.compress(data, 6)
            encoding = "gzip"

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if with_body:
            self.wfile.write(data)


class ReusableServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
    address_family = socket.AF_INET


def start_server(port: int):
    handler = partial(QuietHandler, directory=str(ROOT))
    try:
        httpd = ReusableServer(("127.0.0.1", port), handler)
    except OSError as exc:
        raise SystemExit(
            f"cannot bind 127.0.0.1:{port} ({exc}). Something else is on that port — "
            f"pass --port to pick another."
        )
    thread = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
    thread.start()
    return httpd, thread


# ---------------------------------------------------------------------------
# in-page instrumentation, installed before any site script runs
# ---------------------------------------------------------------------------
INIT_JS = r"""
(() => {
  // short, human-readable selector for reporting culprits
  window.__sel = function (n) {
    if (!n) return "(none)";
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el) return "(text)";
    let s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    const cls = (typeof el.className === "string" ? el.className : "").trim();
    if (cls) s += "." + cls.split(/\s+/).slice(0, 3).join(".");
    const p = el.parentElement;
    if (p) s = (p.id ? "#" + p.id : p.tagName.toLowerCase()) + " > " + s;
    // anchor it to the nearest identified ancestor, so three identical
    // "a.visit" offenders read as three different chapters
    const owner = el.parentElement && el.parentElement.closest("[id]");
    if (owner && owner.id && !s.includes("#" + owner.id)) s = "#" + owner.id + " " + s;
    return s;
  };

  // layout shifts, buffered so nothing before this point is lost
  window.__cls = { entries: [], error: null };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const sources = [];
        for (const s of (e.sources || [])) {
          const el = s.node && s.node.nodeType === 1 ? s.node : (s.node ? s.node.parentElement : null);
          sources.push({
            sel: window.__sel(s.node),
            inBook: !!(el && el.closest && el.closest("#book-itself")),
          });
        }
        window.__cls.entries.push({
          value: e.value,
          hadRecentInput: e.hadRecentInput,
          sources: sources,
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (err) {
    window.__cls.error = String(err);
  }

  // every media play attempt, anywhere on the page (capture: media events do not bubble)
  window.__mediaPlay = [];
  ["play", "playing"].forEach((t) => {
    document.addEventListener(t, (e) => {
      const v = e.target;
      if (!v || !v.tagName || v.tagName !== "VIDEO") return;
      const ch = v.closest ? v.closest("article.chapter") : null;
      window.__mediaPlay.push({
        type: t,
        chapter: ch ? ch.id : "",
        cls: typeof v.className === "string" ? v.className : "",
        src: v.getAttribute("src") || "",
      });
    }, true);
  });
})();
"""

SAMPLE_REELS_JS = r"""() => {
  const vids = Array.from(document.querySelectorAll('video[data-src]'));
  return vids.map((v, i) => {
    const r = v.getBoundingClientRect();
    const ch = v.closest('article.chapter');
    return {
      i: i,
      chapter: ch ? ch.id : '',
      src: v.getAttribute('src') || '',
      // currentSrc is the resource the element actually resolved and began
      // fetching; a src attribute can be absent while currentSrc is set.
      currentSrc: v.currentSrc || '',
      readyState: v.readyState,
      paused: v.paused,
      muted: v.muted,
      volume: v.volume,
      loop: v.loop,
      currentTime: v.currentTime,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
    };
  });
}"""

SCROLL_STATE_JS = r"""() => ({
  y: Math.round(window.scrollY),
  h: Math.round(document.documentElement.scrollHeight),
  ih: window.innerHeight,
})"""

OVERFLOW_JS = r"""() => {
  const de = document.documentElement;
  // both yardsticks: clientWidth (layout box) and innerWidth (visual viewport,
  // which is what the gate is written against). They differ only when a
  // classic scrollbar is present, i.e. never in mobile emulation.
  const out = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
                innerWidth: window.innerWidth, offenders: [] };
  if (de.scrollWidth <= Math.max(de.clientWidth, window.innerWidth)) return out;
  const lim = Math.max(de.clientWidth, window.innerWidth);
  const seen = new Set();
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const right = r.right + window.scrollX;
    if (right > lim + 1) {
      const s = window.__sel(el);
      if (!seen.has(s)) { seen.add(s); out.offenders.push({ sel: s, right: Math.round(right) }); }
    }
  });
  out.offenders.sort((a, b) => b.right - a.right);
  out.offenders = out.offenders.slice(0, 8);
  return out;
}"""

HEADINGS_JS = r"""() => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
  level: Number(h.tagName.slice(1)),
  text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
  sel: window.__sel(h),
}))"""

INPUTS_JS = r"""() => Array.from(document.querySelectorAll('input, select, textarea'))
  .filter((el) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'range'].includes((el.type || '').toLowerCase()))
  .map((el) => ({
    sel: window.__sel(el),
    type: (el.type || '').toLowerCase(),
    fontSize: parseFloat(window.getComputedStyle(el).fontSize) || 0,
  }))"""

TAPS_JS = r"""() => {
  const vis = (el) => {
    if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) return false;
    if (el.classList.contains('skip-link')) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  const out = [];
  document.querySelectorAll('a[href], button').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const cs = window.getComputedStyle(el);
    const flow = el.closest('p, li, figcaption, dd, blockquote');
    const inline = cs.display.startsWith('inline') && !cs.display.startsWith('inline-flex')
                   && !cs.display.startsWith('inline-grid');
    out.push({
      sel: window.__sel(el),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      inlineText: !!(flow && inline && !el.classList.contains('btn')),
    });
  });
  return out;
}"""

LINKS_JS = r"""() => {
  const out = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    out.push({
      href: a.getAttribute('href') || '',
      resolved: a.href,
      target: a.getAttribute('target') || '',
      rel: (a.getAttribute('rel') || '').toLowerCase(),
      sel: window.__sel(a),
      text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    });
  });
  return out;
}"""

IDS_JS = r"""() => Array.from(document.querySelectorAll('[id]')).map((el) => el.id)"""

LDJSON_JS = r"""() => Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map((s, i) => ({ i: i, text: s.textContent || '' }))"""

META_JS = r"""() => {
  const attr = (sel, a) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute(a) || '').trim() : null;
  };
  return {
    title: (document.title || '').trim(),
    description: attr('meta[name="description"]', 'content'),
    ogTitle: attr('meta[property="og:title"]', 'content'),
    ogDescription: attr('meta[property="og:description"]', 'content'),
    ogImage: attr('meta[property="og:image"]', 'content'),
    ogUrl: attr('meta[property="og:url"]', 'content'),
    ogType: attr('meta[property="og:type"]', 'content'),
    twitterImage: attr('meta[name="twitter:image"]', 'content'),
    canonical: attr('link[rel="canonical"]', 'href'),
    viewport: attr('meta[name="viewport"]', 'content'),
  };
}"""

FOOTER_JS = r"""() => {
  const f = document.querySelector('footer');
  if (!f) return null;
  return Array.from(f.querySelectorAll('a[href]')).map((a) => ({
    href: (a.getAttribute('href') || '').trim(),
    text: (a.textContent || '').trim().replace(/\s+/g, ' '),
    visible: typeof a.checkVisibility === 'function'
      ? a.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true,
  }));
}"""

# Posters: not "is the attribute set" but "does the byte stream decode and is the
# box it paints into actually on screen". Run AFTER the byte budget is snapshotted:
# the test server sends no-store, so these Image() loads would otherwise be counted.
POSTERS_JS = r"""async () => {
  const vids = Array.from(document.querySelectorAll('video'));
  const out = [];
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    const r = v.getBoundingClientRect();
    const cs = window.getComputedStyle(v);
    const poster = v.getAttribute('poster') || '';
    let loads = false, pw = 0, ph = 0;
    if (poster) {
      loads = await new Promise((res) => {
        const im = new Image();
        im.onload = () => { pw = im.naturalWidth; ph = im.naturalHeight; res(im.naturalWidth > 0); };
        im.onerror = () => res(false);
        im.src = v.poster;
      });
    }
    const ch = v.closest('article.chapter');
    out.push({
      i: i,
      chapter: ch ? ch.id : '',
      poster: poster,
      posterLoads: loads,
      pw: pw, ph: ph,
      boxW: Math.round(r.width), boxH: Math.round(r.height),
      painted: cs.display !== 'none' && cs.visibility !== 'hidden'
               && parseFloat(cs.opacity || '1') > 0.01,
    });
  }
  return out;
}"""

TODO_JS = r"""() => Array.from(document.querySelectorAll('mark[data-todo]')).map((m) => ({
  todo: m.getAttribute('data-todo') || '',
  text: (m.textContent || '').trim().slice(0, 60),
  sel: window.__sel(m),
}))"""


# ---------------------------------------------------------------------------
# findings
# ---------------------------------------------------------------------------
FAIL, WARN, INFO = "FAIL", "WARN", "INFO"


class Findings:
    """Everything one page x config run turned up, keyed by check number."""

    def __init__(self, page: str, config: str):
        self.page = page
        self.config = config
        self.items: list[tuple[int, str, str]] = []
        self.na: set[int] = set()
        self.notes: list[str] = []

    def add(self, check: int, level: str, msg: str):
        self.items.append((check, level, msg))

    def fail(self, check: int, msg: str):
        self.add(check, FAIL, msg)

    def warn(self, check: int, msg: str):
        self.add(check, WARN, msg)

    def info(self, check: int, msg: str):
        self.add(check, INFO, msg)

    def skip(self, check: int):
        self.na.add(check)

    def status(self, check: int) -> str:
        if check in self.na:
            return "-"
        levels = [lv for c, lv, _ in self.items if c == check]
        if FAIL in levels:
            return "F"
        if WARN in levels:
            return "W"
        if INFO in levels:
            return "i"
        return "."

    @property
    def n_fail(self) -> int:
        return sum(1 for _, lv, _ in self.items if lv == FAIL)

    @property
    def n_warn(self) -> int:
        return sum(1 for _, lv, _ in self.items if lv == WARN)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def js_string_at(source: str, key: str, after: str | None = None) -> str | None:
    """Pull a double-quoted JS string literal out of content.js by key name."""
    start = 0
    if after:
        idx = source.find(after)
        if idx == -1:
            return None
        start = idx
    m = re.search(key + r"\s*:\s*\"((?:[^\"\\]|\\.)*)\"", source[start:])
    if not m:
        return None
    raw = m.group(1)
    try:
        return json.loads('"' + raw + '"')
    except json.JSONDecodeError:
        return raw.replace('\\"', '"').replace("\\\\", "\\")


def local_path_for(root: Path, page_name: str, url: str):
    """Map a meta URL (absolute production, root-relative or page-relative) to disk.

    Returns (Path or None, why). None means the URL points off-site and cannot be
    checked from here.
    """
    u = (url or "").strip()
    if not u:
        return None, "empty"
    p = urlparse(u)
    if p.scheme in ("http", "https"):
        if u.startswith(PROD_ORIGIN):
            rel = unquote(p.path).lstrip("/")
        elif p.hostname in ("127.0.0.1", "localhost"):
            rel = unquote(p.path).lstrip("/")
        else:
            return None, f"off-site origin {p.scheme}://{p.netloc}"
    elif p.scheme:
        return None, f"unsupported scheme {p.scheme}"
    elif u.startswith("/"):
        rel = unquote(p.path).lstrip("/")
    else:
        rel = str(Path(page_name).parent / unquote(p.path)).lstrip("./")
    return (root / rel), rel


def types_in(node, out=None):
    """Every @type string anywhere in a parsed JSON-LD tree."""
    if out is None:
        out = []
    if isinstance(node, dict):
        t = node.get("@type")
        if isinstance(t, str):
            out.append(t)
        elif isinstance(t, list):
            out.extend(x for x in t if isinstance(x, str))
        for v in node.values():
            types_in(v, out)
    elif isinstance(node, list):
        for v in node:
            types_in(v, out)
    return out


def resource_kind(url: str) -> str:
    ext = os.path.splitext(urlparse(url).path)[1].lower()
    return {
        ".html": "html", "": "html",
        ".css": "css",
        ".js": "js",
        ".woff2": "font", ".woff": "font", ".ttf": "font",
        ".jpg": "img", ".jpeg": "img", ".png": "img", ".webp": "img",
        ".svg": "img", ".avif": "img", ".gif": "img",
        ".mp4": "video", ".webm": "video",
    }.get(ext, "other")


def kb(n: int) -> str:
    return f"{n:,}"


def wheel_to_bottom(page, step_frac: float, settle_ms: int, sample=None, max_steps: int = 400):
    """Scroll to the bottom the way a person does: wheel steps, never scrollTo.

    Lenis owns the scroll position, so scrollTo would jump straight past every
    scroll-linked behaviour this gate exists to check.
    """
    stalls = 0
    steps = 0
    st = page.evaluate(SCROLL_STATE_JS)
    step = max(120, int(st["ih"] * step_frac))
    if sample:
        sample()
    while steps < max_steps:
        before = st["y"]
        page.mouse.wheel(0, step)
        page.wait_for_timeout(settle_ms)
        st = page.evaluate(SCROLL_STATE_JS)
        if sample:
            sample()
        steps += 1
        if st["y"] + st["ih"] >= st["h"] - 4:
            break
        if st["y"] <= before + 1:
            stalls += 1
            if stalls >= 5:
                break
        else:
            stalls = 0
    page.wait_for_timeout(700)  # let Lenis and any tail animation come to rest
    if sample:
        sample()
    return steps, stalls >= 5


# ---------------------------------------------------------------------------
# the run
# ---------------------------------------------------------------------------
class Runner:
    def __init__(self, base: str, root: Path):
        self.base = base
        self.root = root
        self.index_ids: set[str] = set()
        self.site_cache: dict = {}
        self.content_js = (root / "content.js").read_text(encoding="utf-8")
        self.terms_html = (root / "terms.html").read_text(encoding="utf-8")

    # -- network accounting -------------------------------------------------
    def attach_recorders(self, page, rec: dict):
        def on_console(msg):
            if msg.type == "error":
                rec["console_errors"].append(msg.text[:300])

        def on_pageerror(err):
            rec["page_errors"].append(str(err)[:300])

        def on_request(req):
            rec["requests"].append(req.url)

        def on_requestfailed(req):
            failure = (req.failure or "") if isinstance(req.failure, str) else str(req.failure or "")
            rec["failed"].append({"url": req.url, "why": failure, "type": req.resource_type})

        def on_response(resp):
            try:
                status = resp.status
            except Exception:
                return
            size = 0
            cl = resp.header_value("content-length")
            if cl and cl.isdigit():
                size = int(cl)
            else:
                try:
                    size = len(resp.body())
                except Exception:
                    size = 0
            rec["bytes"] += size
            rec["by_kind"][resource_kind(resp.url)] = rec["by_kind"].get(resource_kind(resp.url), 0) + size
            rec["responses"].append({"url": resp.url, "status": status, "size": size})
            if status >= 400:
                rec["bad_status"].append({"url": resp.url, "status": status})

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("request", on_request)
        page.on("requestfailed", on_requestfailed)
        page.on("response", on_response)

    def new_record(self):
        return {
            "console_errors": [], "page_errors": [], "requests": [], "failed": [],
            "responses": [], "bad_status": [], "bytes": 0, "by_kind": {},
        }

    # -- one page x config --------------------------------------------------
    def run_one(self, browser, page_name: str, config_name: str) -> Findings:
        cfg = CONFIGS[config_name]
        f = Findings(page_name, config_name)
        rec = self.new_record()

        context = browser.new_context(
            viewport={"width": cfg["width"], "height": cfg["height"]},
            device_scale_factor=cfg["dsf"],
            is_mobile=cfg["mobile"],
            has_touch=cfg["touch"],
            reduced_motion=cfg["reduced"],
            locale="en-AU",
            bypass_csp=False,
        )
        context.add_init_script(INIT_JS)
        page = context.new_page()
        self.attach_recorders(page, rec)

        url = f"{self.base}/{page_name}"
        try:
            page.goto(url, wait_until="load", timeout=30_000)
        except Exception as exc:
            f.fail(1, f"navigation failed: {exc}")
            context.close()
            for n in ALL_CHECKS:
                if n != 1:
                    f.skip(n)
            return f

        # settle: let the boot scripts finish and the hero media get going
        try:
            page.wait_for_load_state("networkidle", timeout=8_000)
        except Exception:
            pass
        page.wait_for_timeout(900)

        first_view_bytes = rec["bytes"]
        first_view_kinds = dict(rec["by_kind"])

        is_work = page_name == "work.html"
        is_index = page_name == "index.html"
        quiet_cfg = cfg["reduced"] == "reduce"

        # ---- overflow before scrolling (recorded, gated after the scroll) ---
        overflow_top = page.evaluate(OVERFLOW_JS)

        # ---- the scroll, sampling reels as we go ---------------------------
        samples: list[list[dict]] = []

        def sample():
            if is_work:
                try:
                    samples.append(page.evaluate(SAMPLE_REELS_JS))
                except Exception:
                    pass

        step_frac = 0.5 if is_work else 0.6
        settle = 260 if is_work else (200 if is_index else 130)
        steps, stalled = wheel_to_bottom(page, step_frac, settle, sample=sample if is_work else None)
        # snapshot the byte totals HERE: everything below this line (the poster
        # decode probe) issues its own requests, and the server sends no-store.
        full_scroll_bytes = rec["bytes"]
        full_scroll_kinds = dict(rec["by_kind"])

        end_state = page.evaluate(SCROLL_STATE_JS)
        reached = end_state["y"] + end_state["ih"]
        f.info(2, f"wheeled {steps} steps to {reached}/{end_state['h']}px"
                  + (f", {len(samples)} reel samples" if is_work else ""))
        if stalled or reached < end_state["h"] - 8:
            f.fail(2, f"never reached the bottom: stopped at {reached}px of {end_state['h']}px "
                      f"after {steps} wheel steps — the rest of the page was NOT checked")

        # =====================================================================
        # 1 — console, page errors, requests
        # =====================================================================
        for msg in rec["console_errors"]:
            f.fail(1, f"console error: {msg}")
        for msg in rec["page_errors"]:
            f.fail(1, f"pageerror: {msg}")
        for bad in rec["bad_status"]:
            f.fail(1, f"HTTP {bad['status']} {self.short(bad['url'])}")
        for bad in rec["failed"]:
            # media and preloads are routinely aborted by the browser itself;
            # that is the browser being frugal, not the site being broken.
            if "ERR_ABORTED" in bad["why"] and bad["type"] in ("media", "other", "image", "fetch"):
                f.info(1, f"request aborted (benign) {self.short(bad['url'])}")
            else:
                f.fail(1, f"request failed [{bad['why']}] {self.short(bad['url'])}")

        # =====================================================================
        # 2 — horizontal overflow
        # =====================================================================
        overflow_end = page.evaluate(OVERFLOW_JS)
        for stage, ov in (("at load", overflow_top), ("after full scroll", overflow_end)):
            lim = max(ov["clientWidth"], ov["innerWidth"])
            if ov["scrollWidth"] > lim:
                who = ", ".join(f"{o['sel']} (right {o['right']}px)" for o in ov["offenders"][:4]) or "no element isolated"
                f.fail(2, f"horizontal overflow {stage}: scrollWidth {ov['scrollWidth']} > "
                          f"innerWidth {ov['innerWidth']} / clientWidth {ov['clientWidth']} — {who}")
        f.info(2, f"scrollWidth {overflow_end['scrollWidth']} == innerWidth {overflow_end['innerWidth']} "
                  f"(clientWidth {overflow_end['clientWidth']})")

        # =====================================================================
        # 3 — headings
        # =====================================================================
        headings = page.evaluate(HEADINGS_JS)
        h1s = [h for h in headings if h["level"] == 1]
        if len(h1s) != 1:
            f.fail(3, f"expected exactly one <h1>, found {len(h1s)}"
                      + (": " + "; ".join(h["text"] for h in h1s[:4]) if h1s else ""))
        prev = None
        for h in headings:
            if prev is not None and h["level"] > prev + 1:
                f.fail(3, f"heading level skip h{prev} -> h{h['level']} at {h['sel']} \"{h['text']}\"")
            prev = h["level"]

        # =====================================================================
        # 4 — input font size (index) and tap targets (mobile)
        # =====================================================================
        did_4 = False
        inputs = page.evaluate(INPUTS_JS)
        if inputs:
            did_4 = True
            for inp in inputs:
                if inp["fontSize"] < MIN_INPUT_PX:
                    f.fail(4, f"input font-size {inp['fontSize']}px < {MIN_INPUT_PX:.0f}px "
                              f"(iOS zoom-on-focus) at {inp['sel']}")
            f.info(4, f"{len(inputs)} form field(s), smallest font-size "
                      f"{min(i['fontSize'] for i in inputs):.0f}px")
        if cfg["mobile"]:
            did_4 = True
            small_block, small_inline = [], []
            for t in page.evaluate(TAPS_JS):
                if t["w"] + 0.5 < MIN_TAP_PX or t["h"] + 0.5 < MIN_TAP_PX:
                    (small_inline if t["inlineText"] else small_block).append(t)
            for t in small_block:
                f.fail(4, f"tap target {t['w']}x{t['h']} < 44x44 at {t['sel']} \"{t['text']}\"")
            if small_inline:
                names = "; ".join(f"{t['sel']} \"{t['text']}\" {t['w']}x{t['h']}" for t in small_inline[:6])
                f.info(4, f"{len(small_inline)} inline text link(s) under 44x44 (exempt, flagged): {names}")
        if not did_4:
            f.skip(4)

        # =====================================================================
        # 5 — cumulative layout shift
        # =====================================================================
        cls = page.evaluate("() => window.__cls")
        if cls.get("error"):
            f.warn(5, f"layout-shift observer unavailable: {cls['error']}")
        all_entries = cls.get("entries", [])
        entries = [e for e in all_entries if not e.get("hadRecentInput")]
        total = sum(e["value"] for e in entries)
        # Chromium flags shifts as input-adjacent after real input AND after a
        # visual-viewport scale change (which mobile emulation triggers on any
        # horizontally overflowing page). Standard CLS drops those; a gate that
        # dropped them silently could report a clean 0.0000 over a broken page,
        # so they are always surfaced.
        dropped = [e for e in all_entries if e.get("hadRecentInput")]
        dropped_total = sum(e["value"] for e in dropped)
        if dropped_total > CLS_LIMIT / 2:
            f.warn(5, f"{len(dropped)} layout shift(s) worth {dropped_total:.4f} excluded as "
                      f"input-adjacent and NOT counted in CLS "
                      f"({', '.join(sorted({s['sel'] for e in dropped for s in e['sources']})) or 'no sources'})")
        culprits, unknown = {}, 0
        for e in entries:
            if e["value"] < 0.0005:
                continue
            if not e["sources"]:
                unknown += 1
                continue
            for s in e["sources"]:
                culprits[s["sel"]] = culprits.get(s["sel"], 0.0) + e["value"]
        outside = [sel for sel in culprits
                   if not any(s["inBook"] for e in entries for s in e["sources"] if s["sel"] == sel)]
        top = sorted(culprits.items(), key=lambda kv: -kv[1])[:5]
        top_txt = ", ".join(f"{s} ({v:.4f})" for s, v in top) or "no sources reported"

        # The gate is CLS < 0.1 on every page, full stop. #book-itself is still
        # called out separately when it is the whole story, because that changes
        # the fix, but it does not change the verdict.
        if total > CLS_LIMIT:
            if is_index and not outside and unknown == 0:
                f.fail(5, f"CLS {total:.4f} > {CLS_LIMIT} — every culprit is inside #book-itself "
                          f"(the pinned booking section): {top_txt}")
            else:
                where = ", ".join(outside[:5]) if outside else f"{unknown} shift(s) with no source node"
                f.fail(5, f"CLS {total:.4f} > {CLS_LIMIT}; culprits outside #book-itself: {where} "
                          f"| all culprits: {top_txt}")
        else:
            f.info(5, f"CLS {total:.4f}")

        # =====================================================================
        # 6 — the reels (work.html only)
        # =====================================================================
        if is_work:
            plays = page.evaluate("() => window.__mediaPlay")
            final = page.evaluate(SAMPLE_REELS_JS)
            n = len(final)
            if n == 0:
                f.fail(6, "no reel videos found (expected video[data-src] elements built by work.js)")
            elif quiet_cfg:
                with_src = [v for v in final if v["src"]]
                if with_src:
                    f.fail(6, f"reduced motion: {len(with_src)} of {n} reels have a src "
                              f"({', '.join(v['chapter'] or str(v['i']) for v in with_src)})")
                with_cur = [v for v in final if v["currentSrc"]]
                if with_cur:
                    f.fail(6, f"reduced motion: {len(with_cur)} of {n} reels resolved a currentSrc "
                              f"({', '.join(v['chapter'] or str(v['i']) for v in with_cur)}) — "
                              f"the file is being fetched even with no src attribute")
                ever_src = sorted({v["chapter"] or str(v["i"]) for s in samples for v in s
                                   if v["src"] or v["currentSrc"]})
                if ever_src:
                    f.fail(6, f"reduced motion: reels acquired a src/currentSrc mid-scroll: "
                              f"{', '.join(ever_src)}")
                if plays:
                    f.fail(6, f"reduced motion: {len(plays)} video play event(s) fired "
                              f"({', '.join(sorted({p['chapter'] or p['cls'] for p in plays}))})")
                ever_playing = sorted({v["chapter"] or str(v["i"]) for s in samples for v in s if not v["paused"]})
                if ever_playing:
                    f.fail(6, f"reduced motion: reels were observed playing: {', '.join(ever_playing)}")
                if f.status(6) in (".", "i"):
                    f.info(6, f"reduced motion: {n} reels, all srcless and silent")
            else:
                max_concurrent = 0
                for s in samples:
                    max_concurrent = max(max_concurrent, sum(1 for v in s if not v["paused"]))
                if max_concurrent > 1:
                    f.fail(6, f"{max_concurrent} reels playing at once (only one may run at a time)")
                # a reel that makes noise on a marketing page is a bug, not a
                # feature. NB: .volume stays 1 on a muted element — .muted is
                # the only property that decides whether sound comes out.
                loud = sorted({v["chapter"] or str(v["i"]) for s in samples for v in s
                               if not v["paused"] and not v["muted"]})
                if loud:
                    f.fail(6, f"reel(s) played UNMUTED: {', '.join(loud)}")
                for i in range(n):
                    seq = [v for s in samples for v in s if v["i"] == i]
                    name = final[i]["chapter"] or f"reel {i}"
                    if not seq:
                        f.fail(6, f"{name}: never sampled")
                        continue
                    if not any(v["src"] for v in seq) and not final[i]["src"]:
                        f.fail(6, f"{name}: never got a src")
                        continue
                    playing_ready = [v for v in seq if not v["paused"] and v["readyState"] >= 2]
                    if not playing_ready:
                        best_rs = max(v["readyState"] for v in seq)
                        ever_playing = any(not v["paused"] for v in seq)
                        f.fail(6, f"{name}: never played in view (max readyState {best_rs}, "
                                  f"ever unpaused {ever_playing})")
                    past = [v for v in seq if v["bottom"] < -260]
                    if past and any(not v["paused"] for v in past):
                        f.fail(6, f"{name}: still playing after being scrolled past")
                    elif not past:
                        f.info(6, f"{name}: never sampled fully out of view above the fold")
                if f.status(6) in (".", "i"):
                    f.info(6, f"{n} reels: load-on-approach, play in view, pause past, "
                              f"max {max_concurrent} concurrent")

            # posters, both motion modes — under reduced motion the poster IS the
            # reel, so a missing or undecodable one is a blank rectangle
            try:
                posters = page.evaluate(POSTERS_JS)
            except Exception as exc:
                posters = []
                f.warn(6, f"poster probe failed: {exc}")
            for p in posters:
                who = p["chapter"] or f"video {p['i']}"
                if not p["poster"]:
                    f.fail(6, f"{who}: no poster attribute (nothing to show before/without the file)")
                elif not p["posterLoads"]:
                    f.fail(6, f"{who}: poster {p['poster']} did not decode (missing or corrupt)")
                elif not p["painted"] or p["boxW"] < 40 or p["boxH"] < 40:
                    f.fail(6, f"{who}: poster present but the video box is not painted "
                              f"({p['boxW']}x{p['boxH']}, painted={p['painted']})")
            if posters and not any(lv == FAIL for c, lv, _ in f.items if c == 6):
                dims = ", ".join(f"{p['chapter'] or p['i']} {p['pw']}x{p['ph']}" for p in posters)
                f.info(6, f"{len(posters)} poster(s) decode and paint: {dims}")
        else:
            f.skip(6)

        # =====================================================================
        # 7 — byte budgets
        # =====================================================================
        if page_name in BUDGET_FIRST_VIEW or page_name in BUDGET_FULL_SCROLL:
            kinds = ", ".join(f"{k} {kb(v)}" for k, v in sorted(first_view_kinds.items(), key=lambda kv: -kv[1]))
            if page_name in BUDGET_FIRST_VIEW:
                cap = BUDGET_FIRST_VIEW[page_name]
                msg = f"first view {kb(first_view_bytes)} B (budget {kb(cap)}) [{kinds}]"
                if first_view_bytes > cap:
                    f.fail(7, "OVER: " + msg)
                else:
                    f.info(7, msg)
            if page_name in BUDGET_FULL_SCROLL:
                cap = BUDGET_FULL_SCROLL[page_name]
                allk = ", ".join(f"{k} {kb(v)}" for k, v in sorted(full_scroll_kinds.items(), key=lambda kv: -kv[1]))
                msg = f"full scroll {kb(full_scroll_bytes)} B (budget {kb(cap)}) [{allk}]"
                if full_scroll_bytes > cap:
                    f.fail(7, "OVER: " + msg)
                else:
                    f.info(7, msg)
        else:
            f.info(7, f"no budget set; measured {kb(full_scroll_bytes)} B full scroll")
            f.skip(7)

        # =====================================================================
        # 8 — links and anchors
        # =====================================================================
        own_ids = set(page.evaluate(IDS_JS))
        if is_index and not self.index_ids:
            self.index_ids = set(own_ids)
        for link in page.evaluate(LINKS_JS):
            href = link["href"].strip()
            if not href or href.startswith(("mailto:", "tel:", "javascript:", "data:")):
                continue
            if link["target"] == "_blank" and "noopener" not in link["rel"]:
                f.fail(8, f"target=_blank without rel=noopener: {href} at {link['sel']}")
            parsed = urlparse(link["resolved"])
            if parsed.scheme in ("http", "https") and parsed.hostname not in ("127.0.0.1", "localhost"):
                continue  # external link, not this gate's business
            path = unquote(parsed.path).lstrip("/")
            frag = parsed.fragment
            same_page = (not path) or path == page_name
            if not same_page:
                target = self.root / path
                if not target.exists():
                    f.fail(8, f"broken internal link: {href} (no {path} on disk) at {link['sel']}")
                    continue
            if frag:
                if same_page:
                    if frag not in own_ids:
                        f.fail(8, f"dead anchor {href}: no #{frag} on this page, at {link['sel']}")
                elif path == "index.html":
                    if frag not in self.index_ids:
                        f.fail(8, f"dead anchor {href}: no #{frag} in index.html's DOM, at {link['sel']}")

        # =====================================================================
        # 9 — structured data
        # =====================================================================
        blobs = page.evaluate(LDJSON_JS)
        items = []
        for blob in blobs:
            try:
                parsed = json.loads(blob["text"])
            except json.JSONDecodeError as exc:
                f.fail(9, f"ld+json block {blob['i']} does not parse: {exc}")
                continue
            items.extend(parsed if isinstance(parsed, list) else [parsed])

        if not blobs:
            f.fail(9, "no ld+json block on this page")
        top_types = sorted({t for it in items for t in types_in(it)[:1]})

        # nowhere on this site may we assert a rating or a review
        banned = [t for it in items for t in types_in(it)
                  if t in ("Review", "AggregateRating", "Rating", "UserReview")]
        if banned:
            f.fail(9, f"forbidden schema type(s) present: {', '.join(sorted(set(banned)))} "
                      f"— this site makes no rating or review claims")

        # every page needs the types it promises
        required = {
            "index.html": {"Organization", "WebSite"},
            "work.html": {"CollectionPage", "BreadcrumbList"},
        }.get(page_name, set())
        present = {t for it in items for t in types_in(it)}
        missing = sorted(required - present)
        if missing:
            f.fail(9, f"missing required JSON-LD type(s): {', '.join(missing)} "
                      f"(found: {', '.join(sorted(present)) or 'none'})")
        elif required:
            f.info(9, f"top-level types: {', '.join(top_types)}")

        if is_work:
            bc = [it for it in items if it.get("@type") == "BreadcrumbList"]
            if len(bc) == 1:
                els = bc[0].get("itemListElement", [])
                positions = [e.get("position") for e in els]
                if len(els) < 2 or positions != sorted(p for p in positions if p is not None):
                    f.fail(9, f"BreadcrumbList is malformed: {len(els)} item(s), positions {positions}")
                else:
                    f.info(9, f"BreadcrumbList: {len(els)} rungs, "
                              + " > ".join(str(e.get('name')) for e in els))
            elif len(bc) > 1:
                f.fail(9, f"expected exactly one BreadcrumbList, found {len(bc)}")

        if is_index:
            faq = [it for it in items if it.get("@type") == "FAQPage"]
            if len(faq) != 1:
                f.fail(9, f"expected exactly one FAQPage block, found {len(faq)}")
            else:
                n_schema = len(faq[0].get("mainEntity", []))
                n_site = page.evaluate("() => (window.SITE && window.SITE.faq || []).length")
                if n_schema != n_site:
                    f.fail(9, f"FAQPage has {n_schema} questions but SITE.faq has {n_site}")
                else:
                    f.info(9, f"FAQPage: {n_schema} questions, matches SITE.faq")
        if is_work:
            coll = [it for it in items if it.get("@type") == "CollectionPage"]
            if len(coll) != 1:
                f.fail(9, f"expected exactly one CollectionPage, found {len(coll)}")
            else:
                parts = coll[0].get("hasPart", [])
                creative = [p for p in parts if p.get("@type") == "CreativeWork"]
                if len(creative) != 3 or len(parts) != 3:
                    f.fail(9, f"CollectionPage hasPart: {len(parts)} entries, {len(creative)} CreativeWork "
                              f"(expected exactly 3 CreativeWork)")
                else:
                    f.info(9, "CollectionPage: 3 CreativeWork hasPart entries")

        # =====================================================================
        # 10 — the honesty strings
        # =====================================================================
        if is_work:
            site_work = page.evaluate("() => (window.SITE && window.SITE.work) || null")
            body_text = page.evaluate("() => document.body.innerText")
            if not site_work:
                f.fail(10, "window.SITE.work is missing, cannot check the honesty strings")
            else:
                disclosure = (site_work.get("disclosure") or "").strip()
                if not disclosure:
                    f.fail(10, "SITE.work.disclosure is empty")
                else:
                    shown = page.evaluate(
                        """(txt) => {
                            const nodes = Array.from(document.querySelectorAll('p, div, span, li'));
                            const hit = nodes.filter((n) => (n.innerText || '').includes(txt));
                            if (!hit.length) return { found: false };
                            const el = hit[hit.length - 1];
                            const r = el.getBoundingClientRect();
                            const visible = typeof el.checkVisibility === 'function'
                              ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                              : true;
                            return { found: true, visible: visible && r.width > 0 && r.height > 0,
                                     sel: window.__sel(el) };
                        }""", disclosure)
                    if not shown["found"]:
                        f.fail(10, "the disclosure line from SITE.work.disclosure is not rendered on work.html")
                    elif not shown["visible"]:
                        f.fail(10, f"the disclosure line is in the DOM but not visible ({shown['sel']})")
                    else:
                        f.info(10, f"disclosure rendered and visible at {shown['sel']}")

                # "before/after" wording must not appear anywhere near Goldy
                goldy_text = page.evaluate(
                    "() => { const el = document.getElementById('goldy'); return el ? el.innerText : ''; }")
                if not goldy_text:
                    f.fail(10, "no #goldy chapter found to check for before/after wording")
                else:
                    for pat in (r"before\s*/\s*after", r"before\s+and\s+after"):
                        for m in re.finditer(pat, goldy_text, re.I):
                            around = goldy_text[max(0, m.start() - 60):m.end() + 60].replace("\n", " ")
                            f.fail(10, f"'{m.group(0)}' in the Goldy chapter (it is a self-assessment "
                                       f"scale, never a before/after): ...{around}...")
                # the self-assessment scale has to be SAID, not just not-contradicted
                goldy = next((p for p in site_work.get("projects", []) if p.get("slug") == "goldy"), None)
                if not goldy:
                    f.fail(10, "no Goldy project in SITE.work.projects")
                elif goldy_text:
                    caps = ((goldy.get("captions") or {}).get("stills") or [])
                    scale_caps = [c for c in caps
                                  if re.search(r"five levels of grime|self-assessment", c, re.I)]
                    if not scale_caps:
                        f.fail(10, "no Goldy caption in content.js states the self-assessment scale "
                                   "(one interior at five levels of grime)")
                    else:
                        missing = [c for c in scale_caps if c not in goldy_text]
                        if missing:
                            f.fail(10, "the Goldy self-assessment-scale caption is not in the rendered "
                                       f"chapter: \"{missing[0][:90]}...\"")
                        else:
                            f.info(10, "Goldy's self-assessment scale is stated in the rendered chapter")
                    # the body copy carries the same rule; check it landed too
                    if "self-assessment" in (goldy.get("what") or "").lower() \
                       and "self-assessment" not in goldy_text.lower():
                        f.fail(10, "SITE.work.projects[goldy].what says 'self-assessment' but the "
                                   "rendered chapter does not")

                # and nowhere else on the page either
                for pat in (r"before\s*/\s*after", r"before\s+and\s+after"):
                    for m in re.finditer(pat, body_text, re.I):
                        if goldy_text and m.group(0).lower() in goldy_text.lower():
                            continue
                        around = body_text[max(0, m.start() - 50):m.end() + 50].replace("\n", " ")
                        f.warn(10, f"'{m.group(0)}' elsewhere on work.html: ...{around}...")
                        break

                # Karine: the pendulum motion is generated from a photograph
                karine = next((p for p in site_work.get("projects", []) if p.get("slug") == "karine"), None)
                karine_text = page.evaluate(
                    "() => { const el = document.getElementById('karine'); return el ? el.innerText : ''; }")
                if not karine:
                    f.fail(10, "no Karine project in SITE.work.projects")
                elif not karine_text:
                    f.fail(10, "no #karine chapter rendered")
                else:
                    caps = ((karine.get("captions") or {}).get("stills") or [])
                    photo_caps = [c for c in caps if "photograph" in c.lower()]
                    if not photo_caps:
                        f.fail(10, "no Karine caption in content.js mentions her photograph-derived motion")
                    else:
                        missing = [c for c in photo_caps if c not in karine_text]
                        if missing:
                            f.fail(10, "the Karine photograph caption is not in the rendered chapter: "
                                       f"\"{missing[0][:90]}...\"")
                        else:
                            f.info(10, "Karine's photograph-derived motion is stated in the rendered chapter")

                # no bare percentages: this page carries no performance claims
                for m in re.finditer(r"\b\d+%", body_text):
                    around = body_text[max(0, m.start() - 60):m.end() + 40].replace("\n", " ")
                    f.fail(10, f"percentage '{m.group(0)}' on work.html (no performance claims allowed): "
                               f"...{around}...")
        elif page_name == "terms.html":
            statement = js_string_at(self.content_js, "statement", after="guarantee:")
            if not statement:
                f.fail(10, "could not read guarantee.promise.statement out of content.js")
            elif statement not in self.terms_html:
                f.fail(10, "terms.html does not contain the 30-Day Promise verbatim from content.js: "
                           f"\"{statement[:90]}...\"")
            else:
                f.info(10, "the 30-Day Promise appears in terms.html verbatim from content.js")
        else:
            f.skip(10)

        # =====================================================================
        # 11 — libraries and origins
        # =====================================================================
        if is_work:
            heavy = [u for u in rec["requests"] if re.search(r"(gsap|scrolltrigger)", u, re.I)]
            if heavy:
                f.fail(11, "work.html loaded animation libraries it does not need: "
                           + ", ".join(sorted({self.short(u) for u in heavy})))
        offsite = set()
        for u in rec["requests"]:
            p = urlparse(u)
            if p.scheme in ("data", "blob", "about", "chrome-extension", ""):
                continue
            if p.hostname not in ("127.0.0.1", "localhost"):
                offsite.add(f"{p.scheme}://{p.netloc}{p.path[:60]}")
        for u in sorted(offsite):
            f.fail(11, f"request to a non-localhost origin: {u}")
        if f.status(11) == ".":
            f.info(11, "all requests local; " + ("no gsap/ScrollTrigger" if is_work else "libraries as expected"))

        # =====================================================================
        # 12 — the ABN gate
        # =====================================================================
        todos = page.evaluate(TODO_JS)
        for t in todos:
            f.warn(12, f"mark[data-todo=\"{t['todo']}\"] still on the page: \"{t['text']}\" "
                       f"— deploy-blocking placeholder")
        if not todos:
            f.skip(12)

        # =====================================================================
        # 13 — head and social card
        # =====================================================================
        meta = page.evaluate(META_JS)
        for key, label in (("title", "<title>"), ("description", "meta[name=description]"),
                           ("ogTitle", "og:title"), ("ogDescription", "og:description"),
                           ("ogImage", "og:image")):
            if not meta.get(key):
                f.fail(13, f"{label} is missing or empty")
        if meta.get("title") and len(meta["title"]) > 70:
            f.info(13, f"<title> is {len(meta['title'])} chars (Google truncates around 60-65)")
        if meta.get("description") and not (50 <= len(meta["description"]) <= 320):
            f.info(13, f"meta description is {len(meta['description'])} chars")
        for key, label in (("ogImage", "og:image"), ("twitterImage", "twitter:image")):
            u = meta.get(key)
            if not u:
                if key == "twitterImage" and meta.get("ogImage"):
                    f.info(13, "no twitter:image (crawlers fall back to og:image)")
                continue
            target, why = local_path_for(self.root, page_name, u)
            if target is None:
                f.fail(13, f"{label} points off-site and cannot be verified: {u} ({why})")
            elif not target.is_file():
                f.fail(13, f"{label} does not exist on disk: {u} -> {why}")
            else:
                f.info(13, f"{label} {why} ({target.stat().st_size:,} B)")
        if not meta.get("canonical"):
            f.warn(13, "no rel=canonical")
        if f.status(13) == ".":
            f.info(13, "title, description, og:title, og:description, og:image all present")

        # =====================================================================
        # 14 — footer legal links
        # =====================================================================
        footer_links = page.evaluate(FOOTER_JS)
        if footer_links is None:
            f.fail(14, "no <footer> on this page")
        else:
            hrefs = {l["href"] for l in footer_links}
            for want in ("terms.html", "privacy.html"):
                hit = [l for l in footer_links if l["href"] == want or l["href"].endswith("/" + want)]
                if not hit:
                    f.fail(14, f"footer has no link to {want} (found: {', '.join(sorted(hrefs)) or 'none'})")
                elif not any(l["visible"] for l in hit):
                    f.fail(14, f"the footer link to {want} is in the DOM but not visible")
            if f.status(14) == ".":
                f.info(14, f"footer legal links present ({len(footer_links)} footer links total)")

        f.skip(15)  # site-level, reported on its own row

        context.close()
        return f

    # -- 15: the crawl files, checked once over the wire --------------------
    def check_site_files(self) -> Findings:
        f = Findings("(site files)", "static")
        for n in ALL_CHECKS:
            if n != 15:
                f.skip(n)

        def fetch(name: str):
            try:
                with urllib.request.urlopen(f"{self.base}/{name}", timeout=10) as r:
                    return r.status, r.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as exc:
                return exc.code, ""
            except Exception as exc:
                f.fail(15, f"{name} could not be fetched: {exc}")
                return None, ""

        # ---- sitemap.xml ----
        status, body = fetch("sitemap.xml")
        if status is None:
            pass
        elif status != 200:
            f.fail(15, f"sitemap.xml returned HTTP {status}")
        else:
            try:
                root = ET.fromstring(body)
            except ET.ParseError as exc:
                f.fail(15, f"sitemap.xml is not well-formed XML: {exc}")
            else:
                ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                locs = [(e.text or "").strip() for e in root.findall(".//s:loc", ns)] \
                       or [(e.text or "").strip() for e in root.iter() if e.tag.endswith("loc")]
                paths = set()
                for loc in locs:
                    p = urlparse(loc)
                    if p.scheme not in ("http", "https") or not p.netloc:
                        f.fail(15, f"sitemap entry is not an absolute URL: {loc}")
                        continue
                    if not loc.startswith(PROD_ORIGIN):
                        f.fail(15, f"sitemap entry points at another origin: {loc}")
                    paths.add(p.path or "/")
                missing = sorted(SITEMAP_PATHS - paths)
                extra = sorted(paths - SITEMAP_PATHS)
                if missing:
                    f.fail(15, f"sitemap.xml is missing: {', '.join(missing)} "
                               f"(has: {', '.join(sorted(paths)) or 'nothing'})")
                if extra:
                    f.warn(15, f"sitemap.xml lists page(s) not in the gate set: {', '.join(extra)}")
                # a sitemap URL that 404s is worse than no sitemap
                for p in sorted(paths):
                    disk = self.root / (p.lstrip("/") or "index.html")
                    if not disk.is_file():
                        f.fail(15, f"sitemap lists {p} but {disk.name} does not exist on disk")
                if not missing and not extra:
                    f.info(15, f"sitemap.xml lists exactly the 4 gate pages: {', '.join(sorted(paths))}")

        # ---- robots.txt ----
        status, body = fetch("robots.txt")
        if status is None:
            pass
        elif status != 200:
            f.fail(15, f"robots.txt returned HTTP {status}")
        else:
            sitemaps = re.findall(r"(?im)^\s*sitemap:\s*(\S+)\s*$", body)
            if not sitemaps:
                f.fail(15, "robots.txt has no Sitemap: directive")
            elif not any(s.rstrip("/").endswith("sitemap.xml") for s in sitemaps):
                f.fail(15, f"robots.txt Sitemap: does not point at sitemap.xml: {', '.join(sitemaps)}")
            else:
                f.info(15, f"robots.txt -> {sitemaps[0]}")
            if re.search(r"(?im)^\s*disallow:\s*/\s*$", body):
                f.fail(15, "robots.txt contains a site-wide 'Disallow: /'")

        return f

    def short(self, url: str) -> str:
        p = urlparse(url)
        if p.hostname in ("127.0.0.1", "localhost"):
            return p.path
        return url[:90]


# ---------------------------------------------------------------------------
# reporting
# ---------------------------------------------------------------------------
CHECK_NAMES = {
    1: "errors/requests", 2: "no h-overflow", 3: "headings", 4: "targets/inputs",
    5: "CLS", 6: "reels+posters", 7: "byte budget", 8: "links", 9: "ld+json",
    10: "honesty", 11: "libs/origins", 12: "TODO marks", 13: "head/OG",
    14: "footer legal", 15: "sitemap/robots",
}


def print_report(results: list[Findings]) -> int:
    print()
    print("=" * 100)
    print("PRE-DEPLOY GATE — offsider-site")
    print("=" * 100)
    print()
    head = f"{'PAGE':<14}{'CONFIG':<11}" + "".join(f"{n:>4}" for n in ALL_CHECKS) + f"{'RESULT':>9}"
    print(head)
    print("-" * len(head))
    for f in results:
        row = f"{f.page:<14}{f.config:<11}" + "".join(f"{f.status(n):>4}" for n in ALL_CHECKS)
        verdict = "FAIL" if f.n_fail else ("WARN" if f.n_warn else "PASS")
        print(row + f"{verdict:>9}")
    print("-" * len(head))
    print("  legend: . pass   i pass (info)   W warn   F fail   - not applicable")
    print("  checks: " + "  ".join(f"{n} {CHECK_NAMES[n]}" for n in range(1, 6)))
    print("          " + "  ".join(f"{n} {CHECK_NAMES[n]}" for n in range(6, 11)))
    print("          " + "  ".join(f"{n} {CHECK_NAMES[n]}" for n in range(11, 16)))
    print()

    n_fail = sum(f.n_fail for f in results)
    n_warn = sum(f.n_warn for f in results)

    for level, title in ((FAIL, "FAILURES"), (WARN, "WARNINGS")):
        rows = [(f, c, m) for f in results for c, lv, m in f.items if lv == level]
        if not rows:
            continue
        print(f"{title} ({len(rows)})")
        print("-" * 100)
        for f, c, m in rows:
            print(f"  [{c:>2}] {f.page} @ {f.config}")
            print(f"       {m}")
        print()

    infos = [(f, c, m) for f in results for c, lv, m in f.items if lv == INFO]
    if infos:
        print(f"MEASUREMENTS ({len(infos)})")
        print("-" * 100)
        for f, c, m in infos:
            print(f"  [{c:>2}] {f.page:<14}{f.config:<11} {m}")
        print()

    verdict = "FAIL" if n_fail else "PASS"
    print(f"GATE: {verdict} ({n_fail} failures, {n_warn} warnings)")
    return 1 if n_fail else 0


# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Pre-deploy gate for the Applied Intelligence site.")
    ap.add_argument("--port", type=int, default=8799, help="port for the throwaway static server (default 8799)")
    ap.add_argument("--pages", default=",".join(PAGES), help="comma-separated subset of pages")
    ap.add_argument("--configs", default=",".join(CONFIGS), help="comma-separated subset of configs")
    ap.add_argument("--headed", action="store_true", help="watch it run")
    args = ap.parse_args()

    pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    configs = [c.strip() for c in args.configs.split(",") if c.strip()]
    for p in pages:
        if not (ROOT / p).is_file():
            sys.stderr.write(f"no such page: {p}\n")
            return 2
    for c in configs:
        if c not in CONFIGS:
            sys.stderr.write(f"no such config: {c} (have {', '.join(CONFIGS)})\n")
            return 2

    started = time.time()
    httpd, _ = start_server(args.port)
    base = f"http://127.0.0.1:{args.port}"
    print(f"serving {ROOT} at {base}")

    results: list[Findings] = []
    try:
        runner = Runner(base, ROOT)
        results.append(runner.check_site_files())
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=not args.headed,
                args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
            )
            # prepass: index.html's ids, so anchor checks work whatever order runs
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(INIT_JS)
            pg = ctx.new_page()
            pg.goto(f"{base}/index.html", wait_until="load", timeout=30_000)
            pg.wait_for_timeout(500)
            runner.index_ids = set(pg.evaluate(IDS_JS))
            ctx.close()

            for page_name in pages:
                for config_name in configs:
                    t0 = time.time()
                    print(f"  · {page_name:<14}{config_name:<11}", end="", flush=True)
                    f = runner.run_one(browser, page_name, config_name)
                    results.append(f)
                    print(f" {time.time() - t0:5.1f}s  "
                          f"{f.n_fail} fail / {f.n_warn} warn")
            browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()

    code = print_report(results)
    print(f"({time.time() - started:.0f}s total)")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
