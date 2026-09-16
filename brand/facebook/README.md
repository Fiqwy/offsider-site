# Facebook Page assets — Applied Intelligence

Built 2026-09-10 in the same pipeline as the Leak Audit ad pack (HTML/CSS at final pixel size → headless Chromium).
Tokens, fonts (Hanken Grotesk + Instrument Serif italic) and the linked-modules mark are the live site's.

## Upload
- Profile photo → `out/profile-blue-1024x1024.png` (Facebook crops to a circle; mark sits at 75% of the radius). Alt: `profile-ink-1024x1024.png`.
- Cover photo → `out/cover-crew-1640x624.png` (2× of the 820×312 display size). Alt: `cover-type-1640x624.png`.
  If Facebook's recompression muddies the PNG, upload the `.jpg` (q92, sRGB) instead. The `820x312` PNGs are 1× copies.

## Safe zones baked in
- All copy + crew inside the central 1280 px (mobile shows only 640/820 of the width).
- Copy ends at y≈415; the profile photo overlaps the cover from ~y434 on desktop (bottom-left) and bottom-centre on mobile. CTA pill lives top-right for that reason.

## Regenerate
Edit `src/*.html`, then `python3 render.py`. Output size comes from the `WxH` in the filename.
