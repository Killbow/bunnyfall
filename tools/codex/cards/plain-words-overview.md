---
slug: plain-words-overview
title: "Plain Words: Every Screen Says What It Is and What To Do"
domain: ui
kind: overview
parent: null
files:
  - src/ui/noticeWindow.js
  - src/ui/seatTab.js
  - src/ui/familyPages.js
  - src/ui/enhancedTalk.js
  - src/systems/livingWorld/people.js
  - src/mods/modSettings.js
  - src/ui/gambitTableWords.js
  - tools/l10nExtract.mjs
  - tools/l10nInSession.mjs
  - tools/noticeBoardProbe.mjs
routes: []
tables: []
replacesBible:
  - "10-UI/Plain-Words.md"
related:
  - plain-words-board-seat-and-chapter-guides
  - plain-words-family-how-it-works
  - plain-words-talk-regard-badge
  - guilds-made-plain-overview
  - ui-overlays-and-localization
  - release-numbering-ste-notes-and-plain-text
invariants:
  - "Law 1: a surface says what it is and what the reader can do before it lists any figures."
  - "Law 2: every term a tab prints is defined on that tab (for example the Seat tab's 'Words on this board' glossary)."
  - "Law 3: figures in guides and glossaries are interpolated from law constants (npcChapterLaw.js, townSeatLaw.js, legacyLaw.js, relations.js), never typed literals."
  - "Law 4: a system guide opens for a new player and folds for a practiced one, and the reader's own fold choice survives redraws."
  - "Law 5: anything shown on hover is also reachable by a press or tap."
  - "Law 6: no slice codes, file names, module names, or developer jargon in player-facing text."
  - "Text rule: state the event, state what to do, then stop. No em dashes, no hype words, no padding in threes, American spelling, numbers as numerals."
traps:
  - "Preserved text is not swept: DFU native texts, quests and books, in-world lore, barks and dialogue, the Code of Conduct, protocol and chat command errors, and mod runtime messages."
  - "Mod setting descriptions are rewritten in src/mods/modSettings.js through t() keys. Vendored modsettings.json files stay untouched. Inert keys say 'Has no effect' and why."
dfu: []
tags:
  - plain-ui
  - plain-sweep
  - ux
  - copy
  - localization
---

# Plain Words: Every Screen Says What It Is and What To Do

Plain Words is a copy and layout pass across enhanced UI surfaces that explains every screen, defines every term inline, and interpolates all rules from live law constants without changing game mechanics.

- **Six Laws and Text Style:** Every tab states what it is and what the player can do before showing figures, defines its own vocabulary inline, and interpolates numbers from `src/net/npcChapterLaw.js`, `src/net/townSeatLaw.js`, `src/systems/legacy/legacyLaw.js`, and `src/systems/livingWorld/relations.js`. Guides open by default for newcomers, fold for experienced players, preserve manual fold choices across redraws, and expose hover text on press or tap.
- **New Guides and Surface Updates:** The pass adds folded guides to the Notice Board Seat and Work tabs (`src/ui/seatTab.js`, `src/ui/noticeWindow.js`), a How it works section on the Family tab (`src/ui/familyPages.js`), a resident regard badge on the enhanced talk panel (`src/ui/enhancedTalk.js`, `src/systems/livingWorld/people.js`), and the `'Minimum stake'` label in Kings Gambit (`src/ui/gambitTableWords.js`, retaining the `cards.kingsGambit.words.leastStake.*` key).
- **Localization and Preserved Text:** Swept copy routes through `t(key, fallback)` (`tools/l10nExtract.mjs`, `tools/l10nInSession.mjs`, `tools/noticeBoardProbe.mjs`), and mod setting descriptions in `src/mods/modSettings.js` mark inert keys with `'Has no effect'`. Native DFU texts, lore, quests, dialogue, the Code of Conduct, protocol errors, and vendored `modsettings.json` files remain untouched.
