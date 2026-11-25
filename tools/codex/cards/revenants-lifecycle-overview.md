---
slug: revenants-lifecycle-overview
title: "Revenants Lifecycle Overview, Caps, and Save"
domain: ai
kind: overview
parent: null
files:
  - src/revenants/revenant.js
  - src/revenants/unquietMark.js
  - src/revenants/revenantUnquiet.js
  - src/revenants/revenantFate.js
  - src/revenants/revenantCompanions.js
  - src/characters/companionSlots.js
  - src/characters/eliteFoes.js
  - src/characters/exteriorFoes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Revenants.md"
related:
  - feud-telegraphs-and-revenants
  - revenant-feuds-adaptations-and-fate
  - revenant-lairs-thefts-and-companions
  - feud-online-wire-and-revenant-ui
  - revenant-fate-execution-trophy-and-voice
  - revenant-unquiet-crafts-ambitions-and-dread
  - sworn-companion-gear-arts-and-stars
  - sworn-companion-errands-and-clock
invariants:
  - "`revenantCandidate` admits only special enemies (`entity.revenant`, `eliteFoe`, or a `champion` string) at `REVENANT_MIN_LEVEL` (`3`) or higher; a new candidate also requires `isUnquiet` and fewer than `REVENANT_MAX` (`3`) hunting revenants."
  - "`revenantCandidate` excludes `KNIGHT_CITY_WATCH`, `PlayerAlly` team members, retinue followers (`retinueOf`), `wildFoe` and `wildGiant`, `bout` fighters, and records flagged `questBehaviour`, `allied`, `questMarker`, `puppet`, or `riteRole`."
  - "`unquietId` marks an ID deterministically (FNV of `id|unquiet` modulo `1000 < 250`, `UNQUIET_MARK = 0.25`); `isUnquiet` is false for wild and bout enemies."
  - "Online, `revenantHeld()` blocks all revenant activity below `REVENANT_MIN_RENOWN` (`10`), while elites gate at `ELITE_FOE_MIN_RENOWN` (`5`) in `src/characters/eliteFoes.js`."
  - "The Dread is excluded from `huntingRevenants`, so it never consumes one of the `REVENANT_MAX` hunting slots."
  - "Ranks clamp between `1` and `REVENANT_MAX_RANK` (`5`)."
traps:
  - "A kinsman killer inherited by an heir joins past `REVENANT_MAX` without burying anyone, whereas deserters and betrayers past the cap bury the weakest, oldest hunting revenant."
  - "A marked enemy whose flight starts after it is no longer a candidate (such as when the hunting cap fills mid-fight) returns `cornered` instead of escaping."
dfu: []
tags:
  - revenants
  - lifecycle
  - unquiet
  - caps
  - save
---

Revenants are persistent special enemies that survive encounters, advance in rank from `1` to `REVENANT_MAX_RANK` (`5`), and either hunt the player, ascend to the Dread, fall in execution, or join the party as sworn companions.

## Candidate Gate, Lifecycle, and Caps

`revenantCandidate` (`src/revenants/revenant.js`) admits only `entity.revenant`, `eliteFoe`, or `champion` enemies at level `REVENANT_MIN_LEVEL` (`3`) or above, excluding `KNIGHT_CITY_WATCH`, `PlayerAlly`, `retinueOf`, `wildFoe`, `wildGiant`, `bout`, `questBehaviour`, `allied`, `questMarker`, `puppet`, and `riteRole`. New candidates must carry `isUnquiet` (`unquietId` FNV hash `< 250` for `UNQUIET_MARK = 0.25` in `src/revenants/unquietMark.js`) while `huntingRevenants` is below `REVENANT_MAX` (`3`). Online play suppresses revenant activity via `revenantHeld()` below `REVENANT_MIN_RENOWN` (`10`), above `ELITE_FOE_MIN_RENOWN` (`5` in `src/characters/eliteFoes.js`).

A candidate enters the hunting pool by killing the player or escaping (`src/revenants/revenantUnquiet.js`), kneels at defeat (`src/revenants/revenantFate.js`), and is either executed or sworn (`src/revenants/revenantCompanions.js`). The roster holds up to `REVENANT_RETINUE_MAX` (`6`) sworn companions with `COMPANION_SLOTS` (`3`, `src/characters/companionSlots.js`) active at the player's side, and peers replicate at most `PEER_REVENANT_PUPPETS_MAX` (`9`) puppets (`src/characters/exteriorFoes.js`).

## Persistence, Returns, and Tombstones

State saves client-side through `registerModSaveData(REVENANT_SAVE)` (`REVENANT_SAVE = 'Revenant'`) as `{ v: 1, list, lastDay }`, with zero dedicated HTTP routes, WebSocket frames, or SQLite tables. Hunting revenants return in `REVENANT_RETURN_MIN_MINUTES` to `REVENANT_RETURN_MAX_MINUTES` (`2880` to `5760`) on a `REVENANT_RETURN_CHANCE` (`0.4`) roll (or `REVENANT_LOST_MINUTES = 360` if active when saved) and taunt within `REVENANT_TAUNT_DISTANCE` (`25`). History keeps `REVENANT_FALLEN_MAX` (`12`) slain records and up to `REVENANT_TOMBS_MAX` (`200`) `{ id, rev }` tombstones so older saves cannot revive slain revenants.
