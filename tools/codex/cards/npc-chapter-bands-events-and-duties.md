---
slug: npc-chapter-bands-events-and-duties
title: "NPC Chapter Strength Bands, Season Events, and Duties"
domain: multiplayer
kind: subcard
parent: guilds-made-plain-overview
files:
  - src/net/npcChapterLaw.js
  - server-account/src/npcChapters.js
  - src/ui/noticeWindow.js
  - src/systems/livingWorld/lines.js
  - src/net/identityToken.js
  - src/ui/playerBadge.js
  - src/ui/hallOfRecords.js
routes:
  - /v1/chapters/list
  - /v1/chapters/halls
  - /v1/chapters/history
  - /v1/chapters/patron
  - /v1/chapters/back
  - /v1/chapters/roll
tables:
  - npc_chapters
  - npc_chapter_weeks
  - npc_chapter_merit
  - npc_chapter_seats
  - npc_chapter_history
  - npc_chapter_patron_bids
replacesBible:
  - "11-Multiplayer/Guilds-Made-Plain.md"
related:
  - guilds-made-plain-overview
  - professions-board-and-writs
  - seats-fortifications-and-seasons
  - living-world-overview
invariants:
  - "`CHAPTER_BANDS` (`src/net/npcChapterLaw.js`) partitions chapter Strength at floors `0`, `20`, `70`, and `90`: Failing (`1.25x` price, `0.5x` writs), Steady (`1x` price, `1x` writs), Thriving (`0.9x` price, `1.5x` writs), and Ascendant (`0.8x` price, `1.5x` writs)."
  - "`failingWeekAfter` deducts an extra `CHAPTER_FAILING_FALL` (`2`) Strength from a chapter that began the week in Failing unless weekly Merit reaches at least `CHAPTER_FAILING_MEETS` (`2`) times target."
  - "`chapterHallFactor` caps a patron Company member's hall price multiplier at `Math.min(bandPrice, CHAPTER_PATRON_PRICE)` (where `CHAPTER_PATRON_PRICE` equals Thriving's `0.9x`), so a patron never pays more than a non-patron."
  - "Duties lines promise Merit only when `meritEarnsOf(merit)` holds (not before the guild week opens, not at the weekly cap, and not for a different chapter)."
traps:
  - "Retired or unknown event ids in `npc_chapter_history` fail `chapterEventOk` and resolve to Calm (`null`) in `chapterSeasonOf` without mutating historical rows."
  - "When a hall is shut at the end of a Crackdown, `chapterBandEffectsLine` with `shut` suppresses price, shelf, and writ modifiers and prints only the Failing decay or Ascendant High Master clause."
  - "The `'highmaster'` title (`CHAPTER_TITLES` in `src/net/identityToken.js` and `src/ui/playerBadge.js`) applies to the Master's chair holder only while the chapter stands at `CHAPTER_ASCENDANT_FROM` (`90`) or higher, and never for a hidden guild."
dfu: []
tags:
  - chapters
  - bands
  - season-events
  - duties
  - guild3d
  - guild3e
---

# NPC Chapter Strength Bands, Season Events, and Duties

`src/net/npcChapterLaw.js` and `server-account/src/npcChapters.js` govern regional NPC guild chapters (`npc_chapters`, `npc_chapter_weeks`, `npc_chapter_merit`, `npc_chapter_seats`, `npc_chapter_history`, and `npc_chapter_patron_bids`), surfaced across town notice boards (`src/ui/noticeWindow.js`), living-world rumor lines (`src/systems/livingWorld/lines.js`), player badges (`src/ui/playerBadge.js`), and the Hall of Records (`src/ui/hallOfRecords.js`).

## Strength Bands, Failing Decay, and Patron Pricing

`CHAPTER_BANDS` maps chapter Strength (`0..100`) across four floors (`0` Failing, `20` Steady, `70` Thriving, and `90` Ascendant (`CHAPTER_ASCENDANT_FROM`)). Under `failingWeekAfter`, a chapter starting the week in Failing loses an additional `CHAPTER_FAILING_FALL` (`2`) Strength unless members earn `CHAPTER_FAILING_MEETS` (`2`) times the weekly Merit target. While a chapter stands in Ascendant, the holder of the Master's chair (`npc_chapter_seats`) bears the `'highmaster'` title (`CHAPTER_TITLES`). Patron Companies (`POST /v1/chapters/patron`) receive `chapterHallFactor`, paying `Math.min(ownBandPrice, CHAPTER_PATRON_PRICE)`. `CHAPTER_NEWS` supplies town rumors for non-Steady bands.

## Weighted Season Events and Notice-Board Duties

Each season draws from five weighted `CHAPTER_EVENTS` (`calm: 30`, `schism: 15`, `succession: 10`, `crackdown: 10`, `rivalry: 15`) with modifiers in `CHAPTER_EVENT_EFFECTS` (such as `crackdownShut: 30` and `rivalrySwing: 10`). Schism contests doctrine (`chapterBackOk` sides via `POST /v1/chapters/back`) whereas Succession contests leadership. Legacy event ids in `npc_chapter_history` (`/v1/chapters/history`) fail `chapterEventOk` and read as Calm.

On the notice board (`/v1/chapters/list`, `/v1/chapters/halls`, `/v1/chapters/roll`), `chapterDutiesLine`, `chapterSeasonLine`, `chapterRollLines`, `chapterChronicleLine`, `seatLineOf`, and `bookCappedLine` render chapter state, promising Merit only when `meritEarnsOf(merit)` passes.
