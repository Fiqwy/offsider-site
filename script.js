/* =============================================================================
   Applied Intelligence — script.js
   Renders the page from window.SITE, then wires Lenis + GSAP with the
   mobile-smoothness rules (single ticker source, touch-gated normalize/pin).
   ========================================================================== */
(function () {
  "use strict";

  const S = window.SITE;
  const doc = document;
  const html = doc.documentElement;
  html.classList.add("js");

  const $  = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));

  const NO_HOVER = window.matchMedia("(hover: none)").matches;          // touch proxy
  const REDUCED  = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DESKTOP  = window.innerWidth >= 1025 && !NO_HOVER;

  /* ---- small helpers ----------------------------------------------------- */
  const ital = (str) => String(str).replace(/\{i:([^}]+)\}/g, '<em class="ital">$1</em>');
  const get  = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S);
  const el   = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-AU");

  /* ---- data binding ------------------------------------------------------ */
  function bind() {
    $$("[data-bind]").forEach((node) => {
      const v = get(node.getAttribute("data-bind"));
      if (v != null) node.textContent = Array.isArray(v) ? v.join(" ") : v;
    });
    $$("[data-bind-html]").forEach((node) => {
      let v = get(node.getAttribute("data-bind-html"));
      if (v == null) return;
      if (Array.isArray(v)) v = v.join("<br>");
      node.innerHTML = ital(v);
    });
    // footer / booking mailto uses the brand email
    const email = S.brand.email;
    const fe = $("[data-footer-email]"); if (fe) { fe.textContent = email; fe.href = "mailto:" + email; }
    const bl = $("[data-book-link]"); if (bl) bl.href = "mailto:" + email + "?subject=Free%20Leak%20Audit";
    doc.title = S.brand.name + ": The Never Miss System | Done-for-you AI staff for Australian businesses";
  }

  /* ---- booking section (calendar embed or interim card) ------------------ */
  function renderBooking() {
    const pts = $("[data-booking-points]");
    if (pts && S.booking) {
      S.booking.points.forEach((p) => pts.appendChild(el("li", "booking__point",
        `<b>${p.title}</b><span>${p.text}</span>`)));
    }
    const cal = $("[data-booking-cal]");
    if (!cal) return;
    const url = (S.brand.bookingUrl || "").trim();
    const isCalendar = /^https:\/\//.test(url);

    if (!isCalendar) {
      // interim card: keeps the section converting until the calendar link exists
      const ph = (S.booking && S.booking.placeholder) || {};
      cal.innerHTML =
        `<div class="booking__ph">
           <b>${ph.title || "Pick a time that suits you"}</b>
           <p>${ph.text || ""}</p>
           <a class="btn btn--primary btn--lg" href="mailto:${S.brand.email}?subject=Free%20Leak%20Audit">${S.cta.primary}</a>
         </div>`;
      return;
    }

    // lazy-load the calendar iframe only when the section approaches the viewport
    const src = url.includes("calendly.com")
      ? url + (url.includes("?") ? "&" : "?") + "hide_gdpr_banner=1"
      : url + (url.includes("?") ? "&" : "?") + "embed=true&theme=light";
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const f = doc.createElement("iframe");
      f.className = "booking__frame";
      f.src = src;
      f.title = "Book your free Leak Audit";
      f.loading = "lazy";
      f.setAttribute("allow", "payment");
      cal.appendChild(f);
    }, { rootMargin: "600px" });
    io.observe(cal);
  }

  /* ---- phone / SMS builder ---------------------------------------------- */
  function buildSms(thread, { animated }) {
    const screen = el("div", "phone__screen");
    screen.appendChild(el("div", "phone__notch"));
    const status = el("div", "phone__statusbar",
      '<span>9:41</span><span>5G<span class="batt"></span></span>');
    screen.appendChild(status);

    const sms = el("div", "sms");
    const header = el("div", "sms__header",
      `<span class="sms__avatar">${thread.logoText}</span>
       <div><div class="sms__name">${thread.businessName}</div>
       <div class="sms__status">${thread.status}</div></div>`);
    sms.appendChild(header);

    const body = el("div", "sms__body");
    const bubbles = [];
    thread.messages.forEach((m) => {
      const b = el("div", "bubble bubble--" + m.from, m.text);
      if (animated) b.classList.remove("in"); // hidden until revealed
      else b.classList.add("in");
      body.appendChild(b);
      bubbles.push(b);
    });
    const confirm = el("div", "sms__confirm",
      `<span class="tick">&#10003; Confirmed</span>
       <div class="when">${thread.confirm.title}</div>
       <div class="line">${thread.confirm.line}</div>`);
    if (!animated) confirm.classList.add("in");
    body.appendChild(confirm);
    bubbles.push(confirm);

    sms.appendChild(body);
    screen.appendChild(sms);

    const phone = el("div", "phone");
    phone.appendChild(screen);
    return { phone, items: bubbles, body };
  }

  /* ---- renderers --------------------------------------------------------- */
  function renderLists() {
    // trust logos
    const tl = $("[data-trust-logos]");
    if (tl) S.trust.logos.forEach((n) => tl.appendChild(el("span", null, n)));

    // problem stats
    const ps = $("[data-problem-stats]");
    if (ps) S.problem.stats.forEach((s) =>
      ps.appendChild(el("div", "stat reveal", `<div class="stat__value">${s.value}</div><div class="stat__label">${s.label}</div>`)));

    // step groups
    const stepCard = (s) => el("div", "step reveal",
      `<div class="step__n">${s.n}</div><div class="step__title">${s.title}</div><div class="step__text">${s.text}</div>`);
    const ds = $("[data-diagnosis-steps]"); if (ds) S.diagnosis.steps.forEach((s) => ds.appendChild(stepCard(s)));
    const hs = $("[data-how-steps]"); if (hs) S.how.steps.forEach((s) => hs.appendChild(stepCard(s)));
    const gu = $("[data-guarantee]"); if (gu) S.guarantee.points.forEach((s, i) =>
      gu.appendChild(el("div", "step reveal", `<div class="step__n">0${i + 1}</div><div class="step__title">${s.title}</div><div class="step__text">${s.text}</div>`)));

    // guarantee promise band (the headline 60-Second Promise)
    const gp = $("[data-guarantee-promise]");
    if (gp && S.guarantee.promise) {
      const p = S.guarantee.promise;
      gp.innerHTML =
        `<div class="guarantee__seal" aria-hidden="true"><b>60</b><span>sec</span></div>
         <div class="guarantee__body">
           <span class="guarantee__badge">${p.badge}</span>
           <p class="guarantee__statement">${ital(p.statement)}</p>
           <p class="guarantee__fine">${p.finePrint}</p>
         </div>`;
    }

    // pricing value stack (reuse .check-list)
    const vs = $("[data-value-stack]");
    if (vs && S.pricing.includes) {
      vs.innerHTML =
        `<span class="value-stack__label">${S.pricing.includesLabel}</span>
         <ul class="check-list value-stack__list">${S.pricing.includes.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    }

    // book-itself steps
    const bs = $("[data-book-steps]");
    if (bs) S.bookItself.steps.forEach((s) =>
      bs.appendChild(el("li", null, `<span class="bs-n">${s.n}</span><span class="bs-label">${s.label}</span>`)));

    // roster
    const ro = $("[data-roster]");
    const portraitQueue = [];   // [figureNode, file] — loaded lazily near the section
    if (ro) S.roster.members.forEach((m) => {
      const tone = `var(--tone-${m.tone})`;
      const card = el("div", "worker reveal");
      card.style.setProperty("--tone", tone);
      card.innerHTML =
        `<div class="worker__figure" role="img" aria-label="${m.name}, ${m.role}" data-portrait="${m.portrait}"><span class="worker__initial">${m.name[0]}</span></div>
         <div class="worker__outcome">${m.outcome}</div>
         <div class="worker__by">${m.name} · <span>${m.role}</span></div>
         <p class="worker__line">${m.line}</p>
         <p class="worker__also"><b>Also:</b> ${m.also}</p>`;
      ro.appendChild(card);
      portraitQueue.push([card.querySelector(".worker__figure"), m.portrait]);
    });
    // lazy-load the character portraits: only fetch when the roster nears the
    // viewport (initial-letter fallback shows until each image loads).
    const loadPortraits = () => portraitQueue.forEach(([node, file]) => preloadPortrait(node, file));
    const staffSection = $("#staff");
    if (portraitQueue.length) {
      if (staffSection && typeof IntersectionObserver !== "undefined") {
        const pio = new IntersectionObserver((entries, obs) => {
          entries.forEach((e) => { if (e.isIntersecting) { obs.disconnect(); loadPortraits(); } });
        }, { rootMargin: "400px" });
        pio.observe(staffSection);
      } else {
        loadPortraits();   // no IO support: load straight away
      }
    }
    const rm = $("[data-roster-more]");
    if (rm) S.roster.more.forEach((c) => rm.appendChild(el("span", "chip", c)));

    // cockpit highlights + dashboard mock
    const ch = $("[data-cockpit-highlights]");
    if (ch) S.cockpit.highlights.forEach((h) => ch.appendChild(el("li", null, h)));
    const cp = $("[data-cockpit-panel]");
    if (cp) cp.appendChild(buildDash());

    // pricing compare
    const pr = $("[data-pricing]");
    if (pr) {
      const human = el("div", "compare__card compare__card--human reveal");
      human.innerHTML = `<div class="compare__title">${S.pricing.human.title}</div>
        <ul class="compare__list">${S.pricing.human.points.map((p) => `<li>${p}</li>`).join("")}</ul>`;
      const ai = el("div", "compare__card compare__card--ai reveal");
      ai.innerHTML = `<div class="compare__title">${S.pricing.ai.title}</div>
        <ul class="compare__list">${S.pricing.ai.points.map((p) => `<li>${p}</li>`).join("")}</ul>`;
      pr.append(human, ai);
    }

    // faq
    const fq = $("[data-faq]");
    if (fq) S.faq.forEach((f, i) => {
      const item = el("div", "faq-item");
      const id = "faq-a-" + (i + 1);
      item.innerHTML =
        `<button class="faq-q" aria-expanded="false" aria-controls="${id}"><span>${f.q}</span><span class="faq-q__icon" aria-hidden="true"></span></button>
         <div class="faq-a" id="${id}" aria-hidden="true"><div class="faq-a__inner">${f.a}</div></div>`;
      fq.appendChild(item);
    });
  }

  function buildDash() {
    const d = el("div", "dash");
    d.innerHTML =
      `<div class="dash__bar">
         <span class="dash__dot" style="background:#ff5f57"></span>
         <span class="dash__dot" style="background:#febc2e"></span>
         <span class="dash__dot" style="background:#28c840"></span>
         <span class="dash__title">${S.brand.short} · Live</span>
       </div>
       <div class="dash__kpis">
         <div class="dash__kpi"><div class="v">128</div><div class="k">Calls answered</div></div>
         <div class="dash__kpi"><div class="v up">+41</div><div class="k">Jobs booked</div></div>
         <div class="dash__kpi"><div class="v up">4.9★</div><div class="k">Rating</div></div>
       </div>
       <div class="dash__feed">
         <div class="dash__row"><span class="who" style="background:var(--tone-brand)"></span><span class="txt">Ada answered a call and booked the job</span><span class="tag">Nerang · now</span></div>
         <div class="dash__row"><span class="who" style="background:var(--tone-amber)"></span><span class="txt">Zip replied to a new lead in 43s</span><span class="tag">2m ago</span></div>
         <div class="dash__row"><span class="who" style="background:var(--tone-gold)"></span><span class="txt">Star collected a 5-star review</span><span class="tag">11m ago</span></div>
         <div class="dash__row"><span class="who" style="background:var(--tone-teal)"></span><span class="txt">Nudge sent quote #1042 and chased it</span><span class="tag">18m ago</span></div>
       </div>`;
    return d;
  }

  function preloadPortrait(node, file) {
    if (!node || !file) return;
    const img = new Image();
    img.onload = () => {
      node.style.setProperty("--fig", `url("assets/characters/${file}")`);
      node.classList.add("has-img");
    };
    img.src = "assets/characters/" + file;   // silently keeps initial if it 404s
  }

  /* ---- ROI calculator ---------------------------------------------------- */
  function renderRoi() {
    const mount = $("[data-roi]");
    if (!mount) return;
    const d = S.roi.defaults;
    const fields = [
      { key: "calls",  label: "Calls & leads per week",     min: 5,   max: 150, step: 5,  val: d.callsPerWeek, fmt: (v) => v },
      { key: "missed", label: "% you miss or reply late",   min: 5,   max: 70,  step: 5,  val: d.missedPct,    fmt: (v) => v + "%" },
      { key: "job",    label: "Average job value",          min: 100, max: 3000,step: 50, val: d.avgJob,       fmt: money },
      { key: "close",  label: "How many you'd win back",    min: 10,  max: 80,  step: 5,  val: d.closeRate,    fmt: (v) => v + "%" },
    ];
    const inputs = el("div", "roi-inputs reveal");
    fields.forEach((f) => {
      const wrap = el("div", "roi-field");
      wrap.innerHTML =
        `<div class="roi-field__top"><label class="roi-field__label" for="roi-${f.key}">${f.label}</label>
         <span class="roi-field__val" data-out="${f.key}">${f.fmt(f.val)}</span></div>
         <input id="roi-${f.key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}" />`;
      inputs.appendChild(wrap);
    });
    const result = el("div", "roi-result reveal");
    result.innerHTML =
      `<div class="roi-result__label">Revenue currently walking out the door</div>
       <div class="roi-result__big" data-roi-month></div>
       <div class="roi-result__sub">every month, that your AI staff can catch</div>
       <div class="roi-result__yr">That's about <b data-roi-year></b> a year in jobs you're currently losing.</div>`;
    mount.append(inputs, result);

    const state = { calls: d.callsPerWeek, missed: d.missedPct, job: d.avgJob, close: d.closeRate };
    const fmtOf = Object.fromEntries(fields.map((f) => [f.key, f.fmt]));
    function recompute() {
      // weekly missed × close-back rate × job value → monthly (×4.33)
      const perMonth = state.calls * (state.missed / 100) * (state.close / 100) * state.job * 4.33;
      $("[data-roi-month]").innerHTML = '<span class="cur">' + money(perMonth) + "</span>";
      $("[data-roi-year]").textContent = money(perMonth * 12);
    }
    inputs.querySelectorAll('input[type="range"]').forEach((inp, i) => {
      const key = fields[i].key;
      inp.addEventListener("input", () => {
        state[key] = Number(inp.value);
        inputs.querySelector(`[data-out="${key}"]`).textContent = fmtOf[key](state[key]);
        recompute();
      });
    });
    recompute();
  }

  /* ---- FAQ accordion ----------------------------------------------------- */
  function wireFaq() {
    $$(".faq-item").forEach((item) => {
      const btn = item.querySelector(".faq-q");
      const ans = item.querySelector(".faq-a");
      btn.addEventListener("click", () => {
        const open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        ans.setAttribute("aria-hidden", open ? "false" : "true");
        ans.style.maxHeight = open ? ans.scrollHeight + "px" : 0;
      });
    });
  }

  /* ---- reveal on scroll (IntersectionObserver, not ScrollTrigger.batch) -- */
  function wireReveals() {
    const targets = $$(".section__title, .section__lead, .reveal, .check-list li, .chip, .faq-item");
    targets.forEach((t) => t.classList.add("reveal"));
    if (REDUCED) { targets.forEach((t) => t.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach((t) => io.observe(t));
  }

  /* ---- signature: watch a lead book itself ------------------------------- */
  function wireBookItself() {
    const mount = $("[data-phone-thread]");
    const section = $("[data-book-section]");
    if (!mount || !section) return;
    const built = buildSms(S.bookItself.thread, { animated: true });
    mount.appendChild(built.phone);
    const items = built.items;                 // bubbles + confirm
    const steps = $$(".book-steps li");
    const total = items.length;

    const setActiveStep = (idx) => steps.forEach((s, i) => s.classList.toggle("active", i === idx));
    const revealUpTo = (n) => items.forEach((b, i) => b.classList.toggle("in", i < n));

    if (REDUCED) { revealUpTo(total); setActiveStep(steps.length - 1); return; }

    // stepMap: which "book step" is highlighted as bubbles reveal
    const stepFor = (n) => Math.min(steps.length - 1, Math.floor((n / total) * steps.length));

    if (DESKTOP && window.gsap && window.ScrollTrigger) {
      let last = -1;
      window.ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=" + Math.round(window.innerHeight * 1.5),
        pin: true,
        scrub: true,
        onUpdate: (self) => {
          const n = Math.round(self.progress * total);
          if (n !== last) { revealUpTo(n); setActiveStep(stepFor(Math.max(1, n))); last = n; }
        },
      });
    } else {
      // touch / small screens: auto-play once on enter, no pin, no scrub
      let played = false;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || played) return;
          played = true; io.disconnect();
          let n = 0;
          const tick = () => {
            n++; revealUpTo(n); setActiveStep(stepFor(n));
            built.body.scrollTop = built.body.scrollHeight;
            if (n < total) setTimeout(tick, 780);
          };
          setTimeout(tick, 300);
        });
      }, { threshold: 0.35 });
      io.observe(section);
    }
  }

  /* ---- nav stuck state --------------------------------------------------- */
  function wireNav() {
    const nav = $("#nav");
    const overHero = nav.classList.contains("nav--over-hero");
    const onScroll = () => {
      const threshold = overHero ? window.innerHeight * 0.6 : 12;
      nav.classList.toggle("is-stuck", window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Hero background video (lazy, never blocks LCP) -------------------- */
  function wireHeroVideo() {
    const video = $("[data-hero-video]");
    if (!video) return;
    // Poster is the LCP image. The muted autoplay loop plays on phones too
    // (small 720p file, iOS Safari autoplays muted+playsinline). Only fall
    // back to poster-only on reduced-motion or data-saver.
    if (REDUCED || (navigator.connection && navigator.connection.saveData)) return;
    video.src = "assets/video/hero.mp4";
    video.load();
    video.play().catch(() => {});   // autoplay may be blocked / file missing — poster stays
  }

  /* ---- Hero headline word reveal ---------------------------------------- */
  function wireHeroTitle() {
    const title = $(".hero__title");
    if (!title) return;
    const frag = doc.createDocumentFragment();
    Array.from(title.childNodes).forEach((node) => {
      if (node.nodeType === 3) {                          // text node → wrap each word
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (part === "" ) return;
          if (part.trim() === "") { frag.appendChild(doc.createTextNode(part)); return; }
          const span = el("span", "hw"); span.textContent = part; frag.appendChild(span);
        });
      } else if (node.nodeType === 1) {                   // element node
        if (node.tagName === "BR") { frag.appendChild(node); return; }
        const span = el("span", "hw"); span.appendChild(node); frag.appendChild(span);  // wrap <em> etc.
      }
    });
    title.innerHTML = "";
    title.appendChild(frag);

    const words = $$(".hw", title);
    if (REDUCED) { words.forEach((w) => w.classList.add("in")); return; }
    setTimeout(() => {
      words.forEach((w, i) => setTimeout(() => w.classList.add("in"), i * 70));
    }, 140);
  }

  /* ---- shared hero visibility (one IntersectionObserver, many listeners) --
     Used to pause the feed, headline rotator and constellation canvas when
     the hero is scrolled off-screen so they never burn CPU. */
  let heroVisCallbacks = null;
  function onHeroVisible(cb) {
    const hero = $("#hero");
    if (!hero || typeof IntersectionObserver === "undefined") { cb(true); return; }
    if (!heroVisCallbacks) {
      heroVisCallbacks = [];
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => heroVisCallbacks.forEach((f) => f(e.isIntersecting)));
      }, { threshold: 0 });
      io.observe(hero);
    }
    heroVisCallbacks.push(cb);
  }

  /* ---- Hero rotating headline second line (wireHeroRotate) ----------------
     Wraps everything after the <br> in a block-level .hero__rot span, then
     cycles hero.rotate variants. The h1 height is locked (min-height measured
     against the tallest variant) so layout never shifts, even when a variant
     wraps on small screens. Static under reduced-motion. */
  function wireHeroRotate() {
    const title = $(".hero__title");
    const variants = S.hero && S.hero.rotate;
    if (!title || !Array.isArray(variants) || variants.length < 2 || REDUCED) return;
    const br = title.querySelector("br");
    if (!br) return;

    // restructure: move the second line (the .hw spans built by wireHeroTitle)
    // into a block span. Node references are preserved so the word-stagger
    // timers still find and reveal them.
    const rot = el("span", "hero__rot");
    while (br.nextSibling) rot.appendChild(br.nextSibling);
    br.replaceWith(rot);

    let idx = 0, heroOn = true, measuredW = 0;

    // CLS guard: measure every variant offline (same nodes restored after),
    // lock the h1 min-height to the tallest. Re-measured on resize.
    function measure() {
      const keep = Array.from(rot.childNodes);
      title.style.minHeight = "";
      let max = 0;
      variants.forEach((v) => { rot.innerHTML = ital(v); max = Math.max(max, title.offsetHeight); });
      rot.textContent = "";
      keep.forEach((n) => rot.appendChild(n));
      title.style.minHeight = max + "px";
      measuredW = window.innerWidth;
    }

    function swap() {
      idx = (idx + 1) % variants.length;
      rot.classList.add("is-out");                    // old line: up + fade
      setTimeout(() => {
        rot.innerHTML = ital(variants[idx]);
        rot.classList.add("is-pre");                  // new line staged below
        rot.classList.remove("is-out");
        void rot.offsetHeight;                        // commit staged state
        rot.classList.remove("is-pre");               // transition up to rest
      }, 460);
    }

    onHeroVisible((v) => { heroOn = v; });
    let deb;
    window.addEventListener("resize", () => {
      clearTimeout(deb);
      deb = setTimeout(() => { if (window.innerWidth !== measuredW) measure(); }, 160);
    });

    // lock the height up-front (nodes survive by reference, so the stagger
    // timers still reveal them) and again once webfonts settle metrics
    measure();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => measure());

    // start rotating after the word-stagger reveal has finished
    setTimeout(() => {
      setInterval(() => { if (!heroOn || doc.hidden) return; swap(); }, 3200);
    }, 2000);
  }

  /* ---- Live crew-at-work feed (wireHeroFeed, desktop only) ----------------
     Glass notification cards cycling over the hero video. Max 2 visible;
     newest enters on top, older shifts down, oldest fades out. All movement
     is transform/opacity via CSS transitions. */
  function wireHeroFeed() {
    const mount = $("[data-hero-feed]");
    const feed = S.hero && S.hero.feed;
    if (!mount || REDUCED) return;
    if (!Array.isArray(feed) || feed.length < 2) return;

    const cardHtml = (m) =>
      `<span class="feed-card__chip">${m.name[0]}</span>
       <div class="feed-card__body">
         <div class="feed-card__top"><span class="feed-card__name">${m.name}</span><span class="feed-card__time">${m.time}</span></div>
         <p class="feed-card__text">${m.text}</p>
       </div>`;

    // honesty label: these are simulated events, not live client activity
    const note = el("div", "hero__feed-note");
    note.textContent = S.hero.feedNote || "Simulated preview of your crew at work";
    mount.appendChild(note);

    // Narrow screens: ONE card at a time, cycling. Single reused element inside
    // a fixed-height slot (see .hero__feed mobile CSS) so nothing shifts.
    if (window.innerWidth < 1025) {
      let idx = 0, heroOn = true;
      const card = el("div", "feed-card feed-card--solo");
      card.innerHTML = cardHtml(feed[0]);
      card.style.setProperty("--tone", `var(--tone-${feed[0].tone})`);
      mount.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));

      function swapSolo() {
        card.classList.remove("in");                 // slide down + fade out
        setTimeout(() => {
          idx = (idx + 1) % feed.length;
          const m = feed[idx];
          card.innerHTML = cardHtml(m);
          card.style.setProperty("--tone", `var(--tone-${m.tone})`);
          requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));
        }, 520);                                      // matches .feed-card transition
      }
      onHeroVisible((v) => { heroOn = v; });
      setInterval(() => { if (!heroOn || doc.hidden) return; swapSolo(); }, 3500);
      return;
    }

    // Desktop (>=1025, pointer): two-up stack.
    if (!DESKTOP || NO_HOVER) return;

    const GAP = 12;
    let idx = 0, heroOn = true;
    const live = [];                                   // newest first: { node, y }

    function push() {
      const m = feed[idx]; idx = (idx + 1) % feed.length;
      const card = el("div", "feed-card", cardHtml(m));
      card.style.setProperty("--tone", `var(--tone-${m.tone})`);
      mount.appendChild(card);
      const hNew = card.offsetHeight;

      // older cards slide down to make room
      live.forEach((c) => { c.y += hNew + GAP; c.node.style.transform = `translateY(${c.y}px)`; });
      live.unshift({ node: card, y: 0 });

      // enter on the next frame so the base state paints first
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));

      // retire anything beyond 2 visible
      while (live.length > 2) {
        const old = live.pop();
        old.node.style.opacity = "0";
        old.node.style.transform = `translateY(${old.y + 10}px)`;
        setTimeout(() => old.node.remove(), 560);
      }
    }

    onHeroVisible((v) => { heroOn = v; });
    setTimeout(push, 500);                             // first card almost straight away
    setInterval(() => { if (!heroOn || doc.hidden) return; push(); }, 3500);
  }

  /* ---- Neural constellation canvas (wireHeroNet, desktop only) ------------
     ~45 slow-drifting nodes, lines between close pairs, a bright pulse ring
     every ~2.5s. Single canvas, no per-frame filters; rAF fully stops when
     the hero is off-screen or the tab is hidden. */
  function wireHeroNet() {
    const canvas = $("[data-hero-net]");
    const hero = $("#hero");
    if (!canvas || !hero || REDUCED) return;   // runs on mobile too, just lighter
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Smaller screens: half the nodes (scaled to width), lower DPR cap, shorter
    // link distance — comfortably 60fps on a phone.
    const MOBILE = window.innerWidth < 1025;
    const dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
    const N = MOBILE ? Math.max(16, Math.min(26, Math.round(window.innerWidth / 18))) : 45;
    const LINK = MOBILE ? 120 : 130;
    let w = 0, h = 0;

    function size() {
      w = hero.clientWidth; h = hero.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();

    const nodes = [];
    for (let i = 0; i < N; i++) {
      nodes.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (3 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1),   // px per second
        vy: (3 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1),
      });
    }

    let pulse = null, lastPulse = 0;
    let heroOn = true, raf = 0, last = 0;

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < -10) n.x = w + 10; else if (n.x > w + 10) n.x = -10;
        if (n.y < -10) n.y = h + 10; else if (n.y > h + 10) n.y = -10;
      }

      if (now - lastPulse > 2500) {
        lastPulse = now;
        pulse = { n: nodes[(Math.random() * N) | 0], t0: now };
      }
      const pt = pulse ? Math.min(1, (now - pulse.t0) / 900) : 1;
      if (pulse && pt >= 1) pulse = null;

      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const d = Math.sqrt(d2);
          let alpha = (1 - d / LINK) * 0.42;
          if (pulse && (a === pulse.n || b === pulse.n)) alpha = Math.min(1, alpha * (1 + 2.2 * (1 - pt)));
          ctx.strokeStyle = "rgba(157,184,255," + alpha.toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      ctx.fillStyle = "rgba(157,184,255,.75)";
      for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, 1.7, 0, 6.2832); ctx.fill(); }

      if (pulse) {
        ctx.strokeStyle = "rgba(190,212,255," + (0.8 * (1 - pt)).toFixed(3) + ")";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(pulse.n.x, pulse.n.y, 6 + pt * 42, 0, 6.2832); ctx.stroke();
      }
    }

    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop()  { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function sync()  { (heroOn && !doc.hidden) ? start() : stop(); }

    onHeroVisible((v) => { heroOn = v; sync(); });
    doc.addEventListener("visibilitychange", sync);
    let deb;
    window.addEventListener("resize", () => { clearTimeout(deb); deb = setTimeout(size, 160); });
    sync();
  }

  /* ---- Magnetic CTA (desktop, pointer only) ----------------------------- */
  function wireMagnetic() {
    if (!DESKTOP || NO_HOVER || REDUCED) return;
    const cap = 10;
    $$("[data-magnetic]").forEach((node) => {
      node.addEventListener("mousemove", (e) => {
        const r = node.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.25;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.25;
        const x = Math.max(-cap, Math.min(cap, dx));
        const y = Math.max(-cap, Math.min(cap, dy));
        node.style.transform = `translate(${x}px, ${y}px)`;
      });
      node.addEventListener("mouseleave", () => { node.style.transform = ""; });
    });
  }

  /* ---- Sticky mobile CTA (shows once scrolled past the hero) ------------- */
  function wireStickyCta() {
    const bar = $("[data-sticky-cta]");
    const hero = $("#hero");
    if (!bar || !hero) return;
    if (DESKTOP) return;   // bar is display:none on desktop; don't flip aria-hidden on it
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const past = !e.isIntersecting;
        bar.classList.toggle("is-visible", past);
        bar.setAttribute("aria-hidden", past ? "false" : "true");
      });
    }, { threshold: 0 });
    io.observe(hero);
  }

  /* ---- Count-up on reveal (once) ---------------------------------------- */
  function wireCountUps() {
    const targets = $$(".stat__value, .dash__kpi .v");
    if (!targets.length || REDUCED) return;   // reduced-motion: leave final text

    const parse = (text) => {
      const m = String(text).match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/);
      if (!m) return null;
      return { prefix: m[1], num: parseFloat(m[2]), suffix: m[3], decimals: (m[2].split(".")[1] || "").length };
    };
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const animate = (node) => {
      const p = parse(node.textContent);
      if (!p) return;
      const dur = 1100, start = performance.now();
      const settle = p.decimals ? p.num.toFixed(p.decimals) : String(Math.round(p.num));
      const frame = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const v = p.num * ease(t);
        const shown = p.decimals ? v.toFixed(p.decimals) : String(Math.round(v));
        node.textContent = p.prefix + shown + p.suffix;
        if (t < 1) requestAnimationFrame(frame);
        else node.textContent = p.prefix + settle + p.suffix;
      };
      requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        animate(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    targets.forEach((t) => io.observe(t));
  }

  /* ---- Lenis + GSAP (single ticker; touch-gated) ------------------------- */
  function wireScroll() {
    if (REDUCED || typeof Lenis === "undefined") { wireAnchors(null); return; }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      syncTouch: false,                      // phones get native momentum
      touchMultiplier: NO_HOVER ? 1 : 1.5,
    });

    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));   // ONE source drives Lenis
      gsap.ticker.lagSmoothing(0);
      if (!NO_HOVER) ScrollTrigger.normalizeScroll(true);   // desktop only
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    wireAnchors(lenis);
  }

  function wireAnchors(lenis) {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");          // re-read inside handler
        if (!href || href === "#" || href.length < 2) return;
        if (!href.startsWith("#")) return;             // never hijack tel:/mailto:
        const target = doc.getElementById(href.slice(1));
        if (!target) return;
        e.preventDefault();
        const offset = -70;
        if (lenis && lenis.scrollTo) lenis.scrollTo(target, { offset, duration: NO_HOVER ? 0.8 : 1.1 });
        else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
      });
    });
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    bind();
    renderLists();
    renderBooking();
    renderRoi();
    wireFaq();
    wireNav();
    wireHeroTitle();
    wireHeroRotate();
    wireBookItself();
    wireMagnetic();
    wireStickyCta();
    wireCountUps();
    requestAnimationFrame(() => {
      html.classList.add("is-ready");
      wireReveals();
      wireScroll();
      wireHeroVideo();
      wireHeroFeed();
      wireHeroNet();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
