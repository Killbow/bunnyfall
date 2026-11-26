---
slug: staff-relay-entry-follow-freeze-and-feeds
title: "Staff Relay Rules: Hidden Entry, Follow, Freeze, and Feeds"
domain: multiplayer
kind: subcard
parent: hidden-staff-uncounted-overview
files:
  - server/src/staffHidden.js
  - server/src/staffFollow.js
  - server/src/staffFreeze.js
  - server/src/staffFeeds.js
  - server/src/room/seats.js
  - server-account/src/staffNet.js
  - server-account/src/staffReactions.js
routes: []
tables: []
related:
  - hidden-staff-uncounted-overview
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "A hidden socket may enter a private home (an `owned:` room) only when the relay can report the entry (`HIDDEN_SEEN_URL` over https plus `GATE_SIGNING_KEY`), and a hidden hello is refused with 'id taken' when a visible socket holds its id."
  - "A room reports a followed account's arrival or departure to the hub (`SOCIAL_ROOM`) only while a spectator following that account is in the room, and the party copy of a where note drops the staff-only `rk` room."
  - "The staff channel relays only a nudge naming a stored line id, never the line text."
  - "Staff counts never change what a player receives, live in memory only, and stay off until their URL is set (`STAFF_NET_FEED_URL` for the net feed, `REACTION_FEED_URL` for the reaction feed)."
traps:
  - "A freeze order applies only to sockets whose token was not minted after it (`gio` at most the order's `i`), because a newer token already carries the current freeze."
  - "Any freeze, lapsed or not, bars the socket from the room's host seat (`seatBarred`) until a lease or hello lifts it, so the seat never moves back on the clock alone."
  - "Each feed's service skips a batch id it already stored, so a failed batch is resent under its own id, never a new one."
  - "`_message` in `server/src/message/dispatch.js` silently drops any frame from a hidden socket that `hiddenMay` refuses and never calls `_junk`, because a hidden game still sends normal player frames and a strike would close the staff member's own view."
  - "An upgrade's `?hd=1` hidden-seat ask is unverified until its hello, so `seatsTaken` treats a hidden ask as full once `HIDDEN_RESERVE` hidden asks wait without a hello, and the room-full path closes silent seats past `HELLO_WAIT_MS` (`_unseatSilent`)."
dfu: []
tags:
  - staff
  - hidden
  - follow
  - freeze
  - feeds
  - relay
---

# Staff Relay Rules: Hidden Entry, Follow, Freeze, and Feeds

The relay's staff modules sit beside `Room` in `server/src/`. `staffHidden.js` decides whether a hidden socket may join a room, `staffFollow.js` tells a spectator where a followed account goes, `staffFreeze.js` applies signed freeze orders and carries staff channel nudges, and `staffFeeds.js` posts signed count batches to the account service.

The feeds never change the frames a player receives. Freeze and follow state reaches other rooms through leases and the hub, and feed batches go out only when the matching feed URL is set.
