---
slug: online-waits-daedra-summoning-by-name
title: "Daedra Summoning by Name Online"
domain: systems
kind: subcard
parent: online-waits-overview
files:
  - src/magic/daedraSummoning.js
  - src/scenes/worldModes.js
  - src/world/weather.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Waits.md"
related:
  - online-waits-overview
  - online-time-sky-law-and-cutover
invariants:
  - "`summonsByName({ factionId, factionType, online })` is true only online and only when the summoner is neither `GLENMORIL_WITCHES` (419) nor a `WITCHES_COVEN_TYPE` faction. Covens keep the daily `daedraForSummoner` draw, and Glenmoril always summons Hircine."
  - "By-name listing also requires `listPickerArtLoaded()`. Without it the summoner falls back to DFU's day-of-year prince."
  - "`PRINCES_BY_NAME` lists all sixteen `DAEDRA` sorted by name. `summonByNameBoxes` builds the picker and then the record 481 (`SUMMON_TEXT.areYouSure`) question for the chosen prince."
  - "Weather flags (`weatherFlags(currentWeather())`) are read inside the Yes handler, not when the list opens (AUDIT WAITS S1)."
traps:
  - "`summonQuestionRows(record)` cuts record 481 after its first sentence, which online falsely says it is the prince's day. If no sentence end exists it falls back to `SUMMON_BY_NAME_ROWS` (AUDIT WAITS S4)."
  - "SUMMON-OFFER: `offerQuest` runs before payment. Results of kind `poor` or `noQuest` spend nothing and set no `FACTION_FLAGS.Summoned` flag. On `failed`, the gold is still spent."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallQuestPopupWindow.cs
tags:
  - daedra
  - summoning
  - temple
  - mages-guild
  - online
  - summon-name
---

# Daedra Summoning by Name Online

Because an online sky year spans fifteen real days (`SKY-SLOW`), classic day-of-year Daedra summoning left each prince reachable for only one real hour every fifteen days and created a 57-hour gap between Vaernima (`190`) and Nocturnal (`248`). `src/magic/daedraSummoning.js` and `src/scenes/worldModes.js` allow online temples and Mages Guild halls to summon any Daedric Prince by name.

## Picker Eligibility, Prompt Trimming, and Roll Order

- **Summoner eligibility (`summonsByName`):** Returns `true` only online when the summoner is neither `GLENMORIL_WITCHES` (`419`, which always summons Hircine) nor a `WITCHES_COVEN_TYPE` faction (which keeps the daily `daedraForSummoner` roll). If `listPickerArtLoaded()` is false, summoning falls back to the classic day-of-year prince.
- **Name picker and prompt (`PRINCES_BY_NAME`, `summonByNameBoxes`):** Presents all sixteen `DAEDRA` sorted alphabetically, then opens confirmation record `481` (`SUMMON_TEXT.areYouSure`). `summonQuestionRows(record)` strips the first sentence claiming today is the prince's festival day, falling back to `SUMMON_BY_NAME_ROWS` if no sentence terminator is found (`AUDIT WAITS S4`).
- **Live weather and pre-payment offer (`SUMMON-OFFER`):** Accepting the prompt reads `weatherFlags(currentWeather())` (`src/world/weather.js`) inside the Yes handler (`AUDIT WAITS S1`), evaluates `summoningCost(npcRep) = 200000 - npcRep * 1000` and `summoningChance = 30 + daedraRep + bonus` (preserving Sheogorath gatecrashes and prior-meeting greetings), and runs `offerQuest` before charging gold so `poor` and `noQuest` outcomes neither deduct gold nor set `FACTION_FLAGS.Summoned` (whereas `failed` still spends the fee).
