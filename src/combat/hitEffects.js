// Hit effect billboards (DFU EnemyBlood.cs): one-shot flats nudged 2 cm along the facing so they never z-fight.
import { FlatAnim, isAnimatedFlat, IMPACT_FPS, MISSILE_FPS } from '../render/flatAnimation.js';
import { billboardSize, centredBase } from '../world/rmbFlats.js';
import { BLOODLESS_INDEX } from './bloodDecals.js';

import { createBleedLedger } from './bloodBleed.js';
import { flashPlayerBleed } from '../ui/damageFlash.js';
export const BLOOD_ARCHIVE = 380;
export const PLAYER_WALKER = Object.freeze({ player: true });
export const BLOOD_FPS = 10;
export const IMPACT_RECORD = 1;
export const FORWARD_NUDGE = 0.02;

export const SPARKLES_RECORD = 3;

export function bloodCentre(feet, height) {
  return [feet[0], feet[1] + height / 2 + height / 8, feet[2]];
}

let _splashObserver = null;
export function setSplashObserver(fn) { _splashObserver = typeof fn === 'function' ? fn : null; }

export function createHitEffects({
  renderer, getTexture, uploadRecordFrame, onSpawn = null, onRetire = null,
  marks = null,
  rng = Math.random,
} = {}) {
  const bleeding = createBleedLedger({ rng });
  const live = [];

  function spawn(record, pos, facing = null, { archive = BLOOD_ARCHIVE, fps = BLOOD_FPS, scale = 1, tracked = false, onTexture = null, conceal = null } = {}) {
    if (!(record >= 0) || !pos) return null;
    const at = [pos[0], pos[1], pos[2]];
    if (facing) {
      at[0] += facing[0] * FORWARD_NUDGE;
      at[1] += (facing[1] ?? 0) * FORWARD_NUDGE;
      at[2] += facing[2] * FORWARD_NUDGE;
    }
    // Record, size, pos, archive, and fps live on the entry because a recenter rebuilds the STATIC_DRAW batch.
    const entry = { batch: null, anim: null, dead: false, record, pos: at, at: [...at], size: null, archive, fps, scale, tracked, conceal };
    live.push(entry);
    getTexture(archive).then((t) => {
      if (entry.dead) return;
      if (!t) { retire(entry); return; }
      if (t.recordCount != null && record >= t.recordCount) { retire(entry); return; }
      const frameCount = t.getFrameCount?.(record) ?? 1;
      for (let f = 0; f < frameCount; f++) uploadRecordFrame(archive, record, f);
      if (onTexture) { try { onTexture(t, archive, record); } catch { } }
      // A blood mark's art is this splash's last frame, and only this point knows the frame count.
      if (archive === BLOOD_ARCHIVE && record !== BLOODLESS_INDEX) marks?.useArt?.(archive, record, frameCount);
      entry.size = billboardSize(t, record);
      if (scale !== 1 && entry.size) entry.size = { w: entry.size.w * scale, h: entry.size.h * scale };
      // Pool flats are centered on their position, but the renderer anchors every flat at its base.
      entry.batch = renderer.createBillboardBatch(archive, record, entry.size, [centredBase(entry.pos, entry.size)]);
      if (entry.conceal) entry.batch.conceal = entry.conceal;
      entry.batch.frame = 0;
      onSpawn?.(entry.batch);
      entry.anim = isAnimatedFlat(frameCount)
        ? new FlatAnim(archive, frameCount, !tracked, fps)
        : null;
      if (tracked) entry.batch.origin = [entry.at[0] - entry.pos[0], entry.at[1] - entry.pos[1], entry.at[2] - entry.pos[2]];
    }).catch(() => { if (!entry.batch) retire(entry); });
    return entry;
  }

  function retire(entry) {
    entry.dead = true;
    if (entry.batch) {
      onRetire?.(entry.batch);
      renderer.destroyBillboardBatch(entry.batch);
      entry.batch = null;
    }
    const i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
  }

  return {
    showBloodSplash: (bloodIndex, pos, facing = null, hit = null) => {
      const entry = spawn(bloodIndex ?? 0, pos, facing);
      if (_splashObserver && pos) { try { _splashObserver(bloodIndex ?? 0, pos, hit); } catch (e) { console.warn('[hitEffects] splash observer:', e?.message ?? e); } }
      marks?.place?.(hit?.markIndex ?? bloodIndex, pos, hit);
      return entry;
    },

    bleed: (dt, bodies, view) => {
      if (!marks) return 0;
      let n = 0;
      for (const a of bleeding.tick(dt, bodies, view)) {
        if (a.kind === 'drip') { if (marks.drip?.(a.bloodIndex, a.pos, a.count)) n++; }
        else if (a.kind === 'pool') { if (marks.spreadPool?.(a.bloodIndex, a.pos)) n++; }
        else if (a.kind === 'step') { if (marks.step?.(a.body, a.pos, a.forward)) n++; }
      }
      return n;
    },

    bleedPlayer: (dt, feet, entity) => {
      if (!marks || !feet || !entity) return 0;
      const health = entity.health ?? 0, maxHealth = entity.maxHealth ?? 0;
      const view = () => ({ feet, health, maxHealth, bloodIndex: 0, dead: !(health > 0), corpse: false, strides: false, wound: !!entity.bleed });
      let n = 0;
      for (const a of bleeding.tick(dt, [PLAYER_WALKER], view)) {
        if (a.kind === 'drip' && marks.drip?.(a.bloodIndex, a.pos, a.count)) { n++; flashPlayerBleed(); }
      }
      return n;
    },

    footfall: (pos, forward = null) => marks?.step?.(PLAYER_WALKER, pos, forward) ?? null,

    showMagicSparkles: (pos, facing = null) => spawn(SPARKLES_RECORD, pos, facing),
    showImpactFlash: (archive, pos, scale = 1, conceal = null) => spawn(IMPACT_RECORD, pos, null, { archive, fps: IMPACT_FPS, scale, conceal }),
    showMissEffect: (kind, pos, { archive = BLOOD_ARCHIVE, record = 2, fps = 20, scale = 2, conceal = null } = {}) => spawn(record, pos, null, { archive, fps, scale, conceal }),
    showFlyingFlat(archive, pos, { record = 0, fps = MISSILE_FPS, scale = 1, onTexture = null } = {}) {
      const e = spawn(record, pos, null, { archive, fps, scale, tracked: true, onTexture });
      return {
        move(at) {
          if (!e || e.dead || !at) return;
          e.at[0] = at[0]; e.at[1] = at[1]; e.at[2] = at[2];
          if (e.batch) e.batch.origin = [at[0] - e.pos[0], at[1] - e.pos[1], at[2] - e.pos[2]];
        },
        retire() { if (e && !e.dead) retire(e); },
      };
    },
    tick(dt) {
      marks?.tick?.(dt);
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        if (!e.batch) continue;
        // A single-frame record has no wrap to end on: a one-shot retires now, a tracked flat when its flight ends.
        if (!e.anim) { if (!e.tracked) retire(e); continue; }
        e.batch.frame = e.anim.tick(dt);
        if (e.anim.done) retire(e);
      }
    },
    batches: () => live.map((e) => e.batch).filter(Boolean),
    // A floating-origin recenter must move every live flat, and the blood marks with them.
    offsetAll(offset) {
      const [dx, dy, dz] = offset;
      marks?.shiftOrigin?.(offset);
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        e.pos[0] += dx; e.pos[1] += dy; e.pos[2] += dz;
        e.at[0] += dx; e.at[1] += dy; e.at[2] += dz;
        if (!e.batch) continue;
        onRetire?.(e.batch);
        renderer.destroyBillboardBatch(e.batch);
        e.batch = renderer.createBillboardBatch(e.archive, e.record, e.size, [centredBase(e.pos, e.size)]);
        if (e.conceal) e.batch.conceal = e.conceal;
        e.batch.frame = e.anim?.frame ?? 0;
        if (e.tracked) e.batch.origin = [e.at[0] - e.pos[0], e.at[1] - e.pos[1], e.at[2] - e.pos[2]];
        onSpawn?.(e.batch);
      }
    },
    // worldModes keeps one pool across buildings, so a splash still playing would otherwise draw in the next one.
    clear() {
      for (let i = live.length - 1; i >= 0; i--) retire(live[i]);
      marks?.clear?.();
      bleeding.clear();
    },
    _live: live,
  };
}
