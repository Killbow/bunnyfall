---
slug: launcher-parchment-face
title: "Desktop Launcher Face: Parchment, Wood Rail, Trinkets and Campfire"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - app/launcher/index.html
  - app/launcher/launcher.css
  - app/launcher/launcher.js
  - app/main.cjs
  - app/package.json
routes: []
tables: []
replacesBible: []
related:
  - ui-arc-front-door-intro-and-brand
  - ui-arc-overview
invariants:
  - "The launcher's art is public/art/bunnyfall-decor, the SAME folder the site's front page reads: app/main.cjs serves it as dagger://launcher/art/<file> (LAUNCHER_ART, source tree unpacked) and app/package.json build.files packs it as launcher/art."
  - "The rabbit and the PLAY badge animate only while Play can be pressed (body[data-ready], launcher.js); otherwise their still frames show. prefers-reduced-motion keeps the stills."
  - "The campfire is body[data-fire]: 0 cold, 1 embers (busy), 1-3 with a download's percent, 4 burning once Play is enabled; once 4 it stays lit for the window's life."
  - "Nothing scrolls but the patch notes: the first-run card's found rows are one line, and with four or more found it hides #setup-detail."
traps:
  - "The page's CSP is style-src 'self': no style attributes in index.html; the parchment and the campfire are inline SVG, the wood is art/wood.png tiled at 2x with image-rendering: pixelated."
  - "#play holds two images and a .play-label span: write the label with setText on .play-label, never play.textContent, or the badge is wiped."
  - "Patch-note bullets starting Fixed:/Changed:/Added:/New:/Removed: become li.tagged with a .tag pill (TAG in launcher.js)."
dfu: []
tags:
  - launcher
  - desktop
  - branding
---

# Desktop Launcher Face: Parchment, Wood Rail, Trinkets and Campfire

The launcher (960x600, fixed) is a parchment sheet under a wooden rail, dressed with the game's own trinkets and the Bunnyfall rabbit; the site's front page wears the same look.

- **Layout:** the rail (logo, a shelf of spellbook, coins and quill, the site link, the gem that breathes while busy); the patch-notes panel and the options panel (bank icons: letter, chest, ship) with wax seals on their corners; the bar with the rabbit, the campfire, the status bubble and the PLAY badge.
- **Art:** `public/art/bunnyfall-decor/README.md` lists every file and its source (GrimoireUI bank icons and seals cut out, spell-icon cells, currency, the generated `wood.png`).
- **States:** `launcher.js` sets `data-ready` and `data-fire` from the shell's view (`app/lib/launcherState.cjs viewOf`); everything else it paints is unchanged.
