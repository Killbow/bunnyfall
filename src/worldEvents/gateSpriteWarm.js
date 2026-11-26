// @ts-check

import { HOST } from '../net/gateBrain.js';
import { hasPortent } from '../net/gateMods.js';
import { bossLookOf, hostLookOf, flameLookOf } from '../world/gateBoss.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';

export const SPRITE_WARM_UPLOADS = 4;
export const SPRITE_WARM_LOOKS = 48;

/**
 * The Tithe-Imp is always included because it can appear on any night with no portent to announce it.
 * @param {any} s
 * @param {any} P
 * @returns {number[]}
 */
export function nightMobiles(s, P) {
  if (!s || s.day === null || s.day === undefined) return [];
  const a = P?.aspect?.id, m = new Set([bossLookOf(s.boss).mobile, hostLookOf(HOST.tithe, a).mobile]);
  if (P?.legion) for (const k of [HOST.harrier, HOST.sapper, HOST.bearer]) m.add(hostLookOf(k, a).mobile);
  if (hasPortent(s.pt, 'vanguard')) for (const k of [HOST.harrier, HOST.brute, HOST.caster, HOST.markynaz]) m.add(hostLookOf(k, a).mobile);
  if (hasPortent(s.pt, 'sunder')) m.add(flameLookOf(a).mobile);
  if (hasPortent(s.pt, 'captive')) m.add(hostLookOf(HOST.gaoler, a).mobile);
  return [...m];
}

/** @param {{ getTexture?: ((archive: number) => any)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, has?: (archive: number, rkey: string) => boolean }} deps */
export function createSpriteWarm({ getTexture = null, uploadRecordFrame = null, has = () => false } = {}) {
  /** @type {Map<number, { tex: any, r: number, f: number, done: boolean }>} */
  const asked = new Map();
  let night = null;
  return {
    /**
     * @param {any} s
     * @param {any} P
     */
    want(s, P) {
      if (!getTexture || !uploadRecordFrame) return;
      const key = `${s?.day}|${s?.boss}|${P?.aspect?.id}|${P?.legion ? 1 : 0}|${s?.pt ?? ''}`;
      if (key === night) return;
      night = key;
      for (const m of nightMobiles(s, P)) {
        const archive = ENEMY_BASICS[m]?.maleTexture;
        if (!archive || asked.has(archive)) continue;
        const e = { tex: null, r: 0, f: 0, done: false };
        asked.set(archive, e);
        Promise.resolve().then(() => getTexture(archive)).then((t) => { if (t) e.tex = t; else e.done = true; }, () => { e.done = true; });
      }
    },
    /** @returns {number} */
    step() {
      let up = 0, looked = 0;
      for (const [archive, e] of asked) {
        if (e.done || !e.tex) continue;
        const R = e.tex.recordCount ?? 0;
        while (up < SPRITE_WARM_UPLOADS && looked < SPRITE_WARM_LOOKS) {
          if (e.r >= R) { e.done = true; break; }
          if (e.f >= (e.tex.getFrameCount?.(e.r) ?? 1)) { e.r++; e.f = 0; continue; }
          looked++;
          if (!has(archive, `${e.r}#${e.f}`)) { uploadRecordFrame?.(archive, e.r, e.f); up++; }
          e.f++;
        }
        if (up >= SPRITE_WARM_UPLOADS || looked >= SPRITE_WARM_LOOKS) break;
      }
      return up;
    },
    clear() { asked.clear(); night = null; },
  };
}
