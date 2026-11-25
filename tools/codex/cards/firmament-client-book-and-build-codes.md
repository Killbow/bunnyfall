---
slug: firmament-client-book-and-build-codes
title: "Firmament Client Book, Status Line, and Build Codes"
domain: net
kind: subcard
parent: firmament-overview
files:
  - src/net/firmament/firmamentBook.js
  - src/net/firmament/firmamentLaw.js
  - src/characters/firmamentLive.js
  - src/ui/firmamentWindow.js
  - src/ui/levelNotice.js
  - src/net/accountClient.js
routes:
  - /v1/firmament/state
  - /v1/firmament/set
  - /v1/firmament/respec
tables: []
replacesBible:
  - "06-Systems/Firmament.md"
related:
  - firmament-overview
  - firmament-service-sets-and-respec
  - growth-stage-and-embedded-skies
invariants:
  - "`commit` coalesces: while a set is sending, only the newest confirmed tree waits in `queued` and is sent after the answer."
  - "A change whose answer is lost is kept under `FIRM_KEPT_KEY` with its rid and resent with the same rid on the next read."
  - "Unanswered reads retry after `FIRM_READ_RETRY_MS` (15 s), doubling to `FIRM_READ_RETRY_MAX_MS` (120 s)."
  - "`firm-busy` blocks a commit while a respec is in flight and a respec while a set is sending."
  - "`firmamentStatus` returns `seat`, `unread`, `no-sign`, `mentoring`, `duel`, or `active`, in that precedence order."
  - "`buildCode` emits `FIRM-<SKY_TAG>-<bits>`; `treeOfCode` refuses a mismatched 4-hex `SKY_TAG` with `build-sky`."
traps:
  - "Build-code base64 uses `-` and `+` (not `_`) so Discord does not italicize pasted codes."
  - "`treeOfCode` does not validate the tree; the window must still call `treeFault`."
  - "Preview mode (`mountFirmamentWindow` `preview` option, used by `firmament.html`) is a window mode, not a `firmamentStatus` value."
dfu: []
tags:
  - firmament
  - client-book
  - retry
  - build-code
  - ui
---

# Firmament Client Book, Status Line, and Build Codes

`src/net/firmament/firmamentBook.js` and `src/ui/firmamentWindow.js` manage client tree synchronization, retry journals, wallet reservations on respec, status precedence, and shareable build codes.

- **Coalesced Commits and Retry Journal:** When `commit` runs while a `/v1/firmament/set` call is already in flight, only the latest confirmed tree is held in `queued` and transmitted once the active call resolves. Outgoing changes persist under `FIRM_KEPT_KEY` with their `rid` so an interrupted request replays idempotently on the next state read. Failed `/v1/firmament/state` reads retry with exponential backoff from `FIRM_READ_RETRY_MS` (`15` s) up to `FIRM_READ_RETRY_MAX_MS` (`120` s).
- **Respec Locking and Wallet Reserve:** `commit` and `respec` lock each other out with `firm-busy` whenever the opposite operation is in flight. Before calling `/v1/firmament/respec` through `realm.act`, the book reserves the gold cost locally via `walletReserve`.
- **Status Precedence and Notices:** `firmamentStatus` in `src/characters/firmamentLive.js` evaluates state in strict order: `seat`, `unread`, `no-sign`, `mentoring`, `duel`, and `active` (`preview` is a `mountFirmamentWindow` option for `firmament.html`, not a status). Renown level notifications display `RISEN_TITLE` (`You have risen`) in `src/ui/levelNotice.js`.
- **Build Codes:** `buildCode` packs a tree into `FIRM-<SKY_TAG>-<bits>` using `-` and `+` in its base64 alphabet so chat clients do not italicize underscores. `treeOfCode` rejects mismatched 4-hex `SKY_TAG` headers with `build-sky` and leaves graph validation to `treeFault`.
