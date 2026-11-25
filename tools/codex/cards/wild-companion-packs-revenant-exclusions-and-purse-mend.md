---
slug: "wild-companion-packs-revenant-exclusions-and-purse-mend"
title: "Wild-Zone Companion Pack Drops, Revenant Exclusions, and Staff Purse Mend"
domain: "economy"
kind: "subcard"
parent: "enchantment-side-once-duel-vitality-and-questor-notices-overview"
files:
  - "src/world/wild/wildDropLaw.js"
  - "src/world/wild/wildLeaf.js"
  - "src/player/wildDeath.js"
  - "server-account/src/wild.js"
  - "src/systems/naval/crewCompanions.js"
  - "src/revenants/revenantCompanions.js"
  - "src/revenants/revenant.js"
  - "src/systems/eliteGates/weirKey.js"
  - "src/systems/eliteGates/weirKeyRow.js"
  - "src/saves/save.js"
  - "src/items/itemBound.js"
  - "server-account/src/review.js"
  - "src/net/repairLaw.js"
  - "src/guilds/guildServiceActions.js"
  - "src/ui/reforgeWindow.js"
routes:
  - "/v1/mod/realm-mend"
tables:
  - "wild_falls"
  - "realm_repairs"
  - "realm_characters"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19f.md"
related:
  - "enchantment-side-once-duel-vitality-and-questor-notices-overview"
  - "wild-zone-pvp-death-drops-and-remains"
  - "elite-breach-weir-key-and-stakes"
  - "revenant-lairs-thefts-and-companions"
  - "economy-arc-found-mark-and-mend-resale"
invariants:
  - "A Wild Zone death collects packs from ashore crew companions and the first `WILD_REVENANTS_MAX` (`1`) sworn revenant at the player side (`wildSwornAtSide`, `wildPacksOf`), refusing pack takes without `packs === WILD_FALL_PACKS` (`1`) when `wildTakesPacks` applies."
  - "`revenantMayTake` excludes `WILD_NEVER_GROUPS` (`Transportation`, `Deeds`, `QuestItems`, `Currency`), `DECOR_OWN_KEPT_BACK`, and `BOAT_TEMPLATES`, while `ensureMirror` restores previously taken excluded items."
  - "The Weir Key row sets `packOnly: true` (`BOUND_KEEPS = ['wagon', 'storage']` in `src/items/itemBound.js`), and `restorePlayer` folds stray copies via `foldStrayWeirKeys`."
  - "Staff `/v1/mod/realm-mend` (`server-account/src/review.js`) runs `purseMendOf` and `applyPurseMend` (`src/net/repairLaw.js`) to zero negative purses, log `realm_repairs`, and lift `PURSE_SIG` holds."
traps:
  - "wildLeaf.js has zero imports so revenant modules never pull itemLaw into client graphs; keep it a leaf."
  - "A realm_repairs row with no faction is a purse mend; a faction repair always names one."
dfu: []
tags:
  - "wild-zone"
  - "companions"
  - "revenants"
  - "weir-key"
  - "staff"
  - "gold"
---

# Wild-Zone Companion Pack Drops, Revenant Exclusions, and Staff Purse Mend

Wild-zone companion pack drops, revenant theft exclusions, Weir Key pack binding, and staff purse mends span `src/world/wild/wildDropLaw.js`, `src/revenants/revenant.js`, `src/items/itemBound.js`, and `src/net/repairLaw.js`.

- **Companion pack drops in the Wild Zone:** On a PvP fall (`src/player/wildDeath.js`, `src/world/wild/wildDropLaw.js`, `server-account/src/wild.js`), `wildSwornAtSide` and `wildPacksOf` gather packs from ashore crew (`src/systems/naval/crewCompanions.js`) and up to `WILD_REVENANTS_MAX = 1` sworn revenant at the player side (`src/revenants/revenantCompanions.js`). When `wildTakesPacks` applies, `/v1/wild/fall` records `wild_falls` and rejects pack takes unless `packs === WILD_FALL_PACKS` (`1`).
- **Revenant exclusions and Weir Key folding:** `src/world/wild/wildLeaf.js` remains an import-free leaf module so `src/revenants/revenant.js` checks `revenantMayTake` against `WILD_NEVER_GROUPS` (`Transportation`, `Deeds`, `QuestItems`, `Currency`), `DECOR_OWN_KEPT_BACK`, and `BOAT_TEMPLATES` without pulling `itemLaw` into client graphs, while `ensureMirror` returns previously taken excluded pieces. The Weir Key (`src/systems/eliteGates/weirKey.js`, `src/systems/eliteGates/weirKeyRow.js`) sets `packOnly: true` against `BOUND_KEEPS = ['wagon', 'storage']` (`src/items/itemBound.js`), and `restorePlayer` (`src/saves/save.js`) consolidates stray copies via `foldStrayWeirKeys`.
- **Staff purse mend and 64-bit gold math:** Staff calls to `/v1/mod/realm-mend` (`server-account/src/review.js`) invoke `purseMendOf` and `applyPurseMend` (`src/net/repairLaw.js`) to zero negative `realm_characters` purses, write `realm_repairs` rows with no faction, and clear `PURSE_SIG` holds. `cureOfferMessageOffset` (`src/guilds/guildServiceActions.js`) uses `Math.floor` division, and `src/ui/reforgeWindow.js` displays `totalGoldAmount` without 32-bit truncation.
