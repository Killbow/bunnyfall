---
slug: revenant-fate-execution-trophy-and-voice
title: "Kneeling Fate, Execution, Trophies, and Voice"
domain: ai
kind: subcard
parent: revenants-lifecycle-overview
files:
  - src/revenants/revenantFate.js
  - src/revenants/revenantTrophy.js
  - src/revenants/revenantPersonality.js
  - src/revenants/revenantVoice.js
  - src/revenants/revenant.js
  - src/render/dissolve.js
  - src/magic/hostMagic.js
  - src/ui/revenantFateView.js
  - src/ui/revenantCard.js
  - src/ui/revenantPage.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Revenants.md"
related:
  - revenants-lifecycle-overview
  - revenant-feuds-adaptations-and-fate
  - feud-online-wire-and-revenant-ui
  - sworn-companion-gear-arts-and-stars
invariants:
  - "`yieldStep` returns `'slip'` (returning the revenant to hunting) once held kneel time exceeds `REVENANT_YIELD_MS` (`90000`) or the player moves past `REVENANT_YIELD_REACH` (`60`); the timer pauses while the fate window is open (`judging`)."
  - "`fateHeld` covers `yielded`, `executing`, `sparing`, and `leaving`; spells skip enemies in these states as well as `roaring` enemies (`src/magic/hostMagic.js`)."
  - "Personality is deterministic per ID (`personalityFor` hashes `voice:${id}` into a kind-weighted pool) and produces identical results across clients and save loads."
traps:
  - "`MUTE_KINDS` (beasts, mindless undead, and atronachs) never speak; `revenantSpeaks` returns false for them, and `beastBody` emits third-person narrator lines instead of dialogue."
  - "Unknown personality IDs fall back to `'brutal'` lines in `voiceLines`."
dfu: []
tags:
  - revenants
  - fate
  - execution
  - trophy
  - personality
  - voice
---

When a hunting revenant is defeated with broken will, it kneels in `src/revenants/revenantFate.js` so the player can execute it for a named trophy weapon or spare it into sworn service (`src/ui/revenantFateView.js`).

## Kneeling Window, Execution, and Trophies

While kneeling (`yielded`), `yieldStep` tracks elapsed time and distance (`src/revenants/revenant.js`). If the player waits longer than `REVENANT_YIELD_MS` (`90000` ms) or moves beyond `REVENANT_YIELD_REACH` (`60`) while not actively `judging`, `yieldStep` returns `'slip'` and the revenant escapes. `fateHeld` marks `yielded`, `executing`, `sparing`, and `leaving`, and `src/magic/hostMagic.js` skips enemies in `fateHeld` or `roaring` states. Transitions use `EXECUTION_MS` (`{ burst: 480, end: 1500 }`), `SPARING_MS` (`900`), and `TEAR_MS` (`{ delay: 120, ms: 720 }`) with dissolve effects from `src/render/dissolve.js`.

Executing a kneeling revenant mints a trophy weapon (`src/revenants/revenantTrophy.js`) matched to the enemy kind or class via `TROPHY_KIND_WEAPONS` and titled with the revenant's name plus a `TROPHY_NOUNS` noun. `trophyRarity` rolls `0.12` Legendary and `0.33` Rare at rank 1 (adding `+0.05` Legendary and `+0.04` Rare per rank above 1) and defaults to Magic; executing the Dread always awards a Legendary trophy.

## Personalities and Voice Presentation

`personalityFor` (`src/revenants/revenantPersonality.js`) hashes `voice:${id}` into ten `PERSONALITIES`: `brutal`, `witty`, `humorous`, `arrogant`, `cold`, `zealous`, `unhinged`, `'honourable'` (labeled Honorable), `craven`, and `weary`, each carrying a `manner` phrase. `MUTE_KINDS` suppresses speech (`revenantSpeaks` is false) and routes text through `beastBody` third-person descriptions. `src/revenants/revenantVoice.js` bridges lines to `src/ui/revenantCard.js` and `src/ui/revenantPage.js` through `setRevenantPresenter` and `revenantSay`.
