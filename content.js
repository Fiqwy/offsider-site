/* =============================================================================
   content.js — single source of truth for all site copy + data.
   Swap the brand name, roster, stats, FAQ here and the whole site updates.
   Australian English. No em-dashes in prose.
   ========================================================================== */

window.SITE = {
  /* ---- Brand (change BRAND in one place) --------------------------------- */
  brand: {
    name: "Applied Intelligence",
    short: "AISA",
    fullName: "Applied Intelligent Systems & Automations",
    tagline: "Done-for-you AI staff. You employ it, you don't operate it.",
    location: "Gold Coast, Australia",
    email: "nickjmatthews@pm.me",
    phone: "",                  // add real number when live
    // TODO (Nicholas): supply the real ABN before terms.html goes live. The
    // terms and privacy pages both identify the trading entity by ABN.
    abn: "",
    bookingUrl: "#book",        // swap for Cal.com / Calendly embed URL
  },

  /* ---- Primary + secondary calls to action ------------------------------- */
  cta: {
    primary: "Book your free Leak Audit",
    secondary: "Meet the crew",
  },

  /* ---- Hero -------------------------------------------------------------- */
  hero: {
    // the one editorial serif-italic word is wrapped by the build: {i:...}
    // Does a DIFFERENT job than the body: introduces the crew + the model.
    // The Problem, the leaks and the proof all live in their own sections below.
    eyebrow: "The Never Miss System · Gold Coast",
    headline: ["Hire a crew that", "never clocks {i:off}."],
    // rotating second line of the h1 (first = the static/no-JS fallback above).
    // JS (wireHeroRotate) swaps these every few seconds; reduced-motion stays static.
    rotate: [
      "never clocks {i:off}.",
      "answers at {i:2am}.",
      "chases every {i:quote}.",
      "books while you {i:sleep}.",
    ],
    sub: "A team of AI staff answering your phone, chasing every lead and booking the job around the clock. You employ them, we build and run them, and you just turn up and do what you do best.",
    // hero micro-proof line (a live stat, not the diagnosis promise)
    proof: "Set to reply in under a minute. Your first month, refundable in full.",
    // crew-at-work feed: glass cards cycling over the hero video.
    // Late-night/early timestamps on purpose: the crew works while you sleep.
    // These are SIMULATED events (no live clients yet); the visible feedNote
    // label keeps that honest. Swap to real (consented) events post-pilot.
    feedNote: "Simulated preview of your crew at work",
    feed: [
      { name: "Zip",    tone: "amber",  text: "Replied to a new lead in 43 seconds",          time: "9:47pm"  },
      { name: "Ada",    tone: "brand",  text: "Answered the phone and booked the job",        time: "2:13am"  },
      { name: "Leo",    tone: "indigo", text: "Answered a warranty question and saved the job", time: "8:12pm" },
      { name: "Nudge",  tone: "teal",   text: "Sent quote #1042, chased it, customer said yes", time: "7:15am" },
      { name: "Boomer", tone: "violet", text: "Won back a customer who went quiet",           time: "4:40pm"  },
      { name: "Star",   tone: "gold",   text: "Sent a review request after a finished job",   time: "6:02pm"  },
    ],
  },

  /* ---- Trust strip ------------------------------------------------------- */
  trust: {
    line: "Australian owned. Built on the Gold Coast.",
    // Honest credibility ONLY, not client endorsements. Nobody has bought the AI
    // product yet, so no business names here (naming website clients as if they
    // were AI customers is a misleading endorsement under AU Consumer Law).
    // Swap in a real client logo + hard result once the first pilot is live AND
    // has given written consent to be named.
    logos: ["Australian owned", "Founder-led", "No lock-in, ever", "You approve every message"],
  },

  /* ---- The Problem (the leaks) ------------------------------------------- */
  problem: {
    kicker: "The leak",
    heading: "Every missed call is a job walking to your {i:competitor}.",
    body: "You're on the tools, on a ladder, under a car. The phone rings out. The lead texts someone else. The quote goes cold. None of it is your fault, but all of it costs you.",
    stats: [
      { value: "62%", label: "of calls to small businesses go unanswered" },
      { value: "21x", label: "better odds of qualifying a lead if you reply in 5 minutes, not 30" },
      { value: "42 hrs", label: "average time a business takes to reply to a web lead" },
      { value: "$0", label: "of that lost revenue ever shows up on a report" },
    ],
    // Honesty note under the stat row: every borrowed number is attributed, and
    // labelled as industry research rather than our own client results.
    // Do not add a number here without a named, checkable source.
    sourceNote: "Sources: 411 Locals, 85 businesses across 58 industries, 2016. MIT / InsideSales.com Lead Response Management Study, Dr James Oldroyd. Harvard Business Review, “The Short Life of Online Sales Leads”, Oldroyd, McElheran and Elkington, 2011, audit of 2,241 companies. Figures are industry research, not our own client results.",
  },

  /* ---- The Diagnosis promise (the wedge) --------------------------------- */
  diagnosis: {
    kicker: "How we're different",
    heading: "We don't sell you AI. We fix what's {i:costing} you jobs.",
    body: "You don't want software. You want the phone answered, the lead called back, the quote closed and the job in the calendar. That is what we deliver. The AI is just how we do it, quietly, in the background, so you never have to think about it.",
    steps: [
      { n: "01", title: "We find the leaks", text: "A free call where we map every place a lead, a call or a quote is slipping through the cracks and costing you work." },
      { n: "02", title: "We plug them", text: "We build and connect exactly what your business needs to stop the loss. Nothing you don't." },
      { n: "03", title: "We run it for you", text: "We manage, tune and report on the results. You get the booked jobs, you never touch the controls." },
    ],
  },

  /* ---- Signature phone section (watch a lead book itself) ----------------- */
  bookItself: {
    heading: "Watch a lead book {i:itself}.",
    sub: "A customer calls while you're up a ladder. Here's what happens in the next 90 seconds, with you doing absolutely nothing.",
    steps: [
      { n: "01", label: "Call missed. Text-back fires." },
      { n: "02", label: "Your AI answers their questions." },
      { n: "03", label: "A booking slot is offered and confirmed." },
      { n: "04", label: "Job booked and logged. You never touched your phone." },
    ],
    // the SMS thread that plays out on scroll. from: 'customer' (left) | 'ai' (right)
    thread: {
      businessName: "Apex Home Improvements",
      logoText: "A",
      status: "Speed-to-Lead text-back",
      // labels the thread as an illustration, not a real customer conversation
      example: "Example conversation",
      messages: [
        { from: "ai",       text: "Hi, sorry we missed you. We're on a job right now, how can we help?" },
        { from: "customer", text: "Hi, need a quote for a new driveway" },
        { from: "ai",       text: "No problem. Roughly what size area, and whereabouts are you based?" },
        { from: "customer", text: "About 40sqm, in Nerang" },
        { from: "ai",       text: "Perfect. We can pop round for a free measure. Does Thursday 4pm work?" },
        { from: "customer", text: "Yeah that works" },
      ],
      confirm: { title: "Thu, 4:00 PM", line: "Free measure, Nerang. Logged to CRM." },
    },
  },

  /* ---- The roster: named AI staff with portraits ------------------------- */
  roster: {
    kicker: "The crew",
    heading: "The crew that plugs every {i:leak}.",
    sub: "Each one fixes one expensive problem. Together they are The Never Miss System, a full AI front office that never misses a call, a lead, a quote or a review, for a fraction of one wage.",
    // outcome leads the card; name + role are the 'how'. portrait: file in assets/characters/.
    // Each is a unique animated character (non-human), toned to its job.
    members: [
      { outcome: "Reply in 60 seconds", name: "Zip", role: "Speed-to-Lead", tone: "amber",
        line: "A lead comes in and I reply in 60 seconds, not two days later, before they call anyone else.",
        also: "Missed-call text-back, web-form follow-up, instant booking links, lead scoring.",
        portrait: "zip.webp" },
      { outcome: "Never miss a call", name: "Ada", role: "AI Receptionist", tone: "brand",
        line: "Start me on nights and weekends, where missed calls already cost you jobs. When I have proven it, hand me the whole front desk.",
        also: "After-hours or full-time cover, a natural Australian voice, live calendar booking, call summaries. Upgrade: have her answer in your own voice, cloned with your consent, so callers hear the voice they already know.",
        portrait: "ada.webp" },
      { outcome: "Quotes out. Money in.", name: "Nudge", role: "Quotes & Invoices", tone: "teal",
        line: "You build the quote in the portal, I make sure it never goes cold. Then I follow the money in.",
        also: "Day 1-3-7 quote follow-up, gentle payment chasing, price questions answered from your list.",
        portrait: "nudge.webp" },
      { outcome: "Every question answered", name: "Leo", role: "Customer Service", tone: "indigo",
        line: "Customers ask, I answer, day or night. Warranty, booking changes, that thing on their invoice. You stay on the tools.",
        also: "SMS, email and web chat, instant answers from your business info, warm leads nursed to a booking.",
        portrait: "leo.webp" },
      // WORDING RULE: review requests are UNCONDITIONAL and UNIVERSAL. Asking
      // only the happy ones (review gating) is illegal to advertise in AU.
      { outcome: "More reviews, asked for properly", name: "Star", role: "Review Engine", tone: "gold",
        line: "Every finished job, I ask the customer for a review at the right moment, so the reviews you have earned actually get left.",
        also: "Google review requests, reputation monitoring, replies handled.",
        portrait: "star.webp" },
      { outcome: "Win back lost customers", name: "Boomer", role: "Reactivation · Optional", tone: "violet",
        line: "I win back the customers who went quiet and get them booking again.",
        also: "Dormant-list campaigns, seasonal offers, past-customer reminders. An optional hire: fits businesses with a customer list to wake up, and every send is checked against your opt-out list.",
        portrait: "boomer.webp" },
    ],
    // the "and it also does" catch-all — the admin line Nicholas asked for
    moreLabel: "And it also automates the repetitive admin",
    moreLine: "If it is manual and it repeats, we can hand it to your AI staff. Whatever you are picturing, tell us on the call and we will tell you straight whether we can build it.",
    more: [
      "Appointment reminders", "Data entry & CRM updates",
      "Inbox triage", "Lead qualification", "Website chat widget", "Weekly business X-ray",
    ],
  },

  /* ---- One cockpit ------------------------------------------------------- */
  cockpit: {
    kicker: "One cockpit",
    heading: "All your AI staff report into {i:one} dashboard.",
    body: "Every call, lead, booking, review and dollar in one place. See exactly what your AI staff did while you were working, and what it earned you. No spreadsheets, no logins scattered everywhere.",
    highlights: [
      "Live feed of every job your AI staff booked",
      "Calls answered, leads replied to, reviews collected",
      "Revenue recovered, shown in real dollars",
      "One place, updated the second something happens",
    ],
  },

  /* ---- ROI calculator ---------------------------------------------------- */
  roi: {
    kicker: "The maths",
    heading: "How much are missed jobs {i:quietly} costing you?",
    sub: "Move the sliders. This is the revenue your AI staff can catch that's currently walking out the door.",
    defaults: { callsPerWeek: 40, missedPct: 30, avgJob: 350, closeRate: 40 },
  },

  /* ---- How it works ------------------------------------------------------ */
  how: {
    kicker: "From here",
    heading: "Live in {i:days}, not months.",
    steps: [
      { n: "01", title: "Your free Leak Audit", text: "A quick call where we map every place a call, lead or quote is leaking, and show you which AI worker pays for itself first." },
      { n: "02", title: "We build and connect", text: "One 30-minute handover from you, then we wire your AI staff into your phone, calendar and tools. You review everything before it goes live." },
      { n: "03", title: "Live this week", text: "Your staff start in a supervised warm-up, answering your calls within days, so you trust every message before they run solo." },
      { n: "04", title: "We manage it for you", text: "We tune, monitor and report. You get the results and never touch the controls." },
    ],
  },

  /* ---- Pricing (salary anchored, no numbers) ----------------------------- */
  pricing: {
    kicker: "The Never Miss System",
    heading: "A fraction of a wage. Round-the-clock {i:coverage}.",
    sub: "The Never Miss System is your whole front office in one place, priced against a salary and coming in well under it. Take the full system, or start with a single worker, like the AI receptionist after hours, and add the rest as you grow. The free Leak Audit works out exactly what you need.",
    human: {
      title: "One human hire",
      points: [
        "~$65,000 a year, plus super",
        "Sick days, leave, turnover",
        "One call at a time, 9 to 5",
        "Trains for weeks, quits eventually",
      ],
    },
    ai: {
      title: "Your AI staff",
      points: [
        "A fraction of the cost, every month",
        "Never sick, never on leave, never quits",
        "Every call at once, 24/7/365",
        "Live in days, tuned every week",
      ],
    },
    note: "No lock-in contracts. No setup you have to do yourself.",
    includesLabel: "Everything in The Never Miss System",
    includes: [
      "Your crew, built and tuned to your business",
      "Every call answered and every lead chased, 24/7",
      "Done-for-you setup: your phone, calendar and tools connected",
      "The Week-One Win-Back Blitz: your dormant customers messaged in week one, every send checked against your opt-out list",
      "Quotes chased from the moment you send them",
      "Invoices raised and politely chased",
      "A review request sent after every job, to every customer",
      "One dashboard showing everything your staff did",
      "A plain-English business X-ray every week",
      "A supervised warm-up before anyone goes live",
      "A real person managing and tuning it all",
    ],
    scarcity: "We build and run every crew personally, so we take on a limited number of new businesses each month, and only one per trade in your area.",
  },

  /* ---- Guarantee / risk removal ------------------------------------------ */
  guarantee: {
    kicker: "The 30-Day Promise",
    heading: "If your first month doesn't pay for itself, you don't {i:pay}.",
    promise: {
      badge: "Our promise, in writing",
      statement: "Run your AI staff for 30 days. If it hasn't paid for itself by the end of your first month, tell us and we refund that month in full.",
      finePrint: "Your first month's fee, refunded in full, no questions and no exit interview. Month to month after that, cancel any time on 14 days notice.",
    },
    points: [
      { title: "You see it work first", text: "Every worker starts in a supervised warm-up. You approve the messages before anything goes live in front of a customer." },
      { title: "No lock-in", text: "Month to month. Stay because it is booking you jobs, not because you are trapped in a contract." },
      { title: "Hard guardrails", text: "Spend caps, quiet hours and one hard rule: your staff never invent a price. Quotes only ever come from your pricing rules, and you can switch quoting off entirely." },
    ],
  },

  /* ---- FAQ --------------------------------------------------------------- */
  // section chrome (kicker + heading), bound into index.html like every other
  // section so the copy lives here and not in the markup
  faqSection: { kicker: "FAQ", heading: "The questions everyone asks." },
  faq: [
    { q: "Is it actually autonomous, or do I have to run it?",
      a: "You employ it, you don't operate it. We build, connect and manage your AI staff for you. You just see the results in your dashboard." },
    { q: "Will it sound like a robot to my customers?",
      a: "No. Your AI receptionist uses a warm, natural Australian voice, briefed on your services, your prices and the way you like your customers looked after. Your text-based staff reply in your business's tone. You approve everything before it goes live, and anything tricky is handed straight to you. Most customers never know. And if you want it to sound like you, there is an upgrade for that: we clone your own voice, with your consent, so your receptionist answers in the voice your customers already know." },
    { q: "Is my customer data safe?",
      a: "Yes. Your data stays yours, isolated to your business, and your AI staff run with strict guardrails on what they can see and do." },
    { q: "What if it gets something wrong?",
      a: "Every worker starts in a supervised warm-up so you catch anything before it goes live. Once running, spend caps and quiet hours keep it safe, and we monitor it for you." },
    { q: "What's the 30-Day Promise?",
      a: "Run your AI staff for a month. If it hasn't paid for itself by the end of that first month, tell us and we refund it in full. No lock-in, and you can cancel any time after that." },
    { q: "Can it really send quotes for me?",
      a: "You build the quote in your portal from your own price list, in a couple of clicks, and Nudge does the chasing: a follow-up on day 1, day 3 and day 7 until the customer answers. Same with invoices: raised in the portal, then politely chased until they're paid. Nudge will answer a price question by quoting your price list word for word, and it will never invent a number or add anything up, that stays yours." },
    { q: "How much does it cost?",
      a: "It depends on which staff your business needs, which is exactly what the free Leak Audit works out. It is always a fraction of the salary of the person it replaces." },
    { q: "Do I have to change my phone number?",
      a: "No. We route your existing number, so your customers keep calling the number they already know. Nothing on your end changes." },
    { q: "What happens when the AI cannot handle something?",
      a: "It hands straight to you, or whoever you nominate, every time. And during the supervised warm-up you approve how it handles things before it ever runs on its own." },
    { q: "Is this right for my type of business?",
      a: "If you answer calls and book jobs, yes. It works for trades and local service businesses of every kind. The free Leak Audit shows exactly which staff will pay for themselves first." },
    { q: "How long until it's live?",
      a: "Days, not months. We map the leaks on the call, build your staff, run a supervised warm-up, then go live." },
  ],

  /* ---- Final CTA + booking section ---------------------------------------- */
  finalCta: {
    heading: "Find out what your business is {i:leaking}.",
    sub: "The Leak Audit is free, and you keep your Leak Map even if you never hire us. Worst case, you walk away knowing exactly where you are losing jobs. Best case, you hire your first AI worker this week. We only take one business per trade in each area, so the sooner we talk the more likely yours is still open.",
  },
  booking: {
    label: "What happens on the call",
    points: [
      { title: "15 minutes, straight to it", text: "No slideshow, no tech talk. We walk your customer journey and find where calls, leads and quotes leak." },
      { title: "You keep the Leak Map", text: "A one-page map of every leak and what it is roughly costing you, yours even if we never speak again." },
      { title: "A straight answer", text: "Which AI worker pays for itself first, or an honest 'you don't need us yet'." },
    ],
    note: "No cost. No obligation. One business per trade, per area.",
    // enquiry box (posts to the platform's own /api/public/contact; no third party)
    form: {
      title: "Lock in your free Leak Audit",
      fields: {
        name: "Your name",
        mobile: "Mobile (so we can text you a time if you want the call)",
        email: "Email",
        trade: "Your trade or business",
      },
      timesLabel: "When suits you best?",
      times: ["Early morning", "Mid-morning", "Arvo", "After 5pm", "Whenever"],
      button: "Text me my audit time",
      note: "We text you today to lock in a time. No spam, no obligation.",
      success: "Sorted. Keep an eye on your phone, we will text you today to lock in a time.",
      // Generic failure — anything we cannot name (network drop, server error, bad reply).
      error: "That did not send. Ring or email us instead and we will sort you out.",
      // Rate limited (HTTP 429). Deliberately does NOT claim we already have their details:
      // the limit is keyed per connection, so the goes that used it up may not be theirs.
      errorBusy: "Steady on, that is a few too many tries from your connection. Give it a few minutes, or ring or email us and we will sort you out today.",
    },
  },

  /* ---- The Leak Audit (audit.html) ----------------------------------------
     The interactive lead magnet. Nine tap-only questions, a live leak counter,
     then the Leak Map behind a name/mobile/email gate.

     RAILS (do not violate):
     · Every dollar figure is a RANGE and is labelled "an estimate from your
       answers, not a forecast". Never a single number, never a promise.
     · The reviews channel NEVER carries a dollar figure. Ever.
     · No review gating. Asking only the happy ones is called out as the wrong
       answer, because it is illegal here (see feedback_review_gating_is_illegal).
     · No new statistics. sourceNote below reuses the three sourced anchors that
       problem.sourceNote already carries, and nothing else.
     · The maths itself lives in audit.js and is mirrored by the backend. The
       option KEYS below are the wire format: renaming one breaks the API.
     ---------------------------------------------------------------------- */
  audit: {
    navLabel: "Free audit",
    kicker: "The free Leak Audit",

    /* ---- Chrome (sits above every question screen) ----------------------
       The ads that point here are all signed Applied Intelligence, so the bar
       carries the full wordmark at every width. No booking button: every ad
       says no call required, and a button here would contradict that. */
    chrome: {
      home: "Applied Intelligence",
      homeAria: "Applied Intelligence home page",
      right: "Free audit",
      trust: "Free. Sixteen taps all up. No call required.",
    },

    /* The visible h1 IS the trust strip. The page opens on question one, so
       there is no hero to headline: the old hero copy survives below the
       instrument, where the people who actually started can read it. */
    heading: "Free. Sixteen taps all up. No call required.",
    honestyTitle: "Before you ask, yes, we made the number up out of your answers",
    sub: "Built for Australian trades and local service businesses. You give us your own numbers, we map where calls, leads, quotes and past customers slip out of your week, and put a dollar range on each one. No call required, no sales pitch.",
    meta: ["Sixteen taps, no typing", "About three minutes", "Built on your numbers", "Australian owned, founder-led"],
    // The trust play: the sting lands BEFORE we ask for anything. Say it out loud.
    metaNote: "The number builds on screen as you go, and you see the whole headline figure before we ask you for a single detail. The maths is the same for everyone and written out at the bottom of this page, not made up for you. If your answers come back clean, the map says so and we tell you that plainly, because a map that always finds a problem is not a map.",
    // no-JS / pre-JS fallback line under the chrome
    noscript: "This audit needs JavaScript switched on. If you would rather just talk it through, book a free 15-minute call instead.",

    progress: { label: "Question", of: "of", back: "Back", change: "Change an answer" },

    // the running counter, which lands the moment the phone is genuinely priced
    counter: {
      label: "Leaking so far, a year",
      sub: "An estimate from your answers, not a forecast.",
      hint: "Keep going. The number moves as each part of your week is mapped.",
      // shown once, on the screen where the counter first appears
      revealLine: "That is the phone on its own, from the numbers you just gave us. Two taps left and we price your leads.",
    },

    /* ---- The reveal screen ----------------------------------------------
       Their number, on its own screen, with nothing asked of them. Every ad
       promises this word for word, so it must never be merged into the gate. */
    reveal: {
      kicker: "Your number so far",
      perYear: "a year",
      lead: "On your own numbers, that is what the phone and the slow replies are costing you.",
      weekly: "About {weekly} a week, every week, while nothing changes.",
      disclaimer: "An estimate from your answers, not a forecast. It is a range on purpose.",
      honesty: "That is two of the five leaks. Your quotes, your reviews and your past customers are not priced yet, and we will not guess them.",
      button: "Show me where it is going",
      note: "The maths is written out below this page, same maths for everyone.",
    },

    /* ---- Sections -------------------------------------------------------
       Kept for reference only. The question screens no longer print a section
       label or intro: each one cost a reading task and bought nothing. */
    sections: {
      sizing:    { label: "The basics",     intro: "Who you are, and how big a normal week looks." },
      phone:     { label: "The phone",      intro: "How calls land, and what happens to the ones you miss." },
      leads:     { label: "The leads",      intro: "The enquiries that come in through your website and socials." },
      quotes:    { label: "Your quotes",    intro: "What happens after you send somebody a price." },
      reviews:   { label: "Reviews",        intro: "What a stranger sees before they decide whether to ring you." },
      customers: { label: "Old customers",  intro: "The people who already paid you once." },
    },

    /* The sixteen questions, in two runs. The first seven price the phone and
       the leads and sit in front of the gate. The nine marked `deferred` are
       offered after the map opens, so the audit is still sixteen taps all up.
       `key` and every option `key` are the API enum values: the server
       validates them strictly and recomputes the maths from them, so renaming
       one breaks the contract. `skipWhen` is the conditional-absence rule:
       when it fires the question is never asked AND its answer is deleted,
       because the API treats the absence as meaningful rather than as a
       missing field. `micro` is the one quiet line under the options. */
    questions: [
      /* ---- The seven, in front of the gate ---- */
      {
        key: "missed", section: "phone",
        title: "You are on the tools. The phone rings. What usually happens?",
        help: "Tap the one that sounds like your week. Nobody sees this but you.",
        micro: "Seven taps and you see your number. No typing until then.",
        options: [
          { key: "office",    label: "Someone in the office answers" },
          { key: "callback",  label: "I see the missed call and ring back later" },
          { key: "voicemail", label: "It goes to voicemail" },
          { key: "rings_out", label: "It rings out" },
        ],
      },
      {
        key: "missed_week", section: "phone",
        title: "In a normal week, how many calls do you miss?",
        help: "Best guess is fine. If you genuinely do not know, say so. That matters too.",
        micro: "Your count, not ours.",
        options: [
          { key: "none",     label: "Barely any" },
          { key: "1_2",      label: "1 or 2" },
          { key: "3_5",      label: "3 to 5" },
          { key: "6_10",     label: "6 to 10" },
          { key: "10_plus",  label: "More than 10" },
          { key: "no_idea",  label: "Honestly, no idea" },
        ],
      },
      {
        key: "winback", section: "phone",
        title: "When you ring a missed call back, how do you go?",
        help: "The ones you actually get around to ringing.",
        micro: "This is the bit that stops the number being scary for the sake of it.",
        options: [
          { key: "win_most",   label: "I win most of them back" },
          { key: "about_half", label: "About half" },
          { key: "a_few",      label: "Only a few" },
          { key: "moved_on",   label: "They have usually moved on" },
        ],
      },
      {
        key: "job_value", section: "sizing",
        title: "What is an average job worth to you?",
        help: "The invoice, not the profit. A band is plenty.",
        micro: "One more and your number lands.",
        options: [
          { key: "under_200",  label: "Under $200" },
          { key: "200_500",    label: "$200 to $500" },
          { key: "500_1500",   label: "$500 to $1,500" },
          { key: "1500_5000",  label: "$1,500 to $5,000" },
          { key: "5000_plus",  label: "More than $5,000" },
        ],
      },
      {
        key: "enquiries", section: "sizing",
        title: "In a normal week, how many calls and enquiries come in?",
        help: "Everything, not just the ones that booked.",
        options: [
          { key: "under_10", label: "Under 10" },
          { key: "10_25",    label: "10 to 25" },
          { key: "25_50",    label: "25 to 50" },
          { key: "50_100",   label: "50 to 100" },
          { key: "100_plus", label: "More than 100" },
        ],
      },
      {
        key: "reply_speed", section: "leads",
        title: "An enquiry lands from your website or socials. How fast does it get a reply?",
        help: "On an average day, not your best one.",
        micro: "One more tap and the leads number lands.",
        options: [
          { key: "minutes",         label: "Within a few minutes" },
          { key: "hours",           label: "A few hours" },
          { key: "days",            label: "Next day or two" },
          { key: "sometimes_never", label: "When I remember" },
        ],
      },
      {
        key: "late_outcome", section: "leads",
        title: "By the time that reply goes out, how many have already sorted it?",
        help: "Rung someone else, booked it in, moved on.",
        options: [
          { key: "most_gone", label: "Most of them" },
          { key: "half_gone", label: "About half" },
          { key: "few_gone",  label: "Only a few" },
        ],
      },

      /* ---- The nine, offered after the map opens ---- */
      {
        key: "after_hours_calls", section: "phone", deferred: true,
        title: "After 5pm or on the weekend, how many calls land then?",
        help: "In a normal week. Nights, weekends, public holidays.",
        options: [
          { key: "answered", label: "We answer those too" },
          { key: "ah_1_2",   label: "1 or 2" },
          { key: "ah_3_5",   label: "3 to 5" },
          { key: "ah_more",  label: "More than 5" },
          { key: "no_idea",  label: "Honestly, no idea" },
        ],
      },
      {
        key: "quotes_week", section: "quotes", deferred: true,
        title: "How many quotes go out in a normal week?",
        help: "Written prices, not chats on the phone.",
        options: [
          { key: "no_quotes", label: "I do not really quote" },
          { key: "under_3",   label: "Under 3" },
          { key: "3_5",       label: "3 to 5" },
          { key: "5_10",      label: "5 to 10" },
          { key: "10_plus",   label: "More than 10" },
        ],
      },
      {
        key: "quotes_quiet", section: "quotes", deferred: true,
        skipWhen: { key: "quotes_week", value: "no_quotes" },
        title: "Of every 10 quotes, how many just go quiet?",
        help: "No yes, no no, nothing.",
        options: [
          { key: "q1_2", label: "1 or 2" },
          { key: "q3_4", label: "3 or 4" },
          { key: "half", label: "About half" },
          { key: "most", label: "Most of them" },
        ],
      },
      {
        key: "quotes", section: "quotes", deferred: true,
        skipWhen: { key: "quotes_week", value: "no_quotes" },
        title: "After you send a quote, what happens?",
        help: "The ones that never come back.",
        options: [
          { key: "chase_all", label: "Followed up until it is a yes or a no" },
          { key: "chase_big", label: "We chase the big ones" },
          { key: "keen_call", label: "If they are keen they will call back" },
          { key: "go_quiet",  label: "Quotes go quiet all the time" },
        ],
      },
      {
        key: "list_size", section: "customers", deferred: true,
        title: "Roughly how many past customers are in your phone or job book?",
        help: "People who have paid you at least once.",
        options: [
          { key: "under_50", label: "Under 50" },
          { key: "50_200",   label: "50 to 200" },
          { key: "200_500",  label: "200 to 500" },
          { key: "500_plus", label: "More than 500" },
          { key: "no_list",  label: "I do not really keep a list" },
        ],
      },
      {
        key: "dormant", section: "customers", deferred: true,
        skipWhen: { key: "list_size", value: "no_list" },
        title: "When did that list last hear from you?",
        help: "A text, an email, anything at all.",
        options: [
          { key: "regular",  label: "We stay in touch" },
          { key: "odd_text", label: "The odd text here and there" },
          { key: "never",    label: "Never, not since the job" },
        ],
      },
      {
        key: "reviews", section: "reviews", deferred: true,
        title: "How do you ask for Google reviews?",
        help: "The ones that decide whether a stranger rings you or the next name down.",
        options: [
          { key: "automatic",  label: "Every customer gets asked, automatically" },
          { key: "remember",   label: "I ask when I remember" },
          { key: "happy_only", label: "I only ask the happy ones" },
          { key: "dont_ask",   label: "We do not really ask" },
        ],
      },
      {
        key: "review_count", section: "reviews", deferred: true,
        title: "Roughly how many Google reviews have you got?",
        help: "A ballpark is fine.",
        options: [
          { key: "r_under_10", label: "Under 10" },
          { key: "r_10_30",    label: "10 to 30" },
          { key: "r_30_100",   label: "30 to 100" },
          { key: "r_100_plus", label: "More than 100" },
        ],
      },
      {
        key: "trade", section: "sizing", deferred: true,
        title: "Last one. What do you do?",
        help: "So the map speaks your language.",
        options: [
          { key: "plumber",     label: "Plumber" },
          { key: "electrician", label: "Electrician" },
          { key: "builder",     label: "Builder or carpenter" },
          { key: "painter",     label: "Painter" },
          { key: "landscaper",  label: "Landscaper" },
          { key: "detailer",    label: "Car detailer" },
          { key: "cleaner",     label: "Cleaner" },
          { key: "auto",        label: "Auto or mechanical" },
          { key: "roofing",     label: "Roofing" },
          { key: "hvac",        label: "Air con or refrigeration" },
          { key: "other",       label: "Something else" },
        ],
      },
    ],

    /* ---- Echo lines -----------------------------------------------------
       "You told us: ..." quoted back on each result card. Assembled in JS from
       the fragments below so the sentence is genuinely theirs, and set through
       textContent like everything else. `estimated` is the honest version used
       whenever a "no idea" fallback carried the maths for that channel. */
    echo: {
      lead: "You told us: ",
      missed_calls: {
        template: "{missed_week}, {after_hours_calls}, and that you {winback}.",
        estimated: "you weren't sure on some of these numbers, so this range comes from our conservative assumption rather than your own count. Not knowing how many calls slip past is a leak of its own.",
        // pre-gate only: every number here is theirs EXCEPT after hours, which
        // has not been asked yet, so the fallback is named rather than implied.
        partial: "{missed_week}, and that you {winback}. We have not asked about after hours yet. That part is our number, not yours.",
        missed_week: {
          none:    "you hardly miss a call",
          "1_2":   "you miss one or two calls in a normal week",
          "3_5":   "you miss three to five calls in a normal week",
          "6_10":  "you miss six to ten calls in a normal week",
          "10_plus": "you miss more than ten calls in a normal week",
        },
        after_hours_calls: {
          answered: "after-hours calls get answered too",
          ah_1_2:   "one or two more land after 5pm or on the weekend",
          ah_3_5:   "three to five more land after 5pm or on the weekend",
          ah_more:  "more than five land after 5pm or on the weekend",
        },
        winback: {
          win_most:   "win most of them back when you ring",
          about_half: "win about half of them back when you ring",
          a_few:      "only win a few back when you ring",
          moved_on:   "usually find they have already moved on",
        },
      },
      slow_reply: {
        template: "{reply_speed}, and that {late_outcome}.",
        reply_speed: {
          minutes:         "a website or social enquiry gets a reply within minutes",
          hours:           "a website or social enquiry waits a few hours for a reply",
          days:            "a website or social enquiry waits a day or two for a reply",
          sometimes_never: "website and social enquiries get answered when you remember",
        },
        late_outcome: {
          most_gone: "most of them have already sorted it by then",
          half_gone: "about half have already sorted it by then",
          few_gone:  "only a few have already sorted it by then",
        },
      },
      unchased_quotes: {
        template: "{quotes_week}, {quotes_quiet}, and that {quotes}.",
        none: "quoting isn't really part of how you sell, so there is nothing leaking here.",
        quotes_week: {
          under_3:   "you send a couple of quotes in a normal week",
          "3_5":     "you send three to five quotes in a normal week",
          "5_10":    "you send five to ten quotes in a normal week",
          "10_plus": "you send more than ten quotes in a normal week",
        },
        quotes_quiet: {
          q1_2: "one or two in every ten go quiet",
          q3_4: "three or four in every ten go quiet",
          half: "about half of them go quiet",
          most: "most of them go quiet",
        },
        quotes: {
          chase_all: "you follow every one up until it's a yes or a no",
          chase_big: "you chase the big ones",
          keen_call: "you leave it to them to ring back if they're keen",
          go_quiet:  "they go quiet on you all the time",
        },
      },
      reviews: {
        template: "{reviews}, {review_count}.",
        reviews: {
          automatic:  "every customer gets asked automatically",
          remember:   "you ask when you remember",
          happy_only: "you only ask the happy ones",
          dont_ask:   "you don't really ask",
        },
        review_count: {
          r_under_10: "with under ten reviews on Google",
          r_10_30:    "with ten to thirty reviews on Google",
          r_30_100:   "with thirty to a hundred reviews on Google",
          r_100_plus: "with more than a hundred reviews on Google",
        },
      },
      dormant: {
        template: "{list_size}, and that {dormant}.",
        none: "there is no past-customer list yet, so there is nothing to win back until there is one.",
        list_size: {
          under_50:  "you have under fifty past customers in the phone or job book",
          "50_200":  "you have fifty to two hundred past customers in the phone or job book",
          "200_500": "you have two to five hundred past customers in the phone or job book",
          "500_plus": "you have more than five hundred past customers in the phone or job book",
        },
        dormant: {
          regular:  "you stay in touch with them",
          odd_text: "they get the odd text here and there",
          never:    "they have not heard from you since the job",
        },
      },
    },

    /* The capture card in front of the blurred breakdown. Three fields, in
       this order, each carrying the reason it is being asked. The optional
       business name and the free-text trade are gone: four fields read as more
       work than three, and the real trading name is captured on the call or on
       the last nine taps. */
    gate: {
      // The kicker is built at render time from the worst leak the seven taps
      // found, so the card opens on THEIR problem, not on our step count.
      // `kicker` is only the fallback for a state where no leak ranks first.
      kickerLead: "Your worst leak: ",
      kicker: "One step left",
      title: "Now the part you can't guess: the fix.",
      sub: "Your number was the easy bit. The map shows where each dollar goes. It shows what stops your biggest leak first, what that looks like running in your business, and what it should give back. Tell us where to send it.",
      // What they get, in the order it is worth: the document, the fix for the
      // one leak that is costing them most, then the call they can take or leave.
      bullets: [
        "Your Leak Map: the five leaks, your own answers, the maths shown",
        "The Leak Fix for your worst leak, in plain words, with what it should return",
        "Fifteen minutes on the phone if you want it. A price on the spot. A straight answer if it isn't worth doing yet",
      ],
      fields: {
        name: "Your name",
        mobile: "Mobile",
        email: "Email",
        tradeOther: "What do you do?",
      },
      // the reason line under each label, so no field is asked for silently
      reasons: {
        name: "So the map is addressed to a person.",
        // He rings every lead himself, so the field that asks for the number
        // says so, next to the field, where it is actually read. The old
        // version of this line sat under the button and was skipped.
        mobile: "So Nicholas can give you one ring about the fix. One word stops it.",
        email: "Where the map goes.",
      },
      errorRequired: "Please fill this in.",
      errorEmail: "Please enter a valid email address.",
      errorInvalid: "Please check this.",
      button: "Send my map and the fix",
      sending: "Sending...",
      note: "The map is yours to keep either way. No spam, no lock in.",
      // A sceptical owner wants to look us up before typing a mobile number.
      // These two open in a new tab so the run behind them survives.
      site: {
        text: "Applied Intelligence is Australian owned and founder led. Have a look at who we are and the work we have done. Both open in a new tab, so your answers stay put.",
        links: [
          { label: "Who we are", href: "index.html" },
          { label: "Our work", href: "work.html" },
        ],
      },
    },

    /* The map itself. {low} {high} {weekly} {email} are replaced in JS and set
       through textContent, so they are never a markup path. */
    result: {
      kicker: "The Leak Map",
      docLabel: "Built from your own numbers",
      keep: "Yours to keep",
      lead: "On your own numbers, you are leaking about",
      perYear: "a year",
      weekly: "That is roughly {weekly} a week, every week, while nothing changes.",
      allClearHeading: "You run a tight ship.",
      allClearLead: "Your answers do not show a serious hole anywhere. That is rare, and it is worth protecting.",
      disclaimer: "An estimate from your answers, not a forecast. It is a range on purpose.",
      lockedLabel: "The full breakdown",
      channelsTitle: "Where it is going",
      startTitle: "Start here",
      roadmapTitle: "The order to fix it in",
      weeksLabel: "Weeks",
      statusLabels: {
        critical: "Critical",
        high: "High",
        medium: "Worth fixing",
        ok: "Looking good",
      },
      reviewsLine: "More reviews means more calls from Google, but we won't invent a dollar figure for it. That is rather the point of this report.",
      // the ads say "to", never a dash, so the map says "to" as well
      rangeSep: " to ",
      // a channel the seven taps could not price yet
      notPricedLabel: "Not priced yet",
      // what those rows say instead of a figure
      notPriced: {
        unchased_quotes: "We have not asked about your quotes yet. There is no figure here.",
        reviews: "We have not asked about your reviews yet. This one never gets a figure.",
        dormant: "We have not asked about your past customers yet. There is no figure here.",
        slow_reply: "We have not asked about your leads yet. No figure yet.",
      },
      partialNote: "Two of the five leaks are priced. The other three are still yours to finish.",
      // v2: the "You told us: ..." quote sits above the note on every card.
      // `estimatedTag` marks a channel where a "no idea" fallback carried the
      // maths, so the visitor can see which number is theirs and which is ours.
      estimatedTag: "Estimated",
      // v2.1: the engine sends a worked plain-english line per priced channel.
      // It is server-built and deterministic, so it only ever appears on the
      // unlocked map, never on the pre-gate mirror.
      mathsLabel: "The maths",
      // The honest hand-off. The diagnosis is the free value; the fix is what
      // we sell. NO DIY content, tips, templates or cadences anywhere on this
      // page or in the PDF (Nicholas, explicit): this is an ad-driven lead
      // magnet, not a how-to.
      chain: "The map is yours to keep. Plugging the leaks is the part we do.",
    },

    /* THE LEAK FIX. One plain-words line per priced channel, printed on the
       worst leak's card the moment the map opens. It is the thing the gate
       promised and the one thing they could not guess from the number.
       OUTCOME LANGUAGE ONLY: no product name, no "AI", no "worker", no
       "agent". What changes in their week, not what we install to do it. */
    fixes: {
      label: "Your Leak Fix",
      missed_calls: "Every missed call gets a ring back inside a minute. After hours as well. None of it lands on you.",
      slow_reply: "Every web and social enquiry gets a real answer inside a minute. Day or night. Yours is the first one they read.",
      note: "What it costs, and what it should give back. That is the fifteen minutes.",
    },

    /* Channel labels, the worker who plugs each one, and one honest note per
       possible answer. Keys mirror the scoring spec exactly. */
    channels: {
      missed_calls: {
        label: "Missed calls",
        worker: { name: "Ada", role: "AI Receptionist" },
        notes: {
          office:    "Someone answers, which already puts you ahead. The gap is the call that lands while they are on another one, or after they have gone home.",
          callback:  "Ringing back later works right up until the day gets away from you, and by then the caller has moved down the list.",
          voicemail: "Voicemail is where jobs quietly go. A caller who does not leave a message is a job you never even knew about.",
          rings_out: "A phone that rings out reads as closed. They ring the next business before you ever know they called.",
        },
      },
      slow_reply: {
        label: "Slow replies",
        worker: { name: "Zip", role: "Speed-to-Lead" },
        notes: {
          minutes:         "Minutes is the right answer. Protect it, because it is the one thing that separates you from everyone else quoting the same job.",
          hours:           "A few hours is normal, and normal is the problem. The research below puts the odds of qualifying a lead 21 times better at five minutes than at thirty.",
          days:            "By the next day the enquiry has usually been answered by someone else. That job was never lost on price.",
          sometimes_never: "An enquiry that waits for you to remember is an enquiry somebody else has already answered.",
        },
      },
      unchased_quotes: {
        // NOTE: these five labels are the wording the SERVER sends back in
        // scores.channels[].label. Keep them identical or the pre-gate tease
        // and the post-send map will visibly disagree.
        label: "Unchased quotes",
        worker: { name: "Nudge", role: "Quotes & Invoices" },
        notes: {
          chase_all: "Chasing every quote is the habit most businesses never build. Keep it, and make it automatic so it survives a flat-out week.",
          chase_big: "The big ones get chased because they are worth remembering. The small ones add up to more than you would think.",
          keen_call: "Keen customers do ring back. Busy ones forget, and forgetting is not the same as no.",
          go_quiet:  "A quiet quote is usually not a no. It is a customer who got busy and never got a second nudge.",
          // used when quotes_week = no_quotes (the process question is never asked)
          no_quotes: "Nothing is leaking here, because nothing goes out. If that ever changes, this is the first place to watch.",
        },
      },
      reviews: {
        label: "Reviews",
        worker: { name: "Star", role: "Review Engine" },
        notes: {
          automatic:  "Asking everyone, every time, is exactly right. That is what keeps you near the top of the map.",
          remember:   "Asking when you remember means asking after the good jobs, which is a fraction of the jobs you actually do.",
          happy_only: "Ask everyone, not just the happy ones. It is the safe way to do it under Australian Consumer Law, and unhappy customers who feel heard often don't post at all.",
          dont_ask:   "If nobody asks, very few customers think to write one, and a good business ends up sitting under a worse one on Google.",
        },
        // v2: a second, quieter sentence tailored to how many reviews they have.
        // Qualitative only. There is no sourced figure for review counts, so we
        // never imply one.
        countNotes: {
          r_under_10: "Under ten reviews, at the volume of work you are doing, is a gap a stranger notices.",
          r_10_30:    "Ten to thirty is a start. It is the steady drip from here that does the work.",
          r_30_100:   "You have enough to look established. The job now is keeping them coming.",
          r_100_plus: "You are past the hard part. Keep the machine fed so the recent ones stay recent.",
        },
      },
      dormant: {
        label: "Past customers",
        worker: { name: "Boomer", role: "Reactivation" },
        notes: {
          regular:  "Staying in touch is the cheapest work you will ever win. Keep it up.",
          odd_text: "The odd text proves the list works. It is the regular rhythm that turns it into a second income.",
          never:    "You are sitting on a list of people who already paid you once and were happy. One message is the cheapest job you will ever book.",
          // used when list_size = no_list (the dormant question is never asked)
          no_list:  "There is no list to win back yet, so this one is worth nothing to you today. That changes the moment there is one.",
          // LONG-CYCLE TRADES (roofing, builder, painter). Their job cycle runs
          // in years, so we refuse to put a dollar figure on re-contacting past
          // customers at all. Honesty beats a bigger headline number.
          long_cycle: "Your job cycle runs in years, so we won't put a dollar figure on re-contacting past customers. Anyone who does is guessing. The real value of your list is referrals and being remembered, and that is a slower, smaller play than the channels above.",
        },
      },
    },

    /* "Start here" line per channel, and the honest all-clear version. */
    startLines: {
      missed_calls:    "Start with the phone. Take the after hours calls first, which is the lowest-risk place to begin: a missed after hours call is already a lost job, so there is nothing to lose.",
      slow_reply:      "Start with reply speed. Every website and social enquiry gets a real answer in under a minute, day or night, before anyone else gets a look in.",
      // Nudge's real capability, stated conditionally. With a fixed, written
      // price list it builds and sends the quote itself FROM that list; without
      // one it chases what the owner sends. It never invents a number either way.
      unchased_quotes: "Start with your quotes. If your prices are fixed and written down, Nudge builds and sends the quote itself straight from your own price list. If they are not, it chases every quote you do send, on day one, day three and day seven, until you get a yes or a no. Either way it never invents a price.",
      dormant:         "Start with the customers you already have. Boomer works your past-customer list, with an opt-out on every message, and books the ones who are ready.",
      reviews:         "Start with reviews. Star asks every customer the same way, every time, so the map starts working for you.",
      allClear:        "Nothing here needs plugging, so the upside is reviews. Star asks every customer the same way, every time, and it costs you nothing to ask.",
    },

    /* One action line per channel for the 12-week roadmap. */
    roadmapActions: {
      missed_calls:    "Cover the after hours calls first, then the whole day once you have read a week of transcripts.",
      slow_reply:      "Every website and social enquiry gets a reply inside a minute, and the ones that are ready get booked.",
      unchased_quotes: "Where you have a fixed price list, Nudge builds and sends the quote itself from that list. Where you don't, it chases the ones you send on day one, three and seven. It never invents a price.",
      reviews:         "Star asks every customer for a review once the job is done, the same way every time.",
      dormant:         "Boomer works your past-customer list with an opt-out on every message and books the ones who bite.",
    },

    /* How the number was built. Shown in full, unblurred, always. */
    method: {
      title: "How we worked that out",
      lead: "The same formula runs for every business that takes this audit. It is written out here so you can check it, and so you can see it was not made up for you.",
      points: [
        "Wherever you gave us a real number we use yours, not ours: calls missed in a week, calls landing after hours, how many you win back, quotes going out, how many go quiet, and how many past customers are in your book.",
        "Where you told us you were not sure, we fall back to a conservative assumption and label that part of the map as an estimate, so you can see exactly which figure is yours and which is ours.",
        "We assume about 65 per cent of enquiries arrive as phone calls and 35 per cent as website, social or SMS.",
        "We only count 35 per cent of anything recovered as a booked job, which is lower than the 40 per cent our own ROI calculator uses.",
        "We never model more calls going missing than you told us come in.",
        "Every figure lands as a range, plus or minus 35 per cent, because your business is not a spreadsheet.",
      ],
    },
    sourceNote: "Sources: 411 Locals, 85 businesses across 58 industries, 2016 (62% of calls to small businesses unanswered). MIT / InsideSales.com Lead Response Management Study, Dr James Oldroyd (21x better odds of qualifying a lead at 5 minutes than at 30). Harvard Business Review, “The Short Life of Online Sales Leads”, Oldroyd, McElheran and Elkington, 2011, audit of 2,241 companies (42 hour average reply to a web lead). The share and decay factors we apply on top are our own conservative modelling assumptions, not client results.",

    /* After a successful send. */
    thanks: {
      title: "Unlocked. Your Leak Map is on its way.",
      body: "We are sending the PDF to {email}. The map below is the same thing, so have a read now.",
      /* The fork. Three leaks are still unpriced, and the visitor picks how
         they get priced: nine more taps here, or fifteen minutes with us. */
      forkTitle: "Three leaks left to price",
      forkBody: "Your quotes, your reviews and your past customers. Nine more taps finishes the map on this screen, or we do those three with you on the fifteen minutes.",
      finishButton: "Finish the map. Nine taps.",

      /* THE ENDING. The map is open, so the number is no longer news: the only
         honest next step is the one thing they cannot do for themselves, which
         is have the leak plugged. Headline keys are the two channels the seven
         taps can price, and the copy speaks to the one that ranked worst.
         NO scarcity claim, no trial, no promise of a result, and the mechanism
         is never named here. The outcome is. */
      offer: {
        kickerLead: "Your worst leak: ",
        headlines: {
          missed_calls: "You can't answer the phone from a roof. Someone should.",
          slow_reply: "The job goes to whoever answers first. It can be you.",
        },
        body: "That leak has a fix, and it isn't you working harder. On a fifteen minute call we take your map and pick the one leak worth fixing first. Then we show you what plugging it looks like. You get a price on the spot.",
        walkTitle: "Walk away with",
        walk: [
          "What stops your biggest leak, and what it looks like running in your business",
          "What it costs and what it should return, from your own numbers",
          "A straight answer if it isn't worth doing yet",
        ],
        button: "Book a call to fix my worst leak",
        // The risk reversal. It promises a thing we control (what they leave
        // the call holding), never a result we do not control.
        guarantee: "If the fifteen minutes doesn't show you exactly what plugging your worst leak would put back, that's on us.",
        finishLink: "Finish the map first, nine taps",
        trust: "You'll talk to Nicholas, who built this. No sales team, no lock in.",
      },
      finishIntro: "Nice one. These nine price the other three leaks, then the map is complete.",
      finishDone: "That is the lot. All five leaks, priced or honestly refused.",
      // shown only when the send failed, where there is no row to book against
      cta: "Book your free 15-minute call",
      ctaNote: "Fifteen minutes, no slideshow. We walk your map with you and tell you which worker pays for itself first, or an honest “you do not need us yet”.",
      // instant download, polled while the engine renders the PDF
      pdfPreparing: "Your Leak Map PDF is being prepared.",
      pdfReady: "Save your Leak Map for the call (PDF)",
      pdfFailed: "The download is taking longer than it should. It will land in your email shortly, or reply to that email and we will sort it.",
      /* Optional preferred-call-time row, offered ONLY when the audit row really
         landed (no token, no row). Same five windows as the enquiry box on the
         home page on purpose: the server validates against exactly these
         labels, so they are the contract, not decoration. */
      timesLabel: "Tap when suits and we will text you a time.",
      times: ["Early morning", "Mid-morning", "Arvo", "After 5pm", "Whenever"],
      timesNote: "No cost, no obligation.",
      timesButton: "Text me a time",
      timesSuccess: "Sorted. Keep an eye on your phone, we will text you today to lock in a time.",
      // The site's ONE real scarcity fact, stated as a fact, once, here.
      scarcity: "We build and run every crew ourselves, so we only take on one business per trade in each area. It is also why we will tell you straight if you do not need us yet.",
    },
    /* If the send fails we unlock anyway. Never punish the visitor. */
    sendErrorTitle: "Here is your Leak Map anyway.",
    sendError: "That did not send, so we have unlocked the whole map here instead. Ring or email us and we will get the PDF to you.",
  },

  /* ---- The work (work.html) ----------------------------------------------
     HONESTY RULE (do not violate). Every business below hired us to DESIGN AND
     BUILD A WEBSITE. None of them bought The Never Miss System. So: no metrics,
     no invented quotes, no implied AI results. We describe the craft only, and
     the disclosure line below states the relationship in plain English.
     ---------------------------------------------------------------------- */
  work: {
    kicker: "The work",
    heading: "Sites we designed, built and put {i:live}.",
    sub: "Every site on this page is live right now, working for a real Australian business. Have a look at the detail, then judge us on it.",
    // the honesty band that sits directly under the heading
    disclosure: "Every business on this page hired us to design and build their website. None of them are customers of The Never Miss System, so nothing here is a claim about what our AI staff did for them.",
    // closing block on work.html. One primary CTA, pointing home to the booking
    // section. No new promise here: it is the same free Leak Audit as everywhere.
    cta: {
      kicker: "Your turn",
      heading: "The next one on this page could be {i:yours}.",
      sub: "Same hands, same standard. Start with the free Leak Audit: we map where the work is leaking out of your business, and if a website is part of the fix we will tell you straight.",
    },
    projects: [
      {
        slug: "shocked-solar",
        name: "Shocked Solar & Electrical",
        // the client's own accent, lifted off their live site. Used for the
        // italic word in the chapter title, the rules and the small-caps
        // labels. Checked against --bg-ink (#0a0e1a): 9.5:1.
        tone: "#f5a600",
        url: "https://shockedsolarandelectrical.com",
        trade: "Solar and electrical",
        location: "Brisbane",
        built: "June 2026",
        oneLiner: "A full-bleed video hero, cut from their own 21kW commercial install.",
        proofLine: "A hero cut from their own 21kW install, over a wall of real work.",
        what: "Shocked Solar had no web presence at all, so every frame on the page had to come from their own jobs. We cut the full-bleed hero video from footage of a real 21kW commercial install, built a monochrome Wall of Kit from the brands they actually fit, and laid out a wall of real installs and install videos. Quote and callback forms carry the enquiries.",
        features: ["Real-install video hero", "Monochrome Wall of Kit", "Install gallery, real jobs only", "Quote and callback forms"],
        status: "Their first web presence. Live since June 2026.",
        // Reel + still captions describe the craft only. No numbers we have not
        // counted, no claims about what the site earned anybody.
        captions: {
          reel: { lead: "A silent scroll of the live page.", text: "Top to bottom, nothing sped up and nothing staged." },
          stills: [
            "Recent work. Real installs and install videos, more than thirty of them, and not one stock photo.",
            "The Wall of Kit. The component brands they fit, greyed back so no logo shouts over the work.",
            "Where the team works. Every suburb they cover, listed and mapped, so nobody rings to find out they are out of range.",
          ],
        },
        card: "assets/work/shocked-solar/card.webp",
        posterDesktop: "assets/work/shocked-solar/reel-desktop.webp",
        reelDesktop: "assets/work/shocked-solar/reel-desktop.mp4",
        posterPhone: "assets/work/shocked-solar/reel-phone.webp",
        reelPhone: "assets/work/shocked-solar/reel-phone.mp4",
        stills: [
          "assets/work/shocked-solar/still-01.webp",
          "assets/work/shocked-solar/still-02.webp",
          "assets/work/shocked-solar/still-03.webp",
        ],
      },
      {
        slug: "goldy",
        name: "Goldy Car Detailing",
        // Her gold, taken off the live site. On --bg-ink: 9.6:1.
        tone: "#d9b25f",
        url: "https://goldycardetailing.com.au",
        trade: "Mobile car detailing",
        location: "Gold Coast",
        built: "May 2026",
        oneLiner: "A WebGL dust-and-light hero, and a condition guide that quotes honestly.",
        proofLine: "A WebGL hero, a photographic condition guide and SMS-first booking.",
        // WORDING RULE: the condition guide is a CUSTOMER SELF-ASSESSMENT scale.
        // One interior, photographed at five levels of grime. It is NEVER a
        // before/after, and never five different jobs. Do not reword this.
        what: "Goldy is mobile, so the site has to do the quoting before Gracie ever picks up the phone. The hero is a WebGL dust-and-light scene, and the “How rough is it?” guide is a customer self-assessment scale: one interior, photographed at five levels of grime, so a customer can point at where their own car sits. Under it runs a two-rail filterable gallery of real work and SMS-first booking with a price builder.",
        features: ["WebGL dust-and-light hero", "Customer self-assessment scale", "Two-rail filterable gallery", "SMS-first price builder"],
        status: "Live on her own domain, and still being added to as her services grow.",
        // WORDING RULE (repeat of the one above, because captions get edited in
        // isolation): the condition guide is a CUSTOMER SELF-ASSESSMENT scale,
        // one interior at five levels of grime. Never a before and after.
        captions: {
          reel: { lead: "A silent scroll of the live page.", text: "The hero is not a video file, it is being drawn live in the browser." },
          stills: [
            "The gallery. Two rails of her own work, filterable by vehicle, so a customer can find a car like theirs.",
            "How rough is it? One interior photographed at five levels of grime. A customer points at where their own car sits, and the price moves with them.",
            "The price builder. Pick the vehicle, pick the package, and the whole thing lands on Gracie's phone as a text.",
          ],
        },
        card: "assets/work/goldy/card.webp",
        posterDesktop: "assets/work/goldy/reel-desktop.webp",
        reelDesktop: "assets/work/goldy/reel-desktop.mp4",
        posterPhone: "assets/work/goldy/reel-phone.webp",
        reelPhone: "assets/work/goldy/reel-phone.mp4",
        stills: [
          "assets/work/goldy/still-01.webp",
          "assets/work/goldy/still-02.webp",
          "assets/work/goldy/still-03.webp",
        ],
      },
      {
        slug: "karine",
        name: "Karine S. Matthews",
        // The cream her whole site is set in. On --bg-ink: 11.2:1.
        tone: "#e3c08a",
        url: "https://karinesmatthews.com",
        trade: "Psychic medium and Reiki",
        location: "Gold Coast",
        built: "August 2026",
        oneLiner: "Hero motion generated by AI from her own pendulum photograph.",
        proofLine: "An AI-generated hero, made from her own pendulum photograph.",
        // WORDING RULE: the pendulum motion is AI-GENERATED from a still
        // photograph she supplied. The pendulum is hers; the movement and the
        // golden-hour setting were generated. Never imply we filmed it, and
        // never soften "AI-generated" to "crafted".
        what: "Karine works in a field where how a page feels matters as much as what it says. The hero motion is AI-generated from her own photograph of her pendulum rather than filmed footage, and a scroll-driven pendulum and moon dial carry you down the page. Booking is SMS-first, so an enquiry reaches her as a text instead of sitting in an inbox.",
        features: ["Cinematic pendulum hero", "Scroll-driven moon dial", "SMS-first booking", "AI motion from her own photo"],
        status: "Live on her own domain since August 2026.",
        // WORDING RULE (repeat of the one above): the pendulum motion is
        // AI-GENERATED from a still photograph she supplied. Never imply we
        // filmed it, and never soften "AI-generated" to "crafted".
        captions: {
          reel: { lead: "A silent scroll of the live page.", text: "Recorded from the site exactly as it runs today. The hero motion in it is AI-generated from her own pendulum photograph." },
          stills: [
            "The hero is AI-generated motion, made from her own photograph of her real pendulum. The pendulum is hers, the movement and the golden-hour setting were generated from that still.",
            "Her sessions, laid out plainly. What each one is, how long it runs and what it costs, before anyone has to ask.",
            "The room she reads in, photographed as it actually is, so a first-time visitor knows what they are walking into.",
          ],
        },
        card: "assets/work/karine/card.webp",
        posterDesktop: "assets/work/karine/reel-desktop.webp",
        reelDesktop: "assets/work/karine/reel-desktop.mp4",
        posterPhone: "assets/work/karine/reel-phone.webp",
        reelPhone: "assets/work/karine/reel-phone.mp4",
        stills: [
          "assets/work/karine/still-01.webp",
          "assets/work/karine/still-02.webp",
          "assets/work/karine/still-03.webp",
        ],
      },
    ],
    // smaller entries: one line, a card and a single still
    also: [
      {
        slug: "greenwood",
        name: "Greenwood Asset Finance",
        url: "https://greenwoodaf.com.au",
        trade: "Asset finance brokerage",
        location: "Australia-wide",
        built: "2026",
        oneLiner: "A 40-plus lender wall and a repayment estimator that does the maths up front.",
        card: "assets/work/greenwood/card.webp",
        stills: ["assets/work/greenwood/still-01.webp"],
      },
    ],
  },

  /* ---- Proof band (home page, links through to work.html) ---------------- */
  proof: {
    kicker: "The proof",
    heading: "Judge us on the work we have already {i:shipped}.",
    sub: "The same hands that build your AI staff build these websites. That is the standard the whole front of your business is held to, not just the clever bit.",
    cta: { label: "See the work", href: "work.html" },
    // Short form of work.disclosure, for the band on the home page. Same rule:
    // these are website clients, not Never Miss System customers.
    honest: "Websites we designed and built for these businesses. They are not customers of The Never Miss System, and nothing here claims a result.",
  },

  footer: {
    blurb: "Done-for-you AI staff for Australian businesses. You employ it, you don't operate it.",
    legal: [
      { label: "Terms", href: "terms.html" },
      { label: "Privacy", href: "privacy.html" },
    ],
  },
};
