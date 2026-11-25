---
slug: raiding-parties-kinds-and-held-towns
title: "Raid Kinds (Classic, Waves, Defend, Escort), Held Towns, and Raid Spoils"
domain: world
kind: subcard
parent: raiding-parties-overview
files:
  - src/worldEvents/raidKinds.js
  - src/worldEvents/raidingParties.js
  - src/worldEvents/raidSitesHost.js
  - src/worldEvents/raidSpoils.js
  - src/items/aetheric.js
  - src/world/raidsWardenWorld.js
  - src/travel/wagon/wagonWardenHost.js
  - src/characters/cityGuards.js
routes: []
tables:
  - raid_spoils
replacesBible:
  - "03-World/Raiding-Parties.md"
related:
  - raiding-parties-overview
  - raiding-parties-relay-ledger-and-receipts
  - aetheric-sets-and-set-powers
invariants:
  - "raidKindOf hashes (FNV-1a) the raid key, start, target, and party over RAID_KIND_ORDER [classic, waves, defend, escort], so the relay roll check is unchanged."
  - "Objective state only moves forward: foldObjective keeps the highest wave, leader fall, sacked flag, and refugees saved and lost."
  - "The kind never changes the count or the cleanse; it only changes how raiders stand and whether the town is held."
traps:
  - "The Standard-Bearer (guard flag `raidBearer`) is excluded from the defender count and ignores the player's crimes."
  - "A defend raid counts as held only if the standard was seen standing within RAID_STANDARD_FRESH_MS 60000 at the cleanse."
  - "Square or way lookups retry every RAID_SITE_AGAIN_S 5; a wave whose count stalls RAID_WAVE_STALL_S 120 stands again."
dfu: []
tags:
  - raids
  - raid5
  - waves
  - escort
  - aetheric-set
  - spoils
---

# Raid Kinds (Classic, Waves, Defend, Escort), Held Towns, and Raid Spoils

`raidKindOf` (`src/worldEvents/raidKinds.js`) hashes a raid's key, start minute, target, and party with FNV-1a over `RAID_KIND_ORDER` (`classic`, `waves`, `defend`, and `escort`). The kind leaves the relay kill count unchanged while determining how raiders stage (`src/worldEvents/raidingParties.js`) and whether the town qualifies as held (`raidHeld`).

- **Sites and objectives (`src/worldEvents/raidSitesHost.js`):** Built towns resolve through `wardenTownOfPixel` (`src/world/raidsWardenWorld.js`, `src/travel/wagon/wagonWardenHost.js`), picking a town square from livingWorld places or `gridStreets` components of at least `RAID_STREETS_MIN` (`400`) cells and retrying every `RAID_SITE_AGAIN_S` (`5` s). `foldObjective` advances wave index, leader fall, sacked status, and refugee counts monotonically.
- **Waves, Defend, and Escort:** In `waves`, `RAID_WAVES_FOR(tg)` plans `4` waves when `tg >= 21` (else `3`); `raidWavePlan` splits `tg - 1` deaths into packs of `RAID_WAVE_PACK_MIN` (`5`) to `RAID_WAVE_PACK_MAX` (`8`) with `RAID_WAVE_BREATHER_S` (`12` s) breathers and `RAID_WAVE_STALL_S` (`120` s) stall retries before a two-trait (`RAID_LEADER_TRAITS`) leader (`Knight-Captain`, `Bandit Chief`, or `Orc Warlord`). In `defend`, `standBearer` (`src/characters/cityGuards.js`) spawns a `raidBearer` with `RAID_BEARER_HEALTH_X` (`8`) health and `RAID_BEARER_LEASH_M` (`4` m) leash (`RAID_STANDARD_FRESH_MS` `60000` ms). `escort` holds when saved refugees reach `RAID_REFUGEES_HOLD`.
- **Held bonus and spoils (`src/worldEvents/raidSpoils.js`):** `rollRaidSpoils` grants `RAID_SPOILS_GOLD_PER_LEVEL` (`80`, seeded `0.8` to `1.2`x), one Magic-or-better item, and a roll on the party Aetheric set (`src/items/aetheric.js`: Broken Oath, Thief-Taker's Garb, or Orcsbane Harness). Holding a town adds `+3` legal and `+3` People reputation (`grantRaidHeldReputation`, `RAID_HELD_REP`), `RAID_HELD_GOLD_X` (`1.5`x) gold, and an extra Magic-or-better item, gated once per account via `raid_spoils.cid`.
