---
slug: "online-line-stall-act-waits-and-block-stamps"
title: "Line Stall Holds, Welcome-Gated Sends, and Blocked-Sender Stamps"
domain: "multiplayer"
kind: "subcard"
parent: "ledger-law-pose-freshness-and-room-caps-overview"
files:
  - "src/net/online.js"
  - "src/net/wire.js"
  - "src/net/instanceRoom.js"
  - "server/src/room/meters.js"
  - "server/src/message/frames/trade.js"
  - "server/src/message/frames/page.js"
  - "server-account/src/accounts.js"
routes:
  - "/v1/auth/session"
tables:
  - "players"
  - "sessions"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26r.md"
related:
  - "ledger-law-pose-freshness-and-room-caps-overview"
  - "chat-safety-block-list-and-conduct"
  - "chat-safety-relay-stamps-and-new-voice-pace"
  - "account-passwords-recovery-codes-and-rate-limits"
  - "room-engine-and-hub-sharding"
invariants:
  - "`PING_MS = HEARTBEAT_MS / 4` (`5` s for `HEARTBEAT_MS = 20000` in `src/net/wire.js`) and `LINE_STALL_MS = PING_MS` (`src/net/online.js`) detect silent socket stalls within `PING_MS + LINE_STALL_MS` (`10` s)."
  - "Stalled sockets (`_stalled`) throttle poses to one latest frame per `HEARTBEAT_MS` and hold enemy streams and blows so TCP buffer flushes never exceed `DROP_STRIKES_MAX = 200` (`CLOSE_POLICY = 1008`)."
  - "`sendAct`, `sendHit`, `sendWorld`, `sendDuel`, and `sendWild` wait until socket welcome completes so no frame arrives ahead of an instance `hello` (`INSTANCE_KIN_KEEP_MS = 15` s in `src/net/instanceRoom.js`)."
  - "Relay `_directedFrame` (`server/src/room/meters.js`) stamps verified sender `sub` on `trade` (`server/src/message/frames/trade.js`) and `page` (`server/src/message/frames/page.js`) fan-outs."
traps:
  - "`_directedIn` (`src/net/online.js`) resolves missing `sub` from the room roster and drops unknown-sender frames whenever any account is blocked across `BLOCKED_KINDS` (`trade`, `card`, `page`, `duel`, `wed`); casts and zone blows are never block-dropped."
  - "Password recovery, password change, login rehash, and `openSession` (`server-account/src/accounts.js`) guard every `UPDATE` on the verified hash or live session row."
dfu: []
tags:
  - "relay"
  - "sockets"
  - "chat-safety"
  - "accounts"
  - "rate-limits"
---

# Line Stall Holds, Welcome-Gated Sends, and Blocked-Sender Stamps

Socket stall throttling, welcome-gated sends, directed relay stamps, and session update guards span `src/net/online.js`, `src/net/wire.js`, `src/net/instanceRoom.js`, `server/src/room/meters.js`, and `server-account/src/accounts.js`.

- **Stall detection and cadences:** `src/net/wire.js` sets `PING_MS = HEARTBEAT_MS / 4` (`5` s for `HEARTBEAT_MS = 20000`), `HIT_HZ_MAX = 10`, and `FOES_HZ_MAX = 12`; `src/net/online.js` sets `POSE_HZ = 10` and `LINE_STALL_MS = PING_MS`. Stalls trigger within `10` s (`PING_MS + LINE_STALL_MS`); `_stalled` sockets send one pose per `HEARTBEAT_MS` and hold enemy streams and blows under `DROP_STRIKES_MAX = 200` (`CLOSE_POLICY = 1008`).
- **Welcome gate and relay stamps:** `sendAct`, `sendHit`, `sendWorld`, `sendDuel`, and `sendWild` wait for socket welcome so frames never precede an instance `hello` (`INSTANCE_KIN_KEEP_MS = 15` s in `src/net/instanceRoom.js`). Relay `_directedFrame` (`server/src/room/meters.js`) stamps verified sender `sub` on `trade` (`server/src/message/frames/trade.js`) and `page` (`server/src/message/frames/page.js`) fan-outs.
- **Block filtering and account guards:** `_directedIn` (`src/net/online.js`) resolves missing `sub` from the roster and drops unknown senders across `BLOCKED_KINDS` (`trade`, `card`, `page`, `duel`, and `wed`) if any account is blocked, sparing casts and zone blows. In `server-account/src/accounts.js` (`/v1/auth/session`), password recovery, change, rehash, and `openSession` guard `players` and `sessions` updates on the verified hash or live row.
