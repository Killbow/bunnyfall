import { buildNeutralBody, WRIST_JUNCTION_Y, ARM_X, NECK_PIVOT_Y } from './neutralBody.js';
import { createAnimContext, animateTarget, IDLE, WALK, RUN, POSE_L } from './animate.js';
import { packCharacterFaces } from '../render/characterMesh.js';

const CLASSIC_HEIGHT = 1.8;
const GAITS = [null, WALK, RUN, IDLE];

export function deriveClassicRamps(palette, bodyBmp) {
  const W = bodyBmp.width;
  const lumOf = (i) => { const c = palette.get(i); return 0.299*c.r + 0.587*c.g + 0.114*c.b; };
  const rampOf = (r0, r1, keep) => {
    const m = new Map();
    for (let y = r0; y <= r1; y++) for (let x = 0; x < W; x++) {
      const i = bodyBmp.data[y*W + x];
      if (i && (!keep || keep(x, y))) m.set(i, lumOf(i));
    }
    return [...m.entries()].sort((a, b) => a[1] - b[1]).map((e) => { const c = palette.get(e[0]); return [c.r, c.g, c.b]; });
  };
  return { skin: rampOf(40, 60, (x) => Math.abs(x - ((W-1)/2)) < 14), boot: rampOf(132, 144) };
}

export function createCharacterRig(renderer, faces) {
  const packed = packCharacterFaces(faces.map((f) => ({ p: f.p, n: f.n, c: f.c })));
  const mesh = renderer.createCharacterMesh(packed);
  const count = packed.length / 9;
  const GI = { body: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5 };
  const base = new Float32Array(count * 3);
  const vgrp = new Uint8Array(count);
  {
    let v = 0;
    for (const f of faces) {
      const g = GI[f.g] ?? 0;
      const np = f.p.length / 3;
      for (let i = 1; i < np - 1; i++) {
        for (const k of [0, i, i + 1]) {
          base[v*3] = f.p[k*3]; base[v*3+1] = f.p[k*3+1]; base[v*3+2] = f.p[k*3+2];
          vgrp[v] = g; v++;
        }
      }
    }
  }
  const T = { pos: base.slice(), base, vgrp, held: false, dirty: false };
  const ctx = createAnimContext({
    basePos: base, vgrp,
    armX: ARM_X,
    wristY: WRIST_JUNCTION_Y * 0.9,
    neckY: NECK_PIVOT_Y * 0.9,
  });
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < base.length; i += 3) { if (base[i] < minY) minY = base[i]; if (base[i] > maxY) maxY = base[i]; }
  const scale = CLASSIC_HEIGHT / (maxY - minY);
  const anim = packed.slice();
  let wt = 0, gait = 0, pose = null;

  return {
    mesh, T, ctx, scale, footY: minY, liveFootY: minY, liveBounds: null,
    setGait(g) { gait = g | 0; },
    setPose(p) { pose = p || null; },
    update(dt) {
      const L = GAITS[gait];
      if (L) wt += dt * L.cadence;
      this.drive(L ? wt : 0, L || POSE_L, pose, !!L);
    },
    drive(wt2, L, pose2, moving) {
      animateTarget(ctx, T, wt2, L, (L.bobAmp || 0) * Math.sin(wt2 * 2), pose2, moving);
      let lo = Infinity, hi = -Infinity, lx = Infinity, hx = -Infinity, lz = Infinity, hz = -Infinity;
      for (let v = 0; v < count; v++) {
        const x = T.pos[v*3], y = T.pos[v*3+1], z = T.pos[v*3+2];
        anim[v*9] = x; anim[v*9+1] = y; anim[v*9+2] = z;
        if (y < lo) lo = y; if (y > hi) hi = y;
        if (x < lx) lx = x; if (x > hx) hx = x;
        if (z < lz) lz = z; if (z > hz) hz = z;
      }
      this.liveBounds = { minX: lx, maxX: hx, minY: lo, maxY: hi, minZ: lz, maxZ: hz };
      this.liveFootY = lo;
      renderer.updateCharacterMesh(mesh, anim);
      T.dirty = false;
    },
  };
}

export function createEngineRig(renderer, ramps) {
  return createCharacterRig(renderer, buildNeutralBody(ramps));
}
