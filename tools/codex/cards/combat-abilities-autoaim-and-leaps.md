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
  - "The main autoaim numbers live in the AUTOAIM table in autoaim.js: a 0.26 rad cone around the crosshair, 0.55 rad within 3 m, a line-of-sight ray, and the slack for each use."
  - "Autoaim measures the angle to the point on the enemy's body nearest the look (nearLook), so the nearer of two enemies in a line wins and short enemies still lock. lockedReach measures to the mid-height point, as the hit test does."
  - "autoaimFoe only returns enemies abilityMayStrike allows: never a player, companion, ally, or yielded enemy."
  - "A locked dash or leap strikes the enemy on landing wherever it moved, while it is within the stage reach plus AUTOAIM.landReachM (1.6 m)."
  - "Lane advances never reuse the chain's struck enemy: each lane dash locks from the crosshair, and a locked landing under AUTOAIM.minTravelM falls back to the plain aim."
traps:
  - "Side hops (aim 'side') alternate right then left by chain beat unless the advance sets side; a wall on one side tries the other. A chain keeps the first hop's approach (chain.hop), so the second hop lands on the far side, and a hop strikes from where it lands, with no lane."
  - "A locked lane ability rebuilds its lane from the take-off point through the enemy's position at landing, so enemies passed on the way are still struck."
  - "offsetAbilities(offset, entity) (rig.js, called from streamFrame.js beside offsetTechniques for the player) moves that player's flight, lanes, swing, stance, arrow rain, and Wayfarer lantern with the floating origin."
tags:
  - "abilities"
  - "autoaim"
  - "leap"
  - "dash"
---

# Combat Abilities: Autoaim, Locked Leaps, and Side Hops

`src/combat/abilities/autoaim.js` gives every targeted ability one soft lock onto the enemy nearest the crosshair, in sight and in range. `rig.js` uses it four ways:

- **Swings:** a melee hit turns to the enemy its chain already struck, else the enemy in the cone, faces it through the host's `face` door, and reaches up to `meleeSlackM` farther.
- **Dashes and leaps:** `advanceAim` locks an enemy within the advance's length plus `leapSlackM`. Lane advances land in front of it (`lockedLanding`), `target` and `foe` advances aim at it, and side hops land beside it. With no lock, side hops use `sideHop` and the rest use the plain aim from `techniques.js`.
- **Shots:** an ability arrow bends toward the locked enemy's chest (`chestShare`).
- **Arrow rain:** the volley centers on the locked enemy's feet.

Falling Moon, Vault Strike, Harebound, Predator's Pounce, and Judgement Bastion are the long, high leaps. Vaulting Riposte, Untouchable Waltz, and Chain Flicker hop to the side.
