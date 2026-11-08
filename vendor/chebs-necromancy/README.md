# Cheb's Necromancy

Adds Necromancy to the game.

- Author: Chebgonaz (Cheb Gonaz) - https://github.com/jpw1991/daggerfall-chebs-necromancy, Nexus daggerfallunity mod 714
- Version: 0.0.24
- Source file: `chebs-necromancy.dfmod`, imported 2026-11-06 with `tools/importDfmod.mjs`
- Licence: the Unlicense (public domain), as the mod's repository says - see LICENSE

## What the bundle holds

- TextAsset: 37
- AssetBundle: 1

## Port status

The mod's C# is these .cs files (the bundle carries its scripts as text). Ported by hand, 2026-11-06:

- `src/systems/necromancy/necroLaw.js` - the numbers: the nine effects, the reagents, each minion's health and mace
  (the *Spawner.cs ScaleMinion sums), the corpse drop, grave robbing's roll and tables, the ready-made spells, the
  Necromancer's career (the mod's config defaults, `modsettings.json`).
- `src/systems/necromancy/necromancy.js` - the cast (Chance and Magnitude, the reagents spent on a rise), the minions'
  party and save, the corpse item (template 6666), the corpse on a humanoid's body, the graves, the Necromancer's kit.
- `src/systems/necromancy/necroCareer.js` - the Necromancer, a pick of its own in character creation.
- `src/scenes/necroHost.js` - the minions in the world, through Bunnyfall's companion layer (scenes/crewAshore.js)
  instead of UndeadMinion.cs's follow brain: every door, fast travel, the catch-up, and seen by everyone nearby.

Departures, each said in necroLaw.js: a minion's health is the mod's or the creature's own, the more; the mod's
integer-division `factor` is the division it means; minions take Bunnyfall's companion slots; the mod's custom
character-creation wizard and its BIOG18T0 quiz are not used (the Necromancer takes the nearest stock class's
biography, as a custom class does); the console commands are not ported.
