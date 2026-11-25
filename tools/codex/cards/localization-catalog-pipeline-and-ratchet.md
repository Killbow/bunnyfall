---
slug: "localization-catalog-pipeline-and-ratchet"
title: "English Catalog, Translation Pipeline, and Hardcoded-Prose Ratchet"
domain: "tooling"
kind: "subcard"
parent: "localization-arc-overview"
files:
  - "tools/l10nExtract.mjs"
  - "tools/translate.mjs"
  - "tools/l10nHardcoded.mjs"
  - "tools/l10nRouted.mjs"
  - "tools/l10nInSession.mjs"
  - "tools/l10nReview.mjs"
  - "tools/l10nCoverage.mjs"
  - "tools/l10nPack.mjs"
  - "tools/l10n/ROUTE-BRIEF.md"
  - "tools/l10n/TRANSLATE-BRIEF.md"
  - "locales/README.md"
  - "locales/en/Port_Strings.csv"
  - "src/ui/etherChartWindow.js"
  - "src/ui/enhancedChronicle.js"
  - "src/cards/iliacCardWords.js"
  - "src/ui/gambitTableWords.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Localization-Arc.md"
related:
  - "localization-arc-overview"
  - "ui-overlays-and-localization"
  - "ether-chart-window-ruler-and-labels"
  - "kings-gambit-overview"
  - "iliac-hand-pure-engine-and-binder-saves-overview"
invariants:
  - "`locales/en/Port_Strings.csv` is generated from source by `node tools/l10nExtract.mjs` and is never hand-edited."
  - "`tools/translate.mjs` records `sha1-12` hashes of English source and machine output in `<table>.meta.json`; any row whose text diverges from the machine hash stamps `by: \"human\"` and is never overwritten."
  - "New player-facing prose goes through the text core; `tools/l10nHardcoded.mjs` counts the remaining prose literals file by file as a ratchet that may only fall."
traps:
  - "`l10nHardcoded.mjs` treats `t`, `tIn`, `localizedText`, `localizedTextList`, `localizedStrings`, `localizedTable`, `formatText`, `getLocalizedText*`, `databaseText` and `gameSettingsText` arguments as routed, and skips `src/ui/textManager.js` and `src/systems/grammar/`."
  - "Since CARDS-PLUS, CSS selectors (ids, attributes, pseudo-classes) are not counted as prose."
dfu: []
tags:
  - "localization"
  - "tooling"
  - "translation-pipeline"
  - "ratchet"
  - "port-strings"
---

# English Catalog, Translation Pipeline, and Hardcoded-Prose Ratchet

CLI scripts in `tools/` extract the English catalog from source, translate tables with hash-tracked human overrides, and enforce a downward ratchet on unrouted prose literals.

- **Extraction and routing:** `node tools/l10nExtract.mjs` scans source calls and regenerates `locales/en/Port_Strings.csv` (never hand-edited). Routed namespaces include `sea.chart.*` (`src/ui/etherChartWindow.js`), `chronicle.quests.*` (`src/ui/enhancedChronicle.js`), `cards.iliac.*`, `cards.table.fold.*`, `cards.iliacSet.<card>.*` (`src/cards/iliacCardWords.js`), and `cards.kingsGambit.*` (`src/ui/gambitTableWords.js`, while unit names call `getLocalizedEnemyName`), verified by `tools/l10nRouted.mjs` and `tools/l10nInSession.mjs`.
- **Machine drafts and human provenance:** `tools/translate.mjs` (`translateTable`) sends batches of `batch = 40` rows across `jobs = 4` concurrent workers to `DEFAULT_MODEL` through the remote messages API with `cache_control: ephemeral` system prompts (`tools/l10n/TRANSLATE-BRIEF.md` and `tools/l10n/ROUTE-BRIEF.md`). It stores `sha1-12` hashes of English source and machine output in `<table>.meta.json`; any row edited away from the machine hash is stamped `by: "human"` and protected from future runs. `tools/l10nReview.mjs` (`--export` and `--import <tag>`), `tools/l10nCoverage.mjs`, and `tools/l10nPack.mjs` manage review sheets, coverage reports, and packs (`locales/README.md`).
- **Hardcoded-prose ratchet:** `tools/l10nHardcoded.mjs` counts unrouted literals per file as a ceiling that can only decrease, treating `t`, `tIn`, `localizedText*`, `localizedStrings`, `localizedTable`, `formatText`, `getLocalizedText*`, `databaseText`, and `gameSettingsText` arguments as routed, ignoring CSS selectors, and skipping `src/ui/textManager.js` and `src/systems/grammar/`.
