// Tests the dialogue map layout and the Lead to a new line edit. Run: node --test tools/poiDialogueMap.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { dialogueMap, dialogueEntries } from '../src/poi/poiDialogueMap.js';
import * as DM from '../src/poi/poiDmEdit.js';
import { poiV2Example } from './poiV2Examples.mjs';

function seeded(seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const nodes = [];
  for (let n = 0; n < 64; n++) {
    const options = [];
    for (let i = 0; i < 8; i++) {
      const r = rnd();
      const then = r < 0.12 ? { k: 'close' } : r < 0.18 ? { k: 'open_trade', trade: 'supplies' }
        : { k: 'goto', node: `n${r < 0.3 ? Math.floor(rnd() * Math.max(1, n)) : Math.min(63, n + 1 + Math.floor(rnd() * 6))}` };
      const o = { text: `Answer ${i + 1} of line ${n}`, then };
      if (rnd() < 0.3) o.when = { k: 'has_gold', amount: 5 };
      options.push(o);
    }
    nodes.push({ key: `n${n}`, say: `Line ${n} says something.`, options });
  }
  // Makes n40 and n41 unreachable from the start, while n40 still links to n41.
  for (const n of nodes) for (const o of n.options) if (o.then.node === 'n40' || o.then.node === 'n41') o.then = { k: 'close' };
  nodes[40].options[0].then = { k: 'goto', node: 'n41' };
  return { key: 'big', name: 'Big', start: 'n0', nodes };
}
const withDialogue = (dlg) => { const d = poiV2Example(); d.dialogues.push(dlg); return d; };

function laidOutRight(doc, key) {
  const m = dialogueMap(doc, key);
  const dlg = doc.dialogues.find((x) => x.key === key);
  const gotos = dlg.nodes.flatMap((n) => n.options.map((o, i) => ({ from: n.key, i, o }))).filter((x) => x.o.then?.k === 'goto');
  assert.equal(m.links.length, gotos.length, 'one link for each "Go to" answer');
  for (const g of gotos) assert.equal(m.links.filter((l) => l.from === g.from && l.i === g.i).length, 1);
  const box = new Map(m.boxes.map((b) => [b.key, b]));
  for (const l of m.links.filter((x) => x.kind === 'arrow')) assert.equal(box.get(l.to).col, box.get(l.from).col + 1, 'an arrow goes one column right');
  for (const l of m.links.filter((x) => x.kind === 'back')) assert.ok(box.get(l.to).col <= box.get(l.from).col || box.get(l.from).unreachable, 'a link that is not an arrow goes back or stays');
  const all = [...m.boxes, ...m.sources];
  for (const a of all) for (const b of all) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.key} and ${b.key} overlap`);
  const lost = poiDocProblems(doc).filter((p) => p.code === 'node-unreachable' && p.path.startsWith(`dialogues[${doc.dialogues.indexOf(dlg)}].`)).map((p) => p.key).sort();
  assert.deepEqual(m.boxes.filter((b) => b.unreachable).map((b) => b.key).sort(), lost, 'the unreachable column matches the validation rules');
  return m;
}

test('the Guard Captain dialogue: "Go back." is a back link, the start comes first, and the captain opens it', () => {
  const doc = poiV2Example();
  const m = laidOutRight(doc, 'captain');
  assert.deepEqual(m.links.map((l) => [l.from, l.i, l.to, l.kind]), [['root', 0, 'story', 'arrow'], ['story', 0, 'root', 'back']]);
  const root = m.boxes.find((b) => b.key === 'root');
  assert.ok(root.start && root.col === 0 && !root.ends && !root.allConditional);
  assert.deepEqual(m.sources.map((s) => s.id), ['npc:captain']);
  assert.ok(m.sources[0].x + m.sources[0].w < root.x, 'the person who opens it is left of the start');
  assert.deepEqual(dialogueMap(doc, 'captain', { sources: false }).sources, []);
});

test('a seeded 64-line dialogue of 8 answers a line lays out without overlaps, the same each run, in under 20 ms', () => {
  const doc = withDialogue(seeded());
  const before = structuredClone(doc);
  const m = laidOutRight(doc, 'big');
  assert.equal(m.boxes.length, 64);
  assert.deepEqual(m.boxes.filter((b) => b.unreachable).map((b) => b.key).sort(), ['n40', 'n41']);
  assert.ok(m.links.some((l) => l.from === 'n40' && l.to === 'n41' && l.kind === 'back'));
  assert.deepEqual(dialogueMap(doc, 'big'), m, 'the same output on every run');
  assert.deepEqual(doc, before, 'the document is not changed');
  const compact = dialogueMap(doc, 'big', { compact: true });
  assert.ok(compact.height < m.height);
  laidOutRight(doc, 'big');
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) dialogueMap(doc, 'big');
  assert.ok((performance.now() - t0) / 20 < 20, 'under 20 ms');
});

test('ends, conditions on every answer, a missing line, and entry points from events', () => {
  const doc = poiV2Example();
  const dlg = doc.dialogues[0];
  dlg.nodes[1].options.forEach((o) => { o.when = { k: 'has_gold', amount: 1 }; });
  dlg.nodes[1].options[1].then = { k: 'goto', node: 'nowhere' };
  doc.events.push({ key: 'greet', name: 'Greet', trigger: { k: 'chained' }, then: [{ k: 'open_dialogue', dialogue: 'captain' }] });
  const m = dialogueMap(doc, 'captain');
  const story = m.boxes.find((b) => b.key === 'story');
  assert.ok(story.allConditional && !story.ends);
  assert.ok(!m.boxes.find((b) => b.key === 'root').allConditional, 'not every answer of the start has a condition');
  assert.deepEqual(m.links.find((l) => l.to === 'nowhere'), { from: 'story', i: 1, to: 'nowhere', kind: 'missing' });
  assert.deepEqual(dialogueEntries(doc, 'captain').map((e) => `${e.kind}:${e.key}`), ['npc:captain', 'event:greet']);
  dlg.nodes.push({ key: 'bye', say: 'Farewell.', options: [{ text: 'Leave.', then: { k: 'close' } }, { text: 'Trade.', then: { k: 'open_trade', trade: 'supplies' } }] });
  assert.ok(dialogueMap(doc, 'captain').boxes.find((b) => b.key === 'bye').ends);
});

test('an invalid draft does not throw', () => {
  const drafts = [
    { key: 'x' }, { key: 'x', nodes: null }, { key: 'x', start: 'gone', nodes: [{ key: 'a', say: 'A', options: [{ text: 'B' }] }] },
    { key: 'x', start: 'a', nodes: [null, 3, { key: 'a' }, { key: 'a', options: [null, { then: { k: 'goto' } }, { then: { k: 'goto', node: 5 } }] }] },
  ];
  for (const dlg of drafts) assert.doesNotThrow(() => dialogueMap({ dialogues: [dlg], npcs: [null], events: [{ then: null }] }, 'x'));
  assert.deepEqual(dialogueMap({}, 'x').boxes, []);
  assert.deepEqual(dialogueMap(null, 'x').boxes, []);
});

test('"Lead to a new line" adds one line and links the answer to it, and refuses at 64 lines', () => {
  const doc = poiV2Example();
  const dlg = doc.dialogues[0];
  const r = DM.addNodeFrom(dlg, 'root', 2);
  assert.equal(dlg.nodes.length, 3);
  assert.deepEqual(dlg.nodes[0].options[2].then, { k: 'goto', node: r.row.key });
  assert.equal(poiDocProblems(doc).filter((p) => p.code === 'node-unreachable').length, 0);
  assert.equal(dialogueMap(doc, 'captain').links.find((l) => l.from === 'root' && l.i === 2).kind, 'arrow');
  const full = withDialogue(seeded());
  const big = full.dialogues.at(-1);
  const before = structuredClone(full);
  assert.ok(DM.addNodeFrom(big, 'n0', 0).refused);
  assert.ok(DM.addNodeFrom(dlg, 'root', 9).refused);
  assert.deepEqual(full, before);
});
