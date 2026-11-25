---
slug: "town-mod-quest-site-fallback-overview"
title: "Town-Mod Quest Site Fallback and Curated Temple Summoners"
domain: "quests"
kind: "overview"
parent: null
files:
  - "src/systems/quest/place.js"
  - "src/systems/quest/person.js"
  - "src/systems/quest/machine.js"
  - "src/systems/quest/questReach.js"
  - "src/world/curatedPeople.js"
  - "src/guilds/guildNpcServices.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Quest-Audit-II.md"
related:
  - "town-mod-layout-pins-and-shared-seats"
  - "quest-sites-and-homed-reseating"
  - "questor-pool-and-nameless-quest-sites"
  - "quests-macros-and-main-spine"
invariants:
  - "In `src/systems/quest/place.js`, local site fallback (`_nearTownSites` by `mapPixelDistance`) runs only when `_modsTookKind` confirms a town mod removed the requested building kind."
  - "Remote site fallback (`_modsTookKindFromRegion`) searches nearest towns in the same region first via `_nearRegionTownSite` before falling back to another region, tagged by `layoutStampOfMapId`."
  - "`SUMMONER_FACTIONS` (`src/world/curatedPeople.js`) derives from `NPC_SERVICE` entries of kind `DaedraSummoning` in `src/guilds/guildNpcServices.js`, keying block additions by `servedName` so misnamed temple blocks still resolve."
traps:
  - "Fallback site selection preserves the quest fixed travel clock, so moving a site to a neighboring town does not extend short timers."
dfu:
  - "Assets/Scripts/Game/Questing/Place.cs"
  - "Assets/Scripts/Game/Questing/Person.cs"
  - "Assets/Scripts/Game/Questing/QuestMachine.cs"
tags:
  - "quests"
  - "town-mods"
  - "fallback"
  - "summoners"
---

# Town-Mod Quest Site Fallback and Curated Temple Summoners

When town mods alter or remove buildings, `src/systems/quest/place.js`, `src/systems/quest/person.js`, and `src/world/curatedPeople.js` redirect quest sites and service NPCs without breaking active quests (`src/systems/quest/machine.js`, `src/systems/quest/questReach.js`).

- **Local and regional site fallback:** In `src/systems/quest/place.js`, local site fallback (`_nearTownSites` sorted by `mapPixelDistance`) runs only when `_modsTookKind` confirms a town mod removed the requested building kind from the current settlement. For remote placements, `_modsTookKindFromRegion` searches nearest towns within the same region first via `_nearRegionTownSite` before scanning outside the region, stamping results with `layoutStampOfMapId`. Fallback selection preserves the quest fixed travel clock, so shifting a site to a neighboring town never stretches short timers.
- **Guild questor checks and temple summoners:** When reseating a guild questor, `src/systems/quest/person.js` tests `IsNPCDataEqual` on the existing building before scanning other guild halls. In `src/world/curatedPeople.js`, `SUMMONER_FACTIONS` derives from `NPC_SERVICE` rows of kind `DaedraSummoning` (`src/guilds/guildNpcServices.js`), keying block additions by `servedName` so misnamed temple blocks still resolve summoners.
