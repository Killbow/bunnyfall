---
slug: quest-guide-herald-and-tracker
title: "Quest Herald Notices and the HUD Quest Tracker Card"
domain: quests
kind: subcard
parent: quest-guide-arc-overview
files:
  - src/ui/questHerald.js
  - src/ui/enhancedNotice.js
  - src/ui/questTracker.js
  - src/ui/questRail.js
  - src/ui/hud.js
  - src/ui/partyPanel.js
  - src/saves/modSaveData.js
  - src/systems/quest/questBridge.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Guide-Arc.md"
related:
  - quest-guide-arc-overview
  - quest-guide-show-on-map-and-marks
  - event-board-notice-door-and-news-toasts
  - online-time-quest-delays-and-deadlines
invariants:
  - "A quest has at most one herald notice. A new event updates that notice using RANK precedence: completed/ended > started > urgent > objective > updated."
  - "Only HERALD_MAX = 3 notices show at once; the lowest-ranked notice (oldest among equals) is dropped. Each notice lasts HERALD_SECONDS = 12 of visible HUD time."
  - "Only the tracked quest uid chosen by the player is saved per character (`TRACKER_SAVE = \"QuestTracker\"` via `registerModSaveData`); auto-follow is never saved."
  - "HUD countdowns count only clocks a logged entry names (clocksNamed), so hidden timers are never spoiled."
traps:
  - "entryOpening lives in src/ui/questRail.js, not the lens. The HUD imports the herald and tracker, and pulling in the quest machine would create the place.js -> save.js -> hud.js import cycle."
  - "src/ui/hud.js calls drawQuestHerald outside the skin gate (including from hideHudTextSurfaces) so the queue drains when the herald is off or a window is open."
dfu: []
tags:
  - quests
  - herald
  - tracker
  - hud
  - aria-live
  - mod-save
  - GUIDE3
  - GUIDE4
---

# Quest Herald Notices and the HUD Quest Tracker Card

`src/ui/questHerald.js` and `src/ui/questTracker.js` render quest event toasts and the persistent HUD tracker card from the shared rail model in `src/ui/questRail.js` without importing the quest machine into `src/ui/hud.js`.

- **Herald Ranking, Draining, and Accessibility (`src/ui/questHerald.js`, `src/ui/enhancedNotice.js`, `src/ui/hud.js`):** When `heraldOn()` (`isEnhanced() && getPref('questHerald')` with a DOM) is true, `QuestHerald` formats `New quest`, `Journal updated`, `Under a day left`, `Quest completed`, and `Quest ended` notices through `drawEnhancedToasts`. Each quest owns at most one notice updated by `RANK` (`completed`/`ended` > `started` > `urgent` > `objective` > `updated`), capped at `HERALD_MAX = 3` for `HERALD_SECONDS = 12` of visible HUD time. `src/ui/hud.js` invokes `drawQuestHerald` outside the skin gate (including inside `hideHudTextSurfaces`) so queued notices drain while disabled or covered. Spoken announcements use polite `aria-live` region `HERALD_LIVE_ID` (`'quest-herald-live'`), while visual toasts remain `aria-hidden`.
- **Opening Extraction and Tracker Card (`src/ui/questRail.js`, `src/ui/questTracker.js`, `src/ui/partyPanel.js`, `src/saves/modSaveData.js`):** `entryOpening` (kept in `src/ui/questRail.js` to avoid a `place.js` to `save.js` to `hud.js` cycle) strips the date header, joins lines, and clips the first sentence at word boundaries (`OPENING_MAX = 140`, `TRACKER_OPENING_MAX = 64`) without trailing small words. `#enhanced-questtracker` (`aria-hidden`) displays the title, a filled tracked or hollow auto-followed diamond, opening, target, and `clocksNamed` countdown, saves explicit selections under `TRACKER_SAVE = "QuestTracker"` (`registerModSaveData`), and publishes `TRACKER_HEIGHT_VAR` (`--dfquest-h`) to offset `.dfparty`.
