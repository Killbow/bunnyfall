---
slug: dark-regen-broker-rid-and-theme-buffer-overview
title: "Darkness Regeneration, Broker Request IDs, Theme Latency, and Single-Hand Fallback"
domain: systems
kind: overview
parent: null
files:
  - src/magic/hostEnchant.js
  - src/characters/passiveSpecials.js
  - src/worldEvents/sigilBroker.js
  - server-account/src/brokerSales.js
  - src/audio/introTheme.js
  - src/combat/twoHands/handsLaw.js
routes:
  - /v1/broker/settle
tables:
  - broker_sales
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-24.md"
related:
  - darkness-regen-enchant-ctx-seam
  - sigil-broker-request-ids-and-owed-sales
  - sigil-broker-daily-stock-and-dismantle
  - two-hands-overview
  - ui-arc-front-door-intro-and-brand
invariants:
  - "DARK-REGEN: createEnchantCtx answers inDarkness via playerInDarkness, so the Regens Health In Darkness enchantment heals."
  - "BROKER-RID: every Broker press carries a request id, and a lost answer is settled by that id alone through /v1/broker/settle."
  - "THEME-BUFFER: the live intro theme AudioContext uses latencyHint 'interactive' (INTRO-REVERT II)."
traps:
  - "TWO-HANDS: one weapon plus an empty hand resolves to HANDS_MODE.Single, not a weapon-and-fist pair. This is the intended fallback while the owner decides."
dfu:
  - Assets/Scripts/Game/PlayerEnterExit.cs
tags:
  - dark-regen
  - broker-rid
  - theme-buffer
  - two-hands
---

# Darkness Regeneration, Broker Request IDs, Theme Latency, and Single-Hand Fallback

This overview covers the enchantment darkness regeneration seam, idempotent Sigil Broker request IDs and fences, intro theme audio latency configuration, and single-hand fallback when one hand is empty.

## Darkness Regeneration and Broker Settlement Fences

- **Enchantment darkness seam (`src/magic/hostEnchant.js`, `src/characters/passiveSpecials.js`):** `createEnchantCtx` wires `inDarkness` to `playerInDarkness`, allowing item enchantments with the `Regens Health In Darkness` condition (`darkness-regen-enchant-ctx-seam`) to heal whenever the player is out of sunlight.
- **Idempotent Broker request IDs (`src/worldEvents/sigilBroker.js`, `server-account/src/brokerSales.js`):** Every Broker purchase press generates a request ID (`rid`) recorded in `broker_sales` and settled via `/v1/broker/settle` (`sigil-broker-request-ids-and-owed-sales`). An earlier `EMBERS-OWED` proposal to settle owed sales by week and piece was rejected after audit in favor of `BROKER-RID` request IDs and fence rows.

## Intro Theme Audio Clock and Single-Hand Fallback

- **Intro theme AudioContext (`src/audio/introTheme.js`):** The intro theme constructs its `AudioContext` with `latencyHint: 'interactive'`. `audibleContextTime` maps the device audio clock through `getOutputTimestamp` and never falls back to a wall clock.
- **Weapon plus empty hand (`src/combat/twoHands/handsLaw.js`):** Equipping one weapon with the other hand empty resolves via `handsModeOf` to `HANDS_MODE.Single` rather than a weapon-and-fist dual-wield pair, remaining on `HANDS_MODE.Single` while the weapon-plus-fist pairing design is deferred to the owner.
