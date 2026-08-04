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
    email: "hello@appliedintelligence.biz",
    phone: "",                  // add real number when live
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
    proof: "Every lead answered in 60 seconds. Guaranteed.",
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
      { name: "Star",   tone: "gold",   text: "Collected another 5-star review",              time: "6:02pm"  },
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
    stat: { value: "24/7", label: "every call answered, day or night" },
  },

  /* ---- The Problem (the leaks) ------------------------------------------- */
  problem: {
    kicker: "The leak",
    heading: "Every missed call is a job walking to your {i:competitor}.",
    body: "You're on the tools, on a ladder, under a car. The phone rings out. The lead texts someone else. The quote goes cold. None of it is your fault, but all of it costs you.",
    stats: [
      { value: "62%", label: "of calls to small businesses go unanswered" },
      { value: "21x", label: "more likely to convert if you reply within 5 minutes" },
      { value: "47 min", label: "average time a busy business takes to reply to a lead" },
      { value: "$0", label: "of that lost revenue ever shows up on a report" },
    ],
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
        line: "A lead comes in and I reply in 60 seconds, not 47 minutes, before they call anyone else.",
        also: "Missed-call text-back, web-form follow-up, instant booking links, lead scoring.",
        portrait: "zip.webp" },
      { outcome: "Never miss a call", name: "Ada", role: "AI Receptionist", tone: "brand",
        line: "Start me on nights and weekends, where missed calls already cost you jobs. When I have proven it, hand me the whole front desk.",
        also: "After-hours or full-time cover, a natural Australian voice, live calendar booking, call summaries. Most start after hours and upgrade.",
        portrait: "ada.webp" },
      { outcome: "Quotes out. Money in.", name: "Nudge", role: "Quotes & Invoices", tone: "teal",
        line: "Give me your pricing guide and I build and send the quote, chase it until it is answered, then invoice and follow the money in.",
        also: "Quote building from your rules, day 1-3-7 follow-up, invoicing, gentle payment chasing.",
        portrait: "nudge.webp" },
      { outcome: "Every question answered", name: "Leo", role: "Customer Service", tone: "indigo",
        line: "Customers ask, I answer, day or night. Warranty, booking changes, that thing on their invoice. You stay on the tools.",
        also: "SMS, email and web chat, instant answers from your business info, warm leads nursed to a booking.",
        portrait: "leo.webp" },
      { outcome: "More 5-star reviews", name: "Star", role: "Review Engine", tone: "gold",
        line: "Every finished job, I ask for the review at the right moment, so your happiest customers are the ones leaving the stars.",
        also: "Google review requests, reputation monitoring, replies handled.",
        portrait: "star.webp" },
      { outcome: "Win back lost customers", name: "Boomer", role: "Reactivation · Optional", tone: "violet",
        line: "I win back the customers who went quiet and get them booking again.",
        also: "Dormant-list campaigns, seasonal offers, past-customer reminders. An optional hire: fits businesses with a customer list to wake up.",
        portrait: "boomer.webp" },
    ],
    // the "and it also does" catch-all — the admin line Nicholas asked for
    moreLabel: "And it also automates the repetitive admin",
    moreLine: "If it is manual and it repeats, we can hand it to your AI staff. Whatever you are picturing, we can probably build it.",
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
      "The Week-One Win-Back Blitz: your dormant customers messaged in week one, pulling work forward fast",
      "Quotes built, sent and chased from your pricing rules",
      "Invoices raised and politely chased",
      "5-star reviews collected after every job",
      "One dashboard showing everything your staff did",
      "A plain-English business X-ray every week",
      "A supervised warm-up before anyone goes live",
      "A real person managing and tuning it all",
    ],
    scarcity: "We build and run every crew personally, so we take on a limited number of new businesses each month, and only one per trade in your area.",
  },

  /* ---- Guarantee / risk removal ------------------------------------------ */
  guarantee: {
    kicker: "The 60-Second Promise",
    heading: "Every lead answered in 60 seconds, or the month is {i:free}.",
    promise: {
      badge: "Our promise, in writing",
      statement: "Every call and every new enquiry that comes through your AI staff gets a response within 60 seconds, day or night. If we ever drop below that in a month, that month is on us.",
      finePrint: "Measured across the calls and leads routed through your AI staff. The refund is that month's fee. No lock-in, cancel any time.",
    },
    points: [
      { title: "You see it work first", text: "Every worker starts in a supervised warm-up. You approve the messages before anything goes live in front of a customer." },
      { title: "No lock-in", text: "Month to month. Stay because it is booking you jobs, not because you are trapped in a contract." },
      { title: "Hard guardrails", text: "Spend caps, quiet hours and one hard rule: your staff never invent a price. Quotes only ever come from your pricing rules, and you can switch quoting off entirely." },
    ],
  },

  /* ---- FAQ --------------------------------------------------------------- */
  faq: [
    { q: "Is it actually autonomous, or do I have to run it?",
      a: "You employ it, you don't operate it. We build, connect and manage your AI staff for you. You just see the results in your dashboard." },
    { q: "Will it sound like a robot to my customers?",
      a: "No. Your AI receptionist uses a warm, natural Australian voice, briefed on your services, your prices and the way you like your customers looked after. Your text-based staff reply in your business's tone. You approve everything before it goes live, and anything tricky is handed straight to you. Most customers never know." },
    { q: "Is my customer data safe?",
      a: "Yes. Your data stays yours, isolated to your business, and your AI staff run with strict guardrails on what they can see and do." },
    { q: "What if it gets something wrong?",
      a: "Every worker starts in a supervised warm-up so you catch anything before it goes live. Once running, spend caps and quiet hours keep it safe, and we monitor it for you." },
    { q: "How does the 60-Second Promise work?",
      a: "Every call and every new enquiry that comes through your AI staff gets a response within 60 seconds, day or night. If in any month we drop below that on the calls and leads routed through your staff, that month is free. No lock-in, and you can cancel any time." },
    { q: "Can it really send quotes for me?",
      a: "Yes. You give us your pricing rules once, and Nudge builds and sends quotes from them, follows each one up, then invoices when the job is done. It never invents a price. If a job falls outside your rules, it hands straight to you." },
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

  /* ---- Final CTA --------------------------------------------------------- */
  finalCta: {
    heading: "Find out what your business is {i:leaking}.",
    sub: "The Leak Audit is free, and you keep your Leak Map even if you never hire us. Worst case, you walk away knowing exactly where you are losing jobs. Best case, you hire your first AI staff this week. And remember, we take one business per trade, per area. If your competitor books first, the spot is theirs.",
  },

  footer: {
    blurb: "Done-for-you AI staff for Australian businesses. You employ it, you don't operate it.",
  },
};
