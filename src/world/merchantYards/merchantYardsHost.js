// @ts-check
import { YARD_KINDS, YARD_TEXT, YARD_ROWS, YARD_BENCH_ROW, CARPENTER_STEAL_TEXT, yardName, validYardKind, yardRowsFor } from './merchantYards.js';
import { WAGON_KINDS } from '../../travel/wagonKinds.js';
import { YARD_FOOT } from './merchantYardSites.js';
import { buildYardModel, signBoxOf, yardPoints } from './merchantYardModels.js';
import { yardArt, YARD_ARCHIVE } from './merchantYardArt.js';
import { dfLook, lookSeed } from '../dfLook.js';
import { wearPainted } from '../../systems/studioArt/studioArt.js';
import { PERSON_TEXTURES, PERSON_IDLE_RECORD, PERSON_IDLE_FPS } from '../../characters/mobilePerson.js';
import { mobileBillboardSize } from '../rmbFlats.js';
import { folkLookOf } from '../../characters/folkBodies.js';
import { personActor } from '../../characters/peopleBodies.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { textSeed } from '../../systems/livingWorld/seed.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE, presentNpcInfoText } from '../../player/activate.js';
import { trs } from '../mat4.js';
import { quatAngleAxis } from '../quat.js';
import { calculateHorseOrientation, horseViewFor, HORSE_BOX_CENTER, HORSE_BOX_SIZE } from '../../travel/horseCartLaw.js';
import { HORSE_ARCHIVE, horseStillRecord, HORSE_BILLBOARD_WIDTH, HORSE_BILLBOARD_HEIGHT, boxTriangles } from '../../travel/horseCartPool.js';
import { localAabb, transformedAabb } from '../../render/frustum.js';
import { DECOR_DRAW, DECOR_SHADOW, DECOR_SKIP, castOnly } from '../../homes/decorRoom.js';

export const YARD_GROUND_EVERY = 30;
export const YARD_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
export const KEEPER_HALF = 0.3;
export const KEEPER_HEIGHT = 1.85;
export const YARD_BENCH_RISE = 2;
export const YARD_MARK_LIFT = 4;
export const WAGON_SHOW_LINE = Object.freeze({
  cart: 'Carries 750 kg',
  openWagon: 'Carries 1,500 kg and seats four in the back',
  caravan: 'Carries 2,000 kg, with a room to live in',
});
const NONE = Object.freeze([]);

export function yardToScene(at, yaw, x, y, z, out = [0, 0, 0]) {
  const a = (yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  out[0] = at[0] + x * c + z * s; out[1] = at[1] + y; out[2] = at[2] - x * s + z * c;
  return out;
}
export function yardBoxToScene(at, yaw, b) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], p = [0, 0, 0];
  for (const x of [b[0], b[3]]) for (const z of [b[2], b[5]]) for (const y of [b[1], b[4]]) {
    yardToScene(at, yaw, x, y, z, p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  }
  return { min, max };
}
export function feetInYard(site, at, f) {
  if (!site || !at || !f) return false;
  const a = (-(site.yaw ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = f[0] - at[0], dz = f[2] - at[2];
  const x = dx * c + dz * s, z = -dx * s + dz * c;
  const F = YARD_FOOT[site.kind];
  return !!F && Math.abs(x) <= F.hx && Math.abs(z) <= F.hz && f[1] < at[1] + 4 && f[1] + 1.8 > at[1] - 0.5;
}

function turnedBox(cx, cz, forward, size, center) {
  const len = Math.hypot(forward[0], forward[1]) || 1, fx = forward[0] / len, fz = forward[1] / len;
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const P = (u, v, w) => [cx + u * fz + w * fx, center[1] + v, cz - u * fx + w * fz];
  const { positions: bp, indices } = boxTriangles([-hx, -hy, -hz], [hx, hy, hz]);
  const positions = new Float32Array(bp.length);
  for (let i = 0; i < bp.length; i += 3) { const q = P(bp[i], bp[i + 1], bp[i + 2]); positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2]; }
  return { positions, indices };
}

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, sites: () => Array<{key: string, kind: string, x: number, z: number, yaw: number, comp?: number, mapId?: number, regionIndex?: number, keeper: {name: string, sex: string, variant: number}, race: string}>, groundAt: (x: number, z: number) => number, collider?: () => any, eye?: () => (number[]|null), feet?: () => (number[]|null), horseArt?: (() => boolean)|null, showWagon?: ((r: any, texRemap: any, position: number[], rotation: number[], kind: string) => boolean)|null, wagonBox?: ((kind: string) => (number[]|null))|null, open?: (site: any, mode: 'Buy'|'Sell', name?: string) => boolean, say?: (text: string) => void, midText?: (text: string) => void, now?: () => number, mend?: (site: any) => boolean, bench?: (site: any) => boolean, }} deps */
export function createMerchantYards({
  renderer = null, getTexture = null, uploadRecordFrame = null, sites, groundAt, collider = () => null,
  eye = () => null, feet = () => null, horseArt = null, showWagon = null, wagonBox = null,
  open = () => false, say = () => {}, midText = () => {}, now = () => performance.now(),
  mend = () => false,
  bench = () => false,
}) {
  /** @type {Map<string, any>} */
  const yards = new Map();
  /** @type {Map<string, any>} */
  const meshes = new Map();
  /** @type {Map<string, any>} */
  const models = new Map();
  let artUp = false;
  const keeperTex = new Map();
  let frameN = 0;
  const _batches = [], _targets = [];

  const modelOf = (kind) => { let m = models.get(kind); if (!m) { m = buildYardModel(kind); models.set(kind, m); } return m; };
  const timberBox = new Map();
  function yardBox(y) {
    let b = timberBox.get(y.site.kind);
    if (!b) { b = localAabb(modelOf(y.site.kind).positions); timberBox.set(y.site.kind, b); }
    const l = [...b];
    for (const w of y.wagons) if (w.box) for (let i = 0; i < 3; i++) { l[i] = Math.min(l[i], w.box[i]); l[i + 3] = Math.max(l[i + 3], w.box[i + 3]); }
    return transformedAabb(l, y.matrix);
  }
  function meshOf(kind) {
    if (meshes.has(kind)) return meshes.get(kind);
    if (!renderer?.createMesh) return null;
    try {
      if (!artUp) { for (const [rec, art] of yardArt()) wearPainted(YARD_ARCHIVE, rec, () => dfLook(art, lookSeed(YARD_ARCHIVE, rec)), (pic, { late }) => { if (late) renderer.releaseTexture?.(YARD_ARCHIVE, rec); renderer.uploadTexture?.(YARD_ARCHIVE, rec, pic); }, { topDown: true }); artUp = true; }
      meshes.set(kind, renderer.createMesh(modelOf(kind)));
    } catch (e) { meshes.set(kind, null); console.warn('[yards] a yard would not build', e?.message ?? e); }
    return meshes.get(kind);
  }
  function texOf(archive) {
    const had = keeperTex.get(archive);
    if (had && !(had instanceof Promise)) return had.failed ? null : had.tex;
    if (!had && getTexture) {
      keeperTex.set(archive, Promise.resolve().then(() => getTexture(archive)).then(
        (tex) => { keeperTex.set(archive, tex ? { tex } : { failed: true }); },
        (e) => { keeperTex.set(archive, { failed: true }); console.warn('[yards] a keeper\'s picture', e?.message ?? e); }));
    }
    return null;
  }
  const keeperArchive = (site) => {
    const T = PERSON_TEXTURES[site.race] ?? PERSON_TEXTURES.Breton;
    const set = T[site.keeper?.sex === 'female' ? 'female' : 'male'];
    return set[(site.keeper?.variant ?? 0) % set.length];
  };

  function colliderGeometry(y) {
    const parts = [modelOf(y.site.kind)];
    const P = yardPoints(y.site.kind);
    const k = P.keeper;
    parts.push(boxTriangles([k[0] - KEEPER_HALF, 0, k[1] - KEEPER_HALF], [k[0] + KEEPER_HALF, KEEPER_HEIGHT, k[1] + KEEPER_HALF]));
    for (const h of P.horses) parts.push(turnedBox(h[0], h[1], [h[2], h[3]], HORSE_BOX_SIZE, HORSE_BOX_CENTER));
    for (const w of y.wagons) if (w.box) parts.push(boxTriangles([w.box[0], w.box[1], w.box[2]], [w.box[3], w.box[4], w.box[5]]));
    const count = parts.reduce((n, p) => n + p.positions.length, 0), icount = parts.reduce((n, p) => n + p.indices.length, 0);
    const positions = new Float32Array(count), indices = new Uint32Array(icount);
    const sight = parts.some((p) => p.sight) ? new Uint8Array(icount / 3) : null;
    let v = 0, i = 0;
    for (const p of parts) {
      positions.set(p.positions, v);
      for (let j = 0; j < p.indices.length; j++) indices[i + j] = p.indices[j] + v / 3;
      if (sight && p.sight) sight.set(p.sight, i / 3);
      v += p.positions.length; i += p.indices.length;
    }
    return { positions, indices, sight };
  }
  function tendWagons(y) {
    let came = false;
    for (const w of y.wagons) {
      if (w.box) continue;
      const b = wagonBox?.(w.kind) ?? null;
      if (!b) continue;
      const ox = w.x - (b[0] + b[3]) / 2, oz = w.z - (b[2] + b[5]) / 2, oy = -b[1];
      w.origin = [ox, oy, oz];
      w.box = [b[0] + ox, b[1] + oy, b[2] + oz, b[3] + ox, b[4] + oy, b[5] + oz];
      came = true;
    }
    return came;
  }
  function standCollider(y) {
    const col = collider();
    if (!col?.addMesh) return;
    const same = y.colAt && y.colAt[0] === y.at[0] && y.colAt[1] === y.at[1] && y.colAt[2] === y.at[2] && y.colWagons === y.wagonsIn;
    if (same) return;
    const moved = y.colAt !== null;
    if (y.colAt) { col.removeBucket?.(y.bucket); y.colAt = null; }
    // The collider waits while the feet are on the yard ground, but only on first placement, so a fence never rises
    // around a body.
    if (!moved && feetInYard(y.site, y.at, feet())) return;
    const g = colliderGeometry(y);
    col.addMesh(y.bucket, g.positions, g.indices, y.matrix, null, null, false, g.sight);
    y.colAt = [y.at[0], y.at[1], y.at[2]];
    y.colWagons = y.wagonsIn;
  }
  function takeDown(key) {
    const y = yards.get(key);
    if (!y) return;
    if (y.colAt) collider()?.removeBucket?.(y.bucket);
    if (y.keeperBatch) renderer?.destroyBillboardBatch?.(y.keeperBatch);
    for (const h of y.horses) if (h.batch) renderer?.destroyBillboardBatch?.(h.batch);
    yards.delete(key);
  }
  function stand(site) {
    const P = yardPoints(site.kind);
    const y = {
      site, key: site.key, bucket: `yard:${site.key}`, at: null, matrix: null, colAt: null, colWagons: 0, wagonsIn: 0,
      groundY: NaN, groundAt: [NaN, NaN, -Infinity, NaN], targets: null, box: null,
      name: yardName(site.kind, site.keeper?.name), keeperBatch: null,
      horses: P.horses.map((h) => ({ x: h[0], z: h[1], forward: [h[2], h[3]], batch: null, pos: [0, 0, 0], fwd: [0, 0, 0] })),
      wagons: P.wagons.map(([kind, x, z]) => ({ kind, x, z, box: null, origin: null })),
    };
    yards.set(site.key, y);
    return y;
  }
  function poseKeeper(y, t) {
    const archive = keeperArchive(y.site), tex = texOf(archive);
    if (!tex || !renderer?.createBillboardBatch) return;
    const frames = Math.max(1, tex.getFrameCount?.(PERSON_IDLE_RECORD) ?? 1);
    const frame = Math.floor((t / 1000) * PERSON_IDLE_FPS) % frames;
    const rkey = `${PERSON_IDLE_RECORD}#${frame}`;
    if (!renderer.textures?.has?.(`${archive}_${rkey}`)) uploadRecordFrame?.(archive, PERSON_IDLE_RECORD, frame);
    const sz = mobileBillboardSize(tex, PERSON_IDLE_RECORD);
    if (!y.keeperBatch) { y.keeperBatch = renderer.createBillboardBatch(archive, rkey, { w: sz.w, h: sz.h }, [[0, 0, 0]]); y.keeperBatch.origin = [0, 0, 0]; }
    const b = y.keeperBatch;
    b.record = rkey; b.size = { w: sz.w, h: sz.h };
    const k = yardPoints(y.site.kind).keeper;
    yardToScene(y.at, y.site.yaw, k[0], 0, k[1], b.origin);
  }
  function poseHorses(y, cam) {
    if (!y.horses.length) return;
    const a = (y.site.yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    for (const h of y.horses) {
      yardToScene(y.at, y.site.yaw, h.x, 0, h.z, h.pos);
      h.fwd[0] = h.forward[0] * c + h.forward[1] * s; h.fwd[1] = 0; h.fwd[2] = -h.forward[0] * s + h.forward[1] * c;
    }
    if (!renderer?.createBillboardBatch || !horseArt?.()) return;
    for (const h of y.horses) {
      const view = horseViewFor(calculateHorseOrientation(cam ?? h.pos, h.pos, h.fwd));
      if (!view) continue;
      if (!h.batch) { h.batch = renderer.createBillboardBatch(HORSE_ARCHIVE, horseStillRecord(0), { w: HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT }, [[0, 0, 0]]); h.batch.origin = [0, 0, 0]; }
      h.batch.record = horseStillRecord(view.view);
      h.batch.size = { w: view.flip ? -HORSE_BILLBOARD_WIDTH : HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT };
      h.batch.origin[0] = h.pos[0]; h.batch.origin[1] = h.pos[1]; h.batch.origin[2] = h.pos[2];
    }
  }

  function targetsOf(y) {
    y.targets ??= (() => {
      const out = [], P = yardPoints(y.site.kind), k = P.keeper;
      const add = (what, b) => out.push({ key: `yard:${y.key}|${what}`, aabb: yardBoxToScene(y.at, y.site.yaw, b), distance: RAY_DISTANCE, reach: YARD_REACH });
      add('keeper', [k[0] - KEEPER_HALF, 0, k[1] - KEEPER_HALF, k[0] + KEEPER_HALF, KEEPER_HEIGHT, k[1] + KEEPER_HALF]);
      add('sign', signBoxOf(y.site.kind));
      if (P.bench) add('bench', P.bench);
      P.horses.forEach((h, i) => { const r = Math.max(HORSE_BOX_SIZE[0], HORSE_BOX_SIZE[2]) / 2; add(`horse.${i}`, [h[0] - r, 0, h[1] - r, h[0] + r, HORSE_BOX_SIZE[1], h[1] + r]); });
      y.wagons.forEach((w, i) => { if (w.box) add(`wagon.${i}`, w.box); });
      return out;
    })();
    return y.targets;
  }
  function partOf(key) {
    if (typeof key !== 'string' || !key.startsWith('yard:')) return null;
    const rest = key.slice(5), cut = rest.lastIndexOf('|');
    if (cut < 0) return null;
    const y = yards.get(rest.slice(0, cut));
    if (!y?.at) return null;
    const [what, n] = rest.slice(cut + 1).split('.');
    return { y, what, i: Number(n) || 0 };
  }

  return {
    frame() {
      frameN++;
      const list = sites?.() ?? NONE, live = new Set(), t = now(), cam = eye();
      for (const site of list) {
        if (!validYardKind(site?.kind) || !site.key) continue;
        live.add(site.key);
        const y = yards.get(site.key) ?? stand(site);
        y.site = site;
        const comp = site.comp ?? 0, G = y.groundAt;
        if (site.x !== G[0] || site.z !== G[1] || comp !== G[3] || !Number.isFinite(y.groundY) || frameN - G[2] >= YARD_GROUND_EVERY) {
          y.groundY = groundAt(site.x, site.z); G[0] = site.x; G[1] = site.z; G[2] = frameN; G[3] = comp;
        }
        if (!Number.isFinite(y.groundY)) { if (y.colAt) { collider()?.removeBucket?.(y.bucket); y.colAt = null; } y.at = null; continue; }
        if (!y.at || y.at[0] !== site.x || y.at[1] !== y.groundY || y.at[2] !== site.z) {
          y.at = [site.x, y.groundY, site.z];
          y.matrix = trs(y.at[0], y.at[1], y.at[2], 0, site.yaw, 0);
          y.targets = null; y.box = null;
        }
        if (tendWagons(y)) { y.wagonsIn = y.wagons.filter((w) => w.box).length; y.targets = null; y.box = null; }
        meshOf(site.kind);
        standCollider(y);
        poseKeeper(y, t);
        poseHorses(y, cam);
      }
      for (const key of [...yards.keys()]) if (!live.has(key)) takeDown(key);
      return yards.size;
    },
    draw(r = renderer, cull = null) {
      if (!r?.drawMesh) return 0;
      let n = 0;
      for (const y of yards.values()) {
        if (!y.at || !y.matrix) continue;
        const v = cull ? cull(y.box ??= yardBox(y)) : DECOR_DRAW;
        if (v === DECOR_SKIP) continue;
        const to = v === DECOR_SHADOW ? castOnly(r) : r;
        const mesh = meshes.get(y.site.kind);
        if (mesh) { to.drawMesh(mesh, y.matrix, null); if (v === DECOR_DRAW) n++; }
        for (const w of y.wagons) {
          if (!w.origin || !showWagon) continue;
          const pos = yardToScene(y.at, y.site.yaw, w.origin[0], w.origin[1], w.origin[2]);
          if (showWagon(to, null, pos, quatAngleAxis(y.site.yaw, [0, 1, 0]), w.kind) && v === DECOR_DRAW) n++;
        }
      }
      return n;
    },
    /**
     * @param {(actor: any, batch: any) => void} offer
     * @param {number[]} eyeAt
     * @param {number} dt
     */
    offerBodies(offer, eyeAt, dt) {
      for (const y of yards.values()) {
        const b = y.keeperBatch;
        if (!y.at || !b) continue;
        const archive = keeperArchive(y.site), race = y.site.race ?? 'Breton', key = `${archive}|${race}`;
        if (y._mwLookKey !== key) {
          y._mwLookKey = key;
          y._mwLook = folkLookOf({ archive, personFaceRecordId: 0, gender: y.site.keeper?.sex === 'female' ? GENDERS.Female : GENDERS.Male, guard: false }, race, textSeed(String(y.key)));
        }
        offer(personActor(y, y._mwLook, b.origin, eyeAt, dt), b);
      }
    },
    /** @param {{ offer: Function }} horses */
    offerHorses(horses) {
      for (const y of yards.values()) {
        if (!y.at) continue;
        y.horses.forEach((h, i) => horses.offer(h, h.pos, Math.atan2(h.fwd[0], h.fwd[2]), 0, h.batch, 1 + i));
      }
    },
    batches() {
      _batches.length = 0;
      for (const y of yards.values()) {
        if (!y.at) continue;
        if (y.keeperBatch) _batches.push(y.keeperBatch);
        for (const h of y.horses) if (h.batch) _batches.push(h.batch);
      }
      return _batches;
    },
    targets() {
      _targets.length = 0;
      for (const y of yards.values()) {
        if (!y.at) continue;
        for (const tg of targetsOf(y)) _targets.push(tg);
      }
      return _targets;
    },
    hoverName(key) {
      const p = partOf(key);
      if (!p) return null;
      const K = YARD_KINDS[p.y.site.kind];
      if (p.what === 'bench') return { title: 'Workbench', subs: [p.y.name, K.trade], actions: [YARD_BENCH_ROW] };
      if (p.what === 'horse') return { title: 'Horse', subs: [p.y.name, YARD_TEXT.ask(K.keeper)], actions: [YARD_ROWS[0]] };
      if (p.what === 'wagon') {
        const w = p.y.wagons[p.i];
        if (!w) return null;
        return { title: WAGON_KINDS[w.kind]?.name ?? 'Wagon', subs: [WAGON_SHOW_LINE[w.kind] ?? '', YARD_TEXT.ask(K.keeper)], actions: [YARD_ROWS[0]] };
      }
      return { title: p.y.name, subs: [`${K.keeper}: ${p.y.site.keeper?.name ?? ''}`, K.trade], actions: yardRowsFor(p.y.site.kind).map((r) => ({ id: r.id, label: r.label })) };
    },
    activate(key, mode = 'grab', verb = null) {
      const p = partOf(key);
      if (!p) return false;
      const K = YARD_KINDS[p.y.site.kind];
      if (verb == null && mode === 'info') {
        say(p.what === 'keeper' ? presentNpcInfoText(`${p.y.site.keeper?.name ?? ''}, the ${K.keeper.toLowerCase()}`) : presentNpcInfoText(p.y.name));
        return true;
      }
      if (verb == null && mode === 'steal') { midText(p.y.site.kind === 'carpenter' ? CARPENTER_STEAL_TEXT : YARD_TEXT.steal); return true; }
      if (p.y.site.kind === 'carpenter') return bench(p.y.site) !== false;
      if (verb === 'mend' && p.y.site.kind === 'transport' && (p.what === 'keeper' || p.what === 'sign')) return mend(p.y.site) !== false;
      const trade = verb === 'sell' && (p.what === 'keeper' || p.what === 'sign') ? 'Sell' : 'Buy';
      if (!open(p.y.site, trade, p.y.name)) midText(YARD_TEXT.shut);
      return true;
    },
    overworldMarks() {
      const out = [];
      for (const y of yards.values()) {
        if (!y.at) continue;
        out.push({ key: `yard:${y.key}`, at: [y.at[0], y.at[1] + YARD_MARK_LIFT, y.at[2]], label: y.name, kind: `yard ${y.site.kind}` });
      }
      return out;
    },
    /**
     * Measures to the nearest point of every press box of the joinery, not the bench middle, because a press on the
     * carpenter or the board also opens the workbench page.
     * @param {number[]|null} f
     */
    workbenchNear(f) {
      if (!f) return null;
      for (const y of yards.values()) {
        if (!y.at || !yardPoints(y.site.kind).bench || Math.abs(f[1] - y.at[1]) > YARD_BENCH_RISE) continue;
        for (const { aabb: b } of targetsOf(y)) {
          const dx = Math.max(b.min[0] - f[0], 0, f[0] - b.max[0]), dz = Math.max(b.min[2] - f[2], 0, f[2] - b.max[2]);
          if (dx * dx + dz * dz <= YARD_REACH * YARD_REACH) return y.site;
        }
      }
      return null;
    },
    state: () => [...yards.values()].map((y) => ({ key: y.key, kind: y.site.kind, at: y.at, collider: y.colAt !== null, name: y.name, wagons: y.wagonsIn, horses: y.horses.filter((h) => h.batch).length, keeper: !!y.keeperBatch })),
    destroyAll() { for (const key of [...yards.keys()]) takeDown(key); },
    dispose() {
      for (const key of [...yards.keys()]) takeDown(key);
      for (const m of meshes.values()) if (m) renderer?.destroyMesh?.(m);
      meshes.clear(); artUp = false;
    },
  };
}
