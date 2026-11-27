// @ts-check
import { FALL_MS, THUD_AT_MS, FALL_SINK_M, CORPSE_SCALE, BOSS_LOOKS, BOSS_CUES, GLOW_RANGE, GLOW_UP_SHARE, FALL_GLOW_K, emberColor } from '../../world/gateBoss.js';
import { BOSS_H } from '../../net/gateBrain.js';
import { FALL_FLASH_MS, FALL_SHAKE, COLUMN_BURSTS, COLUMN_STEP_MS, FALL_CRY_LATE_MS, FALL_BURST_UP, FALL_FLASH_Y, FALL_FLASH_K, FALL_FLASH_RANGE, FALL_NEWS_MS, WHITE } from '../../worldEvents/gateCourt.js';
import { GateFxRenderer, GATE_FX_PROGRAMS, FX_KINDS, FX_BURST_MS, FX_BURSTS_MAX } from '../../render/gateFx.js';
import { compiledPass } from '../../render/glProgram.js';
import { ENEMY_BASICS } from '../../characters/enemyBasics.js';
import { FLY_ANIM_SPEED } from '../../characters/mobileUnit.js';
import { billboardSize } from '../../world/rmbFlats.js';
import { egBodyPlace, egBodyHeight } from '../../net/eliteGates/egLink.js';
import { EG_LORDS, EG_BANDS } from '../../net/eliteGates/egLaw.js';
import { EG_BOSS_KEYS } from '../../net/eliteGates/egLords.js';

export const EG_FALL_PER = (drawn) => (drawn > 0 ? drawn : BOSS_LOOKS.ruhn.scale) / BOSS_LOOKS.ruhn.scale;
export const egFallSinkM = (drawn) => FALL_SINK_M * EG_FALL_PER(drawn);
export const egFallTallM = (drawn) => BOSS_H * EG_FALL_PER(drawn);
export const egCorpseScale = (drawn) => CORPSE_SCALE * EG_FALL_PER(drawn);
// Fall instants of one lord closer than this are one fall re-anchored, not a second fall.
export const EG_FALL_SAME_MS = FALL_MS;
export const egFallAloft = (since) => { const k = Math.min(1, Math.max(0, since) / THUD_AT_MS); return 1 - k * k; };
/**
 * @param {number} since
 * @param {any} anims
 * @param {number} [drawn]
 * @param {boolean} [winged]
 */
export function egLordFallAct(since, anims, drawn = BOSS_LOOKS.ruhn.scale, winged = false) {
  if (since >= FALL_MS) return { act: 'gone', anims, frame: 0, loop: false, sink: 0, aloft: 0 };
  const s = Math.max(0, since), k = Math.min(1, s / THUD_AT_MS);
  const sink = s > THUD_AT_MS ? egFallSinkM(drawn) * Math.min(1, (s - THUD_AT_MS) / (FALL_MS - THUD_AT_MS)) : 0;
  const frame = winged ? Math.floor((s / 1000) * FLY_ANIM_SPEED) : Math.max(0, Math.min(4, Math.floor(k * 5)));
  return { act: 'fall', anims, frame, loop: winged, sink, aloft: egFallAloft(s) };
}
export const EG_FALL_ASPECT = Object.freeze({ fire: 'burning', frost: 'rime', shock: 'storm', poison: 'venom' });
/**
 * @param {string} key
 * @param {number} [pt]
 */
export const egLordEl = (key, pt = 0) => (key === 'twins' ? (pt === 1 ? 'frost' : 'fire') : EG_LORDS[key]?.el ?? null);
/**
 * @param {string} key
 * @param {number} pt
 * @param {number} band
 */
export const egLordEmber = (key, pt, band) => emberColor({ aspect: { id: EG_FALL_ASPECT[egLordEl(key, pt) ?? ''] ?? EG_BANDS[band]?.aspect ?? null } });
/** @param {number} mobile */
export const egFallCry = (mobile) => ({ ...BOSS_CUES.fall, clip: ENEMY_BASICS[mobile]?.barkSound ?? BOSS_CUES.fall.clip });

/** @param {{ renderer?: any, gl?: any, getTexture?: any, uploadRecordFrame?: any, now: () => number, play3?: (cue: any, at: number[]|null) => void, shake?: (k: number) => void, motion?: () => number, band?: () => number, batches: any[], lights: any[] }} deps */
export function createEgLordFall({ renderer = null, gl = null, getTexture = null, uploadRecordFrame = null, now, play3 = () => {}, shake = () => {}, motion = () => 1, band = () => 0, batches, lights }) {
  const lords = new Map();
  const textures = new Map();
  const bursts = [], live = [];
  let frameNo = 0;
  const fxPassOf = () => compiledPass(gl, GATE_FX_PROGRAMS, () => new GateFxRenderer(gl), (e) => console.warn('[eg] a lord\'s fall would not build', e?.message ?? e));
  let fxDoor = fxPassOf();

  function corpseTexture(archive) {
    const had = textures.get(archive);
    if (had && !(had instanceof Promise)) return had.failed ? null : had.tex;
    if (!had && getTexture) textures.set(archive, Promise.resolve().then(() => getTexture(archive)).then((tex) => { textures.set(archive, tex ? { tex } : { failed: true }); }, () => { textures.set(archive, { failed: true }); }));
    return null;
  }
  function putAway(L) {
    if (L.corpse) { renderer?.destroyBillboardBatch?.(L.corpse); L.corpse = null; }
  }
  function addBurst(p, at0, kind, color, floor) {
    let b = bursts.length < FX_BURSTS_MAX ? null : bursts.reduce((o, q) => (q.at0 < o.at0 ? q : o));
    if (!b) { b = { at: [0, 0, 0], at0: 0, t: -1, kind, color, floor: NaN }; bursts.push(b); }
    b.at[0] = p[0]; b.at[1] = p[1]; b.at[2] = p[2]; b.at0 = at0; b.kind = kind; b.color = color; b.floor = floor;
  }
  function placeAt(L, b, centre) {
    const [x, z] = egBodyPlace(b, b.fellAt), y = egBodyHeight(b, b.fellAt), P = L.place, F = L.feet;
    P[0] = x; P[1] = z; P[2] = y;
    F[0] = centre[0] + x; F[1] = centre[1] + y; F[2] = centre[2] + z;
    if (L.corpse) { L.corpse.origin[0] = F[0]; L.corpse.origin[1] = F[1]; L.corpse.origin[2] = F[2]; }
  }
  function lay(L, mobile) {
    const ct = ENEMY_BASICS[mobile]?.corpseTexture;
    if (L.corpse || !ct || !renderer?.createBillboardBatch) return;
    const tex = corpseTexture(ct.archive);
    if (!tex) return;
    const sz = billboardSize(tex, ct.record), k = egCorpseScale(L.drawn), w = (sz?.w ?? 1.6) * k, h = (sz?.h ?? 0.6) * k;
    const rkey = `${ct.record}#0`;
    if (!renderer.textures?.has?.(`${ct.archive}_${rkey}`)) uploadRecordFrame?.(ct.archive, ct.record, 0);
    const c = renderer.createBillboardBatch(ct.archive, rkey, { w, h }, [[0, 0, 0]]);
    if (!c) return;
    c.origin = [L.feet[0], L.feet[1], L.feet[2]]; c.record = rkey; c.size = { w, h };
    if (L.drawn > 1) c.noShadow = true;
    L.corpse = c;
  }

  return {
    see(b, t, look, centre) {
      if (!centre || !(b?.fellAt > 0)) return;
      const since = t - b.fellAt;
      if (since < 0) return;
      let L = lords.get(b.i);
      if (L && L.at !== b.fellAt) {
        if (Math.abs(b.fellAt - L.at) < EG_FALL_SAME_MS) {
          const d = b.fellAt - L.at;
          L.at = b.fellAt; if (Number.isFinite(L.flashAt)) L.flashAt += d;
          // Only a stopped row moves the body, since the relay stops a felled lord's walk; a row still walking
          // comes from an older relay and is ignored.
          if (!b.mv) placeAt(L, b, centre);
        } else { putAway(L); L = null; }
      }
      if (!L) {
        L = { at: b.fellAt, place: [0, 0, 0], feet: [0, 0, 0], drawn: look.drawn, hover: look.hover > 0 ? look.hover : 0, tall: egFallTallM(look.drawn), ember: egLordEmber(EG_BOSS_KEYS[b.k] ?? '', b.pt | 0, band()),
          thud: false, column: 0, flashAt: -Infinity, corpse: null, frame: 0, glow: { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true }, flash: { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true } };
        lords.set(b.i, L);
        placeAt(L, b, centre);
        if (since < FALL_CRY_LATE_MS) {
          const F = L.feet, chest = [F[0], F[1] + L.hover + L.tall * FALL_BURST_UP, F[2]];
          play3(egFallCry(look.mobile), chest);
          addBurst(chest, L.at, FX_KINDS.dagon, L.ember, F[1]);
          L.flashAt = L.at;
          const m = motion();
          if (m > 0) shake(FALL_SHAKE * m);
        }
      }
      L.frame = frameNo;
      const F = L.feet, s = t - L.at;
      if (!L.thud && s >= THUD_AT_MS) { L.thud = true; if (s < THUD_AT_MS + FALL_NEWS_MS) play3(BOSS_CUES.thud, [F[0], F[1] + 1, F[2]]); }
      for (; L.column < COLUMN_BURSTS && s >= THUD_AT_MS + L.column * COLUMN_STEP_MS; L.column++) {
        const at0 = L.at + THUD_AT_MS + L.column * COLUMN_STEP_MS;
        if (t < at0 + FALL_NEWS_MS) addBurst([F[0], F[1] + 0.1, F[2]], at0, FX_KINDS.embers, L.ember, F[1]);
      }
      if (s < FALL_MS) {
        const g = L.glow, k = FALL_GLOW_K * (1 - s / FALL_MS);
        g.x = F[0]; g.y = F[1] + L.hover * egFallAloft(s) + L.tall * GLOW_UP_SHARE; g.z = F[2]; g.range = GLOW_RANGE.landing;
        g.color[0] = L.ember[0] * k; g.color[1] = L.ember[1] * k; g.color[2] = L.ember[2] * k;
        lights.push(g);
      }
      if (t >= L.flashAt && t - L.flashAt < FALL_FLASH_MS) {
        const f = L.flash, k = FALL_FLASH_K * (1 - (t - L.flashAt) / FALL_FLASH_MS);
        f.x = F[0]; f.y = F[1] + FALL_FLASH_Y; f.z = F[2]; f.range = FALL_FLASH_RANGE;
        f.color[0] = WHITE[0] * k; f.color[1] = WHITE[1] * k; f.color[2] = WHITE[2] * k;
        lights.push(f);
      }
      if (s >= FALL_MS) { lay(L, look.mobile); if (L.corpse) batches.push(L.corpse); }
    },
    placeOf: (i) => lords.get(i)?.place ?? null,
    // Call once a frame after every `see`; a lord not seen this frame has its body put away.
    sweep() {
      for (const [i, L] of lords) if (L.frame !== frameNo) { putAway(L); lords.delete(i); }
      frameNo++;
    },
    warm() { fxDoor(false); },
    bursts(t = now()) {
      live.length = 0;
      for (const b of bursts) { b.t = (t - b.at0) / 1000; if (b.t >= 0 && b.t < FX_BURST_MS / 1000) live.push(b); }
      return live;
    },
    draw(proj, view, eye, seconds, fog = null) {
      if (!this.bursts().length) return false;
      const pass = fxDoor(true);
      if (!pass) return false;
      pass.draw(live, null, proj, view, eye, seconds, fog, renderer?.worldViewportPx?.[3] ?? 0);
      return pass.bursts > 0;
    },
    state: () => [...lords].map(([i, L]) => ({ i, at: L.at, thud: L.thud, column: L.column, flashAt: L.flashAt, corpse: !!L.corpse, feet: [...L.feet] })),
    leave() {
      for (const L of lords.values()) putAway(L);
      lords.clear(); bursts.length = 0; live.length = 0;
    },
    // A fresh door replaces the old one before the pass is destroyed, so nothing reaches the freed pass.
    dispose() {
      this.leave();
      if (!fxDoor.settled) return;
      const pass = fxDoor();
      fxDoor = fxPassOf();
      try { pass?.destroy(); } catch { }
    },
  };
}
