---
slug: naval-ballistics-damage-and-striking
title: "Naval Ballistics, Damage, Striking, and Sinking"
domain: world
kind: subcard
parent: naval-combat-overview
files:
  - src/systems/naval/navalBallistics.js
  - src/systems/naval/navalGunnery.js
  - src/systems/naval/navalShots.js
  - src/systems/naval/navalDamage.js
  - src/systems/naval/navalShips.js
  - src/systems/naval/navalHost.js
routes: []
tables: []
replacesBible:
  - "03-World/Naval-Combat.md"
related:
  - naval-combat-overview
  - naval-shot-kinds-and-combat-feedback
  - naval-ramming-and-grapple-boarding
invariants:
  - "Ball flight is closed-form: `y = p0 + v0 t - 0.5 g t^2` (`navalBallistics.js`); `elevationForRange` and `fallArc` solve lay and arc."
  - "`volleyLaunches(solution, seed, ...)` in `navalGunnery.js` is seed-reproducible, so peers fly identical volleys."
  - "An AI ship strikes at `STRUCK_AT` (`0.25`) of hull, or when crewed with 0 crew (`unmanned`). For `STRUCK_GRACE_S` (`2` s, `navalHost.js`), the striking volley cannot sink her."
  - "Player boats never sink: at 0 hull they become `wrecked`; `FIELD_REFLOAT` gates at-sea refloating."
traps:
  - "`SHIP_STATES` are afloat, struck, sinking, sunk, prize, and wrecked; there is no boarded, taken, or gone state."
  - "`SHIP_TOUGHNESS` (`1.6`) scales hull HP through `tough()`; `PLAYER_CREW_TOUGHNESS` is `2 * SHIP_TOUGHNESS` (3.2)."
dfu: []
tags:
  - naval
  - ballistics
  - damage
  - sinking
  - fire
---

# Naval Ballistics, Damage, Striking, and Sinking

Naval gunnery combines closed-form projectile trajectories with deterministic volley seeds, toughness scaling, fire stacks, and state transitions from striking to sinking.

- **Ballistics and Volleys (`src/systems/naval/navalBallistics.js`, `src/systems/naval/navalGunnery.js`, `src/systems/naval/navalShots.js`):** Projectile height follows `y = p0 + v0 t - 0.5 g t^2`, with `elevationForRange` and `fallArc` solving gun lay and trajectory. `volleyLaunches(solution, seed, ...)` generates deterministic shots so online peers simulate identical volleys, while `BALL_STEP_S` (`0.1`) steps aged online volleys along their arc.
- **Toughness, Fire, and Repairs (`src/systems/naval/navalDamage.js`, `src/systems/naval/navalShips.js`):** `SHIP_TOUGHNESS` (`1.6`) scales hull hit points through `tough()`, and `PLAYER_CREW_TOUGHNESS` equals `2 * SHIP_TOUGHNESS` (`3.2`). Hits ignite deck fires at `FIRE_CHANCE` (`0.06`) up to `FIRE_STACK` (`3`), sinking vessels go under over `SINK_SECONDS` (`22`), and `REPAIR_PRICE` sets port rates at `7` per hull point, `4` per sail point, and `30` per crew member.
- **Striking, Sinking, and Player Wrecks (`src/systems/naval/navalDamage.js`, `src/systems/naval/navalHost.js`):** `SHIP_STATES` contains `afloat`, `struck`, `sinking`, `sunk`, `prize`, and `wrecked`. An AI vessel strikes colors at `STRUCK_AT` (`0.25`) hull or when reduced to `0` crew (`unmanned`), and `STRUCK_GRACE_S` (`2` s) prevents the striking volley from sinking the ship. Player vessels never sink; at `0` hull they enter `wrecked`, where `FIELD_REFLOAT` gates at-sea refloating.
