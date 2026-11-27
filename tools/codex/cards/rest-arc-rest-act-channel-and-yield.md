---
slug: rest-arc-rest-act-channel-and-yield
title: "Rest Channel, Interruptions, Recovery Yield, and Rooms"
domain: systems
kind: subcard
parent: rest-arc-overview
files:
  - src/systems/survival/restAct.js
  - src/player/restSession.js
  - src/systems/survival/rest.js
  - src/systems/survival/difficulty.js
  - src/systems/survival/needs.js
  - src/trade/tavern.js
  - src/scenes/shared.js
  - src/scenes/dungeonContext.js
  - src/ui/enhancedRest.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Rest-Arc.md"
related:
  - rest-arc-overview
  - rest-arc-campfires-charges-and-dungeon-fires
invariants:
  - "channelBroken ends the hold every frame on a stood enemy (pending latch), an enemy in reach, a blow (hpNow < hpAtOpen), or a fire, tent, or Bedroll point that disappears (restActNow() has no point). A Meditation Candle kneel ignores blows."
  - "actAtChannelEnd re-asks the point and health at the end. A vanished fire point or a lower health returns null (interrupted)."
  - "REST-CHANNEL-HEAL: openChannelHeal and stepChannelHeal raise health, fatigue, and magicka with the bar and never lower them. Whatever the bar has paid is kept even if the hold breaks."
  - "topUpRest: a rest priced whole (bed, camp, or a tier whose roughRest.recovery >= 1) ends full. A half-priced short rest heals half of what is missing. A half-priced night keeps what its hours gave."
  - "A short rest moves no clock and rolls no encounter. sleepShortRest pays the sleep need through paySleep for NIGHT_MINUTES at the rest kind's rate. Vampires and arc-off characters pay nothing."
  - "spendRoomNight spends one of room.nights. On the last night, the room's expiryMinutes is pulled to now. roomNightsLeft derives nights for old saves as ceil(hours / 24)."
  - "`checkRent()` runs and is stored before the finish test every rested hour, because the decrement must not be short-circuited when the mode already finishes."
traps:
  - "runRestNight must tick one sub-tick per call so the ambushNight latch is read before the next 10 minutes roll. If the latch is set on the last sub-tick, the result is converted to enemiesNearby (AUDIT REST II P7)."
  - "bedInReach requires the feet within `BED_STOREY_M` (1.5) of the bed's foot, so beds on the floor above or below do not count."
dfu:
  - DaggerfallRestWindow.cs
tags:
  - rest
  - channel
  - recovery
  - sleep-debt
  - tavern
---

# Rest Channel, Interruptions, Recovery Yield, and Rooms

Online rest holds stream vital recovery across the channel bar and finalize clock advancement, sleep debt, and room nights on completion (`src/systems/survival/restAct.js`, `src/ui/enhancedRest.js`).

## Channel Guards and Sub-Ticks

- **Reach and break rules (`src/systems/survival/restAct.js`):** `bedInReach` checks reach within `BY_FIRE_REACH` (`4`) and vertical offset within `BED_STOREY_M` (`1.5`), excluding other floors. Each frame, `channelBroken` aborts on a latched enemy, an enemy in reach, damage (`hpNow < hpAtOpen`, ignored for Meditation Candle), or a missing rest point. `actAtChannelEnd` rechecks point and health at finish.
- **Channel healing (`REST-CHANNEL-HEAL`):** `openChannelHeal` and `stepChannelHeal` raise health, fatigue, and magicka with the bar and retain paid gains if broken.
- **Sub-ticks (`src/player/restSession.js`):** `runRestNight` steps `RestSession` by `MINUTES_PER_TICK` (`10` min, `REST_WAIT_PER_HOUR = 0.75`) so an `ambushNight` latch breaks immediately (or reports `enemiesNearby` on the final tick).

## Recovery Yield, Short Rests, and Rooms

- **Tier yields (`src/systems/survival/difficulty.js`, `src/systems/survival/rest.js`):** `REST_COST` gives bed and camp rests `recovery` `1`, `encounters` `1`, and `stiffHours` `0`; Hard `roughRest` sets `recovery` `0.5`, `encounters` `2`, and `stiffHours` `4` (`STIFF_HOURS = 4`, `STIFF_PENALTY = 5`). `topUpRest` fills vitals on full rests, heals half the deficit on half-rate short rests, and keeps hourly gains on half-rate nights.
- **Short rest and rooms (`src/systems/survival/needs.js`, `src/trade/tavern.js`):** `sleepShortRest` pays `NIGHT_MINUTES` via `paySleep` without moving clocks. `spendRoomNight` consumes one of `room.nights` (`roomNightsLeft` derives `ceil(hours / 24)`) and pulls `expiryMinutes` to now on the last night.
