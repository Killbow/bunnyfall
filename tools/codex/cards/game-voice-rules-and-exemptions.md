---
slug: game-voice-rules-and-exemptions
title: "Game Voice Word Limits, Jargon Bans, and Localization Exemptions"
domain: ui
kind: subcard
parent: game-voice-overview
files:
  - tools/plainText.mjs
  - src/ui/craftXpWords.js
  - src/items/portBooks.js
  - src/net/eliteGates/egAnnals.js
  - src/travel/travelOptionsText.js
  - locales/en/Port_Strings.csv
  - tools/l10nInSession.mjs
routes: []
tables: []
replacesBible:
  - "10-UI/Voice.md"
related:
  - game-voice-overview
  - plain-words-overview
  - ui-overlays-and-localization
invariants:
  - "`STRING_WORDS_MAX` = 40 words per string."
  - "`SENTENCE_WORDS_MAX` = 25 words per sentence."
  - "Filler phrases in `PADDING` are banned."
  - "Classic/DFU text under vendor/ stays verbatim."
  - "Meaning-changing edits must be redrafted with tools/l10nInSession.mjs."
traps:
  - "Avoid HUD, cooldown, stack, buff, proc, reroll, boss, and XP in player sentences; tier becomes grade or rank, and instructions avoid dash asides."
  - "Travel Options help preserves upstream mod spelling, and code names, save keys, and ICU placeholders like `{meters}` keep exact identifiers."
dfu: []
tags:
  - voice
  - jargon
  - spelling
  - exemptions
  - localization
---

# Game Voice Word Limits, Jargon Bans, and Localization Exemptions

`tools/plainText.mjs` and `tools/l10nInSession.mjs` enforce length caps, jargon bans, American spelling, and exemptions across player copy (`game-voice-overview`, `plain-words-overview`, `ui-overlays-and-localization`).

## Length Caps, Jargon Bans, and Spelling

- **Word limits and filler (`tools/plainText.mjs`):** Strings cap at `STRING_WORDS_MAX = 40` words and sentences cap at `SENTENCE_WORDS_MAX = 25` words, and `PADDING` filler phrases are banned. Effect descriptions state the effect, amount, and duration without dash asides.
- **Jargon and spelling (`src/ui/craftXpWords.js`, `locales/en/Port_Strings.csv`):** Player sentences avoid `HUD`, `cooldown`, `stack`, `buff`, `proc`, `reroll`, `boss`, and `XP`, and replace `tier` with `grade` or `rank`. Copy uses American spelling (`armor`, `color`, `gray`, `specialization`, `traveled`, `jeweler`).

## Exemptions and Localization Workflow

- **Exempt surfaces (`src/items/portBooks.js`, `src/net/eliteGates/egAnnals.js`, `src/travel/travelOptionsText.js`):** Vendor DFU text, spoken lines, in-world books, annals, classic key prompts, diagnostic messages, and UI labels are exempt. Travel Options help keeps upstream mod spelling, and code names, save keys, and ICU placeholders like `{meters}` stay verbatim.
- **Translation rows (`tools/l10nInSession.mjs`, `locales/en/Port_Strings.csv`):** Meaning-changing edits must be redrafted with `tools/l10nInSession.mjs`. VOICE2 moved machine rows to new English keys and left human translator rows untouched.
