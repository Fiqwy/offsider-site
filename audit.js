/* =============================================================================
   audit.js — the free Revenue Leak Audit page module (audit.html only).

   Sets window.PAGE_INIT, which script.js calls inside boot() after the shared
   render pass and before the wiring. Loads BEFORE script.js and AFTER
   content.js. No GSAP on this page.

   What lives here:
     1. The JS MIRROR of the canonical scoring spec. The Python engine
        (backend/leak_audit.py) implements the same formulas and recomputes
        everything server-side from the raw answer keys. The two MUST agree, so
        treat the constants and formulas below as frozen: change the spec first.
     2. The nine-question stepper (tap only, one question on screen).
     3. The live leak counter.
     4. The Leak Map: headline unblurred, breakdown blurred behind the capture
        card until the visitor trades name / mobile / email for it.

   HOUSE RULE: nothing here uses innerHTML. Every string, ours or the
   visitor's, goes in through textContent or a text node.
   ========================================================================== */
(function () {
  "use strict";

  const S = window.SITE;
  const doc = document;

  /* ===========================================================================
     1. THE SCORING MIRROR  (canonical spec v2 — keep in lockstep with the API)

     v2 is a deeper self-diagnosis: wherever the visitor gave us a real number
     of their own we use theirs, and our assumptions only stand in as labelled
     "no idea" fallbacks. RETIRED from v1: QUOTE_SHARE and MISSED_CAP (the cap
     is now "you cannot miss more calls than arrive"), and the old
     never_have_list / no_list dormant enums (list_size carries that now).
     ========================================================================= */
  const K = {
    WEEKS:         52,
    PHONE_SHARE:   0.65,   // share of weekly enquiries that arrive as calls
    WEB_SHARE:     0.35,   // the remainder: web / social / SMS
    CAPTURE:       0.35,   // recovered enquiries that become jobs (ROI calc uses .40)
    RANGE_LOW:     0.65,
    RANGE_HIGH:    1.35,
    ALL_CLEAR_MID: 5000,
    DOWNGRADE_AT:  2000,   // small numbers do not get to be alarming
  };

  const MID = {
    enquiries: { under_10: 7, "10_25": 17, "25_50": 37, "50_100": 75, "100_plus": 120 },
    job_value: { under_200: 150, "200_500": 350, "500_1500": 1000, "1500_5000": 3000, "5000_plus": 7500 },
  };

  const F = {
    /* C1 — the phone */
    missedWeek:     { none: 0.5, "1_2": 1.5, "3_5": 4, "6_10": 8, "10_plus": 13 },
    missedFallback: { office: 0.05, callback: 0.15, voicemail: 0.30, rings_out: 0.40 },
    afterHours:     { answered: 0, ah_1_2: 1.5, ah_3_5: 4, ah_more: 7 },
    winback:        { win_most: 0.70, about_half: 0.50, a_few: 0.25, moved_on: 0.10 },
    /* C2 — the leads */
    lateShare:      { minutes: 0.05, hours: 0.50, days: 0.90, sometimes_never: 1.00 },
    gone:           { most_gone: 0.70, half_gone: 0.50, few_gone: 0.25 },
    /* C3 — quotes */
    quotesWeek:     { no_quotes: 0, under_3: 2, "3_5": 4, "5_10": 7, "10_plus": 13 },
    quietShare:     { q1_2: 0.15, q3_4: 0.35, half: 0.55, most: 0.75 },
    recover:        { chase_all: 0.10, chase_big: 0.20, keen_call: 0.30, go_quiet: 0.35 },
    quoteStatus:    { chase_all: "ok", chase_big: "medium", keen_call: "high", go_quiet: "critical" },
    /* C4 — reviews */
    reviewStatus:   { automatic: "ok", remember: "medium", happy_only: "medium", dont_ask: "high" },
    /* C5 — old customers */
    listSize:       { under_50: 30, "50_200": 100, "200_500": 300, "500_plus": 700, no_list: 0 },
    resp:           { regular: 0, odd_text: 0.01, never: 0.02 },
  };

  /* Trades whose job cycle runs in years. Re-contacting a past customer does
     not convert into a booked job on any timescale we could honestly model, so
     Reactivation becomes a no-dollar channel for them (v2.1 §2). Everything
     else, including "other", stays repeat-cycle: we cannot know what "other"
     is, and the conservative dollar model is defensible there. */
  const LONG_CYCLE_TRADES = ["roofing", "builder", "painter"];

  const LADDER = ["ok", "medium", "high", "critical"];
  const rank = (s) => Math.max(0, LADDER.indexOf(s));
  const downgrade = (s) => LADDER[Math.max(0, rank(s) - 1)];
  const bump = (s, cap) => LADDER[Math.min(rank(cap), rank(s) + 1)];
  const floorAt = (s, min) => (rank(s) < rank(min) ? min : s);

  /* round$(x): nearest 1000 at or above 5000, otherwise nearest 500. Written
     as floor(x/step + 0.5) because that is the form PARTIAL-CONTRACT.md pins;
     it is the same value Math.round gives for every positive number here. */
  const roundMoney = (x) => {
    const step = x >= 5000 ? 1000 : 500;
    return Math.floor(x / step + 0.5) * step;
  };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-AU");

  /* ===========================================================================
     THE WORKED LINE, MIRRORED
     These build the SAME sentence leak_audit.py builds (_missed_maths at :694,
     _slow_reply_maths at :732, and the helpers above them). They exist because
     the server only sees the answers once somebody has handed over their
     details, so until now "Show the working" showed no working: we un-gated the
     number and the map and left the arithmetic behind the ask, which is the one
     thing that should never have been behind it.

     LOCKSTEP. Two prose implementations with nothing comparing them will drift.
     PARTIAL-CONTRACT.md section 6 holds the expected strings, tools/qa-audit-
     mirror.py asserts these against it, and a Python test asserts the server's
     against the same. Change the wording in one place and all three fail, which
     is the point. The server's version still replaces this one after a
     successful send: it can admit things the mirror cannot see.
     ========================================================================= */

  /* A weekly count for prose. The epsilon is doing real work: 2.45 * 0.30 lands
     at 0.7349999999999999 in binary floating point, and without it this prints
     0.73 for an exact 0.735 and the owner's own arithmetic stops matching
     ours. Same guard, same reason, as _fmt_qty. */
  const fmtQty = (x) => {
    const r = Math.floor(x * 100 + 0.5 + 1e-9) / 100;
    if (r === Math.trunc(r)) return String(Math.trunc(r));
    return r.toFixed(2).replace(/0+$/, "");
  };
  /* "35 in every 100", never "35%". A percent sign in a maths line reads as a
     claim; this reads as arithmetic, which is what it is. */
  const perHundred = (share) => Math.floor(share * 100 + 0.5 + 1e-9) + " in every 100";
  const mathsTail = (mid, low, high) =>
    "That lands near " + money(roundMoney(mid)) + ", shown as " + money(low) +
    " to " + money(high) + " because it is an estimate, not a forecast.";
  /* A worked line is only worth showing where there is a real figure to work to. */
  const showsMaths = (mid, low, high) => mid > 0 && (low > 0 || high > 0);

  /* Their phone numbers, added up in front of them. Every figure is one the
     engine actually used, including the cap and both fallbacks, which are
     admitted in the line rather than buried in a flag. */
  function missedMaths(a, E, J, M, AH, lost, mid, low, high) {
    const parts = [];
    if (a.missed_week === "no_idea") {
      parts.push("You were not sure how many calls you miss, so from the way the phone is " +
                 "handled we used a conservative " + fmtQty(M) + " a week.");
    } else {
      parts.push("You told us you miss about " + fmtQty(M) + " calls in a normal week.");
    }
    const raw = M + AH;
    /* after_hours_calls is optional and usually absent on the seven, and the
       scoring treats an absence as "no idea". The prose has to agree. */
    const ah = a.after_hours_calls == null ? "no_idea" : a.after_hours_calls;
    if (ah === "no_idea") {
      parts.push("You were not sure about after hours either, so we added a conservative " +
                 fmtQty(AH) + " a week, which makes " + fmtQty(raw) + ".");
    } else if (AH > 0) {
      parts.push("Another " + fmtQty(AH) + " a week land after 5pm or on the weekend, which makes " +
                 fmtQty(raw) + ".");
    } else {
      parts.push("You answer the ones that come in after hours, so it stays at " + fmtQty(raw) + ".");
    }
    if (raw > E) {
      parts.push("That is more than the " + fmtQty(E) + " enquiries a week you get in total, so we hold it " +
                 "at " + fmtQty(E) + ".");
    }
    parts.push("You already win " + perHundred(F.winback[a.winback]) + " of those back when you ring, " +
               "which leaves roughly " + fmtQty(lost) + " a week gone.");
    parts.push("We count " + perHundred(K.CAPTURE) + " of those as jobs you would have won, at your " +
               money(J) + " average job, across " + K.WEEKS + " weeks.");
    parts.push(mathsTail(mid, low, high));
    return parts.join(" ");
  }

  /* Web and social enquiries, from how many arrive to how many go cold. */
  function slowReplyMaths(a, E, J, late, gone, mid, low, high) {
    const webWeek = E * K.WEB_SHARE;
    const coldWeek = webWeek * late * gone;
    /* the enquiry count prints raw here, not through fmtQty: the server does
       the same and the band midpoints are whole numbers either way */
    const parts = ["Of your " + E + " enquiries a week, we count " + perHundred(K.WEB_SHARE) +
                   " as web or social, which is about " + fmtQty(webWeek) + " a week."];
    if (late >= 1) {
      parts.push("Every one of those goes out later than it should, and " + perHundred(gone) +
                 " of them have already sorted it with someone else, so about " +
                 fmtQty(coldWeek) + " a week go cold.");
    } else {
      parts.push(perHundred(late) + " of those go out later than they should, and " + perHundred(gone) +
                 " of the late ones have already sorted it with someone else, so about " +
                 fmtQty(coldWeek) + " a week go cold.");
    }
    parts.push("We count " + perHundred(K.CAPTURE) + " of those as jobs you would have won, at your " +
               money(J) + " average job, across " + K.WEEKS + " weeks.");
    parts.push(mathsTail(mid, low, high));
    return parts.join(" ");
  }

  /* Channel order is fixed and load-bearing: the API returns exactly these
     five, in exactly this order. */
  const ORDER = ["missed_calls", "slow_reply", "unchased_quotes", "reviews", "dormant"];
  /* Tie-break order for start_here (reviews never wins: it carries no figure). */
  const TIE = ["missed_calls", "slow_reply", "unchased_quotes", "dormant"];

  /* Which questions feed which channel. Used both by the maths and by the live
     counter, which now ticks once per COMPLETED channel rather than per answer. */
  const CHANNEL_QS = {
    missed_calls:    ["missed", "missed_week", "winback", "after_hours_calls"],
    slow_reply:      ["reply_speed", "late_outcome"],
    unchased_quotes: ["quotes_week", "quotes_quiet", "quotes"],
    reviews:         ["reviews", "review_count"],
    dormant:         ["list_size", "dormant"],
  };

  /* Conditional skips are REAL ABSENCES in `answers`: the server accepts the
     absence exactly when its condition holds and rejects it otherwise, so the
     one source of truth for "is this asked?" has to be shared by the stepper,
     the payload builder and the maths. */
  let QMAP = {};
  function isSkipped(key, a) {
    const q = QMAP[key];
    return !!(q && q.skipWhen && a[q.skipWhen.key] === q.skipWhen.value);
  }
  function channelReady(k, a) {
    return CHANNEL_QS[k].every((key) => isSkipped(key, a) || !!a[key]);
  }

  /* "You told us: ..." — their own answers, in plain speech, assembled from the
     fragments in content.js. Never a template string in markup: the caller sets
     the result with textContent like everything else on this page. */
  function buildEcho(k, a, estimated) {
    const cfg = (S.audit.echo || {})[k];
    if (!cfg) return "";
    if (k === "missed_calls" && estimated) return cfg.estimated || "";
    if (k === "unchased_quotes" && a.quotes_week === "no_quotes") return cfg.none || "";
    if (k === "dormant" && a.list_size === "no_list") return cfg.none || "";
    return String(cfg.template || "").replace(/\{(\w+)\}/g, (m, key) => {
      const map = cfg[key];
      return (map && map[a[key]]) || "";
    });
  }

  /* Tolerant of a partly answered form: a channel that is not yet complete
     contributes nothing, which is what lets the counter tick channel by
     channel instead of jumping around mid-section. */
  function scoreMirror(a) {
    const E = MID.enquiries[a.enquiries] || 0;
    const J = MID.job_value[a.job_value] || 0;
    const sized = !!(a.enquiries && a.job_value);

    /* ---- C1 missed calls → Ada --------------------------------------------
       Their own miss count drives it. "No idea" falls back to the v1 process
       assumption and flags the whole channel as an estimate. */
    let mMissed = 0, sMissed = "ok", estMissed = false;
    /* the working needs the figures the scoring walks through, not just the
       total it lands on, so they are kept rather than discarded */
    const mathsIn = {};
    if (sized && channelReady("missed_calls", a)) {
      const noIdeaM  = a.missed_week === "no_idea";
      const noIdeaAH = a.after_hours_calls === "no_idea";
      const M  = noIdeaM
        ? E * K.PHONE_SHARE * (F.missedFallback[a.missed] || 0)
        : (F.missedWeek[a.missed_week] || 0);
      const AH = noIdeaAH ? 0.30 * Math.max(M, 1) : (F.afterHours[a.after_hours_calls] || 0);
      // you cannot miss more calls than actually arrive
      const lostWeek = Math.min(M + AH, E) * (1 - (F.winback[a.winback] || 0));
      mMissed = lostWeek * K.CAPTURE * J * K.WEEKS;
      sMissed = lostWeek >= 3 ? "critical" : lostWeek >= 1.5 ? "high" : lostWeek >= 0.5 ? "medium" : "ok";
      if (mMissed < K.DOWNGRADE_AT) sMissed = downgrade(sMissed);
      estMissed = noIdeaM || noIdeaAH;
      if (estMissed) sMissed = floorAt(sMissed, "medium");   // never "all good" on a guess
      mathsIn.missed_calls = { M: M, AH: AH, lost: lostWeek, E: E, J: J };
    }

    /* ---- C2 slow replies → Zip -------------------------------------------- */
    let mSlow = 0, sSlow = "ok";
    if (sized && channelReady("slow_reply", a)) {
      const ls = F.lateShare[a.reply_speed] || 0;
      const g  = F.gone[a.late_outcome] || 0;
      mSlow = E * K.WEB_SHARE * ls * g * K.CAPTURE * J * K.WEEKS;
      const sev = ls * g;
      sSlow = sev >= 0.45 ? "critical" : sev >= 0.25 ? "high" : sev >= 0.10 ? "medium" : "ok";
      if (mSlow < K.DOWNGRADE_AT) sSlow = downgrade(sSlow);
      mathsIn.slow_reply = { late: ls, gone: g, E: E, J: J };
    }

    /* ---- C3 unchased quotes → Nudge --------------------------------------- */
    let mQuote = 0, sQuote = "ok";
    if (sized && channelReady("unchased_quotes", a)) {
      if (a.quotes_week === "no_quotes") {
        mQuote = 0; sQuote = "ok";                    // nothing goes out, nothing leaks
      } else {
        mQuote = (F.quotesWeek[a.quotes_week] || 0) * (F.quietShare[a.quotes_quiet] || 0)
               * (F.recover[a.quotes] || 0) * J * K.WEEKS;
        sQuote = F.quoteStatus[a.quotes] || "ok";
        if (mQuote < K.DOWNGRADE_AT) sQuote = downgrade(sQuote);
      }
    }

    /* ---- C4 reviews → Star. No dollar figure, ever, and never in the total. */
    let sReview = "ok";
    if (a.reviews) {
      sReview = F.reviewStatus[a.reviews] || "ok";
      if (a.review_count === "r_under_10" && a.reviews !== "automatic") {
        sReview = bump(sReview, "high");
      }
    }

    /* ---- C5 old customers → Boomer ----------------------------------------
       Two ways this channel ends up carrying no dollar figure:
         · a long-cycle trade (v2.1 §2), regardless of what they answered, and
         · no list to work yet (no_list).
       Both are tracked by `dormantPriced`, which is what keeps a zero-dollar
       Boomer out of start_here and out of the roadmap (v2.1 §2b: a channel
       worth nothing must never outrank a real recommendation). */
    const longCycle = LONG_CYCLE_TRADES.indexOf(a.trade) !== -1;
    let mDormant = 0, sDormant = "ok";
    let dormantPriced = !longCycle && a.list_size !== "no_list";
    if (sized && channelReady("dormant", a)) {
      if (longCycle) {
        // never high: the honest read is "slower, smaller", not "urgent"
        mDormant = 0;
        sDormant = (a.list_size === "no_list" || a.dormant === "never") ? "medium" : "ok";
      } else if (a.list_size === "no_list") {
        mDormant = 0; sDormant = "medium";            // the fix is capturing a list
      } else {
        const size = F.listSize[a.list_size] || 0;
        mDormant = size * (F.resp[a.dormant] || 0) * J;
        sDormant = (a.dormant === "never" && size > 0) ? "high"
                 : a.dormant === "odd_text" ? "medium" : "ok";
        if (sDormant === "high" && mDormant < K.DOWNGRADE_AT) sDormant = "medium";
      }
    }

    const mids     = { missed_calls: mMissed, slow_reply: mSlow, unchased_quotes: mQuote, reviews: 0, dormant: mDormant };
    const statuses = { missed_calls: sMissed, slow_reply: sSlow, unchased_quotes: sQuote, reviews: sReview, dormant: sDormant };
    const estimates = { missed_calls: estMissed, slow_reply: false, unchased_quotes: false, reviews: false, dormant: false };
    /* the answer each channel's note is keyed on */
    const noteKey = {
      missed_calls: a.missed,
      slow_reply: a.reply_speed,
      unchased_quotes: a.quotes_week === "no_quotes" ? "no_quotes" : a.quotes,
      reviews: a.reviews,
      dormant: longCycle ? "long_cycle" : (a.list_size === "no_list" ? "no_list" : a.dormant),
    };

    const totalMid = ORDER.reduce((sum, k) => sum + mids[k], 0);

    const channels = ORDER.map((k) => {
      const cfg = (S.audit.channels && S.audit.channels[k]) || {};
      const isReviews = k === "reviews";
      // reviews never carries dollars; dormant loses them for long-cycle trades
      const noDollars = isReviews || (k === "dormant" && longCycle);
      let note = (cfg.notes && cfg.notes[noteKey[k]]) || "";
      // reviews carries a second, quieter sentence tailored to their count
      if (isReviews && cfg.countNotes && cfg.countNotes[a.review_count]) {
        note = (note ? note + " " : "") + cfg.countNotes[a.review_count];
      }
      const lo = noDollars ? null : roundMoney(mids[k] * K.RANGE_LOW);
      const hi = noDollars ? null : roundMoney(mids[k] * K.RANGE_HIGH);
      /* Only the two channels whose working is mirrored carry one here. The
         other three are priced by the server alone, so their cards offer the
         answer rather than claiming a working they do not hold. */
      const mi = mathsIn[k];
      const worked = (mi && !noDollars && showsMaths(mids[k], lo, hi))
        ? (k === "missed_calls"
            ? missedMaths(a, mi.E, mi.J, mi.M, mi.AH, mi.lost, mids[k], lo, hi)
            : slowReplyMaths(a, mi.E, mi.J, mi.late, mi.gone, mids[k], lo, hi))
        : "";
      return {
        key: k,
        label: cfg.label || k,
        status: statuses[k],
        annual_low:  lo,
        annual_high: hi,
        worker: cfg.worker || { name: "", role: "" },
        note: note,
        echo: buildEcho(k, a, estimates[k]),
        estimated: estimates[k],
        maths: worked || undefined,
        /* `benchmark` is SERVER-ONLY enrichment (a sourced comparison of their
           answer against the published research, attribution inside the
           string). The mirror never invents one, so the pre-gate map simply
           has none and the renderer omits the line. */
      };
    });

    const allClear = totalMid < K.ALL_CLEAR_MID;

    /* start_here: the biggest number wins; ties fall to the fixed order. */
    let startKey = null;
    const tie = dormantPriced ? TIE : TIE.filter((k) => k !== "dormant");
    tie.forEach((k) => { if (startKey === null || mids[k] > mids[startKey]) startKey = k; });
    const startCfg = (S.audit.channels && S.audit.channels[allClear ? "reviews" : startKey]) || {};
    const startHere = {
      channel_key: allClear ? "reviews" : startKey,
      worker: startCfg.worker || { name: "", role: "" },
      line: allClear ? S.audit.startLines.allClear : (S.audit.startLines[startKey] || ""),
    };

    /* roadmap: everything at medium or worse, biggest first, reviews last.
       If literally nothing needs plugging the roadmap would be empty, which
       reads as a broken page rather than good news, so the all-clear result
       still gets its one honest Star entry. */
    const slots = ["1 to 2", "3 to 6", "7 to 12"];
    let hot = ORDER
      .filter((k) => rank(statuses[k]) >= rank("medium"))
      // a Boomer worth nothing (long-cycle trade, or no list yet) must never sit
      // in the plan ahead of a channel that is actually worth doing
      .filter((k) => k !== "dormant" || dormantPriced)
      .sort((x, y) => (y === "reviews" ? -1 : mids[y]) - (x === "reviews" ? -1 : mids[x]));
    if (!hot.length) hot = ["reviews"];
    const roadmap = hot.map((k, i) => ({
      weeks: slots[Math.min(i, slots.length - 1)],
      worker: ((S.audit.channels && S.audit.channels[k]) || {}).worker || { name: "", role: "" },
      action: (S.audit.roadmapActions && S.audit.roadmapActions[k]) || "",
    }));

    return {
      total: {
        annual_low: roundMoney(totalMid * K.RANGE_LOW),
        annual_high: roundMoney(totalMid * K.RANGE_HIGH),
        weekly_mid: Math.round(totalMid / K.WEEKS),
      },
      all_clear: allClear,
      channels: channels,
      start_here: startHere,
      roadmap: roadmap,
      /* mirror-only, never sent by the server: raw mid used for the counter */
      _mid: totalMid,
    };
  }

  /* ===========================================================================
     1b. THE PARTIAL MIRROR  (funnel/PARTIAL-CONTRACT.md — keep in lockstep)

     The first seven taps price two channels of five. The engine's
     score_audit_partial() is the authority; this reproduces it to the cent so
     the counter, the reveal and the pre-gate map never disagree with the
     figure the server sends back a second later.

     Floating point is not associative, so the multiplication ORDER below is
     part of the contract. Do not tidy it.
     ========================================================================= */
  const PRE_GATE_KEYS = ["missed", "missed_week", "winback", "job_value",
                         "enquiries", "reply_speed", "late_outcome"];
  const DEFERRED_KEYS = ["after_hours_calls", "quotes_week", "quotes_quiet", "quotes",
                         "reviews", "review_count", "list_size", "dormant"];
  const AH_FALLBACK_RATE = 0.30;
  const DOWNGRADE_BELOW  = 2000;

  /* The enum table is read back off the questions in content.js, so the thing
     the visitor can tap and the thing the mirror accepts can never drift. */
  function enumTable() {
    const out = {};
    ((S.audit && S.audit.questions) || []).forEach((q) => {
      if (q.key === "trade") return;                    // travels on its own
      out[q.key] = (q.options || []).map((o) => o.key);
    });
    return out;
  }

  /* Mirrors validate_answers_partial(). Same five messages, same order, and
     the offending VALUE is never echoed back. */
  function validateAnswersPartial(answers) {
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return { ok: false, error: "answers must be an object" };
    }
    const table = enumTable();
    const keys = Object.keys(answers);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!table[k]) return { ok: false, error: "unknown answer key: " + k };
      if (DEFERRED_KEYS.indexOf(k) !== -1 && k !== "after_hours_calls") {
        return { ok: false, error: "answer not asked before the gate: " + k };
      }
    }
    for (let i = 0; i < PRE_GATE_KEYS.length; i++) {
      const k = PRE_GATE_KEYS[i];
      if (!(k in answers)) return { ok: false, error: "missing answer: " + k };
    }
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (table[k].indexOf(answers[k]) === -1) {
        return { ok: false, error: "invalid answer for " + k };
      }
    }
    return { ok: true, error: null };
  }

  const roundInt = (x) => Math.floor(x + 0.5);
  const rangeOf = (mid) => [roundMoney(mid * K.RANGE_LOW), roundMoney(mid * K.RANGE_HIGH)];

  /* their own answers on the phone channel, when after hours has not been
     asked yet. Named rather than implied: the fallback is our number, not
     theirs, and the card says so. */
  function partialPhoneEcho(a) {
    const cfg = (S.audit.echo || {}).missed_calls || {};
    if (a.missed_week === "no_idea") return cfg.estimated || "";
    return String(cfg.partial || "").replace(/\{(\w+)\}/g, (m, key) => {
      const map = cfg[key];
      return (map && map[a[key]]) || "";
    });
  }

  function scoreAuditPartial(a, trade) {
    const v = validateAnswersPartial(a);
    if (!v.ok) throw new Error(v.error);

    const E = MID.enquiries[a.enquiries];
    const J = MID.job_value[a.job_value];

    /* ---- missed calls (Ada) ---- */
    let estimated = false;
    let M = F.missedWeek[a.missed_week];
    if (M == null) { estimated = true; M = E * K.PHONE_SHARE * F.missedFallback[a.missed]; }
    let AH = F.afterHours[a.after_hours_calls == null ? "no_idea" : a.after_hours_calls];
    if (AH == null) { estimated = true; AH = AH_FALLBACK_RATE * Math.max(M, 1); }
    const lost = Math.min(M + AH, E) * (1 - F.winback[a.winback]);
    const midMissed = lost * K.CAPTURE * J * K.WEEKS;
    let sMissed = lost >= 3 ? "critical" : lost >= 1.5 ? "high" : lost >= 0.5 ? "medium" : "ok";
    if (midMissed < DOWNGRADE_BELOW) sMissed = downgrade(sMissed);
    if (estimated) sMissed = floorAt(sMissed, "medium");

    /* ---- slow replies (Zip) ---- */
    const late = F.lateShare[a.reply_speed];
    const gone = F.gone[a.late_outcome];
    const midSlow = E * K.WEB_SHARE * late * gone * K.CAPTURE * J * K.WEEKS;
    const p = late * gone;
    let sSlow = p >= 0.45 ? "critical" : p >= 0.25 ? "high" : p >= 0.10 ? "medium" : "ok";
    if (midSlow < DOWNGRADE_BELOW) sSlow = downgrade(sSlow);

    const mids = { missed_calls: midMissed, slow_reply: midSlow };
    const statuses = { missed_calls: sMissed, slow_reply: sSlow };
    const notes = {
      missed_calls: a.missed,
      slow_reply: a.reply_speed,
    };
    const R = S.audit.result || {};
    const NP = R.notPriced || {};

    const channels = ORDER.map((k) => {
      const cfg = (S.audit.channels && S.audit.channels[k]) || {};
      const base = {
        key: k,
        label: cfg.label || k,
        worker: cfg.worker || { name: "", role: "" },
      };
      if (k !== "missed_calls" && k !== "slow_reply") {
        base.not_priced = true;
        base.status = null;
        base.annual_low = null;
        base.annual_high = null;
        base.note = NP[k] || "";
        base.echo = "";
        base.estimated = false;
        return base;
      }
      const r = rangeOf(mids[k]);
      base.not_priced = false;
      base.status = statuses[k];
      base.annual_low = r[0];
      base.annual_high = r[1];
      base.note = (cfg.notes && cfg.notes[notes[k]]) || "";
      base.echo = k === "missed_calls" ? partialPhoneEcho(a) : buildEcho(k, a, false);
      base.estimated = k === "missed_calls" ? estimated : false;
      /* The working, built here rather than waited for. The server sends a
         richer one after a successful send and it replaces this. */
      if (showsMaths(mids[k], r[0], r[1])) {
        base.maths = k === "missed_calls"
          ? missedMaths(a, E, J, M, AH, lost, mids[k], r[0], r[1])
          : slowReplyMaths(a, E, J, late, gone, mids[k], r[0], r[1]);
      }
      return base;
    });

    /* the larger of the two priced mids wins, missed_calls breaks the tie */
    const startKey = midSlow > midMissed ? "slow_reply" : "missed_calls";
    const startCfg = (S.audit.channels && S.audit.channels[startKey]) || {};
    const totalMid = midMissed + midSlow;

    return {
      total: {
        annual_low: roundMoney(totalMid * K.RANGE_LOW),
        annual_high: roundMoney(totalMid * K.RANGE_HIGH),
        weekly_mid: roundInt(totalMid / K.WEEKS),
      },
      all_clear: null,                 // undecidable on two of five channels
      channels: channels,
      start_here: {
        channel_key: startKey,
        worker: startCfg.worker || { name: "", role: "" },
        line: (S.audit.startLines && S.audit.startLines[startKey]) || "",
      },
      roadmap: [],                     // a 90 day order needs all five
      partial: true,
      priced_channels: 2,
      total_channels: 5,
      _mid: totalMid,
    };
  }

  /* ===========================================================================
     2. SMALL DOM HELPERS (textContent only — no innerHTML anywhere on this page)
     ========================================================================= */
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* The house device: {i:word} becomes one Instrument Serif italic word.
     Built as real nodes rather than parsed as markup. */
  function italInto(node, str) {
    const parts = String(str == null ? "" : str).split(/(\{i:[^}]*\})/);
    parts.forEach((p) => {
      const m = /^\{i:([^}]*)\}$/.exec(p);
      if (m) {
        const em = doc.createElement("em");
        em.className = "ital";
        em.textContent = m[1];
        node.appendChild(em);
      } else if (p) {
        node.appendChild(doc.createTextNode(p));
      }
    });
    return node;
  }

  /* Copy strings carry {token} slots. The result is always set as text. */
  const fill = (str, vals) =>
    String(str == null ? "" : str).replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));

  /* "$128,000 – $266,000" as three nodes, so each half can stay unbreakable
     while the range as a whole is free to wrap on a narrow phone. */
  function rangeInto(node, low, high, sep) {
    node.textContent = "";
    node.appendChild(el("span", "num", money(low)));
    node.appendChild(el("span", "sep", sep || "–"));
    node.appendChild(el("span", "num", money(high)));
    return node;
  }

  /* ===========================================================================
     3. STATE
     ========================================================================= */
  const A = S && S.audit;
  let REDUCED = false;
  const state = {
    screen: "q",          // q | results | calendar | done
    book: "",             // "" = not asked for | open = form showing | done = booked
    phase: "pre",         // pre = the seven in front of the gate, finish = the nine
    step: 0,              // index into the CURRENTLY applicable question list
    answers: {},          // raw enum keys; skipped questions are deleted, not blanked
    mirror: null,
    shown: { low: 0, high: 0 },   // what the counter is currently displaying
    token: "",            // the download token, once the details have landed
    email: "",
    mobile: "",           // taken on the conversion card, reused by the booking
    utm: null,            // read once from the query string, never stored
    busy: false,
    /* The trade was tapped on the optional row under the receipt rather than
       on the last of the nine. It is a separate flag from answers.trade
       because it is what tells the finish run to skip a question it already
       has the answer to, and what keeps that answer alive through prune(). */
    tradeTap: false,
  };
  let stage = null, panel = null, qBox = null, meter = null, meterLow = null, meterHigh = null;
  let build = null, buildLabel = null, buildDots = null;
  let progText = null, progFill = null, backBtn = null;
  let counterRaf = 0;

  /* The one spelling of "that is a number" on this page. Same rule the server
     applies at the booking (routes/comms._clean_mobile): the characters a
     written Australian mobile is allowed to carry, and eight to fifteen digits
     inside them. Held here so the conversion field and the booking field can never
     drift apart, and so a number Nicholas cannot ring is caught under the
     visitor's thumb rather than stored and dialled.

     Every punctuation mark in the class is escaped for a reason: a `pattern`
     attribute is compiled with the RegExp `v` flag, under which a bare `(` or
     `)` inside a character class is a syntax error, and a pattern that does not
     compile is silently DROPPED rather than reported. Both WebKit and Blink
     accepted "ring me maybe" against the unescaped spelling. */
  const MOBILE_PATTERN = "[ +\\(\\)\\.\\-]*(?:\\d[ +\\(\\)\\.\\-]*){8,15}";

  const QS = () => (A && Array.isArray(A.questions) ? A.questions : []);
  const inPhase = (q, finish) => !!q.deferred === !!finish;

  /* The applicable list for the run we are IN, recomputed from the answers
     every time. Single source of truth for the stepper, the progress count and
     the POST payload, so a gating answer that changes on the way back
     automatically restores or removes the questions behind it. */
  function applicable(finish) {
    const a = state.answers;
    const f = finish === undefined ? state.phase === "finish" : finish;
    return QS().filter((q) => inPhase(q, f))
               .filter((q) => !(q.skipWhen && a[q.skipWhen.key] === q.skipWhen.value))
               /* A question we already have the answer to is not a question.
                  The trade chips under the receipt are the same answer asked
                  earlier, so the finish run is eight taps, not nine, and every
                  count and every line of copy about it says eight. */
               .filter((q) => !(q.key === "trade" && state.tradeTap));
  }
  /* A skipped question's answer must not survive: the API treats its absence
     as meaningful, so a stale value would be a lie about what they told us. */
  function prune() {
    const live = {};
    applicable(false).forEach((q) => { live[q.key] = true; });
    applicable(true).forEach((q) => { live[q.key] = true; });
    /* The trade is the one answer that can be held without its question being
       on the list, because tapping the chip row under the receipt answers it
       early. Pruning it here would throw away what they just told us. */
    if (state.tradeTap) live.trade = true;
    QS().forEach((q) => { if (!live[q.key]) delete state.answers[q.key]; });
  }

  /* ---- Progress safety net ------------------------------------------------
     The conversion card offers a link out to the rest of the site, and a Meta in-app
     browser will reload this page under the visitor without being asked. So
     the answer ENUMS and the screen they are on are written to sessionStorage
     after every tap and read back on load. Enums and a screen name only: never
     a name, a mobile, an email or a dollar figure. Same tab, same session,
     gone the moment the tab closes. */
  const STORE_KEY = "ai.leakaudit.v1";
  function save() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        screen: state.screen,
        phase: state.phase,
        step: state.step,
        answers: state.answers,
        token: state.token,
        book: state.book,
        mobile: state.mobile,
        tradeTap: state.tradeTap,
      }));
    } catch (e) { /* private mode, full quota: never break the run over it */ }
  }
  function wipe() {
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {}
  }
  function readStore() {
    try {
      const raw = window.sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.answers || typeof o.answers !== "object") return null;
      /* only keys this build still knows about, only values it still offers */
      const table = enumTable();
      const clean = {};
      Object.keys(o.answers).forEach((k) => {
        if (table[k] && table[k].indexOf(o.answers[k]) !== -1) clean[k] = o.answers[k];
      });
      /* trade travels on its own, so enumTable() omits it and its enum has to be
         read straight off the question here. Without this the finished state never
         restores: a reload after the ninth tap drops the trade, the map reads as
         not-yet-complete and the partial figures come back under the done heading. */
      const tradeOpts = (((S.audit && S.audit.questions) || [])
        .filter((q) => q.key === "trade")[0] || {}).options || [];
      if (tradeOpts.some((op) => op.key === o.answers.trade)) clean.trade = o.answers.trade;
      o.answers = clean;
      return o;
    } catch (e) { return null; }
  }
  const indexOfKey = (list, key) => {
    for (let i = 0; i < list.length; i++) if (list[i].key === key) return i;
    return -1;
  };

  /* ===========================================================================
     4. THE STEPPER
     ========================================================================= */
  function buildPanel() {
    panel = el("div", "audit-panel");

    /* --- rail: progress + back --- */
    const rail = el("div", "audit-rail");
    const railTop = el("div", "audit-rail__top");
    backBtn = el("button", "audit-back");
    backBtn.type = "button";
    backBtn.appendChild(el("span", "audit-back__arrow", "←"));
    backBtn.appendChild(doc.createTextNode(" " + ((A.progress && A.progress.back) || "Back")));
    backBtn.addEventListener("click", () => { if (state.step > 0) goTo(state.step - 1); });
    progText = el("p", "audit-rail__count");
    progText.setAttribute("role", "status");
    progText.setAttribute("aria-live", "polite");
    railTop.append(progText, backBtn);

    const track = el("div", "audit-rail__track");
    track.setAttribute("aria-hidden", "true");
    progFill = el("i", null);
    track.appendChild(progFill);
    rail.append(railTop, track);

    /* --- the leak counter (appears when the first CHANNEL completes) --- */
    meter = el("div", "audit-meter");
    const meterClip = el("div", "audit-meter__clip");
    const meterBox = el("div", "audit-meter__box");
    meterBox.appendChild(el("span", "audit-meter__label", (A.counter && A.counter.label) || ""));
    /* THE DOLLARS ARE READABLE. Every ad that points here promises "you see
       the number before we ask your name", so the digits are sharp from the
       first priced channel and they stay sharp. Nothing on this page buys the
       map either: it opens on the seventh tap. What the three fields buy is
       the CALL. Not a live region: it re-renders on every
       animation frame while it counts, which no screen reader should be made
       to sit through. It is reachable, it is just not announced. */
    const meterFig = el("p", "audit-meter__fig");
    meterLow = el("span", "num", money(0));
    meterHigh = el("span", "num", money(0));
    meterFig.append(meterLow, el("span", "sep", (A.result && A.result.rangeSep) || "–"), meterHigh);
    meterBox.appendChild(meterFig);
    meterBox.appendChild(el("span", "audit-meter__sub", (A.counter && A.counter.sub) || ""));
    meterClip.appendChild(meterBox);
    meter.appendChild(meterClip);

    /* --- the build strip: the receipt for the taps that cannot pay yet ---
       Five separate answers are needed before a number can honestly exist, and
       until this strip there was nothing on screen to show a tap had done
       anything at all. It counts down to the number and then gets out of the
       way. No dollar figure ever appears here. */
    build = el("div", "audit-build");
    buildLabel = el("span", "audit-build__label");
    buildLabel.setAttribute("role", "status");
    buildLabel.setAttribute("aria-live", "polite");
    buildDots = el("span", "audit-build__dots");
    buildDots.setAttribute("aria-hidden", "true");   // the label already says it
    for (let i = 0; i < PHONE_KEYS.length; i++) buildDots.appendChild(el("i", null));
    build.append(buildLabel, buildDots);

    /* --- the question --- */
    qBox = el("div", "audit-q");

    panel.append(rail, build, meter, qBox);
    updateBuild();
    return panel;
  }

  /* No section label, no section intro, no italic word. Each of those was a
     separate reading task in front of the first tap, and the first tap is the
     only thing this screen is for. */
  function buildQuestion(q, index, list) {
    const node = el("div", "audit-qi is-enter");

    const h = el("h2", "audit-qi__title");
    h.id = "audit-q-" + q.key;
    h.tabIndex = -1;
    h.textContent = q.title;
    node.appendChild(h);

    if (q.help) node.appendChild(el("p", "audit-qi__help", q.help));

    const group = el("div", "audit-opts");
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", h.id);
    (q.options || []).forEach((o) => {
      const b = el("button", "qopt");
      b.type = "button";
      b.setAttribute("aria-pressed", state.answers[q.key] === o.key ? "true" : "false");
      if (state.answers[q.key] === o.key) b.classList.add("is-on");
      const tick = el("span", "qopt__tick");
      tick.setAttribute("aria-hidden", "true");
      b.append(tick, el("span", "qopt__label", o.label));
      b.addEventListener("click", () => choose(q, o, b, group));
      group.appendChild(b);
    });
    node.appendChild(group);
    if (q.micro) node.appendChild(el("p", "audit-qi__micro", q.micro));
    return node;
  }

  /* ---- Funnel milestones (cookieless, aggregate counters only) -----------
     One sendBeacon per milestone per pageload, so Nicholas can see where paid
     clicks bail, per campaign, without tracking anyone. Fire-and-forget: an
     ad blocker or a failed send changes nothing for the visitor. */
  const sentSteps = {};
  function mark(step) {
    if (!step || sentSteps[step]) return;
    sentSteps[step] = true;
    try {
      const body = JSON.stringify({
        step: step,
        utm_source: (state.utm && (state.utm.utm_source || state.utm.source)) || "",
        utm_campaign: (state.utm && (state.utm.utm_campaign || state.utm.campaign)) || "",
        // Placement. Meta fills utm_content from {{placement}} (Facebook_Mobile_Reels,
        // Instagram_Feed, ...), already read off the query string at boot by readUtm().
        // Trimmed and capped at 80 here as well as server side: the beacon body has a
        // hard 500-byte limit at the endpoint, and a junk-long value must not be the
        // reason a milestone is thrown away.
        utm_content: String((state.utm && (state.utm.utm_content || state.utm.content)) || "")
          .trim().slice(0, 80),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/public/leak-audit/step",
          new Blob([body], { type: "text/plain" }));
      } else {
        fetch("/api/public/leak-audit/step", { method: "POST", body: body, keepalive: true })
          .catch(() => {});
      }
    } catch (e) { /* never let telemetry touch the experience */ }
  }

  /* ---- Engagement instrumentation (same mark() path, same silence) -------
     `land` only proves a browser asked for the page. These prove the
     instrument actually painted in front of somebody, how long they stayed,
     and whether our own JS fell over on their device: the difference between
     an instant bounce and a page that never rendered. Aggregate counters
     only, once per pageload each, exactly like every other milestone.

     `seen` — half of the first option of the first question is on screen.
     That is the honest definition of "the audit rendered for them". */
  function watchSeen() {
    const first = doc.querySelector(".qopt");
    if (!first) return;              // a resumed tab landing straight on the result
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            mark("seen");
            obs.disconnect();
          }
        });
      }, { threshold: 0.5 });
      io.observe(first);
      return;
    }
    /* No IntersectionObserver (an old in-app webview): one bounding-rect look
       300ms after the render, and that is the whole fallback. */
    window.setTimeout(() => {
      const r = first.getBoundingClientRect();
      const vh = window.innerHeight || doc.documentElement.clientHeight || 0;
      const shown = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (r.width > 0 && r.height > 0 && shown >= r.height / 2) mark("seen");
    }, 300);
  }

  /* `dwell3` / `dwell10` / `dwell30` — time the page has been open AND
     visible since the instrument painted. The clock pauses while the tab is
     hidden, so a backgrounded tab never reads as attention. sendBeacon means
     a close at five seconds still leaves the three-second mark behind. */
  const DWELLS = [{ at: 3000, step: "dwell3" },
                  { at: 10000, step: "dwell10" },
                  { at: 30000, step: "dwell30" }];
  let dwellMs = 0;        // visible milliseconds banked so far
  let dwellSince = 0;     // start of the current visible run (0 = paused)
  let dwellTimer = 0;

  function dwellBank() {
    if (!dwellSince) return;
    const now = Date.now();
    dwellMs += now - dwellSince;
    dwellSince = now;
  }
  /* Bank the time, then send every threshold it has passed. Cheap to call
     twice: mark() already refuses to send the same step again. */
  function dwellFlush() {
    dwellBank();
    DWELLS.forEach((d) => { if (dwellMs >= d.at) mark(d.step); });
  }
  function dwellArm() {
    window.clearTimeout(dwellTimer);
    if (!dwellSince) return;                       // hidden: no clock to run
    let next = null;
    DWELLS.forEach((d) => { if (!next && !sentSteps[d.step]) next = d; });
    if (!next) return;                             // all three are away
    dwellTimer = window.setTimeout(() => {
      dwellFlush();
      dwellArm();
    }, Math.max(0, next.at - dwellMs) + 15);
  }
  function dwellResume() {
    if (dwellSince) return;
    dwellSince = Date.now();
    dwellArm();
  }
  function dwellPause() {
    dwellFlush();                                  // whatever was earned, send it
    dwellSince = 0;
    window.clearTimeout(dwellTimer);
  }
  function watchDwell() {
    if (doc.visibilityState !== "hidden") dwellResume();
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState === "hidden") dwellPause();
      else dwellResume();
    });
    /* The tab going away is the last chance to post what they already gave us. */
    window.addEventListener("pagehide", dwellFlush);
  }

  /* `error` — one of OUR scripts threw. One beacon, no message: the enum is
     fixed server side, so the counter can say "it broke here" and nothing
     else, ever. A third-party script (the pixel, Lenis) failing is not this
     page failing, so it is ignored and the count stays honest. */
  const OURS = /(^|\/)(audit|content|script)\.js(\?|#|:|$)/;
  function fileIsOurs(file) {
    const f = file == null ? "" : String(file);
    if (!f) return true;                           // inline script, i.e. ours
    if (f === String(window.location.href)) return true;
    return OURS.test(f);
  }
  function reasonIsOurs(reason) {
    let stack = "";
    try { stack = (reason && reason.stack) ? String(reason.stack) : ""; }
    catch (e) { stack = ""; }
    if (!stack) return true;                       // nothing to blame: count it
    if (OURS.test(stack)) return true;
    return !/\.js[:?]/.test(stack);                // no file named at all: inline
  }
  /* ---- The detail behind that one mark ----------------------------------
     The counter above is an enum and nothing else, which was enough right up
     until it moved: 15 errors on 72 landings, almost all inside the Facebook
     in-app browser on real phones, and only 2 first taps behind them. "It
     broke" cannot be fixed. So the FIRST qualifying error of a page load also
     sends one report carrying what threw, where in OUR files, which screen the
     visitor was on and whether a tap was in flight.

     What it never carries: an answer, a dollar figure, a name, an email or a
     mobile. The fields below are the whole payload, and none of them can reach
     one. The whole thing is inside a try/catch because a crash reporter that
     can crash turns one broken device into a loop. */
  const BUILD_V = (function () {
    /* The cache-bust on our own <script src>. It is the one thing that tells a
       report from a phone holding a stale copy apart from a report about the
       build that is actually deployed. */
    try {
      const s = doc.currentScript || doc.querySelector('script[src*="audit.js"]');
      const m = /[?&]v=([^&#"]+)/.exec((s && s.getAttribute("src")) || "");
      return m ? decodeURIComponent(m[1]).slice(0, 24) : "";
    } catch (e) { return ""; }
  })();

  let painted = false;      // the instrument has finished its first render
  let tapping = false;      // an option tap handler is running RIGHT NOW

  /* Raised on the way into the option handler and dropped on the next task,
     NOT in a `finally`. A throw inside a listener unwinds the handler first and
     only then reaches window.onerror, so a finally would have lowered the flag
     before the one report that needed it was written. */
  function tapMark() {
    tapping = true;
    window.setTimeout(() => { tapping = false; }, 0);
  }

  /* q1..q7 (or q1..q9 on the finishing run), results, calendar, booking, done. */
  function screenName() {
    try {
      const s = state.screen;
      if (s === "q") return "q" + (state.step + 1);
      if (state.book === "open" && (s === "calendar" || s === "done")) return "booking";
      return String(s || "q").slice(0, 24);
    } catch (e) { return ""; }
  }

  let reported = false;
  function report(message, file, line, col, err) {
    if (reported) return;
    reported = true;                       // set FIRST: one report, whatever follows
    try {
      let stack = "";
      try { stack = (err && err.stack) ? String(err.stack).slice(0, 600) : ""; }
      catch (e) { stack = ""; }
      let msg = "";
      try { msg = String(message == null ? "" : message).slice(0, 240); }
      catch (e) { msg = "(unreadable)"; }
      const u = state.utm || {};
      const body = JSON.stringify({
        msg: msg,
        src: String(file == null ? "" : file).slice(0, 160),
        line: line == null ? "" : String(line).slice(0, 12),
        col: col == null ? "" : String(col).slice(0, 12),
        stack: stack,
        screen: screenName(),
        phase: tapping ? "tap" : (painted ? "idle" : "load"),
        utm_source: String(u.utm_source || u.source || "").slice(0, 50),
        utm_campaign: String(u.utm_campaign || u.campaign || "").slice(0, 50),
        utm_content: String(u.utm_content || u.content || "").slice(0, 80),
        v: BUILD_V,
      });
      const url = "/api/public/leak-audit/client-error";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      } else {
        fetch(url, { method: "POST", body: body, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* a reporter that throws is worse than no reporter */ }
  }

  function watchErrors() {
    window.addEventListener("error", (e) => {
      if (!e) return;
      if (e.target && e.target !== window) return;  // a resource 404, not a throw
      if (!fileIsOurs(e.filename)) return;
      mark("error");
      report(e.message, e.filename, e.lineno, e.colno, e.error);
    });
    window.addEventListener("unhandledrejection", (e) => {
      const reason = e && e.reason;
      if (!reasonIsOurs(reason)) return;
      mark("error");
      /* A rejection names no file and no line: the stack, if there is one, is
         the only place the answer can be. */
      report(reason && reason.message ? reason.message : reason, "", null, null, reason);
    });
  }
  /* Armed at module load, not in PAGE_INIT: a crash while the instrument is
     building is exactly the failure this counter exists to catch. */
  watchErrors();

  /* ---- Meta Pixel events (no personal data, ever) -----------------------
     Two events, at the same two milestones the first-party beacon marks: the
     audit starting, and a submission the API actually accepted. Both are
     once per pageload. Guarded so a blocked pixel, an ad blocker or a Do Not
     Track opt-out is silence rather than an error, exactly like the beacon.
     Never carries an answer, a dollar figure, a name, a mobile or an email:
     see meta-pixel.js and privacy.html section 04. */
  const sentPixel = {};
  function pixel(event, params) {
    if (!event || sentPixel[event]) return;
    sentPixel[event] = true;
    try {
      if (typeof fbq === "function") fbq("track", event, params);
    } catch (e) { /* never let a tag touch the experience */ }
  }
  /* The one custom event: the mid-funnel signal Meta needs to optimise on
     something other than a handful of Leads. Fired when the counter lands, at
     the same moment the `priced` beacon goes. No parameters at all, so it can
     never carry an answer or a figure. Disclosed in privacy.html section 04. */
  function pixelCustom(event) {
    if (!event || sentPixel[event]) return;
    sentPixel[event] = true;
    try {
      if (typeof fbq === "function") fbq("trackCustom", event);
    } catch (e) { /* never let a tag touch the experience */ }
  }

  function choose(q, o, btn, group) {
    tapMark();               // a throw from here reports as phase "tap"
    if (state.busy) return;
    state.answers[q.key] = o.key;
    Array.prototype.forEach.call(group.children, (c) => {
      const on = c === btn;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    mark("start");
    pixel("ViewContent", { content_name: "leak-audit", content_category: "audit" });
    /* A gating answer may have just removed (or restored) later questions. */
    prune();
    if (state.phase === "pre") updateCounter();
    save();
    const list = applicable();
    const next = indexOfKey(list, q.key) + 1;
    const last = next >= list.length;
    /* the counter has one more climb in it on the last of the seven, so the
       screen holds a beat longer there before the reveal takes over */
    const wait = REDUCED ? 0 : (last && state.phase === "pre" ? 700 : 120);
    state.busy = true;
    window.setTimeout(() => {
      /* Still the tap's own work: this is where the next question is built and
         where a device that falls over on a tap is most likely to do it. */
      tapMark();
      state.busy = false;
      if (!last) { goTo(next); return; }
      if (state.phase === "finish") completeFinish();
      else toResults();
    }, wait);
  }

  function goTo(index) {
    const list = applicable();
    if (index < 0 || index >= list.length) return;
    state.step = index;
    save();                       // the screen they are ON, not the one they left
    renderRail();
    swapQuestion(buildQuestion(list[index], index, list));
    /* the counter's one-time reveal line belongs to the step that earned it */
    if (meter && A.counter && A.counter.hint) {
      const hint = meter.querySelector(".audit-meter__hint");
      if (hint && meter.dataset.revealAt !== String(index)) hint.textContent = A.counter.hint;
    }
  }

  function renderRail() {
    const total = applicable().length;      // the CURRENT applicable total, not 16
    const p = A.progress || {};
    progText.textContent = (p.label || "Question") + " " + (state.step + 1) + " " + (p.of || "of") + " " + total;
    progFill.style.width = ((state.step) / total * 100).toFixed(2) + "%";
    backBtn.hidden = state.step === 0;
    firstScreen(state.phase === "pre" && state.step === 0);
  }

  /* The stripped first screen: the hook as the headline, question one, and
     nothing else. Everything the rail and the strip say is true and useful on
     question five and pure friction in front of tap one, so it is hidden (not
     unbuilt) until the second question, which is why nothing moves when it
     comes back. The <main> class also carries the trust strip's state. See
     .is-first-screen in styles.css. */
  function firstScreen(on) {
    const main = doc.querySelector(".audit");
    if (main) main.classList.toggle("is-first-screen", on);
    if (panel) panel.classList.toggle("is-first", on);
  }

  /* Cross-fade the question and glide the panel to its new height. Both are
     skipped entirely under reduced motion. */
  function swapQuestion(next) {
    if (REDUCED || !qBox.firstChild) {
      const first = !qBox.firstChild;
      qBox.replaceChildren(next);
      next.classList.remove("is-enter");
      /* On the very first paint nothing has happened yet, so moving focus (and
         drawing a ring around the question) would be an announcement of
         nothing. Every later swap follows a tap and does move focus. */
      if (!first) focusQuestion(next);
      return;
    }
    const current = qBox.firstElementChild;
    current.classList.add("is-leave");
    window.setTimeout(() => {
      const h0 = qBox.offsetHeight;
      qBox.replaceChildren(next);
      qBox.style.height = h0 + "px";
      const h1 = qBox.scrollHeight;
      // force the start height to commit before the transition target lands
      void qBox.offsetHeight;
      qBox.style.height = h1 + "px";
      requestAnimationFrame(() => next.classList.remove("is-enter"));
      const done = (e) => {
        if (e && e.propertyName !== "height") return;
        qBox.style.height = "";
        qBox.removeEventListener("transitionend", done);
      };
      qBox.addEventListener("transitionend", done);
      window.setTimeout(done, 600);   // belt and braces if the transition never fires
      focusQuestion(next);
    }, 150);
  }

  function focusQuestion(node) {
    const h = node.querySelector(".audit-qi__title");
    if (!h) return;
    try { h.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
  }

  /* ===========================================================================
     5. THE LIVE LEAK COUNTER
     v2 ticks once per COMPLETED channel, so the build is emotional rather than
     jittery: the phone lands, then the leads, then the quotes, then the list.
     ========================================================================= */
  /* Pre-gate, the two priced channels are the two the ads are about. The
     phone lands as soon as the sizing and the three phone answers are in
     (after hours has not been asked yet, so the engine's own "no idea"
     fallback carries it and the card is flagged Estimated). The leads land on
     the last of the seven. */
  /* The five answers that price the phone, derived from the very list
     partialReady() walks below, so the strip and the reveal can never disagree
     about how many are left. */
  const PHONE_KEYS = PRE_GATE_KEYS.filter(
    (k) => k !== "reply_speed" && k !== "late_outcome");

  function partialReady(a) {
    for (let i = 0; i < PRE_GATE_KEYS.length; i++) {
      const k = PRE_GATE_KEYS[i];
      if (k === "reply_speed" || k === "late_outcome") continue;
      if (!a[k]) return false;
    }
    return true;
  }
  function partialScores(a) {
    /* the leads half needs both of its answers; until then it is worth zero,
       which is exactly what the engine would say about an unanswered pair */
    const feed = {};
    PRE_GATE_KEYS.forEach((k) => { if (a[k]) feed[k] = a[k]; });
    if (!feed.reply_speed || !feed.late_outcome) {
      feed.reply_speed = "minutes";
      feed.late_outcome = "few_gone";
      const s = scoreAuditPartial(feed, a.trade);
      /* strip the placeholder leads figure back out: only the phone is real */
      const phone = s.channels[0];
      const mid = phone.annual_high == null ? 0 : (phone.annual_low + phone.annual_high) / 2;
      s.total.annual_low = phone.annual_low;
      s.total.annual_high = phone.annual_high;
      s.total.weekly_mid = roundInt(mid / K.WEEKS);
      s.channels[1].annual_low = null;
      s.channels[1].annual_high = null;
      s.channels[1].status = null;
      s.channels[1].not_priced = true;
      s.channels[1].note = (A.result && A.result.notPriced && A.result.notPriced.slow_reply) || "";
      s.priced_channels = 1;
      return s;
    }
    return scoreAuditPartial(feed, a.trade);
  }

  /* How close the number is, in plain words plus one dot per answer. Runs on
     every tap of the pre run and goes silent the moment the real number lands,
     because a progress bar next to a finished number is just clutter. */
  function updateBuild() {
    if (!build) return;
    if (state.phase !== "pre") { build.classList.add("is-gone"); return; }
    const a = state.answers;
    let done = 0;
    PHONE_KEYS.forEach((k) => { if (a[k]) done++; });
    const gone = done >= PHONE_KEYS.length;
    build.classList.toggle("is-gone", gone);
    if (gone) return;
    const lines = (A.counter && A.counter.build) || [];
    buildLabel.textContent = lines[done] || "";
    Array.prototype.forEach.call(buildDots.children,
      (d, i) => d.classList.toggle("is-on", i < done));
  }

  function updateCounter() {
    const a = state.answers;
    updateBuild();
    if (!partialReady(a)) return;      // nothing priced yet, so nothing to show

    /* The reveal happens once, the first time a channel completes. */
    if (!meter.classList.contains("is-live")) {
      meter.classList.add("is-live");
      /* shown for this step only: what was just priced, and what is left */
      const first = (A.counter && (A.counter.revealLine || A.counter.hint)) || "";
      if (first && !meter.querySelector(".audit-meter__hint")) {
        /* it belongs to the NEXT screen: the counter reveals above the question
           after the one that priced it */
        meter.dataset.revealAt = String(state.step + 1);
        meter.querySelector(".audit-meter__box").appendChild(el("span", "audit-meter__hint", first));
      }
    }

    /* The NUMBER is re-checked on every answer, not just when a new channel
       completes. Gating it on the channel count froze the counter whenever
       somebody went back and edited an answer inside an already-complete
       channel (changing quotes_week to "I don't really quote" would drop the
       real total while the readout kept showing the old one, right up until
       the map contradicted it). Comparing the value instead keeps the counter
       still during a mid-section answer, which is what changes nothing anyway,
       and re-animates the moment the total genuinely moves in either
       direction. */
    const s = partialScores(a);
    const target = { low: s.total.annual_low, high: s.total.annual_high };
    if (target.high > 0) {
      /* the one mid-funnel signal, first party and Meta, at the same beat */
      mark("priced");
      pixelCustom("AuditPriced");
    }
    if (target.low === state.shown.low && target.high === state.shown.high) return;
    countTo(target);
  }

  function countTo(target) {
    /* A channel can honestly price at nothing (they answer the phone, they
       chase every quote). "$0 – $0" reads as a broken widget rather than good
       news, so it collapses to a single $0. */
    meterLow.parentNode.classList.toggle("is-zero", target.low === 0 && target.high === 0);
    if (REDUCED) {
      state.shown = target;
      meterLow.textContent = money(target.low);
      meterHigh.textContent = money(target.high);
      return;
    }
    if (counterRaf) cancelAnimationFrame(counterRaf);
    const from = { low: state.shown.low, high: state.shown.high };
    const t0 = performance.now();
    const dur = 720;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const k = ease(t);
      const low = from.low + (target.low - from.low) * k;
      const high = from.high + (target.high - from.high) * k;
      meterLow.textContent = money(low);
      meterHigh.textContent = money(high);
      if (t < 1) counterRaf = requestAnimationFrame(frame);
      else {
        counterRaf = 0;
        state.shown = target;
        meterLow.textContent = money(target.low);
        meterHigh.textContent = money(target.high);
      }
    };
    counterRaf = requestAnimationFrame(frame);
  }

  /* ===========================================================================
     6. THE LEAK MAP
     ========================================================================= */
  /* SCREEN 8. The result. The seventh tap lands here and EVERYTHING is handed
     over at once: the number, the whole breakdown and the fix for the worst
     leak, none of it blurred and none of it posted anywhere, because nothing
     has been asked for yet. The ask is the card underneath, and it buys a call
     rather than a reveal.
     Two marks fire on the same beat now and that is correct: `headline` is the
     figure being ready, `unlocked` is the map being open, and under this flow
     they are the same moment. */
  function toResults() {
    state.screen = "results";
    state.mirror = state.mirror || partialScores(state.answers);
    save();
    renderMap(state.mirror, {});
    mark("headline");
    mark("unlocked");
    showConvert();
    scrollToFlash();
  }

  /* The sticky chrome is the fixed bar plus the trust strip pinned under it, and it is
     not one fixed height: the trust line wraps to two lines on a narrow iPhone, and
     WebKit lays the bar out taller than Blink does. A hard 84px was short on both, so
     the map's "The Leak Map" kicker came to rest half under the strip on the result
     screen. Measure it at scroll time instead, and keep 84 only for the case where
     neither element is on the page. */
  function chromeHeight() {
    const bar = document.querySelector(".nav");
    const strip = document.querySelector(".audit-trust");
    if (!bar || !strip) return 84;
    return bar.getBoundingClientRect().height +
           strip.getBoundingClientRect().height + 12;
  }

  /* Where the seventh tap lands, and where the booking lands after it: the top
     of the number, under the chrome, with the map and the ask below it. */
  function scrollToFlash() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Land on the number they just earned, sharp, with the receipt and the
      // offer under it; fall back to the receipt if the sting is not there.
      const flash = doc.querySelector(".leakmap__sting") || doc.querySelector(".audit-flash");
      if (!flash) return;
      const y = flash.getBoundingClientRect().top + window.scrollY - chromeHeight() - 10;
      try { window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? "auto" : "smooth" }); }
      catch (err) { window.scrollTo(0, Math.max(0, y)); }
    }));
  }

  function scrollToStage() {
    if (!stage) return;
    const y = stage.getBoundingClientRect().top + window.scrollY - chromeHeight();
    try { window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? "auto" : "smooth" }); }
    catch (err) { window.scrollTo(0, Math.max(0, y)); }
  }

  let mapRefs = null;   // { root, body, lockwrap, flashSlot }

  /* The one leak that is costing them most, out of the two the seven taps can
     price. It names the conversion card, and it is the card on the map that
     carries the Leak Fix. Ties fall to missed calls, same rule the engine's
     start_here uses, so the page and the server never disagree about which
     leak is the worst one. A channel with no figure never wins. */
  function worstLeak(scores) {
    const list = (scores && scores.channels) || [];
    const fig = (k) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].key === k) return list[i].annual_high == null ? -1 : list[i].annual_high;
      }
      return -1;
    };
    return fig("slow_reply") > fig("missed_calls") ? "slow_reply" : "missed_calls";
  }

  const channelLabel = (key) =>
    (((A.channels || {})[key]) || {}).label || "";

  /* THE LEAK FIX LINE, for one channel. A trade-keyed version wins ONLY once
     the visitor has told us what they do (the chips under the receipt, or the
     last of the nine); before that there is nothing to key on and the neutral
     line is the only honest one. Same shape as the ending's headline lookup,
     so both read the trade in exactly one place each. */
  function fixText(key) {
    const F = A.fixes || {};
    const byTrade = (F.byTrade || {})[state.answers.trade] || {};
    return byTrade[key] || F[key] || "";
  }

  function renderMap(scores, opts) {
    firstScreen(false);          // the stripped first screen is behind them now
    const R = A.result || {};
    const root = el("article", "leakmap");

    /* ---- masthead: this is a document, and it is yours ---- */
    const head = el("header", "leakmap__head");
    head.appendChild(el("span", "lbl leakmap__kicker", R.kicker || "The Leak Map"));
    head.appendChild(el("span", "leakmap__doc", R.docLabel || ""));
    head.appendChild(el("span", "leakmap__keep", R.keep || ""));
    root.appendChild(head);

    /* ---- the sting: their number, SHARP, at every screen this renders ----
       It was blurred for one build and that build broke the promise on all
       seven live ads ("you see the number before we ask your name"). The blur
       lived on the breakdown below until the map stopped being something the
       visitor had to buy. `opts.unblur` lifts that one, not this. */
    const sting = el("section", "leakmap__sting");
    if (scores.all_clear) {
      sting.appendChild(el("p", "leakmap__lead", R.allClearLead || ""));
      sting.appendChild(el("p", "leakmap__big leakmap__big--words", R.allClearHeading || ""));
    } else {
      sting.appendChild(el("p", "leakmap__lead", R.lead || ""));
      const big = el("p", "leakmap__big");
      rangeInto(big, scores.total.annual_low, scores.total.annual_high, R.rangeSep);
      sting.appendChild(big);
      sting.appendChild(el("span", "leakmap__per", R.perYear || ""));
      sting.appendChild(el("p", "leakmap__weekly", fill(R.weekly, { weekly: money(scores.total.weekly_mid) })));
    }
    sting.appendChild(el("p", "leakmap__fine", R.disclaimer || ""));
    root.appendChild(sting);

    /* ---- the breakdown. Never gated: it renders open on the seventh tap. ---- */
    const lockwrap = el("div", "leakmap__lockwrap");
    /* `is-unblur` is the blur WITHOUT the crop, the mask or the dead pointer
       events, so it can be lifted one frame after paint and the map sharpens
       in place under the visitor instead of cutting to a new screen. Nothing
       sets it any more, and it is kept because a future reveal may want it. */
    const body = el("div", "leakmap__body" + (opts.unblur ? " is-unblur" : ""));

    body.appendChild(sectionTitle(R.channelsTitle));
    /* A leak with a number and a leak without one are two different things, so
       they now read as two different things: a card each for the priced ones,
       one short block for the rest. Three cards apologising for questions we
       have not asked was 40% of this map. */
    const priced = [], unpriced = [];
    scores.channels.forEach((c) => {
      ((c.annual_high != null && c.annual_high > 0) ? priced : unpriced).push(c);
    });
    const rows = el("div", "leak-rows");
    const maxFig = Math.max.apply(null, priced.map((c) => c.annual_high).concat([1]));
    const worst = worstLeak(scores);
    priced.forEach((c) => rows.appendChild(buildRow(c, maxFig, R, c.key === worst)));
    body.appendChild(rows);

    /* The nine remaining taps are offered HERE, against the gap they actually
       fill, rather than as a footnote under the call. Gone once it is done. */
    const un = buildUnpriced(unpriced, R, state.screen === "done" ? null : startFinish);
    if (un) body.appendChild(un);

    /* The answer to "so how would you fix that?" It sits between the leaks and
       the ask because that is exactly where the visitor asks it. */
    body.appendChild(buildFixSystem(scores));
    /* A 90 day order needs all five channels, so a partial map has no roadmap
       and does not pretend to. */
    if ((scores.roadmap || []).length) {
      body.appendChild(sectionTitle(R.roadmapTitle));
      body.appendChild(buildRoadmap(scores, R));
    }
    /* the honest hand-off: what this map does for them, and what we do */
    if (R.chain) body.appendChild(el("p", "leakmap__chain", R.chain));

    lockwrap.appendChild(body);
    root.appendChild(lockwrap);

    /* The slot every post-map screen drops into, and it sits BELOW the
       breakdown now rather than above it. The map is no longer a thing the
       visitor has to buy, so the page runs in the order of the promise: their
       number, the whole map, then the one thing they cannot do themselves. */
    const flashSlot = el("div", "leakmap__flash");
    root.appendChild(flashSlot);

    mapRefs = { root: root, body: body, lockwrap: lockwrap, flashSlot: flashSlot };

    stage.replaceChildren(root);
    animateBars();
    /* the unblur, one frame after paint so the transition has a start state */
    if (opts.unblur) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        body.classList.remove("is-unblur");
      }));
    }
  }

  function sectionTitle(text) {
    const h = el("h2", "leakmap__h", text || "");
    return h;
  }

  /* ONE CARD, ONE NUMBER. The card used to carry the label, a status pill, the
     worker, their answer quoted back, our note, a sourced benchmark and the
     worked maths: 107 words on the worst leak, and five of those cards made a
     map nobody read. Now the money is the card and everything that backs it up
     sits one tap away. Nothing was deleted, which matters: the working has to
     stay checkable or "we did not make it up for you" is just a sentence. */
  function buildRow(c, maxFig, R, isWorst) {
    const row = el("div", "leak-row" + (isWorst ? " is-worst" : ""));
    row.dataset.status = c.status || "none";

    const head = el("div", "leak-row__head");
    const pills = el("span", "leak-row__pills");
    /* estimated: this channel rode on our assumption, not their number. Say so
       plainly rather than letting the figure pass as something they told us. */
    if (c.estimated && R.estimatedTag) pills.appendChild(el("span", "leak-row__est", R.estimatedTag));
    pills.appendChild(el("span", "leak-row__pill",
      (R.statusLabels && R.statusLabels[c.status]) || c.status));
    head.append(el("b", "leak-row__name", c.label), pills);
    row.appendChild(head);

    /* THE MONEY, straight under the name, because it is the only reason the
       card exists. Reviews never carry a figure and never will: that rail is
       older than this layout and it outranks it. */
    const priced = c.annual_high != null && c.annual_high > 0;
    if (priced) {
      const fig = el("p", "leak-row__fig");
      rangeInto(fig, c.annual_low, c.annual_high, R.rangeSep);
      fig.appendChild(el("span", "leak-row__per", " " + (R.perYear || "")));
      row.appendChild(fig);
    } else if (R.reviewsLine && !(c.note && c.note.indexOf("dollar figure") !== -1)) {
      row.appendChild(el("p", "leak-row__nofig", R.reviewsLine));
    }

    const track = el("div", "leak-row__track");
    track.setAttribute("aria-hidden", "true");
    const fill_ = el("i", null);
    const pct = !priced
      ? ({ critical: 85, high: 70, medium: 45, ok: 12 })[c.status] || 12
      : Math.max(6, Math.round((c.annual_high / maxFig) * 100));
    fill_.dataset.w = pct + "%";
    track.appendChild(fill_);
    row.appendChild(track);

    /* ONE plain sentence. The worst leak gets the fix, because that is the one
       the call is about. Every other card names who covers it. */
    const fixLine = isWorst && fixText(c.key);
    if (fixLine) {
      row.appendChild(el("p", "leak-row__lead", fixLine));
    } else if (c.worker) {
      const worker = el("p", "leak-row__worker");
      worker.append(
        el("span", "leak-row__wname", c.worker.name || ""),
        doc.createTextNode(c.worker.role ? " · " + c.worker.role : "")
      );
      row.appendChild(worker);
    }

    /* ---- everything that backs the number up, one tap away ---- */
    const inner = [];
    /* their own answers, quoted back. The label owns the "You told us:"
       lead-in, so strip the same words off the front of the server's echo
       string (mirror echoes never carry it) — otherwise it reads "You told us:
       You told us you miss..." (same fix as the PDF). */
    if (c.echo) {
      let echoText = c.echo;
      const m = /^you told us[,:]?\s+/i.exec(echoText);
      if (m) echoText = echoText.charAt(m[0].length).toUpperCase() + echoText.slice(m[0].length + 1);
      const echo = el("p", "leak-row__echo");
      echo.append(el("span", "leak-row__echo-lead", (A.echo && A.echo.lead) || "You told us: "),
                  doc.createTextNode(echoText));
      inner.push(echo);
    }
    if (c.note) inner.push(el("p", "leak-row__note", c.note));
    /* SERVER-ONLY: a sourced comparison of their answer against the published
       research, attribution inside the string. The mirror never builds one. */
    if (c.benchmark) inner.push(el("p", "leak-row__bench", c.benchmark));
    /* SERVER-ONLY: one worked plain-english line from their inputs to the
       range. This used to be printed open, on the reasoning that the
       arithmetic IS the pain. It reads that way on one card and as noise on
       five, so Nicholas moved it in here with the rest of the working. */
    if (c.maths) inner.push(buildMaths(c, R));

    /* A card with arithmetic offers the working. A card without offers what it
       actually holds, which is their own answer. Never the other way round:
       promising a working and not having one is what put this here. */
    const hasMaths = !!c.maths;
    const more = buildDisclosure(
      hasMaths ? R.showWorking : R.showAnswer,
      hasMaths ? R.hideWorking : R.hideAnswer,
      inner);
    if (more) row.appendChild(more);
    return row;
  }

  function buildMaths(c, R) {
    const wrap = el("aside", "leak-maths");
    wrap.appendChild(el("span", "leak-maths__label", R.mathsLabel || "The maths"));
    wrap.appendChild(el("p", "leak-maths__text", c.maths));
    return wrap;
  }

  /* The disclosure. Same mechanics as the FAQ on the home page (a real button,
     aria-expanded, aria-controls) with one deliberate difference: the closed
     panel is `hidden`, so nothing inside it is tabbable. The FAQ hides its
     panel behind aria-hidden alone and leaves the contents in the tab order,
     which is a bug worth not copying. */
  let discloseSeq = 0;
  function buildDisclosure(label, labelOpen, nodes) {
    if (!nodes || !nodes.length) return null;
    const id = "leak-more-" + (++discloseSeq);
    const wrap = el("div", "leak-row__more");
    const btn = el("button", "leak-row__morebtn", label || "Show the working");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", id);
    const panel = el("div", "leak-row__panel");
    panel.id = id;
    panel.hidden = true;
    nodes.forEach((n) => panel.appendChild(n));
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      btn.textContent = open ? (label || "Show the working") : (labelOpen || label || "");
      panel.hidden = open;
    });
    wrap.append(btn, panel);
    return wrap;
  }

  /* THE LEAKS WITH NO FIGURE. Three cards apologising for what we have not
     asked became one short block: the same facts, told as an offer. It reads
     off the real list, so once the nine taps are done it collapses to reviews
     alone, which is the one channel that never gets a dollar figure by design. */
  function buildUnpriced(list, R, onFinish) {
    if (!list.length) return null;
    const box = el("section", "leak-unpriced");
    box.appendChild(el("span", "leak-unpriced__lead", R.unpricedLead || ""));
    const ul = el("ul", "leak-unpriced__list");
    list.forEach((c) => {
      const li = el("li", "leak-unpriced__item");
      li.appendChild(el("b", "leak-unpriced__name", c.label));
      /* Before the nine taps the honest reason is "we have not asked". After
         them it is "this one never carries a dollar figure", which is only
         true of reviews and is a rail, not an omission. Read the flag, never
         assume the first case. */
      const why = c.not_priced
        ? (R.notPriced || {})[c.key]
        : (c.key === "reviews" ? R.reviewsLine : c.note) || "";
      if (why) li.appendChild(el("span", "leak-unpriced__why", why));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (onFinish) {
      if (R.unpricedLine) box.appendChild(el("p", "leak-unpriced__note", R.unpricedLine));
      const T = A.thanks || {};
      const btn = el("button", "btn btn--ghost leak-unpriced__btn",
        (state.tradeTap && T.finishLinkShort) || T.finishLink || "");
      btn.type = "button";
      btn.addEventListener("click", onFinish);
      box.appendChild(btn);
    }
    return box;
  }

  /* ===========================================================================
     HOW IT GETS FIXED
     The map leaves exactly one question open, and until now the page never
     answered it: right, so how would you actually fix that? Without this block
     the honest reading of the whole thing is "you are going to tell me to reply
     faster". The before/after is a SEQUENCE OF EVENTS and never a second dollar
     figure: a number in the right-hand column is a promised recovery, and that
     is the one claim on this page we could not stand behind.
     ========================================================================= */
  function buildFixSystem(scores) {
    const SY = A.system || {};
    const sec = el("section", "fixsys");
    /* A clean map has no "before", so it gets no before/after and no talk of
       fixing. Printing a man losing a job directly under "you run a tight
       ship" is the page contradicting itself at the payoff. */
    const clear = !!(scores && scores.all_clear);
    const title = clear ? (SY.allClearTitle || SY.title) : SY.title;
    const lead  = clear ? (SY.allClearLead  || SY.lead)  : SY.lead;
    if (title) sec.appendChild(el("h2", "leakmap__h fixsys__h", title));
    if (lead) sec.appendChild(el("p", "fixsys__lead", lead));

    const worst = worstLeak(scores);
    if (!clear) {
      const pair = (SY.pairs || {})[worst];
      if (pair) sec.appendChild(buildBeforeAfter(pair, SY));
    }

    const sub = clear ? (SY.allClearFixTitle || SY.fixTitle) : SY.fixTitle;
    if (sub) sec.appendChild(el("span", "fixsys__subh", sub));
    const ul = el("ul", "fixsys__list");
    (scores.channels || []).forEach((c) => {
      const line = (SY.lines || {})[c.key];
      if (!line) return;
      const li = el("li", "fixsys__item" + (!clear && c.key === worst ? " is-worst" : ""));
      li.appendChild(el("p", "fixsys__what", line));
      if (c.worker) {
        const who = el("p", "fixsys__who");
        who.append(el("span", "fixsys__wname", c.worker.name || ""),
                   doc.createTextNode(c.worker.role ? " · " + c.worker.role : ""));
        li.appendChild(who);
      }
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    /* Where to begin, from the engine. Same line the PDF and the server agree
       on, so the page never nominates a different starting point. */
    const start = (scores.start_here && scores.start_here.line) || "";
    if (start) sec.appendChild(el("p", "fixsys__start", start));
    if (SY.close) sec.appendChild(el("p", "fixsys__close", SY.close));
    return sec;
  }

  function buildBeforeAfter(pair, SY) {
    const grid = el("div", "beforeafter");
    const col = (mod, lbl, lines) => {
      const c = el("div", "beforeafter__col beforeafter__col--" + mod);
      c.appendChild(el("span", "beforeafter__lbl", lbl || ""));
      const ol = el("ol", "beforeafter__steps");
      (lines || []).forEach((t) => ol.appendChild(el("li", null, t)));
      c.appendChild(ol);
      return c;
    };
    grid.appendChild(col("now", SY.beforeLabel, pair.before));
    grid.appendChild(col("new", SY.afterLabel, pair.after));
    return grid;
  }

  function buildRoadmap(scores, R) {
    const list = el("ol", "roadmap");
    (scores.roadmap || []).forEach((r) => {
      const li = el("li", "roadmap__item");
      const w = el("span", "roadmap__weeks");
      w.textContent = (R.weeksLabel || "Weeks") + " " + r.weeks;
      const bodyCol = el("div", "roadmap__body");
      const who = el("p", "roadmap__who");
      who.append(
        el("span", "roadmap__wname", (r.worker && r.worker.name) || ""),
        doc.createTextNode(r.worker && r.worker.role ? " · " + r.worker.role : "")
      );
      bodyCol.append(who, el("p", "roadmap__action", r.action || ""));
      li.append(w, bodyCol);
      list.appendChild(li);
    });
    return list;
  }

  /* Bars grow from nothing once, so the breakdown looks alive even behind the
     frosted glass. Static under reduced motion. */
  function animateBars() {
    if (!mapRefs) return;
    const fills = Array.prototype.slice.call(mapRefs.body.querySelectorAll(".leak-row__track > i"));
    if (REDUCED) { fills.forEach((f) => { f.style.width = f.dataset.w; }); return; }
    fills.forEach((f) => { f.style.width = "0%"; });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fills.forEach((f, i) => {
        f.style.transitionDelay = (i * 80) + "ms";
        f.style.width = f.dataset.w;
      });
    }));
  }

  /* ===========================================================================
     7. THE CONVERSION STEP
     The map above this card is open, complete and already theirs: the number,
     every priced channel, and the fix for the worst one. Nothing here is a
     toll. What the three fields buy is a CALL, and this is the first thing on
     the whole page that asks the visitor for anything at all.
     ========================================================================= */
  function buildConvert(scores, opts) {
    opts = opts || {};
    const C = A.convert || {};
    const R = A.result || {};
    const T = A.thanks || {};
    const sec = el("section", "audit-offer audit-offer--solo audit-convert");

    /* Their range, restated INSIDE the card. It is the same figure as the
       sting at the top of the map, said once more at the moment of the ask,
       because an ask reads differently sitting directly under the loss it is
       about. */
    if (scores && !scores.all_clear && scores.total &&
        scores.total.annual_high != null) {
      const figWrap = el("div", "gate__fig");
      if (C.figLead) figWrap.appendChild(el("span", "gate__figlead", C.figLead));
      const figRange = el("p", "gate__figrange");
      rangeInto(figRange, scores.total.annual_low, scores.total.annual_high, R.rangeSep);
      figWrap.appendChild(figRange);
      if (C.figUnit) figWrap.appendChild(el("span", "gate__figunit", C.figUnit));
      sec.appendChild(figWrap);
    }

    /* Same rule as the block above: on a clean map there is no worst leak to
       name, and naming one anyway is the page calling itself a liar at the
       moment it asks for the call. */
    const clear = !!(scores && scores.all_clear);
    const lab = channelLabel(worstLeak(scores || {}));
    const kicker = clear ? C.allClearKicker : (lab && C.kickerLead ? C.kickerLead + lab : "");
    if (kicker) sec.appendChild(el("span", "audit-offer__kicker", kicker));
    const title = clear ? (C.allClearTitle || C.title) : C.title;
    if (title) sec.appendChild(el("b", "audit-offer__title", title));
    /* THE CALL, NAMED. "A call" is a thing people dodge; a named, timeboxed
       thing is a thing they book. */
    if (C.callName) {
      const nameRow = el("div", "callname");
      nameRow.appendChild(el("b", "callname__title", C.callName));
      if (C.callBadge) nameRow.appendChild(el("span", "callname__badge", C.callBadge));
      sec.appendChild(nameRow);
    }
    if (C.sub) sec.appendChild(el("p", "audit-offer__body", C.sub));
    /* What actually happens on it, in three steps. Same components as the home
       page's how-it-works band (.steps / .step__n / .step__title / .step__text)
       so it reads as the same house, not a new one. */
    if (Array.isArray(C.steps) && C.steps.length) {
      if (C.stepsTitle) sec.appendChild(el("span", "audit-offer__walk", C.stepsTitle));
      const steps = el("ol", "steps steps--3 callsteps");
      C.steps.forEach((st) => {
        const li = el("li", "step");
        li.appendChild(el("span", "step__n", st.n || ""));
        li.appendChild(el("b", "step__title", st.title || ""));
        li.appendChild(el("p", "step__text", st.text || ""));
        steps.appendChild(li);
      });
      sec.appendChild(steps);
    }
    if (C.trust) sec.appendChild(el("p", "audit-offer__trust", C.trust));

    sec.appendChild(buildConvertForm(C));

    /* The one way out, offered AFTER the card has made its case and never in
       front of the number. Same tab on purpose: the run lives in
       sessionStorage, so Back lands them on the open map as they left it. */
    const M = (T.offer || {}).more || {};
    if (M.whoLabel) {
      const more = el("p", "audit-offer__more", M.before || "");
      const a_ = doc.createElement("a");
      a_.href = M.whoHref || "index.html";
      a_.textContent = M.whoLabel;
      more.appendChild(a_);
      more.appendChild(doc.createTextNode(M.after || "."));
      sec.appendChild(more);
    }
    /* The nine remaining taps used to hang off the bottom of this card. They
       now sit up in the map, against the three leaks they actually price,
       which is where somebody wonders about them. */
    return sec;
  }

  /* The three fields. Same markup, same validation posture and the same wire
     names as the old gate form (name / email / mobile): the server contract is
     untouched, only the labels, the order and the reason for asking changed. */
  function buildConvertForm(C) {
    const form = el("form", "gate__form");
    form.noValidate = true;

    const fields = [];
    const addField = (name, label, attrs) => {
      const wrapF = el("div", "gate__field");
      const lab = doc.createElement("label");
      lab.appendChild(el("span", "gate__lab", label));
      const inp = doc.createElement("input");
      inp.id = "la-" + name;
      inp.name = name;
      Object.keys(attrs).forEach((k) => inp.setAttribute(k, attrs[k]));
      inp.required = true;
      inp.setAttribute("aria-describedby", "la-" + name + "-err");
      lab.appendChild(inp);
      const why = (C.reasons || {})[name];
      if (why) lab.appendChild(el("span", "gate__why", why));
      const err = el("span", "gate__err");
      err.id = "la-" + name + "-err";
      wrapF.append(lab, err);
      form.appendChild(wrapF);
      fields.push(inp);
      return inp;
    };

    /* Name, Email, Phone, in that order, each carrying the reason it is asked
       so no field is taken silently. The phone is validated against the same
       rule the server applies (routes/comms._clean_mobile). */
    const F_ = C.fields || {};
    addField("name",   F_.name   || "Name",  { type: "text", autocomplete: "name" });
    addField("email",  F_.email  || "Email", { type: "email", autocomplete: "email", inputmode: "email" });
    addField("mobile", F_.mobile || "Phone", { type: "tel", autocomplete: "tel", inputmode: "tel", pattern: MOBILE_PATTERN });

    /* honeypot: humans never see it, bots fill it, the server pretends success */
    const hp = doc.createElement("input");
    hp.type = "text";
    hp.name = "website";
    hp.className = "booking__hp";
    hp.tabIndex = -1;
    hp.setAttribute("aria-hidden", "true");
    hp.setAttribute("autocomplete", "off");
    form.appendChild(hp);

    const btn = el("button", "btn btn--primary btn--lg gate__btn gate__btn--convert",
                   C.button || "Show me what I could fix");
    btn.type = "submit";
    form.appendChild(btn);
    if (C.note) form.appendChild(el("p", "gate__note", C.note));
    if (C.privacy) form.appendChild(el("p", "gate__note gate__note--privacy", C.privacy));
    if (C.site && C.site.text) {
      const site = el("p", "gate__site", C.site.text + " ");
      (C.site.links || []).forEach((l, i) => {
        if (i) site.appendChild(doc.createTextNode(" "));
        const a_ = doc.createElement("a");
        a_.href = l.href;
        a_.target = "_blank";
        a_.rel = "noopener";
        a_.textContent = l.label;
        site.appendChild(a_);
      });
      form.appendChild(site);
    }
    const msg = el("p", "gate__msg");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    form.appendChild(msg);

    /* ---- per-field validation, visible and announced (same posture as the
           booking form on index.html: novalidate, our own messages) ---- */
    const errNode = (inp) => form.querySelector("#" + inp.id + "-err");
    const messageFor = (inp) => {
      if (inp.validity.valueMissing) return C.errorRequired || "Please fill this in.";
      if (inp.type === "email") return C.errorEmail || "Please enter a valid email address.";
      return C.errorInvalid || "Please check this.";
    };
    const clearField = (inp) => {
      const e = errNode(inp);
      inp.removeAttribute("aria-invalid");
      if (e) { e.textContent = ""; e.classList.remove("is-on"); }
    };
    const markField = (inp) => {
      const e = errNode(inp);
      inp.setAttribute("aria-invalid", "true");
      if (e) { e.textContent = messageFor(inp); e.classList.add("is-on"); }
    };
    fields.forEach((inp) => {
      /* the single most useful number in the funnel: saw the card, versus
         started typing in it */
      inp.addEventListener("focus", () => mark("gate_focus"));
      inp.addEventListener("input", () => { if (inp.checkValidity()) clearField(inp); });
      inp.addEventListener("blur", () => { if (inp.checkValidity()) clearField(inp); else markField(inp); });
    });
    const validate = () => {
      let first = null;
      fields.forEach((inp) => {
        if (inp.checkValidity()) { clearField(inp); return; }
        markField(inp);
        if (!first) first = inp;
      });
      if (first) first.focus();
      return !first;
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validate()) return;
      submit(form, btn, msg);
    });
    return form;
  }

  /* The conversion card, dropped under the open map. */
  function showConvert() {
    if (!mapRefs) return;
    const T = A.thanks || {};
    const ending = [buildConvert(state.mirror, {})];
    /* the one real scarcity fact on this page, stated once, as a fact */
    if (T.scarcity) ending.push(el("p", "audit-flash__scarcity", T.scarcity));
    mapRefs.flashSlot.replaceChildren.apply(mapRefs.flashSlot, ending);
    showJump();
    mark("gate");
  }

  /* ---- THE SIGNPOST ------------------------------------------------------
     The call card sits under the number, the breakdown and the fix block, which
     is the right order to read them in and a long way down. Somebody who reads
     their figure and stops never learns there is a next step at all.
     A slim bar says what it is and goes straight there. It takes itself off the
     screen the moment the card is actually in view, so it never sits over the
     fields somebody is filling in, and it never appears once they have
     submitted, because by then the next step is the booking they are looking at. */
  let jumpBar = null, jumpWatch = null;

  function clearJump() {
    if (jumpWatch) { try { jumpWatch.disconnect(); } catch (e) { /* older Safari */ } jumpWatch = null; }
    if (jumpBar && jumpBar.parentNode) jumpBar.parentNode.removeChild(jumpBar);
    jumpBar = null;
  }

  function showJump() {
    clearJump();
    const C = A.convert || {};
    if (!C.jump) return;
    const card = doc.querySelector(".audit-convert");
    if (!card) return;

    jumpBar = el("button", "audit-jump", C.jump);
    jumpBar.type = "button";
    jumpBar.setAttribute("aria-label", C.jumpAria || C.jump);
    jumpBar.addEventListener("click", () => {
      const y = card.getBoundingClientRect().top + window.scrollY - chromeHeight() - 10;
      try { window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? "auto" : "smooth" }); }
      catch (err) { window.scrollTo(0, Math.max(0, y)); }
      /* send focus with the scroll, or a keyboard visitor is left at the bar */
      const title = card.querySelector(".callname__title") || card;
      title.tabIndex = -1;
      try { title.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
    });
    doc.body.appendChild(jumpBar);

    /* Hide it whenever the card it points at is on screen. Without an observer
       it would sit across the form. */
    if (typeof IntersectionObserver !== "function") return;
    jumpWatch = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!jumpBar) return;
        jumpBar.classList.toggle("is-away", e.isIntersecting);
      });
    }, { threshold: 0.12 });
    jumpWatch.observe(card);
  }

  function submit(form, btn, msg) {
    const C = A.convert || {};
    btn.disabled = true;
    btn.textContent = C.sending || "Sending...";
    msg.textContent = "";

    const val = (n) => {
      const f = form.querySelector('[name="' + n + '"]');
      return f ? String(f.value || "").trim() : "";
    };
    const a = state.answers;

    /* Only the seven that were actually ASKED go in. A deferred question is a
       real absence in the payload, which is exactly what
       validate_answers_partial checks for, so nothing is blanked or defaulted
       here and nothing from the finish run is smuggled in early. */
    const answers = {};
    PRE_GATE_KEYS.forEach((k) => { if (a[k]) answers[k] = a[k]; });

    const payload = {
      name: val("name"),
      phone: val("mobile"),
      email: val("email"),
      website: val("website"),        // honeypot, empty for humans
      answers: answers,
      partial: true,
    };
    /* trade is asked on the last of the nine, so at this point there usually is
       none. The engine defaults it to "other", and it moves only a channel the
       partial path does not price. */
    if (a.trade) payload.trade = a.trade;
    /* Campaign attribution for the paid traffic. Read from the URL on load,
       never from a cookie or storage, and omitted entirely when absent. */
    if (state.utm) payload.utm = state.utm;

    mark("submitted");
    state.email = payload.email;
    /* kept for the booking post and for the confirmation sentence, and written
       to sessionStorage by the save() on either branch below */
    state.mobile = payload.phone;
    fetch("/api/public/leak-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((out) => {
        if (!out || !out.success) throw new Error("send failed");
        /* The server is the authority: its scores replace the mirror's, and
           they carry the two fields the client cannot build (the benchmark and
           the worked maths line per channel). The map is re-rendered so those
           land, and the visitor is looking at the calendar below it by then. */
        if (out.scores && out.scores.channels) {
          state.mirror = out.scores;
          renderMap(state.mirror, {});
        }
        state.token = (out.pdf && out.pdf.token) ? String(out.pdf.token) : "";
        toCalendar(payload.email, null, out.pdf);
      })
      .catch(() => {
        /* Never punish the visitor for our outage: the map is already theirs
           and stays on the screen, and the booking falls back to the home page
           section, which does not need an audit row to work. */
        toCalendar(payload.email, A.sendError || "", null);
      });
  }

  /* ===========================================================================
     7b. THE BOOKING STEP
     Reached ONLY once the details are in, so the audit really is complete by
     the time this renders. The map stays above it, untouched.
     ========================================================================= */
  function toCalendar(email, errorLine, pdf) {
    state.screen = "calendar";
    save();
    if (!errorLine) pixel("Lead", { content_name: "leak-audit" });
    showCalendar(email, errorLine, pdf);
  }

  function showCalendar(email, errorLine, pdf) {
    const T = A.thanks || {};
    if (!mapRefs) return;
    clearJump();
    const token = (!errorLine && pdf && pdf.token) ? String(pdf.token) : (state.token || "");

    const flash = el("section", "audit-flash" + (errorLine ? " audit-flash--warn" : ""));
    flash.tabIndex = -1;
    flash.appendChild(el("b", "audit-flash__title", errorLine ? (A.sendErrorTitle || "") : (T.title || "")));
    if (errorLine) {
      flash.appendChild(el("p", "audit-flash__body", errorLine));
      const mail = doc.createElement("a");
      mail.className = "audit-flash__mail";
      mail.href = "mailto:" + (S.brand.email || "");
      mail.textContent = S.brand.email || "";
      flash.appendChild(mail);
    } else if (T.lead) {
      flash.appendChild(el("p", "audit-flash__body", T.lead));
    }
    /* The PDF sits on its own row, directly under the confirmation it belongs
       to, so the booking below it starts clean. */
    if (!errorLine) {
      const actions = el("div", "audit-flash__actions");
      const slot = el("div", "audit-pdf");
      actions.appendChild(slot);
      // no token means the audit row never landed, so no PDF is coming either
      if (token) pollPdf(token, slot, email);
      else slot.appendChild(el("p", "audit-pdf__fail", T.pdfFailed || ""));
      flash.appendChild(actions);
    }

    const ending = [flash];
    /* The trade, asked once and never before the map: under the receipt, one
       tap, skippable in silence. Offered only when the audit row really landed,
       because with no token there is nothing on our side to attach it to. */
    const trade = token ? buildTradeRow(T) : null;
    if (trade) ending.push(trade);
    ending.push(buildCalendar(token, T));
    if (T.scarcity) ending.push(el("p", "audit-flash__scarcity", T.scarcity));

    mapRefs.flashSlot.replaceChildren.apply(mapRefs.flashSlot, ending);
    try { flash.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
    scrollToFlash();
  }

  /* A real calendar only if somebody has actually set one. "#book" is the
     placeholder that ships in content.js, and an anchor is not a calendar, so
     anything that is not an http(s) URL falls through to the time windows. */
  function bookingEmbedUrl() {
    const u = String((S.brand && S.brand.bookingUrl) || "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  }

  /* THE BOOKING ITSELF. An embedded calendar when there is one to embed,
     otherwise the five time windows, which text. Either way it is the last
     screen: the audit is complete in the card above it. */
  function buildCalendar(token, T) {
    const C = T.calendar || {};
    const sec = el("section", "audit-offer audit-offer--solo audit-cal");
    if (C.title) sec.appendChild(el("b", "audit-cal__title", C.title));
    if (C.line) sec.appendChild(el("p", "audit-cal__line", C.line));

    const url = bookingEmbedUrl();
    if (url) {
      const frame = doc.createElement("iframe");
      frame.className = "audit-cal__frame";
      frame.src = url;
      frame.title = C.embedTitle || "";
      frame.loading = "lazy";
      frame.setAttribute("scrolling", "no");
      sec.appendChild(frame);
      mark("book_open");
      return sec;
    }
    /* Already booked, this session. The confirmation stands in the form's
       place, and a reload lands straight back here. */
    if (state.book === "done") { sec.appendChild(bookedNote(T)); return sec; }
    if (token && Array.isArray(T.times) && T.times.length) {
      sec.appendChild(buildBooking(token, T));
      if (state.book !== "open") { state.book = "open"; save(); }
      mark("book_open");
      return sec;
    }
    /* No row on our side, so there is nothing to attach a time to: send them
       to the booking section on the home page, which stands on its own. */
    const a_ = doc.createElement("a");
    a_.className = "btn btn--primary btn--lg audit-flash__cta";
    a_.href = "index.html#book";
    a_.textContent = T.cta || "";
    sec.appendChild(a_);
    if (T.ctaNote) sec.appendChild(el("p", "audit-flash__note", T.ctaNote));
    return sec;
  }

  /* ===========================================================================
     6b. THE TRADE, ASKED ONCE THE MAP IS OPEN
     The seven pre-gate taps never ask what they do, so nothing on this page may
     picture anybody's day until they have told us. This row is where they can,
     and it is genuinely optional: it buys WORDING, not a figure, so it sits
     between the receipt and the offer, takes one tap, has no text field, and
     collapses to a single quiet line the moment it is answered. Skipping it
     costs the visitor nothing at all, and the offer and the booking below it
     never wait on it.
     ========================================================================= */
  const tradeQuestion = () => QS().filter((q) => q.key === "trade")[0] || null;

  /* The chips: content's short list if it has one, otherwise the finish run's
     own question, whole. Either way the keys ARE that question's enum values,
     so a tap here is the same answer given earlier. */
  function tradeChips() {
    const TA = (A.thanks || {}).tradeAsk || {};
    if (Array.isArray(TA.chips) && TA.chips.length) return TA.chips;
    const q = tradeQuestion();
    return (q && q.options) || [];
  }

  function tradeLabel(key) {
    const all = tradeChips().concat(((tradeQuestion() || {}).options) || []);
    const hit = all.filter((o) => o.key === key)[0];
    return (hit && hit.label) || "";
  }

  function tradeDoneText() {
    const TA = (A.thanks || {}).tradeAsk || {};
    /* "Sorted, Something else." is not a sentence, so the way out has its own
       line rather than being fed through the template. */
    if (state.answers.trade === "other") return TA.doneOther || "";
    return fill(TA.done || "", { trade: tradeLabel(state.answers.trade) });
  }

  function tradeDoneLine() {
    const done = el("p", "audit-trade__ok", tradeDoneText());
    done.setAttribute("role", "status");
    return done;
  }

  function buildTradeRow(T) {
    const TA = (T && T.tradeAsk) || {};
    const chips = tradeChips();
    if (!TA.label || !chips.length) return null;
    const row = el("div", "audit-trade chip-row");
    /* Already answered, this session: the question is gone and what is left is
       the receipt for it. A reload lands straight back on this line. */
    if (state.tradeTap && state.answers.trade) {
      row.classList.add("is-done");
      row.appendChild(tradeDoneLine());
      return row;
    }
    row.appendChild(el("span", "chip-row__label audit-trade__label", TA.label));
    const group = el("div", "chip-row__chips");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", TA.label);
    chips.forEach((c) => {
      const b = el("button", "chip-toggle", c.label);
      b.type = "button";
      b.addEventListener("click", () => pickTrade(c.key, row));
      group.appendChild(b);
    });
    row.appendChild(group);
    if (TA.micro) row.appendChild(el("p", "audit-trade__micro", TA.micro));
    return row;
  }

  function pickTrade(key, row) {
    if (!key || state.tradeTap) return;
    state.answers.trade = key;
    state.tradeTap = true;
    save();
    mark("trade_tapped");
    postTrade(key);
    row.classList.add("is-done");
    row.replaceChildren(tradeDoneLine());
    retellTrade();
  }

  /* Fire and forget, exactly like the funnel beacon: the answer is already on
     the page and in the store, so a failed post costs the visitor nothing and
     is never shown to them. The server stores it only where the row is still
     carrying the engine's neutral default. */
  function postTrade(trade) {
    if (!state.token) return;
    try {
      fetch("/api/public/leak-audit/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token, trade: trade }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* never let this touch the experience */ }
  }

  /* Say it again, now that we know who we are talking to. The only line on
     this page that reads the trade is the worst leak's fix line, so that is
     the only thing rebuilt. It goes through fixText(), so a trade-keyed line
     added to that copy table later needs no new wiring. */
  function retellTrade() {
    const fixNode = doc.querySelector(".leak-fix__text");
    if (fixNode) fixNode.textContent = fixText(worstLeak(state.mirror || {}));
  }

  /* The confirmation, on its own. Built here as well as inside the booking
     form so a reload after a booking can print it without the form. */
  function bookedNote(T) {
    const row = el("div", "audit-times chip-row is-done");
    /* A reload keeps the number, so the confirmation keeps saying it. If the
       store was lost the sentence still has to read, so it says "you". */
    const msg = el("p", "audit-times__ok",
      fill((T && T.timesSuccess) || "", { mobile: state.mobile || "you" }));
    msg.setAttribute("role", "status");
    row.appendChild(msg);
    return row;
  }

  /* THE TIME WINDOWS. The number is already in hand from the conversion card,
     so this row asks for nothing but the windows: re-typing a mobile you have
     just given is a form asking you to prove you meant it. The field is built
     ONLY when the store has no number, which is a tab that took the old gate
     before this change shipped and must still be able to book. Same five time chips as ever.

     An OPTIONAL extra on a screen whose whole job is to feel like good news,
     which sets two rules it never breaks:

       · it never shows an error. Any failure at all (network down, non-200,
         a body that is not {success:true}) removes the row and says nothing.
         The visitor already has their map, the PDF and the call button, so a
         red line here would only make a working page look broken.
       · the confirm button stays disabled until at least one window is on.
         That is what stops a stray tap posting an empty selection, which the
         server would reject, which would make the row vanish under a visitor
         who did nothing wrong.

     Chip language is lifted wholesale from the enquiry box on the home page
     (.chip-row__label / .chip-row__chips / .chip-toggle, aria-pressed, 44px),
     so it reads as the same offer in the same house voice. */
  function buildBooking(token, T) {
    const G = A.convert || {};
    const B = T.booking || {};
    const row = el("div", "audit-times chip-row");

    /* ---- the mobile, only if we somehow do not have one ------------------
            Built exactly as it always was (our own message, announced, cleared
            the moment it is right) for the one case that still needs it: a
            session that took the old two-field gate, before the card asked
            for a number. --- */
    const known = String(state.mobile || "").trim();
    let fieldWrap = null, mobile = null;
    const clearMobile = () => {
      if (!mobile) return;
      mobile.removeAttribute("aria-invalid");
      fieldWrap.querySelector(".gate__err").textContent = "";
      fieldWrap.querySelector(".gate__err").classList.remove("is-on");
    };
    const markMobile = () => {
      if (!mobile) return;
      const err = fieldWrap.querySelector(".gate__err");
      mobile.setAttribute("aria-invalid", "true");
      err.textContent = mobile.validity.valueMissing
        ? (G.errorRequired || "Please fill this in.")
        : (G.errorInvalid || "Please check this.");
      err.classList.add("is-on");
    };
    if (!known) {
      fieldWrap = el("div", "gate__field audit-times__field");
      const labelEl = doc.createElement("label");
      labelEl.appendChild(el("span", "gate__lab", B.mobileLabel || "Mobile"));
      mobile = doc.createElement("input");
      mobile.id = "la-book-mobile";
      mobile.name = "mobile";
      mobile.type = "tel";
      mobile.required = true;
      mobile.setAttribute("autocomplete", "tel");
      mobile.setAttribute("inputmode", "tel");
      mobile.setAttribute("pattern", MOBILE_PATTERN);
      mobile.setAttribute("aria-describedby", "la-book-mobile-err");
      labelEl.appendChild(mobile);
      if (B.mobileWhy) labelEl.appendChild(el("span", "gate__why", B.mobileWhy));
      const err = el("span", "gate__err");
      err.id = "la-book-mobile-err";
      fieldWrap.append(labelEl, err);
      row.appendChild(fieldWrap);

      mobile.addEventListener("input", () => { if (mobile.checkValidity()) clearMobile(); });
      mobile.addEventListener("blur", () => {
        if (mobile.checkValidity()) { clearMobile(); return; }
        /* An empty field they have not typed in yet has not been got WRONG, it has
           not been filled in yet. Shouting at it the moment focus leaves (which
           this row's own "go and pick a time" focus move does) is an error message
           for something the visitor was never given the chance to do. The submit
           still says it, out loud, at the moment it actually matters. */
        if (String(mobile.value || "").trim()) markMobile();
      });
    }

    const label = el("span", "chip-row__label audit-times__label", T.timesLabel || "");
    row.appendChild(label);

    const chips = el("div", "chip-row__chips");
    chips.setAttribute("role", "group");
    if (label.textContent) {
      label.id = "audit-times-label";
      chips.setAttribute("aria-labelledby", label.id);
    }
    row.appendChild(chips);

    /* The submit is NEVER disabled. A disabled button on a phone is a dead tap
       that explains nothing: the visitor cannot tell a broken page from a rule
       they have not met. So the button always answers, and when nothing is
       picked it says so here and sends the thumb to the chips. */
    const chipErr = el("span", "gate__err audit-times__err");
    chipErr.id = "audit-times-err";
    chips.setAttribute("aria-describedby", chipErr.id);
    row.appendChild(chipErr);
    const clearChips = () => {
      chipErr.textContent = "";
      chipErr.classList.remove("is-on");
    };

    const foot = el("div", "audit-times__foot");
    const btn = el("button", "btn btn--ghost audit-times__btn", T.timesButton || "");
    btn.type = "button";
    foot.append(btn, el("p", "audit-times__note", T.timesNote || ""));
    row.appendChild(foot);

    /* Lives in the DOM from the start, empty and hidden by CSS: a live region
       announces nothing if it is inserted already carrying its text. */
    const msg = el("p", "audit-times__ok");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    row.appendChild(msg);

    const picked = () =>
      Array.prototype.slice.call(chips.querySelectorAll(".chip-toggle.is-on"))
        .map((c) => c.textContent);

    (T.times || []).forEach((t) => {
      const c = el("button", "chip-toggle", t);
      c.type = "button";
      c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", () => {
        const on = c.classList.toggle("is-on");
        c.setAttribute("aria-pressed", on ? "true" : "false");
        if (picked().length) clearChips();
      });
      chips.appendChild(c);
    });

    const drop = () => { if (row.parentNode) row.parentNode.removeChild(row); };

    btn.addEventListener("click", () => {
      const times = picked();
      if (!times.length) {
        chipErr.textContent = T.timesRequired || "Pick a time that suits.";
        chipErr.classList.add("is-on");
        const firstChip = chips.querySelector(".chip-toggle");
        if (firstChip) {
          try { firstChip.focus({ preventScroll: true }); } catch (e) { firstChip.focus(); }
        }
        return;
      }
      clearChips();
      /* A missing mobile is not a failure of ours, so it is the one thing this
         row does say out loud. Everything else stays silent. On the normal path
         there is no field to miss: it came in on the conversion card. */
      if (mobile && !mobile.checkValidity()) {
        markMobile();
        try { mobile.focus({ preventScroll: true }); } catch (e) { mobile.focus(); }
        return;
      }
      clearMobile();
      const number = known || String((mobile && mobile.value) || "").trim();
      btn.disabled = true;
      fetch("/api/public/leak-audit/times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, times: times, mobile: number }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((out) => {
          if (!out || !out.success) { drop(); return; }
          mark("time_tapped");
          /* the one Meta event that says a call was asked for, no parameters
             beyond the page name: never the time, never the number */
          pixel("Schedule", { content_name: "leak-audit" });
          /* the number is echoed back in the confirmation, so it is kept for
             the reload that lands straight on the booked state */
          state.mobile = number;
          state.book = "done";
          save();
          row.classList.add("is-done");
          [fieldWrap, label, chips, chipErr, foot].forEach((n) => {
            if (n && n.parentNode) n.parentNode.removeChild(n);
          });
          msg.textContent = fill(T.timesSuccess || "", { mobile: state.mobile });
        })
        .catch(drop);
    });

    return row;
  }

  /* ===========================================================================
     7b. THE LAST NINE TAPS
     The map is open and two of the five leaks are priced. These nine price the
     other three, in place, without leaving the screen and without asking for
     anything else. Nobody has to do them: the fifteen minutes does the same
     job, which is what keeps "no call required" true in both directions.
     ========================================================================= */
  /* The line that heads the finish run. Eight taps rather than nine once the
     trade has already been tapped under the receipt: a promise about how long
     this takes has to survive the visitor counting. */
  const finishIntroText = () => {
    const T = A.thanks || {};
    return (state.tradeTap && T.finishIntroShort) || T.finishIntro || "";
  };

  function startFinish() {
    mark("finish_start");
    state.phase = "finish";
    state.screen = "q";
    state.step = 0;
    state.busy = false;
    save();
    mountPanel(finishIntroText());
    scrollToStage();
  }

  function completeFinish() {
    state.screen = "done";
    save();
    /* every key is in now, so the full mirror is the honest local answer and
       the server's rescore replaces it the moment it lands */
    state.mirror = scoreMirror(state.answers);

    const done = () => {
      renderMap(state.mirror, {});
      mark("finish_done");
      finishFlash();
      scrollToStage();
    };
    if (!state.token) { done(); return; }

    const answers = {};
    applicable(true).forEach((q) => {
      if (state.answers[q.key]) answers[q.key] = state.answers[q.key];
    });
    const body = { token: state.token, answers: answers };
    if (state.answers.trade) body.trade = state.answers.trade;

    fetch("/api/public/leak-audit/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((out) => {
        if (out && out.success && out.scores && out.scores.channels) state.mirror = out.scores;
      })
      .catch(() => { /* the local full map is already correct; say nothing */ })
      .then(done);
  }

  function finishFlash() {
    const T = A.thanks || {};
    if (!mapRefs) return;
    clearJump();
    const flash = el("section", "audit-flash");
    flash.tabIndex = -1;
    flash.appendChild(el("b", "audit-flash__title", T.finishDone || ""));
    const actions = el("div", "audit-flash__actions");
    if (state.token) {
      const slot = el("div", "audit-pdf");
      actions.appendChild(slot);
      pollPdf(state.token, slot, state.email);
    }
    flash.appendChild(actions);
    /* Whichever step they were on, minus the second choice: there is nothing
       left to finish. Somebody who finished the nine taps WITHOUT giving their
       details still has not been asked, so they get the conversion card; the
       rest land back on their booking. */
    const next = state.token ? buildCalendar(state.token, T)
                             : buildConvert(state.mirror, { onFinish: null });
    const ending = [flash, next];
    if (T.scarcity) ending.push(el("p", "audit-flash__scarcity", T.scarcity));
    mapRefs.flashSlot.replaceChildren.apply(mapRefs.flashSlot, ending);
    try { flash.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
  }

  /* The engine renders the PDF after the POST returns, so the thank-you screen
     shows a live progress state and polls until the file exists. Contract:
     GET /api/public/leak-audit/pdf/<token> answers 202 {"status":"pending"}
     while it is still rendering, 202 {"status":"failed"} if it gave up, and
     200 with the PDF itself once it is ready. Every exit is honest: the button
     only ever appears once the file is genuinely downloadable, and a timeout
     falls back to the email line rather than leaving a dead button. */
  function pollPdf(token, slot, email) {
    const T = A.thanks || {};
    const url = "/api/public/leak-audit/pdf/" + encodeURIComponent(token);
    const EVERY = 3000, MAX = 40;              // 40 x 3s is a touch under 2 min
    let tries = 0, stopped = false;

    /* One quiet line, no spinner. A spinner on a page that has already given
       them everything reads as something still going wrong; the copy is on its
       way and that is the whole of what there is to say. The polling carries on
       underneath it exactly as before, and swaps this for the download button
       the moment the file is genuinely there. */
    const prep = el("p", "audit-pdf__prep");
    prep.setAttribute("role", "status");
    prep.setAttribute("aria-live", "polite");
    prep.textContent = fill(T.pdfPreparing || "", { email: email || "your inbox" });
    slot.replaceChildren(prep);

    const giveUp = () => {
      stopped = true;
      slot.replaceChildren(el("p", "audit-pdf__fail", T.pdfFailed || ""));
    };
    const ready = () => {
      stopped = true;
      const link = doc.createElement("a");
      link.className = "btn btn--ghost btn--lg audit-pdf__btn";
      link.href = url;
      link.setAttribute("download", "Your-Leak-Map.pdf");
      link.textContent = T.pdfReady || "Download your Leak Map (PDF)";
      slot.replaceChildren(link);
    };
    const again = () => { if (!stopped) window.setTimeout(tick, EVERY); };

    const tick = () => {
      if (stopped) return;
      if (++tries > MAX) { giveUp(); return; }
      fetch(url, { headers: { Accept: "application/pdf, application/json" } })
        .then((res) => {
          if (res.status === 200) {
            // the file is there; let the browser fetch it again on click rather
            // than holding a copy in memory we may never use
            try { if (res.body && res.body.cancel) res.body.cancel(); } catch (e) {}
            ready();
            return;
          }
          if (res.status === 404) { giveUp(); return; }
          return res.json()
            .then((j) => { if (j && j.status === "failed") giveUp(); else again(); })
            .catch(again);
        })
        .catch(again);          // a blip in the network is not a dead PDF
    };
    window.setTimeout(tick, 800);
  }

  /* ===========================================================================
     8. ENTRY POINT (called by script.js boot())
     ========================================================================= */
  /* utm_source / utm_medium / utm_campaign / utm_content, trimmed and capped.
     No cookies, no localStorage: read once at boot, held in memory, sent once
     with the form. Returns null when the visitor did not arrive from an ad. */
  function readUtm() {
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
    let out = null;
    try {
      const params = new URLSearchParams(window.location.search);
      keys.forEach((k) => {
        const v = String(params.get(k) || "").trim().slice(0, 100);
        if (v) { out = out || {}; out[k] = v; }
      });
    } catch (err) { /* no URLSearchParams: attribution is optional, carry on */ }
    return out;
  }

  /* Message match. For a visitor who arrived from a known ad, the NAME line
     becomes that ad's hook (A.chrome.hooks, keyed by utm_campaign). Only the
     name moves: the promise and the micro line under it are true whichever ad
     sent them, so they stay exactly where they are. Nothing is added above
     question one, and an unknown or absent campaign changes nothing at all. */
  /* The inline script in audit.html normally gets here first (the hook has to
     be on the page at first paint, not 260KB later) and leaves data-hooked
     behind. This is the fallback for a load where it did not run, off the same
     table: content.js reads it back from window.AUDIT_HOOKS. */
  function applyHook() {
    const hooks = A && A.chrome && A.chrome.hooks;
    const camp = state.utm && state.utm.utm_campaign;
    const hook = hooks && camp && hooks[camp];
    /* Only a string from the table is a hook: a campaign named "constructor"
       or "toString" finds something up the prototype chain instead. */
    if (typeof hook !== "string" || !hook) return;
    const line = doc.querySelector(".audit-trust__line");
    if (!line || line.dataset.hooked) return;
    line.textContent = hook;
    line.classList.add("audit-trust__line--hook");
    line.dataset.hooked = "1";
  }

  /* Mount the stepper on the stage and paint whichever question we are up to.
     `intro` is the one line that heads the finish run, and nothing else. */
  function mountPanel(intro) {
    stage.replaceChildren(buildPanel());
    if (intro) panel.insertBefore(el("p", "audit-intro", intro), qBox);
    const list = applicable();
    if (!list.length) return;
    const i = Math.min(Math.max(0, state.step), list.length - 1);
    state.step = i;
    renderRail();
    swapQuestion(buildQuestion(list[i], i, list));
    if (state.phase === "pre") updateCounter();
  }

  /* ---- The tap that landed before this file did -------------------------
     Question one is static in audit.html so it paints with the document, which
     means it can be tapped while these 260KB are still on the wire. The inline
     script there records the pick on the group; we read it BEFORE mountPanel()
     replaces that markup, then replay it through choose() so the answer, the
     two milestones and the advance to question two are exactly the ones a
     normal tap produces. A tap we dropped would be the whole cost of the page. */
  function readEarlyPick() {
    const g = doc.querySelector("[data-audit-static] .audit-opts[data-early-pick]");
    return g ? g.getAttribute("data-early-pick") : "";
  }
  function replayEarlyPick(key) {
    if (!key || state.screen !== "q" || state.phase !== "pre" || state.step !== 0) return;
    const q = applicable()[0];
    if (!q) return;
    /* The tap WINS, even over an answer a resumed tab already holds. The
       button went blue under their thumb: quietly restoring the old answer
       would leave what is painted and what is stored telling two different
       stories, and the one the visitor believes is the one they just did.
       choose() overwrites, so a re-tap of the same option simply advances.
       mark() is once per pageload, so no milestone is sent twice. */
    const opts = q.options || [];
    let i = -1;
    for (let n = 0; n < opts.length; n++) if (opts[n].key === key) i = n;
    if (i < 0) return;                           // not an option of question one
    const group = qBox && qBox.querySelector(".audit-opts");
    const btn = group && group.children[i];
    if (!group || !btn) return;
    choose(q, opts[i], btn, group);
  }

  const haveSeven = () => PRE_GATE_KEYS.every((k) => !!state.answers[k]);

  /* Back where they left off. A same-tab trip to index.html, a Meta in-app
     reload or an accidental back swipe all land here, and none of them is
     allowed to cost the visitor a single tap. */
  function resume() {
    const s = state.screen;
    /* "gate" and "reveal" are screens this build no longer has. A tab left
       open across either change still carries one, and the honest landing for
       both is the result: the number is built and the map is theirs.
       "unlocked" is the old name for the screen after a successful send, so it
       lands on the booking, which is where that visitor was. */
    if ((s === "results" || s === "gate" || s === "reveal") && haveSeven()) { toResults(); return; }
    if ((s === "calendar" || s === "unlocked" || s === "done") && haveSeven()) {
      const full = QS().every((q) => state.answers[q.key] ||
        (q.skipWhen && state.answers[q.skipWhen.key] === q.skipWhen.value));
      state.mirror = full ? scoreMirror(state.answers) : partialScores(state.answers);
      renderMap(state.mirror, {});
      if (s === "done") finishFlash();
      else showCalendar("", null, state.token ? { token: state.token } : null);
      return;
    }
    state.screen = "q";
    mountPanel(state.phase === "finish" ? finishIntroText() : null);
  }

  window.PAGE_INIT = function (ctx) {
    if (!A) return;
    REDUCED = !!(ctx && ctx.REDUCED);
    state.utm = readUtm();
    applyHook();
    QS().forEach((q) => { QMAP[q.key] = q; });

    /* the honesty block below the instrument */
    const metaMount = doc.querySelector("[data-audit-meta]");
    if (metaMount && Array.isArray(A.meta)) {
      metaMount.replaceChildren();
      A.meta.forEach((m) => metaMount.appendChild(el("li", null, m)));
    }

    /* methodology list (always visible, never gated) */
    const methodMount = doc.querySelector("[data-audit-method]");
    if (methodMount && A.method && Array.isArray(A.method.points)) {
      A.method.points.forEach((p) => methodMount.appendChild(el("li", null, p)));
    }

    stage = doc.querySelector("[data-audit-stage]");
    if (!stage) return;
    const early = readEarlyPick();     // read while the static markup is still up

    const saved = readStore();
    if (saved) {
      state.answers = saved.answers || {};
      state.phase = saved.phase === "finish" ? "finish" : "pre";
      state.step = typeof saved.step === "number" ? saved.step : 0;
      state.token = typeof saved.token === "string" ? saved.token : "";
      state.screen = typeof saved.screen === "string" ? saved.screen : "q";
      state.book = (saved.book === "open" || saved.book === "done") ? saved.book : "";
      state.mobile = typeof saved.mobile === "string" ? saved.mobile.slice(0, 24) : "";
      /* Only ever true alongside a trade that survived readStore's enum check,
         so a restored tab can never skip the trade question without holding
         the answer to it. */
      state.tradeTap = saved.tradeTap === true && !!state.answers.trade;
      prune();
    }
    resume();
    /* Everything above this line is the first paint, so a crash before it is
       reported as phase "load" and everything after is "idle" or "tap". */
    painted = true;
    /* the denominator this funnel has never had: somebody was here, and the
       instrument painted in front of them */
    mark("land");
    /* and the two proofs behind it: the first option really painted in front
       of them, and they stayed with it */
    watchSeen();
    watchDwell();
    /* LAST, and deliberately so. An early tap sends `start`, and a `start`
       that beats its own `land` onto the wire is a funnel with more starts
       than landings. The question one option is still on screen at this
       point (choose() holds it for a beat), so `seen` still observes the
       option that was actually tapped. */
    replayEarlyPick(early);
  };

  /* QA ONLY. The mirror is handed out when the page is opened with
     ?mirror=check, so tools/qa-audit-mirror.py can reproduce the three worked
     examples in PARTIAL-CONTRACT.md inside a real browser. On every normal
     load nothing is exposed at all. */
  try {
    if (/(^|[?&])mirror=check(&|$)/.test(window.location.search)) {
      window.LEAK_AUDIT_MIRROR = {
        scoreAuditPartial: scoreAuditPartial,
        validateAnswersPartial: validateAnswersPartial,
        scoreMirror: scoreMirror,
      };
    }
  } catch (e) { /* no window.location: nothing to expose */ }
})();
