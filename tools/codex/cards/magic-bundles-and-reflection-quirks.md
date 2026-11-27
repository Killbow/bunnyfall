---
slug: magic-bundles-and-reflection-quirks
title: Magic Bundles and Reflection Quirks
domain: magic
kind: overview
files:
  - src/magic/effects.js
  - src/magic/absorption.js
  - src/magic/identifyRefund.js
  - src/magic/enchantments.js
  - src/magic/hostMagic.js
  - src/characters/playerEntity.js
invariants:
  - "applySpell in src/magic/effects.js checks paralysis immunity before absorption, reflection, and resistance, bypassing all three gates for worn CastWhenHeld item bundles when heldItem is absent."
  - "findInc merges duplicate like-kind effects within one cast while isolating worn-item (heldItem), ally (bundleAlly), and duel (bundleDuel) effects from personal buffs."
  - "bestLiveChance and spellAbsorptionChance pick the highest active chance so weak ally buffs never shadow stronger personal wards."
  - "`applySpellToPlayer` (`src/magic/hostMagic.js`) reads the absorption context (`inside`, `day`) from the host `absorbCtx` on every landing, so exterior hosts report day or night live."
  - "A Shield whose pool is used up is ended (`damageShieldPool` sets `ended`), so it is no longer an incumbent, and a recast starts a new pool instead of merging into the ended one."
traps:
  - "reflectedCount lives on the bundle and increments inside the per-effect loop: reflecting effect 1 rebounds the whole bundle once, while effects 2..n still resolve on the target."
  - "tryAbsorption caps self-cast drink at Math.min(cost, paid) because a discounted cast frees less magicka headroom than the undiscounted spell cost."
  - "Dispel Magic hands the host only a chance (`dispelMagic`) and refunds nothing, unlike Identify, so canceling its picker still spends the cast, as in classic."
dfu:
  - Assets/Scripts/Game/MagicAndEffects/EntityEffectManager.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Thaumaturgy/Identify.cs
tags:
  - magic
  - reflection
  - absorption
  - wards
  - dfu-parity
---

# Magic Bundles and Reflection Quirks

`applySpell` in `src/magic/effects.js` runs spell bundles through paralysis immunity, absorption, reflection, and resistance (`!heldItem` excludes worn `CastWhenHeld` bundles from `src/magic/enchantments.js` across all three gates).

- **`TryReflection` multi-effect quirk:** Matching `EntityEffectManager.cs`, `reflectedCount` lives on the bundle and increments inside the per-effect loop. Reflecting effect 1 rebounds the whole bundle to the caster once (preventing volleys), while effects `2..n` see `reflectedCount > 0` and still resolve on the target.
- **Incumbent merging and refresh:** `findInc` merges duplicate like-kind effects within one cast (`!prior.has(a)`), isolating worn-item (`heldItem`), ally (`bundleAlly`), and duel (`bundleDuel`) effects from personal buffs. `renewRounds` refreshes duration (`fresh > inc.roundsRemaining`) rather than stacking rounds.
- **Ward selection (`bestLiveChance`):** Because ally, item, and path-power wards coexist beside personal casts, `bestLiveChance` and `spellAbsorptionChance` pick the highest active `chance` so weak ally buffs never shadow stronger personal wards.
- **Self-cast cost caps:** `tryAbsorption` (`src/magic/absorption.js`) caps self-cast `drink` at `Math.min(cost, paid)` (`50%` `absorbRefund`, `SPELL_ABSORPTION_CHANCE_CAP = 50`). `identifyRefund` (`src/magic/identifyRefund.js`) prices Identify via `calculateCastCost` (`IDENTIFY_REFUND_FLOOR = 5`), capped at magicka spent.
