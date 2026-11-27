// The Magic Candle for the Light effect (15,255): a point light above the player's head with the DFU wobble.
// As in DFU, only the player gets a candle; a Light cast on an enemy lights nothing.

import { billboardSize } from '../world/rmbFlats.js';
import { LIGHTS_ARCHIVE } from '../world/cityLights.js';
import { lightList, packLight, copyLights } from '../render/lightId.js';

export const CANDLE = Object.freeze({
  archive: LIGHTS_ARCHIVE,
  record: 3,
  distance: 1.4,
  heightFraction: 0.25,
  aboveHead: 0.35,
  range: 15,
  jitterRadius: 0.125,
  moveSpeed: 8,
});

// The candle floats above the head instead of 1.4 units in front as in DFU, so `_forward` is unused.
export function candleBase(feet, height, _forward) {
  return [
    feet[0],
    feet[1] + height + CANDLE.aboveHead,
    feet[2],
  ];
}

export function insideUnitSphere(rolls = Math.random) {
  for (let i = 0; i < 32; i++) {
    const x = rolls() * 2 - 1, y = rolls() * 2 - 1, z = rolls() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return [x, y, z];
  }
  return [0, 0, 0];
}

export function createCandleWobble(rolls = Math.random) {
  let last = [0, 0, 0];
  let next = null;
  let moveAmount = 0;
  const cur = [0, 0, 0];
  return {
    tick(dt) {
      if (!next) {
        moveAmount = 0;
        const j = insideUnitSphere(rolls);
        next = [j[0] * CANDLE.jitterRadius, j[1] * CANDLE.jitterRadius, j[2] * CANDLE.jitterRadius];
      }
      const t = Math.min(1, Math.max(0, moveAmount));
      cur[0] = last[0] + (next[0] - last[0]) * t;
      cur[1] = last[1] + (next[1] - last[1]) * t;
      cur[2] = last[2] + (next[2] - last[2]) * t;
      moveAmount += CANDLE.moveSpeed * dt;
      if (moveAmount >= 1) { last = next; next = null; }
    },
    offset: () => cur,
  };
}

export function withPlayerLights(base, ...lights) {
  if (base && base.data) {
    const live = lights.filter(Boolean);
    if (!live.length) return base;
    const data = withPlayerLights(base.data, ...live);
    const keep = (data.length / 4 - live.length) * 3;
    const colors = new Float32Array(keep + live.length * 3);
    live.forEach((l, i) => {
      const c = l.color ?? [1, 1, 1];
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    });
    colors.set(base.colors.subarray(0, keep), live.length * 3);
    return { data, colors, carried: data.carried };
  }
  const live = lights.filter(Boolean);
  if (!live.length) return base;
  // No cap here: the renderer cuts the list to its installed cap, and the player lights sit first,
  // so it drops the farthest base lights.
  const keep = (base.length / 4) * 4;
  const out = lightList(keep / 4 + live.length);
  // The carried mask has one byte per light in list order, because dropped and thrown torches share this list
  // and keep their glare.
  const carried = new Uint8Array(keep / 4 + live.length);
  live.forEach((l, i) => {
    packLight(out, i, l);
    if (l.carried) carried[i] = 1;
  });
  copyLights(out, live.length, base, 0, keep / 4);
  if (base.carried) carried.set(base.carried.subarray(0, keep / 4), live.length);
  out.carried = carried;
  return out;
}

export function createMagicCandle({
  renderer, getTexture, uploadRecord = null, rolls = Math.random,
  onSpawn = null, onRetire = null,
}) {
  const wobble = createCandleWobble(rolls);
  const pos = [0, 0, 0];
  let lit = false;
  let batch = null;
  let basePos = null;
  let warming = false;

  function spawnSprite() {
    if (warming || batch || !uploadRecord) return;
    warming = true;
    getTexture(CANDLE.archive).then((t) => {
      warming = false;
      // The candle can go out while the archive loads, so check again before building the sprite.
      if (!lit || batch || !t) return;
      if (t.recordCount != null && CANDLE.record >= t.recordCount) return;
      uploadRecord(CANDLE.archive, CANDLE.record);
      const size = billboardSize(t, CANDLE.record);
      basePos = [pos[0], pos[1], pos[2]];
      batch = renderer.createBillboardBatch(CANDLE.archive, CANDLE.record, size, [basePos]);
      onSpawn?.(batch);
    }).catch(() => { warming = false; });
  }

  function dropSprite() {
    if (batch) { onRetire?.(batch); renderer.destroyBillboardBatch(batch); batch = null; }
    basePos = null;
  }

  return {
    update(dt, { active, feet, height, forward }) {
      if (!active) { if (lit) { lit = false; dropSprite(); } return; }
      lit = true;
      wobble.tick(dt);
      const b = candleBase(feet, height, forward);
      const o = wobble.offset();
      pos[0] = b[0] + o[0]; pos[1] = b[1] + o[1]; pos[2] = b[2] + o[2];
      if (!batch) spawnSprite();
      else batch.origin = [pos[0] - basePos[0], pos[1] - basePos[1], pos[2] - basePos[2]];
    },
    light: () => (lit ? { x: pos[0], y: pos[1], z: pos[2], range: CANDLE.range, carried: true } : null),
    batch: () => batch,
    // A recenter drops the sprite, since its center is baked into a static buffer; the next update rebuilds it.
    offsetAll(offset) {
      if (!offset) return;
      dropSprite();
    },
    clear() { lit = false; dropSprite(); },
    _pos: pos,
  };
}
