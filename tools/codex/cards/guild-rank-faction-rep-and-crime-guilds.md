---
slug: "guild-rank-faction-rep-and-crime-guilds"
title: "Guild Rank, Faction Reputation, Crime Guild Invitations, and the Crime Setter"
domain: "systems"
kind: "subcard"
parent: "classic-systems-spine-overview"
files:
  - "src/guilds/guilds.js"
  - "src/guilds/factionRep.js"
  - "src/guilds/crimeGuilds.js"
  - "src/justice/court.js"
  - "src/justice/arrestFlow.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Systems-Arc.md"
related:
  - "classic-systems-spine-overview"
  - "guild-overhaul-overview"
  - "world-arc-towns-talk-and-crime"
invariants:
  - "updateRank (src/guilds/guilds.js:304) moves rank only after DAYS_BETWEEN_RANK_CHANGES = 28 days, counted as year*360+dayOfYear so the gate survives year boundaries."
  - "activeMemberships (src/guilds/guilds.js:591) chooses between the mortal and vampire membership books on every read."
  - "setCrimeCommitted (src/justice/court.js:68) is the single crime-state setter across all hosts."
traps:
  - "Clearing crime on guild Teleport diverges from DFU. Only fastTravelTo (src/scenes/world.js) clears crime at its tail."
  - "Mutating `crimeCommitted` directly instead of calling `setCrimeCommitted` (`src/justice/court.js`) bypasses shapechanged crime suppression."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "guilds"
  - "faction"
  - "crime"
  - "reputation"
---

# Guild Rank, Faction Reputation, Crime Guild Invitations, and the Crime Setter

NPC guild advancement, faction reputation, underground guild invitations, and legal crime state share strict date, book, and setter gates across all hosts (`world-arc-towns-talk-and-crime`).

- **Guild memberships and rank cadence (`src/guilds/guilds.js`, `src/guilds/factionRep.js`):** `activeMemberships` selects between the mortal and vampire membership books on every read so vampirism transitions swap active guild records cleanly. `updateRank` advances or demotes rank only after `DAYS_BETWEEN_RANK_CHANGES = 28` days, computed as `year * 360 + dayOfYear` so the cooldown survives year boundaries. Faction reputation initializes through `ensureFactionRep` in `src/guilds/factionRep.js`.
- **Crime guild tallies and invitations (`src/guilds/crimeGuilds.js`):** Underground invitations track crime weights where a murdered civilian adds `5`, a murdered guard adds `1`, and each theft adds `1`. Reaching `THIEVES_GUILD_TALLY_TARGET = 10` or `DARK_BROTHERHOOD_TALLY_TARGET = 15` schedules an invitation letter after `CRIME_GUILD_LETTER_DELAY_MINUTES = 4320` and marks the tally with `INVITE_SENT = 100`.
- **Crime state and regional legal standing (`src/justice/court.js`, `src/justice/arrestFlow.js`, `src/scenes/world.js`):** `court.js` tracks legal reputation per region and exposes `setCrimeCommitted`, the single crime-state setter across all hosts that enforces shapechanged crime suppression. Only `fastTravelTo` in `src/scenes/world.js` clears crime at its tail; guild Teleport leaves crime intact.
