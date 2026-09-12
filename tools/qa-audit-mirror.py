#!/usr/bin/env python3
"""
qa-audit-mirror.py — the pre-deploy gate for the Leak Audit's JS scoring mirror.

Run:

    python3 tools/qa-audit-mirror.py            # serves the repo on :8934, runs, tears down
    python3 tools/qa-audit-mirror.py --port 9200

The pre-gate figure on audit.html is computed in the browser by
`scoreAuditPartial()` in audit.js, and the same seven answers are re-scored a
second later by `leak_audit.score_audit_partial()` on the server. If the two
ever disagree, the number visibly CHANGES under the visitor at the exact moment
they have just handed over their mobile number, which is the one moment on the
page where being wrong is unrecoverable.

So this file reproduces, in a real browser, the three worked examples in
leak-audit-ads/funnel/PARTIAL-CONTRACT.md, to the cent. Every expected value
below is copied from that document, not from a run of this code.

audit.js hands the mirror out only when the page is opened with ?mirror=check,
so nothing is exposed on a normal load.
"""
import argparse
import functools
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# PARTIAL-CONTRACT.md section 6, verbatim.
# ---------------------------------------------------------------------------
EXAMPLES = [
    {
        "name": "1. VERIFY-v2 answer set A (the statics set)",
        "answers": {
            "missed": "rings_out", "missed_week": "3_5", "winback": "about_half",
            "job_value": "500_1500", "enquiries": "10_25", "reply_speed": "hours",
            "late_outcome": "half_gone", "after_hours_calls": "ah_1_2",
        },
        "expect": {
            "missed_calls": (33000, 68000, "high", False),
            "slow_reply": (18000, 37000, "high", False),
            "total_low": 50000, "total_high": 104000, "weekly": 1483,
            "start_here": "missed_calls",
        },
    },
    {
        "name": "2. VERIFY-v2 video set (set A with winback=a_few)",
        "answers": {
            "missed": "rings_out", "missed_week": "3_5", "winback": "a_few",
            "job_value": "500_1500", "enquiries": "10_25", "reply_speed": "hours",
            "late_outcome": "half_gone", "after_hours_calls": "ah_1_2",
        },
        "expect": {
            "missed_calls": (49000, 101000, "critical", False),
            "slow_reply": (18000, 37000, "high", False),
            "total_low": 66000, "total_high": 138000, "weekly": 1964,
            "start_here": "missed_calls",
        },
    },
    {
        "name": "3. Both fallbacks, and start_here moving to Zip",
        "answers": {
            "missed": "voicemail", "missed_week": "no_idea", "winback": "a_few",
            "job_value": "200_500", "enquiries": "under_10", "reply_speed": "days",
            "late_outcome": "most_gone",
        },
        "expect": {
            "missed_calls": (6000, 11000, "medium", True),
            "slow_reply": (6000, 13000, "critical", False),
            "total_low": 12000, "total_high": 25000, "weekly": 352,
            "start_here": "slow_reply",
        },
    },
]

# The five error strings, from PARTIAL-CONTRACT.md section 2. Each builder is
# handed a complete, valid pre-gate answer set and breaks exactly one thing.
VALIDATION = [
    ("not an object", lambda good: [], "answers must be an object"),
    ("unknown key", lambda good: dict(good, nonsense="x"), "unknown answer key: nonsense"),
    ("deferred key arrived early", lambda good: dict(good, quotes_week="under_3"),
     "answer not asked before the gate: quotes_week"),
    ("a pre gate key is absent", lambda good: {k: v for k, v in good.items() if k != "missed"},
     "missing answer: missed"),
    ("value not in its enum", lambda good: dict(good, winback="not_a_real_answer"),
     "invalid answer for winback"),
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D102 - silence the access log
        pass


def start_server(port: int):
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8934)
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed: python3 -m pip install playwright")
        return 1

    srv = start_server(args.port)
    base = "http://127.0.0.1:%d/audit.html?mirror=check" % args.port
    fails = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_context().new_page()
            page.goto(base, wait_until="load")
            page.wait_for_function("() => !!window.LEAK_AUDIT_MIRROR", timeout=8000)

            print("Leak Audit scoring mirror vs PARTIAL-CONTRACT.md")
            print("-" * 74)
            for ex in EXAMPLES:
                got = page.evaluate(
                    "(a) => window.LEAK_AUDIT_MIRROR.scoreAuditPartial(a)", ex["answers"])
                e = ex["expect"]
                by_key = {c["key"]: c for c in got["channels"]}
                checks = []
                for key in ("missed_calls", "slow_reply"):
                    low, high, status, est = e[key]
                    c = by_key[key]
                    checks.append((key + " low", c["annual_low"], low))
                    checks.append((key + " high", c["annual_high"], high))
                    checks.append((key + " status", c["status"], status))
                    checks.append((key + " estimated", bool(c["estimated"]), est))
                checks.append(("total low", got["total"]["annual_low"], e["total_low"]))
                checks.append(("total high", got["total"]["annual_high"], e["total_high"]))
                checks.append(("weekly mid", got["total"]["weekly_mid"], e["weekly"]))
                checks.append(("start_here", got["start_here"]["channel_key"], e["start_here"]))
                for key in ("unchased_quotes", "reviews", "dormant"):
                    c = by_key[key]
                    checks.append((key + " not_priced", c["not_priced"], True))
                    checks.append((key + " low", c["annual_low"], None))
                    checks.append((key + " high", c["annual_high"], None))
                    checks.append((key + " status", c["status"], None))
                checks.append(("partial", got["partial"], True))
                checks.append(("priced_channels", got["priced_channels"], 2))
                checks.append(("total_channels", got["total_channels"], 5))
                checks.append(("all_clear", got["all_clear"], None))
                checks.append(("roadmap", got["roadmap"], []))
                bad = [(n, g, w) for n, g, w in checks if g != w]
                print("%-58s %s" % (ex["name"], "PASS" if not bad else "FAIL"))
                for n, g, w in bad:
                    fails += 1
                    print("    %-28s got %-14r want %r" % (n, g, w))

            print("-" * 74)
            good = dict(EXAMPLES[0]["answers"])
            for label, build, want in VALIDATION:
                payload = build(good)
                got = page.evaluate(
                    "(a) => window.LEAK_AUDIT_MIRROR.validateAnswersPartial(a)", payload)
                ok = got["error"] == want
                if not ok:
                    fails += 1
                print("%-58s %s" % ("validation: " + label, "PASS" if ok else
                                    "FAIL got %r want %r" % (got["error"], want)))
            browser.close()
    finally:
        srv.shutdown()
        srv.server_close()

    print("-" * 74)
    print("ALL PASS" if not fails else "%d ASSERTION(S) FAILED" % fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
