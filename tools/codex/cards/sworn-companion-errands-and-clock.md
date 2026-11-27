---
slug: sworn-companion-errands-and-clock
title: "Sworn Companion Errands and Trusted Clock"
domain: ai
kind: subcard
parent: revenants-lifecycle-overview
files:
  - src/revenants/revenantErrands.js
  - src/revenants/revenantCompanions.js
  - src/revenants/revenantStars.js
  - src/net/wire.js
  - src/ui/companionRoster.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Revenants.md"
related:
  - revenants-lifecycle-overview
  - sworn-companion-gear-arts-and-stars
  - revenant-lairs-thefts-and-companions
invariants:
  - "At most `ERRAND.MAX` (`2`) sworn companions can be abroad at once, and `errandRefusal` also blocks companions that are already abroad, stationed, resting, or active at the player's side inside the open PvP zone."
  - "Online, `chargeErrands` advances errands against `errandWorldNow()` (trusted world minutes, the shared-clock heard mark, and a monotonic clock) rather than character-raised or rested minutes."
  - "Each tick advances an offline lived-step errand by at most `ERRAND.STEP_MAX` (`30`) lived minutes."
  - "`newErrand` copies the companion's star sky (`rvnErrandSky`: odds, haul, road, and bold) onto the errand as it sets out, so changing stars while it is away changes neither its length nor its haul."
  - "`returnFromErrand` pays loyalty and XP only for a seed missing from `companion.paid` (the last `PAID_KEEP` = `16` seeds), so reloading a save made while the companion was away returns the haul again but never pays twice."
traps:
  - "Rest, fast travel, and character clock raises never speed up online errands; offline errands use the lived-step path to push `until` forward instead."
  - "A companion knocked out at the player's side inside the open PvP zone hands its pack and equipped kit back to the player before leaving (`leftWithYou`)."
  - "`restUntil` writes its clamp back to the save and the device mirror (`revenantCompanionUpdate`); clamping only the returned value moves the rest deadline forward every frame, and the rest never ends."
dfu: []
tags:
  - companions
  - errands
  - provinces
  - clock
---

`src/revenants/revenantErrands.js` and `src/ui/companionRoster.js` let players dispatch up to `ERRAND.MAX` (`2`) sworn companions on provincial ventures resolved against real played or shared world time.

## Ventures, Provinces, and Trusted Clock

`errandRefusal` blocks any companion that is already abroad, stationed, resting, or active at the player's side in the open PvP zone (`src/revenants/revenantCompanions.js`). A companion knocked out at the player's side in the open PvP zone transfers its pack and kit to the player before dismissal (`leftWithYou`).

Players choose from three `VENTURES` (`plunder` for loot, `forage` for crafting materials, or `contract` for Sell-sword gold) and nine `ERRAND_PLACES` provinces (`HighRock`, `Hammerfell`, `Imperial`, `Skyrim`, `Valenwood`, `Sumurset`, `Elsweyr`, `Morrowind`, and `BlackMarsh`), each with `days`, `danger`, and `goods`.

Online, `chargeErrands` ticks against `errandWorldNow()` (`src/net/wire.js` trusted world minutes, gated on the relay heard mark and a monotonic clock), so resting or raising character minutes never speeds up an errand. Offline, each wake charges at most `ERRAND.STEP_MAX` (`30`) lived minutes and pushes `until` across unlived time jumps.

## Odds, Haul, Rarity, and Experience

`ERRAND.ODDS` starts at `0.55`, adds `+0.1` per strength point over `danger` (clamped to `0.3` to `0.95`), and adds `+0.05` when Devoted. Wins grant `ERRAND.WON_LOYALTY` (`+4`), `ERRAND.GOLD` (`[10, 18]` per level per day, scaled by `ERRAND.DANGER_GOLD = 0.25` and `ERRAND.RANK_HAUL = 0.1`), and loot capped by `ERRAND.TIERS` at about `3.7%` Legendary per piece (below the `4.5%` drop ladder). Hard-won returns pay `ERRAND.HARD_SHARE` (`0.5`). `rvnXpErrand` awards `15 * days * danger * (1 - road)` XP (halved when hard-won), modified by Road stars (`rvnErrandSky` in `src/revenants/revenantStars.js`).
