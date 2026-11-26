---
slug: "localization-translation-packs-and-dfu-documents"
title: "DFU Translation Packs, Fonts, Quests, Books, and Name Banks"
domain: "ui"
kind: "subcard"
parent: "localization-arc-overview"
files:
  - "src/ui/translationPacks.js"
  - "src/ui/translationStore.js"
  - "src/ui/localeData.js"
  - "src/ui/glyphFace.js"
  - "src/ui/localeFaces.js"
  - "src/ui/talkWindow.js"
  - "src/formats/textRsc.js"
  - "src/formats/rscTable.js"
  - "src/systems/quest/localizedQuest.js"
  - "src/systems/quest/quest.js"
  - "src/ui/localizedBook.js"
  - "src/ui/textDatabases.js"
  - "src/characters/nameHelper.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Localization-Arc.md"
related:
  - "localization-arc-overview"
  - "localization-text-core-and-locale-chain"
invariants:
  - "`classifyPackFile` reads a path from its LAST `Text` or `Fonts` folder, case-insensitive and with either slash direction, so nested zip folders still classify."
  - "Installed packs live in the IndexedDB database `daggerfall-translations` (`DB_NAME`, `src/ui/translationStore.js`), local to the player; pack text is never bundled unless its terms allow it (`locales/<tag>/pack/` + `PACK.json`)."
  - "Non-English TEXT.RSC reads go through `localeRscRow` (Internal_RSC by id or string key such as `9000.1`) before the classic binary; English skips the table."
  - "`parseFsJson` is looser than `JSON.parse`: it allows missing commas between values, trailing commas, and comments. Shipped `NameGen.txt` packs rely on this, so do not replace it with `JSON.parse`."
traps:
  - "A drafting language is offered only once a pack is installed or bundled for it (`hasLocaleText` in `src/ui/localeData.js`)."
  - "Quest `-LOC.txt` files populate `Internal_Quests` only where no row already exists; unparseable files log a warning and leave English quest text intact."
  - "`getNameBank` maps Argonian to the Imperial name bank, and any unknown race to Breton. The Argonian mapping looks like a bug but matches the original game."
dfu:
  - "Assets/Scripts/Game/LocalizedBook.cs"
tags:
  - "localization"
  - "translation-packs"
  - "indexeddb"
  - "fonts"
  - "quests"
  - "books"
---

# DFU Translation Packs, Fonts, Quests, Books, and Name Banks

Community DFU translation packs load from player zip archives into IndexedDB (`DB_NAME = "daggerfall-translations"` in `src/ui/translationStore.js`) or from redistributable `locales/<tag>/pack/` bundles with `PACK.json`.

- **Pack classification and gating:** In `src/ui/translationPacks.js`, `classifyPackFile` anchors at the last case-insensitive `Text` or `Fonts` segment across either slash direction, matching `Text/<Table>.csv`, `Text/Quests/<QUEST>-LOC.txt`, `Text/Books/<BOOK>-LOC.txt`, `Text/NameGen.txt`, `Text/<Name>.txt`, and `Fonts/FONT000N-SDF.ttf|otf|txt`. In `src/ui/localeData.js`, `hasLocaleText` exposes a `drafting: true` language only after a pack is installed or bundled for it.
- **RSC, quests, books, and text databases:** Non-English `TEXT.RSC` reads in `src/formats/textRsc.js` and `src/formats/rscTable.js` consult `localeRscRow` (`Internal_RSC` by numeric ID or subrecord key like `9000.1`) before the binary archive, while English reads the binary directly. Quest `-LOC.txt` files (`src/systems/quest/localizedQuest.js`, `src/systems/quest/quest.js`) fill missing `Internal_Quests` rows and warn without failing on malformed files. Books (`src/ui/localizedBook.js`), name banks (`src/characters/nameHelper.js`), and `databaseText(name, key, en)` tables (`DialogShortcuts`, `GameSettings`, `MainMenu`, and `ModSystem` in `src/ui/textDatabases.js`) resolve localized overrides with English fallback.
- **Glyph atlases and CJK wrapping:** `createGlyphFace` (`src/ui/glyphFace.js`) rasterizes glyphs on demand onto `FACE_PAGE = 1024` canvas atlas pages for all five `CLASSIC_FONT_NAMES` (`src/ui/localeFaces.js`), and `src/ui/talkWindow.js` wraps CJK lines per UAX #14 with kinsoku rules.
