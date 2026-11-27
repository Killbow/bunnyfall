---
slug: "private-reports-service-and-inbox"
title: "Private Reports Account Service: D1 Schema, Rate Caps, and Reader Inbox"
domain: "systems"
kind: "subcard"
parent: "private-reports-overview"
files:
  - "server-account/src/reports.js"
  - "server-account/src/routes/mailRoutes.js"
  - "server-account/src/post.js"
  - "server-account/src/routeStatus.js"
  - "server-account/src/service.js"
  - "server-account/wrangler.toml"
  - "server-account/migrations/0129_private_reports.sql"
  - "src/net/reportLaw.js"
  - "src/net/serverPost.js"
  - "tools/sendServerPost.mjs"
routes:
  - "/v1/report/send"
  - "/v1/report/mine"
  - "/v1/report/inbox"
  - "/v1/report/read"
  - "/v1/report/close"
  - "/v1/post/box"
tables:
  - "private_reports"
replacesBible:
  - "06-Systems/Private-Reports.md"
related:
  - "private-reports-overview"
  - "account-routes-and-gate-wall"
invariants:
  - "`private_reports` (`0129_private_reports.sql`, unique `ux_private_reports_rid` on `(from_id, rid)`, cascading on account delete) inserts with `ON CONFLICT (from_id, rid) DO NOTHING` rather than `INSERT OR IGNORE` so `CHECK` violations surface as `500` errors."
  - "Opening a report stamps `read_at` and `read_by` only on first read; closing stamps `closed_at` and `closed_by` (plus read fields if unread), and reopening clears close fields without marking unread."
  - "For non-readers, `postBoxOf` (`server-account/src/post.js`) omits the `reports` field and executes zero `private_reports` queries."
traps:
  - "Guest sessions receive HTTP `403` (`report-needs-account`), `/v1/report/send` caps payloads at `REPORT_BODY_BYTES = 24` KiB while sibling report routes enforce `MAX_BODY_BYTES = 4` KiB (`server-account/src/service.js`), and `reportContextOf` strips context to update, build hash, and platform."
  - "`HOURS_FIRST` and `HOURS_FIRST_RECORD` in `tools/sendServerPost.mjs` stay frozen to match migration `0094_hours_first_post.sql`, because an applied migration never reruns. Each send is an `INSERT OR IGNORE` over `ux_server_post_batch` (`to_id`, `batch`), so a send run twice delivers once."
dfu: []
tags:
  - "reports"
  - "account-service"
  - "rate-limit"
  - "inbox"
  - "d1"
---

# Private Reports Account Service: D1 Schema, Rate Caps, and Reader Inbox

The account service (`server-account/src/reports.js` and `server-account/src/routes/mailRoutes.js`) stores reports in D1 table `private_reports` (`server-account/migrations/0129_private_reports.sql`), enforces sender quotas, and serves the allowlisted reader inbox.

- **Schema and idempotency:** `private_reports` enforces `ux_private_reports_rid` on `(from_id, rid)` and cascades on account deletion. `/v1/report/send` inserts with `ON CONFLICT (from_id, rid) DO NOTHING` rather than `INSERT OR IGNORE` so SQL `CHECK` constraint failures surface as `500` errors while duplicate `(from_id, rid)` submissions return idempotently.
- **Payloads, guests, and rate limits:** Guest sessions receive HTTP `403` (`report-needs-account`). `/v1/report/send` accepts bodies up to `REPORT_BODY_BYTES = 24` KiB while `/v1/report/mine`, `/v1/report/inbox`, `/v1/report/read`, and `/v1/report/close` enforce `MAX_BODY_BYTES = 4` KiB in `server-account/src/service.js`, and `reportContextOf` (`src/net/reportLaw.js`) trims context to update, build hash, and platform. Quotas (`REPORT_STATUS` in `server-account/src/routeStatus.js`) cap each sender at `REPORT_SEND_MAX = 5` submissions per `REPORT_WINDOW_S = 3600` seconds (`429` `report-rate`) and `REPORT_OPEN_MAX = 20` open reports (`409` `report-full`).
- **Reader inbox and post counts:** `/v1/report/inbox` returns up to `REPORT_INBOX_MAX = 100` rows per page, ordering open items unopened-first then newest and closed items last-closed-first. `/v1/report/read` stamps `read_at` and `read_by` on first read; `/v1/report/close` stamps `closed_at` and `closed_by` (plus read fields if unread) or clears close fields on reopen without resetting read status. In `server-account/src/post.js` (`src/net/serverPost.js`), `postBoxOf` adds `reports: { unread, open }` on `/v1/post/box` and heartbeat `PostBox.waiting` only for `REPORT_READER_HANDLES` (`server-account/wrangler.toml`), running zero `private_reports` queries for non-readers.
