---
slug: sky-ketch-raid-overview
title: "Sky-Ketch Raid Overview and Switches"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/ketch/ketchLaw.js
  - src/net/ketch/ketchBrain.js
  - src/net/ketch/ketchWarden.js
  - src/net/ketch/ketchReceipt.js
  - src/systems/ketch/ketchClient.js
  - src/systems/ketch/ketchDeckHost.js
  - src/systems/ketch/ketchSpoils.js
  - src/mods/contentOff.js
  - src/characters/madeLevel.js
  - server/src/index.js
routes:
  - /v1/ketch/claim
  - /internal/ketch/rc
tables:
  - ketch_voyages
replacesBible:
  - "11-Multiplayer/Sky-Ketch.md"
related:
  - sky-ketch-voyage-clock-and-boarding
  - sky-ketch-stages-cells-and-constructs
  - tonal-warden-fight-and-downed-crew
  - sky-ketch-receipts-spoils-and-claims
  - world-events-and-signed-receipts
  - world-modes-and-transitions
invariants:
  - "The Sky-Ketch is an online-only, eight-account cooperative raid (`KT_CREW_MAX = 8`) where each party boards its own ship room, driven by the pure relay director (`ketchBrain.js`) with hit detection evaluated on the client."
  - "`CONTENT.skyKetch` (`src/mods/contentOff.js`) is `false` on main, so `ketchVoyageAt` always returns phase `'away'` for voyage `KT_NEVER_N` (`10000000`) while preserving the underlying schedule."
  - "`rollKetchSpoils` (`src/systems/ketch/ketchSpoils.js`) retains three reserved `rolls()` draws between `lastPass` and `socketPass` so existing receipts keep their seeded equipment rolls."
  - "The ship registers as `'ketch'` in `MADE_LEVELS`, converting fatal damage into an overboard fall with no death penalty."
traps:
  - "Turning off `CONTENT.skyKetch` gates only `ketchVoyageAt` and `eventTimers.js`; `ketchRoomHolds`, `ketchHolds`, `ketchBoards`, and `ketchAdmits` call the pure `ketchVoyageOf(n)` directly, so the relay still accepts `kt:` rooms if given a computed voyage index."
  - "Live stage keys in `KT_STAGES` are `watch`, `gallery`, `engine`, `sailwalk`, `bridge`, and `vault`; the Tonal Warden encounter runs in `'bridge'` and the reward chest stage is `'vault'`."
tags:
  - multiplayer
  - sky-ketch
  - world-events
  - raid
  - content-switch
  - architecture
---

The Sky-Ketch is an online eight-account cooperative raid (`KT_CREW_MAX = 8`) hosted in per-party relay rooms (`kt:<voyage 8 hex>.<captain digest 16 hex>` via `ketchRoomKey`). A pure state machine in `src/net/ketch/ketchBrain.js` directs stages, cells, and Dwemer enemies over `kt` WebSocket frames (`_ktFrameIn` in `server/src/index.js`, validated by `validKetchIn` in `src/net/wire.js`), while clients older than `KT_RELAY_MIN` are rejected by `relaySupportsKetch`.

## Switches and Made-Level Rules

`CONTENT.skyKetch` (`src/mods/contentOff.js`) is `false` on main, causing `ketchVoyageAt` to report phase `'away'` at voyage `KT_NEVER_N` (`10000000`). In `src/systems/ketch/ketchSpoils.js`, `rollKetchSpoils` pays gold and two graded items while advancing three reserved `rolls()` calls between `lastPass` and `socketPass` so seeded payouts stay stable across existing receipts.

As a `'ketch'` entry in `MADE_LEVELS` (`src/characters/madeLevel.js`), the deck uses `'held'` health regeneration (half rate, paused for 5 seconds after taking damage), allows party Resurrect, disables the automap, dismisses companions, blocks saving, resting, Mark, Recall, portal stones, and unstuck, and bans Levitate, slow fall, flight techniques, and running leaps.

## Subcards

- `sky-ketch-voyage-clock-and-boarding`: UTC voyage schedule, room admission, anchor-lift boarding, and Discord herald notifications.
- `sky-ketch-stages-cells-and-constructs`: stage progression, hazard cycles, Aether cell carrying and speed checks, and enemy health scaling.
- `tonal-warden-fight-and-downed-crew`: `KETCH_SEAM` boss phases, resonators, tuning forks, downed revival, and overboard recovery.
- `sky-ketch-receipts-spoils-and-claims`: Ed25519 `y1` receipts, `/internal/ketch/rc`, `/v1/ketch/claim`, `ketch_voyages`, and chest payouts.
