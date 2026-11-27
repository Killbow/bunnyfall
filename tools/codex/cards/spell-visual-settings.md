---
slug: spell-visual-settings
title: Spell Effect and Aura Visibility
domain: magic
kind: subcard
files:
  - src/magic/spellVisualSettings.js
  - src/magic/effectVfxHost.js
  - src/magic/hostMagic.js
  - src/player/mwView.js
  - src/render/auraRing.js
  - src/ui/settingsMap.js
invariants:
  - "Spell effects and worn auras have independent first- and third-person preferences, with Full as the default."
  - "Changing the visual preferences leaves spell simulation, worn aura identity, and multiplayer replication intact."
tags:
  - spells
  - auras
  - paperdoll
  - settings
---

# Spell Effect and Aura Visibility

Settings > Graphics > Character display offers Full, Reduced, and Off for spell effects and cosmetic auras in each view. The preferences are local to this game installation. The shared camera selects the perspective for world effects in both the Eye of the Beholder and Morrowind camera modes.

The spell settings affect body motes, casting effects, projectile art, and impact effects. Readied spell hands, active spell icons, danger indicators, Light spell candles, and conjured walls remain visible. Weapon technique effects share the impact pass and retain full intensity. Aura opacity covers the whole worn effect and its associated light. The aura still appears to other players according to their own settings.
