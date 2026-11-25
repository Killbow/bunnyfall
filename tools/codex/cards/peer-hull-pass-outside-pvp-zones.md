---
slug: peer-hull-pass-outside-pvp-zones
title: "Peer Hull Pass-Through Outside PvP Zones and the Hull Latch"
domain: world
kind: subcard
parent: main-spine-jewel-kin-and-masteries-overview
files:
  - src/systems/naval/peerHulls.js
  - src/scenes/world.js
  - src/systems/naval/seasWorld.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/navalShips.js
  - src/systems/naval/navalHost.js
  - src/world/wildZone.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26d.md"
related:
  - main-spine-jewel-kin-and-masteries-overview
  - naval-and-come-sail-away
  - peer-range-and-distant-ship-hulls
  - sea-serpent-world-boss
  - naval-ramming-and-grapple-boarding
invariants:
  - "peerHullsMeet() === wildHere(): another player's hull blocks my helm only inside a PvP zone."
  - "peerHullSweep wraps csaSphereCastAll and drops hits on pool.peerBoats roots outside PvP zones."
  - "hullsStood (called from csaSyncColliders) removes from my collider every player hull that overlaps the deck I stand on (hullOverlap), but never hulls owned by that deck's owner (ownerOf)."
  - "Inside a PvP zone, hulls that were already passing the same deck stay latched until they stop overlapping. Hulls that arrive later collide."
  - "SERPENT4 bumpers (BUMPER_M, bumperDrift) are gone from navalHost.js. The serpent site is never in a PvP zone."
traps:
  - "Ownership comes from the peerKey prefix `${owner}:${slot}`. My own moored boat still blocks my helm."
  - "deckPressed (a ladder board) overrides the host's deck while the feet stay over that boat. Without it, a player falls through their own deck onto the other hull."
dfu: []
tags:
  - naval
  - hull-pass
  - pvp-zone
  - collision
  - sethrakul
---

# Peer Hull Pass-Through Outside PvP Zones and the Hull Latch

Naval peer hull filtering in `src/systems/naval/peerHulls.js` and `src/scenes/world.js` prevents ships owned by different players from blocking each other outside PvP waters while preserving deck walking and ladder boarding.

- **PvP helm gate (`src/systems/naval/peerHulls.js`, `src/world/wildZone.js`, `src/systems/naval/navalHost.js`):** `peerHullsMeet()` matches `wildHere()`, so another player's hull blocks the helm only inside a PvP zone. `peerHullSweep` wraps `csaSphereCastAll` (`src/systems/naval/navalShips.js`) and drops hits against `pool.peerBoats` roots outside PvP waters, including at the Sethrakul sea serpent site, which has no `BUMPER_M` or `bumperDrift` bumpers.
- **Deck overlap latch (`hullsStood`, `hullOverlap`, `resetHullLatch`):** Peer hulls stay registered in the collider so players can walk and board their decks. During `csaSyncColliders`, `hullsStood` strips from the local collider any player hull overlapping the deck the player stands on, except hulls sharing that deck's `ownerOf` (`${owner}:${slot}` prefix). Inside a PvP zone, hulls already overlapping the same deck stay latched until they separate, while newly arriving hulls collide.
- **Boarding and airborne grounding (`src/systems/naval/comeSailAway.js`, `src/systems/naval/seasWorld.js`):** Ladder boarding sets `deckPressed` so the boarded boat overrides the host deck while the player's feet remain over it. While airborne, `deckGround` in `seasWorld.js` returns `'other'` whenever `hullPassesMyDeck` is true.
