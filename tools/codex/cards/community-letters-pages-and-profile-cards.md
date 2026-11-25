---
slug: community-letters-pages-and-profile-cards
title: "Offline Letters, Shared Journal Pages, and Inspect Profile Cards"
domain: multiplayer
kind: subcard
parent: community-arc-overview
files:
  - server-account/src/letters.js
  - server-account/migrations/0007_letters.sql
  - src/net/letterLaw.js
  - src/net/mail.js
  - src/net/journalPage.js
  - src/ui/pageWindow.js
  - src/ui/notebook.js
  - src/ui/graphemes.js
  - src/player/socialPick.js
  - src/net/profileCard.js
  - src/ui/profileWindow.js
  - src/ui/playerBadge.js
  - src/ui/socialMenu.js
  - src/net/wire.js
  - tools/mailProbe.mjs
  - tools/journalProbe.mjs
  - tools/profileProbe.mjs
routes: []
tables:
  - letters
replacesBible:
  - "06-Systems/Community-Arc.md"
related:
  - community-arc-overview
  - peer-word-letters-and-worn-offers-overview
  - chat-safety-overview
invariants:
  - "Letters (src/net/letterLaw.js): LETTER_SUBJECT_MAX = 60, LETTER_BODY_MAX = 800, LETTER_LINES_MAX = 40. Senders are limited to LETTERS_SENT_MAX = 20 per LETTERS_SENT_WINDOW_S (1 h) and LETTERS_PAIR_MAX = 5 per hour to one reader."
  - "LETTERS_INBOX_MAX = 50. A full box refuses the sender inside the INSERT and never deletes older mail."
  - "Only registered accounts can send or receive letters. Muted senders are refused. Every read or delete is scoped by `WHERE id = ? AND to_id = ?`."
  - "MailBox polls every MAIL_POLL_MS = 3 min."
  - "Pages (pageLaw in src/net/wire.js): PAGE_HEAD_MAX = 120, PAGE_LINE_MAX = 80, PAGE_LINES_MAX = 60, PAGE_HZ_MAX = 1."
  - "PageOffers: PAGE_HOLD_MS = 5 min, PAGE_NOTICE_MS = 30 s, PAGE_OFFERS_MAX = 8. Pages go to peers within SOCIAL_REACH (MOBILE_NPC_ACTIVATION_DISTANCE)."
  - "Profile cards: CARD_HZ_MAX = 4, CARD_WAIT_MS = 3000. createCardAnswerGate allows one answer per asker per CARD_ANSWER_MS = 2000, tracking up to CARD_ANSWER_ASKERS_MAX = 64 askers."
  - "Card bounds: attributes up to MAX_STAT_VALUE = 100, CARD_LEVEL_MAX = 999, CARD_VITAL_MAX = 99999, fatigue in the sheet's /64 figure."
traps:
  - "breakableNote (src/ui/notebook.js) breaks overlong runs at grapheme clusters (MAX_LINE_LENGTH = 70) so DFU-style WrapLinesIntoNote never sees an unbreakable word."
  - "letters is distinct from letters of credit (see peer-word-letters-and-worn-offers-overview)."
dfu:
  - Assets/Scripts/Game/Player/PlayerNotebook.cs
tags:
  - mail
  - letters
  - journal
  - notebook
  - inspect
  - profile-card
---

# Offline Letters, Shared Journal Pages, and Inspect Profile Cards

Account mail, peer notebook pages, and inspect cards share grapheme-safe text rules across `server-account/src/letters.js`, `src/net/mail.js`, `src/net/journalPage.js`, and `src/net/profileCard.js`.

## Offline Account Letters

Migration `0007_letters.sql` defines `letters` (`id`, `to_id`, `from_id`, `from_name`, `subject`, `body`, `sent_at`, and `read_at`, indexed by `idx_letters_to(to_id, sent_at)`), distinct from economy letters of credit. `src/net/letterLaw.js` caps mail at `LETTER_SUBJECT_MAX = 60`, `LETTER_BODY_MAX = 800`, and `LETTER_LINES_MAX = 40`, limiting registered, unmuted accounts to `LETTERS_SENT_MAX = 20` per `LETTERS_SENT_WINDOW_S` (1 hour) and `LETTERS_PAIR_MAX = 5` per recipient per hour. Inboxes hold `LETTERS_INBOX_MAX = 50`, rejecting overflow inside the `INSERT` without deleting older rows. Reads and deletes filter by `WHERE id = ? AND to_id = ?`, while `MailBox` polls every `MAIL_POLL_MS = 3` minutes.

## Shared Journal Pages and Profile Cards

- **Journal pages (`src/net/journalPage.js`):** `pageLaw` (`src/net/wire.js`) enforces `PAGE_HEAD_MAX = 120`, `PAGE_LINE_MAX = 80`, `PAGE_LINES_MAX = 60`, and `PAGE_HZ_MAX = 1` within `SOCIAL_REACH` (`MOBILE_NPC_ACTIVATION_DISTANCE`). `PageOffers` keeps up to `PAGE_OFFERS_MAX = 8` offers for `PAGE_HOLD_MS = 5` minutes (`PAGE_NOTICE_MS = 30` seconds). `breakableNote` (`src/ui/notebook.js`) splits long grapheme runs at `MAX_LINE_LENGTH = 70` before `WrapLinesIntoNote`.
- **Inspect cards (`src/net/profileCard.js`):** `composeCard` clamps stats to `MAX_STAT_VALUE = 100`, `CARD_LEVEL_MAX = 999`, `CARD_VITAL_MAX = 99999`, and `/64` sheet fatigue under `CARD_HZ_MAX = 4` and `CARD_WAIT_MS = 3000`. `createCardAnswerGate` permits one reply per asker per `CARD_ANSWER_MS = 2000` across `CARD_ANSWER_ASKERS_MAX = 64`, rendered with `glyphSvgNode` (`src/ui/playerBadge.js`).
