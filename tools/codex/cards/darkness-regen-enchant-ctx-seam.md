---
slug: darkness-regen-enchant-ctx-seam
title: "Darkness Regeneration: the inDarkness Enchant Seam"
domain: magic
kind: subcard
parent: dark-regen-broker-rid-and-theme-buffer-overview
files:
  - src/magic/hostEnchant.js
  - src/magic/enchantments.js
  - src/characters/passiveSpecials.js
  - src/scenes/dungeonContext.js
  - src/scenes/exterior.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-24.md"
related:
  - dark-regen-broker-rid-and-theme-buffer-overview
  - balance-arc-lycanthropy-and-vampirism
invariants:
  - "createEnchantCtx exposes inDarkness: () => playerInDarkness() next to inSunlight and inHolyPlace."
  - "playerInDarkness(nowMinutes) is true when either `_host` or `nowMinutes` is non-null and `playerInSunlight(nowMinutes)` is false."
  - "playerInSunlight is isDayFromMinutes(now) and not isInside and not inPrison, read from the setPassiveSpecialsHost host."
  - "The RegensHealth enchantment heals 1 every REGEN_PER_ROUNDS rounds when param 2 is set and ctx.inDarkness() is true."
  - "The career's Regenerate Health In Darkness (passiveSpecialsMagicRound) uses its own law, at night or inside a dungeon, and heals separately from the enchantment."
traps:
  - "With no host registered and no clock passed, playerInDarkness is false. An unregistered clock reads minute 0 (midnight) and would otherwise answer dark."
  - "Enchantment darkness is not career darkness: a lit shop at noon is dark for the enchantment (inside) but not for the career (day, not a dungeon)."
  - "Every host ctx must answered inDarkness, so the enchantment's In Darkness arm never healed in any host."
dfu:
  - Assets/Scripts/Game/PlayerEnterExit.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/RegensHealth.cs
tags:
  - enchantments
  - regeneration
  - darkness
  - passive-specials
  - dark-regen
---

# Darkness Regeneration: the inDarkness Enchant Seam

Item enchantments with the `In Darkness` regeneration condition (`RegensHealth` param `2`) read `ctx.inDarkness()` from the shared host enchantment context (`createEnchantCtx` in `src/magic/hostEnchant.js`).

## Shared Host Context and Sunlight Check

- **Single context constructor (`src/magic/hostEnchant.js`, `src/scenes/dungeonContext.js`, `src/scenes/exterior.js`):** Both `dungeonContext.js` and `exterior.js` call `setDefaultEnchantCtx(createEnchantCtx(...))`, giving every host the same enchantment context shape with `inDarkness: () => playerInDarkness()` alongside `inSunlight` and `inHolyPlace`.
- **Darkness guard (`src/characters/passiveSpecials.js`):** `playerInSunlight` evaluates `isDayFromMinutes(now)` while neither `isInside` nor `inPrison` is set on the host registered via `setPassiveSpecialsHost`. `playerInDarkness(nowMinutes)` returns `true` only when `_host` or `nowMinutes` is non-null and `playerInSunlight(nowMinutes)` is `false`, preventing an unregistered host (whose clock defaults to minute `0`, midnight) from falsely reporting darkness.

## Enchantment Healing vs Career Darkness

- **Separate laws and stacking (`src/magic/enchantments.js`, `src/characters/passiveSpecials.js`):** The `RegensHealth` item enchantment heals `1` HP every `REGEN_PER_ROUNDS` rounds when param `2` is selected and `ctx.inDarkness()` holds. Career `Regenerate Health In Darkness` (`passiveSpecialsMagicRound`) checks night or dungeon interior instead, so a building interior at noon counts as dark for the item enchantment (`isInside`) but not for the career advantage. Both sources stack independently through their own `regenShare` (`'career'` or `'item'`).
