// @ts-check
// BUNNYFALL (2026-11-25, caverns): THE MINE ON THIS PAGE - what a player in a mine reads of it and does in it, apart from
// the rock (systems/mine/mineHost.js stands that). It keeps the mine as its room last said it (net/mine/mineBrain.js,
// over the `mn` frame), and:
//   - HOLES: examining one names the ore below and how rich its seam is, and how well its section's rock holds.
//   - WALLS: a wall slot is sound or weak rock; shoring it spends one plank of the best wood in the Stores (the plank is
//     withdrawn and nothing minted: spent) and tells the room, whose brain raises the section's stability.
//   - STRIKES: each cave vein's answered strike is told to the room, which wears its section.
//   - WARNINGS: the room's dust, creaks and rumble shake the camera, harder each time, and say so.
//   - THE COLLAPSE: a long shake rising, every window closed, a fade to black, and the player put out at the mouth - with
//     what they carry, the rest under the rock.
// Every effect is a door handed in, so the whole of it runs in a test.
import { t } from '../../ui/textManager.js';
import { MINE_WOOD_STRENGTH } from '../../net/mine/mineBrain.js';

/** The shakes the warnings give, and the collapse's: how hard, and how long it lasts (s). */
export const MINE_SHAKE = Object.freeze({ 'warn:dust': 0.02, 'warn:creak': 0.05, 'warn:rumble': 0.1, collapse: 0.3 });
export const MINE_COLLAPSE_S = 2.5;
/** The rich words a hole's seam is named by (its richness 1 to 3). */
const RICH = Object.freeze(['a thin seam', 'a good seam', 'a rich seam']);

export const MINE_CLIENT_TEXT = Object.freeze({
  hole: (/** @type {string} */ ore, /** @type {number} */ rich, /** @type {number} */ stab) => t('mine.hole', '{ore} below: {seam}. The rock here holds at {stab} of 100.', { ore, seam: RICH[Math.max(0, Math.min(2, rich - 1))], stab: Math.round(stab) }),
  sound: () => t('mine.wallSound', 'Sound rock'),
  weak: () => t('mine.wallWeak', 'Weak rock'),
  shored: () => t('mine.wallShored', 'Shored'),
  shore: (/** @type {string} */ wood) => t('mine.shore', 'Shore this wall with {wood}', { wood }),
  noPlanks: () => t('mine.noPlanks', 'You have no planks in your Stores to shore the wall with. Saw some at a workbench.'),
  shoredWith: (/** @type {string} */ wood) => t('mine.shoredWith', 'You shore the wall with {wood}.', { wood }),
  taken: () => t('mine.wallTaken', 'Someone has already shored that wall.'),
  dust: () => t('mine.dust', 'Dust sifts down from the roof.'),
  creak: () => t('mine.creak', 'The timbers creak and pebbles rattle down.'),
  rumble: () => t('mine.rumble', 'The whole mine rumbles. Get out, or shore it up.'),
  collapsed: () => t('mine.collapsed', 'The mine came down behind you. It reopens in about an hour.'),
  sealed: () => t('mine.sealedInside', 'The mine is sealed.'),
});

const WARN_WORDS = Object.freeze({ 'warn:dust': MINE_CLIENT_TEXT.dust, 'warn:creak': MINE_CLIENT_TEXT.creak, 'warn:rumble': MINE_CLIENT_TEXT.rumble });
/** A wood's id from a plank's key (`plank:oak` -> `oak`). */
const woodOf = (/** @type {string} */ key) => key.slice('plank:'.length);
/** The woods, strongest first. */
const WOODS = Object.freeze(Object.keys(MINE_WOOD_STRENGTH).sort((a, b) => MINE_WOOD_STRENGTH[/** @type {keyof typeof MINE_WOOD_STRENGTH} */ (b)] - MINE_WOOD_STRENGTH[/** @type {keyof typeof MINE_WOOD_STRENGTH} */ (a)]));

/**
 * @param {{
 *   layout: any, say: (text: string) => void, send: (k: string, fields?: any) => boolean,
 *   planks: (material: string) => number, spend: (material: string) => Promise<boolean>,
 *   shake: (k: number) => void, fade: (on: boolean) => void, closeWindows: () => void, leave: () => void,
 *   woodName?: (wood: string) => string, nowMs?: () => number,
 * }} deps
 */
export function createMineClient(deps) {
  const nowMs = deps.nowMs ?? (() => performance.now());
  const L = deps.layout;
  /** @type {any} */
  let st = null;
  /** the collapse under way: when it began (ms), or null */
  let fall = /** @type {number|null} */ (null);
  let left = false, shoring = false;
  const chamber = (/** @type {number} */ s, /** @type {number} */ c) => L.sections[s]?.chambers[c] ?? null;
  const propped = (/** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ w) => !!st?.props?.some((/** @type {any} */ p) => p.s === s && p.c === c && p.w === w);
  const woodName = deps.woodName ?? ((/** @type {string} */ w) => `${w[0].toUpperCase()}${w.slice(1)}`);
  /** The strongest plank the Stores hold, or null. */
  const bestPlank = () => WOODS.map((w) => `plank:${w}`).find((k) => deps.planks(k) > 0) ?? null;

  function collapse() {
    if (fall !== null) return;
    fall = nowMs();
    deps.closeWindows();
  }

  return {
    /** The mine as its room says it (`k: 'st'`), or an act refused (`k: 'no'`). */
    heard(/** @type {any} */ m) {
      if (m?.k === 'no') { if (m.e === 'taken') deps.say(MINE_CLIENT_TEXT.taken()); else if (m.e === 'sealed') deps.say(MINE_CLIENT_TEXT.sealed()); return; }
      if (m?.k !== 'st' || !m.st) return;
      st = m.st;
      for (const e of m.ev ?? []) {
        if (e === 'collapse') { collapse(); continue; }
        const shake = MINE_SHAKE[/** @type {keyof typeof MINE_SHAKE} */ (e)];
        if (shake) { deps.shake(shake); deps.say(WARN_WORDS[/** @type {keyof typeof WARN_WORDS} */ (e)]()); }
      }
      if (st.sealedUntil > 0 && fall === null && !left) collapse();   // a newcomer to a mine already down is put out too
    },
    /** Every frame: the collapse's shake and fade, then the way out. */
    frame() {
      if (fall === null || left) return;
      const s = (nowMs() - fall) / 1000;
      deps.shake(MINE_SHAKE.collapse * Math.min(1, s / MINE_COLLAPSE_S));
      if (s >= MINE_COLLAPSE_S * 0.6) deps.fade(true);
      if (s >= MINE_COLLAPSE_S) { left = true; deps.leave(); deps.say(MINE_CLIENT_TEXT.collapsed()); }
    },
    /** A cave vein's strike the service answered (systems/mine/mineHost.js's node: its section `s`, its chamber `c`). */
    struck(/** @type {{ s: number, c: number }} */ node) { if (node && fall === null) deps.send('strike', { s: node.s, c: node.c }); },
    /** What a hole or a wall slot is called on the plaque. */
    name(/** @type {string} */ key) {
      const p = parseKey(key);
      if (!p) return null;
      if (p.kind === 'hole') { const h = chamber(p.s, p.c)?.holes[p.k]; return { title: t('mine.holeTitle', 'Minable Ore'), ...(h ? { sub: oreName(h.ore) } : {}) }; }   // the owner: "turn hole in the rock into Minable Ore"
      const w = chamber(p.s, p.c)?.walls[p.k];
      if (!w) return null;
      if (propped(p.s, p.c, p.k)) return { title: MINE_CLIENT_TEXT.shored() };
      const plank = bestPlank();
      return { title: w.weak ? MINE_CLIENT_TEXT.weak() : MINE_CLIENT_TEXT.sound(), ...(plank ? { sub: MINE_CLIENT_TEXT.shore(woodName(woodOf(plank))) } : {}) };
    },
    /** A press on a hole (examined) or a wall slot (shored). */
    async press(/** @type {string} */ key) {
      const p = parseKey(key);
      if (!p || fall !== null) return false;
      const ch = chamber(p.s, p.c);
      if (!ch) return false;
      if (p.kind === 'hole') {
        const h = ch.holes[p.k];
        if (!h) return false;
        deps.say(MINE_CLIENT_TEXT.hole(oreName(h.ore), h.rich, st?.stab?.[p.s] ?? 100));
        return true;
      }
      if (!ch.walls[p.k] || shoring) return false;
      if (propped(p.s, p.c, p.k)) { deps.say(MINE_CLIENT_TEXT.taken()); return true; }
      const plank = bestPlank();
      if (!plank) { deps.say(MINE_CLIENT_TEXT.noPlanks()); return true; }
      shoring = true;
      try {
        if (!(await deps.spend(plank))) return true;
        if (deps.send('prop', { s: p.s, c: p.c, w: p.k, wood: woodOf(plank) })) deps.say(MINE_CLIENT_TEXT.shoredWith(woodName(woodOf(plank))));
      } finally { shoring = false; }
      return true;
    },
    /** The mine as last heard (probes), and whether its collapse has put the player out. */
    state: () => st,
    falling: () => fall !== null,
  };
}

/** An activation key of the mine's: `mine:hole:<s>:<c>:<k>` or `mine:wall:<s>:<c>:<k>`. */
export const mineKey = (/** @type {'hole'|'wall'} */ kind, /** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ k) => `mine:${kind}:${s}:${c}:${k}`;
const KEY_RE = /^mine:(hole|wall):(\d):(\d):(\d{1,2})$/;
function parseKey(/** @type {string} */ key) {
  const m = KEY_RE.exec(String(key ?? ''));
  return m ? { kind: m[1], s: Number(m[2]), c: Number(m[3]), k: Number(m[4]) } : null;
}
/** An ore's name for a hole's words: `metal:iron` -> `Iron`. */
const oreName = (/** @type {string} */ key) => { const id = String(key).split(':')[1] ?? key; return `${id[0].toUpperCase()}${id.slice(1)}`; };
