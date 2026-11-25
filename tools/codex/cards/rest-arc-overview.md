---
slug: rest-arc-overview
title: "Rest Arc: Online Rest as an Act at Rest Points"
domain: systems
kind: overview
parent: null
files:
  - src/systems/survival/restAct.js
  - src/player/restSession.js
  - src/systems/survival/rest.js
  - src/systems/survival/camp.js
  - src/systems/survival/camps.js
  - src/world/dungeonFires.js
  - src/party/partyRestLaw.js
  - src/systems/survival/restItems.js
  - src/systems/quest/clock.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Rest-Arc.md"
related:
  - rest-arc-rest-act-channel-and-yield
  - rest-arc-campfires-charges-and-dungeon-fires
  - rest-arc-party-nights-and-camp-roll
  - online-time-quest-delays-and-deadlines
  - online-time-arc-overview
invariants:
  - "Online, a rest is an act at a rest point: a lit fire (placed Campfire, tent fire, world brazier or hearth, or dungeon fire) or a bed. It is never hours on a dial."
  - "A long rest is one night: NIGHT_HOURS = 8 (NIGHT_MINUTES = 480) on the character's own clock, run through the timed RestSession to its end in one call (runRestNight)."
  - "NIGHT_INTERVAL_MINUTES = 0: no wait between long rests. The player chooses Long Rest or Short Rest."
  - "Offline, none of restAct.js runs: DFU's rest window is unchanged."
traps:
  - "Do not restate RestSession sub-tick logic in restAct.js. The night reuses the session so the time readers stay consistent."
  - "Quest waits during rest are covered by online-time-quest-delays-and-deadlines (ONLINE_DELAY_SECONDS, ONLINE_DEADLINES). Do not duplicate that logic here."
dfu:
  - DaggerfallRestWindow.cs
tags:
  - rest
  - survival
  - online
  - overview
---

# Rest Arc: Online Rest as an Act at Rest Points

Under `sharedClockOn()`, online resting replaces the classic hour-dial modal (`DaggerfallRestWindow.cs`) with a deliberate act performed at a physical rest point (`src/systems/survival/restAct.js`). Offline play bypasses `restAct.js` entirely and preserves classic rest window behavior.

## Rest Points, Choices, and Own-Clock Nights

- **Eligible rest points (`src/systems/survival/restAct.js`, `src/systems/survival/camp.js`, `src/world/dungeonFires.js`):** Online characters rest at a lit fire (a placed Campfire, tent fire, world brazier or hearth, or dungeon fire) or at a bed. With `REST_ITEMS_ONLINE = true` (`src/systems/survival/restItems.js`), every new online character receives `startingCampfire()` at creation even when the survival arc is disabled.
- **Channel hold and rest modes:** Resting opens a channel hold lasting `REST_CHANNEL_SECONDS` (`6` s) at a fire or bed, or `BEDROLL_CHANNEL_SECONDS` (`10` s) for a rough Bedroll rest. Because `NIGHT_INTERVAL_MINUTES = 0`, no cooldown separates full rests; the player freely selects Long Rest or Short Rest at the prompt.
- **Synchronous night execution (`src/player/restSession.js`):** While normal play advances the character clock at `OWN_MINUTES_PER_REAL_MINUTE` (`12`), a Long Rest advances `NIGHT_HOURS = 8` (`NIGHT_MINUTES = 480`) on the character's own clock by driving `RestSession` sub-ticks to completion in one `runRestNight` call. Quest timer rules during rest follow `online-time-quest-delays-and-deadlines`.

## Subcards

- `rest-arc-rest-act-channel-and-yield`
- `rest-arc-campfires-charges-and-dungeon-fires`
- `rest-arc-party-nights-and-camp-roll`
