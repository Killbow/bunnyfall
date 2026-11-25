---
slug: boss-traits-carriers-wire-and-hud
title: "Boss Traits: Carriers, Wire Fields, and Target Frame"
domain: combat
kind: subcard
parent: boss-traits-overview
files:
  - src/characters/eliteFoes.js
  - src/characters/foeTraitsHost.js
  - src/net/wire.js
  - src/scenes/dungeonContext.js
  - src/worldEvents/raidingParties.js
  - src/worldEvents/raidKinds.js
  - src/systems/hunt/namedMark.js
  - src/guilds/huntersMark.js
  - src/systems/eliteGates/egFight.js
  - src/ui/hudFoeTarget.js
  - src/ui/enhancedHud.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Boss-Traits.md"
related:
  - boss-traits-overview
  - boss-traits-striker-and-owner-halves
  - raiding-parties-kinds-and-held-towns
  - bounty-hunt-ledger-marks-and-mastery
  - elite-breach-lords-seam-and-vestiges
  - integrity-boss-body-ledger
invariants:
  - "An elite gets 1 trait (eliteTraits). Dungeon elites draw off eliteSeed from pickDungeonElites so every client rolls the same trait."
  - "Raid leaders get RAID_LEADER_TRAITS = 2. Named hunt marks get HUNT_MARK_TRAITS = 2, from a week-and-tier seed."
  - "Relay bosses and Spire lords get striker traits only: one from ELEMENT_TRAITS and one from RELAY_BOSS_BLOW_TRAITS, seeded by name and kind (relayBossTraits). They never get warded, curbing or wrathful."
  - "A puppet only takes bt when it is elite (z=1 promotes it via promoteEliteFoe). Readers cap the mask at 1, or 2 for a raid leader."
traps:
  - "validFoeRecord rejects bt outside 0..FOE_TRAITS_MAX (0x7ff, held equal to BOSS_TRAIT_MASK_MAX), bv outside 0..100, and bw/rl/z values other than 0 or 1."
  - "traitsAuthority on a room handoff keeps a ward standing from its last shown share (bossWardShown), and a copy that is only drawn keeps no ward."
dfu: []
tags:
  - boss-traits
  - wire
  - hud
  - elites
  - relay-bosses
---

# Boss Traits: Carriers, Wire Fields, and Target Frame

Boss traits are assigned deterministically across elites, raid leaders, hunt marks, relay bosses, and Spire lords, synchronized over enemy wire records, and rendered in the HUD target frame.

- **Carrier Assignment (`src/characters/eliteFoes.js`, `src/scenes/dungeonContext.js`, `src/worldEvents/raidingParties.js`, `src/systems/hunt/namedMark.js`, `src/systems/eliteGates/egFight.js`):** Standard elites receive `1` trait via `eliteTraits`, with dungeon elites drawing from `eliteSeed` in `pickDungeonElites` so all peers roll the same trait. Raid leaders roll `RAID_LEADER_TRAITS` (`2`), and named hunt marks roll `HUNT_MARK_TRAITS` (`2`) from a week-and-tier seed. Relay bosses (`gateBossBody`) and Spire lords (`hostLordTraits`) draw `relayBossTraits` seeded by name and kind (one from `ELEMENT_TRAITS` and one from `RELAY_BOSS_BLOW_TRAITS`), receiving striker traits only (never `warded`, `curbing`, or `wrathful`) and announcing `bossTraitsMetLine` once.
- **Wire Synchronization and Handoff (`src/characters/foeTraitsHost.js`, `src/net/wire.js`):** `traitWire` and `readTraitWire` serialize `bt` (trait mask), `bw` (`1` while wrathful), `bv` (ward share `0-100` from `bossWardShare`), and `rl` (raid leader). `validFoeRecord` rejects `bt` outside `0..FOE_TRAITS_MAX` (`0x7ff`), `bv` outside `0..100`, or non-binary `bw`, `rl`, and `z`. A remote puppet applies `bt` only when `z=1` promotes it through `promoteEliteFoe`, capping the mask at `1` (`2` for raid leaders). On room handoff, `traitsAuthority` preserves the standing ward from `bossWardShown`, while non-authority copies hold no ward.
- **Target Frame HUD (`src/ui/hudFoeTarget.js`, `src/ui/enhancedHud.js`):** The enemy target frame displays `bossTraitWords`, a rule tooltip via `bossTraitRules`, and the live ward bar from `bossWardNow` on `bossClockS`.
