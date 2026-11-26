---
slug: hidden-staff-uncounted-overview
title: "Hidden Staff Sockets, Hub Counts, and Client Seats"
domain: net
kind: overview
parent: null
files:
  - src/net/online.js
  - server/src/message/entry.js
  - server/src/staffHidden.js
  - server-account/src/staffHidden.js
  - src/net/staffMap.js
  - src/net/hubShards.js
  - src/net/roster.js
  - src/net/onlineWorld.js
  - src/ui/chatPanel.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Hidden-Uncounted.md"
related:
  - hidden-staff-guild-last-seen
  - room-engine-and-hub-sharding
  - scale-arc-hub-pull-layers-and-cells
  - staff-events-overview
invariants:
  - "A staff socket is hidden only when its verified identity token body carries `hd === 1`."
  - "A hello with no token is refused with 'sign in to play online'."
  - "Hidden sockets are left out of every relay walk and every count. Hiding does not change the relay version."
  - "`_seatN` is 0 while hidden and 1 otherwise. A hub `{t:'n'}` count is accepted only when `m.n >= _seatN`."
  - "`hidden` is a getter over the `_helloTok` entry on the current socket, decoded once per token, so a halo promoted at a crossing gets the right answer."
  - "The `hidden-token` audit row is written before the token is minted, and the staff session and Hide me switch are read on the primary, so every hidden token is in the audit log and none is minted from a stale replica read."
traps:
  - "Do not count a hidden seat as +1 anywhere except in the channel welcome `others.length + 1`."
  - "`staffMap` and `staffHook` must never read counts."
  - "The hub count arrives every `HUB_COUNT_MS` (1000) and the who-list every `HUB_WHO_MS` (15000). Row lists and counts can briefly disagree."
dfu: []
tags:
  - staff
  - hidden
  - presence
  - counts
  - hub
  - roster
---

# Hidden Staff Sockets, Hub Counts, and Client Seats

Staff accounts in hidden mode connect without inflating player counts or appearing in relay walks, hub rosters, or search results.

- **Relay hello and socket flags (`server/src/message/entry.js`, `server/src/staffHidden.js`):** A tokenless hello is refused with `'sign in to play online'`. When a verified token body has `hd === 1`, `entry.js` adds the hello to `_hidHellos` and `staffHidden.js` marks the socket `hid = 1`. Hidden sockets are omitted from relay walks, hub searches, and counts, including unsharded Trade, LFG, and language channels.
- **Client seat floor (`src/net/online.js`, `src/net/hubShards.js`, `src/net/onlineWorld.js`):** `tokenHidden` caches `hidden` per `_helloTok` on the current socket for halo promotions at crossings. `_seatN` is `0` while hidden and `1` otherwise; hub `{t:'n'}` updates require `m.n >= _seatN`, and shard clients take bus count `n` when above peers plus one. Hidden links omit `trav` so `othersHere` stays accurate.
- **Roster and UI (`src/net/roster.js`, `src/net/staffMap.js`, `src/ui/chatPanel.js`):** `placedRosterSource` preserves `title` and `gt` on visible links, `staffMap` never reads counts, and phone widths hide the roster column and online count.
