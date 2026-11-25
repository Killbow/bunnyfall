---
slug: world-events-boss-trait-and-raid-hardening
title: "Boss Trait Wards and Raid Party Fixes"
domain: world-events
kind: subcard
parent: world-events-raise-and-trait-hardening-overview
files:
  - src/characters/bossTraits.js
  - src/characters/foeTitle.js
  - src/characters/foeTraitsHost.js
  - src/ui/hitNumbers.js
  - src/combat/friendlyFire.js
  - src/characters/enemyTargets.js
  - src/worldEvents/raidingParties.js
  - src/worldEvents/raidKinds.js
  - src/worldEvents/raidSitesHost.js
  - src/world/raidShared.js
  - src/scenes/frame/streamFrame.js
  - src/worldEvents/eventBoard.js
  - src/scenes/world.js
  - src/systems/ketch/ketchFight.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-World-Events.md"
related:
  - world-events-raise-and-trait-hardening-overview
  - boss-traits-overview
  - boss-traits-carriers-wire-and-hud
  - boss-traits-striker-and-owner-halves
  - raiding-parties-overview
  - raiding-parties-kinds-and-held-towns
  - event-board-hud-overview
invariants:
  - "Elite ward = WARD_SHARE (0.3) of live max health after host scaling."
  - "SetHealth(0) bypasses boss wards and thresholds."
  - "Relay bosses draw one element trait and one blow trait; striker traits answer player blows only."
  - "Damage numbers show landed post-resistance damage via retellHit in src/ui/hitNumbers.js."
  - "Raiders prefer raid goals (huntsRaidGoal, RAID_GOAL_PRIORITY = 40) over infighting."
  - "Refugees are spared by player swings and spells (sparedBySwing, sparedByPlayer)."
traps:
  - "Cached raid positions must shift with floating origin (raidOffsetAll)."
  - "Exodus paths run on city street grids (gridStreets in raidSitesHost.js)."
  - "Raid aim is in ticks: RAID_AIM_TICKS = 600; RAID_KIND_ORDER = classic, waves, defend, escort."
dfu: []
tags:
  - boss-traits
  - wards
  - raids
  - refugees
  - enemies
---

# Boss Trait Wards and Raid Party Fixes

Boss trait hardening scales elite wards to post-host maximum health, persists rolled traits across saves, and reports post-resistance hit numbers, while raid fixes protect refugees and keep raiders focused on town objectives across `src/characters/bossTraits.js`, `src/characters/foeTraitsHost.js`, and `src/worldEvents/raidingParties.js`.

- **Wards, Draws, and Persistence (`src/characters/bossTraits.js`, `src/characters/foeTitle.js`, `src/characters/foeTraitsHost.js`, `src/ui/hitNumbers.js`, `src/scenes/world.js`, `src/systems/ketch/ketchFight.js`):** Elite wards equal `WARD_SHARE` (`0.3`) of live maximum health after host scaling, while `SetHealth(0)` bypasses boss wards and curbing thresholds completely. Relay bosses draw one element trait and one blow trait, and striker traits respond to player blows only. Boss titles localize through `bossTraits.title` (`'{trait} {name}'`), traits persist inside enemy save data to prevent re-rolling on load, and `retellHit` in `src/ui/hitNumbers.js` displays landed post-resistance damage.
- **Raider Targeting, Refugees, and Floating Origin (`src/worldEvents/raidingParties.js`, `src/worldEvents/raidKinds.js`, `src/worldEvents/raidSitesHost.js`, `src/world/raidShared.js`, `src/combat/friendlyFire.js`, `src/characters/enemyTargets.js`, `src/scenes/frame/streamFrame.js`, `src/worldEvents/eventBoard.js`):** Raiders prioritize raid objectives (`huntsRaidGoal`, `RAID_GOAL_PRIORITY = 40`) over infighting, aim duration runs in ticks (`RAID_AIM_TICKS = 600`), and `RAID_KIND_ORDER` lists `classic`, `waves`, `defend`, and `escort` (formatted on the event board via `events.raid.titleKind` as `'{kind}: {town}'`). Player swings and spells spare refugees (`sparedBySwing`, `sparedByPlayer`), exodus routes follow city street grids (`gridStreets` in `src/worldEvents/raidSitesHost.js`), and `raidOffsetAll` shifts cached raid coordinates on floating-origin rebases.
