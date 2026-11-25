---
slug: guild-heraldry-divisions-and-charges
title: "Guild Heraldry: 40 Devices, Parted Fields, and Charge Colors"
domain: account
kind: subcard
parent: guild-overhaul-overview
files:
  - src/net/heraldryLaw.js
  - src/ui/heraldryArt.js
  - src/ui/heraldrySwatch.js
  - src/guilds/hallBanners.js
  - server-account/src/guilds.js
routes:
  - /v1/guilds/heraldry
tables:
  - guilds
replacesBible:
  - "11-Multiplayer/Guild-Overhaul.md"
related:
  - guild-overhaul-overview
  - seats-arc-overview
invariants:
  - "`heraldryOf` validates arms by requiring `field` to be any color except `HERALDRY_UNHELD` (`'ash'`), `border` to differ from `field`, and `device` to belong to the 40 `HERALDRY_DEVICES`."
  - "`HERALDRY_DIVISIONS` defines `'plain'` plus 7 parted divisions (`'pale'`, `'fess'`, `'bend'`, `'bend-sinister'`, `'quarterly'`, `'chevron'`, and `'saltire'`); any parted field requires `field2`, which cannot be `'ash'`, `field`, or `border`."
  - "The resolved device ink (`heraldryInk(h)`, returning `h.charge ?? h.border`) cannot match either `field` or `field2`."
  - "Plain arms without a separate charge color serialize to the three-key `{ field, border, device }` shape, preserving existing cache keys for stored banners and map pins."
traps:
  - "Divided-field cutouts in `src/ui/heraldryArt.js` (`drawBanner` and `shieldSvg`) clip per color region so adjacent fills do not bleed across border rims."
  - "Updating heraldry after initial setup burns `HERALDRY_CHANGE_DRAKES` (`500` Drakes) from the guild Drake treasury (`guilds.drakes`), never character or treasury gold."
dfu: []
tags:
  - guilds
  - heraldry
  - banners
  - rendering
---

# Guild Heraldry: 40 Devices, Parted Fields, and Charge Colors

`src/net/heraldryLaw.js` defines validation and cache keys for guild coats of arms, rendered across UI shields (`src/ui/heraldryArt.js`, `src/ui/heraldrySwatch.js`) and 3D hall and seat banners (`src/guilds/hallBanners.js`) and persisted via `POST /v1/guilds/heraldry` (`server-account/src/guilds.js`).

- **Divisions, devices, and color contrast (`src/net/heraldryLaw.js`):** `heraldryOf` validates up to five fields: `field`, `border`, `device` (from 40 entries in `HERALDRY_DEVICES`), optional `division` (from 8 entries in `HERALDRY_DIVISIONS`: `'plain'`, `'pale'`, `'fess'`, `'bend'`, `'bend-sinister'`, `'quarterly'`, `'chevron'`, and `'saltire'`), `field2`, and `charge`. Neither `field` nor `field2` may use the neutral `HERALDRY_UNHELD` (`'ash'`) color. To preserve visual contrast, `border` must differ from `field`, a parted division requires `field2` to differ from both `field` and `border`, and the effective charge ink `heraldryInk(h)` (`h.charge ?? h.border`) must differ from both `field` and `field2`.
- **Backward-compatible texture keys (`heraldryKey`):** When `division` is `'plain'` (or omitted) and no separate `charge` color is set, `heraldryOf` and `heraldryKey` emit the compact three-field shape (`field`, `border`, and `device`). `bannerKeyOf` in `src/guilds/hallBanners.js` and other banner renderers hashes `heraldryKey` directly so legacy arms retain their texture keys.
- **Rendering and Drake fee (`src/ui/heraldryArt.js`, `server-account/src/guilds.js`):** `drawBanner` and `shieldSvg` clip parted field regions per color to prevent seam fringes along shield borders. After a guild sets its initial arms, subsequent updates via `POST /v1/guilds/heraldry` burn `HERALDRY_CHANGE_DRAKES` (`500` Drakes) from the guild Drake treasury.
