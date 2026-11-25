---
slug: ui-arc-front-door-intro-and-brand
title: "Front Door, Held Title Intro, Brand Mark, and Landing Page"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/ui/enhancedMenu.js
  - src/ui/enhancedChunk.js
  - src/ui/introScreen.js
  - src/ui/introCue.js
  - src/audio/introTheme.js
  - src/ui/brandMark.js
  - src/ui/supportAsks.js
  - src/ui/enhancedStyle.js
  - src/ui/pixelifyFive.js
  - src/main.js
  - index.html
  - play/index.html
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - scene-router-and-boot-doors
  - ui-arc-overview
invariants:
  - "One front door (src/ui/enhancedMenu.js) serves both skins and opens before the ARENA2 folder pick; ensureData (src/main.js) waits until a game door is chosen."
  - "The held intro title (TITLE_HELD_TIME, requestDraw in src/ui/introScreen.js) is the landing pad for game doors; WebGL and IntroTheme are disposed before game boot."
  - "Enhanced menu chunks preload one at a time through requestIdleCallback in src/ui/enhancedChunk.js, fire-and-forget."
traps:
  - "index.html at the root has zero script tags and one img: ./src/assets/branding/bunnyfall.png; the game lives at play/index.html."
  - "BRAND_LOGO_OPTICAL_SHIFT = 0.02 (BR7 Bunnyfall wordmark) replaced the older dragon-mark shift; do not restore translateX(-10%)."
  - "Pixelify Sans needs font-variant-ligatures: none or 'fi' renders wrongly."
dfu: []
tags:
  - front-door
  - intro
  - branding
  - landing
  - fonts
---

# Front Door, Held Title Intro, Brand Mark, and Landing Page

A single front-door menu and held intro backdrop precede the `ARENA2` asset check, pairing sequential idle chunk preloading with Bunnyfall branding and pixel typography rules.

- **Front Door and Held Intro Backdrop:** `src/ui/enhancedMenu.js` serves both skins before `ensureData` in `src/main.js` prompts for `ARENA2`, while `src/ui/enhancedChunk.js` preloads menu chunks one by one via `requestIdleCallback`. `src/ui/introScreen.js` (`TITLE_HELD_TIME`, `requestDraw`) and `src/ui/introCue.js` (`introTitleAt`, `introSunAt`, `introAtmosphereAt`) drive the intro backdrop alongside `IntroTheme` in `src/audio/introTheme.js` (`src/assets/intro/theme.mp3`), disposing WebGL and audio before game boot.
- **Branding and Static Entry Points:** Root `index.html` is a static landing page with zero scripts and one `./src/assets/branding/bunnyfall.png` image, whereas the game runs at `play/index.html`. `src/ui/brandMark.js` exports `BRAND_LOGO_URL`, `BRAND_LOGO_ALT = 'Bunnyfall'`, `BRAND_LOGO_OPTICAL_SHIFT = 0.02`, and `brandMark`.
- **Tokens, Support Marks, and Fonts:** `src/ui/enhancedStyle.js` defines `ENHANCED_TOKENS`, `ENHANCED_CSS`, `FONT_DISPLAY`, `FONT_DATA`, and `FONT_BRAND`. `src/ui/supportAsks.js` provides `SUPPORT_ASKS`, `SUPPORT_MARKS_CSS`, `markCss`, and `MARK_BODY_ROWS`, while `src/ui/pixelifyFive.js` exports `PIXEL_FONT_CSS`, `PIXEL_READ_CSS`, and `PIXEL_FAMILIES` with `font-variant-ligatures: none`.
