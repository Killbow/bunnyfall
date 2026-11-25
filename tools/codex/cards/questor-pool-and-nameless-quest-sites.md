---
slug: questor-pool-and-nameless-quest-sites
title: "Questor Pool Selection and Nameless Quest Sites"
domain: quests
kind: subcard
parent: remains-gold-hud-focus-and-report-map-overview
files:
  - src/talk/npcSession.js
  - src/talk/answerPipeline.js
  - src/talk/talkMacros.js
  - src/systems/quest/offerFlow.js
  - src/talk/townTalk.js
  - src/world/buildingNames.js
  - src/systems/quest/place.js
  - src/systems/quest/machine.js
  - src/guilds/guildFactions.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20h.md"
related:
  - remains-gold-hud-focus-and-report-map-overview
  - quest-sites-and-homed-reseating
  - questlines-offers-couriers-and-line-runner
invariants:
  - "While `npcsWithWork` is non-empty, `selectedNpcWorkKey` names a questor the pool holds. `_holdSelection` (src/talk/npcSession.js) moves a stale selection to the last key in the pool and draws nothing."
  - "`removeNpcQuestor` deletes the questor and then calls `_holdSelection`. offerFlow.js spends the questor when an offer opens, except inside a castle (`isPlayerInsideCastle`)."
  - "`questorGender` in src/talk/talkMacros.js compares `ctx.questorGender()` to `GENDERS.Female`, never to the string 'female'."
  - "`nameOpts` (src/talk/townTalk.js) returns faction and temple resolvers, `palaceName`, `nameBank`, and `regentRuler` wherever the player stands, once FACTION.TXT is loaded; only the location and region pair belongs to the town."
traps:
  - "DFU throws KeyNotFoundException from GetQuestorGender (TalkManagerMCP.cs:34) before SetRandomQuestor runs. Bunnyfall answered '' instead, so the Work answer said \"someone named \" until QUESTOR-HELD."
  - "Saves can carry building sites named ''. `_reseatMovedOf` and the load pass in src/systems/quest/machine.js call `Place.nameSiteAgain` to rename them from their building without counting them as moved."
dfu:
  - Assets/Scripts/Game/TalkManager.cs
  - Assets/Scripts/Game/TalkManagerMCP.cs
  - Assets/Scripts/Game/MacroHelper.cs
  - Assets/Scripts/Game/FormulaHelper.cs
  - Assets/Scripts/Game/Questing/Place.cs
tags:
  - questor
  - talk
  - quest-sites
  - temple-names
  - orrery
---

# Questor Pool Selection and Nameless Quest Sites

Work talk macros and remote quest sites rely on held questor selection (`src/talk/npcSession.js`, `src/talk/answerPipeline.js`, `src/talk/talkMacros.js`, `src/systems/quest/offerFlow.js`) and town-independent faction resolvers (`src/talk/townTalk.js`, `src/world/buildingNames.js`, `src/systems/quest/place.js`, `src/systems/quest/machine.js`, `src/guilds/guildFactions.js`).

## Questor Pool Selection and Gender Macro

In DFU (`TalkManager.cs`, `TalkManagerMCP.cs`), `GetQuestorGender` before `SetRandomQuestor` threw `KeyNotFoundException`, whereas Bunnyfall returned `''` and left Work answers (`TEXT.RSC` 8076/8077, `%pqn` and `%pqp`) blank. While `npcsWithWork` is non-empty, `_holdSelection` keeps `selectedNpcWorkKey` valid by moving a stale selection to the last pool key without drawing. `removeNpcQuestor` deletes the questor and calls `_holdSelection`; `offerFlow.js` spends the questor on offer open unless `isPlayerInsideCastle` holds. In `src/talk/talkMacros.js` (`MacroHelper.cs`), `questorGender` compares `ctx.questorGender()` to `GENDERS.Female`, never `'female'`.

## Town-Independent Site Naming and Load Repair

Once `FACTION.TXT` loads, `nameOpts` (`src/talk/townTalk.js`) returns faction and temple resolvers (`templeName`, the first child of its faction for building type 14, such as Mara faction 24), `palaceName`, `nameBank`, and `regentRuler` (`FormulaHelper.cs`) anywhere, naming remote `_temple_` sites in the Orrery line (`QLHR01`/`QLHR02`) outside town. On load and in `_reseatMovedOf` (`src/systems/quest/machine.js`, `Place.cs`), `Place.nameSiteAgain` renames blank `''` building sites without counting them moved.
