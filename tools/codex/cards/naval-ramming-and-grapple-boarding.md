---
slug: naval-ramming-and-grapple-boarding
title: "Bounded Ramming and Grapple Boarding"
domain: world
kind: subcard
parent: naval-refit-overview
files:
  - src/systems/naval/navalRam.js
  - src/systems/naval/navalRams.js
  - src/systems/naval/navalBoarding.js
  - src/systems/naval/navalHaul.js
  - src/systems/naval/navalDamage.js
  - src/systems/naval/navalHost.js
replacesBible:
  - "03-World/Naval-Refit.md"
related:
  - naval-refit-overview
  - naval-shot-kinds-and-combat-feedback
  - captain-tree-and-ore-refits
invariants:
  - "`ramBlow` deals `0` below `RAM_SPEED` (`1.6` m/s) closing speed; otherwise it deals `RAM_SHARE` (`0.15`), or `GALLEY_SHARE` (`0.3`) with a galley ram, of the smaller hull, multiplied by `min(1, closing / RAM_FULL_SPEED)` (`8` m/s) and by `RAM_GLANCE` (`0.4`) on bow or stern hits."
  - "Ram damage respects `ramLine` (`maxHull * STRUCK_AT`) as a floor, so ramming never drops a hull below its struck threshold or sinks a ship outright."
  - "Self-damage uses `recoilShare` (`RAM_RECOIL = 0.3` multiplied by `BOW_RECOIL = 2` for a plain bow, or divided by `GALLEY_RAM = 3` for a galley ram), and `ramPaid` caps the outgoing blow at the attacker's available `recoilRoom` above its own struck floor."
  - "`src/systems/naval/navalRams.js` skips ships that fail `deps.fair(e)`, so colliding with a lawful ship at peace registers as a harmless bump without damage or hostility."
  - "`boardableState(ship)` returns true only for a struck ship that is not already boarded, and the boarding prompt appears within `BOARD_RANGE` (`32` meters)."
  - "`haulBrake(v)` bleeds off forward speed over `GRAPPLE_S` (`2.2` seconds) while the haul maintains `HULL_CLEAR` (`0.5` meters) between hulls and caps duration at `HAUL_MAX_S` (`6` seconds)."
traps:
  - "Do not reintroduce unbounded per-speed ram damage (`14` per m/s), which could sink a sloop in a single hit; always scale by the smaller hull and clamp at `ramLine`."
  - "Colliding with an undamaged ship no longer makes it boardable; the target must strike its colors first."
tags:
  - naval
  - ramming
  - boarding
  - grapple
  - damage-cap
---

Ramming and boarding separate collision damage from ship capture so hulls disable rather than sink on impact and only crippled vessels can be grappled.

## Hull-Proportional Ramming and Recoil

`ramContact(box, p, RAM_REACH)` (`src/systems/naval/navalRam.js`, reach `1.2` meters) selects the struck broadside, bow, or stern face, and `ramClosing` averages closing speed along that face's normal over `RAM_MEMORY_S` (`0.6` seconds). Each ship enforces a `RAM_COOLDOWN_S` (`3` seconds) cooldown, and `src/systems/naval/navalRams.js` ignores targets failing `deps.fair(e)` so bumping a lawful ship at peace causes neither damage nor hostility.

Above `RAM_SPEED` (`1.6` m/s), `ramBlow` deals `RAM_SHARE` (`0.15`), or `GALLEY_SHARE` (`0.3`) with a galley ram, of the smaller ship's maximum hull, multiplied by `min(1, closing / RAM_FULL_SPEED)` (`RAM_FULL_SPEED = 8`) and by `RAM_GLANCE` (`0.4`) on bow or stern hits. Both outgoing damage and recoil clamp at `ramLine` (`maxHull * STRUCK_AT`). Self-damage uses `recoilShare` (`RAM_RECOIL = 0.3` times `BOW_RECOIL = 2` for a plain bow, or divided by `GALLEY_RAM = 3` for a galley ram), and `ramPaid` caps the blow at the attacker's remaining `recoilRoom`. Under `ramMenSaid`, every `RAM_A_MAN` (`40`) hull points dealt kills one crew member.

## Grapple Boarding and Alignment

`boardableState(ship)` (`src/systems/naval/navalBoarding.js`) allows boarding only after a target has struck its colors and is not yet boarded, showing the prompt within `BOARD_RANGE` (`32` meters). `createNavalHaul` (`src/systems/naval/navalHaul.js`) runs `startBoarding` and `stepBoarding`, applying `haulBrake(v)` over `GRAPPLE_S` (`2.2` seconds) and aligning hulls to `berthPose` with `HULL_CLEAR` (`0.5` meters) clearance within `HAUL_MAX_S` (`6` seconds). Boarding crew musters range from `MUSTER_MIN` (`3`) to `MUSTER_MAX` (`12`).
