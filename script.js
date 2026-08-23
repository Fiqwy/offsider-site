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
  // same {i:...} marker, stripped back to plain text (schema.org, alt text, etc.)
  const plain = (str) => String(str).replace(/\{i:([^}]+)\}/g, "$1");
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
    // NOTE: the document title is NOT set here. Each page's own <title> is
    // authoritative, so work.html / terms.html / privacy.html keep theirs.
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
      // Preferred-times enquiry box: posts to the platform's own endpoint
      // (/api/public/contact, same origin; the apex proxies /api/* to Flask).
      //
      // The `contact_ref2` input below is the anti-spam honeypot — hidden by .booking__hp,
      // empty for a human, and treated by the server as a bot if it arrives filled. Its name
      // is deliberately meaningless. It used to be `website`, which is one of the names
      // Chrome and every password manager autofill on sight, so an autofiller was enough to
      // get a genuine person's enquiry flagged. Kept as a JS comment, not an HTML one, so the
      // shipped markup does not point the trap out to anyone reading the page source.
      // COORDINATED CHANGE: backend/routes/comms.py _HONEYPOT_FIELDS still accepts `website`
      // for one deploy, so a CDN-cached copy of this file keeps working. Do not rename either
      // side alone.
      const f = S.booking.form;
      // Each field carries its own error node. The form is novalidate, so the
      // browser bubble never appears; we own the message instead, and it is
      // real text in the DOM (WCAG 3.3.1) wired to the input by
      // aria-describedby rather than a transient tooltip.
      // The error node is a SIBLING of the label, not a child: inside the
      // label its text would be swallowed into the input's accessible name
      // ("Your name Please fill this in."). The wrapper keeps it as one flex
      // item so the form's column gap is unchanged.
      const ERR_STYLE = "display:none;margin-top:.3rem;font-size:.82rem;font-weight:700;color:#b42318";
      const field = (name, label, attrs) =>
        `<div class="booking__field"><label><span>${label}</span>
           <input id="bf-${name}" name="${name}" ${attrs} required aria-describedby="bf-${name}-err" /></label>
           <span class="booking__form-err" id="bf-${name}-err" style="${ERR_STYLE}"></span></div>`;
      cal.innerHTML =
        `<form class="booking__form" novalidate>
           <b class="booking__form-title">${f.title}</b>
           ${field("name",   f.fields.name,   'type="text" autocomplete="name"')}
           ${field("mobile", f.fields.mobile, 'type="tel" autocomplete="tel" inputmode="tel"')}
           ${field("email",  f.fields.email,  'type="email" autocomplete="email" inputmode="email"')}
           ${field("trade",  f.fields.trade,  'type="text"')}
           <div class="chip-row">
             <span class="chip-row__label">${f.timesLabel}</span>
             <div class="chip-row__chips">${f.times.map((t) =>
               `<button type="button" class="chip-toggle" aria-pressed="false">${t}</button>`).join("")}</div>
           </div>
           <input type="text" name="contact_ref2" class="booking__hp" tabindex="-1" aria-hidden="true" autocomplete="off" />
           <button class="btn btn--primary btn--lg" type="submit">${f.button}</button>
           <p class="booking__form-note">${f.note}</p>
           <p class="booking__form-msg" role="status" aria-live="polite" tabindex="-1"></p>
         </form>`;
      const form = $("form", cal);
      const msg = $(".booking__form-msg", cal);

      /* ---- per-field validation, announced and visible ------------------- */
      const errorFor = (inp) => {
        if (inp.validity.valueMissing) return f.fields.errorRequired || "Please fill this in.";
        if (inp.type === "email") return f.fields.errorEmail || "Please enter a valid email address.";
        return f.fields.errorInvalid || "Please check this.";
      };
      const clearField = (inp) => {
        const e = $("#" + inp.id + "-err", form);
        inp.removeAttribute("aria-invalid");
        if (e) { e.textContent = ""; e.style.display = "none"; }
      };
      const markField = (inp) => {
        const e = $("#" + inp.id + "-err", form);
        inp.setAttribute("aria-invalid", "true");
        if (e) { e.textContent = errorFor(inp); e.style.display = "block"; }
      };
      const controls = $$("input[required]", form);
      controls.forEach((inp) => {
        // clear the moment the field becomes valid again
        const recheck = () => { if (inp.checkValidity()) clearField(inp); };
        inp.addEventListener("input", recheck);
        inp.addEventListener("blur", () => { if (!inp.checkValidity()) markField(inp); else clearField(inp); });
      });
      const validate = () => {
        let first = null;
        controls.forEach((inp) => {
          if (inp.checkValidity()) { clearField(inp); return; }
          markField(inp);
          if (!first) first = inp;
        });
        if (first) first.focus();
        return !first;
      };
      $$(".chip-toggle", form).forEach((chip) => {
        chip.addEventListener("click", () => {
          const on = chip.classList.toggle("is-on");
          chip.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!validate()) return;
        const btn = $("button[type=submit]", form);
        btn.disabled = true; btn.textContent = "Sending...";
        // One place that puts the form back so the visitor can try again, whichever way
        // the send failed. All user-facing wording lives in content.js.
        const fail = (text) => {
          msg.textContent = text || f.error;
          msg.classList.remove("is-ok");
          btn.disabled = false; btn.textContent = f.button;
        };
        try {
          const data = Object.fromEntries(new FormData(form).entries());
          const times = $$(".chip-toggle.is-on", form).map((c) => c.textContent.trim());
          const res = await fetch("/api/public/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              email: data.email,
              phone: data.mobile,
              business: data.trade,
              contact_ref2: data.contact_ref2,   // honeypot: empty for humans
              preferred_times: times,  // structured chip labels (platform stores + shows these)
              message: "Free Leak Audit request from the website.\nPreferred times: "
                + (times.length ? times.join(", ") : "No preference")
                + "\nMobile: " + data.mobile,
            }),
          });
          // Check the STATUS first. This used to go straight to res.json(), so a 403, a 429
          // and a 500 all collapsed into the same "that did not send" — and an error body
          // that was not JSON (an nginx or Cloudflare page) threw a parse error on top,
          // hiding the real failure completely.
          if (!res.ok) {
            // 429 is the only failure we can name honestly to the visitor. Everything else
            // is ours to fix, so it keeps the generic message and the phone/email fallback.
            fail(res.status === 429 ? f.errorBusy : f.error);
            return;
          }
          // Parse defensively — a 200 with a body we cannot read is still a failure, but it
          // must surface as our plain message, not as a JSON syntax error.
          let out = null;
          try { out = await res.json(); } catch { out = null; }
          if (!out || out.success !== true) { fail(f.error); return; }
          // Move focus to the success message BEFORE the fields disappear.
          // Hiding the submit button the user just activated destroys focus and
          // drops it to <body>, which strands a keyboard/screen-reader user at
          // the top of the document (WCAG 2.4.3).
          msg.textContent = f.success;
          msg.classList.add("is-ok");
          msg.focus();
          // .booking__field (not label) — the field wrapper is the flex item,
          // so hiding the label alone would leave four empty rows of gap.
          form.querySelectorAll(".booking__field, .chip-row, button, .booking__form-note").forEach((n) => { n.style.display = "none"; });
        } catch {
          // Network drop / request never completed.
          fail(f.error);
        }
      });
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
       <div class="sms__status">${thread.status}</div></div>
       ${thread.example ? `<span class="sms__status" style="margin-left:auto">${thread.example}</span>` : ""}`);
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
    // .step__title / .worker__outcome render as headings (1.25rem+/800) across
    // ~15 cards, so they are marked up as h3 rather than div: without them the
    // heading outline jumps section h2 → next section h2 (WCAG 1.3.1).
    // .worker__outcome sets its own line-height/letter-spacing so it is
    // pixel-identical as an h3. .step__title does not, so it would pick up the
    // global `h1,h2,h3` line-height 1.08 / letter-spacing -.02em and shrink
    // every step card by 10.4px. Inheriting both back keeps the render byte
    // identical. FOLLOW-UP: fold this into .step__title in styles.css (a class
    // change now would race the CSS agent working in that file).
    const STEP_TITLE = ' style="line-height:inherit;letter-spacing:inherit"';
    const stepCard = (s) => el("div", "step reveal",
      `<div class="step__n">${s.n}</div><h3 class="step__title"${STEP_TITLE}>${s.title}</h3><div class="step__text">${s.text}</div>`);
    const ds = $("[data-diagnosis-steps]"); if (ds) S.diagnosis.steps.forEach((s) => ds.appendChild(stepCard(s)));
    const hs = $("[data-how-steps]"); if (hs) S.how.steps.forEach((s) => hs.appendChild(stepCard(s)));
    const gu = $("[data-guarantee]"); if (gu) S.guarantee.points.forEach((s, i) =>
      gu.appendChild(el("div", "step reveal", `<div class="step__n">0${i + 1}</div><h3 class="step__title"${STEP_TITLE}>${s.title}</h3><div class="step__text">${s.text}</div>`)));

    // guarantee promise band (the headline 30-Day Promise)
    const gp = $("[data-guarantee-promise]");
    if (gp && S.guarantee.promise) {
      const p = S.guarantee.promise;
      gp.innerHTML =
        `<div class="guarantee__seal" aria-hidden="true"><b>30</b><span>days</span></div>
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
         <h3 class="worker__outcome">${m.outcome}</h3>
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
    if (cp) {
      cp.appendChild(buildDash());
      // honesty caption under the mock: same standard as the hero feed label
      cp.appendChild(el("p", "stat-note", "Sample data for a made-up business, not a real client's dashboard."));
    }

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

    // proof band (home): three recent builds, each linking into work.html
    renderProof();
  }

  /* ---- Proof band (three recent builds) ----------------------------------
     No-ops until the home page grows a [data-proof] mount. Copy strings go in
     via textContent: these are business names we do not control. */
  function renderProof() {
    const mount = $("[data-proof]");
    if (!mount || !S.work) return;
    (S.work.projects || []).slice(0, 3).forEach((p) => {
      const card = el("a", "proof-card reveal");
      card.href = "work.html#" + p.slug;
      // the client's own accent (content.js `tone`), which the dark band uses
      // as a single mark above their name. Anything that is not a plain hex
      // value is ignored and the card falls back to the house accent.
      if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(p.tone || "")) card.style.setProperty("--chapter", p.tone);

      const media = el("div", "proof-card__media");
      const img = doc.createElement("img");
      img.src = p.card;
      img.alt = p.name + " website";
      img.loading = "lazy";
      img.decoding = "async";
      media.appendChild(img);

      const body = el("div", "proof-card__body");
      const name = el("div", "proof-card__name");
      name.textContent = p.name;
      const line = el("p", "proof-card__line");
      line.textContent = p.proofLine || p.oneLiner || "";
      body.append(name, line);

      card.append(media, body);
      mount.appendChild(card);
    });
  }

  /* ---- FAQPage JSON-LD (home page only) ----------------------------------
     Built from the same S.faq the visible accordion renders, so the two can
     never drift apart. */
  function injectFaqSchema() {
    if (doc.body.dataset.page !== "home") return;
    if (!Array.isArray(S.faq) || !S.faq.length) return;
    const data = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: S.faq.map((f) => ({
        "@type": "Question",
        name: plain(f.q),
        acceptedAnswer: { "@type": "Answer", text: plain(f.a) },
      })),
    };
    const tag = doc.createElement("script");
    tag.type = "application/ld+json";
    // escape "<" so the payload can never terminate the script block
    tag.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
    doc.head.appendChild(tag);
  }

  function buildDash() {
    // A healthy week for a (fictional) autobody client, light like the real
    // cockpit. "Sample data" chip keeps it honest, same standard as the hero feed.
    // Each feed row expands (like the real product) to show the job details +
    // the conversation the AI actually had.
    const ROWS = [
      { tone: "brand", txt: "Ada answered and booked a bumper respray", tag: "Southport · now",
        meta: ["Front bumper respray · 2019 Ranger", "Assessment booked Thu 7:30am", "Logged to calendar + CRM"],
        convo: [
          ["Caller", "Had a ding in the front bumper, can you fit me in this week?"],
          ["Ada", "We can. Thursday 7:30am for a 20 minute assessment, or Friday arvo if that suits better?"],
          ["Caller", "Thursday works."],
          ["Ada", "Locked in. I have texted you the address and a reminder for Thursday 7:30am. See you then."],
        ] },
      { tone: "amber", txt: "Zip replied to an insurance lead in 38s", tag: "2m ago",
        meta: ["Web form enquiry · insurance claim", "First reply in 38 seconds", "Booking link sent and opened"],
        convo: [
          ["Lead", "Not-at-fault accident, other party insured with AAMI. Do you handle the claim?"],
          ["Zip", "We do, start to finish, and we deal with the insurer for you. Want to grab an assessment time now? Here is the link."],
          ["Lead", "Booked for Tuesday, thanks."],
        ] },
      { tone: "teal", txt: "Nudge sent quote #217, hail damage, and chased it", tag: "26m ago",
        meta: ["Quote #217 · hail damage, roof + bonnet", "Built from your pricing rules", "Accepted on day-3 follow-up · invoice scheduled"],
        convo: [
          ["Nudge", "Hi Sarah, your quote for the hail repair is attached. Any questions, just reply here."],
          ["Nudge", "(day 3) Hi Sarah, checking you got the quote okay. Want us to hold a spot next week?"],
          ["Customer", "Yes go ahead, book it in."],
        ] },
      { tone: "indigo", txt: 'Leo answered an "is my car ready" text', tag: "1h ago",
        meta: ["Status enquiry · job #204", "Answered from the live job board", "Zero interruption to the workshop"],
        convo: [
          ["Customer", "Hey, any word on the Camry?"],
          ["Leo", "Paint is curing now. It is on track for Friday 2pm pickup, we will text you the moment it is ready."],
          ["Customer", "Legend, thanks."],
        ] },
      { tone: "gold", txt: "Star sent a review request after job #198", tag: "2h ago",
        meta: ["Job #198 completed 5:40pm", "Review request sent 6:10pm", "Review left 6:47pm · reply posted"],
        convo: [
          ["Star", "Thanks for choosing Coastline, Dave. If you have a minute, an honest Google review helps us heaps: [link]"],
          ["Dave", "★★★★★ Car looks brand new, couldn't tell it was ever hit."],
          ["Star", "(reply as the business) Thanks Dave, enjoy having her back to new. See you next time."],
        ] },
    ];
    const d = el("div", "dash");
    d.innerHTML =
      `<div class="dash__bar">
         <span class="dash__dot" style="background:#ff5f57"></span>
         <span class="dash__dot" style="background:#febc2e"></span>
         <span class="dash__dot" style="background:#28c840"></span>
         <span class="dash__title">Coastline Smash Repairs · ${S.brand.short} cockpit</span>
         <span class="dash__sample">Sample data</span>
       </div>
       <div class="dash__health"><span class="dash__pulse"></span>All staff healthy · 4 quotes chased, 2 replies, 1 job won this week</div>
       <div class="dash__kpis">
         <div class="dash__kpi"><div class="v">47/47</div><div class="k">Calls answered this week</div></div>
         <div class="dash__kpi"><div class="v up">12</div><div class="k">Jobs booked</div></div>
         <div class="dash__kpi"><div class="v up">$18k</div><div class="k">Revenue recovered</div></div>
       </div>
       <div class="dash__feed">${ROWS.map((r, i) =>
         `<div class="dash__item">
            <button class="dash__row" type="button" aria-expanded="false" aria-controls="dash-detail-${i}">
              <span class="who" style="background:var(--tone-${r.tone})"></span>
              <span class="txt">${r.txt}</span>
              <span class="tag">${r.tag}</span>
              <span class="dash__chev" aria-hidden="true"></span>
            </button>
            <div class="dash__detail" id="dash-detail-${i}" aria-hidden="true">
              <div class="dash__detail-inner">
                <div class="dash__meta">${r.meta.map((m) => `<span>${m}</span>`).join("")}</div>
                <div class="dash__convo">${r.convo.map(([who, line]) =>
                  `<p><b>${who}:</b> ${line}</p>`).join("")}</div>
              </div>
            </div>
          </div>`).join("")}
       </div>`;

    // expand/collapse, same max-height pattern as the FAQ accordion
    $$(".dash__row", d).forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.parentElement;
        const detail = $(".dash__detail", item);
        const open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        detail.setAttribute("aria-hidden", open ? "false" : "true");
        detail.style.maxHeight = open ? detail.scrollHeight + "px" : "0px";
      });
    });
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
      // vt: the slider needs aria-valuetext or a screen reader reads the bare
      // number ("350") instead of the dollar figure the sighted user sees.
      { key: "job",    label: "Average job value",          min: 100, max: 3000,step: 50, val: d.avgJob,       fmt: money, vt: true },
      { key: "close",  label: "How many you'd win back",    min: 10,  max: 80,  step: 5,  val: d.closeRate,    fmt: (v) => v + "%" },
    ];
    const inputs = el("div", "roi-inputs reveal");
    fields.forEach((f) => {
      const wrap = el("div", "roi-field");
      wrap.innerHTML =
        `<div class="roi-field__top"><label class="roi-field__label" for="roi-${f.key}">${f.label}</label>
         <span class="roi-field__val" data-out="${f.key}">${f.fmt(f.val)}</span></div>
         <input id="roi-${f.key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.val}"${f.vt ? ` aria-valuetext="${f.fmt(f.val)}"` : ""} />`;
      inputs.appendChild(wrap);
    });
    const result = el("div", "roi-result reveal");
    // The headline figure is recomputed silently as the sliders move, so a
    // screen-reader user hears the slider value but never the answer. Announce
    // the whole result block as one polite update (WCAG 4.1.3).
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    result.setAttribute("aria-atomic", "true");
    result.innerHTML =
      `<div class="roi-result__label">Revenue currently walking out the door</div>
       <div class="roi-result__big" data-roi-month></div>
       <div class="roi-result__sub">every month, that your AI staff can catch</div>
       <div class="roi-result__sub">An estimate from the numbers you moved, not a forecast.</div>
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
        const shown = fmtOf[key](state[key]);
        inputs.querySelector(`[data-out="${key}"]`).textContent = shown;
        if (inp.hasAttribute("aria-valuetext")) inp.setAttribute("aria-valuetext", shown);
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
        // Pin by transform, not position:fixed. The default pinType re-parents
        // the section into a pin-spacer and switches it to fixed, which Chrome
        // records as two ~0.92 layout shifts (engage + release) and puts home
        // CLS at 1.77 against a 0.1 budget. "transform" pins with a translate
        // instead: zero shift entries, identical behaviour, and it is also the
        // correct pairing for Lenis (which drives a smoothed scroll position).
        pinType: "transform",
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
    if (!nav) return;
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
    // The poster (hero-poster.webp, 13KB) is the LCP image and paints on its
    // own. The loop is pure enhancement, so it is deferred rather than fetched
    // at boot: never on reduced-motion or data-saver, and only once the main
    // thread is idle AND the hero is actually on screen. Anything that fails
    // here just leaves the poster.
    // Phones DO get the loop (Nicholas's call, 2026-08-20): it is the site's
    // main visual moment and mobile is most of the traffic. It costs nothing
    // perceptible because it lands after first paint and after idle.
    if (REDUCED || (navigator.connection && navigator.connection.saveData)) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      video.src = "assets/video/hero.mp4";
      video.load();
      video.play().catch(() => {});   // autoplay may be blocked / file missing — poster stays
    };

    // requestIdleCallback keeps it behind first paint; Safari has no rIC, so
    // fall back to a timeout. IntersectionObserver holds it until the hero is
    // visible (a deep-linked load lands past the hero and never pays for it).
    const whenIdle = (fn) =>
      (typeof window.requestIdleCallback === "function")
        ? window.requestIdleCallback(fn, { timeout: 3000 })
        : setTimeout(fn, 1200);

    const hero = video.closest(".hero") || video;
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          whenIdle(start);
        });
      }, { rootMargin: "200px" });
      io.observe(hero);
    } else {
      whenIdle(start);
    }
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
    // The skip link is deliberately NOT hijacked (WCAG 2.4.1). preventDefault()
    // here would swallow the fragment navigation, so focus would stay on the
    // skip link and the next Tab would land back on the brand link, skipping
    // nothing. Let the browser navigate to #top, then move focus explicitly so
    // the next Tab starts inside <main tabindex="-1">.
    $$("a.skip-link").forEach((a) => {
      a.addEventListener("click", () => {
        const href = a.getAttribute("href") || "";
        const target = href.startsWith("#") ? doc.getElementById(href.slice(1)) : null;
        if (!target) return;
        // after the browser's own fragment navigation has run
        setTimeout(() => { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }, 0);
      });
    });

    $$('a[href^="#"]:not(.skip-link)').forEach((a) => {
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
    // Page modules (work.html and friends) hook in here, after the shared
    // render pass and before the wiring, so anything they build still gets
    // picked up by wireReveals()/wireAnchors() below.
    if (typeof window.PAGE_INIT === "function") window.PAGE_INIT({ $, $$, el, ital, REDUCED, NO_HOVER, DESKTOP });
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
    injectFaqSchema();
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
