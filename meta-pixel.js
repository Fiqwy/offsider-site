/* =============================================================================
   meta-pixel.js: the Meta Pixel, one shared copy, loaded on every page.

   Referenced from every page's <head> with `defer`, matching the site's script
   convention. Nothing here blocks paint: the loader runs after the parse, and
   Meta's own snippet appends fbevents.js with `async`.

   The <noscript> image Meta ships alongside the snippet cannot live in a JS
   file, so it stays inline at the top of each page's <body>. It is the one
   part of this that is copied per page.

   THE OPT-OUT GATE COMES FIRST. If the browser sends Do Not Track or Global
   Privacy Control we return before anything loads, so there is no fbq, no
   cookie and no request to Meta at all. privacy.html section 04 documents this
   as the opt-out we honour, including the JavaScript-off caveat.

   Events, and there are only three:
     · PageView   here, once per page load.
     · ViewContent  audit.js, when the audit starts (first answer tapped).
     · Lead         audit.js, when the gate submission comes back successful.
   The last two sit at the same two milestones the first-party beacon marks.

   HOUSE RULE: no personal data reaches Meta. No Advanced Matching, and never
   an audit answer, a dollar figure, a name, a mobile number or an email in an
   event parameter. Meta is told that a form was submitted, never who by.
   ========================================================================== */
(function () {
  "use strict";

  const META_PIXEL_ID = "2525223994650279";

  /* Either signal is enough, and either one stops the pixel dead. Read defensively:
     browsers have shipped this on window and with an ms prefix, and "yes" as well
     as "1". Anything we cannot read at all is treated as an opt-out. */
  try {
    const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    if (dnt === "1" || dnt === "yes" || navigator.globalPrivacyControl === true) return;
  } catch (e) {
    return;
  }

  /* Meta's standard base snippet, unchanged apart from the ID above. */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
})();
