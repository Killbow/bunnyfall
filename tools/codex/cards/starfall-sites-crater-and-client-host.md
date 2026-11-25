---
slug: starfall-sites-crater-and-client-host
title: "Starfall Sites, Crater Clearance, and Client Host"
domain: world
kind: subcard
parent: starfall-overview
files:
  - src/systems/starfall/starfallSites.js
  - src/net/gateLaw.js
  - src/world/gateClearance.js
  - src/world/starfall/starModel.js
  - src/world/starfall/starArt.js
  - src/render/starfall/starfallPass.js
  - src/systems/starfall/starfallHost.js
  - src/systems/starfall/starfallClient.js
  - src/world/wodShared.js
  - src/characters/enemyTargets.js
  - src/ui/starfall/starTracker.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Starfall.md"
related:
  - starfall-overview
  - starfall-encounter-ledger-and-waves
  - poi-runtime-and-world-builder
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "`findStarSites` reuses candidate wilderness pixels from the gate scan, keeping all three nightly stars at least `STAR_APART_PX` (5 pixels, Chebyshev distance) from one another and from the active gate pixel."
  - "Within its map pixel, each impact spot is offset deterministically by `starSpotLocal` using `STAR_SALT` within a radius of `GATE_SPOT_SPREAD_M` (200 m)."
  - "`STAR_ROCK_M` (28 m) strips World of Daggerfall rocks around the impact center to clear the `STAR_BARE_R` (9.6 m) inner crater, the `STAR_STAND_R` (14-20 m) outer ring, and a walkable perimeter."
  - "The local encounter owner spawns at most `STAR_LIVE_MAX` (45) concurrent enemies, matching the `WOD_STAR_PUPPETS_MAX` (45) remote puppet budget tracked separately from camp populations."
traps:
  - "The client presence and leash boundary `STAR_SAY_M` (55 m) is intentionally tighter than the relay validation radius `STAR_REACH_M` (60 m) so departing owners hand off before their words go out of range."
  - "Unprovoked melee attackers flagged with `huntsStar` prioritize the star core at `STAR_HUNT_PRIORITY` (+40) until struck by a defender, which redirects their aggro onto the attacker."
dfu: []
tags:
  - starfall
  - sites
  - clearance
  - rendering
  - enemies
  - hud
---

# Starfall Sites, Crater Clearance, and Client Host

`findStarSites` (`src/systems/starfall/starfallSites.js` and `src/net/gateLaw.js`) selects three wilderness pixels per sky night from the Oblivion Gate candidate pool, enforcing a minimum Chebyshev separation of `STAR_APART_PX` (`5` map pixels) between the night's stars and the daily gate site. `starSpotLocal` hashes the coordinates with `STAR_SALT` to offset the crater up to `GATE_SPOT_SPREAD_M` (`200` meters) from the pixel center. `src/world/gateClearance.js` clears procedural rocks within `STAR_ROCK_M` (`28` meters), exposing the `STAR_BARE_R` (`9.6`-meter) crater and the `STAR_STAND_R` (`14`-to-`20`-meter) ring.

## Sky Rendering, Client Ownership, and Enemy Aggro

- **Sky warnings and art (`src/world/starfall/starModel.js`, `src/world/starfall/starArt.js`, `src/render/starfall/starfallPass.js`):** Town warnings post `STAR_WARN_MS` (`10` min) ahead of impact. The sky pass (`STAR_SKY_R = 4200`, `STAR_RING_SEGS = 32`, archive `STAR_ARCHIVE = 38301`) displays an omen `STAR_OMEN_MS` (`90` s) before impact and a falling streak during the final `STAR_STREAK_MS` (`8` s). A landed star lasts `STAR_LIFE_MS` (`15` min) with a `2`-minute afterglow (`STAR_AFTER_MS`), while `src/ui/starfall/starTracker.js` displays the HUD within `STAR_HUD_M` (`400` meters).
- **Client host and puppets (`src/systems/starfall/starfallHost.js`, `src/systems/starfall/starfallClient.js`, `src/world/wodShared.js`):** The owner spawns up to `STAR_LIVE_MAX` (`45`) live enemies (`WOD_STAR_PUPPETS_MAX = 45` for remote viewers), persists local hit counts in `STAR_BLOWS_STORE`, and hands over live enemies when stepping outside `STAR_SAY_M` (`55` meters, re-entering after `STAR_RESTAND_MS = 4` s).
- **Star hunters (`src/characters/enemyTargets.js`):** Melee enemies with `huntsStar` march toward the crater with `STAR_HUNT_PRIORITY` (`+40`) and drain star light until a player strike turns them onto the attacker.
