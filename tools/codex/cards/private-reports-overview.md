---
slug: "private-reports-overview"
title: "Private Reports (/bug): Reader Allowlist, Client ReportDesk, and Session Scope"
domain: "systems"
kind: "overview"
parent: null
files:
  - "src/net/reportLaw.js"
  - "src/net/privateReport.js"
  - "src/net/wire.js"
  - "src/net/chatCommands.js"
  - "src/ui/enhancedReport.js"
  - "src/ui/enhancedPost.js"
  - "src/ui/enhancedMenu.js"
  - "src/ui/pauseDoor.js"
  - "src/ui/domRepaint.js"
  - "src/buildTag.js"
  - "src/scenes/world.js"
  - "src/scenes/worldModes.js"
  - "SECURITY.md"
routes:
  - "/v1/report/send"
  - "/v1/report/mine"
tables:
  - "private_reports"
replacesBible:
  - "06-Systems/Private-Reports.md"
related:
  - "private-reports-service-and-inbox"
  - "account-routes-and-gate-wall"
invariants:
  - "Only handles listed in `REPORT_READER_HANDLES` (`server-account/wrangler.toml`, empty list valid) may read private reports; developer or moderator flags grant zero access, and reports never touch chat logs, Notice Boards, letters, or GitHub issues."
  - "Client `ReportDesk` (`src/net/privateReport.js`) derives an idempotency `rid` from normalized draft words (`reportWordsOf` in `src/net/reportLaw.js`), allowing one in-flight request (`busy`), returning `repeat` on duplicate submits, and wiping drafts, lists, and inboxes on account sign-out or switch (`_stale`)."
  - "The report pane rebuilds only when `reportPaneKey` changes so typing never drops focus (`src/ui/domRepaint.js`), validating `REPORT_KINDS` (`exploit`, `bug`, `security`), title `3..80` Unicode code points (`REPORT_SUBJECT_MIN`/`MAX`), and body `10..3000` code points (`REPORT_WORDS_MIN`/`MAX` via `charsOf` and `visibleText`)."
traps:
  - "`/bug` (`src/net/chatCommands.js`, opening the mailbox report tab or `openPauseAt`) is separate from chat-safety `/report <name>` (`/v1/safety/report`)."
  - "Client context sends only username, build tag, and platform (`\"desktop\"` or `\"browser\"`), never coordinates, user agent, or save payloads; `/v1/report/mine` (`REPORT_MINE_MAX = 20`) omits bodies and reader identities."
dfu: []
tags:
  - "reports"
  - "security"
  - "privacy"
  - "mailbox"
  - "ui"
---

# Private Reports (/bug): Reader Allowlist, Client ReportDesk, and Session Scope

Private Reports (`SECURITY.md`, `/bug` in `src/net/chatCommands.js`) routes exploit, bug, and security disclosures directly to `private_reports` without touching chat logs, Notice Boards, letters, or GitHub issues.

- **Reader allowlist and command split:** Only handles listed in `REPORT_READER_HANDLES` (`server-account/wrangler.toml`, where an empty list is valid) can read reports; developer and moderator badges grant zero access. Typing `/bug` opens the mailbox report tab (`src/ui/enhancedPost.js`, `src/ui/enhancedMenu.js`, `src/ui/pauseDoor.js`, or `openPauseAt` in `src/scenes/world.js` and `src/scenes/worldModes.js`) and stays separate from chat-safety `/report <name>` (`src/net/wire.js`).
- **Validation and `ReportDesk` lifecycle:** `src/net/reportLaw.js` defines `REPORT_KINDS` (`exploit`, `bug`, and `security`), `REPORT_STATES` (`open`, `fixed`, `wontfix`, and `duplicate`), title length `3..80` Unicode code points (`REPORT_SUBJECT_MIN` and `REPORT_SUBJECT_MAX`), and body length `10..3000` code points (`REPORT_WORDS_MIN` and `REPORT_WORDS_MAX`, measured via `charsOf` and `visibleText`). `ReportDesk` (`src/net/privateReport.js`) derives an idempotency `rid` from `reportWordsOf`, permits one in-flight `/v1/report/send` request (`busy`), returns `repeat` on duplicate submissions, and clears drafts, lists, and inboxes on account switch or sign-out (`_stale`).
- **Focus and privacy:** `src/ui/enhancedReport.js` rebuilds the DOM only when `reportPaneKey` changes (`src/ui/domRepaint.js`). Context attaches only username, build tag (`src/buildTag.js`), and platform (`"desktop"` or `"browser"`), and `/v1/report/mine` (`REPORT_MINE_MAX = 20`) omits report bodies and reader identities.
