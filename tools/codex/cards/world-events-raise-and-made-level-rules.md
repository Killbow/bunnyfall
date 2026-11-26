---
slug: world-events-raise-and-made-level-rules
title: "Raise Windows, Downed Bodies, and Regen Hold in Made Levels"
domain: world-events
kind: subcard
parent: world-events-raise-and-trait-hardening-overview
files:
  - src/net/sdLaw.js
  - src/net/raiseWord.js
  - server/src/world/sd.js
  - src/net/bossBody.js
  - src/net/eliteGates/egBrain.js
  - src/net/ketch/ketchBrain.js
  - src/net/online.js
  - src/systems/eliteGates/egClient.js
  - src/systems/ketch/ketchClient.js
  - src/net/remotePlayers.js
  - src/ui/deathScreen.js
  - src/net/wire.js
  - src/worldEvents/courtRules.js
  - src/worldEvents/courtRulesDoor.js
  - src/characters/madeLevel.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-World-Events.md"
related:
  - world-events-raise-and-trait-hardening-overview
  - integrity-boss-body-ledger
  - super-dungeon-look-overview
  - elite-breach-spire-overview
  - sky-ketch-raid-overview
invariants:
  - "SD_REZ_MS = 70_000 (CORPSE_MS 60_000 plus page delay) so the 'within 60 seconds' promise of the tile holds."
  - "Resurrect needs an admitted, non-down, living fighter within SD_REZ_REACH_M (10 m); sdMayRaise gates it and raises are recorded via src/net/raiseWord.js."
  - "Under BOSS_BODY a raised player counts as a new life (server _sdRose / bodyLife)."
  - "Spire and Sky-Ketch lethal falls lie the player DOWN (egLayDown, ketchRaise, poseDown); unraised bodies fall after the window."
  - "Natural regen is held during a made-level pause via regenShare; carried fraction is per body."
traps:
  - "Deaths beyond SD_FIGHTERS_MAX (256) in one window bury the oldest down account rather than leaving it unburied."
  - "Down state clears only after the admission door accepts the raised player."
  - "ONLINE_RESPAWN_SECONDS = 60 lives in src/ui/deathScreen.js; slot timestamp is stamped once at death."
  - "`courtRules.js` must not import `playerEntity.js`, because the account server bundles it through `itemLaw.js`; the hurt listener is wired in `courtRulesDoor.js`."
dfu: []
tags:
  - resurrect
  - super-dungeon
  - spire
  - sky-ketch
  - regen
---

# Raise Windows, Downed Bodies, and Regen Hold in Made Levels

Super-Dungeon, Elite Breach Spire, and Sky-Ketch raids coordinate downed-player raise windows, body life counters, door re-admission, and paused regeneration across `src/net/sdLaw.js`, `server/src/world/sd.js`, and `src/worldEvents/courtRules.js`.

- **Raise Window and Reach (`src/net/sdLaw.js`, `src/net/raiseWord.js`, `server/src/world/sd.js`, `src/net/bossBody.js`):** `SD_REZ_MS = 70_000` (`CORPSE_MS = 60_000` plus page delay) honors the `'within 60 seconds'` tile rule, while `SD_NO_FALLEN` reports `'The Hour will not take you back.'`. `sdMayRaise` requires an admitted, non-down, living fighter within `SD_REZ_REACH_M` (`10` m) and records raises through `src/net/raiseWord.js`. Under `BOSS_BODY`, a raised fighter counts as a new life (`_sdRose` and `bodyLife`). If deaths exceed `SD_FIGHTERS_MAX` (`256`) in one window, the oldest down account is buried.
- **Spire, Sky-Ketch, and Door State (`src/net/eliteGates/egBrain.js`, `src/net/ketch/ketchBrain.js`, `src/systems/eliteGates/egClient.js`, `src/systems/ketch/ketchClient.js`, `src/net/online.js`, `src/net/remotePlayers.js`, `src/net/wire.js`, `src/ui/deathScreen.js`):** Lethal blows in Spire and Sky-Ketch lay the player `DOWN` (`egLayDown`, `ketchRaise`, `poseDown`), and unraised bodies fall when the window expires. Down state clears only after the door accepts the raised player, and unraised dead accounts reconnecting inside the window wait busy at the door. `ONLINE_RESPAWN_SECONDS = 60` in `src/ui/deathScreen.js` stamps the slot timestamp once at death.
- **Regen Hold (`src/worldEvents/courtRules.js`, `src/worldEvents/courtRulesDoor.js`, `src/characters/madeLevel.js`):** Natural regeneration holds during a made-level pause via `regenShare` with a per-body carried fraction.
