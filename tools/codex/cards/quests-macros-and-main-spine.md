---
slug: quests-macros-and-main-spine
title: Quest Macros, Static NPCs, and Main Spine
domain: quests
kind: overview
files:
  - src/systems/quest/machine.js
  - src/systems/quest/questMacros.js
  - src/systems/quest/mainSpine.js
  - src/talk/talkMacros.js
  - src/characters/staticNpc.js
invariants:
  - "src/systems/quest/questMacros.js and src/talk/talkMacros.js share one 217-entry macro table and getMacroValue error ladder across quest and dialog text."
  - "exteriorNpcFlags overrides unreliable outdoor RMB flat bit 32 from FLATS.CFG, setting bit 32 when gender includes '2' and clearing it otherwise."
  - "mainSpine checks every SPINE_CHECK_TICKS (30) to restart a dropped S0000999 backbone while skipping classic save imports."
traps:
  - "If online character creation saves and reloads before FACTION.TXT loads, _BRISIEN fails to parse S0000999 and StartQuest marks itself complete, requiring mainSpine recovery."
  - "Outdoor RMB bit 32 cannot be trusted on its own; any non-'2' FLATS.CFG gender entry clears bit 32 via flags & 223, whereas '?2' entries keep it set."
  - "FACTION.TXT race numbers (Nord 0, Khajiit 1, and so on) differ from the `RACES` enum in order as well as base. Both mapping functions stay as explicit cases and are never computed with an offset."
dfu:
  - Assets/Scripts/Game/Questing/QuestMachine.cs
  - Assets/Scripts/Utility/MacroHelper.cs
  - Assets/Scripts/Game/StaticNPC.cs
tags:
  - quests
  - macros
  - static-npc
  - main-quest
  - dfu-parity
---

# Quest Macros, Static NPCs, and Main Spine

Quest text, outdoor NPC identity, and main-quest startup share unified tables and online recovery hooks across `src/systems/quest/`, `src/systems/talk/`, and `src/characters/`.

- **Unified 217-entry macro table:** `src/systems/quest/questMacros.js` consolidates all 217 `MacroHelper` symbols across `HANDLERS` and `NULL_HANDLERS` (`macroTableCoverage`), shared with `src/talk/talkMacros.js` through `getMacroValue` and its four DFU error sentinels (`[undefined]`, `[unhandled]`, `[nullMCP]`, `[srcDataUnknown]`). Non-quest UI text calls `expandMacroValues`, matching `%\w+` by maximal munch and falling back from caller value maps to `macroWorld()`.
- **Outdoor `StaticNPC` gender bit:** `exteriorNpcFlags` (`src/characters/staticNpc.js`) ports the exterior `StaticNPC.SetLayoutData` overload. Because bit `32` on outdoor RMB flat records is unreliable, `FLATS.CFG` overrides it: `String(flatData.gender).includes('2')` sets bit `32` (female, including `?2`), and any other `FLATS.CFG` entry clears it (`flags & 223`).
- **`S0000999` main-spine recovery:** Online character creation saves and reloads between `_BRISIEN` ticks; if `FACTION.TXT` has not loaded when `_BRISIEN` runs `start quest 999 999`, parsing `S0000999` fails and `StartQuest` marks itself complete. `src/systems/quest/mainSpine.js` (`spineOwed`, `openersOwed`, checked every `SPINE_CHECK_TICKS = 30` in `src/systems/quest/machine.js`) restarts a missing `S0000999` backbone while skipping classic save imports.
