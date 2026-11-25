---
slug: ui-arc-notices-and-message-boxes
title: "Notify Door, Enhanced Notices, and Input Message Boxes"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/ui/notify.js
  - src/ui/enhancedNotice.js
  - src/ui/messageBox.js
  - src/ui/inputMessageBox.js
  - src/ui/actionText.js
  - src/ui/drawWatchdog.js
  - src/ui/midScreenText.js
  - src/player/pointerLock.js
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - ui-arc-overview
  - ui-overlays-and-localization
  - ui-arc-input-dispatch-and-key-edges
invariants:
  - "src/ui/notify.js decides the model (messageBox, hudText, popupMessage, mountWindow route through registerPresenter priority); the draw decides the face (classic parchment vs enhanced notice)."
  - "NOTICE_SLIDE_MS = 260 and NOTICE_WATCHDOG_MS = 400 in src/ui/enhancedNotice.js; the watchdog re-arms on every draw and noticeRelease dismisses immediately."
  - "src/ui/inputMessageBox.js is the single DaggerfallInputMessageBox: Return closes then raises OnGotUserInput and calls noteInputBoxClosed; Escape cancels without callback or stamp."
  - "cursorToggleRefused (src/player/pointerLock.js) refuses the cursor toggle until strictly more than 0.3s after an input box closes."
traps:
  - "Adding .notice and notice-in in the same style pass skips the CSS transition; flush with offsetWidth first."
  - "DRAW_STALL_MS = 3000 in src/ui/drawWatchdog.js: release DOM faces by missed animation frames, never short wall-clock timers."
  - "latchBoxRows (src/ui/messageBox.js) resolves random textId variants once so boxes do not flicker per frame."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallMessageBox.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallHUD.cs
tags:
  - ui
  - notices
  - message-box
  - toasts
  - pointer-lock
---

# Notify Door, Enhanced Notices, and Input Message Boxes

`src/ui/notify.js` separates notice presentation priority from skin rendering while coordinating watchdogs, text latching, and input-box cursor guards.

- **Presenter Routing and Latched Text:** `messageBox(text, { highlightColor, previousWindow = true, push = true })`, `hudText`, `popupMessage`, and `mountWindow` route through `registerPresenter` in `src/ui/notify.js`. `latchBoxRows` in `src/ui/messageBox.js` resolves random `textId` variants once per box, while `ActionInputBox` and `ActionTextBox` in `src/ui/actionText.js` and `setMidScreenText` in `src/ui/midScreenText.js` handle action prompts and mid-screen overlays.
- **Enhanced Notices and Draw Watchdogs:** `src/ui/enhancedNotice.js` exports `drawEnhancedNotice`, `releaseEnhancedNotice`, `drawEnhancedToasts`, `noticeDraw`, `noticeFrame`, `noticeHold`, `noticeRelease`, and `noticeShown` with `NOTICE_SLIDE_MS = 260` and `NOTICE_WATCHDOG_MS = 400`. `armDrawWatchdog` and `disarmDraw` in `src/ui/drawWatchdog.js` clean up stalled DOM faces after `DRAW_STALL_MS = 3000`.
- **Input Message Boxes and Pointer Lock Guard:** In `src/ui/inputMessageBox.js`, Return closes the prompt, fires `OnGotUserInput`, and calls `noteInputBoxClosed`, whereas Escape cancels without a callback or timestamp. `cursorToggleRefused` in `src/player/pointerLock.js` blocks Enter cursor toggles until strictly more than 0.3s after an input box closes.
