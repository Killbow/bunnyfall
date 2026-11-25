---
slug: world-events-raise-and-trait-hardening-overview
title: "World Event Raise Windows, Boss Wards, and Raid Hardening"
domain: world-events
kind: overview
parent: null
files:
  - src/net/sdLaw.js
  - src/characters/bossTraits.js
  - src/worldEvents/raidingParties.js
  - src/worldEvents/courtRulesDoor.js
  - src/ui/statusTips.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-World-Events.md"
related:
  - world-events-raise-and-made-level-rules
  - world-events-boss-trait-and-raid-hardening
  - boss-traits-overview
  - raiding-parties-overview
  - integrity-boss-body-ledger
  - event-board-hud-overview
invariants:
  - "Made-level rules (resurrect, regen, death, unstuck) are declared per place in src/characters/madeLevel.js and enforced at src/worldEvents/courtRulesDoor.js."
  - "Every rule a place holds is said on the event rules tile (src/ui/statusTips.js), including 'No /unstuck.'."
traps:
  - "The made-level rules tile is enhanced-HUD only; the classic status row has no tile."
dfu: []
tags:
  - audit
  - world-events
  - boss-traits
  - raids
  - super-dungeon
---

# World Event Raise Windows, Boss Wards, and Raid Hardening

World event hardening unifies made-level rule declarations and HUD tooltips, aligns raise windows and regeneration pause logic, and tightens boss trait wards and raiding party behavior across `src/net/sdLaw.js`, `src/characters/bossTraits.js`, `src/worldEvents/raidingParties.js`, `src/worldEvents/courtRulesDoor.js`, and `src/ui/statusTips.js`.

- **Three Hardening Lanes (`src/net/sdLaw.js`, `src/characters/bossTraits.js`, `src/worldEvents/raidingParties.js`):** Source comments tag the fixes under `AUDIT WORLD-EVENTS Lx-y` across three lanes: event rules (made-level raise windows, downed bodies, and natural regeneration holds), boss traits (scaled wards, wrath timers, hit numbers, and save persistence), and raids (refugee friendly-fire immunity, raider goal priority, floating-origin coordinate shifts, and street-grid exodus pathing).
- **Made-Level Rule Declarations and Door Enforcement (`src/characters/madeLevel.js`, `src/worldEvents/courtRulesDoor.js`):** Each made-level arena or event site declares its local rules for resurrection, natural regeneration, death handling, and the `/unstuck` chat command in `src/characters/madeLevel.js`, and `src/worldEvents/courtRulesDoor.js` enforces those restrictions at the admission boundary.
- **Event Rules HUD Tile (`src/ui/statusTips.js`):** Every active rule for a made-level place is listed on the event rules tile in `src/ui/statusTips.js`, including `'No /unstuck.'`. This tile renders only on the enhanced HUD; the classic status row omits the tile.
