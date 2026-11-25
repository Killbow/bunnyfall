---
slug: collections-page-and-parts
title: "Collections Page: Parts, Tiles, and Counts"
domain: ui
kind: overview
parent: null
files:
  - src/ui/collectionsPage.js
  - src/ui/collections/wardrobePart.js
  - src/ui/collections/wardrobeCatalogue.js
  - src/ui/collections/appearancesPart.js
  - src/ui/collections/gatheredPart.js
  - src/systems/hunt/gatheredLog.js
  - src/ui/enhancedMenu.js
routes:
  - /v1/account
tables:
  - players
replacesBible:
  - "10-UI/Collections.md"
related:
  - collections-wardrobe-catalogue-and-availability
  - collections-account-read-and-wear-flow
  - wardrobe-appearances-overview
  - account-titles-glyphs-and-play-clock
invariants:
  - "`collectionsPageShown` always returns true: the Holdings rail always shows the Collections page."
  - "`COLLECTION_PARTS` order is titles, auras, icons, glyphs, appearances, codex, cards, then `GATHERED_PARTS` (trophies, fish, annals); codex shows only while `lootRarityOn()` and cards only while `cardsPartShown(player)`."
  - "The page opens on `titles`; `setCollectionsPart` ignores unknown ids and `drawCollectionsPage` falls back to the first shown part when the current one is hidden."
  - "`partCount` returns `{ held, total }` with `held: null` for account-backed parts when no wardrobe has been read, which the tiles draw as a dash and an empty meter."
traps:
  - "Appearances, Trophies, and Fish are character-scoped (save data and `gatheredLog`); Annals reads account bits from `players.eg_annals` through the wardrobe."
  - "Horse coats are deliberately absent: stables keep current horses, not the coats a character has owned."
dfu: []
tags:
  - collections
  - ui
  - holdings
  - wardrobe
  - trophies
  - fish
  - annals
---

# Collections Page: Parts, Tiles, and Counts

`src/ui/collectionsPage.js` registers the `'collections'` section (`COLLECTION_PAGE_SECTIONS`) on the Holdings tab in `src/ui/enhancedMenu.js`. Because `collectionsPageShown` always returns true, the Collections page is always available and opens on `'titles'` by default.

- **Part Order and Visibility**: `COLLECTION_PARTS` orders `titles`, `auras`, `icons`, `glyphs`, `appearances` (`src/ui/collections/appearancesPart.js`), `codex`, `cards`, and `GATHERED_PARTS` (`trophies`, `fish`, and `annals` in `src/ui/collections/gatheredPart.js`). `WARDROBE_PARTS` (`src/ui/collections/wardrobePart.js` and `src/ui/collections/wardrobeCatalogue.js`) maps `titles` -> `title`, `auras` -> `aura`, `icons` -> `icon`, and `glyphs` -> `glyph`. The `codex` tile appears only while `lootRarityOn()` is true, and `cards` appears only while `cardsPartShown(player)` is true. `setCollectionsPart` ignores unknown ids, and `drawCollectionsPage` falls back to the first visible part if the active part is hidden.
- **Tiles and Counts**: `partCount` returns `{ held, total }` for each tile. Before `/v1/account` returns an account wardrobe, account-backed parts report `held: null`, rendering a dash and an empty progress meter.
- **Character versus Account Scope**: Appearances, Trophies, and Fish are character-scoped (`src/systems/hunt/gatheredLog.js` `noteGathered` records each haul count `n` and the UTC day of the first catch). Annals is account-scoped: `annalsHeldOf` reads one bit per page across the first 31 `EG_ANNALS` pages from `players.eg_annals`. Horse coats are omitted because stables track active mounts rather than historical coat ownership.
- **Styling**: Layout and theme rules combine `COLLECTION_PAGE_CSS`, `WARDROBE_PART_CSS`, `WARDROBE_THEME_CSS`, and `LOOKS_PART_CSS` over shared `FRAME_ROLES`.
