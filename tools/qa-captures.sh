#!/usr/bin/env bash
#
# qa-captures.sh — gate every asset the Work page contracts for.
#
#   tools/qa-captures.sh                 # check everything
#   tools/qa-captures.sh --no-recapture  # check only, never re-shoot
#
# Reels are checked for codec, pixel format, even dimensions, duration, weight,
# a poster that matches the video, black runs, and — the one that actually
# matters — scroll smoothness. Smoothness is measured as the frame-to-frame
# vertical shift of the rendered video (a 1D cross-correlation of row profiles),
# not raw pixel difference: a dark section giving way to a bright one is a huge
# pixel difference and a perfectly smooth scroll, and we must not confuse them.
#
# Any reel that fails smoothness is re-captured once via Path B (deterministic
# frame stepping) and re-checked, because that is the fix for site-side jank.
#
# There is no ffprobe on this machine, so stream facts are parsed out of
# `ffmpeg -i`, which reports the same things.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/assets/work"
OG="$ROOT/assets/og/work-og.jpg"

FFMPEG="$HOME/bin/ffmpeg"
[ -x "$FFMPEG" ] || FFMPEG="$(command -v ffmpeg || true)"
if [ -z "$FFMPEG" ]; then echo "ffmpeg not found (~/bin or \$PATH)"; exit 2; fi

RECAPTURE=1
[ "${1:-}" = "--no-recapture" ] && RECAPTURE=0

SCRATCH="${OFFSIDER_SCRATCH:-/private/tmp/claude-501/-Users-nicholasmatthews/c036ed8f-4519-4e3c-be7f-cb41d2c0d3bc/scratchpad/captures}"
mkdir -p "$SCRATCH"
RETRY_LIST="$SCRATCH/qa-retry.txt"

analyse() {
  FFMPEG="$FFMPEG" WORK="$WORK" OG="$OG" RETRY_LIST="$RETRY_LIST" python3 - "$@" <<'PY'
import json, os, re, subprocess, sys
from pathlib import Path

FF   = os.environ["FFMPEG"]
WORK = Path(os.environ["WORK"])
OG   = Path(os.environ["OG"])
RETRY = Path(os.environ["RETRY_LIST"])

import numpy as np

# slug -> (has reels, number of stills)
PLAN = {
    "shocked-solar": (True, 3),
    "goldy":         (True, 3),
    "karine":        (True, 3),
    "greenwood":     (False, 1),
}
DEVICES = {
    "desktop": {"w": 1080, "target_kb": 1600, "cap_kb": 2048},
    "phone":   {"w": 540,  "target_kb": 1024, "cap_kb": 1400},
}
DUR_MIN, DUR_MAX = 6.0, 13.0
BLACK_MAX = 0.4
WEBP_MAX_KB = 400

rows, retry = [], []


def add(asset, ok, detail):
    rows.append((asset, ok, detail))
    return ok


def ffinfo(path):
    """codec / pix_fmt / dims / duration, parsed from `ffmpeg -i` (no ffprobe here)."""
    p = subprocess.run([FF, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    txt = p.stderr
    out = {"codec": None, "pix": None, "w": None, "h": None, "dur": None, "fps": None}
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", txt)
    if m:
        out["dur"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Stream #\d+:\d+.*?: Video: (\w+).*", txt)
    if m:
        out["codec"] = m.group(1)
        line = m.group(0)
        pm = re.search(r"\b(yuvj?\d{3}p(?:\(\w[^)]*\))?)", line)
        if pm:
            out["pix"] = pm.group(1).split("(")[0]
        dm = re.search(r"\b(\d{2,5})x(\d{2,5})\b", line)
        if dm:
            out["w"], out["h"] = int(dm.group(1)), int(dm.group(2))
        fm = re.search(r"([\d.]+) fps", line)
        if fm:
            out["fps"] = float(fm.group(1))
    return out


def black_runs(path):
    p = subprocess.run(
        [FF, "-hide_banner", "-nostats", "-i", str(path),
         "-vf", "blackdetect=d=0.10:pic_th=0.98:pix_th=0.10", "-an", "-f", "null", "-"],
        capture_output=True, text=True)
    return [float(m) for m in re.findall(r"black_duration:([\d.]+)", p.stderr)]


GRID_W, GRID_H = 96, 512
CROP = "crop=iw:ih*0.74:0:ih*0.13"   # drop sticky header / bottom furniture


def decode_grid(path):
    """Grayscale frames on a fixed grid, header and footer cropped away."""
    p = subprocess.run(
        [FF, "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-vf", f"{CROP},scale={GRID_W}:{GRID_H},format=gray", "-f", "rawvideo", "-"],
        capture_output=True)
    buf = np.frombuffer(p.stdout, dtype=np.uint8)
    n = len(buf) // (GRID_W * GRID_H)
    if n < 12:
        return None
    return buf[: n * GRID_W * GRID_H].reshape(n, GRID_H, GRID_W).astype(np.float32)


def shift_series(fr, search=130):
    """Per-frame vertical displacement, in grid rows, plus a confidence.

    The profile is the vertical-edge energy per row with the clip's temporal
    mean removed. That subtraction is load-bearing: Shocked Solar has a fixed
    full-viewport gradient overlay, and without removing it every frame pair
    correlates best at zero shift and a perfectly smooth reel reads as frozen.
    """
    prof = np.abs(np.diff(fr, axis=1)).mean(axis=2)
    prof = prof - prof.mean(axis=0, keepdims=True)
    prof = (prof - prof.mean(axis=1, keepdims=True)) / (prof.std(axis=1, keepdims=True) + 1e-6)
    R = prof.shape[1]
    lim = min(search, int(R * 0.6))
    v, conf = [], []
    for i in range(len(prof) - 1):
        a, b = prof[i], prof[i + 1]
        cs = np.array([float(np.dot(a[s:], b[: R - s]) / (R - s)) for s in range(lim)])
        k = int(np.argmax(cs))
        v.append(k)
        conf.append(float(cs[k] - np.median(cs)))
    return np.array(v, dtype=np.float32), np.array(conf, dtype=np.float32)


def smoothness(path):
    """Return (ok, detail).

    Two independent signals, because neither alone is trustworthy on all four
    sites: (1) freezes — runs of near-identical frames while the reel should be
    moving, which is what a dropped-frame hitch looks like; (2) velocity spikes
    among displacement estimates we actually trust, which is what a scroll jump
    looks like. Frames the tracker cannot lock onto (large flat black areas) are
    excluded rather than guessed at.
    """
    fr = decode_grid(path)
    if fr is None:
        return False, "too few frames to analyse"

    mad = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
    v, conf = shift_series(fr)
    n = len(v)
    if n < 20:
        return False, f"only {n} frame pairs"

    # analyse only the moving stretch, and stay clear of the intentional
    # ease-in/ease-out at either end
    live = float(np.percentile(mad, 75))
    moving = np.where(mad > live * 0.25)[0]
    if len(moving) < 15:
        return False, "reel barely moves"
    lo, hi = int(moving[0]) + 6, int(moving[-1]) - 6
    if hi - lo < 15:
        return False, "moving stretch too short to judge"
    m = hi - lo + 1

    # (1) freezes
    froze, longest, cur = 0, 0, 0
    dup_thr = max(0.12, live * 0.06)
    for i in range(lo, hi + 1):
        cur = cur + 1 if mad[i] < dup_thr else 0
        longest = max(longest, cur)
        froze += 1 if mad[i] < dup_thr else 0

    # (2) velocity spikes among trusted estimates
    seg, cseg = v[lo:hi + 1], conf[lo:hi + 1]
    k = 9
    pad = np.pad(seg, (k // 2, k // 2), mode="edge")
    med = np.array([np.median(pad[i:i + k]) for i in range(m)])
    trust = cseg > 0.30
    spike = (np.abs(seg - med) > np.maximum(4.0, 0.70 * np.maximum(med, 1.0))) & trust
    tn = int(trust.sum())
    spike_pct = (100.0 * float(spike.sum()) / tn) if tn else 0.0

    ok = longest < 4 and (tn < 12 or spike_pct <= 12.0)
    detail = (f"{med[trust].mean() if tn else 0:.0f}px/f, freeze run {longest}f, "
              f"spikes {int(spike.sum())}/{tn} trusted ({spike_pct:.0f}%)")
    return ok, detail


def check_reel(slug, device):
    d = DEVICES[device]
    mp4 = WORK / slug / f"reel-{device}.mp4"
    jpg = WORK / slug / f"reel-{device}.jpg"
    tag = f"{slug}/reel-{device}.mp4"
    if not mp4.exists():
        add(tag, False, "MISSING")
        return
    info = ffinfo(mp4)
    kb = mp4.stat().st_size / 1024
    problems = []
    if info["codec"] != "h264":
        problems.append(f"codec={info['codec']}")
    if info["pix"] != "yuv420p":
        problems.append(f"pix={info['pix']}")
    if not info["w"] or info["w"] % 2 or not info["h"] or info["h"] % 2:
        problems.append(f"odd dims {info['w']}x{info['h']}")
    if info["w"] != d["w"]:
        problems.append(f"width {info['w']} != {d['w']}")
    if not info["dur"] or not (DUR_MIN <= info["dur"] <= DUR_MAX):
        problems.append(f"duration {info['dur']}s outside {DUR_MIN}-{DUR_MAX}")
    if info["fps"] and not (24 <= info["fps"] <= 31):
        problems.append(f"fps {info['fps']}")
    if kb > d["cap_kb"]:
        problems.append(f"{kb:.0f}KB over hard cap {d['cap_kb']}KB")
    note = "" if kb <= d["target_kb"] else f" (over {d['target_kb']}KB target)"
    add(tag, not problems,
        "; ".join(problems) if problems else
        f"h264 yuv420p {info['w']}x{info['h']} {info['dur']:.1f}s {kb:.0f}KB{note}")

    # poster must exist and match the video exactly
    ptag = f"{slug}/reel-{device}.jpg"
    if not jpg.exists():
        add(ptag, False, "MISSING")
    else:
        pi = ffinfo(jpg)
        pkb = jpg.stat().st_size / 1024
        okp = pi["w"] == info["w"] and pi["h"] == info["h"]
        add(ptag, okp,
            f"{pi['w']}x{pi['h']} {pkb:.0f}KB" if okp
            else f"{pi['w']}x{pi['h']} != video {info['w']}x{info['h']}")

    # no black run longer than BLACK_MAX
    br = black_runs(mp4)
    worst = max(br) if br else 0.0
    add(f"{slug}/reel-{device} black", worst <= BLACK_MAX,
        "no black runs" if not br else f"longest black run {worst:.2f}s")

    ok, detail = smoothness(mp4)
    add(f"{slug}/reel-{device} smooth", ok, detail)
    if not ok:
        retry.append(f"{slug} {device}")


def check_webp(slug, name, want_w):
    tag = f"{slug}/{name}"
    p = WORK / slug / name
    if not p.exists():
        add(tag, False, "MISSING")
        return
    raw = p.read_bytes()
    kb = len(raw) / 1024
    info = ffinfo(p)
    problems = []
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        problems.append("not a WEBP")
    lossless = b"VP8L" in raw[12:24]
    if lossless:
        problems.append("lossless (expected lossy q80)")
    if info["w"] != want_w:
        problems.append(f"width {info['w']} != {want_w}")
    if kb > WEBP_MAX_KB:
        problems.append(f"{kb:.0f}KB over {WEBP_MAX_KB}KB")
    if kb < 8:
        problems.append(f"only {kb:.1f}KB — quality collapsed?")
    add(tag, not problems,
        "; ".join(problems) if problems else f"lossy {info['w']}x{info['h']} {kb:.0f}KB")


for slug, (has_reels, n_stills) in PLAN.items():
    if has_reels:
        for device in ("desktop", "phone"):
            check_reel(slug, device)
    check_webp(slug, "card.webp", 800)
    for i in range(1, n_stills + 1):
        check_webp(slug, f"still-{i:02d}.webp", 1440)

# social image
if not OG.exists():
    add("og/work-og.jpg", False, "MISSING")
else:
    oi = ffinfo(OG)
    okb = OG.stat().st_size / 1024
    ok = oi["w"] == 1200 and oi["h"] == 630 and okb < 400
    add("og/work-og.jpg", ok, f"{oi['w']}x{oi['h']} {okb:.0f}KB")

w = max(len(r[0]) for r in rows) + 2
print()
print(f"{'ASSET'.ljust(w)}{'RESULT'.ljust(8)}DETAIL")
print("-" * (w + 8 + 46))
for asset, ok, detail in rows:
    print(f"{asset.ljust(w)}{('PASS' if ok else 'FAIL').ljust(8)}{detail}")
fails = [r for r in rows if not r[1]]
total_kb = sum(f.stat().st_size for f in WORK.rglob("*") if f.is_file()) / 1024
print("-" * (w + 8 + 46))
print(f"{len(rows) - len(fails)}/{len(rows)} passed   assets/work total {total_kb / 1024:.2f} MB")

RETRY.write_text("\n".join(retry))
sys.exit(1 if fails else 0)
PY
}

echo "== QA pass 1 =="
analyse
RC=$?

if [ "$RC" -ne 0 ] && [ "$RECAPTURE" -eq 1 ] && [ -s "$RETRY_LIST" ]; then
  echo
  echo "== unsmooth reels found — re-capturing via Path B =="
  # NB: read from fd 3, not stdin — capture-site.py would otherwise swallow the
  # rest of the list (which silently turned "goldy" into "ldy").
  while read -r slug device <&3; do
    [ -z "${slug:-}" ] && continue
    echo "-- $slug/$device -> path B"
    python3 "$ROOT/tools/capture-site.py" reel --site "$slug" --device "$device" --path B </dev/null || true
  done 3< "$RETRY_LIST"
  echo
  echo "== QA pass 2 =="
  analyse
  RC=$?
fi

exit "$RC"
