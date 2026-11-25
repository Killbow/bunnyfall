---
slug: hidden-staff-guild-last-seen
title: "Guild Roster Last-Seen Timestamps for Hidden Staff"
domain: account
kind: subcard
parent: hidden-staff-uncounted-overview
files:
  - server-account/src/staffHidden.js
  - server-account/src/guilds.js
  - server-account/src/discordIntegration.js
  - src/net/guildBook.js
  - src/ui/socialPanel.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Hidden-Uncounted.md"
related:
  - hidden-staff-uncounted-overview
  - guild-window-and-member-presence
  - staff-events-overview
invariants:
  - "While Hide me is on, every guild member, including the hidden staff member, sees that member as last seen at `hiddenSince`. That is the first hidden token after their latest Show myself."
  - "`guildMemberOnline` (guildBook.js) is the single reading behind both the online dots and the online count."
traps:
  - "guilds.js must load staffHidden.js with a dynamic `import()` to break the realm -> guilds -> staffHidden -> staff -> market -> realm import cycle."
  - "`viewOf` should ask about hidden status only for accounts that use Hide me."
dfu: []
tags:
  - guild
  - staff
  - hidden
  - presence
---

# Guild Roster Last-Seen Timestamps for Hidden Staff

Guild rosters and Discord integrations freeze the presence timestamp of hidden staff accounts at the start of hidden mode so guildmates and bridges never detect live sessions.

- **Account guild view and cycle guard (`server-account/src/guilds.js`, `server-account/src/staffHidden.js`):** While Hide me is active, `viewOf` reports the staff member as last seen at `hiddenSince`, the timestamp of the first hidden token after their latest Show myself action. `viewOf` checks hidden status only for accounts that use Hide me, and `guilds.js` loads `staffHidden.js` via dynamic `import()` to break the `realm -> guilds -> staffHidden -> staff -> market -> realm` import cycle.
- **Client guild book and self-row (`src/net/guildBook.js`, `src/ui/socialPanel.js`):** The account payload marks the row of the viewing staff member with `hidden` so the viewer does not appear online to themselves. `guildMemberOnline` in `guildBook.js` is the single check behind both member online dots and the online count in `socialPanel.js`.
- **Discord bridge filtering (`server-account/src/discordIntegration.js`):** `discordIntegration.js` reads `hiddenSince` to omit hidden staff from online lists and leaderboards and to refuse their chat.
