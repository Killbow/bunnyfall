# POI document v2

A v2 document is a v1 document plus the keys below. The law is `src/poi/poiLaw.js` (version gate and v1 rules),
`poiLawV2.js` (v2 shapes and references) and `poiTradeLaw.js` (items against the game). Run `node --test tools/poiLaw.test.mjs`.
`tools/poiV2Examples.mjs` is a document that holds the four worked examples from the spec.

## Compatibility

- `POI_DOC_VERSIONS = [1, 2]`. A stored v1 document stays valid. v2 keys are unknown to it, so a v1 document that carries
  `groups` is still refused.
- `POI_DOC_VERSION` stays `1`, because the legacy editor writes it. The standalone builder writes `2`.
- Size: 96 KiB for v1, 256 KiB for v2 (`poiDocBytesOf`). Library shelf entries stay v1.
- Nothing writes v2 yet. The game reads a v2 document through the law, but its runtime ignores the new keys.

## What v2 adds

| Key | Limit | Shape |
|---|---|---|
| `groups` | 64, 8 deep | `{ key, name, parent, visible, locked }`. A cycle is refused. |
| `interior` | one | `{ shellModel: 1..999999 or null, hiddenBaseKeys[≤200] }`, keys as `DECOR_BASE_KEY_RE`. |
| `parts[]` | 128 | v1 part, or `arch3d` (1..999999) in place of `mesh` and `materials`. Plus `group, visible, locked`. |
| `lights[]`, `npcs[]` | 32 | `group, visible, locked`. People also take `route, dialogue, trade, radius (1..20), showWhen`. |
| `flats` | 200 | `kind` is `billboard`, `mount` or `paperdoll`. See below. |
| `routes` | 32, 2..128 waypoints each | `{ key, name, mode: loop, pingpong or once, waypoints[{ key, name, t, radius, waitS, onArriveEvent? }] }` |
| `encounters` | 16, 32 spawns each | Centre, radius, `aggression` (hostile or passive), `respawn`, `complete`, `onStart`, `onComplete`. |
| `interactives` | 64 | `chest, door, switch, quest_object, trigger`, each with its own states, an appearance and a radius. |
| `dialogues` | 32, 64 nodes each | Nodes of speech with 1..8 replies. A reply goes to a node, closes, opens a trade, runs a recipe or starts an event. |
| `trades` | 32, 8 recipes each | Required and rewarded item stacks, gold, a limit mode, cooldown and success event. |
| `variables` | 64 | Boolean, number or string. Scope is `event`, `instance`, `character` or `poi_global`. |
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
7. **No v2 submission gate.** The old editor goes after the push, so nothing needs gating.
8. **Potions** are given as the item reward of a quest, once the quest runtime (4) exists. Until then a trade can only hand out an empty bottle.
