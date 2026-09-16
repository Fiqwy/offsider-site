/* The 60-Second Website Health Check.
 *
 * One input, a poll, a verdict, a gate. Deliberately much smaller than audit.js, because that
 * page has to mirror a scoring engine in the browser and this one does not: every number here
 * is computed on the server and arrives ready to print. There is nothing to keep in lockstep.
 *
 * THE ONE RULE: this file renders what the API sends and never derives a finding of its own.
 * The server decides what is free and what is behind the gate, so a curious visitor reading
 * the network tab finds exactly what the page shows them and nothing more.
 */
(function () {
  'use strict';

  var API = window.SC_API || '';
  var POLL_MS = 1500;
  var POLL_MAX = 60;                 // 90 seconds, well past the 22s the server budgets

  var el = {
    form: document.getElementById('sc-form'),
    url: document.getElementById('sc-url'),
    go: document.getElementById('sc-go'),
    err: document.getElementById('sc-err'),
    progress: document.getElementById('sc-progress'),
    bar: document.getElementById('sc-bar'),
    msg: document.getElementById('sc-msg'),
    result: document.getElementById('sc-result')
  };

  var state = { token: null, ticks: 0, busy: false, host: '', result: null };

  // ---- small helpers -----------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(node, on) { node.hidden = !on; }

  function fail(message) {
    el.err.textContent = message || '';
    el.url.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }

  function beacon(step) {
    try {
      var payload = JSON.stringify({ step: step });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API + '/api/public/site-check/step',
                             new Blob([payload], { type: 'text/plain' }));
      }
    } catch (e) { /* a counter is never worth an error in front of a visitor */ }
  }

  // ---- rendering ---------------------------------------------------------

  var RING = { broken: '#c8332b', weak: '#c8332b', workable: '#b4690e', strong: '#16a34a' };

  function findingHTML(f) {
    return '<li class="sc-finding' + (f.serious ? ' sc-finding--serious' : '') + '">' +
             '<span class="sc-finding__dot"></span>' +
             '<div><span class="sc-finding__area">' + esc(f.area || '') + '</span>' +
             '<p class="sc-finding__text">' + esc(f.problem) + '</p></div>' +
           '</li>';
  }

  function evidenceHTML(r) {
    if (!r.speed && !(r.citations || []).length) return '';
    var out = '<div class="sc-evidence">';
    if (r.speed) out += '<p class="sc-evidence__lead">' + esc(r.speed.headline) + '</p>';
    (r.citations || []).forEach(function (c) {
      out += '<p class="sc-cite"><strong>' + esc(c.label) + '</strong> &middot; ' +
             '<a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' +
             esc(c.title) + '</a><br>' + esc(c.population) + '</p>';
    });
    if (r.disclosure) out += '<p class="sc-disclosure">' + esc(r.disclosure) + '</p>';
    return out + '</div>';
  }

  function verdictHTML(r) {
    var pct = Math.max(0, Math.min(100, r.score == null ? 0 : r.score));
    var count = r.problems === 1
      ? 'We found <b>1 problem</b> on your site.'
      : 'We found <b>' + r.problems + ' problems</b> on your site.';
    if (r.serious > 0) {
      count += ' ' + (r.serious === 1 ? '1 is serious.' : r.serious + ' are serious.');
    }
    return '<div class="sc-verdict">' +
             '<div class="sc-score">' +
               '<div class="sc-score__ring" style="--sc-pct:' + pct + ';--sc-ring:' +
                 (RING[r.band] || 'var(--accent-ink)') + '">' +
                 '<div><span class="sc-score__num">' + (r.score == null ? '&mdash;' : r.score) +
                 '</span><span class="sc-score__of">out of 100</span></div>' +
               '</div>' +
               (r.band_label ? '<p class="sc-band" data-band="' + esc(r.band) + '">' +
                               esc(r.band_label) + '</p>' : '') +
             '</div>' +
             '<div class="sc-verdict__body">' +
               '<p class="sc-count">' + count + '</p>' +
               '<p class="sc-headline">' + esc(r.headline) + '</p>' +
             '</div>' +
           '</div>';
  }

  function noteHTML(r) {
    // A dead www or apex. Not a scored finding, because no check in the engine measures it,
    // but it is often the single most useful thing on the page: a whole half of somebody's
    // domain serving an error is invisible to the owner, who only ever types one of them.
    return r.note ? '<p class="sc-note-flag">' + esc(r.note) + '</p>' : '';
  }

  function lockedHTML(r) {
    var free = (r.findings || [])[0];
    var hidden = r.locked_count || 0;
    var ghosts = '';
    for (var i = 0; i < Math.min(hidden, 4); i++) {
      ghosts += '<li class="sc-finding"><span class="sc-finding__dot"></span><div>' +
                '<span class="sc-finding__area">Locked</span>' +
                '<p class="sc-finding__text">' +
                'One of the remaining problems, and what it means for you.' +
                '</p></div></li>';
    }
    return (free ? '<p class="sc-section-label">The biggest one, free</p>' +
                   '<ul class="sc-findings">' + findingHTML(free) + '</ul>' : '') +
           evidenceHTML(r) +
           (hidden > 0
             ? '<p class="sc-section-label">The other ' + hidden + '</p>' +
               '<div class="sc-locked">' +
                 '<ul class="sc-findings sc-locked__veil">' + ghosts + '</ul>' +
                 '<div class="sc-gate">' +
                   '<div class="sc-gate__card">' +
                     '<h2 class="sc-gate__title">See the other ' + hidden + '</h2>' +
                     '<p class="sc-gate__sub">Where to send them. We will also ring you once ' +
                       'to talk through the worst of them, and you can say no thanks.</p>' +
                     '<form id="sc-gate-form" novalidate>' +
                       '<div class="sc-gate__fields">' +
                         '<input class="sc-input" name="name" placeholder="First name" ' +
                           'autocomplete="given-name" />' +
                         '<input class="sc-input" name="mobile" type="tel" placeholder="Mobile" ' +
                           'autocomplete="tel" inputmode="tel" />' +
                         '<input class="sc-input" name="email" type="email" placeholder="Email" ' +
                           'autocomplete="email" inputmode="email" />' +
                         '<input class="sc-hp" name="contact_ref2" tabindex="-1" ' +
                           'aria-hidden="true" autocomplete="off" />' +
                       '</div>' +
                       '<button class="btn btn--primary btn--lg sc-gate__btn" type="submit">' +
                         'Show me the rest</button>' +
                       '<p class="sc-err" id="sc-gate-err" role="alert"></p>' +
                       '<p class="sc-gate__fine">No newsletter. We do not sell or share it.</p>' +
                     '</form>' +
                   '</div>' +
                 '</div>' +
               '</div>'
             : '');
  }

  function unlockedHTML(r) {
    var items = (r.findings || []).map(findingHTML).join('');
    return '<p class="sc-section-label">Everything we found</p>' +
           '<ul class="sc-findings">' + items + '</ul>' +
           evidenceHTML(r) +
           (r.unpriced_note ? '<p class="sc-disclosure">' + esc(r.unpriced_note) + '</p>' : '') +
           '<div class="sc-close">' +
             '<p class="sc-close__line">We rebuild sites like this. If you want, we will ' +
               'walk you through the list on a short call and tell you what we would do first.</p>' +
             '<a class="btn btn--primary btn--lg" href="index.html#book">Book a 15-minute call</a>' +
           '</div>';
  }

  function render(r, unlocked) {
    state.result = r;
    el.result.innerHTML = '<div class="sc-card">' + verdictHTML(r) + noteHTML(r) +
                          (unlocked ? unlockedHTML(r) : lockedHTML(r)) + '</div>' +
                          '<p class="sc-again"><button type="button" id="sc-again">' +
                          'Check another site</button></p>';
    show(el.result, true);
    wireResult();
  }

  // ---- flow --------------------------------------------------------------

  /* The bar creeps between server updates.
   *
   * The server reports at a handful of real milestones, and the two jobs it runs in parallel
   * have no inner progress to report, so a bar driven straight off those numbers sits dead at
   * 15% for fifteen seconds and reads as broken. Observed on the first live run.
   *
   * So the number the server sends is a TARGET and the bar eases toward it, then keeps
   * inching a little past it while it waits, capped well short of the end. It never reaches
   * 100 on a guess: only a finished check does that.
   */
  var shown = 4, target = 4, creep = null;

  function paint() { el.bar.style.width = Math.max(4, Math.min(100, shown)) + '%'; }

  function startCreep() {
    if (creep) return;
    creep = setInterval(function () {
      var ceiling = Math.min(94, target + 14);
      if (shown < target) shown += Math.max(0.5, (target - shown) * 0.18);
      else if (shown < ceiling) shown += 0.22;
      paint();
    }, 120);
  }

  function stopCreep() { if (creep) { clearInterval(creep); creep = null; } }

  function setProgress(pct, message) {
    if (typeof pct === 'number' && pct > target) target = pct;
    startCreep();
    el.msg.innerHTML = esc(message || 'Working') +
      (state.host ? ' <span class="sc-progress__host">' + esc(state.host) + '</span>' : '');
  }

  function finishProgress() { stopCreep(); shown = 100; target = 100; paint(); }

  function poll() {
    if (!state.token) return;
    state.ticks++;
    if (state.ticks > POLL_MAX) { stop('That took longer than it should have. Try again.'); return; }

    fetch(API + '/api/public/site-check/' + encodeURIComponent(state.token))
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b || b.success === false) { stop('We could not finish that check.'); return; }
        if (b.status === 'failed') { stop(b.error || 'We could not read that site.'); return; }
        if (b.status === 'done' && b.result) {
          finishProgress();
          show(el.progress, false);
          el.go.disabled = false;
          el.go.textContent = 'Check my site';
          state.busy = false;
          beacon('result');
          render(b.result, !!b.result.unlocked);
          return;
        }
        setProgress(b.progress_pct, b.progress);
        setTimeout(poll, POLL_MS);
      })
      .catch(function () { setTimeout(poll, POLL_MS); });
  }

  function stop(message) {
    stopCreep();
    show(el.progress, false);
    el.go.disabled = false;
    el.go.textContent = 'Check my site';
    state.busy = false;
    state.token = null;
    fail(message);
  }

  function begin(ev) {
    if (ev) ev.preventDefault();
    if (state.busy) return;
    fail('');
    var value = (el.url.value || '').trim();
    if (!value || value.indexOf('.') === -1) {
      fail('Pop your website address in there, like yourbusiness.com.au');
      el.url.focus();
      return;
    }

    state.busy = true;
    state.ticks = 0;
    state.host = value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    el.go.disabled = true;
    el.go.textContent = 'Checking';
    show(el.result, false);
    show(el.progress, true);
    shown = 4; target = 4; paint();
    setProgress(4, 'Looking up your address');
    beacon('start');

    post('/api/public/site-check/start', {
      url: value,
      contact_ref2: el.form.elements.contact_ref2.value || '',
      utm: readUtm()
    }).then(function (res) {
      if (!res.ok || !res.body.success || !res.body.token) {
        stop(res.body && res.body.error ? res.body.error : 'We could not start that check.');
        return;
      }
      state.token = res.body.token;
      setTimeout(poll, POLL_MS);
    }).catch(function () { stop('We could not reach the check. Try again in a moment.'); });
  }

  function submitGate(ev) {
    ev.preventDefault();
    var form = ev.target;
    var errNode = document.getElementById('sc-gate-err');
    var btn = form.querySelector('button[type="submit"]');
    errNode.textContent = '';
    btn.disabled = true;
    btn.textContent = 'One moment';

    post('/api/public/site-check/gate', {
      token: state.token,
      name: form.elements.name.value,
      mobile: form.elements.mobile.value,
      email: form.elements.email.value,
      contact_ref2: form.elements.contact_ref2.value || '',
      utm: readUtm()
    }).then(function (res) {
      if (!res.ok || !res.body.success) {
        errNode.textContent = (res.body && res.body.error) || 'That did not go through.';
        btn.disabled = false;
        btn.textContent = 'Show me the rest';
        return;
      }
      beacon('gated');
      if (res.body.result) render(res.body.result, true);
      window.scrollTo({ top: el.result.offsetTop - 60, behavior: 'smooth' });
    }).catch(function () {
      errNode.textContent = 'That did not send. Try again in a moment.';
      btn.disabled = false;
      btn.textContent = 'Show me the rest';
    });
  }

  function wireResult() {
    var gate = document.getElementById('sc-gate-form');
    if (gate) {
      gate.addEventListener('submit', submitGate);
      beacon('gate_seen');
    }
    var again = document.getElementById('sc-again');
    if (again) {
      again.addEventListener('click', function () {
        state.token = null;
        state.result = null;
        show(el.result, false);
        el.url.value = '';
        el.url.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  function readUtm() {
    try {
      var q = new URLSearchParams(window.location.search);
      var out = {};
      ['source', 'medium', 'campaign', 'content'].forEach(function (k) {
        var v = q.get('utm_' + k);
        if (v) out[k] = v.slice(0, 100);
      });
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }

  el.form.addEventListener('submit', begin);
  beacon('land');

  // Prefill from ?url= so a cold-call link can arrive ready to run.
  try {
    var pre = new URLSearchParams(window.location.search).get('url');
    if (pre) { el.url.value = pre; }
  } catch (e) { /* no query string, nothing to do */ }
})();
