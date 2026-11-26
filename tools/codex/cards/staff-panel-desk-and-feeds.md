---
slug: staff-panel-desk-and-feeds
title: "Staff Panel Desk, Reaction Feed, and Monster Watch"
domain: account
kind: subcard
parent: staff-panel-overview
files:
  - server-account/src/staffDesk.js
  - server-account/src/staffReactions.js
  - server-account/src/staffMonsters.js
  - server-account/src/cron.js
  - server-account/src/service.js
routes:
  - /v1/staff/notes
  - /v1/staff/notes/add
  - /v1/staff/watch
  - /v1/staff/watch/events
  - /v1/staff/settings/save
  - /v1/staff/notice
  - /v1/mod/reaction-feed
  - /v1/staff/reactions
  - /v1/staff/monsters
tables:
  - encounter_reactions
  - reaction_batches
related:
  - staff-panel-overview
  - hidden-staff-uncounted-overview
invariants:
  - "The watch reads only from the open panel, never from a login, a trade, or a checkpoint."
  - "The audit log records a staff note act (`note-add`) but never the words of the note."
  - "`until` pins the pages of one watch read to one set: the first page returns it as `cursor`, later pages send it back, and the next poll sends it as `since`."
  - "A board notice carries the panel request id `rid`, so a repeated notice request returns the notice it already made."
  - "A staff settings document must fit in `STAFF_SETTINGS_BYTES` (`4000`), inside the 4 KiB service body limit (`MAX_BODY_BYTES`) with room for the request wrapper."
  - "A reaction feed batch id, its rows, and the hourly row count are written in one D1 batch."
  - "The monster watch reports `not measured` when every batch says it did not measure and `no report` when no batch came, so missing data never reads as all quiet."
traps:
  - "Watch sale events read the seller and buyer sides through separate indexes, because an `OR` across them scans the table."
  - "`REACT_ROWS_HOUR` (`20000`) must stay below what the hourly `reactions` sweep deletes: `SWEEP_ROWS` times the per-job statement share in `server-account/src/cron.js` (`FIRING_STATEMENTS_MAX` over the hour job count, 20 rounds today), which is `20000` rows an hour today."
dfu: []
tags:
  - staff
  - watchlist
  - notes
  - reactions
  - monsters
---

# Staff Panel Desk, Reaction Feed, and Monster Watch

- **Desk (`server-account/src/staffDesk.js`):** Staff notes are a short shared history on one player that every staff member can read and add to. Each staff member keeps a watchlist, and its events come from data the service already records: logins, large trades and sales, new findings, and reports. Moderators see logins and new chat reports only. Each member also keeps one settings document. Admins post the server notice on every board and review reported board notes and market listings.
- **Reaction feed (`/v1/mod/reaction-feed`, `server-account/src/staffReactions.js`):** The relay times natural encounters and posts finished episodes in signed batches. Each episode gets its own row in `encounter_reactions` until the hour passes `REACT_ROWS_HOUR`, and after that the rest of the hour is summed into one row per player.
- **Monster watch (`/v1/staff/monsters`, `server-account/src/staffMonsters.js`):** Admins only. It ranks players by the live monsters they own or host and by their spawn requests per hour, most urgent first.
