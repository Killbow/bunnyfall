// @ts-check
// The client uses the latest mine state from the relay.
// Effects are injected so tests can exercise mine interactions without a scene.
import { t } from '../../ui/textManager.js';
import { MINE_WOOD_STRENGTH } from '../../net/mine/mineBrain.js';
import { drillReading } from '../../net/mine/mineDrill.js';

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
  wave: () => t('mine.wave', 'Something stirs in the dark. The noise has drawn them.'),
  setDrill: () => t('mine.setDrill', 'Set your drill here'),
  drillSet: (/** @type {string} */ ore) => t('mine.drillSet', 'Your drill bites into the {ore} seam and roars. It will draw attention.', { ore }),
  myDrill: (/** @type {number} */ n, /** @type {number} */ left) => (left > 0
    ? t('mine.myDrill', 'Your drill: {n} in the hopper, {m}:{s} left', { n, m: Math.floor(left / 60), s: String(left % 60).padStart(2, '0') })
    : t('mine.myDrillDone', 'Your drill has stopped: {n} in the hopper', { n })),
  theirDrill: () => t('mine.theirDrill', "Someone else's drill"),
  crewDrill: () => t('mine.crewDrill', "Your party's drill"),
  needDrill: () => t('mine.needDrill', 'You need a Mining Drill. The Cartographers’ Society sells them.'),
  needFuel: () => t('mine.needFuel', 'You have no Drill Fuel. The Cartographers’ Society sells it.'),
  rockWall: () => t('mine.rockWall', 'Rock wall'),
  rodHint: () => t('mine.rodHint', 'A Survey Rod would tell sound rock from weak'),
  lampSpot: () => t('mine.lampSpot', 'A dark chamber'),
  lampSet: () => t('mine.lampSet', 'Set a Mine Lamp here'),
  lampLit: () => t('mine.lampLit', 'A Mine Lamp burns here. Strays keep away.'),
  needLamp: () => t('mine.needLamp', 'You have no Mine Lamps. The Cartographers’ Society sells them.'),
  lampHung: () => t('mine.lampHung', 'You hang a Mine Lamp. Its light keeps strays from this chamber.'),
  hauled: (/** @type {number} */ n, /** @type {string} */ ore) => t('mine.hauled', 'You haul {n} {ore} into your Stores.', { n, ore }),
  haulFailed: () => t('mine.haulFailed', 'The haul could not be banked. Try again in a moment.'),
  refused: (/** @type {string} */ e) => ({
    'one-each': t('mine.oneEach', 'You already have a drill running in this mine.'),
    taken: t('mine.drillTaken', 'A drill already stands on this seam.'),
    'not-yours': t('mine.notYours', "That drill and its hopper are someone else's."),
    lit: t('mine.lit', 'A lamp already burns in this chamber.'),
    empty: t('mine.hopperEmpty', 'The hopper is empty. Give the drill time.'),
    guest: t('mine.drillGuest', 'Only a registered account can run a drill.'),
    full: t('mine.drillsFull', 'There is no room for another drill in this mine.'),
  })[e] ?? null,
});

const WARN_WORDS = Object.freeze({ 'warn:dust': MINE_CLIENT_TEXT.dust, 'warn:creak': MINE_CLIENT_TEXT.creak, 'warn:rumble': MINE_CLIENT_TEXT.rumble });
/** A wood's id from a plank's key (`plank:oak` -> `oak`). */
const woodOf = (/** @type {string} */ key) => key.slice('plank:'.length);
/** The woods, strongest first. */
const WOODS = Object.freeze(Object.keys(MINE_WOOD_STRENGTH).sort((a, b) => MINE_WOOD_STRENGTH[/** @type {keyof typeof MINE_WOOD_STRENGTH} */ (b)] - MINE_WOOD_STRENGTH[/** @type {keyof typeof MINE_WOOD_STRENGTH} */ (a)]));

/**
 * @param {{ layout: any, say: (text: string) => void, send: (k: string, fields?: any) => boolean, planks: (material: string) => number, spend: (material: string) => Promise<boolean>,
 *   shake: (k: number) => void, fade: (on: boolean) => void, closeWindows: () => void, leave: () => void, woodName?: (wood: string) => string, nowMs?: () => number,
 *   foes?: ((kind: 'wave'|'stray', s: number, c: number, n: number) => void) | null,
 *   drillOk?: (() => boolean) | null, me?: (() => (string|null)) | null, claim?: ((receipt: string) => Promise<any>) | null,
 *   kit?: ((id: string) => number) | null, useKit?: ((id: string) => Promise<boolean>) | null, crew?: (() => string[]) | null,
 *   sound?: ((name: string) => void) | null }} deps
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

  let lastAsk = '';
  const nowS = () => Math.floor(Date.now() / 1000);
  /** The drill on hole k of chamber c of section s, as the room last said it, or null. */
  const lit = (/** @type {number} */ s, /** @type {number} */ c) => !!st?.lamps?.some((/** @type {any} */ l) => l.s === s && l.c === c);
  const drillAt = (/** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ k) => st?.drills?.find((/** @type {any} */ d) => d.s === s && d.c === c && d.k === k) ?? null;
  async function haul(/** @type {string} */ r) {
    try {
      const a = await deps.claim?.(r);
      const paid = a?.data?.paid ?? 0;
      if (a?.ok && paid > 0) { deps.say(MINE_CLIENT_TEXT.hauled(paid, oreName(a.data.ore))); deps.sound?.('haul'); }
      else if (!a?.ok) deps.say(MINE_CLIENT_TEXT.haulFailed());
    } catch { deps.say(MINE_CLIENT_TEXT.haulFailed()); }
  }

  function collapse() {
    if (fall !== null) return;
    fall = nowMs();
    deps.closeWindows();
  }

  return {
    /** The mine as its room says it (`k: 'st'`), or an act refused (`k: 'no'`). */
    heard(/** @type {any} */ m) {
      if (m?.k === 'rc' && typeof m.r === 'string') { void haul(m.r); return; }
      if (m?.k === 'no') { const said = m.e === 'sealed' ? MINE_CLIENT_TEXT.sealed() : lastAsk === 'prop' && m.e === 'taken' ? MINE_CLIENT_TEXT.taken() : MINE_CLIENT_TEXT.refused(m.e); if (said) deps.say(said); return; }
      if (m?.k !== 'st' || !m.st) return;
      st = m.st;
      for (const e of m.ev ?? []) {
        if (e === 'collapse') { deps.sound?.('collapse'); collapse(); continue; }
        if (e.startsWith('drill:')) { deps.sound?.('drillStart'); continue; }   // the room's: a drill set, heard by all in it
        if (e.startsWith('lamp:')) { deps.sound?.('lamp'); continue; }
        const call = /^(wave|stray):(\d):(\d):(\d)$/.exec(e);
        if (call) { if (call[1] === 'wave') { deps.say(MINE_CLIENT_TEXT.wave()); deps.sound?.('wave'); } if (fall === null) deps.foes?.(/** @type {any} */ (call[1]), Number(call[2]), Number(call[3]), Number(call[4])); continue; }
        const shake = MINE_SHAKE[/** @type {keyof typeof MINE_SHAKE} */ (e)];
        if (shake) { deps.shake(shake); deps.say(WARN_WORDS[/** @type {keyof typeof WARN_WORDS} */ (e)]()); deps.sound?.(e); }
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
      if (p.kind === 'hole') {
        const h = chamber(p.s, p.c)?.holes[p.k], d = drillAt(p.s, p.c, p.k), me = deps.me?.() ?? null;
        const mineOrCrew = d && (d.by === me || (me && d.crew?.includes(me)));
        const drill = !deps.drillOk?.() ? null : !d ? MINE_CLIENT_TEXT.setDrill() : mineOrCrew ? (() => { const r = drillReading(d, nowS()); return d.by === me ? MINE_CLIENT_TEXT.myDrill(r.n, r.left) : `${MINE_CLIENT_TEXT.crewDrill()}: ${MINE_CLIENT_TEXT.myDrill(r.n, r.left).split(': ').slice(1).join(': ')}`; })() : MINE_CLIENT_TEXT.theirDrill();
        return { title: t('mine.holeTitle', 'Minable Ore'), ...(h ? { sub: drill ? `${oreName(h.ore)} - ${drill}` : oreName(h.ore) } : {}) };
      }   // the owner: "turn hole in the rock into Minable Ore"
      if (p.kind === 'lamp') return chamber(p.s, p.c) ? { title: lit(p.s, p.c) ? MINE_CLIENT_TEXT.lampLit() : MINE_CLIENT_TEXT.lampSpot(), ...(lit(p.s, p.c) ? {} : { sub: MINE_CLIENT_TEXT.lampSet() }) } : null;
      const w = chamber(p.s, p.c)?.walls[p.k];
      if (!w) return null;
      if (propped(p.s, p.c, p.k)) return { title: MINE_CLIENT_TEXT.shored() };
      const plank = bestPlank();
      // the Survey Rod reads the rock (the spec's section 3): without one, a wall is only a wall
      const rod = (deps.kit?.('rod') ?? 1) > 0;
      const title = rod ? (w.weak ? MINE_CLIENT_TEXT.weak() : MINE_CLIENT_TEXT.sound()) : MINE_CLIENT_TEXT.rockWall();
      return { title, ...(plank ? { sub: MINE_CLIENT_TEXT.shore(woodName(woodOf(plank))) } : !rod ? { sub: MINE_CLIENT_TEXT.rodHint() } : {}) };
    },
    /** A press on a hole (examined) or a wall slot (shored). */
    async press(/** @type {string} */ key, mode = 'grab') {
      const p = parseKey(key);
      if (!p || fall !== null) return false;
      const ch = chamber(p.s, p.c);
      if (!ch) return false;
      if (p.kind === 'hole') {
        const h = ch.holes[p.k];
        if (!h) return false;
        // Info, or a relay before drills: the hole examined. Otherwise the drill - set mine here, or empty mine
        if (mode === 'info' || !deps.drillOk?.()) { deps.say(MINE_CLIENT_TEXT.hole(oreName(h.ore), h.rich, st?.stab?.[p.s] ?? 100)); return true; }
        const d = drillAt(p.s, p.c, p.k), me = deps.me?.() ?? null;
        if (d && d.by !== me && !(me && d.crew?.includes(me))) { deps.say(MINE_CLIENT_TEXT.refused('not-yours') ?? ''); return true; }
        if (d) { lastAsk = 'take'; deps.send('take', { s: p.s, c: p.c, h: p.k }); return true; }
        // a new drill: its own (a Mining Drill owned), a shift's fuel spent, the mine's own refusals asked first so no fuel is lost to one
        if (st?.drills?.some((/** @type {any} */ x) => x.by === me && drillReading(x, nowS()).running)) { deps.say(MINE_CLIENT_TEXT.refused('one-each') ?? ''); return true; }
        if (deps.kit && deps.kit('drill') <= 0) { deps.say(MINE_CLIENT_TEXT.needDrill()); return true; }
        if (deps.useKit && !(await deps.useKit('fuel'))) { deps.say(MINE_CLIENT_TEXT.needFuel()); return true; }
        lastAsk = 'drill';
        if (deps.send('drill', { s: p.s, c: p.c, h: p.k, crew: deps.crew?.() ?? [] })) deps.say(MINE_CLIENT_TEXT.drillSet(oreName(h.ore)));
        return true;
      }
      if (p.kind === 'lamp') {
        if (lit(p.s, p.c)) { deps.say(MINE_CLIENT_TEXT.lampLit()); return true; }
        if (!deps.drillOk?.()) return true;
        if (deps.useKit && !(await deps.useKit('lamp'))) { deps.say(MINE_CLIENT_TEXT.needLamp()); return true; }
        lastAsk = 'lamp';
        if (deps.send('lamp', { s: p.s, c: p.c })) deps.say(MINE_CLIENT_TEXT.lampHung());
        return true;
      }
      if (!ch.walls[p.k] || shoring) return false;
      if (propped(p.s, p.c, p.k)) { deps.say(MINE_CLIENT_TEXT.taken()); return true; }
      const plank = bestPlank();
      if (!plank) { deps.say(MINE_CLIENT_TEXT.noPlanks()); return true; }
      shoring = true;
      try {
        if (!(await deps.spend(plank))) return true;
        lastAsk = 'prop';
        if (deps.send('prop', { s: p.s, c: p.c, w: p.k, wood: woodOf(plank) })) { deps.say(MINE_CLIENT_TEXT.shoredWith(woodName(woodOf(plank)))); deps.sound?.('shore'); }
      } finally { shoring = false; }
      return true;
    },
    /** The mine as last heard (probes), and whether its collapse has put the player out. */
    state: () => st,
    falling: () => fall !== null,
  };
}

/** An activation key of the mine's: `mine:hole:<s>:<c>:<k>` or `mine:wall:<s>:<c>:<k>`. */
export const mineKey = (/** @type {'hole'|'wall'|'lamp'} */ kind, /** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ k) => `mine:${kind}:${s}:${c}:${k}`;
const KEY_RE = /^mine:(hole|wall|lamp):(\d):(\d):(\d{1,2})$/;
function parseKey(/** @type {string} */ key) {
  const m = KEY_RE.exec(String(key ?? ''));
  return m ? { kind: m[1], s: Number(m[2]), c: Number(m[3]), k: Number(m[4]) } : null;
}
/** An ore's name for a hole's words: `metal:iron` -> `Iron`. */
const oreName = (/** @type {string} */ key) => { const id = String(key).split(':')[1] ?? key; return `${id[0].toUpperCase()}${id.slice(1)}`; };
