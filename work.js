/* =============================================================================
   work.js — the Work page module (work.html only).

   Sets window.PAGE_INIT, which script.js calls inside boot() after the shared
   render pass and before the wiring, so everything built here is still picked
   up by wireReveals() and wireAnchors().

   Loads BEFORE script.js and AFTER content.js. No GSAP on this page: the only
   scroll behaviour is Lenis plus the shared IntersectionObserver reveals.

   Copy strings go in through textContent. Business names, captions and URLs
   belong to other people and are never interpolated into HTML.
   ========================================================================== */
(function () {
  "use strict";

  const S = window.SITE;
  const doc = document;

  /* Per-project accent, straight from content.js. Anything that is not a plain
     hex value is ignored and the chapter falls back to the house accent. */
  const TONE_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const setTone = (node, tone) => { if (TONE_RE.test(tone || "")) node.style.setProperty("--chapter", tone); };

  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const clock = (secs) => pad2(Math.floor(secs / 60)) + ":" + pad2(Math.floor(secs % 60));
  const two = (n) => (n < 10 ? "0" : "") + n;

  /* "shockedsolarandelectrical.com" from the full URL, without dragging in the
     scheme or a trailing slash. Falls back to the raw string if it will not parse. */
  function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ""); } catch { return String(url || ""); }
  }

  /* Posters ship as WebP twins of the .jpg frames content.js still names (same
     pixels, same dimensions, about half the bytes). <video poster> takes WebP
     everywhere we support, and both files are self-hosted, so nothing about the
     CSP changes. The .jpg files stay on disk as the fallback of record; if a
     poster is ever named something other than .jpg it is used untouched. */
  function posterSrc(src) {
    const s = String(src || "");
    return /\.jpe?g$/i.test(s) ? s.replace(/\.jpe?g$/i, ".webp") : s;
  }

  /* The stills are 1440x900 masters that never render wider than about 430 CSS
     px, so each one has a 900w companion sitting beside it. The narrow cut is
     derived from the master's own path rather than listed anywhere: if the name
     is not the shape we expect, no srcset is written at all and the master is
     served on its own, which is exactly today's behaviour. */
  const STILL_RE = /^(.*\/still-\d{2})\.webp$/;
  function stillSrcset(src) {
    const m = STILL_RE.exec(String(src || ""));
    return m ? m[1] + "-900.webp 900w, " + m[0] + " 1440w" : "";
  }

  /* Text for screen readers only. styles.css has no sr-only utility and the CSS
     belongs to another file, so this is set through CSSOM on the element itself
     (the standard clip-rect pattern, not a style attribute). */
  function srOnly(text) {
    const s = doc.createElement("span");
    s.textContent = text;
    s.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;" +
      "overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;";
    return s;
  }

  /* The house device: one Instrument Serif italic word inside a display line.
     On a chapter title that word is the LAST word of the business name, which
     is the one that says what they do (Electrical, Detailing, Matthews). */
  function titleWithAccent(name) {
    const frag = doc.createDocumentFragment();
    const words = String(name).trim().split(/\s+/);
    const last = words.pop();
    if (words.length) frag.appendChild(doc.createTextNode(words.join(" ") + " "));
    const em = doc.createElement("em");
    em.className = "ital";
    em.textContent = last;
    frag.appendChild(em);
    return frag;
  }

  /* small builders ---------------------------------------------------------- */
  function label(text, cls) {
    const s = doc.createElement("span");
    s.className = "lbl" + (cls ? " " + cls : "");
    s.textContent = text;
    return s;
  }
  function ruleRow(left, right, cls) {
    const row = doc.createElement("p");
    row.className = "rule-row" + (cls ? " " + cls : "");
    row.appendChild(left);
    const i = doc.createElement("i");
    i.setAttribute("aria-hidden", "true");
    row.appendChild(i);
    if (right) row.appendChild(right);
    return row;
  }

  /* ---- the reel ----------------------------------------------------------
     One silent screen recording of the live site. The <video> ships with NO
     src: the observer assigns it only when the reel is near the viewport, and
     never at all under reduced motion or data saver, where the poster stands
     in on its own. Desktop and phone recordings are different shapes, so the
     source is chosen once per load and never swapped.

     The poster is treated the same way. A `poster` attribute has no lazy
     semantics at all: Chrome fetches it the moment the <video> is in the DOM,
     preload="none" or not, so three chapters used to cost three posters before
     anybody had scrolled. Only the first chapter is above the fold, so only the
     first one keeps an eager poster; the rest carry it on dataset.poster and
     wirePosters() promotes it well before the reel arrives. */
  function buildReel(p, wide, videos, eagerPoster) {
    const fig = doc.createElement("figure");
    fig.className = "reel reveal";

    const stage = doc.createElement("div");
    stage.className = "reel__stage";
    const bloom = doc.createElement("div");
    bloom.className = "reel__bloom";
    bloom.setAttribute("aria-hidden", "true");
    stage.appendChild(bloom);

    const frame = doc.createElement("div");
    frame.className = "frame";

    // browser chrome: dots, the real domain, a live pip
    const bar = doc.createElement("div");
    bar.className = "frame__bar";
    const dots = doc.createElement("span");
    dots.className = "dots";
    dots.setAttribute("aria-hidden", "true");
    dots.appendChild(doc.createElement("i"));
    dots.appendChild(doc.createElement("i"));
    dots.appendChild(doc.createElement("i"));
    const url = doc.createElement("span");
    url.className = "frame__url";
    url.textContent = hostOf(p.url);
    const live = doc.createElement("span");
    live.className = "frame__live";
    live.appendChild(doc.createElement("i"));
    live.appendChild(doc.createTextNode("Live"));
    bar.append(dots, url, live);

    const view = doc.createElement("div");
    view.className = "frame__view";
    // aspect reserved from the recording's own shape, so nothing shifts when
    // the file lands. Desktop captures are 1080x676, phone captures 540x1168,
    // which is what the posters beside them measure too.
    view.style.setProperty("--reel-ar", wide ? "1080 / 676" : "540 / 1168");

    const video = doc.createElement("video");
    video.className = "reel__video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    // iOS only honours inline muted autoplay when these are real attributes
    video.setAttribute("muted", "");
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "none");
    const poster = posterSrc(wide ? p.posterDesktop : p.posterPhone);
    if (eagerPoster) video.poster = poster;
    else video.dataset.poster = poster;
    // the recordings' real pixel sizes, so the intrinsic ratio agrees with the
    // one reserved above even if the CSS aspect-ratio rules ever go away
    video.width = wide ? 1080 : 540;
    video.height = wide ? 676 : 1168;
    video.setAttribute("aria-label", "Silent screen recording of the " + p.name + " home page scrolling from top to bottom.");
    video.dataset.src = wide ? p.reelDesktop : p.reelPhone;

    // The transport lives in the HUD, not floating in the middle of the frame.
    // A centred glyph landed squarely on each client's headline ("Quality
    // Brands.", "Her standards.", "Karine S. Matthews") — the one piece of text
    // the reel exists to show. It is also a real <button>, not decoration:
    // these reels loop, and looping motion needs a way to stop it (WCAG 2.2.2).
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "reel__toggle";
    toggle.setAttribute("aria-label", "Play the " + p.name + " scroll reel");
    toggle.innerHTML =
      '<svg class="i-play" viewBox="0 0 24 28" aria-hidden="true" focusable="false"><path d="M2 0l22 14L2 28z"/></svg>' +
      '<svg class="i-pause" viewBox="0 0 24 28" aria-hidden="true" focusable="false"><rect x="3" y="1" width="7" height="26" rx="1.5"/><rect x="14" y="1" width="7" height="26" rx="1.5"/></svg>';

    const hud = doc.createElement("div");
    hud.className = "reel__hud";
    const rail = doc.createElement("span");
    rail.className = "reel__rail";
    rail.setAttribute("aria-hidden", "true");
    const railFill = doc.createElement("i");
    rail.appendChild(railFill);
    const time = doc.createElement("span");
    time.className = "reel__time";
    hud.append(toggle, label("Scroll reel"), rail, time);

    // Clicking play on a reel that was never given a src (the reduced-motion and
    // data-saver path) fetches it there and then. Motion the visitor asked for
    // is not the motion those settings are protecting them from.
    toggle.addEventListener("click", () => {
      if (video.paused) {
        fig.dataset.userPaused = "";
        if (!video.getAttribute("src") && video.dataset.src) video.setAttribute("src", video.dataset.src);
        const pr = video.play();
        if (pr && pr.catch) pr.catch(() => {});
      } else {
        fig.dataset.userPaused = "1";   // an explicit pause outranks the observer
        video.pause();
      }
    });

    view.append(video, hud);
    frame.append(bar, view);
    stage.appendChild(frame);

    const cap = doc.createElement("figcaption");
    cap.className = "reel__cap";
    const caption = (p.captions && p.captions.reel) || null;
    if (caption) {
      const lead = doc.createElement("b");
      lead.textContent = caption.lead;
      cap.append(lead, doc.createTextNode(" " + caption.text));
    }

    fig.append(stage, cap);

    // transport: the rail follows the real playhead, the readout shows the
    // recording's real length. Both stay empty until the file reports them.
    video.addEventListener("loadedmetadata", () => {
      if (isFinite(video.duration)) time.textContent = clock(video.duration);
      // The frame above is reserved from the shape the recordings are meant to
      // be, which is what keeps CLS at zero. Small drift is ignored on purpose.
      // A recording of a genuinely different shape (a landscape file sitting in
      // a portrait frame, say) would be cropped to nothing, so that one case
      // corrects itself rather than shipping a ruined reel.
      if (!video.videoWidth || !video.videoHeight) return;
      const real = video.videoWidth / video.videoHeight;
      const shown = view.clientWidth / view.clientHeight;
      if (shown && Math.abs(real - shown) / shown > 0.08) {
        view.style.setProperty("--reel-ar", video.videoWidth + " / " + video.videoHeight);
      }
    });
    video.addEventListener("timeupdate", () => {
      if (!video.duration || !isFinite(video.duration)) return;
      railFill.style.width = Math.min(100, (video.currentTime / video.duration) * 100) + "%";
    });
    video.addEventListener("playing", () => {
      fig.classList.add("is-playing");
      toggle.setAttribute("aria-label", "Pause the " + p.name + " scroll reel");
    });
    video.addEventListener("pause", () => {
      fig.classList.remove("is-playing");
      toggle.setAttribute("aria-label", "Play the " + p.name + " scroll reel");
    });

    videos.push(video);
    return fig;
  }

  /* ---- the overlapping triptych of stills --------------------------------- */
  function buildStills(p) {
    const wrap = doc.createElement("div");
    wrap.className = "stills";
    const trip = doc.createElement("div");
    trip.className = "triptych";

    const caps = (p.captions && p.captions.stills) || [];
    (p.stills || []).slice(0, 3).forEach((src, i) => {
      const fig = doc.createElement("figure");
      fig.className = "tri tri--" + "abc"[i] + " reveal";
      fig.setAttribute("data-delay", String(i + 1));

      const plate = doc.createElement("div");
      plate.className = "tri__plate";
      const n = doc.createElement("span");
      n.className = "tri__n";
      n.setAttribute("aria-hidden", "true");
      n.textContent = two(i + 1);

      const img = doc.createElement("img");
      img.src = src;
      // The figcaption below carries the description. Repeating it in alt makes
      // a screen reader read every caption twice, so when there is a caption the
      // image is marked decorative instead (empty alt, never no alt).
      img.alt = caps[i] ? "" : "A section of the " + p.name + " website.";
      img.loading = "lazy";
      img.decoding = "async";
      // masters are 1440x900; they render around 410x280 on desktop and 350x230
      // on a phone, so the 900w cut carries almost every real view
      const set = stillSrcset(src);
      if (set) {
        img.srcset = set;
        img.sizes = "(max-width: 720px) 92vw, 30vw";
      }
      img.width = 1440;
      img.height = 900;
      plate.append(n, img);

      const cap = doc.createElement("figcaption");
      if (caps[i]) cap.textContent = caps[i];

      fig.append(plate, cap);
      trip.appendChild(fig);
    });

    wrap.appendChild(trip);
    return wrap;
  }

  /* ---- the written case + the spec panel ---------------------------------- */
  function buildCase(p) {
    const grid = doc.createElement("div");
    grid.className = "case";

    const body = doc.createElement("div");
    body.className = "case__body reveal";
    const para = doc.createElement("p");
    para.textContent = p.what;
    body.appendChild(para);

    if (Array.isArray(p.features) && p.features.length) {
      const chips = doc.createElement("div");
      chips.className = "chips";
      p.features.forEach((f) => {
        const c = doc.createElement("span");
        c.className = "chip";
        const dot = doc.createElement("i");
        dot.setAttribute("aria-hidden", "true");
        c.append(dot, doc.createTextNode(f));
        chips.appendChild(c);
      });
      body.appendChild(chips);
    }

    // a plain <div>, not an <aside>: the spec is part of the case, not an aside
    // to the page, and three unnamed complementary landmarks inside the article
    // is noise for anyone navigating by landmark. .spec does all the styling.
    const spec = doc.createElement("div");
    spec.className = "spec reveal";
    const dl = doc.createElement("dl");
    [["Client", p.name], ["Trade", p.trade], ["Location", p.location], ["Built", p.built]].forEach(([k, v]) => {
      if (!v) return;
      const row = doc.createElement("div");
      const dt = doc.createElement("dt");
      dt.className = "lbl";
      dt.textContent = k;
      const dd = doc.createElement("dd");
      dd.textContent = v;
      row.append(dt, dd);
      dl.appendChild(row);
    });
    spec.appendChild(dl);

    const rule = doc.createElement("div");
    rule.className = "spec__rule";
    spec.appendChild(rule);

    if (p.status) {
      const status = doc.createElement("p");
      status.className = "status";
      const pip = doc.createElement("i");
      pip.setAttribute("aria-hidden", "true");
      const txt = doc.createElement("span");
      txt.textContent = p.status;
      status.append(pip, txt);
      spec.appendChild(status);
    }

    if (p.url) {
      const visit = doc.createElement("a");
      visit.className = "visit";
      visit.href = p.url;
      visit.target = "_blank";
      visit.rel = "noopener noreferrer";
      visit.setAttribute("aria-label", "Visit the live " + p.name + " site, opens in a new tab");
      const arrow = doc.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      visit.append(doc.createTextNode("Visit the live site "), arrow);
      spec.appendChild(visit);
    }

    grid.append(body, spec);
    return grid;
  }

  /* ---- one chapter -------------------------------------------------------- */
  function buildChapter(p, i, wide, videos, eagerPoster) {
    const art = doc.createElement("article");
    art.className = "chapter";
    art.id = p.slug;
    setTone(art, p.tone);

    const wrap = doc.createElement("div");
    wrap.className = "wrap";

    const head = doc.createElement("header");
    head.className = "chapter__head";
    const ghost = doc.createElement("span");
    ghost.className = "chapter__ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = two(i + 1);
    const meta = ruleRow(label("Chapter " + two(i + 1), "lbl--lit"), label(p.trade), "chapter__meta");
    const h2 = doc.createElement("h2");
    h2.className = "chapter__name reveal";
    h2.appendChild(titleWithAccent(p.name));
    head.append(ghost, meta, h2);

    wrap.append(head, buildReel(p, wide, videos, eagerPoster), buildStills(p), buildCase(p));
    art.appendChild(wrap);
    return art;
  }

  /* ---- the rule between chapters, in the NEXT chapter's colour ------------- */
  function buildLeader(next, i) {
    const sec = doc.createElement("section");
    sec.className = "leader reveal";
    setTone(sec, next.tone);

    const wrap = doc.createElement("div");
    wrap.className = "wrap";

    const link = doc.createElement("a");
    link.className = "leader__link";
    link.href = "#" + next.slug;
    link.setAttribute("aria-label", "Next chapter: " + next.name);

    const rule = doc.createElement("span");
    rule.className = "leader__rule";
    rule.setAttribute("aria-hidden", "true");

    const nextLbl = label("Next", "leader__lead");
    const name = doc.createElement("span");
    name.className = "lbl leader__name";
    const num = doc.createElement("b");
    num.textContent = two(i + 2);
    name.append(num, doc.createTextNode(" " + next.name));

    link.append(nextLbl, rule, name);
    wrap.appendChild(link);
    sec.appendChild(wrap);
    return sec;
  }

  /* ---- the title-card index in the hero ----------------------------------- */
  function renderIndex(projects) {
    const mount = doc.querySelector("[data-work-index]");
    if (!mount) return;
    mount.textContent = "";
    projects.forEach((p, i) => {
      const li = doc.createElement("li");
      const a = doc.createElement("a");
      a.className = "work-index__item";
      a.href = "#" + p.slug;
      setTone(a, p.tone);

      const n = doc.createElement("span");
      n.className = "work-index__n";
      n.textContent = two(i + 1);

      const box = doc.createElement("span");
      const name = doc.createElement("b");
      name.className = "work-index__name";
      name.textContent = p.name;
      const what = doc.createElement("span");
      what.className = "work-index__what";
      what.textContent = [p.trade, p.location].filter(Boolean).join(", ");
      box.append(name, what);

      a.append(n, box);
      li.appendChild(a);
      mount.appendChild(li);
    });
  }

  /* ---- the smaller entries (one line, one card) --------------------------- */
  function renderAlso(list) {
    const mount = doc.querySelector("[data-work-also]");
    if (!mount) return;
    if (!Array.isArray(list) || !list.length) return;   // stays hidden
    mount.hidden = false;

    const wrap = doc.createElement("div");
    wrap.className = "wrap";
    wrap.appendChild(ruleRow(label("Also shipped"), label(list.length === 1 ? "One more" : list.length + " more"), "also__head"));

    const grid = doc.createElement("div");
    grid.className = "also__grid";

    list.forEach((p) => {
      const card = doc.createElement("a");
      card.className = "also-card reveal";
      card.href = p.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      // no aria-label here: one on the <a> would override the whole subtree, so
      // the one-liner, the trade and the location would never be announced. The
      // card's own content names the link; the new-tab warning is appended at
      // the end as text only a screen reader sees.

      const shot = doc.createElement("div");
      shot.className = "also-card__shot";
      const img = doc.createElement("img");
      img.src = p.card;
      img.alt = p.name + " website home page.";
      img.loading = "lazy";
      img.decoding = "async";
      // the cards are portrait 800x1000, not landscape: the wrong numbers here
      // were only harmless while the CSS aspect-ratio rule was winning
      img.width = 800;
      img.height = 1000;
      shot.appendChild(img);

      const body = doc.createElement("div");
      body.className = "also-card__body";
      const name = doc.createElement("b");
      name.className = "also-card__name";
      name.textContent = p.name;
      const line = doc.createElement("p");
      line.className = "also-card__line";
      line.textContent = p.oneLiner || "";
      const meta = doc.createElement("span");
      meta.className = "lbl also-card__meta";
      meta.textContent = [p.trade, p.location].filter(Boolean).join(" · ");
      body.append(name, line, meta);

      card.append(shot, body, srOnly(" (opens in a new tab)"));
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    mount.appendChild(wrap);
  }

  /* ---- posters: the first one eagerly, the rest on approach ---------------
     Runs on every path, including the quiet ones, because under reduced motion
     or data saver the poster IS the reel and something has to paint. Those two
     take their posters immediately rather than depending on an observer, and so
     does anything without IntersectionObserver. */
  function wirePosters(videos, quiet) {
    const pending = videos.filter((v) => v.dataset.poster);
    if (!pending.length) return;

    const show = (v) => {
      if (!v.dataset.poster) return;
      v.poster = v.dataset.poster;
      delete v.dataset.poster;
    };

    if (quiet || typeof IntersectionObserver !== "function") {
      pending.forEach(show);
      return;
    }

    // deliberately generous: the poster wants to be decoded before the reel is
    // on screen, not as it lands
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        show(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: "600px 0px", threshold: 0 });

    pending.forEach((v) => io.observe(v));
  }

  /* ---- reels: one plays at a time, and only near the viewport -------------- */
  function wireReels(videos, quiet) {
    if (!videos.length) return;
    // Reduced motion or data saver: the src is never assigned, so nothing is
    // fetched and nothing moves. The poster frame is the whole reel.
    if (quiet) return;

    let playing = null;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          // Someone who pressed pause meant it. Scrolling away and back must not
          // quietly start the loop again.
          const fig = v.closest(".reel");
          if (fig && fig.dataset.userPaused === "1") return;
          if (playing && playing !== v) playing.pause();
          playing = v;
          if (!v.getAttribute("src") && v.dataset.src) v.setAttribute("src", v.dataset.src);
          const p = v.play();
          if (p && p.catch) p.catch(() => {});   // autoplay blocked or file missing: poster stays
        } else {
          v.pause();
          if (playing === v) playing = null;
        }
      });
    }, { rootMargin: "200px 0px", threshold: 0.01 });

    videos.forEach((v) => io.observe(v));

    // A paused reel still holds its whole decoded buffer, so scrolling past all
    // three left several megabytes resident for the rest of the session. This
    // second observer is deliberately slack: it only lets go once the reel is
    // more than one and a half viewports away, far enough that ordinary scroll
    // jitter can never cost a re-download. dataset.src survives, so coming back
    // simply re-assigns it.
    const far = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) return;
        const v = e.target;
        if (!v.getAttribute("src")) return;
        v.pause();
        if (playing === v) playing = null;
        v.removeAttribute("src");
        v.load();   // drops the buffer and puts the poster back
        // load() empties the element's event queue, so the pause above never
        // reaches its listener. Clear the flag by hand or the play glyph stays
        // hidden on a reel that is now just a poster.
        const fig = v.closest(".reel");
        if (fig) fig.classList.remove("is-playing");
      });
    }, { rootMargin: "150% 0px", threshold: 0 });

    videos.forEach((v) => far.observe(v));

    // never leave a reel running in a hidden tab
    doc.addEventListener("visibilitychange", () => {
      if (doc.hidden && playing) playing.pause();
    });
  }

  /* ---- entry point (called by script.js boot()) --------------------------- */
  window.PAGE_INIT = function (ctx) {
    const W = S && S.work;
    const mount = doc.querySelector("[data-work-chapters]");
    if (!W || !mount) return;

    const projects = Array.isArray(W.projects) ? W.projects : [];
    // one source per load, chosen from the viewport. No swap on resize: a reel
    // that reloads mid-scroll costs more than a slightly wide frame.
    const wide = window.matchMedia("(min-width: 721px)").matches;
    const quiet = ctx.REDUCED || (navigator.connection && navigator.connection.saveData) || false;
    const videos = [];

    const count = doc.querySelector("[data-work-count]");
    // every site on the page: the full chapters plus the smaller "also" entries
    const shipped = projects.length + (W.also ? W.also.length : 0);
    if (count) count.textContent = shipped + (shipped === 1 ? " site" : " sites");

    renderIndex(projects);

    const frag = doc.createDocumentFragment();
    projects.forEach((p, i) => {
      // only chapter one is above the fold, so only chapter one pays for its
      // poster up front
      frag.appendChild(buildChapter(p, i, wide, videos, i === 0));
      if (projects[i + 1]) frag.appendChild(buildLeader(projects[i + 1], i));
    });
    mount.appendChild(frag);

    renderAlso(W.also);
    wirePosters(videos, quiet);
    wireReels(videos, quiet);
  };
})();
