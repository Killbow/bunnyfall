---
slug: legacy-heirlooms-remains-and-blessing
title: "Heirlooms, Ancestral Remains, and the Blessing"
domain: legacy
kind: subcard
parent: legacy-arc-overview
files:
  - src/systems/legacy/heirloom.js
  - src/characters/entityMods.js
  - src/systems/legacy/legacyHost.js
  - src/scenes/world.js
  - src/world/sceneCache.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Legacy-Arc.md"
related:
  - legacy-arc-overview
  - legacy-family-records-and-heir-birth
  - revenant-feuds-adaptations-and-fate
invariants:
  - "Heirlooms grow per generation up to `HEIRLOOM_GEN_MAX` (`5`): weapons `+HEIRLOOM_DAMAGE_PER_GEN` (`5`%) damage, armor `+HEIRLOOM_ARMOR_PER_GEN` (`2`)."
  - "Heirloom damage applies through `registerWeaponDamageMod` and armor through `registerEntityFold`, not by mutating item stats."
  - "Laying remains to rest grants `BLESSING_POINTS` (`3`) to the fallen's best skill, summed per skill and capped at `BLESSING_SKILL_MAX` (`9`)."
  - "Remains items use `REMAINS_TEMPLATE` (`1810`) and are identified by `isRemainsItem` (`legacyRemains` flag)."
traps:
  - "An already designated heirloom is reused at death; rolling a new one duplicates lines."
  - "Family members slain by players or beasts in town die in records without remains or death quests."
dfu: []
tags:
  - heirloom
  - remains
  - blessing
  - death-quest
---

# Heirlooms, Ancestral Remains, and the Blessing

When a family member falls in the field, the Legacy runtime preserves their designated heirloom, places ancestral remains in the scene, and grants skill blessings when those remains are laid to rest (`src/systems/legacy/heirloom.js` and `src/systems/legacy/legacyHost.js`).

- **Generational heirlooms (`heirloom.js`, `entityMods.js`):** Each generation passed adds power up to `HEIRLOOM_GEN_MAX` (`5`), granting weapons `+HEIRLOOM_DAMAGE_PER_GEN` (`5%`) damage and armor `+HEIRLOOM_ARMOR_PER_GEN` (`2`) armor rating per generation. These bonuses apply dynamically through `registerWeaponDamageMod` and `registerEntityFold` rather than mutating the stored item record. If the dying character already holds a designated family heirloom, death reuses that item instead of rolling a second heirloom for the line.
- **Ancestral remains and placement (`legacyHost.js`, `sceneCache.js`, `world.js`):** Remains items use template `REMAINS_TEMPLATE` (`1810`), carry the `legacyRemains` flag checked by `isRemainsItem`, and open through `openLootList`. Dungeon deaths persist remains across reloads via `graftPermanentScene`, and slaying enemies tie into revenant inheritance through `inheritRevenant` (`src/revenants/revenant.js`). However, family members killed by other players or by creatures inside town boundaries record the death without spawning remains or a recovery quest.
- **Ancestral blessing (`heirloom.js`, `legacyHost.js`):** Recovering and consecrating the remains of a fallen relative awards `BLESSING_POINTS` (`3`) to the highest skill of that ancestor, accumulating across ancestors up to `BLESSING_SKILL_MAX` (`9`) per skill.
