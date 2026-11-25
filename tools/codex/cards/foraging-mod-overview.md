---
slug: foraging-mod-overview
title: "Foraging Mod Port: Templates, Switch, and Lanes"
domain: systems
kind: overview
parent: null
files:
  - src/professions/foragingLaw.js
  - src/professions/foragingInstall.js
  - src/professions/foragingCore.js
  - src/mods/modSettings.js
  - src/scenes/shared.js
  - vendor/foraging/ItemTemplates.json
routes: []
tables: []
replacesBible:
  - "06-Systems/Foraging.md"
related:
  - foraging-tool-checks-and-yields
  - foraging-loot-hooks-and-forage-fix
  - foraging-online-wait-and-profession-tools
  - professions-arc-overview
  - market-vendors-and-professions
invariants:
  - "Twelve templates, `FT` 1600-1611 (Wood-Axe, Pick-Axe, Sickle, Fishing-Net, Wood Bundle, Fish, Spade, Basket, Apple, Orange, Mushroom, Egg), all group `FORAGING_GROUP` = 'UselessItems2', variants 0, minted with stackCount 1."
  - "The eight tools/bundle-class rows carry hitPoints 50. `wear` lowers condition by 1 per completed use."
  - "`registerCustomTemplates(FORAGING_TEMPLATES)` runs at module import, unconditionally, so saved items never lose their template when the switch is off."
  - "The switch is `modSetting('foraging', 'Enabled')`, default true (author Harbinger451). Off, it disables tool use, foods, the quest list, loot hooks and the console command."
traps:
  - "There are no per-tool classes. Every tool shares one `useForagingTool` handler keyed by templateIndex."
  - "`installForaging` is idempotent (`_installed`). Tests must call `_resetForagingInstall` so the three loot subscribers are removed too."
dfu: []
tags:
  - foraging
  - mod-port
  - harbinger451
  - item-templates
  - mod-switch
---

# Foraging Mod Port: Templates, Switch, and Lanes

The Foraging mod port (author Harbinger451) spans `src/professions/foragingLaw.js`, `src/professions/foragingInstall.js`, `src/professions/foragingCore.js`, and `vendor/foraging/ItemTemplates.json`. At module import, `registerCustomTemplates(FORAGING_TEMPLATES)` registers twelve templates (`FT` 1600-1611 under `FORAGING_GROUP` `'UselessItems2'`) unconditionally so existing saves keep valid items even when `modSetting('foraging', 'Enabled')` (`src/mods/modSettings.js`) is turned off.

- **Install and Registration**: `installForaging` (called from `src/scenes/shared.js` and reset in tests via `_resetForagingInstall`) registers the `'ForagingQuests'` quest list, shared `useForagingTool` handlers for the six `TOOL_TEMPLATES` plus the Skinning Knife and five foods, the `Foraging_Tools` console command, three loot hooks, and seven vendored texture archives (`FORAGING_TEXTURE_ARCHIVES` 11600-11606).
- **Templates and Durability**: `FT` 1600-1611 defines Wood-Axe, Pick-Axe, Sickle, Fishing-Net, Wood Bundle, Fish, Spade, Basket, Apple, Orange, Mushroom, and Egg with `variants: 0` and `stackCount: 1`. The eight tool and bundle rows carry `hitPoints: 50`, and `wear` reduces condition by 1 per completed use.
- **Foods**: `FOODS` restores fatigue (scaled by `FATIGUE_MULTIPLIER`) and health or magicka, consuming one item per eat: Fish gives +15 fatigue and +5 health; Apple and Orange give +10 fatigue and +5 health; Mushroom gives +5 fatigue and +10 magicka; and Egg gives +15 fatigue and +10 health.
- **Lanes and Delivery**: Offline tool use follows the compiled IL verbatim while FORAGE-FIX repairs six quest defects (Q7-Q11 and Q13). All tool yields go directly into `entity.items` (the player pack) via `give`, never into the container collection where the tool was clicked.
