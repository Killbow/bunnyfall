---
slug: "localization-text-core-and-locale-chain"
title: "Text Core: Collections, Locale Chain, ICU Strings, and Pseudo-Locale"
domain: "ui"
kind: "subcard"
parent: "localization-arc-overview"
files:
  - "src/ui/textManager.js"
  - "src/ui/localeCatalog.js"
  - "src/ui/localeData.js"
  - "src/world/gameDate.js"
  - "src/systems/grammar/frenchGrammar.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Localization-Arc.md"
related:
  - "localization-arc-overview"
  - "localization-translation-packs-and-dfu-documents"
  - "ui-overlays-and-localization"
invariants:
  - "`localeChain(code)` walks the tag, each shorter tag, then `en` (`pt-BR` -> `pt` -> `en`); `setLocale` clears the list cache, bumps the revision and re-chooses grammar (DFU never clears its cache)."
  - "`parseStringTableCsv` preserves `StringTableCSVParser` behavior verbatim: unquoted values truncate at the first comma, and only an exact `Key,Value` header row is stripped."
  - "`formatStringTableCsv` writes the `Key,Value` header, quotes every value with doubled quotes, and throws on a key holding a comma, quote or newline."
  - "The French pack's text belongs to its authors and is never bundled; only the MIT grammar code in `frenchGrammar.js` ships with the game."
traps:
  - "`defaultCollectionName` has no TextFlats case, so a flats miss falls back to Internal_Strings, as in DFU."
  - "`getLocalizedEnemyName` reads `enemyNames` row `id` for 0-42 and `43 + id - 128` for classes 128-146; any other id goes to `registerCustomEnemyNameText` hooks, then the fallback."
  - "`formatText` leaves a placeholder with no argument as written, where C# `string.Format` would throw."
dfu:
  - "Assets/Scripts/Game/TextManager.cs"
  - "Assets/Scripts/Game/StringTableCSVParser.cs"
  - "Assets/Scripts/Localization/Grammar.cs"
tags:
  - "localization"
  - "text-core"
  - "icu"
  - "pseudo-locale"
  - "grammar"
  - "csv"
---

# Text Core: Collections, Locale Chain, ICU Strings, and Pseudo-Locale

`src/ui/textManager.js` implements string table resolution, CSV parsing, ICU message formatting, grammar rules, and pseudo-localization.

- **Locale chain and browser matching:** `localeChain(code)` walks the full tag, each shorter subtag, and `en`. Calling `setLocale` clears the list cache (such as `dayNames()` in `src/world/gameDate.js`), increments the revision counter, and rebinds grammar rules registered through `registerGrammarRules(language, rules)` (`src/systems/grammar/frenchGrammar.js`). `localeForBrowser` (`src/ui/localeCatalog.js`, `src/ui/localeData.js`) tries the exact tag, folds Chinese (`TW`, `HK`, and `MO` to `zh-Hant`) and Norwegian (`no` and `nn` to `nb`), and falls back to the base language without offering `en` or hidden locales.
- **ICU, formatting, and lookups:** `t(key, en, args)` and `tIn(code, key, en, args)` read `Port_Strings` and format `{x}`, `{n, number}`, `{n, plural}`, `{n, selectordinal}`, and `{x, select}` via `Intl.PluralRules`, while `formatText` leaves unmatched placeholders intact. `defaultCollectionName` omits a `TextFlats` branch so flat misses fall back to `Internal_Strings`, and `getLocalizedEnemyName` maps IDs `0..42` to `id`, classes `128..146` to `43 + id - 128`, and other IDs to `registerCustomEnemyNameText` hooks.
- **CSV and pseudo-locale:** `parseStringTableCsv` strips an exact `Key,Value` header and truncates unquoted values at the first comma; `formatStringTableCsv` quotes all values and rejects keys containing commas, quotes, or newlines. `pseudoLocalize` accents Latin letters, doubles vowels, and brackets the output while preserving `%macros`, `{0}`, `[/markup]`, quest symbols, and angle codes.
