---
slug: ship-livery-flags-and-plaques
title: "Ship Livery, Cabin Look, Deck Fittings, Flags, and Name Plaques"
domain: rendering
kind: subcard
parent: naval-refit-overview
files:
  - src/systems/naval/shipLivery.js
  - src/systems/naval/shipLiveryPaint.js
  - src/systems/naval/cabinLook.js
  - src/systems/naval/deckFittings.js
  - src/systems/naval/deckFittingsHost.js
  - src/systems/naval/deckPlanDoor.js
  - src/systems/naval/shipPlaque.js
  - src/systems/naval/comeSailAwayPool.js
  - src/systems/naval/shipFlag.js
  - src/systems/naval/shipFlagHost.js
  - src/render/shipFlagPass.js
  - src/systems/naval/seaColours.js
  - src/systems/naval/fleet.js
replacesBible:
  - "03-World/Naval-Refit.md"
related:
  - naval-refit-overview
  - captain-tree-and-ore-refits
  - webgl2-renderer-and-textures
invariants:
  - "Hull liveries use synthetic texture archive `LIVERY_ARCHIVE` (`38191`), whereas bow name plaques use `PLAQUE_ARCHIVE` (`38193`)."
  - "Each deck holds at most `DECK_FITTINGS_MAX` (`24`) fittings placed at least `FITTING_GAP` (`0.6` meters) apart."
  - "`src/render/shipFlagPass.js` draws at most `FLAGS_MAX` (`24`) simulated cloth flags per frame sorted nearest first; vessels beyond that cap display particle pennants."
  - "Sea-traffic flags (`seaFlagOf`, `seaFlagsOf`) render only within `SEA_FLAG_M` (`450` meters)."
  - "Plaque meshes purge after `PLAQUE_IDLE_DRAWS` (`1800`) idle draws, and `src/systems/naval/shipPlaque.js` falls back to `5x7` `BLOCK_LETTERS` if `FONT0003.FNT` fails to load."
  - "Ship names cap at `SHIP_NAME_MAX` (`24`) characters, and plaque glyph scale clamps between `PLAQUE_LETTER_MIN` (`0.22`) and `PLAQUE_LETTER_MAX` (`0.6`) so long names shrink instead of distorting the mesh."
traps:
  - "Do not share archive IDs between hull liveries (`38191`) and bow name plaques (`38193`); they are separate synthetic archives with distinct eviction lifecycles."
  - "The wire sends each fitting as its index in `DECK_FITTINGS` (`fittingsCode`, `fittingsOfCode`), so new fittings go at the end of the list."
tags:
  - naval
  - livery
  - flags
  - heraldry
  - plaque
  - customization
---

Ship customization covers dyed hull liveries, cabin wood finishes, interactive deck furniture placement, cloth and particle heraldry flags, and dynamic bow name plaques.

## Hull Liveries, Cabin Finishes, and Deck Fittings

`liveryOf`, `liveryPartsOf`, and `paintFamilies` (`src/systems/naval/shipLivery.js`) combine with `stainPicture` and `tintPicture` (`src/systems/naval/shipLiveryPaint.js`) to composite hull paint textures inside synthetic archive `LIVERY_ARCHIVE` (`38191`). Below deck, `restyle` (`src/systems/naval/cabinLook.js`) swaps cabin wood finishes. On deck, `fittingsOf`, `standFittings`, and `fitBoats` (`src/systems/naval/deckFittings.js`, `src/systems/naval/deckFittingsHost.js`) place up to `DECK_FITTINGS_MAX` (`24`) props enforcing a `FITTING_GAP` (`0.6` meters) minimum clearance, edited through `createDeckPlanOverlay` (`src/systems/naval/deckPlanDoor.js`).

## Flags, Sea Traffic Heraldry, and Name Plaques

`shipFlagOf`, `flagOfCode`, and `flownFlag` (`src/systems/naval/shipFlag.js`) encode flag geometry (`FLAG_SHAPES`), palettes, and optional `guild` emblems, persisted via `setShipColours` (`src/systems/naval/fleet.js`). AI vessels derive faction heraldry (`CROWN_COLOURS`, `MERCHANT_HOUSES`, `PIRATE_CREWS`, and `LEGEND_COLOURS` in `src/systems/naval/seaColours.js`) from `seaWho` seeds and render via `seaFlagOf` and `seaFlagsOf` within `SEA_FLAG_M` (`450` meters). `src/render/shipFlagPass.js` caps cloth simulation at `FLAGS_MAX` (`24`) nearest flags per frame, falling back to pennants beyond that budget.

Bow plaques (`setShipPlaque`, `paintPlaque`, and `hullSurface` in `src/systems/naval/shipPlaque.js`) use synthetic archive `PLAQUE_ARCHIVE` (`38193`), cap names at `SHIP_NAME_MAX` (`24`) characters, clamp glyph size to `[PLAQUE_LETTER_MIN, PLAQUE_LETTER_MAX]` (`0.22..0.6`), fall back to `5x7` `BLOCK_LETTERS` when `FONT0003.FNT` is missing, and evict idle meshes after `PLAQUE_IDLE_DRAWS` (`1800`) frames.
