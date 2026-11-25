---
slug: raiding-parties-day-roll-and-spawning
title: "Raid Day Roll, Raider Spawning, Town Defenders, and Cleanse Reputation"
domain: world
kind: subcard
parent: raiding-parties-overview
files:
  - src/worldEvents/raidingParties.js
  - src/net/raidLaw.js
  - src/characters/cityGuards.js
  - src/net/renownTracker.js
  - src/world/worldTick.js
routes: []
tables: []
replacesBible:
  - "03-World/Raiding-Parties.md"
related:
  - raiding-parties-overview
  - raiding-parties-relay-ledger-and-receipts
invariants:
  - "rollRaidTowns draws in IL order (region, town, start, party, target) and strikes each picked town off the list, so a town is raided at most once per day."
  - "Cleanse reward requires a player strike on a raider (renownStruckAt) and standing on the town's map pixel; any death, including the watch kills, counts toward the target."
  - "During an active raid in town, playerSpares/playerSparesPerson make player blows pass defenders, town guards, and townspeople by, regardless of the friendly-protection setting."
traps:
  - "Spawn clocks run on frame time (paused with the game), not real time."
  - "Nothing is announced or withdrawn at sea (politic 64 read as region 31, unmapped as 0)."
  - "The previous day's raids are expired before the new roll so a raid ending at 00:00 still gets its withdrawn notice."
  - "Exterior jump sweeps must call raidPoolCleared so standing caps do not count removed raiders or defenders."
dfu: []
tags:
  - raids
  - spawning
  - town-watch
  - reputation
  - day-roll
---

# Raid Day Roll, Raider Spawning, Town Defenders, and Cleanse Reputation

`rollRaidTowns` (`src/net/raidLaw.js`) builds the daily raid slate from `raidRegions` (`MAPS.BSA` rows paired with `TRAV0I01.IMG` picker pixels at `128 + region`) across eligible `RAID_TOWN_TYPES` (`city`, `village`, and `hamlet`). Before rolling a new day, `src/worldEvents/raidingParties.js` expires prior raids so midnight endings still announce their withdrawal.

- **Parties and kill targets:** `rollRaidTowns` draws region, town, start minute, party, and kill target (`RAID_KILLS_MIN` `15` to `RAID_KILLS_MAX_EXCLUSIVE` `26`, or `15` to `25` deaths) in order, striking each picked town so it is raided at most once per day. `chooseRaider` picks `Knight` for knights, `Rogue` (`50`), `Thief` (`30`), or `Burglar` (`20`) for bandits, and `Orc` (`70`), `Sergeant` (`25`), or `Warlord` (`5`) for orcs.
- **Frame-time spawning (`src/world/worldTick.js`):** One spawn is in flight at a time on frame clocks: a raider every `SPAWN_INTERVAL` `1` to `10` s (orcs `1` to `ORC_SPAWN_INTERVAL_MAX_S` `8` s) below `MAX_RAID_ENEMIES` (`25`), and a defender (`src/characters/cityGuards.js`) every `1` to `10` s below `MAX_RAID_DEFENDERS` (`8`). Placements land `RAID_SPAWN_MIN_DISTANCE` (`10`) to `RAID_SPAWN_MAX_DISTANCE` (`35`) out of view (`PENDING_TIMEOUT_S` `8`, `PENDING_BACKOFF_S` `10`). After a raid ends, raiders stand down once outside view plus `SIGHT_MARGIN_DEGREES` (`10`) on `ACTOR_SWEEP_S` (`3`).
- **Cleanse and reputation:** Every raider death counts toward the target, while player credit requires a recorded strike (`renownStruckAt` in `src/net/renownTracker.js`) on the town pixel. `grantRaidReputation` awards `+5` regional legal (`RAID_LEGAL_REP`), `+5` People (`RAID_PEOPLE_REP`), `+3` knightly order (`RAID_ORDER_REP`), and `+3` Fighters Guild (`RAID_GUILD_REP`).
