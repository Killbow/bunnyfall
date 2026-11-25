---
slug: "combat-abilities-autoaim-and-leaps"
title: "Combat Abilities: Autoaim, Locked Leaps, and Side Hops"
domain: "combat"
kind: "subcard"
parent: "combat-abilities-overview"
files:
  - "src/combat/abilities/autoaim.js"
  - "src/combat/abilities/rig.js"
  - "src/combat/abilities/weaponLadders.js"
  - "src/combat/techniques.js"
routes: []
tables: []
related:
  - "combat-abilities-overview"
  - "weapon-technique-runner-and-refusals"
invariants:
  - "Every autoaim number lives in the AUTOAIM table in autoaim.js: a 0.26 rad cone around the crosshair, 0.55 rad within 3 m, a line-of-sight ray, and the slack for each use."
  - "autoaimFoe only returns foes abilityMayStrike allows: never a player, companion, ally, or yielded foe."
  - "A locked dash or leap strikes the foe on landing wherever it moved, while it stands within the stage reach plus AUTOAIM.landReachM (1.6 m)."
traps:
  - "Side hops (aim 'side') alternate right then left by chain beat unless the advance sets side; a wall on one side tries the other."
  - "A locked lane ability rebuilds its lane from the take-off point through the foe's position at landing, so foes passed on the way are still struck."
tags:
  - "abilities"
  - "autoaim"
  - "leap"
  - "dash"
---

# Combat Abilities: Autoaim, Locked Leaps, and Side Hops

`src/combat/abilities/autoaim.js` gives every targeted ability one soft lock onto the foe nearest the crosshair, in sight and in range. `rig.js` uses it four ways:

- **Swings:** a melee hit turns to the foe its chain already struck, else the foe in the cone, faces it through the host's `face` door, and reaches up to `meleeSlackM` farther.
- **Dashes and leaps:** `advanceAim` locks a foe within the advance's length plus `leapSlackM`. Lane advances land in front of it (`lockedLanding`), target and flank advances aim at it, and side hops land beside it. With no foe, the plain aim from `techniques.js` stands.
- **Shots:** an ability arrow bends toward the locked foe's chest (`chestShare`).
- **Arrow rain:** the volley centers on the locked foe's feet.

Falling Moon, Vault Strike, Harebound, Predator's Pounce, and Judgement Bastion are the long, high leaps. Vaulting Riposte, Untouchable Waltz, and Chain Flicker hop to the side.
