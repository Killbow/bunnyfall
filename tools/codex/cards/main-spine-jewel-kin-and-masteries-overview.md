---
slug: main-spine-jewel-kin-and-masteries-overview
title: "Main Spine Recovery, Jewel Kin, Masteries, and Court Deeds"
domain: systems
kind: overview
parent: null
files:
  - src/systems/quest/mainSpine.js
  - src/systems/quest/machine.js
  - src/systems/quest/questBridge.js
  - src/items/lootRarity.js
  - src/net/productRecord.js
  - src/professions/smithItems.js
  - server-account/src/profCraft.js
  - src/characters/masterSkills.js
  - src/systems/legacy/courtDeeds.js
  - src/systems/legacy/legacyHost.js
  - src/systems/legacy/marriage.js
  - src/systems/livingWorld/regardClock.js
routes:
  - /v1/prof/craft
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26d.md"
related:
  - peer-hull-pass-outside-pvp-zones
  - level-cap-45-and-latch-release
  - quests-macros-and-main-spine
  - legacy-courtship-and-online-wedding
  - professions-crafting-provenance-and-master-art
  - naval-and-come-sail-away
invariants:
  - "machine.js keepSpine runs every SPINE_CHECK_TICKS (30) quest ticks. spineOwed is true only when the opener began, no S0000999 has begun or is scheduled, and storyStarted is empty."
  - "spineRecord treats a saved S0000977 (SPINE_CURSE) or _BRISIEN as opened, so port births are owed a backbone but classic imports, which start no quests, are not."
  - "A backbone recorded as ran is never restarted, so royal letters are never sent twice."
  - "JEWEL_KIN = MIND_KIN (13) + HandToHand + CriticalStrike (15 skills). skillKin falls back to MIND_KIN when fists is false (records minted before MINT_V_JEWEL_KIN = 4)."
  - "craftMintVersion(asked) returns min(asked, MINT_VERSION) when asked >= MINT_V_JEWEL_KIN, otherwise MINT_V_LINES."
  - "MASTERY_SLOTS = { primary: 3, major: 2, minor: 1 }."
  - "Deed gate refusals (deedRefusal, again-today, gift without gold) return before heard() fires, so they change no regard, no affection, and no tone cost."
traps:
  - "Never read classic globals such as MetLadyBrisienna as proof the opener ran. Doing so re-seeded a backbone into every import."
  - "Regard day starts at 04:00 (REGARD_DAY_START_MIN = 240, regardDayOf), but courtship stamps use marriage.js dayOf, which starts at midnight. Do not merge the two clocks."
dfu: []
tags:
  - main-quest
  - jewelry
  - masteries
  - courtship
  - deeds
---

# Main Spine Recovery, Jewel Kin, Masteries, and Court Deeds

Main-quest backbone recovery, jewelry skill kinship, mastery slot allocation, and courtship deed gating span quest ticks, crafting provenance, character progression, and legacy interactions.

- **Main-spine recovery (`src/systems/quest/mainSpine.js`, `machine.js`, `questBridge.js`):** `GAME_START_QUESTS` starts `S0000977` (`SPINE_CURSE`) alongside `_BRISIEN` when their content switches are enabled. If a page reload occurs before `FACTION.TXT` finishes loading, parsing `S0000999` throws; `scheduleQuestByName` catches the error and `keepSpine` retries every `SPINE_CHECK_TICKS` (`30`) quest ticks whenever `spineOwed` holds. `spineRecord` treats a saved `S0000977` or `_BRISIEN` as opened while leaving classic imports untouched.
- **Jewelry kinship and craft mint version (`src/items/lootRarity.js`, `src/net/productRecord.js`, `src/professions/smithItems.js`, `server-account/src/profCraft.js`):** `JEWEL_KIN` extends `MIND_KIN` (`13` skills) with `HandToHand` and `CriticalStrike` (`15` skills total). `smithItems.js` passes `fists: at(MINT_V_JEWEL_KIN)` to `applyRarity`, and `craftMintVersion(asked)` on `/v1/prof/craft` clamps requests at or above `MINT_V_JEWEL_KIN` (`4`) to `MINT_VERSION` while mapping older values to `MINT_V_LINES` (`2`).
- **Mastery slots and court deeds (`src/characters/masterSkills.js`, `src/systems/legacy/courtDeeds.js`, `legacyHost.js`, `marriage.js`, `regardClock.js`):** `MASTERY_SLOTS` grants `{ primary: 3, major: 2, minor: 1 }`. Courtship deeds grant affection (`compliment` `3` plus `1` for liked tone, `gift` `6`, `embrace` `5`, `kiss` `8`), and any gate refusal returns before `heard()` runs.
