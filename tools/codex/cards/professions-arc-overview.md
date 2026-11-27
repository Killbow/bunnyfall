---
slug: professions-arc-overview
title: "Online Professions: Tracks, XP, Stores, and Gates"
domain: economy
kind: overview
parent: null
files:
  - src/net/professionLaw.js
  - src/net/recipeLaw.js
  - src/net/craft/craftLaw.js
  - src/net/profBook.js
  - server-account/src/professions.js
routes:
  - /v1/prof/state
  - /v1/prof/spec
  - /v1/prof/focus
  - /v1/stores/deposit
  - /v1/stores/withdraw
tables:
  - prof_tracks
  - prof_stores
  - prof_choices
  - prof_withdrawals
  - prof_deposits
  - prof_focus
  - prof_focus_change
  - prof_focus_paid
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
  - professions-marks-and-silver-finds
  - professions-board-and-writs
  - professions-market-auctions-and-orders
  - professions-gathering-nodes-and-motherlodes
  - professions-crafting-provenance-and-master-art
invariants:
  - "Rank runs 0–100 and `xpForRank(n)` is `10 * n * n` (`PROF_XP_MAX = 100,000`); `TIER_RANKS` is `[0, 10, 25, 40, 55, 70, 90]`."
  - "`harvestXp` is `15 * tier`, with +50% for clean harvests, and is quartered when the tier falls more than two below the rank's top tier; `writXp` is `2 * pay`."
  - "`STORES_MAX` caps each material at 5,000 units across all origins (`own`, `bought`, `gold`, and `loose`)."
  - "Specializations open at ranks 50 (`JOURNEYMAN_RANK`) and 100, offering `SPEC_TRIAL_S` (86,400 s) of free changes before `RESPEC` costs 1,000 Marks with a 7-day lock."
  - "`PROF_OPS_MAX` limits profession mutations to 3,600 per hour per account."
traps:
  - "There is no two-above-Journeyman XP cap: `craftLimitOf` allows every track to reach `PROF_XP_MAX`, while crafting specialization uses Focus (`FOCUS_MAX = 2`) in `src/net/craft/craftLaw.js`."
  - "`FIRST_MAKE_SHARE` is 0 on every track, so first-make bonuses pay 0 XP and progression speed relies on `CRAFT_PACE` multipliers."
tags:
  - professions
  - xp
  - stores
  - focus
  - specialization
---

Online professions (`src/net/professionLaw.js`, `src/net/profBook.js`, and `server-account/src/professions.js`) govern five gathering tracks and five crafting tracks: Smithing, Building, Outfitting, Provisioning, and Enchanting.

## Ranks, Pace, and Focus

Ranks run 0–100 (`xpForRank(n)` is `10 * n * n`, `PROF_XP_MAX` 100,000, `JOURNEYMAN_RANK` 50) across seven tiers (`TIER_RANKS` `[0, 10, 25, 40, 55, 70, 90]`). Service writes clamp every craft, smelt, temper, brew, and disenchant via `creditedXp` to `MAX(0, MIN(earned, cap - held))`. Gathering XP (`harvestXp` is `15 * tier`, +50% clean, quartered more than two tiers below the rank's top tier) and writ XP (`writXp` is `2 * pay`) are unscaled. Crafting uses `CRAFT_PACE` (`smithing` 5.74, `outfitting` 8.25, `building` 5.6, and `provisioning` 4.33) in place of `FIRST_MAKE_SHARE` (0 in `src/net/recipeLaw.js`).

Every track reaches `PROF_XP_MAX` (`craftLimitOf`). Characters pledge up to two non-Provisioning `FOCUS_TRACKS` (`FOCUS_MAX` 2, `/v1/prof/focus` across `prof_focus`, `prof_focus_change`, and `prof_focus_paid`), paying `FOCUS_CHANGE_MARKS` (100 Marks) to drop one. Non-Focus tracks earn half XP (`FOCUS_XP.other` 0.5) from `FOCUS_HALF_RANK` (50) and cap at Superior (`NON_FOCUS_QUALITY_MAX` 3).

## Specializations, Stores, and Subcards

Specializations (`/v1/prof/spec`, `prof_choices`) unlock at ranks 50 and 100 with a 24-hour free swap window (`SPEC_TRIAL_S` 86,400 s), then `RESPEC` costs 1,000 Marks with a 7-day lock. `/v1/prof/state`, `/v1/stores/deposit`, and `/v1/stores/withdraw` manage `prof_tracks`, `prof_stores` (`STORES_MAX` 5,000), `prof_deposits`, and `prof_withdrawals` under `PROF_OPS_MAX` (3,600/h).

- `professions-marks-and-silver-finds`: Marks ledger, faucets, bank, and silver finds.
- `professions-board-and-writs`: notice boards, writs, and commissions.
- `professions-market-auctions-and-orders`: listings, buy orders, couriers, and auctions.
- `professions-gathering-nodes-and-motherlodes`: node caps, fishing, glows, and Motherlodes.
- `professions-crafting-provenance-and-master-art`: provenance, repair, reforging, alchemy, and Master-Art.
