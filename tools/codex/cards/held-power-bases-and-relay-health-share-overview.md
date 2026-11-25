---
slug: held-power-bases-and-relay-health-share-overview
title: "Wearable Magic Item Bases, Relay Health Share, and Warded Strike Guards"
domain: items
kind: overview
parent: null
files:
  - src/items/loot.js
  - src/magic/enchantments.js
  - src/characters/equip.js
  - src/saves/save.js
  - src/combat/healthShare.js
  - src/world/gateBoss.js
  - src/items/artifactEffects.js
  - src/systems/eliteGates/egFight.js
  - src/net/professionLaw.js
  - src/ui/craftXpWords.js
routes: []
tables:
  - prof_tracks
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18f.md"
related:
  - spellbook-scroll-keeping-and-dungeon-hud-digits
  - house-nature-flats-boulder-uvs-and-wod-sea-region
  - rehomed-item-prints-and-craft-limit
  - warded-blows-and-relayed-lord-radii
  - loot-arc-legendary-powers-and-proc-caps
invariants:
  - "`powersNeedWearing(rows)` (`src/magic/enchantments.js`) requires an equippable base (`wearableItem` in `src/characters/equip.js`) whenever any power is non-Used; `createRegularMagicItem` redraws `magicItemBase` up to `MAGIC_BASE_DRAWS = 64` times before `createRandomArmor`, leaving Used-only items on any base."
  - "Mint-only base selection leaves saved items untouched in `src/saves/save.js` so `ledgerPrintOf` hashes stay stable."
  - "`healthShare(e)` (`src/combat/healthShare.js`) returns `relayShare()` clamped to `0..1` (or `null`) when `relayHealth` is set, and `health / maxHealth` (or `1`) otherwise; Vampiric leech (`param === 1`), `CastWhenStrikes`, and artifact drains refuse `0` damage and warded targets (`EG_TURNS_FL`)."
  - "`craftLimitOf` (`src/net/professionLaw.js`) caps every craft track at `PROF_XP_MAX` (`creditedXp`, displayed by `paidXp` and `capLine` in `src/ui/craftXpWords.js`)."
traps:
  - "Never read `health / maxHealth` directly on a relay stand-in (`STAND_IN_WHOLE` in `src/world/gateBoss.js` never drains), and never reintroduce the retired two-crafts-above-Journeyman limit (`CRAFTS_ABOVE_JOURNEYMAN`)."
  - "Never rewrite magic item bases on save load or existing realm ledger prints break."
dfu: []
tags:
  - loot
  - enchantments
  - relay
  - health-share
  - professions
---

# Wearable Magic Item Bases, Relay Health Share, and Warded Strike Guards

Magic item base selection, relayed boss health share, warded strike refusal, and profession craft ceiling logic span `src/items/loot.js`, `src/magic/enchantments.js`, `src/combat/healthShare.js`, and `src/net/professionLaw.js`.

- **Wearable magic item bases:** In `src/magic/enchantments.js`, `powersNeedWearing(rows)` requires an equippable base (`wearableItem` in `src/characters/equip.js`) whenever any rolled power is non-Used, such as Cast When Held, Absorbs Spells, or Enhances Skill. During minting in `src/items/loot.js`, `createRegularMagicItem` redraws `magicItemBase` up to `MAGIC_BASE_DRAWS = 64` times before falling back to `createRandomArmor`, while Used-only rows accept any base. Saved items remain untouched in `src/saves/save.js` so `ledgerPrintOf` hashes stay valid.
- **Relay health share and warded strike guards:** Because relay stand-in health (`STAND_IN_WHOLE` in `src/world/gateBoss.js`) never drains locally, callers read `healthShare(e)` in `src/combat/healthShare.js`, which returns `relayShare()` clamped to `0..1` (or `null`) when `relayHealth` is active, and `health / maxHealth` (or `1`) otherwise. Vampiric leech (`param === 1`), `CastWhenStrikes`, and `src/items/artifactEffects.js` drains refuse `0` damage and warded targets (`EG_TURNS_FL` in `src/systems/eliteGates/egFight.js`).
- **Craft track cap:** `craftLimitOf` in `src/net/professionLaw.js` caps every track in `prof_tracks` at `PROF_XP_MAX` via `creditedXp`, formatted by `paidXp` and `capLine` in `src/ui/craftXpWords.js`.
