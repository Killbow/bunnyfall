---
slug: collections-wardrobe-catalogue-and-availability
title: "Wardrobe Catalog: Sources, Availability, and Scope"
domain: ui
kind: subcard
parent: collections-page-and-parts
files:
  - src/ui/collections/wardrobeCatalogue.js
  - src/net/townSeatLaw.js
  - server-account/src/titles.js
  - server-account/src/seatTurning.js
  - server-account/src/egHonours.js
routes: []
tables:
  - players
replacesBible:
  - "10-UI/Collections.md"
  - "01-Overview/audits/Audit-Collections-II.md"
related:
  - collections-page-and-parts
  - collections-account-read-and-wear-flow
  - account-titles-glyphs-and-play-clock
  - chapters-contested-seats-and-titles
  - questlines-service-claims-titles-and-weir-key
invariants:
  - "The catalog (`WARDROBE`, kinds `WARDROBE_KINDS`) lists every title, aura, icon, and glyph with its source, availability, and how it is obtained, whether held or not; the account service decides what is owned."
  - "`wardrobeCounted` excludes `via` entries and `scope: 'character'` entries from counts; `wardrobeKnown` is false for character-scoped entries."
  - "High Master (`highmaster`, `via: 'chaptermaster'`) is held exactly when Chapter Master is held, is never worn on its own, and is not counted."
  - "Seat glyphs (`tower`, `crownDF`, `crownWR`, `crownSN`) are `PER_CHARACTER`: minted beside the character's name through `seatGlyphsOf` and never stored in the account wardrobe."
traps:
  - "`AVAIL_NOW` is open, chance, ranked, seasonal, and patron; dormant entries such as Apostle and the chapter titles stay listed as 'Not yet available'."
  - "Crowned and Keeper are earnable only from Season 1 on (`seasonTitles`: Season 0 crowns no one)."
  - "The sprout title is `auto`: given to accounts for their first two weeks (`SPROUT_S`). Guests hold no derived titles."
dfu: []
tags:
  - collections
  - wardrobe
  - titles
  - auras
  - glyphs
  - icons
  - catalog
---

# Wardrobe Catalog: Sources, Availability, and Scope

`src/ui/collections/wardrobeCatalogue.js` defines `WARDROBE` across `WARDROBE_KINDS` (`title`, `aura`, `icon`, and `glyph`), pairing client metadata with server ownership computed in `server-account/src/titles.js` (`titlesHeld`, `aurasHeld`, `iconsHeld`, and `glyphsOf` over `players`), `server-account/src/seatTurning.js`, and `server-account/src/egHonours.js`.

- **Availability Tiers**: `WARDROBE_AVAIL` classifies entries as `open`, `chance`, `ranked`, `seasonal`, `offseason`, `patron`, `dormant`, `auto`, `staff`, `bestowed`, `closed`, or `retired`. `AVAIL_NOW` groups `open`, `chance`, `ranked`, `seasonal`, and `patron` as currently obtainable, whereas `dormant` entries (such as Apostle and chapter titles) display `'Not yet available'`.
- **Counting, Derived Entries, and Character Scope**: `wardrobeCounted` excludes `via` entries and `scope: 'character'` entries from totals, and `wardrobeKnown` returns false for character-scoped rows. High Master (`highmaster`, `via: 'chaptermaster'`) mirrors Chapter Master ownership, cannot be equipped independently, and is excluded from totals. Seat glyphs (`tower`, `crownDF`, `crownWR`, and `crownSN` in `src/net/townSeatLaw.js`) carry `PER_CHARACTER` scope, render beside a character name via `seatGlyphsOf`, and never persist in the account wardrobe.
- **Rules and Constants**: Acquisition descriptions mirror live constants including `SD_TITLE_CHANCE`, `SERPENT_AURA_CHANCE`, `EG_REDOUBT_HONOURS` (Redoubt honors), `EG_CHAMPIONS_TOP`, `ARENA_CHAMPION_MIN_BOUTS`, `ARENA_CHAMPION_MIN_FOES`, `QL_SERVICE_LINES`, `PATREON_TIERS`, `FOUNDER_UNTIL`, `HEARTHKEEPER_GIVEN`, and `SOULCAKE_TAKEN`. `seasonTitles` awards Crowned and Keeper starting in Season 1 (Season 0 awards neither). New accounts automatically hold `sprout` (`auto`) during their first two weeks (`SPROUT_S`), while guests hold no derived titles.
- **Localization**: `TITLE_TEXT` and `AURA_TEXT` names remain in English, while glyph and icon labels pass through `t()`.
