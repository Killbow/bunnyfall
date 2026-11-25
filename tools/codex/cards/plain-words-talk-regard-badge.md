---
slug: plain-words-talk-regard-badge
title: "Talk Panel Regard Badge and Enemy Refusal Text"
domain: ui
kind: subcard
parent: plain-words-overview
files:
  - src/systems/livingWorld/people.js
  - src/systems/livingWorld/relations.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/livingRoads.js
  - src/systems/livingWorld/livingWorldHost.js
  - src/talk/townTalk.js
  - src/ui/enhancedTalk.js
  - src/ui/nativeTalk.js
  - src/scenes/world.js
  - src/scenes/exterior.js
routes: []
tables: []
replacesBible:
  - "10-UI/Plain-Words.md"
related:
  - plain-words-overview
  - living-world-relations-and-deeds
  - living-world-overview
  - living-world-roads-trips-and-encounters
  - living-world-indoors-and-lodgers
invariants:
  - "`regardBadge(card)` truncates regard with `Math.trunc` (toward zero, never rounded). It returns `{ standing, label, value, share, words }`, where `value` is signed and `share` is `(r + REGARD_MAX) / (2 * REGARD_MAX)`."
  - "Standing labels come from STANDING_NAMES: friend 'Friend', neutral 'Known', enemy 'Enemy', hostile 'Hostile'. Tiers follow `regardStanding`: Friend at r >= FRIEND_AT (40), Hostile at r <= HOSTILE_AT (-70), Enemy at r <= ENEMY_AT (-40), otherwise Known."
  - "`LivingTown.refuses` refuses Enemy and Hostile residents before the panel opens. townTalk then shows the refusal with `(label, value)` appended from `livingTalk.regard`."
traps:
  - "Only the enhanced talk panel draws the badge (a `talk-regard` button whose words open on press or tap via `regardOpen`, with a hover title too). The classic `nativeTalk.js` keeps DFU's native rects and draws no badge."
  - "DFU native walkers and static NPCs carry no living regard. The exterior benchmark scene runs without the living world, so its NPCs have no regard data."
  - "Road and indoor residents reach the badge through `_livingRoadsDoor.regardCard` / `_livingIndoorsDoor` and world.js `livingTalk`, not through separate townTalk instances."
dfu: []
tags:
  - talk
  - regard
  - living-world
  - badge
  - plain-ui
---

# Talk Panel Regard Badge and Enemy Refusal Text

Living-world residents expose their standing and truncated regard score on the enhanced talk panel and in conversation refusal notices.

- **Badge Computation and Standing Tiers:** `regardBadge(card)` in `src/systems/livingWorld/people.js` truncates regard toward zero with `Math.trunc` and returns `{ standing, label, value, share, words }`, computing `share` as `(r + REGARD_MAX) / (2 * REGARD_MAX)`. Labels and thresholds come from `STANDING_NAMES` and `regardStanding` in `src/systems/livingWorld/relations.js`: `'Friend'` at `r >= FRIEND_AT` (`40`), `'Hostile'` at `r <= HOSTILE_AT` (`-70`), `'Enemy'` at `r <= ENEMY_AT` (`-40`), and `'Known'` otherwise.
- **Refusals and Enhanced Panel Interaction:** `LivingTown.refuses` in `src/systems/livingWorld/livingTown.js` blocks conversations with Enemy and Hostile residents before the talk window opens, and `src/talk/townTalk.js` appends `(label, value)` from `livingTalk.regard` to the refusal line. In `src/ui/enhancedTalk.js`, the `.talk-regard` button toggles `regardOpen` on press or tap and sets a hover `title` showing `'How they regard you: +N, from -100 to +100'`, whereas classic `src/ui/nativeTalk.js` renders no badge.
- **Scene Wiring:** `src/scenes/world.js` passes `regard: (person) => regardBadge(person?.living?.town?.regardCard?.(person) ?? null)` into `livingTalk`, routing road and indoor residents via `src/systems/livingWorld/livingRoads.js` and `src/systems/livingWorld/livingWorldHost.js`, while `src/scenes/exterior.js` and native DFU walkers carry no regard data.
