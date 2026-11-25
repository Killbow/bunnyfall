---
slug: plain-words-family-how-it-works
title: "Family Tab How It Works Page"
domain: ui
kind: subcard
parent: plain-words-overview
files:
  - src/ui/familyPages.js
  - src/ui/enhancedMenu.js
  - src/systems/legacy/legacyLaw.js
  - src/systems/legacy/family.js
  - src/systems/legacy/settings.js
  - src/systems/legacy/heirloom.js
  - src/systems/legacy/marriage.js
  - src/systems/livingWorld/relations.js
routes: []
tables: []
replacesBible:
  - "10-UI/Plain-Words.md"
related:
  - plain-words-overview
  - legacy-arc-overview
  - legacy-family-records-and-heir-birth
  - legacy-heirlooms-remains-and-blessing
  - legacy-courtship-and-online-wedding
invariants:
  - "FAMILY_PAGE_SECTIONS adds `guide` ('How it works') after Family Tree, The House, and Hall of Ancestors."
  - "`familyGuide(model, tollShare)` returns `[name, words]` steps whose numbers come from the law: ESTATE_SHARE (0.25), ESTATE_MAX (9,900), BLOOD_MAX (3), and HEARTH_MAX (3) from legacyLaw.js, plus FRIEND_AT from relations.js and the remains share and cap."
  - "For a house with no model yet, the death step shows both the Enduring and the Bloodline text. The Arkay toll for an Enduring house uses `tollShare` from the Features tile."
traps:
  - "`drawGuidePage` reads `legacySettings().tollShare` inside a try and falls back to 0.06 if the settings are unread."
  - "With Legacy on and no house (none chosen, or online), the page still prints `noFamilyLine` before the guide."
dfu: []
tags:
  - family
  - legacy
  - guide
  - plain-ui
---

# Family Tab How It Works Page

The Family pause-menu tab includes a dedicated `'How it works'` guide section that explains Legacy mechanics using live constants from the legacy and relationship laws.

- **Section Placement and Navigation:** `FAMILY_PAGE_SECTIONS` in `src/ui/familyPages.js` appends `guide` (`'How it works'`) after Family Tree, The House, and Hall of Ancestors. The Family Tree page links directly to the guide through `FAMILY_HOWTO_WORDS` (`'New to the family? How it works'`), and `pauseFamily` and `drawGuidePage` are shared with the pause menu in `src/ui/enhancedMenu.js`.
- **Eight Law-Driven Steps:** `familyGuide(model, tollShare)` returns eight `[name, words]` entries: Your house, Death, Who carries on, What carries on, Heirlooms and remains, Marriage and children, Playing another, and The tree. Figures are interpolated from `ESTATE_SHARE` (`0.25`), `ESTATE_MAX` (`9,900`), `BLOOD_MAX` (`3`), and `HEARTH_MAX` (`3`) in `src/systems/legacy/legacyLaw.js`, `FRIEND_AT` in `src/systems/livingWorld/relations.js`, and heirloom and marriage rules across `src/systems/legacy/family.js`, `src/systems/legacy/heirloom.js`, and `src/systems/legacy/marriage.js`.
- **House Model and Fallback Rules:** When a house has not chosen a model yet, the Death step prints both Enduring and Bloodline rules, and `noFamilyLine` appears above the guide when no house exists. `drawGuidePage` reads `legacySettings().tollShare` (`src/systems/legacy/settings.js`) inside a `try` block and falls back to `0.06`.
