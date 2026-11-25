---
slug: players-shown-crowd-count-overview
title: "Players Shown Crowd Count and PvP/Mate Exemptions"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/gateCrowd.js
  - src/net/onlineWorld.js
  - src/ui/uiPrefs.js
  - src/ui/enhancedMenu.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Crowd-Wide.md"
related:
  - players-shown-cut-player-readers
  - online-coop-peer-presence-and-crowd-fans
  - peer-range-and-distant-ship-hulls
  - arena-bout-law-crowd-and-kit
invariants:
  - "GATE_CROWD_TIERS is [0, 12, 24]. 0 (Everyone) is the default and cuts nobody."
  - "gateCrowdMax maps any stored pref that is not a tier (for example 7, 13, '12', -12) to GATE_CROWD_DEFAULT (0)."
  - "crowdDrawn keeps mates, then adds the nearest players up to max, with hysteresis GATE_CROWD_HOLD_M = 4."
  - "The count is on during gateArenaDay (Burning Court). Otherwise it is off under the travel view, in a wild PvP zone that is not cromwarkPeace, during siegeSession.active(), during royalSession.active() (spectators too), and in a room whose roomIdentity kind is 'arena'."
  - "mate = crowdKept(social?.partyPeers?.(), [duelMgr.opponent, tradeMgr.session?.peer], wagonRiders?.ridingWithMe(), csaAboard.shipmates(), _duelRings.keys())."
traps:
  - "The pref key 'gateCrowd' default in uiPrefs.js is duplicated rather than imported, to keep gateCrowd.js off the boot path."
  - "social can be null when online without a hub or account; always use optional chaining."
  - "No undrawn player can harm another: the count is off wherever a stranger can fight, and duel opponents are kept."
dfu: []
tags:
  - crowd
  - peers
  - performance
  - pvp
  - duel
---

# Players Shown Crowd Count and PvP/Mate Exemptions

Crowd capping (`src/net/gateCrowd.js`, `src/net/onlineWorld.js`, `src/ui/uiPrefs.js`, `src/ui/enhancedMenu.js`, and `src/scenes/world.js`) bounds visible peers while keeping combat and cooperative actors drawn.

- **Tiers, Preference Storage, and Hysteresis:** `choiceRow('gateCrowd', 'Players shown at once')` in `src/ui/enhancedMenu.js` offers `GATE_CROWD_TIERS` (`[0, 12, 24]`), where `0` (`Everyone`, `GATE_CROWD_DEFAULT`) cuts nobody. `gateCrowdMax` normalizes any non-tier value to `0`. `src/ui/uiPrefs.js` duplicates the default key to keep `gateCrowd.js` off the boot path. `createGateCrowd().cut(peers, o)` returns `peers` unchanged when `o.on` is false or all players fit; otherwise `crowdDrawn` retains mates and fills a reused list with the closest peers using hysteresis `GATE_CROWD_HOLD_M` (`4`).
- **Combat and Mate Exemptions:** The limit applies during `gateArenaDay` (Burning Court), but disables in travel view, wild PvP zones outside `cromwarkPeace`, active `siegeSession.active()` or `royalSession.active()` (including spectators), and rooms with `roomIdentity` kind `'arena'`. Pure helper `crowdKept` builds one `Set` per frame (ignoring null ids) from `social?.partyPeers?.()` (using optional chaining), `[duelMgr.opponent, tradeMgr.session?.peer]`, `wagonRiders?.ridingWithMe()`, `csaAboard.shipmates()`, and `_duelRings.keys()`. Undrawn peers retain map marks while shedding body, name, light, cast, and step.
