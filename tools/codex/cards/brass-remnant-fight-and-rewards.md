---
slug: brass-remnant-fight-and-rewards
title: "Brass Remnant Fight, Endings and Omens, Receipts, and Honours"
domain: multiplayer
kind: subcard
parent: abyss-dungeons-overview
files:
  - src/net/sdRemnant.js
  - src/net/sdStrike.js
  - src/net/sdMarks.js
  - src/net/bossSeam.js
  - src/net/sdReceipt.js
  - src/worldEvents/sdSpoilsRoll.js
  - src/items/aetheric.js
  - server-account/src/sds.js
  - server/src/index.js
  - src/worldEvents/sdRemnant.js
  - src/net/gateBrain.js
routes:
  - "/v1/sd/claim"
  - "/v1/account"
tables:
  - sd_kills
  - players
replacesBible:
  - "11-Multiplayer/Super-Dungeons.md"
related:
  - shattered-hour-orrery-and-steps
  - abyss-dungeons-overview
invariants:
  - "Account honours (`Hourbreaker` and `The Turning Hour`) roll exclusively on the account server during the first `sd_kills` insert for `(slot, account)` using a server-drawn seed."
  - "Inbound client `sd` kinds are restricted to `SD_KINDS` (`found`, `pz`, `in`, `hit`, `ehit`, `xhit`, `spent`, `vt`, and `rz`), while `ev`, `rcpt`, `st`, `mv`, `atk`, `hp`, `ph`, `ec`, `cx`, `cxh`, `cxb`, `stun`, `fell`, `lost`, and `no` are outbound or internal."
  - "Client `remnantOpenAt` and `heartsOpenAt` (`src/worldEvents/sdRemnant.js`) mirror the relay's `remnantOpen` and `heartsOpen` (`src/net/sdRemnant.js`) on the client fight state, so a change to one check must reach the other."
  - "Bodies one attack hits in the same frame share one blow sequence `q`, which `spendBlow` (`src/net/gateBrain.js`) charges as a single blow (within `BLOW_GROUP_MS`, at most `BLOW_BODIES_MAX` bodies). A repeat hit on a body already hit opens a new sequence."
traps:
  - "Standing on top of a pillar (feet at or above `SD_PILLAR_OVER_Y = SD_PILLAR_H - 0.5`) grants no shade from the Hour-Hand beam, and Gearward triggers only on direct boss or Echo blows."
  - "Guests earn `h1` receipts and local spoils, but honours roll only if they register an account and claim within the 7-day receipt window."
  - "`rollSdSpoils` draws from one stream seeded by the receipt seed, and `sdSpoilsList` draws pictures from a second. A new draw in either must go after the existing ones, or every existing seed yields different spoils or pictures."
tags:
  - super-dungeons
  - boss
  - brass-remnant
  - rewards
  - receipts
---

The Brass Remnant (`src/net/sdRemnant.js`, `newRemnantFight`, `stepRemnant`) adds `SD_TTK_S` (420 seconds) times `dpsRef(lv)` times `SD_SHARE_X` (1.25) HP per fighter. Arenas cap at `SD_FIGHTERS_MAX` (256), with `SD_GUEST_SEATS` (64 in `server/src/index.js`) for guests. Poses expire after `SD_POSE_FRESH_MS` (25 seconds), and empty fights reset after `SD_LOST_MS` (30 seconds).

## Phases, Endings, and Omens

After `SD_OPENING_MS` (8 seconds), phases run 100% to 70%, 70% to 35% (`SD_ECHOES` = 2 Echoes paired within `SD_ECHO_PAIR_MS` = 15 seconds, Blades 10 seconds), and 35% to 0%. `sdMarksOf` (`src/net/sdMarks.js`) maps a 216-slot cycle of `SD_ENDINGS` (6 Endings) and 36 pairs from `SD_OMENS` (9 Omens).

Pulse fires every `SD_PULSE_EVERY_MS` (30 seconds, Underking 22 seconds) from 12% (`SD_PULSE_PCT`), stepping by 2% (`SD_PULSE_STEP`, doubled by Restless Pulse) to 75% (`SD_PULSE_MAX`). Every `SD_RESET_EVERY_MS` (50 seconds, Unending 40 seconds), 3 to 8 Hearts (`SD_HEARTS`) spawn; unbroken Hearts heal 8% (`SD_RESET_HEAL`) and deal 70% (`SD_RESET_PCT`). At `SD_ENDS_MS` (15 minutes, Short Hour 12 minutes), Hour Ends deals 99% (`SD_END_PCT`) every `SD_END_EVERY_MS` (2 seconds). Clients judge blows via `sdBlowVerdict` (`src/net/sdStrike.js`).

## Receipts, Spoils, and Honours

Qualifying fighters (`SD_EARNED`: `dealt` or `stood`) receive a signed `SD_RECEIPT_V` (`h1`) receipt valid for `SD_RECEIPT_TTL_S` (7 days, `src/net/sdReceipt.js`, swept via `sweep:sdrc`). Spoils (`src/worldEvents/sdSpoilsRoll.js`) pay `SD_SPOILS_GOLD_PER_LEVEL` (400) gold per level (0.8 to 1.2), tier 24 luck 70 gear with 25% `SD_SPOILS_LEGENDARY`, 1/3 `NUMIDIUM_SET_CHANCE` (`rollNumidiumPiece`), and 1/100 `GILDED_CHANCE` (`rollHourlock`).

`POST /v1/sd/claim` (`claimSd` in `server-account/src/sds.js`) writes `sd_kills` once per `(slot, account)` and runs `sdHonoursRoll` for `SD_TITLE_CHANCE` (1/4 `Hourbreaker`, bit 1) and `SD_AURA_CHANCE` (1/8 `The Turning Hour`, bit 2) in `players.sd_honours`.
