---
slug: sworn-companion-gear-arts-and-stars
title: "Sworn Companion Gear, Arts, and Star Sky"
domain: ai
kind: subcard
parent: revenants-lifecycle-overview
files:
  - src/revenants/revenantGear.js
  - src/revenants/revenantArts.js
  - src/revenants/revenantStars.js
  - src/revenants/revenantCompanions.js
  - src/ui/companionRoster.js
  - src/ui/revenantStarsWindow.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Revenants.md"
related:
  - revenants-lifecycle-overview
  - revenant-lairs-thefts-and-companions
  - sworn-companion-errands-and-clock
  - revenant-fate-execution-trophy-and-voice
invariants:
  - "`gearRefusal` blocks gear edits while a companion is on an errand and rejects quest items, summoned items, tier `> 3`, non-charm pieces on unarmed kinds, broken pieces, and items exceeding `GEAR.METAL_CAP[rank]` or `GEAR.RARITY_CAP[rank]`."
  - "`swornStarsRefusal` blocks constellation edits while a companion is on an errand."
  - "Sworn companions scale by `SWORN_HEALTH_PER_RANK` (`0.25`) and `SWORN_DAMAGE_PER_RANK` (`0.1`), distinct from hunting `REVENANT_HEALTH_PER_RANK` (`0.4`) and `REVENANT_DAMAGE_PER_RANK` (`0.15`)."
traps:
  - "Broken equipped pieces remain in their slot, but `wornGear` skips them; a shield also stops counting whenever the companion's weapon is broken or two-handed (`holdsShield`)."
  - "Star keystones include negative trade-offs (such as `b_deathless` granting `+0.25` health and `-0.1` blows), and `rvnStatScale` floors combined scaling at `0.1`."
dfu: []
tags:
  - companions
  - sworn
  - gear
  - arts
  - constellation
---

Sworn companions (`src/revenants/revenantCompanions.js` and `src/ui/companionRoster.js`) scale at `SWORN_HEALTH_PER_RANK` (`0.25`) and `SWORN_DAMAGE_PER_RANK` (`0.1`) per rank, equip player-supplied kits, cast combat arts, and unlock constellation stars.

## Ten-Slot Gear Kit and Rank Caps

`src/revenants/revenantGear.js` defines ten `GEAR_SLOTS`: `weapon`, `shield`, `head`, `rightArm`, `leftArm`, `body`, `hands`, `legs`, `feet`, and `charm`. `gearRefusal` blocks edits while on an errand and rejects quest, summoned, broken, or tier `> 3` items, non-charm gear on unarmed kinds, and items above rank caps. `GEAR.METAL_CAP` (`[_, 2, 4, 6, 8, 9]`) caps rank I at Silver, II at Dwarven, III at Adamantium, IV at Orcish, and V at Daedric. `GEAR.RARITY_CAP` (`[_, 1, 2, 2, 3, 3]`) caps rank I at Magic, II and III at Rare, and IV and V at Legendary. Broken items stay in their slot, but `wornGear` skips them and `holdsShield` disables the shield when the weapon is broken or two-handed.

## Combat Arts and Star Constellation

Revenants roll an art from `ARTS` (`mending`, `warding`, `warcry`, `siphon`, `barrage`, and `nova` in `src/revenants/revenantArts.js`) at `ARTS_CHANCE` (`0.35`) upon creation and use it from `ART_RANK` (`2`). `ART_POOL` assigns arts by archetype (`blade`, `beast`, `brute`, and `caster`), and `ART_CHANNELS` (`mending`, `warding`, and `warcry`) are telegraphed channels interrupted by hits.

In `src/revenants/revenantStars.js` (`src/ui/revenantStarsWindow.js`), companions level to `RVN_LEVEL_MAX` (`20`) via `rvnXpForLevel = Math.round(75 * (L - 1) ** 1.7)` (up to `RVN_XP_MOST`), earning `(level - 1) + (rank - 1)` star points across the Oath, Blade, Grave (`g_wake` Awakened Art), and Road paths (`RVN_STARS`, `RVN_STAR_CROSS`, and `RVN_STAR_EDGES`).
