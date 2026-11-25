---
slug: "localization-arc-overview"
title: "Localization Arc: DFU Text Core, Locales, and Translations"
domain: "ui"
kind: "overview"
parent: null
files:
  - "src/ui/textManager.js"
  - "src/ui/localeCatalog.js"
  - "src/ui/localeData.js"
  - "src/ui/translationPacks.js"
  - "src/ui/translationStore.js"
  - "tools/translate.mjs"
  - "tools/l10nExtract.mjs"
  - "locales/README.md"
  - "locales/en/Port_Strings.csv"
routes: []
tables: []
replacesBible:
  - "06-Systems/Localization-Arc.md"
related:
  - "localization-text-core-and-locale-chain"
  - "localization-translation-packs-and-dfu-documents"
  - "localization-catalog-pipeline-and-ratchet"
  - "ui-overlays-and-localization"
invariants:
  - "English literals live directly in source: `localizedText`, `t`, `localizedStrings`, and `localizedTable` return the active locale row when present and otherwise return the passed-in English string byte-for-byte."
  - "`src/ui/textManager.js` is an import-free leaf; callers supply English fallback lists, canonical names, and font hooks."
  - "Human translations always outrank machine drafts: installed DFU pack rows override bundled drafts, and `tools/translate.mjs` skips rows marked `by: \"human\"`."
traps:
  - "Only the active `localeChain` fetches `locales/<tag>/<table>.csv` lazily; `locales/en/` is never fetched at runtime, and fetch failures fall back to English without halting play."
dfu:
  - "Assets/Scripts/Game/TextManager.cs"
  - "Assets/Scripts/Game/StringTableCSVParser.cs"
  - "Assets/Scripts/Game/StringTablePatcher.cs"
  - "Assets/Scripts/Localization/Grammar.cs"
tags:
  - "localization"
  - "l10n"
  - "translation"
  - "text-core"
  - "locales"
---

# Localization Arc: DFU Text Core, Locales, and Translations

The localization system pairs an import-free text core in `src/ui/textManager.js` with lazy locale catalogs, IndexedDB translation packs, and an automated extraction and translation pipeline.

- **English-in-source fallback:** `localizedText`, `t`, `localizedStrings`, and `localizedTable` return the active locale row when loaded and otherwise return the caller-supplied English literal byte-for-byte. Callers also supply fallback lists, canonical names, and font hooks.
- **DFU and port collections:** Ten classic collections in `DEFAULT_COLLECTION_NAMES` (`Internal_Strings`, `Internal_RSC`, `Internal_Flats`, `Internal_Quests`, `Internal_Locations`, `Internal_Settings`, `Internal_Spells`, `Internal_Items`, `Internal_MagicItems`, and `Internal_Factions`) pair with `Port_Strings` (`locales/en/Port_Strings.csv`, extracted via `tools/l10nExtract.mjs`).
- **Locale catalog and lazy loading:** `LOCALE_CATALOG` in `src/ui/localeCatalog.js` lists English, 25 other languages (with Chinese split into `zh-Hans` and `zh-Hant`), and the hidden pseudo-locale `qps-ploc`, with 12 entries marked `drafting: true`. In `src/ui/localeData.js`, the URL parameter `?lang=<tag>` selects a language for one page load before falling back to the `language` setting in `uiPrefs`. Only the active `localeChain` fetches `locales/<tag>/<table>.csv` lazily; `locales/en/` is never fetched at runtime.
- **Precedence and scope:** Installed DFU packs (`src/ui/translationPacks.js`, `src/ui/translationStore.js`) override bundled machine drafts, and `tools/translate.mjs` never overwrites rows marked `by: "human"`. Right-to-left and complex-script shaping remain deferred to L10N7.
