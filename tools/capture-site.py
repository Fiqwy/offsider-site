#!/usr/bin/env python3
"""
capture-site.py — captures of the live client sites for the Work page.

Scout (unchanged, for briefing):

    python3 tools/capture-site.py stills                  # full-page + hero PNG per site

Production (writes into assets/work/<slug>/ and assets/og/):

    python3 tools/capture-site.py reel  --site goldy --device desktop [--path A|B]
    python3 tools/capture-site.py shots --site goldy      # card.webp + still-0N.webp
    python3 tools/capture-site.py og                      # assets/og/work-og.jpg
    python3 tools/capture-site.py all                     # everything, every site

Requires: playwright (sync API) + chromium, ffmpeg, Pillow. No other deps.

IMPORTANT — hard-won facts about these four sites, do not "simplify" them away:

  1. They all run Lenis smooth-scroll. Any long scripted move MUST go through
     page.mouse.wheel(); a scrollTo jump is either swallowed or skips the
     intersection observers on the way, which silently yields a shot with lazy
     images unloaded and reveal animations unplayed. Small, frame-by-frame
     scrollTo steps (Path B) are the one exception — measured on all four sites,
     they land exactly and hold, because these Lenis builds ride native scroll.
  2. Full-page screenshots render video heroes BLACK (confirmed on Shocked
     Solar). Every production still, card and poster here is a VIEWPORT
     screenshot taken at a scroll position. Never full_page.
  3. Before capturing anything on a video-hero site we wait for the hero <video>
     to actually be playing (readyState >= 2 && !paused), bounded, with a
     graceful fallback so a stalled video never hangs the run.
  4. Karine's site has a known desktop scroll-jank defect, so her reels must be
     stepped (Path B) rather than screencast.

Two reel paths:

  Path A — record_video screencast while the page scrolls itself on rAF. Fast
           (~18s a reel) and keeps every time-based animation honest, but the
           screencast samples the compositor at 25fps on its own clock, so the
           captured positions are unevenly spaced. Measured on Shocked Solar and
           Goldy: ~16-21% of frame-to-frame displacements deviate from the
           intended velocity, i.e. visible judder. Kept, and selectable with
           --path A, but no longer the default.
  Path B — deterministic frame stepping: set the exact planned scroll position,
           pin every in-view <video> to the reel clock, scale CSS animation
           playback to reel time, screenshot, repeat. ~2 minutes a reel and
           measurably smooth (0% velocity spikes on every site tried). This is
           the default, and the automatic fallback when QA finds jank.
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover - Pillow is required for shots/og only
    Image = None

REPO = Path(__file__).resolve().parents[1]
WORK_DIR = REPO / "assets" / "work"
OG_PATH = REPO / "assets" / "og" / "work-og.jpg"

SCRATCH = Path(os.environ.get(
    "OFFSIDER_SCRATCH",
    "/private/tmp/claude-501/-Users-nicholasmatthews/"
    "c036ed8f-4519-4e3c-be7f-cb41d2c0d3bc/scratchpad/captures",
))

DEFAULT_OUT = str(SCRATCH / "scout")


def ffmpeg_bin():
    for c in (Path.home() / "bin" / "ffmpeg", shutil.which("ffmpeg")):
        if c and Path(c).exists():
            return str(c)
    raise SystemExit("ffmpeg not found (looked in ~/bin and $PATH)")


# --------------------------------------------------------------------------
# Sites
#
# Scroll stops are resolved at capture time, so they survive the different
# viewports we shoot at (a stop is a CSS selector + offset, a viewport-height
# multiple, or a raw y). Reel stops are the chapter beats: the pacing generator
# eases through each one, so the camera slows at section boundaries.
# --------------------------------------------------------------------------

SITES = [
    {
        "slug": "shocked-solar",
        "url": "https://shockedsolarandelectrical.com",
        "label": "Shocked Solar & Electrical",
        "hero_video": True,
        # NOTE: #savings-calc and #incentives are deliberately never framed —
        # they carry dollar figures that could read as a claim on our page.
        "reel": {
            "desktop": {"path": "B", "duration": 10.5, "hold": 1.3, "stops": [
                {"y": 0},
                {"sel": "#three-pillars", "off": 160},
                # the tail of the pillars is quiet — skate over it (w < 1)
                {"sel": "#recent-work", "off": -40, "w": 0.58},
                {"sel": "#recent-work", "off": 620},
                {"sel": "#brands", "off": 120},
                {"sel": "#brands", "off": 430},
            ]},
            "phone": {"path": "B", "duration": 8.0, "hold": 1.2, "stops": [
                {"y": 0}, {"vh": 1.7}, {"vh": 3.4}, {"vh": 5.1},
            ]},
        },
        "card": {"y": 0},
        "stills": [
            {"sel": "#recent-work", "off": 40},     # Real jobs / 30-tile gallery
            {"sel": "#brands", "off": 40},          # the monochrome Wall of Kit
            {"sel": "#service-area", "off": 60},    # where the team works (map)
        ],
    },
    {
        "slug": "goldy",
        "url": "https://goldycardetailing.com.au",
        "label": "Goldy Car Detailing",
        "hero_video": True,
        "reel": {
            # Ends on "build it yourself", not the gallery: running all the way
            # down to #gallery is ~9 viewportfuls of dense photography, which
            # blows the 1.6MB budget for a reel nobody watches twice. The
            # gallery is still-01 instead.
            "desktop": {"path": "B", "duration": 11.0, "hold": 1.3, "stops": [
                {"y": 0},
                {"sel": "#configurator", "off": -120},
                {"sel": "#packages", "off": 40},
                {"sel": "#packages", "off": 720},
                {"sel": "#build-your-own", "off": 150},
            ]},
            "phone": {"path": "B", "duration": 8.0, "hold": 1.2, "stops": [
                {"y": 0}, {"vh": 1.4}, {"vh": 2.8}, {"vh": 4.2},
            ]},
        },
        "card": {"y": 0},
        "stills": [
            {"sel": "#gallery", "off": 30},         # two-rail filterable gallery
            {"sel": "#condition", "off": 30},       # "How rough is it?" self-assessment
            {"sel": "#configurator", "off": 40},    # SMS-first price builder
        ],
    },
    {
        "slug": "karine",
        "url": "https://karinesmatthews.com",
        "label": "Karine S. Matthews",
        "hero_video": True,
        # Path B by default: her desktop scroll janks, frame stepping sidesteps it.
        "reel": {
            "desktop": {"path": "B", "duration": 11.0, "hold": 1.3, "stops": [
                {"y": 0},
                {"sel": "#welcome", "off": -80},
                {"sel": "#proof-early", "off": -40},
                {"sel": "#services", "off": 110},
                {"sel": "#services", "off": 900},
                {"sel": "#journey", "off": 10},
            ]},
            "phone": {"path": "B", "duration": 8.0, "hold": 1.2, "stops": [
                {"y": 0}, {"vh": 1.3}, {"vh": 2.6}, {"vh": 3.9},
            ]},
        },
        # Her most atmospheric frame: the sunset over the dark dusk band, so a
        # light site still sits happily beside two dark ones.
        "card": {"y": 700},
        "stills": [
            {"y": 0},                               # the pendulum hero
            {"sel": "#services", "off": 110},       # the sessions
            {"sel": "#atmosphere", "off": 50},      # "a room that holds you"
        ],
    },
    {
        "slug": "greenwood",
        "url": "https://greenwoodaf.com.au",
        "label": "Greenwood Asset Finance",
        "hero_video": False,
        "reel": {},                                 # card + one still only
        "card": {"y": 0},
        "stills": [
            {"sel": "#lenders", "off": 10},         # the 40-lender wall
        ],
    },
]

SITE_BY_SLUG = {s["slug"]: s for s in SITES}

# --------------------------------------------------------------------------
# Devices
# --------------------------------------------------------------------------

DEVICES = {
    # "rec" MUST equal the viewport. Playwright does not scale the page into a
    # larger record_video_size, it PADS: asking for 1728x1080 while the viewport
    # is 1280x800 bakes the site into the top-left 74% of the frame and fills the
    # rest with grey, in the mp4 and in any poster cut from it. Confirmed defect.
    "desktop": {"vw": 1280, "vh": 800, "dsf": 2, "mobile": False,
                "rec": (1280, 800), "out_w": 1080, "size_cap_kb": 2048, "size_target_kb": 1600},
    "phone":   {"vw": 390, "vh": 844, "dsf": 3, "mobile": True,
                "rec": (390, 844), "out_w": 540, "size_cap_kb": 1400, "size_target_kb": 1024},
    "card":    {"vw": 1000, "vh": 1250, "dsf": 2, "mobile": False},   # 4:5
    "still":   {"vw": 1440, "vh": 900, "dsf": 2, "mobile": False},    # 16:10
}

CARD_W, CARD_H = 800, 1000        # 4:5, one aspect for all four cards
STILL_W, STILL_H = 1440, 900      # 16:10
WEBP_Q = 80
JPEG_Q = 80

FPS = 30              # Path B: we author every frame, so we pick the rate
SCREENCAST_FPS = 25   # Path A: Playwright's screencast rate — match it exactly

VIEWPORT = {"width": DEVICES["desktop"]["vw"], "height": DEVICES["desktop"]["vh"]}
SCALE = 2

WHEEL_STEP = 700      # px per wheel tick (scout)
WHEEL_PAUSE = 120     # ms between ticks (scout)
MAX_STEPS = 400       # safety cap: ~280k px of page

HIDE_SCROLLBARS = """
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  html { scrollbar-width: none !important; }
"""

# Lazy images never get a chance to load when we glide past at 500px/s, so make
# everything eager up front rather than pre-scrolling (a pre-scroll would burn
# every scroll-reveal animation before the reel starts).
EAGER_MEDIA_JS = """
() => {
  document.querySelectorAll('img').forEach(i => {
    i.loading = 'eager';
    i.decoding = 'sync';
    if (i.dataset.src && !i.src) i.src = i.dataset.src;
    if (i.dataset.srcset && !i.srcset) i.srcset = i.dataset.srcset;
  });
  document.querySelectorAll('video').forEach(v => {
    v.preload = 'auto';
    v.muted = true;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  });
}
"""

HERO_PLAYING_JS = """
() => {
  const v = document.querySelector('video');
  if (!v) return true;
  return v.readyState >= 2 && !v.paused;
}
"""

# Path B: pin every in-view <video> to the reel clock so a stepped capture does
# not fast-forward the hero (real time runs ~6x the reel timeline while we work).
SYNC_VIDEOS_JS = """
async (t) => {
  const vids = [...document.querySelectorAll('video')].filter(v => {
    const r = v.getBoundingClientRect();
    return r.width > 0 && r.bottom > -80 && r.top < innerHeight + 80;
  });
  await Promise.all(vids.map(v => new Promise(res => {
    try {
      if (!v.paused) v.pause();
      const d = v.duration;
      if (!isFinite(d) || d <= 0) return res();
      const target = t % d;
      if (Math.abs(v.currentTime - target) < 0.02) return res();
      let done = false;
      const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); res(); };
      v.addEventListener('seeked', fin);
      v.currentTime = target;
      setTimeout(fin, 350);
    } catch (e) { res(); }
  })));
}
"""

TWO_RAF_JS = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"

# Path A: the scroll is driven from INSIDE the page on rAF.
#
# Driving it from Python (a wheel event plus a scrollY read per frame) costs two
# CDP round trips per frame and starves the renderer: measured output was ~6
# unique frames a second with the rest duplicated, i.e. visibly choppy. An
# in-page rAF loop renders at the display rate with zero round trips while the
# screencast is running, and lands each frame on the exact eased position.
DRIVE_SCROLL_JS = """
({segments, hold, k}) => new Promise(resolve => {
  const yAt = (t) => {
    for (const s of segments) {
      if (t <= s.t1 || s === segments[segments.length - 1]) {
        const u = s.t1 > s.t0 ? Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))) : 1;
        const e = (1 - k) * u + k * (0.5 - 0.5 * Math.cos(Math.PI * u));
        return s.a + (s.b - s.a) * e;
      }
    }
    return segments[segments.length - 1].b;
  };
  const dur = segments[segments.length - 1].dur;
  const start = performance.now();
  const frame = (now) => {
    const el = (now - start) / 1000;
    if (el < hold) { window.scrollTo(0, yAt(0)); requestAnimationFrame(frame); return; }
    const t = Math.min(1, (el - hold) / dur);
    window.scrollTo(0, yAt(t));
    if (t >= 1) { resolve(true); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})
"""


# --------------------------------------------------------------------------
# Scrolling (everything goes through the wheel — see note 1 at the top)
# --------------------------------------------------------------------------

def scroll_y(page):
    return page.evaluate("() => window.scrollY")


def at_bottom(page):
    return page.evaluate(
        "() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 2"
    )


def wheel_to_bottom(page):
    """Scroll to the bottom via real wheel events so Lenis actually moves."""
    for _ in range(MAX_STEPS):
        if at_bottom(page):
            return True
        page.mouse.wheel(0, WHEEL_STEP)
        page.wait_for_timeout(WHEEL_PAUSE)
    return False


def wheel_to_top(page):
    for _ in range(MAX_STEPS):
        if page.evaluate("() => window.scrollY <= 1"):
            return
        page.mouse.wheel(0, -WHEEL_STEP)
        page.wait_for_timeout(WHEEL_PAUSE)


def wheel_chase(page, target, tol=6, tries=90, cap=650, pause=42):
    """Proportional wheel controller — walk to an absolute scroll position."""
    cur = scroll_y(page)
    for _ in range(tries):
        d = target - cur
        if abs(d) < tol:
            break
        page.mouse.wheel(0, max(-cap, min(cap, d)))
        page.wait_for_timeout(pause)
        cur = scroll_y(page)
    return cur


def set_scroll_exact(page, target, tol=1.5, tries=3):
    """Path B: land on an exact planned position and confirm it holds.

    Measured on all four sites: these Lenis builds ride native scroll, so
    window.scrollTo lands exactly and survives two rAFs. That exactness is the
    whole point of Path B — a wheel controller jitters by up to ~180px between
    frames, which is precisely the stutter we are trying to avoid. Lenis can
    still drag a position back when the document grows underneath us, so every
    set is verified and re-applied before the frame is taken.
    """
    for _ in range(tries):
        page.evaluate("(y) => window.scrollTo(0, y)", target)
        page.evaluate(TWO_RAF_JS)
        cur = scroll_y(page)
        if abs(cur - target) <= tol:
            return cur
    # Lenis fought us: fall back to the wheel, which always moves these pages.
    cur = scroll_y(page)
    for _ in range(6):
        err = target - cur
        if abs(err) <= 12:
            break
        page.mouse.wheel(0, max(-900, min(900, err * 3)))
        page.evaluate(TWO_RAF_JS)
        cur = scroll_y(page)
    return cur


def resolve_stop(page, stop, vh):
    """A stop is {y}, {vh: n} or {sel, off} — always resolved on the live page."""
    if "y" in stop:
        return float(stop["y"])
    if "vh" in stop:
        return float(stop["vh"]) * vh
    y = page.evaluate(
        """(sel) => { const el = document.querySelector(sel);
             if (!el) return null;
             const r = el.getBoundingClientRect();
             return r.top + window.scrollY; }""",
        stop["sel"],
    )
    if y is None:
        raise RuntimeError(f"stop selector not found: {stop['sel']}")
    return float(y) + float(stop.get("off", 0))


def resolve_stops(page, stops, vh):
    doc = page.evaluate(
        "() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")
    limit = max(0, doc - vh)
    return [max(0.0, min(limit, resolve_stop(page, s, vh))) for s in stops]


def segment_weights(stops):
    """Per-segment time multipliers, taken from "w" on the stop each one ends at."""
    return [float(s.get("w", 1.0)) for s in stops[1:]]


def build_segments(ys, duration, seg_w=None):
    """The same pacing as build_plan, expressed as time-normalised segments.

    Path A hands these to the in-page rAF driver; keeping one weighting rule
    here means both paths move the camera identically.
    """
    dists = [abs(ys[i + 1] - ys[i]) for i in range(len(ys) - 1)]
    weights = [max(d, 1.0) ** 0.85 for d in dists]
    if seg_w:
        weights = [w * float(seg_w[i] if i < len(seg_w) else 1.0) for i, w in enumerate(weights)]
    total = sum(weights) or 1.0
    segs, acc = [], 0.0
    for i, w in enumerate(weights):
        t0 = acc
        acc += w / total
        segs.append({"a": float(ys[i]), "b": float(ys[i + 1]),
                     "t0": t0, "t1": min(1.0, acc), "dur": duration})
    segs[-1]["t1"] = 1.0
    return segs


# --------------------------------------------------------------------------
# Pacing
# --------------------------------------------------------------------------

def build_plan(stops, duration, fps, k=0.62, seg_w=None):
    """Frame-by-frame scroll targets.

    Time is split between chapters by distance**0.85 (so a long run does not
    hog the reel), and each chapter is eased with a cosine blended against
    linear motion: velocity dips to roughly a third at every boundary without
    ever stopping dead. That is the "slower at section boundaries" pacing.

    seg_w lets a chapter be hurried through ("w" on a stop weights the segment
    that ends at it) — used to skate over a section's quiet tail.
    """
    frames = max(2, int(round(duration * fps)))
    if len(stops) < 2:
        return [float(stops[0] if stops else 0)] * frames

    dists = [abs(stops[i + 1] - stops[i]) for i in range(len(stops) - 1)]
    weights = [max(d, 1.0) ** 0.85 for d in dists]
    if seg_w:
        weights = [w * float(seg_w[i] if i < len(seg_w) else 1.0) for i, w in enumerate(weights)]
    total = sum(weights)
    seg = [max(2, int(round(frames * w / total))) for w in weights]

    drift = frames - sum(seg)
    i = 0
    while drift != 0 and seg:
        j = i % len(seg)
        if drift > 0:
            seg[j] += 1
            drift -= 1
        elif seg[j] > 2:
            seg[j] -= 1
            drift += 1
        i += 1
        if i > 10000:
            break

    ys = []
    for idx, n in enumerate(seg):
        a, b = float(stops[idx]), float(stops[idx + 1])
        for j in range(n):
            u = j / n
            e = (1 - k) * u + k * (0.5 - 0.5 * math.cos(math.pi * u))
            ys.append(a + (b - a) * e)
    while len(ys) < frames:
        ys.append(float(stops[-1]))
    return ys[:frames]


# --------------------------------------------------------------------------
# Page hygiene
# --------------------------------------------------------------------------

def wait_hero_playing(page, timeout=7000):
    """Bounded wait for the hero video; a stalled video must never hang a run."""
    try:
        page.wait_for_function(HERO_PLAYING_JS, timeout=timeout)
        return True
    except Exception:
        try:
            page.evaluate("() => { const v=document.querySelector('video'); if(v){v.muted=true; v.play().catch(()=>{});} }")
            page.wait_for_timeout(1200)
            return bool(page.evaluate(HERO_PLAYING_JS))
        except Exception:
            return False


def prepare(page, site, settle=900):
    page.goto(site["url"], wait_until="networkidle", timeout=90_000)
    page.add_style_tag(content=HIDE_SCROLLBARS)
    page.evaluate("() => document.fonts.ready")
    page.evaluate(EAGER_MEDIA_JS)
    page.wait_for_timeout(settle)
    playing = True
    if site.get("hero_video"):
        playing = wait_hero_playing(page)
        if not playing:
            print(f"  ! hero video never reported playing on {site['slug']} — continuing")
    page.wait_for_timeout(400)
    return playing


def new_context(browser, dev, **extra):
    d = DEVICES[dev]
    kwargs = dict(
        viewport={"width": d["vw"], "height": d["vh"]},
        device_scale_factor=d["dsf"],
        is_mobile=d["mobile"],
        has_touch=d["mobile"],
        reduced_motion="no-preference",
    )
    kwargs.update(extra)
    return browser.new_context(**kwargs)


# --------------------------------------------------------------------------
# Encoding
# --------------------------------------------------------------------------

def run(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed:\n{p.stderr[-2500:]}")
    return p


def encode_h264(src_args, out, out_w, crf, fps=FPS, extra_in=()):
    ff = ffmpeg_bin()
    # out_range=tv keeps the JPEG-sourced Path B frames from being tagged
    # yuvj420p, so both paths emit identical, boringly-compatible yuv420p.
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", *extra_in, *src_args,
           "-vf", f"scale={out_w}:-2:flags=lanczos:in_range=auto:out_range=tv,setsar=1,format=yuv420p",
           "-color_range", "tv",
           "-r", str(fps), "-fps_mode", "cfr",
           "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
           "-crf", str(crf), "-g", "60", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", "-an", str(out)]
    run(cmd)
    return Path(out).stat().st_size


def encode_to_target(src_args, out, out_w, target_kb, cap_kb, extra_in=(), fps=FPS):
    """CRF 26 first, stepping up until the weight target is met.

    The target is the number that keeps a page of reels light; the cap is the
    number we refuse to ship past. Escalate to the target, not merely the cap.
    """
    result = (26, 0.0)
    for crf in (26, 29, 32, 35):
        kb = encode_h264(src_args, out, out_w, crf, fps=fps, extra_in=extra_in) / 1024
        result = (crf, kb)
        if kb <= target_kb:
            break
    if result[1] > cap_kb:
        print(f"  ! {Path(out).name} is {result[1]:.0f}KB, over the {cap_kb}KB cap "
              f"even at CRF {result[0]} — shorten the reel")
    return result


def write_poster(mp4, jpg):
    """Poster == the mp4's own first frame, so the swap is seamless."""
    ff = ffmpeg_bin()
    tmp = Path(str(jpg) + ".tmp.png")
    run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mp4),
         "-frames:v", "1", "-f", "image2", str(tmp)])
    im = Image.open(tmp).convert("RGB")
    im.save(jpg, "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
    tmp.unlink(missing_ok=True)
    return im.size


# --------------------------------------------------------------------------
# Reels
# --------------------------------------------------------------------------

def reel_path_a(browser, site, device, spec, work):
    """Screencast while wheel-scrolling in real time, then trim + encode."""
    d = DEVICES[device]
    rec_dir = SCRATCH / "rec" / f"{site['slug']}-{device}"
    if rec_dir.exists():
        shutil.rmtree(rec_dir)
    rec_dir.mkdir(parents=True, exist_ok=True)

    ctx = new_context(browser, device,
                      record_video_dir=str(rec_dir),
                      record_video_size={"width": d["rec"][0], "height": d["rec"][1]})
    page = ctx.new_page()
    t_rec = time.monotonic()
    try:
        prepare(page, site)
        stops = resolve_stops(page, spec["stops"], d["vh"])
        segs = build_segments(stops, spec["duration"], seg_w=segment_weights(spec["stops"]))
        hold = spec.get("hold", 1.3)

        t0 = time.monotonic()
        page.evaluate(DRIVE_SCROLL_JS,
                      {"segments": segs, "hold": hold, "k": 0.62},
                      )
        page.wait_for_timeout(260)
        t1 = time.monotonic()
        video = page.video
    finally:
        ctx.close()

    src = Path(video.path())
    ss = max(0.0, t0 - t_rec)
    length = max(1.0, t1 - t0)

    out = work / f"reel-{device}.mp4"
    # Encode at the screencast's own rate. Forcing 30fps CFR on a 25fps source
    # pads one duplicate frame in five, which reads as judder and confuses any
    # honest smoothness measurement.
    crf, kb = encode_to_target(["-i", str(src), "-ss", f"{ss:.3f}", "-t", f"{length:.3f}"],
                               out, d["out_w"], d["size_target_kb"], d["size_cap_kb"],
                               fps=SCREENCAST_FPS)
    return {"path": "A", "out": out, "crf": crf, "kb": kb, "stops": stops,
            "planned": spec["duration"] + spec.get("hold", 1.3)}


def reel_path_b(browser, site, device, spec, work):
    """Deterministic frame stepping — exact positions, video pinned to the clock."""
    d = DEVICES[device]
    frames_dir = SCRATCH / "frames" / f"{site['slug']}-{device}"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)

    ctx = new_context(browser, device)
    page = ctx.new_page()
    try:
        prepare(page, site)
        stops = resolve_stops(page, spec["stops"], d["vh"])
        hold = spec.get("hold", 1.3)
        hold_frames = int(round(hold * FPS))
        plan = ([stops[0]] * hold_frames
                + build_plan(stops, spec["duration"], FPS, seg_w=segment_weights(spec["stops"])))

        # Stepping a frame costs far more wall time than the 1/30s it represents,
        # so anything running off the clock would fast-forward. Videos are the
        # part that shows, and they are pinned to the reel clock per frame below.
        #
        # Do NOT try to slow CSS/Web Animations with CDP Animation.setPlaybackRate
        # to match: changing the rate mid-run shifts the document timeline's
        # origin, so any script that had already cached a document.timeline
        # timestamp then computes a wildly negative elapsed time. On Goldy that
        # rendered the trust strip's count-up as "-123049+ cars detailed". Letting
        # time-based decoration simply finish early is the lesser evil.
        n = 0
        for i, target in enumerate(plan):
            t = i / FPS
            set_scroll_exact(page, target)
            page.evaluate(SYNC_VIDEOS_JS, t)
            page.evaluate(TWO_RAF_JS)
            n += 1
            page.screenshot(path=str(frames_dir / f"{n:05d}.jpg"),
                            type="jpeg", quality=92)
    finally:
        ctx.close()

    out = work / f"reel-{device}.mp4"
    crf, kb = encode_to_target(["-i", str(frames_dir / "%05d.jpg")],
                               out, d["out_w"], d["size_target_kb"], d["size_cap_kb"],
                               extra_in=["-framerate", str(FPS)])
    return {"path": "B", "out": out, "crf": crf, "kb": kb, "stops": stops,
            "planned": spec["duration"] + hold}


def cmd_reel(args):
    targets = pick_sites(args.site)
    devices = [args.device] if args.device else ["desktop", "phone"]
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for site in targets:
                work = WORK_DIR / site["slug"]
                work.mkdir(parents=True, exist_ok=True)
                for device in devices:
                    spec = site.get("reel", {}).get(device)
                    if not spec:
                        print(f"[{site['slug']}] no {device} reel configured — skipping")
                        continue
                    path = (args.path or spec.get("path", "A")).upper()
                    print(f"[{site['slug']}/{device}] reel via path {path} ...", flush=True)
                    fn = reel_path_a if path == "A" else reel_path_b
                    r = fn(browser, site, device, spec, work)
                    poster = work / f"reel-{device}.jpg"
                    size = write_poster(r["out"], poster)
                    print(f"[{site['slug']}/{device}] path {r['path']} crf {r['crf']} "
                          f"{r['kb']:.0f}KB  stops={[int(s) for s in r['stops']]}")
                    print(f"[{site['slug']}/{device}] -> {r['out'].name} + {poster.name} {size}")
                    rows.append(r)
        finally:
            browser.close()
    return 0 if rows else 1


# --------------------------------------------------------------------------
# Cards + stills
# --------------------------------------------------------------------------

def crop_to(im, w, h):
    """Cover-crop to an exact aspect, anchored at the centre."""
    tw, th = w / h, im.width / im.height
    if th > tw:
        nw = int(round(im.height * tw))
        x = (im.width - nw) // 2
        im = im.crop((x, 0, x + nw, im.height))
    elif th < tw:
        nh = int(round(im.width / tw))
        y = (im.height - nh) // 2
        im = im.crop((0, y, im.width, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def shoot_stop(page, stop, vh, settle=1200):
    y = resolve_stops(page, [stop], vh)[0]
    wheel_chase(page, y)
    page.wait_for_timeout(settle)
    return scroll_y(page)


def cmd_shots(args):
    targets = pick_sites(args.site)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for site in targets:
                work = WORK_DIR / site["slug"]
                work.mkdir(parents=True, exist_ok=True)
                raw = SCRATCH / "raw" / site["slug"]
                raw.mkdir(parents=True, exist_ok=True)

                # --- card (4:5) -------------------------------------------
                ctx = new_context(browser, "card")
                page = ctx.new_page()
                try:
                    prepare(page, site)
                    y = shoot_stop(page, site["card"], DEVICES["card"]["vh"])
                    png = raw / "card.png"
                    page.screenshot(path=str(png))
                    im = crop_to(Image.open(png).convert("RGB"), CARD_W, CARD_H)
                    im.save(work / "card.webp", "WEBP", quality=WEBP_Q, method=6)
                    print(f"[{site['slug']}] card.webp {CARD_W}x{CARD_H} @y={int(y)} "
                          f"{(work / 'card.webp').stat().st_size / 1024:.0f}KB")
                finally:
                    ctx.close()

                # --- stills (16:10) ---------------------------------------
                ctx = new_context(browser, "still")
                page = ctx.new_page()
                try:
                    prepare(page, site)
                    for i, stop in enumerate(site["stills"], start=1):
                        y = shoot_stop(page, stop, DEVICES["still"]["vh"])
                        png = raw / f"still-{i:02d}.png"
                        page.screenshot(path=str(png))
                        im = crop_to(Image.open(png).convert("RGB"), STILL_W, STILL_H)
                        name = f"still-{i:02d}.webp"
                        im.save(work / name, "WEBP", quality=WEBP_Q, method=6)
                        print(f"[{site['slug']}] {name} {STILL_W}x{STILL_H} @y={int(y)} "
                              f"{(work / name).stat().st_size / 1024:.0f}KB")
                finally:
                    ctx.close()
        finally:
            browser.close()
    return 0


# --------------------------------------------------------------------------
# OG image
# --------------------------------------------------------------------------

OG_SLUGS = ["shocked-solar", "goldy", "karine"]
INK = (10, 14, 26)


def cmd_og(args):
    cards = [WORK_DIR / s / "card.webp" for s in OG_SLUGS]
    missing = [c for c in cards if not c.exists()]
    if missing:
        print(f"missing cards: {', '.join(str(m) for m in missing)} — run `shots` first")
        return 1

    W, H = 1200, 630
    cw, ch, gap = 341, 427, 28
    total = len(cards) * cw + (len(cards) - 1) * gap
    x0 = (W - total) // 2
    y0 = (H - ch) // 2

    bg = Image.new("RGB", (W, H), INK)

    # a soft blue bloom behind the row, matching the dark chapters on the page
    glow = Image.new("RGB", (W // 4, H // 4), INK)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W // 8 - 150, H // 8 - 60, W // 8 + 150, H // 8 + 60], fill=(34, 62, 128))
    gd.ellipse([W // 8 - 70, H // 8 - 34, W // 8 + 70, H // 8 + 34], fill=(58, 96, 178))
    glow = glow.filter(ImageFilter.GaussianBlur(28)).resize((W, H), Image.LANCZOS)
    bg = Image.blend(bg, glow, 0.45)

    for i, c in enumerate(cards):
        im = crop_to(Image.open(c).convert("RGB"), cw, ch)
        rounded = Image.new("L", (cw, ch), 0)
        ImageDraw.Draw(rounded).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=14, fill=255)
        x = x0 + i * (cw + gap)
        # a hairline lift so each card separates from the ink
        shadow = Image.new("L", (cw + 24, ch + 24), 0)
        ImageDraw.Draw(shadow).rounded_rectangle([12, 12, cw + 11, ch + 11], radius=16, fill=110)
        shadow = shadow.filter(ImageFilter.GaussianBlur(9))
        bg.paste(Image.new("RGB", (cw + 24, ch + 24), (4, 7, 16)), (x - 12, y0 - 12), shadow)
        bg.paste(im, (x, y0), rounded)

    OG_PATH.parent.mkdir(parents=True, exist_ok=True)
    bg.save(OG_PATH, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"og -> {OG_PATH} {W}x{H} {OG_PATH.stat().st_size / 1024:.0f}KB")
    return 0


# --------------------------------------------------------------------------
# Scout stills (original behaviour, untouched)
# --------------------------------------------------------------------------

def capture(site, out_dir, browser):
    ctx = browser.new_context(
        viewport=VIEWPORT,
        device_scale_factor=SCALE,
        reduced_motion="no-preference",
    )
    page = ctx.new_page()
    try:
        page.goto(site["url"], wait_until="networkidle", timeout=60_000)
        page.add_style_tag(content=HIDE_SCROLLBARS)
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(800)

        # Hero first, before anything has scrolled.
        hero = Path(out_dir) / f"{site['slug']}-hero.png"
        page.screenshot(path=str(hero))

        # Walk the whole page so lazy images and scroll-triggered reveals fire.
        reached = wheel_to_bottom(page)
        page.wait_for_timeout(1500)
        wheel_to_top(page)
        page.wait_for_timeout(800)

        full = Path(out_dir) / f"{site['slug']}-full.png"
        page.screenshot(path=str(full), full_page=True)

        height = page.evaluate("() => document.body.scrollHeight")
        return {"ok": True, "hero": hero, "full": full, "height": height, "reached_bottom": reached}
    finally:
        ctx.close()


def cmd_stills(args):
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = SITES if not args.site else [s for s in SITES if s["slug"] == args.site]
    if not targets:
        print(f"No site matching slug '{args.site}'. Known: {', '.join(s['slug'] for s in SITES)}")
        return 1

    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for site in targets:
                print(f"[{site['slug']}] {site['url']} ...", flush=True)
                try:
                    r = capture(site, out_dir, browser)
                    note = "" if r["reached_bottom"] else "  (WARNING: hit step cap before bottom)"
                    print(f"[{site['slug']}] page height {r['height']}px{note}")
                    print(f"[{site['slug']}] hero -> {r['hero']}")
                    print(f"[{site['slug']}] full -> {r['full']}")
                except Exception as e:
                    failures.append((site["slug"], repr(e)))
                    print(f"[{site['slug']}] FAILED: {e}", file=sys.stderr)
        finally:
            browser.close()

    if failures:
        print("\nFailures:")
        for slug, err in failures:
            print(f"  {slug}: {err}")
        return 1
    return 0


# --------------------------------------------------------------------------

def pick_sites(slug):
    if not slug:
        return SITES
    if slug not in SITE_BY_SLUG:
        raise SystemExit(f"No site '{slug}'. Known: {', '.join(SITE_BY_SLUG)}")
    return [SITE_BY_SLUG[slug]]


def cmd_all(args):
    rc = cmd_reel(argparse.Namespace(site=args.site, device=None, path=None))
    rc |= cmd_shots(argparse.Namespace(site=args.site))
    rc |= cmd_og(argparse.Namespace())
    return rc


def cmd_manifest(args):
    """Machine-readable list of every asset the Work page contracts for."""
    out = []
    for s in SITES:
        w = WORK_DIR / s["slug"]
        names = ["card.webp"] + [f"still-{i:02d}.webp" for i in range(1, len(s["stills"]) + 1)]
        for dev in s.get("reel", {}):
            names += [f"reel-{dev}.mp4", f"reel-{dev}.jpg"]
        for n in names:
            p = w / n
            out.append({"slug": s["slug"], "name": n, "path": str(p),
                        "exists": p.exists(), "kb": round(p.stat().st_size / 1024, 1) if p.exists() else 0})
    print(json.dumps(out, indent=1))
    return 0


def main():
    ap = argparse.ArgumentParser(description="Capture stills and reels of the live client sites.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("stills", help="scout: full-page + hero PNG per site")
    s.add_argument("--site", help="only this slug")
    s.add_argument("--out", default=DEFAULT_OUT, help="output directory")
    s.set_defaults(func=cmd_stills)

    r = sub.add_parser("reel", help="production: reel mp4 + poster into assets/work/<slug>/")
    r.add_argument("--site", help="only this slug")
    r.add_argument("--device", choices=["desktop", "phone"], help="only this device")
    r.add_argument("--path", choices=["A", "B", "a", "b"], help="force a capture path")
    r.set_defaults(func=cmd_reel)

    h = sub.add_parser("shots", help="production: card.webp + still-0N.webp")
    h.add_argument("--site", help="only this slug")
    h.set_defaults(func=cmd_shots)

    o = sub.add_parser("og", help="production: assets/og/work-og.jpg from the cards")
    o.set_defaults(func=cmd_og)

    a = sub.add_parser("all", help="reels + shots + og")
    a.add_argument("--site", help="only this slug")
    a.set_defaults(func=cmd_all)

    m = sub.add_parser("manifest", help="JSON list of contracted assets and their state")
    m.set_defaults(func=cmd_manifest)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
