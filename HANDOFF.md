# Offsider — agency website (HANDOFF)

New marketing site for Nicholas's AI automation agency. Positioning: **"Done-for-you AI staff. You employ it, you don't operate it."** Diagnosis-led: we find what's leaking, deploy the AI staff that fix it, and manage it.

Built fresh 2026-07-22. Replaces the old single-product "Sarah receptionist" landing.

**2026-07-28 — Hero rebuild + character redesign.** The hero is now a full-bleed cinematic video band (dark, copy over a scrim) that introduces the crew instead of repeating the Problem/Diagnosis body copy; the old hero phone mock (duplicate of "watch a lead book itself") is gone. The roster is the real 6-agent offering shown as original 3D mascot characters (not human portraits), plus an "automates all repetitive admin" catch-all. New animation layer: hero headline word-stagger, count-up stats, magnetic primary CTA (desktop), sticky mobile CTA bar, scroll cue. **Later same day — hero intelligence layer:** live crew-at-work feed (glass cards cycling from `hero.feed` in content.js, desktop only), rotating headline second line (`hero.rotate`, h1 height locked so no CLS, static under reduced-motion), and a neural constellation canvas over the video (`wireHeroNet`, desktop only, rAF pauses off-screen/hidden tab). Verified 16/16 headless (1440, 1160, 390, reduced-motion, console clean).

**2026-07-29 — Offer upgrade.** Guarantee section rebuilt around the activity-based **60-Second Promise** (dark prominent promise band with a "60 sec" seal, refunds the current month only, conditioned on calls/leads routed through the AI staff, never promises jobs/revenue); pricing gains a 10-item **value stack** (reuses `.check-list`) and an honest **scarcity** line (limited crews per month, one per trade); "how it works" + final CTA reframed to the free **Leak Audit**; robot-voice FAQ rewritten for Sarah-voice honesty ("a natural Australian voice, trained on your business", never "your voice" — Ada's roster line fixed to match) and a new "How does the 60-Second Promise work?" FAQ added. Verified 24/24 headless (1440 + 390): promise band + seal + `{i:free}` italic, 10-item value stack with ticks, scarcity line, new FAQ, no "your voice" in DOM, 0 console errors, no horizontal overflow.

**2026-07-29 — Review fixes pass (copy honesty + perf + a11y + design polish).** Batch of reviewed fixes applied across all four files:
- **Copy (content.js):** offer renamed to the free **Leak Audit** (primary CTA rebinds nav/hero/pricing/sticky/final at once); secondary CTA now honest **"Meet the crew"** (links to #staff, no audio); over-promises softened on Star (review) + Nudge (quote follow-up) lines; pricing heading drops "Ten times" → "Round-the-clock coverage"; ROI heading serif accent de-duped to `{i:quietly}`; how heading gains `{i:days}`; robot-voice FAQ reworded (briefed on your services/prices, never "your voice"); three FAQ items added (phone number, escalation, right-for-my-business); hero sub tightened.
- **index.html:** How heading mount → `data-bind-html` (renders `{i:days}`); em-dashes in `<title>` + `og:title` → colon; skip link → `#top`; guarantee section gets `guarantee--dark`; FAQ wrapper `wrap--narrow` → `wrap`. **Hero text mounts now carry static fallback copy** (mirrors content.js, overwritten by bind) so the hero paints at final height before the parser-blocking scripts run — this is the real CLS fix (empty `[data-bind]` hero was shifting ~0.13 as JS injected copy after first paint).
- **Perf:** 6 character PNGs (7.37 MB) resized to 400×400 WebP q85 (**115.8 KB total**, alpha preserved; PNGs kept on disk); portraits now **lazy-load** via IntersectionObserver on `#staff` (rootMargin 400px), not synchronously at boot; hero video gated off ≤767px (mobile keeps 40KB poster); `.hero__title .hw` `display:inline-block` made unconditional (only opacity/transform gated behind `.is-ready`); `wireStickyCta` early-returns on desktop.
- **A11y:** roster tone-on-white text (by-line, quote glyphs, initial) now uses `--tone-ink = color-mix(in srgb, var(--tone) 62%, var(--ink))` — all 9 tones pass AA (ratios 5.39–8.66, lowest = gold); bright `--tone` kept for glow/border/bg. ROI sliders: visible focus ring + 44px transparent hit area with the 6px track moved to pseudo-elements (thumb re-centred `margin-top:-10px`).
- **Design:** guarantee is a full-bleed dark "moment" (light-blue kicker/seal, translucent promise panel, dark step cards); value-stack tinted `--accent-soft` to separate from the grey human card; FAQ heading realigned to the left rail (`.faq-list` capped 760px); low-contrast fine print on dark panels nudged to ~.7.
- **Verified (Python Playwright, 1440 + 390):** 0 console errors both widths; no horizontal overflow at 390; CLS over load + hero-into-place = **0.0065 (1440) / 0.0287 (390)**, h1 height constant from first paint (177/177, 132/132); 6 WebP load 200 + roster shows images; hero video src empty at 390, `hero.mp4` at 1440; slider element height 44px and drags/recomputes; guarantee renders dark + legible; new FAQ items present; primary CTA reads "Book your free Leak Audit"; no "your voice", no em-dashes in rendered prose. NOTE: a full desktop scroll-through still logs a large CLS from the **book-itself ScrollTrigger pin-spacer** (desktop-only pin, pre-existing, left untouched per the mobile-smoothness gate) — not a load/hero shift.

**2026-07-29 — Positioning reframe.** The offer is now packaged as the flagship **"The Never Miss System"** (hero eyebrow, pricing kicker + includes label, roster sub, meta/OG), with the 6-agent crew positioned as the team that RUNS the system; leads with the full system and offers a single-worker (e.g. AI receptionist) "start smaller" downsell. Copy-only reframe, no CSS/JS changes.

**2026-07-29 — Preview deployed** to GitHub Pages (repo `Fiqwy/offsider-site`, main/root) so Nicholas can review on mobile. WIP preview only; `/security-scan` still required before the real production launch.

**2026-07-30 — Mobile hero parity.** The video background, neural constellation and live notification feed were desktop-only; now they run on mobile too (Nicholas flagged the iPhone hero looked plain). `wireHeroVideo` no longer gates out phones (poster still LCP; reduced-motion + saveData still poster-only). `wireHeroNet` runs on mobile at reduced density (~22 nodes vs 45, DPR capped 1.5) and still pauses off-screen. `wireHeroFeed` shows ONE card at a time on mobile, cycling every 3.5s in a fixed-height slot below the proof line (desktop two-up stack unchanged). CSS: removed the `<1025px { display:none }` on `.hero__feed`/`.hero__net`, added the mobile feed layout + hero padding. Verified 390×844 + reduced-motion + desktop 1440: 0 console errors, no overflow, constellation pauses off-screen, reduced-motion still poster-only/no-feed/no-canvas, desktop visually unchanged. (Minor: mobile reduced-motion hero keeps the 12rem bottom padding = a little empty space; harmless.)

**2026-07-30 — Brand rename: Offsider → Applied Intelligence.** Brand-layer rename only. Everyday name **Applied Intelligence**, full/legal **Applied Intelligent Systems & Automations**, short/compact **AISA**; contact email now **hello@appliedintelligence.biz**. New logo mark: an **"Ai" monogram tile** (rounded blue square, white A + lowercase i, i-dot drawn as a distinct node nodding to the hero constellation), reused as favicon AND the nav/footer mark. Nav + footer rebuilt as a mark + wordmark lockup (`.brand-mark` + `.brand-word`; nav shows the full wordmark on desktop and swaps to the compact "AISA" under the 960px mobile breakpoint); footer adds a small legal line bound to `brand.fullName`. `content.js` `brand` block rewritten (adds `short` + `fullName`, drops the stale Offsider/AU-slang comments). `<title>`/description/OG + both hardcoded mailto fallbacks updated; dashboard mock now reads "AISA · Live". Product (**"The Never Miss System"**), the crew/agent names, the offer and all section copy are **unchanged**. Folder + GitHub repo intentionally kept as `offsider-site` to preserve the live GitHub Pages URL. Verified headless (Python Playwright, desktop 1440 + mobile 390 + reduced-motion): 0 console errors, favicon 200, no "offsider"/`hello@offsider.ai` anywhere in the rendered DOM or title, both mailto = hello@appliedintelligence.biz, no horizontal overflow at 390.

## ⭐ AGREED NEXT — roster restructure (DECIDED with Nicholas, NOT YET BUILT)
Tighten the crew so it is logical and honest. Target 6-agent roster:
- **Zip** — Speed-to-Lead (unchanged).
- **Ada** — AI Receptionist, ONE agent with two coverage levels. START **after-hours** (low-risk proving ground: a missed after-hours call is already a lost job, so nothing to lose) → **upgrade to full-time** once proven. MERGE the current Ada(full-time) + Echo(after-hours) into this single agent; after-hours is a tier/entry, NOT a separate character. Put the after-hours→full-time story in Ada's card.
- **Nudge** → upgrade to **"Quotes & Invoices"**: builds the quote from the client's pricing guide, chases it to close, then raises the invoice and chases payment. (Was "Quote Follow-up".)
- **Leo** — NEW **Customer Service** agent (answers customer questions via SMS/email/chat, nurses warm leads to a booking). Reuse Echo's indigo mascot art for Leo (no new image generation).
- **Star** — Reviews (unchanged).
- **Boomer** — Reactivation, marked **OPTIONAL / situational** (not everyone has a list to win back).
Also **reword the guarantee "no-quoting-prices" guardrail** to: "never invents a price, only quotes from your rules, and you can stop any worker from quoting at all" — so the Quotes & Invoices agent is possible without breaking the safety promise.
Ripples to update: `hero.feed` (drop/adjust the Echo after-hours entry), the dashboard mock names in `script.js` `buildDash`, the value-stack + pricing copy, `roster.sub`, and re-normalise the mascot set if it changes (currently normalised for the 6 existing characters).

## Run locally
```
cd "~/claude code projects/offsider-site"
python3 -m http.server 8799
# open http://localhost:8799
```

## Stack (locked convention)
Vanilla HTML/CSS/JS. Lenis + GSAP + ScrollTrigger, vendored in `vendor/`. No framework/build step.

## Files
- `index.html` — thin shell: section landmarks + empty `[data-*]` mount points.
- `content.js` — **single source of truth.** All copy, the AI-staff roster, stats, FAQ, ROI defaults, brand name. Edit here.
- `script.js` — renders the page from `content.js`, wires Lenis+GSAP (single ticker, touch-gated), the scroll-driven phone section, ROI calculator, FAQ, reveals, nav.
- `styles.css` — design system (clean/bright/trustworthy, Apple/Stripe restraint) + all components.
- `assets/characters/` — 6 original 3D mascot PNGs, transparent (zip/ada/echo/nudge/boomer/star .png, 1024², Higgsfield nano_banana_pro + remove_background). `assets/portraits/` (old human headshots) is retired but still on disk.
- `assets/video/` — `hero.mp4` (~5s loop, 720p, 304KB, Higgsfield kling3_0_turbo) + `hero-poster.jpg` (LCP image / fallback, 40KB). Swap either anytime; poster shows on reduced-motion/save-data.
- `assets/logo/favicon.svg` — brand mark: interlocking rounded-square "linked systems" tile in brand blue (Option 4, chosen 2026-07-30); reused as favicon AND the nav/footer mark. (Superseded the earlier "Ai" monogram.)

## What's on the page (section order)
**Full-bleed video hero** (crew intro, light nav over dark, scroll cue) → trust strip → the problem (leak stats, count-up) → the diagnosis wedge (Diagnose/Deploy/Manage) → **⭐ "Watch a lead book itself"** (scroll-driven phone: desktop pinned-scrub, mobile autoplay) → meet your AI staff (6 mascot hire-cards: Zip speed-to-lead, Ada full-time reception, Echo after-hours reception, Nudge quote follow-up, Boomer reactivation, Star reviews + admin catch-all chips) → one cockpit (dashboard mock, new crew names) → ROI calculator → how it works → pricing (salary-anchored, no numbers) → guarantee → FAQ → final CTA (mailto). Sticky mobile CTA bar appears after the hero (≤960px only).

## Verified (2026-07-28, Playwright: 27/27)
- 0 console errors (desktop 1440×900, iPhone 390×844, reduced-motion).
- Hero video autoplays on desktop; poster-only under reduced-motion/save-data; nav flips light→stuck at 0.6×viewport.
- No horizontal overflow; sticky CTA mobile-only and appears past hero; headline word-stagger reveals fully.
- Phone section: desktop pinned-scrub; mobile auto-plays once on enter (no pin/scrub). Reduced-motion shows everything static.
- FAQ accordion + ROI sliders interactive and correct; stats/KPIs count up once on reveal.

## OPEN ITEMS before going live (need Nicholas)
1. **Brand name — RESOLVED 2026-07-30:** Applied Intelligence (full "Applied Intelligent Systems & Automations", short "AISA"). Flag still open: "AISA" clashes with the Australian Information Security Association and "Applied Intelligence" is generic — do an IP Australia + domain/handle check before spending on the acronym.
2. **AI-staff character names + roster restructure.** See the "AGREED NEXT — roster restructure" block above (merge receptionists into Ada with after-hours→full-time, Nudge → Quotes & Invoices, add Leo Customer Service, Boomer optional). Not yet built.
3. **Booking mechanism.** CTAs are `mailto:hello@appliedintelligence.biz`. Swap for a Cal.com / Calendly embed in the `#book` section; update `brand.email` / `brand.bookingUrl` in `content.js`.
4. **Real proof — HONESTY RULE (do not violate).** The trust strip must NOT name businesses as if they are AI customers. There are no live AI clients yet, and the website clients (Goldy, Control Detailing, Good Coast, Switch-On, Shocked Solar) did NOT buy the AI product (Switch-On isn't even a website client) — naming them as endorsements is misleading under AU Consumer Law. Trust strip currently shows honest, no-name credibility (Australian owned, founder-led, no lock-in, you approve every message). Only add a real client logo + hard-dollar result once a pilot is LIVE and has given written consent to be named.
5. **Domain + deploy.** Nicholas's Cloudflare (DNS/CDN) + GitHub Pages/DigitalOcean. Run `/security-scan` before production deploy. Asset paths are all relative (subpath-safe). Currently on GitHub Pages: `Fiqwy/offsider-site` → https://fiqwy.github.io/offsider-site/ (repo/folder kept named offsider-site to preserve the URL).

## Notes
- Australian English, no em-dashes (house style).
- Pricing never shows a number and never compares to SaaS — it anchors to a salary (compliance + strategy).

**2026-08-04 — Booking section.** The #book section is now a real booking area: left card = "What happens on the call" (3 points + no-cost/one-per-trade note, from `content.js booking`), right card = calendar slot (`renderBooking()` in script.js). Behaviour: if `brand.bookingUrl` starts with https:// it lazy-embeds the calendar iframe (Cal.com `?embed=true&theme=light` or Calendly `?hide_gdpr_banner=1`) when the section nears the viewport; otherwise a converting interim card (email CTA) shows. TO ACTIVATE THE CALENDAR: set `brand.bookingUrl` in content.js to the real Cal.com/Calendly event URL. Mobile stacks calendar-first.

**2026-08-04 — Voice cloning added as a paid UPGRADE.** Nicholas confirmed he can deliver owner-voice cloning (ElevenLabs). Copy updated in Ada's card + the robot-voice FAQ: DEFAULT receptionist voice remains the natural Australian voice; cloning is framed as an upgrade, "cloned with your consent", owner's own voice only. RULE UPDATE: the old "never say 'your voice'" rule is amended — "your own voice" claims are allowed ONLY in this cloning-upgrade context (never implying it is the default). Recommended delivery practice (not on site): the cloned voice should still introduce itself as the business's assistant, not impersonate the owner, to stay clear of misleading-conduct territory.
