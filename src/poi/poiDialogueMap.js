// @ts-check
// One dialogue laid out left to right for the DM panel's Map view (src/ui/poi/poiDialogueMapView.js).
// Each column is one step from the start, unreachable lines get a last column, and the people and events
// that open it sit on the left. Pure data: it never changes the document and does not throw on a bad draft.

export const MAP_W = 240;
export const MAP_GAP_X = 90;
export const MAP_GAP_Y = 14;
export const MAP_PAD = 16;
export const MAP_HEAD = 48;
export const MAP_ROW = 20;
export const MAP_COMPACT_H = 40;
export const MAP_COMPACT_W = 170;
export const MAP_COMPACT_GAP_X = 60;
export const MAP_SOURCE_H = 40;

/**
 * @typedef {{ i: number, y: number, text: string, when: any, cooldownS: any, then: any }} MapRow
 * @typedef {{ key: string, index: number, col: number, x: number, y: number, w: number, h: number,
 *   start: boolean, unreachable: boolean, ends: boolean, allConditional: boolean, say: string, from: string | null,
 *   rows: MapRow[] }} MapBox
 * @typedef {{ from: string, i: number, to: string, kind: 'arrow' | 'back' | 'missing' }} MapLink
 */
const isObj = (/** @type {any} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @typedef {{ id: string, kind: 'npc' | 'event', key: string, name: string,
 *   x: number, y: number, w: number, h: number }} MapSource */
const ENDS = new Set(['close', 'open_trade']);

/**
 * @param {number[]} hs
 * @param {(number | null)[]} wants
 * @returns {number[]}
 */
function pack(hs, wants) {
  /** @type {{ from: number, to: number, sum: number, n: number, top: number }[]} */
  const blocks = [];
  let off = 0;
  const offs = hs.map((h) => { const o = off; off += h + MAP_GAP_Y; return o; });
  hs.forEach((h, j) => {
    const prev = blocks.at(-1);
    const after = prev ? prev.top + offs[j] - offs[prev.from] : MAP_PAD;
    const want = wants[j] ?? after;
    const b = { from: j, to: j, sum: want - offs[j], n: 1, top: Math.max(MAP_PAD, want) };
    blocks.push(b);
    for (;;) {
      const cur = /** @type {any} */ (blocks.at(-1)), before = blocks.at(-2);
      if (!before || before.top + offs[cur.from] - offs[before.from] <= cur.top) break;
      before.to = cur.to; before.sum += cur.sum; before.n += cur.n;
      before.top = Math.max(MAP_PAD, (before.sum / before.n) + offs[before.from]);
      blocks.pop();
    }
  });
  const ys = [];
  for (const b of blocks) for (let j = b.from; j <= b.to; j++) ys.push(Math.round(b.top + offs[j] - offs[b.from]));
  return ys;
}

/**
 * @param {any} doc
 * @param {string} key
 * @returns {{ kind: 'npc' | 'event', key: string, name: string }[]}
 */
export function dialogueEntries(doc, key) {
  /** @type {{ kind: 'npc' | 'event', key: string, name: string }[]} */
  const out = [];
  for (const n of Array.isArray(doc?.npcs) ? doc.npcs : []) if (isObj(n) && n.dialogue === key) out.push({ kind: 'npc', key: String(n.key), name: String(n.name ?? n.key) });
  for (const e of Array.isArray(doc?.events) ? doc.events : []) {
    if (!isObj(e)) continue;
    const acts = [...(Array.isArray(e.then) ? e.then : []), ...(Array.isArray(e.else) ? e.else : [])];
    if (acts.some((a) => isObj(a) && a.k === 'open_dialogue' && a.dialogue === key)) out.push({ kind: 'event', key: String(e.key), name: String(e.name ?? e.key) });
  }
  return out;
}

/**
 * @param {any} doc
 * @param {string} key
 * @param {{ sources?: boolean, compact?: boolean }} [o]
 * @returns {{ boxes: MapBox[], links: MapLink[], sources: MapSource[], cols: number, unreachableCol: number | null,
 *   width: number, height: number }}
 */
export function dialogueMap(doc, key, { sources = true, compact = false } = {}) {
  const dlg = (Array.isArray(doc?.dialogues) ? doc.dialogues : []).find((/** @type {any} */ d) => isObj(d) && d.key === key);
  const raw = Array.isArray(dlg?.nodes) ? dlg.nodes : [];
  /** @type {{ key: string, index: number, say: string, options: any[] }[]} */
  const nodes = [];
  const byKey = new Map();
  raw.forEach((/** @type {any} */ n, /** @type {number} */ index) => {
    if (!isObj(n)) return;
    const k = typeof n.key === 'string' ? n.key : `#${index}`;
    if (byKey.has(k)) return;
    const node = { key: k, index, say: typeof n.say === 'string' ? n.say : '', options: Array.isArray(n.options) ? n.options : [] };
    byKey.set(k, node); nodes.push(node);
  });
  const targetOf = (/** @type {any} */ o) => (isObj(o) && isObj(o.then) && o.then.k === 'goto' && typeof o.then.node === 'string' ? o.then.node : null);

  const startOk = typeof dlg?.start === 'string' && byKey.has(dlg.start);
  const root = startOk ? dlg.start : nodes[0]?.key;
  /** @type {Map<string, number>} */
  const col = new Map();
  /** @type {Map<string, string | null>} */
  const parent = new Map();
  const order = [];
  if (root !== undefined) {
    col.set(root, 0); parent.set(root, null); order.push(root);
    for (let q = 0; q < order.length; q++) {
      const n = byKey.get(order[q]);
      for (const o of n.options) {
        const to = targetOf(o);
        if (to === null || !byKey.has(to) || col.has(to)) continue;
        col.set(to, /** @type {number} */ (col.get(n.key)) + 1); parent.set(to, n.key); order.push(to);
      }
    }
  }
  const reachCols = order.length ? Math.max(...order.map((k) => /** @type {number} */ (col.get(k)))) + 1 : 0;
  const lost = nodes.filter((n) => !col.has(n.key));
  const unreachableCol = lost.length ? reachCols : null;
  for (const n of lost) col.set(n.key, reachCols);
  const cols = reachCols + (lost.length ? 1 : 0);

  /** @type {MapLink[]} */
  const links = [];
  for (const n of nodes) n.options.forEach((o, i) => {
    const to = targetOf(o);
    if (to === null) return;
    if (!byKey.has(to)) links.push({ from: n.key, i, to, kind: 'missing' });
    else links.push({ from: n.key, i, to, kind: !col.has(to) || unreachableCol === col.get(n.key) || col.get(to) !== /** @type {number} */ (col.get(n.key)) + 1 ? 'back' : 'arrow' });
  });

  const seq = new Map([...order, ...lost.map((n) => n.key)].map((k, i) => [k, i]));
  /** @type {string[][]} */
  const colKeys = Array.from({ length: cols }, () => []);
  for (const n of nodes) colKeys[/** @type {number} */ (col.get(n.key))].push(n.key);
  const rank = new Map();
  colKeys.forEach((keys, c) => {
    const score = new Map(keys.map((k) => {
      const ins = links.filter((l) => l.kind === 'arrow' && l.to === k);
      return [k, ins.length && c !== unreachableCol ? ins.reduce((s, l) => s + rank.get(l.from) * 8 + l.i, 0) / ins.length : seq.get(k)];
    }));
    keys.sort((a, b) => score.get(a) - score.get(b) || seq.get(a) - seq.get(b) || byKey.get(a).index - byKey.get(b).index);
    keys.forEach((k, r) => rank.set(k, r));
  });

  const entries = sources ? dialogueEntries(doc, typeof key === 'string' ? key : '') : [];
  const W = compact ? MAP_COMPACT_W : MAP_W, GAP_X = compact ? MAP_COMPACT_GAP_X : MAP_GAP_X;
  const shift = entries.length ? 1 : 0;
  /** @type {Map<string, MapBox>} */
  const boxes = new Map();
  colKeys.forEach((keys, c) => {
    const items = keys.map((k) => {
      const n = byKey.get(k);
      const h = compact ? MAP_COMPACT_H : MAP_HEAD + Math.max(1, n.options.length) * MAP_ROW + 6;
      const ins = links.filter((l) => l.kind === 'arrow' && l.to === k).map((l) => boxes.get(l.from)?.rows[l.i]?.y).filter((v) => v !== undefined);
      return { n, h, want: ins.length ? ins.reduce((s, v) => s + v, 0) / ins.length - (compact ? h / 2 : MAP_HEAD / 2) : null };
    });
    const ys = pack(items.map((it) => it.h), items.map((it) => it.want));
    items.forEach(({ n, h }, j) => {
      const y = ys[j], opts = n.options;
      boxes.set(n.key, {
        key: n.key, index: n.index, col: c, x: MAP_PAD + (c + shift) * (W + GAP_X), y, w: W, h, start: startOk && n.key === dlg.start,
        unreachable: startOk && c === unreachableCol, ends: opts.length > 0 && opts.every((o) => isObj(o) && isObj(o.then) && ENDS.has(o.then.k)),
        allConditional: opts.length > 0 && opts.every((o) => isObj(o) && o.when != null), say: n.say, from: parent.get(n.key) ?? null,
        rows: opts.map((o, i) => ({
          i, y: compact ? y + h / 2 : y + MAP_HEAD + i * MAP_ROW + MAP_ROW / 2,
          text: isObj(o) && typeof o.text === 'string' ? o.text : '', when: isObj(o) ? o.when ?? null : null,
          cooldownS: isObj(o) ? o.cooldownS ?? null : null, then: isObj(o) && isObj(o.then) ? o.then : null,
        })),
      });
    });
  });

  const startBox = startOk ? boxes.get(dlg.start) : undefined;
  /** @type {MapSource[]} */
  const srcs = [];
  let sy = Math.max(MAP_PAD, Math.round((startBox ? startBox.y + (compact ? startBox.h : MAP_HEAD) / 2 : MAP_PAD) - (entries.length * (MAP_SOURCE_H + MAP_GAP_Y) - MAP_GAP_Y) / 2));
  for (const e of entries) { srcs.push({ id: `${e.kind}:${e.key}`, ...e, x: MAP_PAD, y: sy, w: W, h: MAP_SOURCE_H }); sy += MAP_SOURCE_H + MAP_GAP_Y; }

  const all = [...boxes.values(), ...srcs];
  const width = all.length ? Math.max(...all.map((b) => b.x + b.w)) + MAP_PAD : MAP_PAD * 2;
  const height = all.length ? Math.max(...all.map((b) => b.y + b.h)) + MAP_PAD : MAP_PAD * 2;
  return { boxes: nodes.map((n) => /** @type {MapBox} */ (boxes.get(n.key))), links, sources: srcs, cols, unreachableCol, width, height };
}
