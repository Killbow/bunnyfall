// @ts-check
import { KG_COLS, KG_ROWS, reachPath } from '../net/kingsGambit.js';
import { ILIAC_THROW_S } from './iliacCloth.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { SOUND } from '../audio/soundClips.js';

export const GAMBIT_WALK_CELLS_S = 3.5;
export const GAMBIT_IMPACT_S = 0.2;
export const GAMBIT_LUNGE_LEAD_S = 0.1;
export const GAMBIT_LUNGE_S = 0.28;
export const GAMBIT_LUNGE_MELEE = 0.15;
export const GAMBIT_LUNGE_SHOT = 0.06;
export const GAMBIT_SHOT_S = 0.3;
export const GAMBIT_HIT_S = 0.45;
export const GAMBIT_KNOCK = 0.22;
export const GAMBIT_SHAKE = 4 / ((1080 - 190) / 13);
export const GAMBIT_GLOW_S = 0.6;
export const GAMBIT_FLOAT_S = 1;
export const GAMBIT_FLOAT_RISE = 0.8;
export const GAMBIT_FALL_AFTER_S = 0.27;
export const GAMBIT_TOPPLE_S = 0.25;
export const GAMBIT_PILE_SLIDE_S = 0.35;
export const GAMBIT_MUSTER_BEAT_S = 0.12;
export const GAMBIT_THROW_FROM = 2.5;

export const GAMBIT_HIT_CLIPS = Object.freeze([SOUND.Hit1, SOUND.Hit2, SOUND.Hit3, SOUND.Hit4, SOUND.Hit5]);
export const GAMBIT_SWING_CLIPS = Object.freeze([SOUND.SwingLowPitch, SOUND.SwingMediumPitch, SOUND.SwingHighPitch]);
export const GAMBIT_SPELL_CLIPS = Object.freeze([SOUND.CastSpell1, SOUND.CastSpell2, SOUND.CastSpell3, SOUND.CastSpell4, SOUND.CastSpell5]);
export const GAMBIT_ARCHER_CLASSES = Object.freeze([141, 142]);
export const GAMBIT_HAZARD_CLIPS = Object.freeze({ fire: SOUND.SpellImpactFire, spikes: SOUND.Hit3, poison: SOUND.SpellImpactPoison });
export const GAMBIT_CALLING_FROM = 128;
/**
 * Returns null for a calling or a clip of 0, because PlayMonsterSound plays only clips above 0.
 * @param {number} unit
 * @param {string} kind
 */
export const monsterClip = (unit, kind) => {
  if (!(unit < GAMBIT_CALLING_FROM)) return null;
  const c = /** @type {any} */ (ENEMY_BASICS)[String(unit)]?.[kind];
  return Number.isInteger(c) && c > 0 ? c : null;
};

const MS = 1000;
const clamp01 = (/** @type {number} */ x) => Math.max(0, Math.min(1, x));
const unit = (/** @type {number} */ dc, /** @type {number} */ dr) => { const m = Math.hypot(dc, dr); return m > 0 ? [dc / m, dr / m] : [0, 0]; };

/**
 * @param {boolean} end
 * @param {number} side
 */
export function gambitPile(end, side) {
  if (end) return side === 0 ? [KG_COLS - 2, KG_ROWS + 1.4] : [1, -2.4];
  return side === 0 ? [KG_COLS + 1.2, KG_ROWS - 2] : [-2.2, 1];
}

/**
 * @param {boolean} end
 * @param {number} side
 */
export function gambitPileStep(end, side) {
  if (end) return side === 0 ? [-0.22, 0] : [0.22, 0];
  return side === 0 ? [0, -0.22] : [0, 0.22];
}

/** @param {{pick?: (n: number) => number}} [opts] */
export function createGambitMotion({ pick = () => 0 } = {}) {
  /** @type {Map<number, any>} */
  const known = new Map();
  /** @type {any} */ let tiles = null;
  /** @type {Map<number, any[]>} */
  const moves = new Map();
  /** @type {Map<number, any>} */
  const fallen = new Map();
  /** @type {Map<number, number>} */
  const throws = new Map();
  /** @type {any[]} */ let floats = [];
  /** @type {any[]} */ let shots = [];
  /** @type {any[]} */
  let cues = [];
  const cue = (/** @type {number|null} */ clip, /** @type {number} */ at, /** @type {number[]|null} */ cell = null) => { if (Number.isInteger(clip) && /** @type {number} */ (clip) >= 0) cues.push({ clip, at, cell }); };
  const one = (/** @type {readonly number[]} */ set) => set[Math.max(0, Math.min(set.length - 1, pick(set.length) | 0))];
  const piles = [0, 0];
  /** @type {boolean} */ let end = false;
  const busy = (/** @type {number} */ id) => { const l = moves.get(id); return l?.length ? l[l.length - 1].until : -Infinity; };
  const push = (/** @type {number} */ id, /** @type {any} */ m) => { const l = moves.get(id) ?? []; l.push(m); moves.set(id, l); return m; };
  const see = (/** @type {any} */ state) => {
    if (!state) return;
    tiles = state.tiles;
    for (const p of state.pieces) known.set(p.id, { ...p });
  };
  const strike = (/** @type {number} */ id, /** @type {number} */ at, /** @type {number[]} */ dir, /** @type {number} */ damage, /** @type {boolean} */ killed) => {
    const p = known.get(id);
    if (!p) return;
    push(id, { kind: 'hit', from: at, until: at + GAMBIT_HIT_S * MS, dir });
    floats.push({ col: p.col, row: p.row, text: `-${damage}`, at });
    if (killed && !fallen.has(id)) {
      const pile = gambitPile(end, p.side);
      fallen.set(id, { piece: { ...p }, at: at + GAMBIT_FALL_AFTER_S * MS, dir, pile, index: piles[p.side]++ });
    }
  };
  return {
    /** @param {boolean} isEnd */
    lay(isEnd) { end = !!isEnd; },
    /**
     * @param {any[]} events
     * @param {number} now
     * @param {any} state
     */
    feed(events, now, state) {
      for (const e of events) {
        const at = Number.isFinite(e.at) ? e.at : now;
        if (e.t === 'game') {
          known.clear(); moves.clear(); fallen.clear(); throws.clear(); floats = []; shots = []; cues = []; piles[0] = piles[1] = 0;
          see(state);
          // A `midway` game, opened by a watcher during play, skips the muster.
          if (e.midway) continue;
          cue(SOUND.DrawWeapon, at);
          for (const side of [0, 1]) {
            const mine = (state?.pieces ?? []).filter((/** @type {any} */ p) => p.side === side);
            const order = [...mine.filter((/** @type {any} */ p) => p.king), ...mine.filter((/** @type {any} */ p) => !p.king)];
            order.forEach((/** @type {any} */ p, i) => throws.set(p.id, at + i * GAMBIT_MUSTER_BEAT_S * MS));
          }
          for (const [id, t0] of throws) push(id, { kind: 'throw', from: t0, until: t0 + ILIAC_THROW_S * MS });
        } else if (e.t === 'move') {
          const p = known.get(e.piece);
          if (!p) continue;
          const board = { tiles, hazards: [], pieces: [...known.values()].filter((x) => !fallen.has(x.id) || x.id === p.id) };
          const path = (tiles && reachPath(board, { ...p, col: e.from[0], row: e.from[1] }, e.to[0], e.to[1])) ?? [e.from, e.to];
          const from = Math.max(at, busy(p.id));
          push(p.id, { kind: 'walk', from, until: from + ((path.length - 1) / GAMBIT_WALK_CELLS_S) * MS, path });
          const steps = path.length - 1, walk = monsterClip(p.unit, 'moveSound');
          if (steps > 0) cue(walk, from, e.from);
          if (steps > 1) cue(walk, from + (steps / GAMBIT_WALK_CELLS_S) * 0.5 * MS, e.to);
          p.col = e.to[0]; p.row = e.to[1];
        } else if (e.t === 'attack') {
          const a = known.get(e.piece), t = known.get(e.target);
          if (!a || !t) continue;
          const from = Math.max(at, busy(a.id));
          const dir = unit(t.col - a.col, t.row - a.row);
          const impact = from + GAMBIT_IMPACT_S * MS;
          push(a.id, { kind: 'lunge', from: impact - GAMBIT_LUNGE_LEAD_S * MS, until: impact - GAMBIT_LUNGE_LEAD_S * MS + GAMBIT_LUNGE_S * MS, dir, reach: e.shot ? GAMBIT_LUNGE_SHOT : GAMBIT_LUNGE_MELEE });
          const lands = e.shot ? impact + GAMBIT_SHOT_S * MS : impact;
          if (e.shot) shots.push({ from: [a.col, a.row], to: [t.col, t.row], at: impact });
          const hit = Math.max(lands, busy(t.id)), A = [a.col, a.row], T = [t.col, t.row];
          if (e.shot && GAMBIT_ARCHER_CLASSES.includes(a.unit)) { cue(SOUND.ArrowShoot, impact, A); cue(SOUND.ArrowHit, hit, T); }
          else if (e.shot) { cue(one(GAMBIT_SPELL_CLIPS), impact, A); cue(SOUND.SpellImpactMagic, hit, T); }
          else {
            cue(a.unit >= GAMBIT_CALLING_FROM ? one(GAMBIT_SWING_CLIPS) : monsterClip(a.unit, 'attackSound'), from, A);
            cue(one(GAMBIT_HIT_CLIPS), hit, T);
          }
          if (e.killed) cue(SOUND.BodyFall, hit + 0.3 * MS, T);
          else cue(t.unit >= GAMBIT_CALLING_FROM ? SOUND.PainSound : monsterClip(t.unit, 'barkSound'), hit + 0.1 * MS, T);
          strike(t.id, hit, dir, e.damage, !!e.killed);
        } else if (e.t === 'potion') {
          const p = known.get(e.piece);
          if (!p) continue;
          const from = Math.max(at, busy(p.id));
          push(p.id, { kind: 'glow', from, until: from + GAMBIT_GLOW_S * MS });
          cue(SOUND.MakePotion, from, [p.col, p.row]);
          floats.push({ col: p.col, row: p.row, text: `+${e.healed}`, at: from });
        } else if (e.t === 'hazard') {
          const p = known.get(e.piece);
          if (!p) continue;
          const bite = Math.max(at, busy(p.id));
          cue(/** @type {any} */ (GAMBIT_HAZARD_CLIPS)[e.kind] ?? null, bite, [p.col, p.row]);
          if (e.killed) cue(SOUND.BodyFall, bite + 0.3 * MS, [p.col, p.row]);
          strike(p.id, bite, [0, 0], e.damage, !!e.killed);
        } else if (e.t === 'warning') cue(SOUND.SpookyMid, at, e.cells?.[0] ?? null);
      }
      see(state);
    },
    /**
     * @param {any} state
     * @param {number} now
     * @param {{reduced?: boolean}} [opts]
     */
    poses(state, now, { reduced = false } = {}) {
      /** @type {any[]} */ const out = [];
      const lay = (/** @type {any} */ p, /** @type {any} */ fall) => {
        const list = moves.get(p.id) ?? [];
        let at = [p.col, p.row], tip = [0, 0], shake = [0, 0], flash = false, glow = false, thrown = null;
        const walk = list.filter((m) => m.kind === 'walk' && m.until > now)[0];
        if (walk) {
          const n = walk.path.length - 1, s = clamp01((now - walk.from) / Math.max(1, walk.until - walk.from)) * n;
          const i = Math.min(n - 1, Math.floor(s)), f = s - i;
          const a = walk.path[i], b = walk.path[i + 1] ?? a;
          at = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        for (const m of list) {
          if (now < m.from || now >= m.until) continue;
          const k = (now - m.from) / (m.until - m.from);
          if (m.kind === 'lunge') { const s = Math.sin(k * Math.PI) * m.reach; tip = [m.dir[0] * s, m.dir[1] * s]; }
          else if (m.kind === 'hit') {
            flash = true;
            if (!reduced) {
              const left = 1 - k;
              shake = [m.dir[0] * GAMBIT_KNOCK * left + Math.sin(k * 55) * GAMBIT_SHAKE * left, m.dir[1] * GAMBIT_KNOCK * left + Math.cos(k * 47) * GAMBIT_SHAKE * left];
            }
          } else if (m.kind === 'glow') glow = true;
        }
        const t0 = throws.get(p.id);
        if (t0 !== undefined && now < t0) return null;
        if (t0 !== undefined && now < t0 + ILIAC_THROW_S * MS) {
          const edge = p.side === 0 ? KG_ROWS - 1 + GAMBIT_THROW_FROM : -GAMBIT_THROW_FROM;
          thrown = { k: clamp01((now - t0) / (ILIAC_THROW_S * MS)), from: [p.col, edge] };
        }
        return { id: p.id, side: p.side, king: p.king, unit: p.unit, hp: p.hp, maxHp: p.maxHp, at, tip, shake, flash, glow, thrown, fall, pile: null };
      };
      for (const p of state?.pieces ?? []) { const x = lay(p, null); if (x) out.push(x); }
      for (const [, f] of fallen) {
        if (now < f.at) { const x = lay(f.piece, null); if (x) out.push(x); continue; }
        const k = clamp01((now - f.at) / (GAMBIT_TOPPLE_S * MS));
        const s = clamp01((now - f.at - GAMBIT_TOPPLE_S * MS) / (GAMBIT_PILE_SLIDE_S * MS));
        const x = lay(f.piece, { k, dir: f.dir });
        if (!x) continue;
        if (now >= f.at + GAMBIT_TOPPLE_S * MS) x.pile = { k: s, at: f.pile, index: f.index };
        out.push(x);
      }
      const fl = floats.filter((f) => now >= f.at && now < f.at + GAMBIT_FLOAT_S * MS)
        .map((f) => { const k = (now - f.at) / (GAMBIT_FLOAT_S * MS); return { at: [f.col, f.row], rise: GAMBIT_FLOAT_RISE * k, text: f.text, k }; });
      const sh = shots.filter((s) => now >= s.at && now < s.at + GAMBIT_SHOT_S * MS)
        .map((s) => { const k = (now - s.at) / (GAMBIT_SHOT_S * MS); return { at: [s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k], from: s.from, to: s.to, k }; });
      return { pieces: out, floats: fl, shots: sh, piles: [piles[0], piles[1]] };
    },
    /** @param {number} now */
    moving(now) {
      for (const l of moves.values()) if (l.some((m) => now < m.until)) return true;
      for (const f of fallen.values()) if (now < f.at + (GAMBIT_TOPPLE_S + GAMBIT_PILE_SLIDE_S) * MS) return true;
      return floats.some((f) => now < f.at + GAMBIT_FLOAT_S * MS) || shots.some((s) => now < s.at + GAMBIT_SHOT_S * MS);
    },
    /** @param {number} now */
    sounds(now) {
      const due = cues.filter((c) => c.at <= now).sort((x, y) => x.at - y.at);
      cues = cues.filter((c) => c.at > now);
      return due;
    },
    /**
     * @param {number|null} clip
     * @param {number} at
     * @param {number[]|null} [cell]
     */
    cue,
    reset() { known.clear(); moves.clear(); fallen.clear(); throws.clear(); floats = []; shots = []; cues = []; piles[0] = piles[1] = 0; tiles = null; },
  };
}
