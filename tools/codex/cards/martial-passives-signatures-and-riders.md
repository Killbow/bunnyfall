---
slug: martial-passives-signatures-and-riders
title: "Martial Passives, Signature Techniques, and Riders"
domain: combat
kind: subcard
parent: martial-specializations-overview
files:
  - src/characters/martialPowers.js
  - src/characters/martialPaths.js
  - src/combat/techniques.js
  - src/combat/technique/techniqueBlow.js
  - src/combat/technique/techniqueRoster.js
  - src/combat/technique/techniqueFx.js
  - src/player/playerHeal.js
  - src/items/sigil.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Martial-Specialisations.md"
related:
  - martial-specializations-overview
  - martial-swing-pace-and-frame-floor
  - weapon-techniques-overview
  - weapon-technique-roster-and-affix-line
  - weapon-technique-runner-and-refusals
  - arcane-path-passives-and-signature-riders
invariants:
  - "`martialBlowPct` caps a path's combined blow percentage at `MARTIAL_BLOW_MOST` (40)."
  - "`SIGNATURE_TECHNIQUES` gives each path one form per weapon family. All forms of a path share one cooldown slot, `sig:<path>`, in techniques.js `TECH_IDS`."
  - "A loot technique line on the weapon takes priority. `signatureInHand` answers only when the weapon has no line, or when `lootRarityOn()` is false. `LADDER_OFF_TEXT` never refuses a signature."
  - "Beast claws (`werecreatureClaws`) have no family and therefore no signature. Bare hands use the `handToHand` family."
  - "Every heal goes through `healMine` and never exceeds maximum health."
traps:
  - "Stand Firm (juggernaut): `martialHurt` fires only when a single hurt drops health from at or above `standFirm.below` (0.3) to below it, and never when `saved` is set by a death save. It heals 20% and recovers after 180 s."
  - "Flowing Steel (blademaster): +3% per stack, up to 5 stacks, with a 4 s window that each landed blow refreshes. `martialHudChips` shows the stack count on the HUD."
  - "`neverCounts` (City Watch, PlayerAlly) blocks kill and landed riders."
  - "Cheap Shot (`info.unaware`) and Blackjack's second hit (`foeUnaware`) require an unaware enemy."
  - "Rider windows open in `registerTechniqueUsedListener` when the press is paid. All other riders fire in `registerTechniqueLandedListener`."
dfu: []
tags:
  - martial-paths
  - signature-techniques
  - riders
  - passives
  - cooldown
---

# Martial Passives, Signature Techniques, and Riders

`src/characters/martialPowers.js` implements the passive modifiers, signature techniques, and active riders for all 15 martial paths, connecting to `src/combat/techniques.js` and `src/player/playerHeal.js`.

## Passives, Signatures, and Rider Execution

- **Blow cap and passive triggers:** `martialBlowPct` caps a path's combined blow bonus at `MARTIAL_BLOW_MOST` (`40`). Flowing Steel (`blademaster`) grants `+3%` per stack up to `5` stacks over a `4` s window refreshed on landed blows and rendered via `martialHudChips`. Stand Firm (`juggernaut`) fires in `martialHurt` only when a single hit drops health from at or above `standFirm.below` (`0.3`) to below it without a death-save `saved` flag, healing `20%` via `healMine` with a `180` s recovery. Cheap Shot (`info.unaware`) requires an unaware enemy.
- **Signature techniques (`SIGNATURE_TECHNIQUES`):** Each path defines one form per weapon family (Thousand Cuts, Rallying Cleave, `Judgement`, Mark of the Hunt, Cyclone, Gutting Lunge, Blackjack, Vanishing Strike, Phantom Strike, Earthsplitter, Felling Strike, Savage Whirl, Hallowed Strike, Knockout, and Windstrike), sharing cooldown slot `sig:<path>` in `TECH_IDS` and reusing `TECH_FX` visuals. `signatureInHand` yields to loot weapon technique lines when `lootRarityOn()` is true, never fails on `LADDER_OFF_TEXT`, maps bare hands to `handToHand`, and returns nothing for `werecreatureClaws`.
- **Rider hooks:** Timed windows open in `registerTechniqueUsedListener`, while impact riders fire in `registerTechniqueLandedListener`. `neverCounts` blocks riders against `City Watch` and `PlayerAlly`, Blackjack's extra strike checks `foeUnaware`, and `Judgement` heals and Windstrike fatigue restores apply only to the first `3` distinct enemies per press (`foeOfUse`).
