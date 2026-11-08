# Bunnyfall Dungeons

Dungeons built with the [Bunnyfall Dungeon Editor](https://github.com/DaCookieCakes/BunnyfallEditor). The editor
writes this folder; nothing here is edited by hand. It ships empty: a designer's export fills it.

- `WorldDataPatches/*.json` - dungeon blocks as `dfe-worlddata-patch/1` patches: the editor's changes over a classic
  block, rebuilt from the player's own BLOCKS.BSA at load (`src/formats/worldData/worldDataPatch.js`). No Daggerfall
  data is shipped.
- `WorldData/*.json` - whole blocks and new places the editor built from scratch. A place's file is named
  `locationnew-bunnyfall-*`, which marks it as an editor dungeon: laid out as built, never made smaller, never copied
  as a spawned dungeon.
- `Models/<id>.json` - models built in the editor's model editor (`bunnyfall-dungeon-model/1`, ids from 7000001),
  registered by `src/world/editorModels.js`. Geometry and texture numbers only; the textures are the player's own.
- `dungeon-editor.mod.json` - the editor's mod manifest (title, author, id range).

The mod's one switch is `Enabled` (`src/systems/modSettings.js`, `bunnyfall-dungeons`). Offline it also needs Replace
Game Artwork (Asset Injection), like every world-data mod; online the room owns it
(`src/systems/online/onlineLane.js` ONLINE_ROOM_MOD_KEYS).

## Other editor mods

The editor can also export a project as a mod of its own, `vendor/<folder>/` with its own `dungeon-editor.mod.json`.
`src/systems/editorMods.js` finds every such folder and gives it the same switch, Features row and online room key as
this one, so a new editor mod needs no code. This folder is declared by hand and is skipped there.
