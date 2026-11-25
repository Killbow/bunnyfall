---
slug: game-voice-overview
title: "Game Voice and Second-Person Text Discipline"
domain: ui
kind: overview
parent: null
files:
  - tools/plainText.mjs
  - src/ui/tutorialCatalogue.js
  - src/ui/profPages.js
  - src/characters/arcanePaths.js
  - src/systems/survival/restItems.js
  - src/ui/craftXpWords.js
routes: []
tables: []
replacesBible:
  - "10-UI/Voice.md"
related:
  - game-voice-rules-and-exemptions
  - plain-words-overview
  - ui-overlays-and-localization
invariants:
  - "Player-read text matches classic Daggerfall quest and system message voice."
  - "Numbers and stat lines are never voice-rewritten."
traps:
  - "Tutorial pages never name the old game or its capital; the game is DFO."
dfu: []
tags:
  - voice
  - text
  - style
---

# Game Voice and Second-Person Text Discipline

Player-read copy across tutorials, professions, arcane specializations, rest items, and crafting follows classic Daggerfall quest and system message voice (`tools/plainText.mjs`, `plain-words-overview`, `ui-overlays-and-localization`).

## Second-Person Voice and Tone

- **Direct sentences (`tools/plainText.mjs`):** Instructions use complete second-person sentences and ordinary vocabulary without humor, slang, or developer commentary. Numbers, formulas, and stat lines are never rewritten for voice, so mechanical values remain exact.
- **DFO naming rule (`src/ui/tutorialCatalogue.js`):** Tutorial pages in `src/ui/tutorialCatalogue.js` refer to the game as DFO and never name the old game or its capital city in instructional copy.

## Swept UI Surfaces

- **VOICE1 instructional rewrites (`src/ui/tutorialCatalogue.js`, `src/ui/profPages.js`, `src/characters/arcanePaths.js`, `src/systems/survival/restItems.js`, `src/ui/craftXpWords.js`):** The initial voice pass unified tutorial catalog pages, profession sheets, arcane specialization descriptions, survival rest item prompts, and crafting progress notifications around direct second-person phrasing.
- **VOICE2 spelling and jargon cleanup (`game-voice-rules-and-exemptions`):** The second pass enforced American English spelling and replaced RPG meta-jargon across localized strings while preserving exact numbers, stat tables, and exempt lore or classic DFU files.
