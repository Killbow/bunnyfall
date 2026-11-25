---
slug: chat-safety-reports-cases-and-auto-mute
title: "Report Intake, Case Aggregation, Automatic Mute, and Retention Sweep"
domain: multiplayer
kind: subcard
parent: chat-safety-overview
files:
  - src/net/safety/safetyLaw.js
  - server-account/src/safety.js
  - server-account/src/sanctions.js
  - server-account/src/safetyClock.js
  - server-account/src/cron.js
  - src/net/chat.js
  - server-account/migrations/0126_chat_safety.sql
  - server-account/migrations/0156_staff_cases_fix.sql
  - server-account/migrations/0206_no_automatic_cases.sql
routes:
  - /v1/safety/report
tables:
  - mod_cases
  - mod_reports
  - mod_case_lines
  - mod_actions
  - mod_feed
  - mod_ai_days
replacesBible:
  - "11-Multiplayer/Chat-Safety-Arc.md"
related:
  - chat-safety-overview
  - chat-safety-relay-stamps-and-new-voice-pace
  - chat-safety-sanctions-bans-and-discord
  - spawn-grants-measure-and-moderation
invariants:
  - "`reportShape` requires a `REPORT_REASONS` reason, a note of at most `REPORT_NOTE_MAX` (`200`) characters, and `1` to `REPORT_LINES_MAX` (`16`) stamped lines containing at least one line from the reported target."
  - "Lines older than `REPORT_LINE_AGE_MS` (`24` h) or more than `REPORT_LINE_AHEAD_MS` (`60` s) ahead of server time are dropped individually, returning `'report-stale'` only when every target line is dropped."
  - "Any target line that fails `verifyStamp` rejects the entire report, whereas a context line from another speaker that fails verification is omitted."
  - "The unique index `mod_cases_open` allows at most one open case per account per kind (`'chat'` or `'spawn'`), folding concurrent reports into the same open case."
  - "`keepCaseLines` bounds each case at `CASE_LINES_MAX` (`60`) lines, evicting other speakers' oldest context lines before any of the target's own lines."
  - "When `REPORT_AUTO_MUTE` (`3`) credible reporters (linked, unmuted, and older than `SPROUT_S`) report within `REPORT_AUTO_WINDOW_S` (`3600` s), the service claims `auto_at` and issues a single first-rung automatic mute."
traps:
  - "`UNCOUNTED_CASES_HOUR` (`60`) caps only new cases opened by non-counting reporters across the service per hour; reports attached to an already-open case are always accepted."
  - "Timed-out cases transition to status `'dismissed'` with `resolution = 'expired'` and `resolved_by = 'the clock'`; there is no `'expired'` status in `mod_cases`."
  - "`mod_feed` and `mod_ai_days` are legacy tables from migration `0126_chat_safety.sql` that are only emptied by `safetySweep`."
dfu: []
tags:
  - reports
  - cases
  - auto-mute
  - retention
  - d1
---

`POST /v1/safety/report` (`server-account/src/safety.js`) verifies relay-stamped chat transcripts, aggregates reports into `mod_cases`, triggers first-rung automatic mutes, and ages out records via `safetySweep` (`server-account/src/safetyClock.js`).

## Report Intake and Case Aggregation

Clients gather surrounding chat context with `ChatLog.reportLines` (`src/net/chat.js`, using `REPORT_PICK_AGE_MS`, one hour inside `REPORT_LINE_AGE_MS` `24` h) within `REPORT_BODY_MAX` (`24` KiB) and `REPORT_RATE_MAX` (`12`) reports per `REPORT_WINDOW_S` (`3600` s). `reportShape` (`src/net/safety/safetyLaw.js`) validates a `REPORT_REASONS` reason, a note up to `REPORT_NOTE_MAX` (`200`), and `1` to `REPORT_LINES_MAX` (`16`) lines outside `REPORT_LINE_AHEAD_MS` (`60` s) clock skew. Any invalid stamp on a target line rejects the report, while invalid context stamps are dropped; if no valid target lines remain, the route returns `'report-stale'`.

Reports fold into a single open case per target and kind (`mod_cases_open` unique index from migration `0156_staff_cases_fix.sql`), storing reporter notes in `mod_reports` and lines in `mod_case_lines` via `keepCaseLines` (`CASE_LINES_MAX` `60`, evicting context speakers first). Non-credible reporters can open at most `UNCOUNTED_CASES_HOUR` (`60`) new cases per hour service-wide, while reports onto open cases always succeed. Reaching `REPORT_AUTO_MUTE` (`3`) credible reporters (linked, unmuted, and past `SPROUT_S`) within `REPORT_AUTO_WINDOW_S` (`3600` s) claims `auto_at` and records one first-rung mute in `mod_actions` (`server-account/src/sanctions.js`).

## Retention Sweep

Hourly `safetySweep` (`server-account/src/cron.js`, `SAFETY_SWEEP_ROWS` `500` for up to `SAFETY_SWEEP_ROUNDS` `25`) dismisses cases open past `CASE_OPEN_MAX_S` (`90` days) with `resolution = 'expired'`, purges `mod_case_lines` and nulls `mod_reports.note` (`lines_kept = 0`) `RESOLVED_LINES_KEEP_S` (`90` days) after resolution, and empties legacy `mod_feed` and `mod_ai_days`.
