---
slug: wallet-weight-glyphs-and-raid-lairs-overview
title: "Wallet Weight, Account Glyphs, Lair Reach, and Boarding Raid End"
domain: maintenance
kind: overview
parent: null
files:
  - src/items/walletItem.js
  - src/ui/enhancedInventory.js
  - src/net/identityToken.js
  - src/net/wire.js
  - server-account/src/titles.js
  - src/revenants/revenant.js
  - src/systems/naval/navalHost.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19.md"
related:
  - revenant-lair-reach-and-single-body
  - naval-raid-won-and-late-waves
  - revenant-lairs-thefts-and-companions
  - account-titles-glyphs-and-play-clock
invariants:
  - "Bugs reported from play are fixed where they start, not with workarounds."
  - "The wallet item has baseWeight 0, but the items it holds keep their weight, and enhanced pack rows and cards show it (walletKg)."
  - "Name glyphs are a closed list (GLYPHS in src/net/identityToken.js). Only the account service grants them, through glyphsOf in server-account/src/titles.js, based on role, age or Patreon tier."
  - "Token claims are checked so that every glyph in `g` is in GLYPHS and the list is no longer than GLYPHS_MAX."
traps:
  - "Do not make a glyph selectable on the client; a client-side grant fails claimsValid."
  - "sanitizeName lives in src/net/wire.js, not identityToken.js."
dfu: []
tags:
  - wallet
  - glyphs
  - revenant
  - naval
  - raid
---

# Wallet Weight, Account Glyphs, Lair Reach, and Boarding Raid End

This overview covers wallet carry weight display, server-issued identity glyphs, revenant lair placement and single-body rules, and naval boarding raid completion.

## Wallet Weight and Account Identity Glyphs

- **Wallet carry weight (`src/items/walletItem.js`, `src/ui/enhancedInventory.js`):** The wallet container itself has `baseWeight` `0`, while the items stored inside keep their full weight. Enhanced inventory pack rows and item cards display that carried total through `walletKg`.
- **Closed glyph catalog (`src/net/identityToken.js`, `server-account/src/titles.js`, `src/net/wire.js`):** Name glyphs come from the closed `GLYPHS` list (`GLYPHS` has no turtle entry; that request was deferred) and are granted only by the account service via `glyphsOf` from account role, age, or Patreon tier. `claimsValid` checks that every entry in claim `g` belongs to `GLYPHS` and that the array length does not exceed `GLYPHS_MAX`. `sanitizeName` in `src/net/wire.js` retains non-ASCII letters while stripping control, surrogate, and invisible code points, falling back to `FALLBACK_NAME`.

## Revenant Lair Placement and Naval Raid Completion

- **Revenant lair reach and single active body (`revenant-lair-reach-and-single-body`):** Dungeon lair spawns flood the navmesh from `enhancedNav.anchor` via `reachableFrom` and `reachableEndOf` (falling back after `LAIR_WALK_WAIT_MS` to `dungeonEndOf`). Standing a revenant marks any older body in `_left` so `revenantStale` culls duplicate bodies and their bands.
- **Boarding raid end and late waves (`naval-raid-won-and-late-waves`):** Winning a boarding action calls `wonRaid` and `raidAshore.won`, withdrawing living enemies and `_ally_` crew before calling `quest.endQuest()` so the two grace ticks run and late waves withdraw cleanly.
