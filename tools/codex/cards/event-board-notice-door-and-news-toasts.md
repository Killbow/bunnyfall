---
slug: event-board-notice-door-and-news-toasts
title: "Event Notice Door, News Toasts, Journal Filing, and Audience Reach"
domain: ui
kind: subcard
parent: event-board-hud-overview
files:
  - src/worldEvents/eventNotices.js
  - src/worldEvents/eventBoard.js
  - src/ui/eventBoard.js
  - src/talk/townTalk.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "10-UI/Event-Board.md"
related:
  - event-board-hud-overview
  - event-board-plate-layout-and-filters
  - raiding-parties-overview
  - starfall-overview
invariants:
  - "`eventNotice(kind, text, id)` is the one door. It files every line once into the seated log (`townTalk.hudMessageSink`, the journal Messages page). A kind the player hid is filed only. Unknown kinds become 'gate'. At most `EVENT_NOTICES_KEPT` (32) lines wait."
  - "One card shows at a time for `EVENT_TOAST_MS` (9 s) of shown time; its clock stops while the HUD is hidden. A joining note gets at least `EVENT_NOTE_MIN_MS` (5 s). Limits: `EVENT_TOASTS_KEPT` 6 waiting, `EVENT_TOAST_NOTES` 3 notes per card, and the same note within `EVENT_NOTE_SAME_MS` (60 s) is a duplicate."
  - "`eventAnnouncements` skips rows whose `since` is more than `EVENT_SEED_GRACE_MS` (5 s) before the first world read (`watchFrom`)."
  - "A raid announces only in its own region or within `EVENT_RAID_REACH_M` (25 km). There is no region past the Veil."
traps:
  - "With the board off (`eventBoardOn` false), raid lines go to `hudText` (AddHUDText) and others go to the seated chat sink, via `eventNoticeElsewhere`."
  - "`eventHudLine` nulls `hudMessageSink` for one call so a line the door already filed is not filed twice."
  - "The announcement memory reads every kind (`model.every`), so re-enabling a kind mid-event raises no stale toast."
  - "The live region (`EVENT_BOARD_LIVE_ID`) is polite, atomic, and visually hidden. It updates only on a new card or note, never on clock ticks; the plate is aria-hidden."
dfu: []
tags:
  - ui
  - hud
  - notifications
  - journal
  - accessibility
  - event-board
---

# Event Notice Door, News Toasts, Journal Filing, and Audience Reach

`src/worldEvents/eventNotices.js` routes all shared-event announcements through `eventNotice(kind, text, id)`, logging once to the journal while queueing bounded news toasts on the Event Board plate (`src/ui/eventBoard.js`). Personal notices, spoils, receipts, Motherlode alerts, server messages, and party rest stay in chat.

- **Single Notice Door and Fallback Routing:** `eventNotice` normalizes unknown kinds to `'gate'`, buffers up to `EVENT_NOTICES_KEPT` (`32`) pending lines, and writes every line once to `townTalk.hudMessageSink` (`src/talk/townTalk.js`). Starfall notices use id `star:<night>.<k>`, raids use `raid:<raidKey>`, and `EVENT_SINGLE_KINDS` need no id. Hidden kinds are filed without toasting. When `eventBoardOn` is false, `eventNoticeElsewhere` routes raid notices to `hudText` (`AddHUDText`) and other kinds to the seated chat sink; `eventHudLine` clears `hudMessageSink` for one call so fallback lines are not logged twice.
- **Toast Timers and Deduplication:** One toast card displays at a time for `EVENT_TOAST_MS` (`9` s) of visible HUD time, pausing while the HUD is hidden. Up to `EVENT_TOASTS_KEPT` (`6`) cards wait, and matching events append up to `EVENT_TOAST_NOTES` (`3`) notes per card, granting at least `EVENT_NOTE_MIN_MS` (`5` s) and dropping identical notes within `EVENT_NOTE_SAME_MS` (`60` s).
- **Seed Grace, Reach, and Accessibility:** `eventAnnouncements` (`src/worldEvents/eventBoard.js`, driven by `src/scenes/world.js`) tracks `model.every` across all kinds and skips events whose `since` predates `watchFrom` by more than `EVENT_SEED_GRACE_MS` (`5` s). Raids announce only inside their region or within `EVENT_RAID_REACH_M` (`25` km), never beyond the Veil. Screen readers read the polite atomic `EVENT_BOARD_LIVE_ID` region on card or note changes while the visual plate stays `aria-hidden`.
