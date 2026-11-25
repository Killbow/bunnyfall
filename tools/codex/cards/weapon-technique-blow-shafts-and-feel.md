---
slug: weapon-technique-blow-shafts-and-feel
title: "Technique Blow, Shafts, Marks, and Feel"
domain: combat
kind: subcard
parent: weapon-techniques-overview
files:
  - src/combat/technique/techniqueBlow.js
  - src/combat/arrowFlight.js
  - src/combat/technique/techniqueFx.js
  - src/render/foeTelegraph.js
  - src/render/spellImpactFx.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedPlusStyle.js
  - src/ui/techniqueCard.js
  - src/ui/techniqueGlyph.js
  - src/ui/quickslotTags.js
  - src/combat/playerWeapon.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Techniques.md"
related:
  - weapon-techniques-overview
  - arrow-flight-and-conjured-arrows
  - enemy-telegraphs-poise-and-punish
  - balance-arc-pvp-harm-ceiling-and-archery
invariants:
  - "`scaleBlowDamage` returns `max(1, round(damage * mult))` for `damage > 0` and passes misses and blocks unchanged."
  - "`playerBody` (rival or duel bodies) is never a technique target."
  - "Piercing shafts fly on via `techniquePierces` and share one referee sequence via `shaftSequence`, keeping hit rate under `ARENA_HIT_HZ_MAX` (`4`)."
  - "Volley shafts start after `delay` `0.55` s and spread over `spread` `1.35` s (`0.27` s apart for `6` arrows)."
  - "Camera roll in `TECH_FX` stays within `3` degrees; `kickFx` kicks the hands channel only for positive `y` (a downward dip)."
traps:
  - "Camera roll is kicked negated because host lenses mirror the X axis."
  - "HUD technique chips are hidden (`techniqueHudChips` returns empty) while `sigilDueling()` is active."
dfu: []
tags:
  - techniques
  - fx
  - hud
  - arrows
---

`src/combat/technique/techniqueBlow.js` resolves melee, area, and ranged technique hits against enemies while skipping any `playerBody` target. When a strike lands with positive damage, `scaleBlowDamage` returns `Math.max(1, Math.round(damage * mult))`; zero-damage misses and blocks pass through unchanged.

## Volley and Piercing Shafts

Ranged techniques integrate with `src/combat/arrowFlight.js`. Piercing Shot sets `techniquePierces` on the projectile so the shaft continues through multiple enemies while sharing a single referee sequence ID from `shaftSequence`, keeping multi-target hits compliant with `ARENA_HIT_HZ_MAX` (`4` hits per second). Volley waits for a `0.55` s `delay` and then releases `6` arrows across a `1.35` s `spread` (`0.27` s between shafts).

## Telegraphs, Springs, and HUD Chips

Aiming and impact visuals share the blue technique palette (`TECH_COLOR = [0.35, 0.78, 1]` and `TECH_CHIP_COLOUR = '#59c7ff'`). Ground aim decals render through `techniqueUniform` and `techniqueQuadHalf` in `src/render/foeTelegraph.js`, while impact bursts use `TECH_FX_LOOK` in `src/render/spellImpactFx.js`.

`src/combat/technique/techniqueFx.js` drives `TechView` and `TechHands` springs (`techniqueView()` and `techniqueHands()`), keeping camera roll within `3` degrees (negated for X-mirrored host lenses) and kicking `TechHands` only on positive `y` (downward dip) alongside `PlayerWeapon.techniqueStrike` (`src/combat/playerWeapon.js`). On the HUD, `setHudTechniqueChips` (`src/ui/enhancedHud.js`, `src/ui/enhancedPlusStyle.js`, `src/ui/techniqueCard.js`, `src/ui/techniqueGlyph.js`, and `src/ui/quickslotTags.js`) renders key labels via `actionKeyWord` and hides chips during duels (`sigilDueling()`).
