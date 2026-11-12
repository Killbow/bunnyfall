# POI document v2

A v2 document is a v1 document plus the keys below. The law is `src/poi/poiLaw.js` (version gate and v1 rules),
`poiLawV2.js` (v2 shapes and references) and `poiTradeLaw.js` (items against the game). Run `node --test tools/poiLaw.test.mjs`.
`tools/poiV2Examples.mjs` is a document that holds the four worked examples from the spec.

## Compatibility

- `POI_DOC_VERSIONS = [1, 2]`. A stored v1 document stays valid. v2 keys are unknown to it, so a v1 document that carries
  `groups` is still refused.
- `POI_DOC_VERSION` is `2`: both editors write v2. The in-game editor stamps a new POI v2 and writes a v1 POI as v2 at its
  first change (opening one changes nothing). `POI_SHELF_VERSION` is `1`.
- Size: 96 KiB for v1, 256 KiB for v2 (`poiDocBytesOf`). Library shelf entries stay v1: a part or light saved to the library from a v2
  POI loses its group, visibility, and lock.
- The in-game editor edits the DM content in its DM panel (`src/ui/poi/poiDmPanel.js`), except a spawn point's `route`, an
  object's `yaw`, and a `flat` appearance, which the game does not act on yet. It preserves those and every other v2 key it cannot
  edit yet (the interior, and a flat's picture and `scale`, which it can only reset to one) and lists them, read-only, in the
  POI's inspector.
- The game runs a POI's DM content for its approved revision. A draft runs it only in the in-game editor's Test (offline),
  where trades and events settle on a test copy of the builder's gold and items by the service's rules (an event that only
  gives, once), and persistent variables and claims are not stored. The service still refuses a draft's trade or event claim
  with `poi-not-live`.
- The in-game editor edits `groups` and the `visible` and `locked` marks in its outliner. `visible: false` hides a row in
  the editor only; the game still stands it. A locked row cannot be picked, moved, or deleted in the editor.

## What v2 adds

| Key | Limit | Shape |
|---|---|---|
| `groups` | 64, 8 deep | `{ key, name, parent, visible, locked }`. A cycle is refused. |
| `interior` | one | `{ shellModel: 1..999999 or null, hiddenBaseKeys[≤200] }`, keys as `DECOR_BASE_KEY_RE`. |
| `parts[]` | 128 | v1 part, or `arch3d` (1..999999) in place of `mesh` and `materials`. Plus `group, visible, locked`. |
| `lights[]`, `npcs[]` | 32 | `group, visible, locked`. People also take `route, dialogue, trade, radius (1..20), showWhen`. |
| `flats` | 200 | `kind` is `billboard`, `mount` or `paperdoll`. See below. |
| `routes` | 32, 2..128 waypoints each | `{ key, name, mode: loop, pingpong or once, waypoints[{ key, name, t, radius, waitS, onArriveEvent? }] }` |
| `encounters` | 16, 32 spawns each | Center, radius, `aggression` (hostile or passive), `respawn`, `complete`, `onStart`, `onComplete`. The game starts an idle encounter when the player walks within its radius, or by a `start_encounter` action; `respawn: on_reentry` starts it again on the next walk in. |
| `interactives` | 64 | `chest, door, switch, quest_object, trigger`, each with its own states, an appearance, a radius, an optional `keyItem`, and an optional `stateVar`: the key of a persistent text variable (`character` or `poi_global`) whose value, when it names one of the object's states, the object takes when the POI loads and when the variable changes. A door or chest opens when used (a locked one with its key item), an open door shuts, and an open door's `part` appearance is not drawn and does not block. A switch is off (`inactive`) or on (`active`), off by default in both editors, and each use flips it. A quest object cannot be used while `inactive`. A switch or quest object with a `keyItem` is used only by a holder of the key. A use changes the state, not the `stateVar` variable: events set that. |
| `dialogues` | 32, 64 nodes each | Nodes of speech with 1..8 replies. A reply goes to a node, closes, opens a trade, runs a recipe or starts an event. |
| `trades` | 32, 8 recipes each | Required and rewarded item stacks, gold, a limit mode, cooldown and success event. |
| `variables` | 64 | Boolean, number, or string. Scope is `event` (starts again from `initial` at each event run that nothing else started), `instance`, `character`, or `poi_global`. |
| `events` | 64 | A trigger, an optional condition tree, then and else action lists. |

Flat pictures follow `decorLaw.js`. A `billboard` has `flat: [archive 0..99999, record 0..511]` and no item. A `mount` is a
weapon (not arrows), a piece of armour or a trophy. A `paperdoll` is any other item shown as its picture. A person's flat
(`NPC_FLAT_ARCHIVES`) keeps scale 1. Other scales run 0.25 to 4.

Events: triggers are `enter_area`, `interact`, `npc_talk`, `waypoint_reached` and `chained`. Conditions are `all`, `any`,
`has_item`, `has_gold` and `var`, at most 16 checks and 4 levels. Actions are `say, set_var, set_state, start_encounter,
end_encounter, start_route, stop_route, spawn_npc, despawn_npc, open_dialogue, open_trade, give_item, take_item, give_gold,
take_gold, trigger_event`, at most 32 in
`then` and `else` together. A `chained` event that nothing starts is refused. Events that start each other with no delay in a
circle are refused.

## Decisions

1. **Events may give and take items and gold.** The server settles them like trades, with a claim per event and character, before the runtime runs them.
2. **Limits are per parent.** 128 waypoints per route, 32 spawn points per encounter, 24 creatures per encounter, 16 per spawn.
3. **Foe names and levels.** No custom foe name. A spawn may set an exact `level`.
4. **Runtimes to build** for `factionId`, quest conditions, timers, `storage`, `station` on flats and chest contents. Each gets its schema fields in the same milestone as its runtime, not before.
5. **Gold bound.** Up to the save's gold limit. Approvers decide what is sane.
6. **Item stacks are plain.** No `enchant` key anywhere. Done in the law and tests.
7. **No v2 submission gate.** Both editors write v2 and the in-game editor preserves the v2 keys it cannot edit, so nothing needs gating.
8. **Potions** are given as the item reward of a quest, once the quest runtime (4) exists. Until then a trade can only hand out an empty bottle.
