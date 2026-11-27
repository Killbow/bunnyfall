---
slug: online-coop-cell-enemies-halo-and-hits
title: "Outdoor Cell Enemies: Spawner Ownership, Halo Sockets, Hits, and Party Scaling"
domain: multiplayer
kind: subcard
parent: online-coop-overview
files:
  - src/net/wire.js
  - src/net/online.js
  - src/net/onlineWorld.js
  - src/net/hitPend.js
  - src/party/partyScale.js
  - src/systems/quest/questFoeHost.js
  - server/src/message/frames/foes.js
  - server/src/message/frames/own.js
  - server/src/message/frames/hit.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-overview
  - online-coop-shared-dungeon-and-interior-rooms
  - spawn-grants-overview
  - pixel-streaming-and-origin-shift
  - room-engine-and-hub-sharding
invariants:
  - "Each spawner's enemies belong to one owner, who streams them on the cell's `foes` frame. Peers render puppets, capped at CELL_PUPPETS_MAX (8 + CELL_LOOSE_PUPPETS = 12)."
  - "cellHaloFor(px, py) chooses neighboring cell sockets to keep open, so enemies across a border stay visible. A crossing defers its full join up to HALO_WAIT_MS (BACKOFF_MAX_MS = 8000) while the halo socket connects."
  - "Refused hits wait in makeHitPend for at most 64 entries and 2000 ms, and the queue clears on room change."
  - "Party toughness divides damage at the authority by partyToughness(n) = 1 + 0.5 * (n - 1) without changing max health. Damage scales by 1 + 0.1 * (n - 1). Fighters count only if they struck the enemy within PARTY_FIGHT_WINDOW_MS (30 s)."
  - "World-quest enemies (isWorldQuestFoe) count as shared cell encounters, and private quest enemies never enter room authority."
  - "A heal on a shared enemy is divided by the same party toughness as damage (`partyFoeHeals`), and a blow marked whole (`markWholeBlow`, read once by `takeWholeBlow`) is never divided."
traps:
  - "Route sendHit through the halo socket before checking primary readiness, or peer-owned enemies become invulnerable during primary reconnects."
  - "The own frame needs relay version OWN_RELAY_MIN or newer, or the relay strikes the client."
dfu: []
tags:
  - enemies
  - cells
  - halo
  - hits
  - party-scaling
---

# Outdoor Cell Enemies: Spawner Ownership, Halo Sockets, Hits, and Party Scaling

Outdoor `world:<cx>,<cy>` cells partition encounter authority per spawner so players can fight shared enemies across cell boundaries (`src/net/online.js`, `src/net/onlineWorld.js`).

## Spawner Ownership, Halo Sockets, and Hit Queues

- **Spawner ownership (`server/src/message/frames/own.js`, `server/src/message/frames/foes.js`):** Each spawner belongs to one owner (relay `OWN_RELAY_MIN` or newer), streaming `foes` frames every `FOES_MS` (`200` ms), full snapshots every `FOES_FULL_MS` (`2000` ms), and timing out at `FOES_STALE_MS` (`6000` ms). Peers render puppets up to `CELL_PUPPETS_MAX` (`8 + CELL_LOOSE_PUPPETS = 12`) and query unknown senders beyond `ROSTER_MAX` via `who` every `WHO_RETRY_MS` (`10000` ms).
- **Halo sockets (`src/net/online.js`):** `cellHaloFor(px, py)` keeps neighboring cell sockets open near borders. Border crossings defer primary room swaps up to `HALO_WAIT_MS` (`BACKOFF_MAX_MS = 8000` ms) while the halo connects.
- **Hit routing (`src/net/hitPend.js`, `server/src/message/frames/hit.js`):** `sendHit` prefers an open halo socket before checking primary readiness. Unsent hits queue in `makeHitPend` (`64` entries, `2000` ms) and clear on room change.

## Quest Filtering and Party Scaling

- **Quest scope (`src/systems/quest/questFoeHost.js`):** World-quest enemies (`isWorldQuestFoe`) join cell authority; private quest spawns stay local.
- **Party scaling (`src/party/partyScale.js`):** Fighters active within `PARTY_FIGHT_WINDOW_MS` (`30` s) divide incoming damage by `partyToughness(n) = 1 + 0.5 * (n - 1)`, scale enemy damage by `1 + 0.1 * (n - 1)`, and add `partyExtraFoes(n) = min(3, floor((n - 1) / 2))` outdoor spawns.
