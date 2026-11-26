---
slug: balance-arc-lycanthropy-and-vampirism
title: "Lycanthrope Beast Form, Claw Metal, and Vampire Sun"
domain: combat
kind: subcard
parent: balance-arc-overview
files:
  - src/afflictions/lycanthropy.js
  - src/combat/clawMetal.js
  - src/items/armorMaterials.js
  - src/mods/rriItems.js
  - src/afflictions/vampirism.js
  - src/saves/save.js
  - src/magic/hostMagic.js
  - src/combat/duelCombat.js
replacesBible:
  - "05-Combat/Balance-Arc.md"
related:
  - balance-arc-overview
  - characters-paperdoll-and-bodies
  - vampire-vitae-blood-and-feeding
invariants:
  - "`lycanthropeAdvantages` (`src/afflictions/lycanthropy.js`) clears `statMods` and `skillMods` every round and on `morphSelf`, applying `LYCANTHROPE_STAT_MOD` (`+40`) and `LYCANTHROPE_SKILL_MOD` (`+30`) only while `isTransformed` is true."
  - "`morphHeals` grants transformation healing only when `nowMinutes - lastMorphHeal > MINUTES_PER_DAY`; equipping the Hircine Ring removes the transformation requirement without bypassing the daily heal cooldown."
  - "`clawMetalDamage` (`src/combat/clawMetal.js`) returns `Math.max(0, weaponMaterialModifier(plateMetal(metal)))` for an unbroken plate item equipped in the Gloves slot during beast form (otherwise `0`), adding flat damage without altering to-hit rolls, material gates, or silver doubling."
  - "Beast-form claw attacks count as bare hands and skip `weaponBlowMods` whenever `isInBeastForm` is true."
  - "`vampireStatMod` (`src/afflictions/vampirism.js`) returns `-VAMPIRE_STAT_MOD` (`-20`) in sunlight when sun-averse, `0` in sunlight while wearing a raised hood, and `+20` at night or indoors."
traps:
  - "Brigandine Gloves belong to the leather armor class via `rriNativeMaterialValue` (`src/mods/rriItems.js`), so they contribute `0` `clawMetalDamage` regardless of their metal tier name."
  - "Refereed duel proxies (`src/combat/duelCombat.js`) lack a full equipment table and pass `clawMetal` as a pre-resolved integer instead."
  - "`src/saves/save.js` clamps `lastMorphHeal` alongside other curse timestamps; a missing field defaults to `-Infinity` so the first transformation after loading heals normally."
dfu:
  - Assets/Scripts/Game/MagicAndEffects/Effects/Special/LycanthropyEffect.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Illusion/MorphSelf.cs
tags:
  - balance
  - lycanthropy
  - werewolf
  - wereboar
  - vampirism
  - gauntlets
---

Lycanthropy restricts supernatural attribute and skill bonuses to active beast form, limits transformation healing to once per in-game day, derives bonus claw damage from plate gauntlets, and pairs with conditional vampire sunlight modifiers.

## Beast-Form Modifiers and Daily Morph Heal

Unlike classic Daggerfall (`LycanthropyEffect.cs`), which granted `+40` attributes and `+30` skills in human form as well, `lycanthropeAdvantages` (`src/afflictions/lycanthropy.js`) zeroes `statMods` and `skillMods` each tick and on `morphSelf` (`src/magic/hostMagic.js`), applying `LYCANTHROPE_STAT_MOD` and `LYCANTHROPE_SKILL_MOD` only when `isTransformed` is true.

Transforming restores health only when `morphHeals` confirms `nowMinutes - lastMorphHeal > MINUTES_PER_DAY`. The Hircine Ring permits at-will transformation without resetting `lastMorphHeal`. `src/saves/save.js` bounds `lastMorphHeal` against clock rollback and treats an unset timestamp as `-Infinity` so a newly infected character heals on first morph.

## Gauntlet Claw Metal and Vampire Sunlight

While `isInBeastForm` is true, attacks bypass `weaponBlowMods` and add `clawMetalDamage` (`src/combat/clawMetal.js`) from an unbroken plate piece in the `Gloves` slot via `Math.max(0, weaponMaterialModifier(plateMetal(metal)))` (`src/items/armorMaterials.js`), flooring Iron (`-1`) at `0` and capping at `CLAW_METAL_MAX` (`+6` for Daedric). Because `rriNativeMaterialValue` (`src/mods/rriItems.js`) classifies Brigandine Gloves as leather, they grant no bonus. Claw metal adds raw damage only, never satisfying target `minMetalToHit`, to-hit bonuses, or silver doubling. In refereed duels (`src/combat/duelCombat.js`), combat snapshots carry `clawMetal` directly as an integer.

For vampires, `vampireStatMod` (`src/afflictions/vampirism.js`) applies `+20` indoors or at night, `0` in sunlight under a raised hood, and `-VAMPIRE_STAT_MOD` (`-20`) in exposed sunlight.
