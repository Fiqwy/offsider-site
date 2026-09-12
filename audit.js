/* =============================================================================
   audit.js — the free Leak Audit page module (audit.html only).

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
      return {
        key: k,
        label: cfg.label || k,
        status: statuses[k],
        annual_low:  noDollars ? null : roundMoney(mids[k] * K.RANGE_LOW),
        annual_high: noDollars ? null : roundMoney(mids[k] * K.RANGE_HIGH),
        worker: cfg.worker || { name: "", role: "" },
        note: note,
        echo: buildEcho(k, a, estimates[k]),
        estimated: estimates[k],
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
    const slots = ["1–2", "3–6", "7–12"];
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
    screen: "q",          // q | reveal | gate | unlocked | finish | done
    phase: "pre",         // pre = the seven in front of the gate, finish = the nine
    step: 0,              // index into the CURRENTLY applicable question list
    answers: {},          // raw enum keys; skipped questions are deleted, not blanked
    mirror: null,
    shown: { low: 0, high: 0 },   // what the counter is currently displaying
    token: "",            // the download token, once the gate has been accepted
    email: "",
    utm: null,            // read once from the query string, never stored
    busy: false,
  };
  let stage = null, panel = null, qBox = null, meter = null, meterLow = null, meterHigh = null;
  let progText = null, progFill = null, backBtn = null;
  let counterRaf = 0;

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
               .filter((q) => !(q.skipWhen && a[q.skipWhen.key] === q.skipWhen.value));
  }
  /* A skipped question's answer must not survive: the API treats its absence
     as meaningful, so a stale value would be a lie about what they told us. */
  function prune() {
    const live = {};
    applicable(false).forEach((q) => { live[q.key] = true; });
    applicable(true).forEach((q) => { live[q.key] = true; });
    QS().forEach((q) => { if (!live[q.key]) delete state.answers[q.key]; });
  }

  /* ---- Progress safety net ------------------------------------------------
     The gate offers two links out to the rest of the site, and a Meta in-app
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
    const meterFig = el("p", "audit-meter__fig");
    meterFig.setAttribute("role", "status");
    meterFig.setAttribute("aria-live", "polite");
    meterLow = el("span", "num", money(0));
    meterHigh = el("span", "num", money(0));
    meterFig.append(meterLow, el("span", "sep", (A.result && A.result.rangeSep) || "–"), meterHigh);
    meterBox.appendChild(meterFig);
    meterBox.appendChild(el("span", "audit-meter__sub", (A.counter && A.counter.sub) || ""));
    meterClip.appendChild(meterBox);
    meter.appendChild(meterClip);

    /* --- the question --- */
    qBox = el("div", "audit-q");

    panel.append(rail, meter, qBox);
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

  /* ---- Meta Pixel events (no personal data, ever) -----------------------
     Two events, at the same two milestones the first-party beacon marks: the
     audit starting, and a gate submission the API actually accepted. Both are
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
    const wait = REDUCED ? 0 : (last && state.phase === "pre" ? 700 : 190);
    state.busy = true;
    window.setTimeout(() => {
      state.busy = false;
      if (!last) { goTo(next); return; }
      if (state.phase === "finish") completeFinish();
      else toReveal();
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

  function updateCounter() {
    const a = state.answers;
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
  /* SCREEN 8. Their number, on its own screen, with nothing asked of them.
     Every ad says "you see the number before we ask your name", so this screen
     exists on its own and must never be merged into the gate. */
  function toReveal() {
    state.screen = "reveal";
    state.mirror = partialScores(state.answers);
    save();
    renderReveal(state.mirror);
    mark("headline");
    scrollToStage();
  }

  function renderReveal(scores) {
    const V = A.reveal || {};
    const root = el("section", "audit-reveal");
    root.tabIndex = -1;
    root.appendChild(el("span", "lbl audit-reveal__kicker", V.kicker || ""));

    const big = el("p", "audit-reveal__fig");
    rangeInto(big, scores.total.annual_low, scores.total.annual_high,
              (A.result && A.result.rangeSep) || " to ");
    big.appendChild(el("span", "audit-reveal__per", " " + (V.perYear || "")));
    root.appendChild(big);

    if (V.lead) root.appendChild(el("p", "audit-reveal__lead", V.lead));
    if (V.weekly) root.appendChild(el("p", "audit-reveal__weekly",
      fill(V.weekly, { weekly: money(scores.total.weekly_mid) })));
    if (V.disclaimer) root.appendChild(el("p", "audit-reveal__fine", V.disclaimer));
    if (V.honesty) root.appendChild(el("p", "audit-reveal__honesty", V.honesty));

    const btn = el("button", "btn btn--primary btn--xl audit-reveal__btn", V.button || "");
    btn.type = "button";
    btn.addEventListener("click", toGate);
    root.appendChild(btn);
    if (V.note) root.appendChild(el("p", "audit-reveal__note", V.note));

    stage.replaceChildren(root);
    try { root.focus({ preventScroll: true }); } catch (e) { /* older Safari */ }
  }

  function toGate() {
    state.screen = "gate";
    state.mirror = state.mirror || partialScores(state.answers);
    save();
    renderMap(state.mirror, { locked: true });
    scrollToStage();
  }

  /* The sticky chrome is the fixed bar plus the trust strip pinned under it, and it is
     not one fixed height: the trust line wraps to two lines on a narrow iPhone, and
     WebKit lays the bar out taller than Blink does. A hard 84px was short on both, so
     the map's "The Leak Map" kicker came to rest half under the strip on the reveal and
     the gate. Measure it at scroll time instead, and keep 84 only for the case where
     neither element is on the page. */
  function chromeHeight() {
    const bar = document.querySelector(".nav");
    const strip = document.querySelector(".audit-trust");
    if (!bar || !strip) return 84;
    return bar.getBoundingClientRect().height +
           strip.getBoundingClientRect().height + 12;
  }

  function scrollToStage() {
    if (!stage) return;
    const y = stage.getBoundingClientRect().top + window.scrollY - chromeHeight();
    try { window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? "auto" : "smooth" }); }
    catch (err) { window.scrollTo(0, Math.max(0, y)); }
  }

  let mapRefs = null;   // { root, body, gate, flashSlot }

  function renderMap(scores, opts) {
    const R = A.result || {};
    const root = el("article", "leakmap");

    /* ---- masthead: this is a document, and it is yours ---- */
    const head = el("header", "leakmap__head");
    head.appendChild(el("span", "lbl leakmap__kicker", R.kicker || "The Leak Map"));
    head.appendChild(el("span", "leakmap__doc", R.docLabel || ""));
    head.appendChild(el("span", "leakmap__keep", R.keep || ""));
    root.appendChild(head);

    /* ---- the sting: shown immediately, never blurred ---- */
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

    /* ---- slot the thank-you / error line drops into ---- */
    const flashSlot = el("div", "leakmap__flash");
    root.appendChild(flashSlot);

    /* ---- the gated breakdown ---- */
    const lockwrap = el("div", "leakmap__lockwrap");
    const body = el("div", "leakmap__body");

    body.appendChild(sectionTitle(R.channelsTitle));
    const rows = el("div", "leak-rows");
    const figs = scores.channels.map((c) => (c.annual_high == null ? 0 : c.annual_high));
    const maxFig = Math.max.apply(null, figs.concat([1]));
    scores.channels.forEach((c) => rows.appendChild(buildRow(c, maxFig, R)));
    body.appendChild(rows);

    body.appendChild(buildStart(scores, R));
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

    mapRefs = { root: root, body: body, lockwrap: lockwrap, flashSlot: flashSlot };

    let gate = null;
    if (opts.locked) {
      lock(true);
      gate = buildGate();
      lockwrap.appendChild(gate);
      mark("gate");
    }

    stage.replaceChildren(root);
    animateBars();
    if (gate) fitWell(lockwrap, body, gate);
  }

  function sectionTitle(text) {
    const h = el("h2", "leakmap__h", text || "");
    return h;
  }

  function buildRow(c, maxFig, R) {
    const row = el("div", "leak-row");
    row.dataset.status = c.status || "none";
    if (c.not_priced) row.classList.add("is-unpriced");

    const head = el("div", "leak-row__head");
    const name = el("b", "leak-row__name", c.label);
    const pills = el("span", "leak-row__pills");
    /* estimated: this channel rode on our assumption, not their number. Say so
       plainly rather than letting the figure pass as something they told us. */
    if (c.estimated && R.estimatedTag) pills.appendChild(el("span", "leak-row__est", R.estimatedTag));
    /* a channel the pre-gate seven could not reach says exactly that, in place
       of a status word it has not earned */
    pills.appendChild(c.not_priced
      ? el("span", "leak-row__pill leak-row__pill--none", R.notPricedLabel || "Not priced yet")
      : el("span", "leak-row__pill", (R.statusLabels && R.statusLabels[c.status]) || c.status));
    head.append(name, pills);
    row.appendChild(head);

    const worker = el("p", "leak-row__worker");
    worker.append(
      el("span", "leak-row__wname", c.worker.name || ""),
      doc.createTextNode(c.worker.role ? " · " + c.worker.role : "")
    );
    row.appendChild(worker);

    const track = el("div", "leak-row__track");
    track.setAttribute("aria-hidden", "true");
    const fill_ = el("i", null);
    /* "Priced" means there is a real figure worth showing. A channel can be
       null (reviews always, dormant on a long-cycle trade) or a genuine ZERO
       (no list to work yet, or they do not quote at all, both of which the
       contract sends as 0 rather than null). Printing "$0 - $0 a year" reads as
       a broken card, so zero is treated as unpriced everywhere below. */
    const priced = c.annual_high != null && c.annual_high > 0;
    const pct = !priced
      ? (c.not_priced ? 0 : ({ critical: 85, high: 70, medium: 45, ok: 12 })[c.status] || 12)
      : Math.max(6, Math.round((c.annual_high / maxFig) * 100));
    fill_.dataset.w = pct + "%";
    track.appendChild(fill_);
    row.appendChild(track);

    if (!priced && c.key !== "reviews") {
      /* A dormant channel with no dollars carries its honesty in its own note
         (long-cycle, or no list yet), so nothing extra is printed here. */
    } else if (!priced) {
      /* The no-dollar honesty line is a rail, so it always appears once. The
         server's own reviews note now ends with the same sentence, and
         printing both put it twice back to back at the payoff moment, so it is
         skipped when the note already carries it. The mirror's note never
         does, which keeps the pre-gate card exactly as it was. */
      const inNote = !!(c.note && c.note.indexOf("dollar figure") !== -1);
      if (!inNote && R.reviewsLine) row.appendChild(el("p", "leak-row__nofig", R.reviewsLine));
    } else {
      const fig = el("p", "leak-row__fig");
      rangeInto(fig, c.annual_low, c.annual_high, R.rangeSep);
      fig.appendChild(el("span", "leak-row__per", " " + (R.perYear || "")));
      row.appendChild(fig);
    }

    /* their own answers, quoted back, above our read of them. The label owns
       the "You told us:" lead-in, so strip the same words off the front of the
       server's echo string (mirror echoes never carry it) — otherwise the card
       reads "You told us: You told us you miss..." (same fix as the PDF). */
    if (c.echo) {
      let echoText = c.echo;
      const m = /^you told us[,:]?\s+/i.exec(echoText);
      if (m) echoText = echoText.charAt(m[0].length).toUpperCase() + echoText.slice(m[0].length + 1);
      const echo = el("p", "leak-row__echo");
      echo.append(el("span", "leak-row__echo-lead", (A.echo && A.echo.lead) || "You told us: "),
                  doc.createTextNode(echoText));
      row.appendChild(echo);
    }
    if (c.note) row.appendChild(el("p", "leak-row__note", c.note));
    /* No separate "this was estimated" sentence: the badge above and the echo
       (which is ALWAYS the honest no-idea version for an estimated channel,
       server-built or mirror-built) already say it, and saying it three times
       reads as nagging rather than as candour. */
    /* SERVER-ONLY: a sourced comparison of their answer against the published
       research, with the attribution inside the string. The mirror never
       generates one, so the pre-gate map simply omits the line. */
    if (c.benchmark) row.appendChild(el("p", "leak-row__bench", c.benchmark));

    /* SERVER-ONLY, and only on priced channels: one worked plain-english line
       from their inputs to the range. Kept behind a quiet disclosure so the
       card stays calm and the working is there for anyone who wants to check
       it. The mirror never builds one, so the pre-gate map has no maths at
       all. Same reveal mechanics as the FAQ on the home page. */
    if (c.maths) row.appendChild(buildMaths(c, R));
    return row;
  }

  function buildMaths(c, R) {
    /* Always open, styled like the PDF's ledger panel. Nicholas's call: the
       worked arithmetic IS the pain, so it never hides behind a tap. */
    const wrap = el("aside", "leak-maths");
    wrap.appendChild(el("span", "leak-maths__label", R.mathsLabel || "The maths"));
    wrap.appendChild(el("p", "leak-maths__text", c.maths));
    return wrap;
  }

  function buildStart(scores, R) {
    const box = el("section", "startbox");
    const seal = el("div", "startbox__seal");
    seal.setAttribute("aria-hidden", "true");
    seal.appendChild(el("b", null, (scores.start_here.worker.name || "?").charAt(0)));
    seal.appendChild(el("span", null, "first"));

    const bodyCol = el("div", "startbox__body");
    bodyCol.appendChild(el("span", "startbox__badge", R.startTitle || "Start here"));
    const who = el("p", "startbox__who");
    who.append(
      el("span", "startbox__wname", scores.start_here.worker.name || ""),
      doc.createTextNode(scores.start_here.worker.role ? " · " + scores.start_here.worker.role : "")
    );
    bodyCol.appendChild(who);
    bodyCol.appendChild(el("p", "startbox__line", scores.start_here.line || ""));

    box.append(seal, bodyCol);
    return box;
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

  /* The blurred well has a floor in CSS, but the card that sits in it grows
     with the questions asked: picking "Something else" for the trade adds a
     second optional field, and on a phone that pushed the card past the well
     so it overhung the blur. Measure the real card once it is in the document
     and grow the well to suit, rather than guessing a pixel height that a
     future field would quietly break again. */
  function fitWell(lockwrap, body, gate) {
    requestAnimationFrame(() => {
      const card = gate.querySelector(".gate__card");
      if (!card) return;
      const need = card.offsetHeight + 96;        // breathing room above and below
      if (need > lockwrap.offsetHeight) {
        lockwrap.style.minHeight = need + "px";
        body.style.maxHeight = need + "px";
      }
    });
  }

  function lock(on) {
    if (!mapRefs) return;
    mapRefs.body.classList.toggle("is-locked", !!on);
    mapRefs.lockwrap.classList.toggle("is-locked", !!on);
    if (on) {
      mapRefs.body.setAttribute("aria-hidden", "true");
      mapRefs.body.setAttribute("inert", "");
    } else {
      mapRefs.body.removeAttribute("aria-hidden");
      mapRefs.body.removeAttribute("inert");
      // drop the measured well so the open map is not capped at the card's height
      mapRefs.lockwrap.style.minHeight = "";
      mapRefs.body.style.maxHeight = "";
    }
  }

  /* ===========================================================================
     7. THE GATE
     ========================================================================= */
  function buildGate() {
    const G = A.gate || {};
    const wrap = el("div", "leakmap__gate");
    const card = el("div", "gate__card");

    card.appendChild(el("span", "gate__kicker", G.kicker || ""));
    card.appendChild(el("b", "gate__title", G.title || ""));
    card.appendChild(el("p", "gate__sub", G.sub || ""));

    if (Array.isArray(G.bullets) && G.bullets.length) {
      const ul = el("ul", "check-list gate__list");
      G.bullets.forEach((b) => ul.appendChild(el("li", null, b)));
      card.appendChild(ul);
    }

    const form = el("form", "gate__form");
    form.noValidate = true;

    const fields = [];
    const addField = (name, label, attrs, optional) => {
      const wrapF = el("div", "gate__field" + (optional ? " gate__field--soft" : ""));
      const lab = doc.createElement("label");
      lab.appendChild(el("span", "gate__lab", label));
      const inp = doc.createElement("input");
      inp.id = "la-" + name;
      inp.name = name;
      Object.keys(attrs).forEach((k) => inp.setAttribute(k, attrs[k]));
      if (!optional) inp.required = true;
      inp.setAttribute("aria-describedby", "la-" + name + "-err");
      lab.appendChild(inp);
      const why = (G.reasons || {})[name];
      if (why) lab.appendChild(el("span", "gate__why", why));
      const err = el("span", "gate__err");
      err.id = "la-" + name + "-err";
      wrapF.append(lab, err);
      form.appendChild(wrapF);
      fields.push(inp);
      return inp;
    };

    /* Three fields, in this order, each carrying the reason it is asked. The
       optional business name and the free-text trade are gone: four fields
       read as more work than three, and the trading name is captured on the
       call or on the last nine taps. */
    const F_ = G.fields || {};
    addField("name",   F_.name   || "Your name", { type: "text", autocomplete: "name" });
    addField("mobile", F_.mobile || "Mobile",    { type: "tel", autocomplete: "tel", inputmode: "tel" });
    addField("email",  F_.email  || "Email",     { type: "email", autocomplete: "email", inputmode: "email" });

    /* honeypot: humans never see it, bots fill it, the server pretends success */
    const hp = doc.createElement("input");
    hp.type = "text";
    hp.name = "website";
    hp.className = "booking__hp";
    hp.tabIndex = -1;
    hp.setAttribute("aria-hidden", "true");
    hp.setAttribute("autocomplete", "off");
    form.appendChild(hp);

    const btn = el("button", "btn btn--primary btn--lg gate__btn", G.button || "Unlock");
    btn.type = "submit";
    form.appendChild(btn);
    /* In this order: what they keep either way, what actually happens to the
       mobile number, and the two ways to check us out first. */
    if (G.note) form.appendChild(el("p", "gate__note", G.note));
    if (G.privacy) form.appendChild(el("p", "gate__note gate__note--privacy", G.privacy));
    if (G.site && G.site.text) {
      const site = el("p", "gate__site", G.site.text + " ");
      (G.site.links || []).forEach((l, i) => {
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
      if (inp.validity.valueMissing) return G.errorRequired || "Please fill this in.";
      if (inp.type === "email") return G.errorEmail || "Please enter a valid email address.";
      return G.errorInvalid || "Please check this.";
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
      /* the single most useful number in the funnel: saw the gate, versus
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

    card.appendChild(form);
    wrap.appendChild(card);
    return wrap;
  }

  function submit(form, btn, msg) {
    const G = A.gate || {};
    btn.disabled = true;
    btn.textContent = G.sending || "Sending...";
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
      email: val("email"),
      phone: val("mobile"),
      website: val("website"),        // honeypot, empty for humans
      answers: answers,
      partial: true,
    };
    /* trade is asked on the last of the nine, so pre-gate there is none. The
       engine defaults it to "other", and it moves only a channel the partial
       path does not price. */
    if (a.trade) payload.trade = a.trade;
    /* Campaign attribution for the paid traffic. Read from the URL on load,
       never from a cookie or storage, and omitted entirely when absent. */
    if (state.utm) payload.utm = state.utm;

    mark("submitted");
    state.email = payload.email;
    fetch("/api/public/leak-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((out) => {
        if (!out || !out.success) throw new Error("send failed");
        /* The server is the authority: its scores replace the mirror's. */
        if (out.scores && out.scores.channels) {
          state.mirror = out.scores;
        }
        state.token = (out.pdf && out.pdf.token) ? String(out.pdf.token) : "";
        state.screen = "unlocked";
        save();
        renderMap(state.mirror, { locked: false });
        mark("unlocked");
        pixel("Lead", { content_name: "leak-audit" });
        unlocked(payload.email, null, out.pdf);
      })
      .catch(() => {
        /* Never punish the visitor for our outage: show the whole map anyway. */
        state.screen = "unlocked";
        save();
        renderMap(state.mirror, { locked: false });
        unlocked(payload.email, A.sendError || "");
      });
  }

  /* The map is open. Confirm it, offer the call, and put focus where the news is. */
  function unlocked(email, errorLine, pdf) {
    const T = A.thanks || {};
    const flash = el("section", "audit-flash" + (errorLine ? " audit-flash--warn" : ""));
    flash.tabIndex = -1;
    flash.appendChild(el("b", "audit-flash__title", errorLine ? (A.sendErrorTitle || "") : (T.title || "")));
    if (errorLine) flash.appendChild(el("p", "audit-flash__body", errorLine));
    else if (email) flash.appendChild(el("p", "audit-flash__body", fill(T.body, { email: email })));
    if (errorLine) {
      const mail = doc.createElement("a");
      mail.className = "audit-flash__mail";
      mail.href = "mailto:" + (S.brand.email || "");
      mail.textContent = S.brand.email || "";
      flash.appendChild(mail);
    }
    /* THE FORK. Two of five leaks are priced, and the visitor picks how the
       other three get priced: nine more taps here, or fifteen minutes with us.
       Both are offered on BOTH paths, because a failed send is our problem and
       not a reason to drop somebody at a dead end. */
    const actions = el("div", "audit-flash__actions");
    if (T.forkTitle) flash.appendChild(el("b", "audit-fork__title", T.forkTitle));
    if (T.forkBody) flash.appendChild(el("p", "audit-fork__body", T.forkBody));
    const go = el("button", "btn btn--primary btn--lg audit-flash__cta", T.finishButton || "");
    go.type = "button";
    go.addEventListener("click", startFinish);
    actions.appendChild(go);
    if (!errorLine) {
      const slot = el("div", "audit-pdf");
      actions.appendChild(slot);
      // no token means the audit row never landed, so no PDF is coming either
      if (pdf && pdf.token) pollPdf(String(pdf.token), slot);
      else slot.appendChild(el("p", "audit-pdf__fail", T.pdfFailed || ""));
    } else {
      /* nothing landed on our side, so there is no row to book against: the
         only way through is the old-fashioned one */
      const cta = doc.createElement("a");
      cta.className = "btn btn--ghost btn--lg audit-flash__alt-cta";
      cta.href = "index.html#book";
      cta.textContent = T.cta || "Book your free call";
      actions.appendChild(cta);
    }
    flash.appendChild(actions);
    /* The optional booking nudge sits directly under the call row: for the
       visitor who wants the fifteen minutes but will not go and pick a slot,
       three taps is the whole ask. Gated on the SAME token the PDF is gated
       on, because the token IS the audit row: no token means there is nothing
       on our side to attach a preferred time to, so nothing is offered. Also
       never on the error path, where we have no row and no promise to keep. */
    if (!errorLine && pdf && pdf.token && Array.isArray(T.times) && T.times.length) {
      flash.appendChild(buildTimes(String(pdf.token), T));
    }
    if (errorLine && T.ctaNote) flash.appendChild(el("p", "audit-flash__note", T.ctaNote));
    /* the one real scarcity fact on this page, stated once, as a fact */
    if (T.scarcity) flash.appendChild(el("p", "audit-flash__scarcity", T.scarcity));
    if (mapRefs) {
      mapRefs.flashSlot.replaceChildren(flash);
      try { flash.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
    }
  }

  /* The preferred-call-time row. An OPTIONAL extra on a screen whose whole job
     is to feel like good news, which sets two rules it never breaks:

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
  function buildTimes(token, T) {
    const row = el("div", "audit-times chip-row");
    const label = el("span", "chip-row__label audit-times__label", T.timesLabel || "");
    row.appendChild(label);

    const chips = el("div", "chip-row__chips");
    chips.setAttribute("role", "group");
    if (label.textContent) {
      label.id = "audit-times-label";
      chips.setAttribute("aria-labelledby", label.id);
    }
    row.appendChild(chips);

    const foot = el("div", "audit-times__foot");
    const btn = el("button", "btn btn--ghost audit-times__btn", T.timesButton || "");
    btn.type = "button";
    btn.disabled = true;
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
        btn.disabled = picked().length === 0;
      });
      chips.appendChild(c);
    });

    const drop = () => { if (row.parentNode) row.parentNode.removeChild(row); };

    btn.addEventListener("click", () => {
      const times = picked();
      if (!times.length) return;
      btn.disabled = true;
      fetch("/api/public/leak-audit/times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, times: times }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((out) => {
          if (!out || !out.success) { drop(); return; }
          mark("time_tapped");
          row.classList.add("is-done");
          [label, chips, foot].forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
          msg.textContent = T.timesSuccess || "";
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
  function startFinish() {
    mark("finish_start");
    state.phase = "finish";
    state.screen = "q";
    state.step = 0;
    state.busy = false;
    save();
    mountPanel((A.thanks || {}).finishIntro);
    scrollToStage();
  }

  function completeFinish() {
    state.screen = "done";
    save();
    /* every key is in now, so the full mirror is the honest local answer and
       the server's rescore replaces it the moment it lands */
    state.mirror = scoreMirror(state.answers);

    const done = () => {
      renderMap(state.mirror, { locked: false });
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
    const flash = el("section", "audit-flash");
    flash.tabIndex = -1;
    flash.appendChild(el("b", "audit-flash__title", T.finishDone || ""));
    const actions = el("div", "audit-flash__actions");
    if (state.token) {
      const slot = el("div", "audit-pdf");
      actions.appendChild(slot);
      pollPdf(state.token, slot);
    }
    flash.appendChild(actions);
    if (state.token && Array.isArray(T.times) && T.times.length) {
      flash.appendChild(buildTimes(state.token, T));
    }
    if (T.scarcity) flash.appendChild(el("p", "audit-flash__scarcity", T.scarcity));
    mapRefs.flashSlot.replaceChildren(flash);
    try { flash.focus({ preventScroll: true }); } catch (err) { /* older Safari */ }
  }

  /* The engine renders the PDF after the POST returns, so the thank-you screen
     shows a live progress state and polls until the file exists. Contract:
     GET /api/public/leak-audit/pdf/<token> answers 202 {"status":"pending"}
     while it is still rendering, 202 {"status":"failed"} if it gave up, and
     200 with the PDF itself once it is ready. Every exit is honest: the button
     only ever appears once the file is genuinely downloadable, and a timeout
     falls back to the email line rather than leaving a dead button. */
  function pollPdf(token, slot) {
    const T = A.thanks || {};
    const url = "/api/public/leak-audit/pdf/" + encodeURIComponent(token);
    const EVERY = 3000, MAX = 40;              // 40 x 3s is a touch under 2 min
    let tries = 0, stopped = false;

    const prep = el("p", "audit-pdf__prep");
    prep.setAttribute("role", "status");
    prep.setAttribute("aria-live", "polite");
    const spin = el("span", "audit-pdf__spin");
    spin.setAttribute("aria-hidden", "true");
    prep.append(spin, doc.createTextNode(T.pdfPreparing || ""));
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

  const haveSeven = () => PRE_GATE_KEYS.every((k) => !!state.answers[k]);

  /* Back where they left off. A same-tab trip to index.html, a Meta in-app
     reload or an accidental back swipe all land here, and none of them is
     allowed to cost the visitor a single tap. */
  function resume() {
    const s = state.screen;
    if (s === "reveal" && haveSeven()) { toReveal(); return; }
    if (s === "gate" && haveSeven()) { toGate(); return; }
    if ((s === "unlocked" || s === "done") && haveSeven()) {
      const full = QS().every((q) => state.answers[q.key] ||
        (q.skipWhen && state.answers[q.skipWhen.key] === q.skipWhen.value));
      state.mirror = full ? scoreMirror(state.answers) : partialScores(state.answers);
      renderMap(state.mirror, { locked: false });
      if (s === "done") finishFlash();
      else unlocked("", null, state.token ? { token: state.token } : null);
      return;
    }
    state.screen = "q";
    mountPanel(state.phase === "finish" ? (A.thanks || {}).finishIntro : null);
  }

  window.PAGE_INIT = function (ctx) {
    if (!A) return;
    REDUCED = !!(ctx && ctx.REDUCED);
    state.utm = readUtm();
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

    const saved = readStore();
    if (saved) {
      state.answers = saved.answers || {};
      state.phase = saved.phase === "finish" ? "finish" : "pre";
      state.step = typeof saved.step === "number" ? saved.step : 0;
      state.token = typeof saved.token === "string" ? saved.token : "";
      state.screen = typeof saved.screen === "string" ? saved.screen : "q";
      prune();
    }
    resume();
    /* the denominator this funnel has never had: somebody was here, and the
       instrument painted in front of them */
    mark("land");
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
