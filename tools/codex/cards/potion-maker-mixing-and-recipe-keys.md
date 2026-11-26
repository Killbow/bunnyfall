---
slug: potion-maker-mixing-and-recipe-keys
title: "Potion Maker Mixing and Recipe Keys"
domain: items
kind: subcard
parent: professions-arc-overview
files:
  - src/items/potions.js
  - src/items/potionRecipes.js
  - src/ui/potionMakerWindow.js
  - src/professions/potionMakerHost.js
routes: []
tables: []
related:
  - professions-arc-overview
  - professions-crafting-provenance-and-master-art
invariants:
  - "`potionRecipeKey` is the DFU recipe hash (`PotionRecipe.GetHashCode`) in int32: it starts at 17 and folds each id as `hash * 23 + id`, wrapping through `Math.imul`. `potionKeyFromCauldron` sorts the template indexes before hashing. An empty or missing list returns 0."
  - "A failed mix (`mixCauldron` returns `failed`) makes nothing, as in DFU; classic makes a useless potion. The caller spends the ingredients either way."
traps:
  - "`consumeCauldron` stops at the first ingredient found in neither the pack nor the wagon and returns `broke`, leaving the rest of the cauldron unspent, as in DFU."
dfu:
  - Assets/Scripts/Game/MagicAndEffects/PotionRecipe.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallPotionMakerWindow.cs
tags:
  - potions
  - alchemy
  - dfu-parity
---

# Potion Maker Mixing and Recipe Keys

`src/items/potionRecipes.js` holds the recipe table and the recipe hash, and `src/items/potions.js` mixes a cauldron and spends its ingredients.

- **Recipe keys:** `potionKeyFromCauldron` sorts the cauldron template indexes and hashes them with `potionRecipeKey`, so the order the player adds ingredients does not matter. `mixCauldron` looks the key up in the recipe table and returns either the recipe or a failed mix.
- **Spending:** `consumeCauldron` takes each ingredient from the pack first, then from the wagon, and stops at the first one it cannot find.
- **Online brewing:** `src/professions/potionMakerHost.js` routes an accepted mix through the profession brew when the character is online at an alchemy station. Elsewhere the maker mixes on the client as DFU does.
