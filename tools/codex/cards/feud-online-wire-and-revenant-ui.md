---
slug: feud-online-wire-and-revenant-ui
title: "Feud Online Wire Sync and Revenant UI"
domain: multiplayer
kind: subcard
parent: feud-telegraphs-and-revenants
files:
  - src/net/wire.js
  - src/ai/puppetBlows.js
  - src/revenants/revenantFeud.js
  - src/revenants/feudLedger.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
  - src/revenants/revenantPersonality.js
  - src/revenants/revenantVoice.js
  - src/ui/revenantCard.js
  - src/ui/revenantPage.js
  - src/ui/hitNumbers.js
replacesBible:
  - "12-Enhanced-AI/Feud-Arc.md#wire"
  - "12-Enhanced-AI/Feud-Arc.md#ui"
related:
  - feud-telegraphs-and-revenants
  - enemy-telegraphs-poise-and-punish
  - revenant-lairs-thefts-and-companions
  - wire-protocol-and-frame-dispatch
invariants:
  - "Each client judges its own feet on incoming puppet telegraphs (`applyBlowRecord`, `puppetBlowTurn`, and `puppetGapLanded`), while the owner view opens only the owner `overreach` or `chain` states and never forces peer damage."
  - "`WIRE_LANDED` (+32 on `wk` for `WIRE_LANDED_S` = 0.5 s) plus 1-byte serial `wn` (0 to 255) lets behind-clock peers land blows rather than misreading vanished wind-ups as canceled breaks."
  - "`validFoeRecord` accepts wind-up fields only when all five (`wk`, `wy`, `wl`, `wo`, and `wn`) appear together (`wp` optional only with them), enforcing `wk` 0 to 127 with `(wk & 7) <= 6`, `wl` 0 to 3000 ms, `wp` 0 to 64 m, `ws` 1 or 2, `ad` `1..0xffff` with <= 3 bits, `wq` 0 to 13, `p2 === 1`, `rb` 1000 to 4000, and `rt` `0..FOE_SEQ_MAX`."
  - "`voiceLine` filters out dialogue templates containing any unfilled placeholder among `{p}`, `{how}`, `{item}`, `{move}`, or `{ally}`."
traps:
  - "Dungeon `roomRecord` omits street fields `z`, `nm`, `yd`, `ex`, and `sp`, so band follower `rt` is omitted underground and dungeon followers appear unnamed to peers while still carrying `feudWire` (`ad`, `wq`, `p2`, and `rb`) and `blowWire`."
  - "Peer hits on puppets require `damage > 0` before sending the weakness flag in `hitClassField` (`wc`), preventing bare-hands 0-damage hits from triggering `feudRevealWeak` on the owner."
  - "`applyFoes` caps peer puppets marked as revenants at `PEER_REVENANT_PUPPETS_MAX` = 9 (3 hunting plus 6 sworn) and strips revenant ownership before heir handover via `heirOf`."
tags:
  - multiplayer
  - wire
  - relay
  - puppets
  - ui
  - revenants
---

Online sync in `src/net/wire.js` and `src/ai/puppetBlows.js` streams enemy wind-ups, poise tags, and revenant traits across peers while `revenantCard.js`, `revenantPage.js`, and `hitNumbers.js` surface feud status in the HUD.

## Wire Encoding and Puppets

`src/net/wire.js` versions relay frames via `RELAY_VERSION`. `WIRE_KINDS` orders `0..6` as `lunge`, `sweep`, `slam`, `ring`, `charge`, `leap`, and `aimed`, with bitflags `WIRE_IRON` (8), `WIRE_FEINT` (16), `WIRE_LANDED` (32), and `WIRE_SIG` (64). `hitClassField` and `hitClassOf` encode `K * 100` (capped at `HIT_CLASS_K_MAX` = 175) plus `1000` (back) and `2000` (weak) into `wc`.

`feudWire`, `feudFromWire`, and `puppetRevenantBlows` (`src/revenants/revenantFeud.js`) sync `ad`, `wq`, `p2`, and `rb` (`BLOWS_WIRE` 1000 to 4000 per mille) via `entity._revBlows` without double-scaling `damageScale`. Staggered or overreached puppets hold `PUPPET_HELD_UNTIL` (`1e9`) until the owner clears `ws` or `tacticsStep` (`src/ai/tactics.js`) transfers ownership.

## Revenant Cards, Journal, and Hit Tags

`revenantPersonality.js` and `revenantVoice.js` supply spoken lines for revenant encounters. `revenantCard.js` displays up to `REVENANT_CARDS_MAX` = 2 banner cards typed at 42 cps (held 3500 to 7500 ms), `revenantPage.js` renders the ledger on the Holdings rail, and `hitNumbers.js` `HIT_TAGS` joins `Stagger`, `Holds`, `Open`, `Perfect`, and `Weakness` within `TAG_JOIN_MS` = 250 ms.
