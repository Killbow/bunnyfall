---
slug: revenant-lairs-thefts-and-companions
title: "Revenant Lairs, Festering, Theft, and Companions"
domain: ai
kind: subcard
parent: feud-telegraphs-and-revenants
files:
  - src/revenants/revenant.js
  - src/revenants/revenantFeud.js
  - src/revenants/revenantCompanions.js
  - src/revenants/revenantUnquiet.js
  - src/revenants/huntJournal.js
  - src/combat/harmMark.js
  - src/guilds/bountyBoard.js
  - src/ui/bountyMapMark.js
  - src/world/lairHost.js
  - src/world/dungeonEnd.js
  - src/ai/navmesh.js
  - src/scenes/dungeonContext.js
  - src/characters/exteriorFoes.js
  - src/scenes/exterior.js
replacesBible:
  - "12-Enhanced-AI/Feud-Arc.md#bands"
  - "12-Enhanced-AI/Feud-Arc.md#lairs"
  - "12-Enhanced-AI/Feud-Arc.md#theft"
  - "12-Enhanced-AI/Feud-Arc.md#festering"
  - "12-Enhanced-AI/Feud-Arc.md#loyalty"
related:
  - feud-telegraphs-and-revenants
  - revenant-feuds-adaptations-and-fate
  - feud-online-wire-and-revenant-ui
  - realm-saves-and-mod-save-hooks
invariants:
  - "Each rank-2+ revenant brings `RETINUE` followers (`[0, 0, 1, 2, 3, 3]`) from `kinPool` placed up to `BAND_SPACING` (6 m); followers scatter for 8 s when the master yields, tears away, or falls."
  - "Lairs must be non-spawned, non-arena, non-abyssal dungeons (`lairable`) with an enterable dungeon door (`lairHost.js`) and reachable end marker via `reachableEndOf` and `LAIR_WALK_WAIT_MS` (20 s)."
  - "Revenant theft runs online-only at respawn (`TOOK_MAX` = 3), excludes locked, quest, summoned, Materials Bag, `PackOnly` wallet, `RealmLocked`, gold, credit letters, vehicles, deeds, boat templates, and spellbooks, and carries stolen pieces until slain or spared."
  - "Companion loyalty clamps 0 to 100; below 20 risks 15% daily desertion (excluding errand and station assignments, splitting pack via `deserterSplit`), and below 10 lets unhinged, craven, or brutal companions betray once below 25% player HP (when not `revenantHeld()`)."
traps:
  - "`src/scenes/exterior.js` wires `exteriorFoes` without fates, `lairHere`, companions, or online respawn, so revenants fought in fixed-exterior routes die outright without kneeling, lairs, or sworn companions."
  - "28 of 774 graveyards (`GRVEAS10.RMB` and `GRVEAS36.RMB`) lack dungeon entrance doors; `createLairDoor` and `mendRevenantLairs` relocate those lairs to the nearest enterable dungeon within `LAIR_MEND_PX` (20 px)."
  - "Old saves rewinding `lastDay` are ignored by `revenantFester` catch-up (`FESTER.CATCHUP` = 7), and `ensureMirror` restores save-held companion packs and errands while returning disallowed `took` items via `tookHomeLine`."
  - "Pooled spells pass no striker so spell knockouts never trigger `revenantFelled`, and Recall `revenantRoutSweep` skips peer-owned puppets."
tags:
  - revenants
  - lairs
  - companions
  - loyalty
  - theft
  - festering
---

Living revenants return between fights, claim dungeon lairs via `src/world/lairHost.js` and `src/world/dungeonEnd.js`, and serve as sworn allies through `src/revenants/revenantCompanions.js`.

## Returns, Lairs, and The Dread

Revenants use a 2 to 4 day window (2880 to 5760 min) with a 0.4 return chance (Vengeance uses 1440 to 2880 min and 0.55); Night-stalkers return only at night. Open-world escapes pick `nearestLair` and start a `HUNT.MINUTES` (720) trail spawning at `HUNT.HEALTH` (0.6) with x1.25 `LAIR_GOLD`. A rank-5 revenant escaping again (excluding choice slips) ascends to Dread (`DREAD.MAX` = 1), locking in its lair (`lairKnown` true, x1.5 health, and x3 hoard gold) without further returns or festering.

## Festering, Routs, and Companions

Overdue living revenants fester via `FESTER.DAYS` (3) and `FESTER.EVERY` (3) up to `WRATH_MAX` (3, adding +0.10 HP and +0.05 blows per wrath). Mastery-ambition revenants fester every 2 days and can learn a non-elemental adaptation via `trainLesson` below cap. Routed deeds require harm within 30 s, player HP under 50% mid-fight, and >= 70 m distance or a jump.

Sworn companions (`REVENANT_RETINUE_MAX` = 6, 480 min rest) gain +25% HP and +10% blows per rank; Devoted (>= 90) grants x1.1 blows and behind warnings. Loyalty changes by +3 win, +2 daily together, +10 called, -1 daily away, -8 KO, -10 double dismiss, and -15 kin execution.
