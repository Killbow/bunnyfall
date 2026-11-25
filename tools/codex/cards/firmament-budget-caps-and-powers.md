---
slug: firmament-budget-caps-and-powers
title: "Firmament Budget: Channel Caps, Group Caps, and When Powers Sleep"
domain: combat
kind: subcard
parent: firmament-overview
files:
  - src/net/firmament/firmamentLaw.js
  - src/characters/firmamentPowers.js
  - src/characters/firmamentLive.js
  - src/characters/entityMods.js
  - src/characters/statMods.js
  - src/characters/renownLayer.js
  - src/world/wildWorld.js
  - src/world/siegeWorld.js
  - src/net/onlineWorld.js
  - src/party/partyWorld.js
  - src/items/sigil.js
  - src/systems/naval/comeSailAway.js
  - src/net/siegeRef.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Firmament.md"
related:
  - firmament-overview
  - integrity-pvp-duel-and-wild-referees
  - naval-and-come-sail-away
invariants:
  - "`STAT_DEFS` caps: each attribute +15, combat skill +15, `spellPower` +30, `castCost` 25, `castSpeed` +15, `blowTaken` min -15, `hp`/`mp` +75, `evade` 10."
  - "`blowPct`: weapon/melee/family/enemy-kind channels capped at `BLOW_CAP` 30 (floor `BLOW_FLOOR` -20), then unaware/wounded added, total capped at `BLOW_TOTAL_CAP` 50."
  - "`castCostPct` caps gains at `CAST_COST_CAP` 25 and only counts a school channel when every effect is that school."
  - "`treeStats` caps gains first, then pays keystone prices (stored under the `PRICES` symbol) so prices always bite."
  - "`firmamentFold` caps raw + percent share together via `capAt`; positive attribute gains also lift `mods.statMax` (FIRM-MAX), read in `statMods.js`."
  - "`firmamentAwake` requires my own entity, tree in force (online with a sign), not `sigilDueling()`, not `_mentor`; `firmStat` returns 0 while mentoring."
traps:
  - "Wrothgarian and siege strikes or spells at players are rolled inside `withoutFirmament` (`wildWorld.js`, `siegeWorld.js`, `onlineWorld.js`); stars still act against PvE beasts."
  - "`firmamentBlow` skips player targets, and `firmamentKill` ignores players, peers, city watch, and allies."
  - "Siege movement stays held by `SIEGE_SPEED` (18 m/s) in `siegeRef.js` regardless of Speed lifted past 100."
dfu: []
tags:
  - firmament
  - caps
  - pve-balance
  - pvp-isolation
  - mentoring
---

# Firmament Budget: Channel Caps, Group Caps, and When Powers Sleep

`src/net/firmament/firmamentLaw.js`, `src/characters/firmamentPowers.js`, and `src/characters/firmamentLive.js` enforce per-channel stat caps, apply keystone prices after capping, and suspend combat passives during mentoring, duels, and PvP hits.

- **Channel Caps and Prices:** `STAT_DEFS` caps each attribute at `+15`, combat skills at `+15`, `spellPower` at `+30`, `castCost` at `25`, `castSpeed` at `+15`, `blowTaken` at a `-15` floor, `hp` and `mp` at `+75`, `evade` at `10`, and life `sailSpeed` at `+15` (feeding `firmSail` in `comeSailAway.js`). `treeStats` caps positive gains first and then subtracts keystone penalties stored under `PRICES`. `firmamentFold` clamps combined raw and percent shares via `capAt`, lifts `mods.statMax` for positive attributes in `statMods.js`, and layers health and magicka via `setOnlineLayerExtra`.
- **Group Damage and Cast Caps:** `blowPct` clamps weapon, melee, family, and enemy-kind damage channels to `BLOW_CAP` (`30`, floor `BLOW_FLOOR` `-20`) before adding unaware and wounded bonuses up to `BLOW_TOTAL_CAP` (`50`). `castCostPct` caps reduction at `CAST_COST_CAP` (`25`) and applies a school bonus only when every spell effect belongs to that school.
- **Sleep and PvP Isolation:** `firmamentAwake` requires the local player entity with an active online sign, neither `sigilDueling()` nor mentoring (`setFirmamentMentoring` from `playerEntity._mentor` in `partyWorld.js`, where `firmStat` returns `0`). Player-targeted hits in `wildWorld.js`, `siegeWorld.js`, and `onlineWorld.js` run inside `withoutFirmament`; `firmamentBlow` skips players, `firmamentKill` ignores players, peers, city watch, and allies, and `SIEGE_SPEED` (`18` m/s) still clamps siege speed.
