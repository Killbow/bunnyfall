// Checks for the v2 POI law, run with: node --test tools/poiLaw.test.mjs
// They cover v1 compatibility, the v2 shape rules, strict unknown-key handling, references between keys, event cycles,
// the trade law, and that the numbers poiLawV2.js copies still match the laws they come from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiDocProblems, poiShelfProblems, poiAssetProblems, poiAssetsOf, POI_DOC_VERSIONS, POI_LIMITS, poiDocBytesOf } from '../src/poi/poiLaw.js';
import { POI_V2_LIMITS, POI_V2_PINS, POI_FOE_RANGES, poiFoeIdOk } from '../src/poi/poiLawV2.js';
import { poiTradeProblems } from '../src/poi/poiTradeLaw.js';
import { poiV2Example } from './poiV2Examples.mjs';

const codes = (doc) => poiDocProblems(doc).map((p) => `${p.path}:${p.code}`);
const v1 = () => ({
  v: 1, id: 'poi-0123456789ab', name: 'Old place', place: { px: 1, py: 2, x: 3, z: 4, y: 0, ground: 'snap', r: [0, 0, 0, 1], s: 1 },
  parts: [{ key: 'a', mesh: 'a'.repeat(64), t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true,
    materials: [{ texture: null, color: [1, 1, 1, 1], emissive: null, emissiveColor: [0, 0, 0], alpha: 'opaque', cutoff: 0.5, twoSided: false, wrap: ['repeat', 'repeat'], filter: 'linear', uv: { offset: [0, 0], scale: [1, 1], rotation: 0 } }] }],
});
const edit = (fn) => { const d = poiV2Example(); fn(d); return codes(d); };

test('versions: v1 and v2 are read, anything else is refused', () => {
  assert.deepEqual([...POI_DOC_VERSIONS], [1, 2]);
  assert.deepEqual(codes(v1()), []);
  assert.deepEqual(codes({ ...v1(), v: 3 }), ['v:version']);
  assert.deepEqual(poiShelfProblems({ v: 2, id: 'lib-0123456789ab', name: 'x', parts: v1().parts, thumb: null }).map((p) => p.code), ['version']);
});

test('v1 documents stay as strict as before: v2 keys are unknown to them', () => {
  assert.deepEqual(codes({ ...v1(), groups: [] }), ['groups:unknown']);
  assert.deepEqual(codes({ ...v1(), flats: [] }), ['flats:unknown']);
  const d = v1(); d.parts[0].group = 'x';
  assert.deepEqual(codes(d), ['parts[0].group:unknown']);
});

test('document size: 96 KiB for v1, 256 KiB for v2', () => {
  assert.equal(poiDocBytesOf(1), 96 * 1024);
  assert.equal(poiDocBytesOf(2), 256 * 1024);
  const big = (v) => ({ ...(v === 2 ? poiV2Example() : v1()), about: ('x'.repeat(1900) + '\n').repeat(1) });
  assert.ok(!codes(big(2)).some((c) => c.endsWith('too-large')));
  const d = poiV2Example();
  d.variables = Array.from({ length: 64 }, (_, i) => ({ key: `v${i}`, name: 'n'.repeat(40), type: 'string', scope: 'event', initial: 'x'.repeat(60) }));
  assert.ok(new TextEncoder().encode(JSON.stringify(d)).length < 256 * 1024);
});

test('the worked examples (merchant, captain, Nyra, supplier, ambush) pass the law and the trade law', () => {
  const d = poiV2Example();
  assert.deepEqual(poiDocProblems(d), []);
  assert.deepEqual(poiTradeProblems(d), []);
});

test('unknown keys are refused at every level of a v2 document', () => {
  const at = (fn, path) => assert.ok(edit(fn).includes(`${path}:unknown`), path);
  at((d) => { d.extra = 1; }, 'extra');
  at((d) => { d.groups[0].x = 1; }, 'groups[0].x');
  at((d) => { d.routes[0].waypoints[0].x = 1; }, 'routes[0].waypoints[0].x');
  at((d) => { d.encounters[0].spawns[0].x = 1; }, 'encounters[0].spawns[0].x');
  at((d) => { d.encounters[0].complete.x = 1; }, 'encounters[0].complete.x');
  at((d) => { d.trades[0].recipes[0].requireItems[0].x = 1; }, 'trades[0].recipes[0].requireItems[0].x');
  at((d) => { d.dialogues[0].nodes[0].options[0].then.x = 1; }, 'dialogues[0].nodes[0].options[0].then.x');
  at((d) => { d.events[0].trigger.x = 1; }, 'events[0].trigger.x');
  at((d) => { d.events[3].when.of[0].item.x = 1; }, 'events[3].when.of[0].item.x');
  at((d) => { d.npcs[0].x = 1; }, 'npcs[0].x');
  at((d) => { d.parts[0].x = 1; }, 'parts[0].x');
});

test('a part is an arch3d model or a mesh, never both, and v1 keeps requiring a mesh', () => {
  assert.ok(edit((d) => { d.parts[0].mesh = 'a'.repeat(64); }).includes('parts[0].mesh:unknown'));
  assert.ok(edit((d) => { d.parts[0].arch3d = 0; }).includes('parts[0].arch3d:model'));
  assert.ok(edit((d) => { d.parts[0].arch3d = 1_000_000; }).includes('parts[0].arch3d:model'));
  assert.ok(edit((d) => { d.parts[0].materials = []; }).includes('parts[0].materials:unknown'));
  const d = v1(); d.parts[0].arch3d = 5;
  assert.ok(codes(d).includes('parts[0].arch3d:unknown'));
});

test('a POI of flat pictures alone is a place; an empty one is not', () => {
  const d = poiV2Example();
  d.parts = []; d.npcs = [];
  d.routes = []; d.dialogues = []; d.trades = []; d.events = []; d.interactives = []; d.encounters = [];
  d.flats = [{ key: 'torch', kind: 'billboard', flat: [210, 1], t: [0, 0, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false }];
  assert.deepEqual(poiDocProblems(d), []);
  d.flats = [];
  assert.ok(codes(d).includes('parts:parts-none'));
});

test('flat pictures follow the decor rules: figures keep scale 1, mounts hang weapons and armour', () => {
  const flat = (over) => ({ key: 'f', kind: 'billboard', flat: [210, 1], t: [0, 0, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false, ...over });
  const run = (f) => { const d = poiV2Example(); d.flats = [f]; return codes(d); };
  assert.deepEqual(run(flat({})), []);
  assert.ok(run(flat({ scale: 0.1 })).includes('flats[0].scale:size'));
  assert.ok(run(flat({ flat: [334, 0], scale: 2 })).includes('flats[0].scale:figure-scale'));
  assert.deepEqual(run(flat({ flat: [334, 0], scale: 1 })), []);
  const sword = { t: 122, g: 3, m: null, v: null, a: null, p: null };
  assert.deepEqual(run(flat({ kind: 'mount', flat: undefined, item: sword })), []);
  assert.ok(run(flat({ kind: 'paperdoll', flat: undefined, item: sword })).includes('flats[0].kind:flat-kind'));
  assert.ok(run(flat({ kind: 'mount', flat: undefined, item: { t: 131, g: 3 } })).includes('flats[0].kind:flat-kind'));
  assert.deepEqual(run(flat({ kind: 'paperdoll', flat: undefined, item: { t: 83, g: 1 } })), []);
  assert.ok(run(flat({ kind: 'billboard', item: sword })).includes('flats[0].item:unknown'));
  assert.ok(run(flat({ flat: [100_000, 0] })).includes('flats[0].flat:flat-ref'));
});

test('references to keys that do not exist are named', () => {
  assert.ok(edit((d) => { d.npcs[0].route = 'nowhere'; }).includes('npcs[0].route:ref-missing'));
  assert.ok(edit((d) => { d.npcs[1].dialogue = 'nowhere'; }).includes('npcs[1].dialogue:ref-missing'));
  assert.ok(edit((d) => { d.npcs[2].trade = 'nowhere'; }).includes('npcs[2].trade:ref-missing'));
  assert.ok(edit((d) => { d.parts[0].group = 'nowhere'; }).includes('parts[0].group:ref-missing'));
  assert.ok(edit((d) => { d.events[0].then[0].encounter = 'nowhere'; }).includes('events[0].then[0].encounter:ref-missing'));
  assert.ok(edit((d) => { d.events[0].trigger.interactive = 'gate'; }).includes('events[0].trigger.interactive:wrong-kind'));
  assert.ok(edit((d) => { d.dialogues[0].nodes[0].options[1].then.recipe = 'nope'; }).includes('dialogues[0].nodes[0].options[1].then.recipe:ref-missing'));
  assert.ok(edit((d) => { d.dialogues[0].nodes[0].options[0].then.node = 'nope'; }).includes('dialogues[0].nodes[0].options[0].then.node:ref-missing'));
  assert.ok(edit((d) => { d.encounters[0].onComplete = 'nope'; }).includes('encounters[0].onComplete:ref-missing'));
  assert.ok(edit((d) => { d.routes[0].waypoints[0].onArriveEvent = 'nope'; }).includes('routes[0].waypoints[0].onArriveEvent:ref-missing'));
  assert.ok(edit((d) => { d.events[0].then[0] = { k: 'set_var', var: 'ghost', to: true }; }).includes('events[0].then[0].var:ref-missing'));
});

test('variables: values match their type, ops match the type, set_var takes one of to or add', () => {
  assert.ok(edit((d) => { d.variables[0].initial = 3; }).includes('variables[0].initial:var-value'));
  assert.ok(edit((d) => { d.events[1].then[2].to = 'yes'; }).includes('events[1].then[2].to:var-value'));
  assert.ok(edit((d) => { d.events[1].then[2] = { k: 'set_var', var: 'bridge_unlocked', to: true, add: 1 }; }).includes('events[1].then[2]:set-var-one'));
  assert.ok(edit((d) => { d.variables[0].scope = 'global'; }).includes('variables[0].scope:var-scope'));
  assert.ok(edit((d) => { d.events[3].when = { k: 'var', var: 'supplies_delivered', op: 'gt', value: true }; }).includes('events[3].when.op:op'));
});

test('events: a chained event nobody starts is unreachable, and a zero-delay loop is refused', () => {
  assert.ok(edit((d) => { d.encounters[0].onComplete = undefined; delete d.encounters[0].onComplete; }).includes('events[1].trigger:event-unreachable'));
  const loop = poiV2Example();
  loop.events[1].then.push({ k: 'trigger_event', event: 'supplies-done', delayS: 0 });
  loop.events[2].then.push({ k: 'trigger_event', event: 'ambush-done', delayS: 0 });
  assert.ok(codes(loop).includes('events:event-cycle'));
  const slow = poiV2Example();
  slow.events[1].then.push({ k: 'trigger_event', event: 'supplies-done', delayS: 0 });
  slow.events[2].then.push({ k: 'trigger_event', event: 'ambush-done', delayS: 5 });
  assert.ok(!codes(slow).includes('events:event-cycle'));
  const self = poiV2Example();
  self.events[1].then.push({ k: 'trigger_event', event: 'ambush-done', delayS: 0 });
  assert.ok(codes(self).includes('events:event-cycle'));
});

test('events: limits on conditions and actions', () => {
  const leaf = { k: 'has_gold', amount: 5 };
  assert.ok(edit((d) => { d.events[3].when = { k: 'all', of: Array.from({ length: 17 }, () => leaf) }; }).includes('events[3].when.of:conditions'));
  assert.ok(edit((d) => { d.events[3].when = { k: 'any', of: Array.from({ length: 16 }, () => leaf) }; }).length === 0);
  assert.ok(edit((d) => { d.events[3].when = { k: 'all', of: [{ k: 'all', of: [{ k: 'all', of: [{ k: 'all', of: [{ k: 'all', of: [leaf] }] }] }] }] }; }).some((c) => c.endsWith('too-deep')));
  const many = Array.from({ length: 20 }, () => ({ k: 'say', text: 'x' }));
  assert.ok(edit((d) => { d.events[3].then = many; d.events[3].else = many; }).includes('events[3]:actions'));
  assert.ok(edit((d) => { d.events[3].then = []; }).includes('events[3].then:actions-none'));
});

test('routes need two waypoints, valid modes and unique keys', () => {
  assert.ok(edit((d) => { d.routes[0].waypoints.length = 1; }).includes('routes[0].waypoints:waypoints-few'));
  assert.ok(edit((d) => { d.routes[0].mode = 'bounce'; }).includes('routes[0].mode:route-mode'));
  assert.ok(edit((d) => { d.routes[0].waypoints[1].key = 'entrance'; }).includes('routes[0].waypoints[1].key:key-twice'));
});

test('encounters: foes are real ids, counts are bounded, leader rule needs a spawn key', () => {
  assert.ok(edit((d) => { d.encounters[0].spawns[0].foe = 39; }).includes('encounters[0].spawns[0].foe:foe'));
  assert.ok(edit((d) => { d.encounters[0].spawns[0].foe = 200; }).includes('encounters[0].spawns[0].foe:foe'));
  assert.ok(edit((d) => { d.encounters[0].spawns[0].count = 17; }).includes('encounters[0].spawns[0].count:count'));
  assert.ok(edit((d) => { d.encounters[0].spawns[0].count = 16; d.encounters[0].spawns[1].count = 16; }).includes('encounters[0].spawns:foes-many'));
  assert.ok(edit((d) => { d.encounters[0].complete = { rule: 'leader_dead', leader: 'leader' }; }).length === 0);
  assert.ok(edit((d) => { d.encounters[0].complete = { rule: 'leader_dead', leader: 'ghost' }; }).includes('encounters[0].complete.leader:ref-missing'));
  assert.ok(edit((d) => { d.encounters[0].complete = { rule: 'timer_survived' }; }).includes('encounters[0].complete.seconds:seconds'));
  assert.ok(poiFoeIdOk(136) && poiFoeIdOk(0) && poiFoeIdOk(42) && poiFoeIdOk(146) && poiFoeIdOk(290) && poiFoeIdOk(398));
  assert.ok(!poiFoeIdOk(39) && !poiFoeIdOk(43) && !poiFoeIdOk(127) && !poiFoeIdOk(147) && !poiFoeIdOk(291) && !poiFoeIdOk(1.5));
});

test('trades: limit modes, free unlimited trades and empty rewards are refused', () => {
  const r = (d) => d.trades[0].recipes[0];
  assert.ok(edit((d) => { r(d).limitMode = 'forever'; }).includes('trades[0].recipes[0].limitMode:limit-mode'));
  assert.ok(edit((d) => { r(d).limitMode = 'global_stock'; }).includes('trades[0].recipes[0].maxStock:stock'));
  assert.ok(edit((d) => { r(d).limitMode = 'global_stock'; r(d).maxStock = 10; }).length === 0);
  assert.ok(edit((d) => { r(d).maxStock = 10; }).includes('trades[0].recipes[0].maxStock:unknown'));
  assert.ok(edit((d) => { r(d).requireItems = []; }).includes('trades[0].recipes[0]:free-unlimited'));
  assert.ok(edit((d) => { r(d).rewardItems = []; }).includes('trades[0].recipes[0]:no-reward'));
  assert.ok(edit((d) => { r(d).requireGold = -1; }).includes('trades[0].recipes[0].requireGold:gold'));
  assert.ok(edit((d) => { r(d).rewardGold = 2_147_483_648; }).includes('trades[0].recipes[0].rewardGold:gold'));
});

test('trade law: templates, groups, materials, stacking and enchantments are checked against the game', () => {
  const run = (fn) => { const d = poiV2Example(); fn(d.trades[0].recipes[0]); return poiTradeProblems(d).map((p) => `${p.path}:${p.code}`); };
  assert.ok(run((r) => { r.requireItems[0].template = 9000; }).includes('trades[0].recipes[0].requireItems[0].template:item-template'));
  assert.ok(run((r) => { r.requireItems[0].group = 'Armor'; }).includes('trades[0].recipes[0].requireItems[0].group:item-group'));
  assert.ok(run((r) => { r.rewardItems[0].material = 3; }).includes('trades[0].recipes[0].rewardItems[0].material:item-material'));
  assert.ok(run((r) => { r.rewardItems = [{ template: 122, count: 2 }]; }).includes('trades[0].recipes[0].rewardItems[0].count:item-stack'));
  assert.deepEqual(run((r) => { r.rewardItems = [{ template: 122, count: 1 }]; }), []);
});

test('item stacks carry no enchantments', () => {
  assert.ok(edit((d) => { d.trades[0].recipes[0].rewardItems[0].enchant = []; }).includes('trades[0].recipes[0].rewardItems[0].enchant:unknown'));
});

test('groups: parents must exist and cycles are refused', () => {
  assert.ok(edit((d) => { d.groups[0].parent = 'bridge'; d.groups[1].parent = 'market'; }).includes('groups:group-cycle'));
  assert.ok(edit((d) => { d.groups[0].parent = 'bridge'; }).length === 0);
  assert.ok(edit((d) => { d.groups[0].parent = 'missing'; }).includes('groups[0].parent:ref-missing'));
  const deep = poiV2Example();
  deep.groups = Array.from({ length: 12 }, (_, i) => ({ key: `g${i}`, name: 'G', parent: i ? `g${i - 1}` : null, visible: true, locked: false }));
  deep.parts[0].group = 'g11'; deep.parts[1].group = 'g0';
  assert.ok(codes(deep).includes('groups:too-deep'));
});

test('interactives: a kind has its own states; a door cannot be active', () => {
  assert.ok(edit((d) => { d.interactives[0].state = 'active'; }).includes('interactives[0].state:state'));
  assert.ok(edit((d) => { d.events[1].then[1].state = 'active'; }).includes('events[1].then[1].state:state'));
  assert.ok(edit((d) => { d.interactives[0].appearance = { k: 'part', key: 'ghost' }; }).includes('interactives[0].appearance.key:ref-missing'));
});

test('dialogue: every node must be reachable from the start', () => {
  assert.ok(edit((d) => { d.dialogues[0].nodes.push({ key: 'lost', say: 'Nobody comes here.', options: [{ text: 'Bye', then: { k: 'close' } }] }); }).includes('dialogues[0].nodes[2]:node-unreachable'));
  assert.ok(edit((d) => { d.dialogues[0].start = 'ghost'; }).includes('dialogues[0].start:ref-missing'));
  assert.ok(edit((d) => { d.dialogues[0].nodes[0].options = []; }).includes('dialogues[0].nodes[0].options:options'));
});

test('interior: base keys follow decor naming and the cap', () => {
  const run = (it) => edit((d) => { d.interior = it; });
  assert.deepEqual(run({ shellModel: 4001, hiddenBaseKeys: ['m3:41000', 'f1:210.4'] }), []);
  assert.ok(run({ shellModel: 0, hiddenBaseKeys: [] }).includes('interior.shellModel:model'));
  assert.ok(run({ shellModel: null, hiddenBaseKeys: ['bad'] }).includes('interior.hiddenBaseKeys[0]:base-key'));
  assert.ok(run({ shellModel: null, hiddenBaseKeys: Array.from({ length: 201 }, () => 'm1:2') }).includes('interior.hiddenBaseKeys:hidden-many'));
});

test('asset checks: arch3d parts store nothing, and a person\'s picture must be uploaded', () => {
  const d = poiV2Example();
  assert.deepEqual(poiAssetProblems(d, () => null), []);
  assert.equal(poiAssetsOf(d).meshes.size, 0);
  const sha = 'c'.repeat(64);
  d.npcs[0].look = { k: 'pic', tex: sha };
  assert.deepEqual(poiAssetProblems(d, () => null).map((p) => `${p.path}:${p.code}`), ['npcs[0].look.tex:not-uploaded']);
  assert.deepEqual(poiAssetProblems(d, () => ({ kind: 'mesh' })).map((p) => p.code), ['not-a-texture']);
  assert.deepEqual(poiAssetProblems(d, () => ({ kind: 'texture', w: 16, h: 16, bytes: 100 })), []);
});

test('numbers copied into the v2 law still match the laws they come from', async () => {
  const decor = await import('../src/net/decorLaw.js');
  const flats = await import('../src/world/npcFlatArchives.js');
  const trophy = await import('../src/net/trophyLaw.js');
  const item = await import('../src/systems/item/itemLaw.js');
  const P = POI_V2_PINS;
  assert.equal(P.decorModelMax, decor.DECOR_MODEL_MAX);
  assert.equal(P.decorArchiveMax, decor.DECOR_ARCHIVE_MAX);
  assert.equal(P.decorRecordMax, decor.DECOR_RECORD_MAX);
  assert.equal(P.decorTemplateMax, decor.DECOR_TEMPLATE_MAX);
  assert.equal(P.decorScaleMin, decor.DECOR_SCALE_MIN);
  assert.equal(P.decorScaleMax, decor.DECOR_SCALE_MAX);
  assert.equal(P.decorLightRangeMin, decor.DECOR_LIGHT_RANGE_MIN);
  assert.equal(P.decorLightRangeMax, decor.DECOR_LIGHT_RANGE_MAX);
  assert.equal(P.decorLightIntensityMax, decor.DECOR_LIGHT_INTENSITY_MAX);
  assert.equal(P.decorWeaponsGroup, decor.DECOR_WEAPONS_GROUP);
  assert.equal(P.decorArmorGroup, decor.DECOR_ARMOR_GROUP);
  assert.equal(P.decorArrowTemplate, decor.DECOR_ARROW_TEMPLATE);
  assert.equal(P.trophyTemplate, trophy.TROPHY_TEMPLATE);
  assert.equal(P.goldMax, item.GOLD_INT_MAX);
  assert.deepEqual([...P.npcFlatArchives], [...flats.NPC_FLAT_ARCHIVES]);
  assert.equal(P.decorBaseKeyRe.source, decor.DECOR_BASE_KEY_RE.source);
});

test('foe ids match the game\'s own tables', async () => {
  const basics = await import('../src/characters/enemy/enemyBasics.js');
  for (const id of Object.keys(basics.VANILLA_ENEMY_BASICS).map(Number)) assert.equal(poiFoeIdOk(id), id !== 39, `id ${id}`);
  const dex = await import('../src/systems/enemyExpansion/dexIds.js');
  for (const id of dex.DEX_ENEMY_IDS) assert.ok(poiFoeIdOk(id), `dex ${id}`);
  assert.ok(POI_FOE_RANGES.length === 5 && POI_V2_LIMITS.events === 64 && POI_LIMITS.parts === 128);
});

test('every problem code the law can say has a sentence of its own', async () => {
  const { readFile } = await import('node:fs/promises');
  const { problemText } = await import('../src/poi/poiText.js');
  const found = new Set();
  for (const f of ['poiLaw.js', 'poiLawV2.js', 'poiTradeLaw.js']) {
    const src = await readFile(new URL(`../src/poi/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/say\((?:`[^`]*`|'[^']*'|[^,()]+),\s*'([a-z0-9-]+)'/g)) found.add(m[1]);
  }
  assert.ok(found.size > 80, `only ${found.size} codes found`);
  const dumb = [...found].filter((code) => problemText({ path: 'x', code, max: 1, min: 1, key: 'k', type: 'number' }).startsWith('Something is wrong'));
  assert.deepEqual(dumb, []);
});

test('the diff names v2 entities and the people v1 never showed', async () => {
  const { poiDiff } = await import('../src/poi/poiDiff.js');
  const { diffText } = await import('../src/poi/poiText.js');
  const a = poiV2Example();
  const b = poiV2Example();
  assert.deepEqual(poiDiff(a, b), []);
  b.npcs[0].name = 'Renamed Merchant';
  b.trades[0].recipes[0].rewardGold = 5;
  b.events.pop();
  b.groups.push({ key: 'extra', name: 'Extra', parent: null, visible: true, locked: false });
  b.parts[0].group = 'bridge';
  b.interior = { shellModel: null, hiddenBaseKeys: [] };
  const lines = poiDiff(a, b).map((c) => `${c.code}:${c.kind ?? ''}:${c.name ?? ''}`);
  assert.deepEqual(lines, ['part-changed::Stall', 'interior::', 'item-changed:npcs:Renamed Merchant', 'item-added:groups:Extra', 'item-changed:trades:Nyra\'s brew', 'item-removed:events:Supply Merchant talks']);
  assert.ok(poiDiff(a, b).every((c) => !diffText(c).startsWith('Something is wrong')));
  assert.deepEqual(poiDiff(a, { ...b, v: 3 }).filter((c) => c.code === 'upgraded'), [{ code: 'upgraded', from: 2, to: 3 }]);
  assert.equal(poiDiff(null, a)[0].code, 'new');
  assert.ok(poiDiff(null, a).some((c) => c.code === 'collection' && c.kind === 'trades' && c.count === 2));
});

test('events may give and take items and gold, checked like trades', () => {
  const run = (a) => edit((d) => { d.events[2].then.push(a); });
  assert.deepEqual(run({ k: 'give_item', item: { template: 62, count: 1 } }), []);
  assert.deepEqual(run({ k: 'take_item', item: { template: 71, count: 10 } }), []);
  assert.deepEqual(run({ k: 'give_gold', amount: 250 }), []);
  assert.deepEqual(run({ k: 'take_gold', amount: 5 }), []);
  assert.ok(run({ k: 'give_gold', amount: 0 }).includes('events[2].then[2].amount:gold'));
  assert.ok(run({ k: 'take_item', item: { template: 71, count: 0 } }).includes('events[2].then[2].item.count:count'));
  assert.ok(run({ k: 'take_item', item: { template: 71, count: 1, enchant: [] } }).includes('events[2].then[2].item.enchant:unknown'));
  assert.ok(run({ k: 'give_gold', amount: 5, extra: 1 }).includes('events[2].then[2].extra:unknown'));
  const d = poiV2Example();
  d.events[2].then.push({ k: 'give_item', item: { template: 9000, count: 1 } });
  assert.deepEqual(poiTradeProblems(d).map((p) => `${p.path}:${p.code}`), ['events[2].then[2].item.template:item-template']);
});
