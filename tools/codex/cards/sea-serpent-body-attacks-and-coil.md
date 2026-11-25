---
slug: sea-serpent-body-attacks-and-coil
title: "Serpent Segmented Body, Attacks, Coil, and Maelstrom"
domain: multiplayer
kind: subcard
parent: sea-serpent-world-boss
files:
  - src/net/serpentBody.js
  - src/net/serpentBrain.js
  - src/worldEvents/serpentStrike.js
  - src/systems/naval/navalDamage.js
  - src/worldEvents/serpentHost.js
  - src/render/serpentRender.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sea-Serpent.md"
related:
  - sea-serpent-world-boss
  - sea-serpent-relay-fight-and-trust-bounds
  - naval-shot-kinds-and-combat-feedback
  - enemy-telegraphs-poise-and-punish
invariants:
  - "The body comprises `SEG_N` (`24`) segments of `SEG_LEN` (`7` m) for a `BODY_LEN` of `168` m at `SERPENT_GIRTH` (`1.6`), trailing the arclength history of the head (`LEGS_KEPT` `12`, `MODES_KEPT` `4`) without physics."
  - "A segment is targetable only when its crown sits more than `EXPOSED_M` (`0.4` m) above water (`segExposed`), and `headExposed` is true only in breach or rear mode, above `0.5` coil weight, or while stunned."
  - "Shots striking an exposed head deal `HEAD_X` (`2`) times damage, while hits on a stunned serpent deal `STUN_X` (`1.5`) times damage."
  - "A coil holds a ship for `COIL_MS` (`24000` ms) with `COIL_ESC_MS` (`3000` ms) to sail clear; breaking the coil stuns the boss for `SERPENT_STUN_MS` (`9000` ms), whereas an unbroken hold inflicts `CRUSH`."
  - "Client strikes (`src/worldEvents/serpentStrike.js`) decay shove over `SHOVE_S` (`2.5` s) at `SERPENT_THROW_X` (`0.5`), scale sail tear by `SERPENT_CANVAS_X` (`0.5`), and scale two-ship attack, crush, grip, and grind damage by `SERPENT_PAIR_SHARE` (`2/3`)."
traps:
  - "The relay announces attacks `SERPENT_SAY_AHEAD_MS` (`500` ms) early for synchronized rendering; landings judged more than `LAND_JUDGE_MS` (`500` ms) late skip hull damage but still spawn venom pools."
  - "Clients release a local coil hold if no relay update arrives within `COIL_WORD_WAIT_MS` (`2500` ms) or after `COIL_LOST_MS` (`4000` ms) of socket disconnect."
dfu: []
tags:
  - boss-body
  - attacks
  - coil
  - maelstrom
  - telegraphs
---

# Serpent Segmented Body, Attacks, Coil, and Maelstrom

`src/net/serpentBody.js` and `src/render/serpentRender.js` animate a kinematic 24-segment chain driven by `src/net/serpentBrain.js` and `src/worldEvents/serpentHost.js`.

- **Kinematic body and hit multipliers:** The `168` m chain (`SEG_N = 24`, `SEG_LEN = 7`, `SERPENT_GIRTH = 1.6`) trails head history (`LEGS_KEPT = 12`, `MODES_KEPT = 4`) at `CRUISE_V` (`11`), `RAM_V` and `DASH_V` (`34`), or `DRIFT_V` (`3` m/s). Postures blend over `MODE_BLEND_MS` (`1500` ms) across `DEEP_Y` (`-12`), `BREACH_Y` (`12`), `REAR_Y` (`14`), and `COIL_HEAD_Y` (`15`). Shots only register where `segExposed` exceeds `EXPOSED_M` (`0.4` m); `headExposed` hits multiply damage by `HEAD_X` (`2`), and stun applies `STUN_X` (`1.5`).
- **Attacks and phase turns:** `SERPENT_ATTACK_TABLE` defines `ram` (Breaching Ram), `breach` (Rising Maw), `spit`, `lash`, `coil`, `roar` (Abyssal Roar), `cry` (Satakal's Call), and `mael`, announced `SERPENT_SAY_AHEAD_MS` (`500` ms) early. Each `SERPENT_PHASE_TURN` grants a `SERPENT_SHIELD_MS` (`4000` ms) shield: phase 2 opens with `cry` and a `coil` on the top-threat ship (`SERPENT_THREAT_PICK = 0.6`), and phase 3 opens with `mael` then `roar`.
- **Coil and Maelstrom:** A coil wraps at `COIL_R` (`22` m) for `COIL_MS` (`24000` ms) after `COIL_ESC_MS` (`3000` ms); breaking its threshold (`COIL_HP_MIN = 60`, `COIL_TEAM_S = 4`) triggers a `SERPENT_STUN_MS` (`9000` ms) stun before `CRUSH`. The Maelstrom grows over `MAEL_GROW_MS` (`4000` ms) to `MAEL_R` (`230` m, eye `MAEL_EYE_R = 40`, swirl `MAEL_SWIRL = 4`, orbit `MAEL_ORBIT_R = 85`). Clients apply impacts via `src/worldEvents/serpentStrike.js` and `src/systems/naval/navalDamage.js`.
