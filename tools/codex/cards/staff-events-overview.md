---
slug: staff-events-overview
title: "Staff Events: Admin-Staged Monster Invasions"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/staffEvent/staffEventLaw.js
  - server-account/src/staffEvents.js
  - server/src/staffEvents.js
  - src/worldEvents/staffEvents.js
  - src/worldEvents/raidingParties.js
  - src/tools/staffPanel.js
  - src/net/staffPlaces.js
  - server-account/migrations/0167_staff_events.sql
routes:
  - "/v1/staff/event"
  - "/v1/staff/events"
tables:
  - staff_events
replacesBible:
  - "11-Multiplayer/Staff-Events.md"
related:
  - staff-events-order-book-and-meter
  - staff-events-packs-and-mini-boss
  - staff-events-rewards-and-claims
  - world-events-and-signed-receipts
  - room-engine-and-hub-sharding
invariants:
  - "Only accounts with role 'admin' may use the event doors (server-account/src/staffEvents.js returns 'staff-admin' otherwise)."
  - "At most STAFF_EVENTS_MAX (4) events are live at once."
  - "src/net/staffEvent/staffEventLaw.js is pure and imports nothing, so the worker's dependency graph stays flat."
  - "An event's place is a town (loc >= 0, ct 1 for a city) or an area (loc -1, a map pixel alone). Announcements say which one."
traps:
  - "Players are never told the kill meter. Only staff read it, through /v1/staff/events."
  - "The game skips staff events when the relay is older than STAFF_EVENT_RELAY_MIN (relaySupportsStaffEvents)."
dfu: []
tags:
  - staff-events
  - multiplayer
  - staff-panel
  - raids
  - mini-boss
---

# Staff Events: Admin-Staged Monster Invasions

Staff Events allow accounts with role `admin` (`server-account/src/staffEvents.js`, migration `0167_staff_events.sql`) to stage live enemy invasions across up to `STAFF_EVENTS_MAX` (`4`) active places at once, gated on client support by `STAFF_EVENT_RELAY_MIN` (`relaySupportsStaffEvents` in `src/net/staffEvent/staffEventLaw.js`).

- **Panel staging (`src/tools/staffPanel.js`):** Staff pick a town (`loc >= 0`, `ct: 1` for a city) or map pixel area (`loc: -1`) resolved from `MAPS.BSA` (`src/net/staffPlaces.js`), choose `1` to `12` enemy kinds mixed evenly, set a total of `1` to `500` enemies (default `60`), and set a hidden kill meter of `1` to `total` (default `40`) that summons a mini boss at `150%` to `300%` size (default `200%`). Optional fields configure announcement `an`, start/boss/end lines, map label `lb`, boss name `bn`, reward kill threshold `rk` (`3` to `500`), gold `gd`, silver `sv`, mid bosses `mb` (`0` to `5`), and boss wave `wv` (`0` to `20`).
- **Relay execution (`server/src/staffEvents.js`, `src/worldEvents/staffEvents.js`):** The account service signs a `sevent` order (`mintStaffEventOrder`) and pushes it to the relay hub while recording a row in `staff_events` (`/v1/staff/event`, `/v1/staff/events`). Clients run the invasion as raid type `9` (`STAFF_RAID_TYPE` in `src/worldEvents/raidingParties.js`) with no raid timer until staff end it, its `ue` deadline lapses, its boss falls with `eb` set, or all enemies and bosses fall.
- **Subcards:** `staff-events-order-book-and-meter` covers order flow and cell meters; `staff-events-packs-and-mini-boss` covers pack scaling and boss combat rules; `staff-events-rewards-and-claims` covers leaderboards, `e1` receipts, and silver payouts.
