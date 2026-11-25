---
slug: legacy-arc-overview
title: "Legacy Arc: Family Lines, Lineage Models, and Succession"
domain: legacy
kind: overview
parent: null
files:
  - src/systems/legacy/family.js
  - src/systems/legacy/legacyLaw.js
  - src/systems/legacy/store.js
  - src/systems/legacy/age.js
  - src/systems/legacy/legacyHost.js
  - src/ui/familyPages.js
  - src/ui/legacyModelChoice.js
  - server-account/src/legacy.js
  - server-account/migrations/0084_legacy.sql
routes:
  - /v1/realm/lineage
  - /v1/realm/lineages
tables:
  - lineages
  - realm_characters
replacesBible:
  - "06-Systems/Legacy-Arc.md"
related:
  - legacy-family-records-and-heir-birth
  - legacy-heirlooms-remains-and-blessing
  - legacy-courtship-and-online-wedding
  - legacy-online-death-hold-and-revival
  - realm-saves-and-mod-save-hooks
  - homes-camps-guilds-and-territories
invariants:
  - "Lineage models are `LINEAGE_MODELS` (`bloodline`, `enduring`) plus `NO_LINEAGE` (`'none'`), chosen at chargen in `legacyModelChoice.js`."
  - "A family record outlives individual saves: offline under `FAMILY_KEY_PREFIX` (`dagger.legacy.family.`), online in `lineages` keyed by (`player`, `id`) with `LINEAGE_ID_RE` ids."
  - "Online lineage records are capped at `LINEAGE_MAX_BYTES` (`128 KiB`), `LINEAGE_PEOPLE_MAX` (`400`) people, and `LINEAGES_MAX` (`40`) lines per account."
  - "`realm_characters` links a character to its line through `lineage_id` and `person_id`, unique per (`player`, `lineage_id`, `person_id`)."
traps:
  - "`putLineage` writes with a `base` revision; merging client copies must go through `mergeFacts` and `mergeFamily` rather than overwriting, or concurrent tabs drop members."
  - "A character with no line shows no Family tab; never assume a family exists for `NO_LINEAGE` saves."
dfu: []
tags:
  - legacy
  - lineage
  - family
  - permadeath
  - succession
---

# Legacy Arc: Family Lines, Lineage Models, and Succession

The Legacy system tracks multi-generational families, death consequences, heir succession, courtship, and online resurrection across single-player and realm saves (`src/systems/legacy/`, `src/systems/legacy/legacyHost.js`, and `server-account/src/legacy.js`).

- **Lineage models (`legacyModelChoice.js`, `age.js`):** Characters pick a model from `LINEAGE_MODELS` (`bloodline` or `enduring`) or `NO_LINEAGE` (`'none'`) during character creation. Under `bloodline`, death permanently kills the active member and hands the family line to an heir or sibling. Under `enduring`, death charges an Arkay lifespan penalty in `src/systems/legacy/age.js` via `payToll` instead of retiring the character immediately. Saves created with `NO_LINEAGE` omit the Family tab in `src/ui/familyPages.js`.
- **Persistence and synchronization (`store.js`, `0084_legacy.sql`):** Family trees outlive individual character saves. Offline trees persist in browser storage under `FAMILY_KEY_PREFIX` (`dagger.legacy.family.`), while online trees persist in the `lineages` table keyed by (`player`, `id`) with `LINEAGE_ID_RE` identifiers and linked to `realm_characters` by unique (`player`, `lineage_id`, `person_id`) rows.
- **Account limits and conflict merging (`server-account/src/legacy.js`):** `/v1/realm/lineage` and `/v1/realm/lineages` cap each account at `LINEAGES_MAX` (`40`) lines, `LINEAGE_PEOPLE_MAX` (`400`) members per line, and `LINEAGE_MAX_BYTES` (`128 KiB`) per payload. Because `putLineage` checks a `base` revision, concurrent updates must merge through `mergeFacts` and `mergeFamily`. Birth transitions reload the game with the `legacyborn` URL parameter in `src/main.js`.
