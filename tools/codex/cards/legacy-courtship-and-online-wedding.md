---
slug: legacy-courtship-and-online-wedding
title: "Courtship Deeds, Marriage, and the Online Wedding Exchange"
domain: legacy
kind: subcard
parent: legacy-arc-overview
files:
  - src/systems/legacy/courtDeeds.js
  - src/systems/legacy/marriage.js
  - src/systems/livingWorld/relations.js
  - server-account/src/legacy.js
  - server-account/migrations/0084_legacy.sql
routes:
  - /v1/realm/wed
  - /v1/realm/unions
tables:
  - realm_wed_halves
  - realm_unions
replacesBible:
  - "06-Systems/Legacy-Arc.md"
related:
  - legacy-arc-overview
  - living-world-relations-and-deeds
invariants:
  - "Courtship deeds (compliment, gift, hug, kiss) run at most once per resident per game day, stamped via `DEED_STAMPS`."
  - "A gift costs `GIFT_GOLD` (`50`); kisses unlock at `KISS_AT` (`34`), friendship at `FRIEND_AT` (`40`)."
  - "Online weddings complete only when both signed halves land in `realm_wed_halves` within `WED_HALF_LIFE_S` (`300` s); `realmWed` also accepts `withdraw`."
  - "Unions end via `endUnionsOf` with reason `died` or `gone`."
traps:
  - "Do not assume `realmWed` re-checks same-temple, combat, or age eligibility; verify both sides before changing `marriage.js` guards."
  - "A half posted past `WED_HALF_LIFE_S` expires; the partner must post a fresh half rather than reuse it."
dfu: []
tags:
  - courtship
  - marriage
  - wedding
  - online
---

# Courtship Deeds, Marriage, and the Online Wedding Exchange

Characters build affinity with living-world residents through daily courtship deeds and marry either offline residents or online players (`src/systems/legacy/courtDeeds.js`, `src/systems/legacy/marriage.js`, and `server-account/src/legacy.js`).

- **Daily courtship deeds (`courtDeeds.js`, `relations.js`):** Players can perform four courtship deeds with a resident: compliment, gift, hug, and kiss. `DEED_STAMPS` restricts each deed to once per target resident per in-game day. Giving a gift deducts `GIFT_GOLD` (`50` gold). As relation scores climb in `src/systems/livingWorld/relations.js`, kisses unlock at `KISS_AT` (`34`) and friendship status unlocks at `FRIEND_AT` (`40`).
- **Marriage and online wedding halves (`marriage.js`, `server-account/src/legacy.js`):** Client-side ceremony rules in `src/systems/legacy/marriage.js` check eligibility and build the inspect-card proposal via `wedCardOf`. For online player-to-player weddings, `/v1/realm/wed` (`realmWed`) validates the session lease, partner identity, and `WED_SID_RE` wedding session ID, storing each participant's half in `realm_wed_halves`. Both halves must arrive within `WED_HALF_LIFE_S` (`300` seconds) to seal the marriage in `realm_unions`, and either partner can cancel a pending proposal by sending `withdraw`. Because `realmWed` only enforces lease, partner, session ID, and half-life timing, client-side temple, combat, and adulthood checks in `marriage.js` must remain intact.
- **Dissolution (`0084_legacy.sql`, `legacy.js`):** Active unions remain queryable via `/v1/realm/unions` until `endUnionsOf` closes them with reason `died` or `gone`.
