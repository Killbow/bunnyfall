---
slug: breach-portents-overview
title: "Breach Portents: Encounter Modifiers Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/gateLaw.js
  - src/net/gateMods.js
  - src/net/gateBrain.js
  - src/net/gateLink.js
  - src/net/gateReceipt.js
  - src/worldEvents/gateSpoils.js
  - src/net/wire.js
  - src/net/online.js
  - server/src/index.js
  - server-account/src/eg.js
routes:
  - "/v1/gate/claim"
tables: []
replacesBible:
  - "11-Multiplayer/Breach-Portents.md"
related:
  - dagons-breach-world-boss
  - breach-boss-brain-and-courts
  - breach-receipts-spoils-and-embers
  - breach-schedule-site-and-omens
  - breach-portents-vanguard-waves
  - breach-portents-sundering-split
  - breach-portents-captive-and-tithe-imp
  - breach-portents-warden-arsenal-and-gaze
invariants:
  - "`gatePortentsOf(day)` is pure: every client and the relay derive the portents for a night from the day alone, and screens and the herald announce them before the gate opens."
  - "Legion-Lord nights never carry a portent (`marksCarryPortent`), and among eligible carrier gates every second gate (`n % 2`) carries one."
  - "Active portents draw from a six-slot shuffle bag `PORTENT_BAG` (`vanguard` x2, `sunder` x2, `captive`, and `dire`) shuffled on stream `PORTENT_BAG_KEY` (`16`)."
  - "The Dire Breach is `GATE_DIRE` (Vanguard plus Sundering), and `validGatePortents` accepts either a single portent or that exact pair (`GATE_PORTENTS_MAX` = `2`)."
traps:
  - "Door compatibility checks `relaySupportsPortents` against `GATE_PORTENTS_RELAY_MIN` (`src/net/wire.js`), blocking only portent nights on older relays while allowing plain nights."
  - "Portent messages (`sdh`, `kn`, `kr`, `rj`, `vgw`, `cpf`, `cpw`, `tithe`, `ad`, and `adie`) are sub-words inside the `gate` WebSocket room frame, not HTTP routes."
dfu: []
tags:
  - dagons-breach
  - portents
  - world-bosses
  - relay
  - shuffle-bag
---

Breach Portents add deterministic encounter rules to Dagon's Breach (`src/net/gateLaw.js` and `src/net/gateMods.js`). Because `gatePortentsOf(day)` depends only on the day index, every client, exterior UI screen, and herald announcement resolves the exact same portent schedule without extra relay queries.

## Selection, Compatibility, and Wire Sync

`marksCarryPortent` excludes all portents whenever the daily modifier cycle rolls a Legion-Lord night. Across the remaining eligible gates, every other encounter draws from the six-slot `PORTENT_BAG` (`vanguard` twice, `sunder` twice, `captive` once, and `dire` once) using stream `PORTENT_BAG_KEY` (`16`). `GATE_PORTENTS` encodes bitmasks for `vanguard` (`1`), `sunder` (`2`), and `captive` (`4`), while `GATE_DIRE` combines Vanguard and Sundering (`GATE_PORTENTS_MAX` = `2`).

Before entering a portent gate, `src/net/online.js` checks `relaySupportsPortents` against `GATE_PORTENTS_RELAY_MIN` (`src/net/wire.js`), and the client passes brain protocol version `GATE_BRAIN_V` (`GATE_BRAIN_MIN` = `7`) as `bv` on `in`. Inside the arena, `src/net/gateBrain.js`, `server/src/index.js`, and `src/net/gateLink.js` mirror fight fields (`f.pt` portents, `f.xa` walkway crossings, `f.sd` sundering, and `f.cp` captive) and broadcast sub-words (`atk`, `hit`, `sdh`, `kn`, `kr`, `rj`, `vgw`, `cpf`, `cpw`, `tithe`, `ad`, and `adie`) over the `gate` room frame.

## Receipt Bitmasks and Bonus Spoils

Signed kill receipts (`src/net/gateReceipt.js`) store the active mask in `p` up to `RECEIPT_PORTENTS_MAX` (`7`). When redeemed at `POST /v1/gate/claim`, each bit matching `SPOILS_PORTENT_BITS` (`[1, 2, 4]`) in `src/worldEvents/gateSpoils.js` awards one extra Magic-or-better item after standard draws, and `egGateWeir` (`server-account/src/eg.js`) boosts Weir Key odds from `EG_KEY_ODDS` (`1/6`) to `EG_KEY_ODDS_PORTENT` (`1/4`).
