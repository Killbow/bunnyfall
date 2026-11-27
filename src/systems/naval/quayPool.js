// @ts-check
import { planQuay, lanternLights, pierOutline, pierAlong, QUAY_DECK_UP } from './quays.js';
import { buildQuayModel, buildGangwayModel } from '../../world/quayModel.js';
import { trs } from '../../world/mat4.js';
import { portPlaceName } from '../../travel/portPlaces.js';

export const QUAY_STAND_M = 1600;
export const QUAY_LEAVE_M = 2000;
export const QUAY_RETRY_S = 2;
export const QUAY_LIGHTS_MAX = 6;
export const QUAY_LIGHT_REACH = 120;
export const QUAY_LIGHT_RANGE = 14;
export const QUAY_BUCKET = 'quay:';
export const DOCKS_MARK_LIFT = 4;

const DEG = 180 / Math.PI;

/**
 * @param {{
 *   renderer?: any,
 *   prepare?: (model: any) => Promise<void>,
 *   collider: () => any,
 *   harbours: () => Array<{ key: string, name?: string|null, harbour: any }>,
 *   seaY: () => number,
 *   groundAt: (x: number, z: number) => number,
 *   feet: () => (number[] | null),
 *   mode: () => string,
 *   gangways?: () => Array<{ foot: number[], head: number[] }>,
 *   now?: () => number,
 * }} deps
 */
export function createQuayPool(deps) {
  // Quays are never saved or sent: each comes from the terrain's harbor, so every client sees the same quays.
  const quays = new Map();
  let gangwayGpu = null;
  const now = () => deps.now?.() ?? performance.now() / 1000;

  function takeDownBerth(b) {
    try { deps.collider()?.removeBucket?.(b.bucket); } catch { }
    if (b.gpu) { try { deps.renderer?.destroyMesh?.(b.gpu); } catch { } }
    b.gpu = null; b.dead = true;
  }
  function takeDown(q) {
    for (const b of q.berths) takeDownBerth(b);
    quays.delete(q.key);
  }
  function destroyAll() {
    for (const q of [...quays.values()]) takeDown(q);
    if (gangwayGpu && !gangwayGpu.pending) { try { deps.renderer?.destroyMesh?.(gangwayGpu); } catch { } }
    gangwayGpu = null;
  }

  function standCollider(b) {
    const col = deps.collider();
    if (!col?.addMesh || !b.model) return;
    col.removeBucket?.(b.bucket);
    const c = b.model.collider ?? b.model;
    // A still bucket baked in place: a bucket with a translation is never filed in the broadphase.
    col.addMesh(b.bucket, c.positions, c.indices, trs(b.berth.pos[0], deps.seaY(), b.berth.pos[1], 0, b.plan.frame.theta * DEG, 0));
    b.stood = true;
  }
  // The floating origin moved, so each collider is rebuilt where its berth lies now.
  function offsetAll() { for (const q of quays.values()) for (const b of q.berths) if (b.stood && !b.dead) standCollider(b); }

  async function lay(q, b) {
    // Each berth is planned against every earlier berth's piers, so every client plans the same jetties.
    const others = q.berths.slice(0, b.index).map((o) => ({ plan: o.plan, origin: o.berth.pos }));
    b.plan = planQuay({ berth: b.berth, hull: q.harbour.hull, key: q.key, index: b.index, seaY: deps.seaY(), groundAt: deps.groundAt, others });
    if (!b.plan) { b.retryAt = now() + QUAY_RETRY_S; return; }
    b.model = buildQuayModel(b.plan);
    b.laying = true;
    try { await deps.prepare?.(b.model); } catch { }
    b.laying = false;
    if (b.dead || quays.get(q.key) !== q) return;
    b.gpu = deps.renderer?.createMesh ? deps.renderer.createMesh(b.model) : null;
    standCollider(b);
  }
  function layFailed(b) { b.laying = false; b.plan = null; b.model = null; b.retryAt = now() + QUAY_RETRY_S; }

  function frame() {
    if (deps.mode() !== 'exterior') { if (quays.size) destroyAll(); return; }
    const feet = deps.feet();
    const known = new Map();
    for (const h of deps.harbours() ?? []) if (h?.harbour?.berths?.length) known.set(h.key, h);
    for (const q of [...quays.values()]) {
      const h = known.get(q.key);
      const far = !feet || Math.hypot(q.harbour.mouth[0] - feet[0], q.harbour.mouth[1] - feet[2]) > QUAY_LEAVE_M;
      if (!h || h.harbour !== q.harbour || far) takeDown(q);
    }
    if (!feet) return;
    const t = now();
    for (const h of known.values()) {
      let q = quays.get(h.key);
      if (!q) {
        if (Math.hypot(h.harbour.mouth[0] - feet[0], h.harbour.mouth[1] - feet[2]) > QUAY_STAND_M) continue;
        q = { key: h.key, name: h.name ?? null, harbour: h.harbour, berths: h.harbour.berths.map((berth, index) => ({ index, berth, plan: null, model: null, gpu: null, bucket: `${QUAY_BUCKET}${h.key}:${index}`, retryAt: 0, laying: false, dead: false })) };
        quays.set(h.key, q);
      }
      for (const b of q.berths) {
        if (b.plan) continue;
        // Berths are laid in order, each only once every earlier one has its plan.
        if (b.laying || t < b.retryAt) break;
        lay(q, b).catch(() => layFailed(b));
        if (!b.plan) break;
      }
    }
  }

  function draw(r = deps.renderer) {
    if (!r?.drawMesh) return 0;
    const seaY = deps.seaY();
    let n = 0;
    for (const q of quays.values()) {
      for (const b of q.berths) {
        if (!b.gpu) continue;
        r.drawMesh(b.gpu, trs(b.berth.pos[0], seaY, b.berth.pos[1], 0, b.plan.frame.theta * DEG, 0), null);
        n++;
      }
    }
    const ways = deps.gangways?.() ?? [];
    if (ways.length && !gangwayGpu && r.createMesh) {
      const model = buildGangwayModel();
      const pending = gangwayGpu = { pending: true };
      Promise.resolve(deps.prepare?.(model)).catch(() => {}).then(() => {
        if (gangwayGpu !== pending) return;
        try { gangwayGpu = r.createMesh(model); } catch { gangwayGpu = null; }
      });
    }
    if (gangwayGpu && !gangwayGpu.pending) for (const w of ways) { r.drawMesh(gangwayGpu, gangwayMatrix(w.foot, w.head), null); n++; }
    return n;
  }

  function lights() {
    const feet = deps.feet();
    if (!feet || !quays.size) return [];
    const seaY = deps.seaY(), out = [];
    for (const q of quays.values()) for (const b of q.berths) {
      if (!b.gpu) continue;
      const pos = b.berth.pos;
      if (!b.lit || b.litY !== seaY || b.litAt[0] !== pos[0] || b.litAt[1] !== pos[1]) {
        b.lit = lanternLights(b.plan, seaY, pos).map((p) => ({ x: p[0], y: p[1], z: p[2], range: QUAY_LIGHT_RANGE }));
        b.litY = seaY; b.litAt = [pos[0], pos[1]];
      }
      for (const l of b.lit) {
        const dx = l.x - feet[0], dy = l.y - feet[1], dz = l.z - feet[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= QUAY_LIGHT_REACH) out.push({ d, l });
      }
    }
    return out.sort((a, b) => a.d - b.d).slice(0, QUAY_LIGHTS_MAX).map((o) => o.l);
  }

  function standing() {
    const out = [];
    for (const q of quays.values()) for (const b of q.berths) if (b.gpu || b.plan) out.push({ key: q.key, index: b.index, berth: b.berth, hull: q.harbour.hull, name: q.name, plan: b.plan });
    return out;
  }

  function piers() {
    const out = [];
    for (const q of quays.values()) for (const b of q.berths) if (b.stood && !b.dead) out.push(...pierOutline(b.plan, b.berth.pos));
    return out;
  }
  const laid = (key, index) => !!quays.get(key)?.berths[index]?.stood;
  function overworldMarks() {
    const out = [];
    if (!quays.size) return out;
    const seaY = deps.seaY();
    for (const q of quays.values()) {
      const b = q.berths.find((x) => x.gpu);
      if (!b) continue;
      out.push({ key: `docks:${q.key}`, at: [b.berth.pos[0], seaY + QUAY_DECK_UP + DOCKS_MARK_LIFT, b.berth.pos[1]], label: portPlaceName('docks', { townName: q.name }), kind: 'yard docks' });
    }
    return out;
  }
  return { frame, draw, lights, destroyAll, offsetAll, standing, laid, overworldMarks, piers, pierAlong: (p, dx, dz, far) => pierAlong(p, dx, dz, far, piers()), deckUp: QUAY_DECK_UP };
}

/**
 * @param {number[]} foot
 * @param {number[]} head
 */
export function gangwayMatrix(foot, head) {
  const dx = head[0] - foot[0], dy = head[1] - foot[1], dz = head[2] - foot[2];
  const flat = Math.hypot(dx, dz), len = Math.hypot(flat, dy) || 1;
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, flat);
  return trs(foot[0], foot[1], foot[2], pitch * DEG, yaw * DEG, 0, 1, 1, len);
}
