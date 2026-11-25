---
slug: "guild-probation-reviews-and-online-repute-overview"
title: "Guild Probation Reviews, Promotion Timing, and Repute Gates"
domain: "guilds"
kind: "overview"
parent: null
files:
  - "src/guilds/guilds.js"
  - "src/guilds/guildServiceFlow.js"
  - "src/systems/quest/onlineRepute.js"
  - "src/systems/quest/offerFlow.js"
  - "src/systems/quest/questBridge.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/world.js"
  - "src/guilds/affiliations.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Guild-Words.md"
related:
  - "guild-roll-notices-and-paid-standing"
  - "guild-seat-line-and-standing-words-overview"
  - "guild-repute-gate-and-standing-pace"
  - "chapters-roll-guarantees-overview"
invariants:
  - "The online guild quest pool is filtered by ONLINE_REPUTE_GATES ({ N0B10Y03: 10, N0B20Y02: 20 }) at the single seam questBridge.js -> offerFlow.js offerGuildQuest."
  - "The Mages Guild uses level for quest requirements: `if (guild.isSatisfyQuestReqByLevel?.() && level > rank) rank = level;`."
  - "The guild popup is wired only in worldModes.js; the Roll tracker is wired only in world.js through rollNoticeHost.js."
  - "A review happens at a hall visit once DAYS_BETWEEN_RANK_CHANGES (28) have passed; reviewDaysLeft returns 0 when a review is due."
  - "Standing below 0 means probation and another 28 days. Expulsion happens only at a review that finds the member already on probation with standing + owed below GUILD_EXPEL_BELOW (-10)."
  - "PROMO-NOW: online, a promotion does not wait the 28 days. Demotion, probation and expulsion keep DFU's wait."
traps:
  - "QSCRIPT-FREE (waiving own-guild losses from quest scripts) was withdrawn because it allowed looting in N0B10Y03 and killing the mage in N0B20Y02 without penalty; REPUTE-GATE replaced it."
  - "Offline play keeps DFU's GetGuildQuestPool behavior."
  - "Owed standing counts toward the expulsion check (standing + owed)."
dfu:
  - "MagesGuild.cs"
tags:
  - "guilds"
  - "probation"
  - "review"
  - "repute-gate"
---

# Guild Probation Reviews, Promotion Timing, and Repute Gates

Guild reviews, service checks, and online quest gating span `src/guilds/guilds.js`, `src/guilds/guildServiceFlow.js`, `src/guilds/affiliations.js`, `src/systems/quest/onlineRepute.js`, `src/systems/quest/offerFlow.js`, and `src/systems/quest/questBridge.js`, with the guild popup wired in `src/scenes/worldModes.js` and the Roll notice hook in `src/scenes/world.js`.

## Hall Reviews, Probation, and Service Access

A hall visit runs a review once `DAYS_BETWEEN_RANK_CHANGES` (`28`) days elapse, where `reviewDaysLeft` returns `0` when due, though online promotions apply immediately without the 28-day wait (`PROMO-NOW`). Standing below `0` places the member on probation for another `28` days, and `probationWords` formats `'skills'` and `'ends'` variants while `reviewedRank` and `reviewWarnings` populate Standing page and hall notices. Expulsion triggers only when a member already on probation reaches a review with `standing + owed` below `GUILD_EXPEL_BELOW` (`-10`). When no rank up to the ceiling unlocks a service but `SEAT_RANK.officer` (`8`) or `SEAT_RANK.master` (`9`) does, `serviceAccess` refuses with `guild.seatService`.

## Online Quest Repute Gates

At the `questBridge.js` to `offerFlow.js` (`offerGuildQuest`) seam, `ONLINE_REPUTE_GATES` (`{ N0B10Y03: 10, N0B20Y02: 20 }`) filters online guild quests by standing, while the Mages Guild (`MG_Quests`, faction `63`) compares against character level whenever `guild.isSatisfyQuestReqByLevel?.()` holds and `level > rank`.
