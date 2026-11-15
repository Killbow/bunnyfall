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
  object's `yaw`, and a `flat` appearance, which the game does not act on yet. It preserves those and the interior, which
  it cannot edit yet, and lists them, read-only, in the POI's inspector. It places and edits flat pictures, items, and
  mounts (`src/ui/poi/poiFlatUi.js`); a flat's `layer`, `pivot`, and `collide` are preserved when saving, and the flat's
  inspector says the game does not use them.
- The game runs a POI's DM content for its approved revision. A draft runs it only in the in-game editor's Test (offline),
  where trades and events settle on a test copy of the builder's gold and items by the service's rules (an event that only
  gives, once), and persistent variables and claims are not stored. The service still refuses a draft's trade or event claim
  with `poi-not-live`.
- A document with a stack's `recipe` or an encounter's `pacifiable` is refused by an older law. Deploy the account service
  before the site; an older game skips such a POI until it updates. An older service still settles a POI that is
  already live, but ignores `recipe`: a take accepts any Glass Bottle and a reward gives an empty one. Before rolling
  the service back, retire or roll back every live POI whose revision names a `recipe`.
- The service's trade and event-claim routes take `hand`, the records a player hands over, and take exactly those. An
  older service reads these routes' bodies only up to 4 KiB, so it refuses a larger hand with `body` (about 20 plain
  records, fewer for named or enchanted ones); it ignores a smaller `hand` and chooses the records itself. Deploy the
  account service before the site.
  During the rollout only, the service still chooses the records when a request has no `hand`; a later update refuses
  that.
- Migration 0209 copies every `event/<key>` claim row to `trade/event/<key>`, the name a recipe in a trade keyed `event`
  now counts under. Production's deploy applies migrations before the Worker deploy, so in the minutes between, the old
  code can still count such a recipe under the old name. Before the deploy, list the live POIs that have a trade keyed
  `event` (read-only):

  ```
  npx wrangler d1 execute daggerfall-accounts --remote --command "SELECT d.id, d.live_rev FROM poi_docs d JOIN poi_revs r ON r.poi_id = d.id AND r.rev = d.live_rev AND r.kind = 'doc' WHERE EXISTS (SELECT 1 FROM json_each(r.doc, '$.trades') t WHERE json_extract(t.value, '$.key') = 'event')"
  ```

  If it lists none, the gap has no effect. If it lists any, run the migration once more right after the Worker deploy
  (`npx wrangler d1 execute daggerfall-accounts --remote --file server-account/migrations/0209_poi_claim_names.sql`).
  It takes the larger count, never a sum, so a claim the old code made in the gap and one the new code made before the
  re-run count once. A per-character or per-account limit can end up over by one. A `global_stock` recipe can oversell
  by the smaller of the old and new code's sales in that time, so if a listed POI's trade keyed `event` has one, have an
  approver retire that POI before the deploy and roll it back to its revision after the re-run. The gap also includes
  the deploy's wait for the relay, not only the Worker upload.
- Offline, the game counts under the same names. When a POI loads, claims saved on the device under the old names are
  copied the same way (larger count, later time). The game saves claims with `names: 2` and skips the copy for a store
  that has it.
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
| `encounters` | 16, 32 spawns each | Center, radius, `aggression` (hostile or passive), `pacifiable`, `respawn`, `complete`, `onStart`, `onComplete`. The game starts an idle encounter when the player walks within its radius, or by a `start_encounter` action; `respawn: on_reentry` starts it again on the next walk in. `pacifiable` is optional and defaults to true; with `false`, language skills and Pacify or Charm spells do not work on the encounter's enemies. |
| `interactives` | 64 | `chest, door, switch, quest_object, trigger`, each with its own states, an appearance, a radius, an optional `keyItem`, and an optional `stateVar`: the key of a persistent text variable (`character` or `poi_global`) whose value, when it names one of the object's states, the object takes when the POI loads and when the variable changes. A door or chest opens when used (a locked one with its key item), an open door shuts, and an open door's `part` appearance is not drawn and does not block. A switch is off (`inactive`) or on (`active`), off by default in both editors, and each use flips it. A quest object cannot be used while `inactive`. A switch or quest object with a `keyItem` is used only by a holder of the key. A use changes the state, not the `stateVar` variable: events set that. |
| `dialogues` | 32, 64 nodes each | Nodes of speech with 1..8 replies. A reply goes to a node, closes, opens a trade, runs a recipe or starts an event. |
| `trades` | 32, 8 recipes each | Required and rewarded item stacks, gold, a limit mode, cooldown and success event. |
| `variables` | 64 | Boolean, number, or string. Scope is `event` (starts again from `initial` at each event run that nothing else started), `instance`, `character`, or `poi_global`. |
| `events` | 64 | A trigger, an optional condition tree, then and else action lists. |

A person on a route stops on a waypoint's reach ring (its `radius`, 0.5 m when unset) and walks the next leg from there,
so they can be up to that reach beside the drawn band.

Flat pictures follow `decorLaw.js`. A `billboard` has `flat: [archive 0..99999, record 0..511]` and no item. A `mount` is a
weapon (not arrows), a piece of armour or a trophy. A `paperdoll` is any other item shown as its picture. A person's flat
(`NPC_FLAT_ARCHIVES`) keeps scale 1. Other scales run 0.25 to 4.

An item stack is `{ template, group?, material?, count, recipe? }`. `recipe` names one of the game's 20 potions by its
recipe name (`healing`, `healTrue`: the `name` field in `src/systems/potionRecipes.js`) and goes only on the Glass Bottle
(template 83). The service, offline play, and the in-game editor's Test mint that potion with the game's own potion
maker. In the game and on the service, a stack with a `recipe` counts that recipe's plain and Potent potions, and a
hand-over may name either. A Glass Bottle stack without a `recipe` matches only empty bottles. The Sandbox tells
potions apart by `recipe` (it holds no Potent potions).

Events: triggers are `enter_area`, `interact`, `npc_talk`, `waypoint_reached` and `chained`. Conditions are `all`, `any`,
`has_item`, `has_gold` and `var`, at most 16 checks and 4 levels. Actions are `say, set_var, set_state, start_encounter,
end_encounter, start_route, stop_route, spawn_npc, despawn_npc, open_dialogue, open_trade, give_item, take_item, give_gold,
take_gold, trigger_event`, at most 32 in
`then` and `else` together. A `chained` event that nothing starts is refused. Events that start each other with no delay in a
circle are refused.

## Decisions

1. **Events may give and take items and gold.** The server settles them like trades before the runtime runs them. An event that gives items or gold and takes nothing is settled once per character.
2. **Limits are per parent.** 128 waypoints per route, 32 spawn points per encounter, 24 creatures per encounter, 16 per spawn.
3. **Enemy names and levels.** No custom enemy name. A spawn may set an exact `level`.
4. **Runtimes to build** for `factionId`, quest conditions, timers, `storage`, `station` on flats and chest contents. Each gets its schema fields in the same milestone as its runtime, not before.
5. **Gold bound.** Up to the save's gold limit. Approvers decide what is sane.
6. **Item stacks are plain.** No `enchant` key anywhere. Done in the law and tests.
7. **No v2 submission gate.** Both editors write v2 and the in-game editor preserves the v2 keys it cannot edit, so nothing needs gating.
8. **Potions** are named by recipe on a Glass Bottle stack (`recipe`), wherever a stack goes: trades, conditions, key items, and event actions. A bottle stack without a recipe gives and takes only empty bottles. A recipe stack counts Potent potions of its recipe too. When the player does not choose the records, a take spends them only after the plain ones.
9. **A take asks the player.** Every recipe or event that takes items or gold asks the player first, and lets them choose which matching records to hand over. The service takes the records that `hand` names after checking each against the save. An event or recipe the player cancels, or leaves idle for 60 seconds, does not run. Recipe requirements and conditions that check an item taken by the recipe or the event's `then` branch count only tradeable records (`tradeableRecord`, excluding a loaded wagon); other conditions count every matching record held.
