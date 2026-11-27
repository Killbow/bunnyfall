// @ts-check
import { PORT_PLACES } from './portPlaces.js';
import { SHIPYARD_TEXT } from '../systems/naval/shipyards.js';
import { PORT_FOOT } from '../world/portSites.js';
import { buildShipyardModel, SHIPYARD, shipsSignBox, hullBox, noticesBox, crewSignBox } from '../world/shipyardModel.js';
import { buildLighthouseModel, buildLighthouseFire, guardBand, LIGHTHOUSE, LIGHTHOUSE_POINTS, doorBox, hatchBox, lanternBox, GALLERY_Y, LANTERN_H } from '../world/lighthouseModel.js';
import { PORT_PAINTERS, PORT_ARCHIVE, PORT_HOW } from '../world/portArt.js';
import { dfLook, lookSeed } from '../world/dfLook.js';
import { wearPainted } from '../systems/studioArt/studioArt.js';
import { PERSON_TEXTURES, PERSON_IDLE_RECORD, PERSON_IDLE_FPS } from '../characters/mobilePerson.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { folkLookOf } from '../characters/folkBodies.js';
import { personActor } from '../characters/peopleBodies.js';
import { GENDERS } from '../characters/nameHelper.js';
import { textSeed } from '../systems/livingWorld/seed.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE, presentNpcInfoText } from '../player/activate.js';
import { trs } from '../world/mat4.js';
import { yardToScene, yardBoxToScene, KEEPER_HALF, KEEPER_HEIGHT } from '../world/merchantYards/merchantYardsHost.js';
import { boxTriangles } from './horseCartPool.js';
import { localAabb, transformedAabb } from '../render/frustum.js';
import { DECOR_DRAW, DECOR_SHADOW, DECOR_SKIP, castOnly } from '../homes/decorRoom.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const PORT_GROUND_EVERY = 30;
export const PORT_REACH = STATIC_NPC_ACTIVATION_DISTANCE;
export const PORT_MARK_LIFT = Object.freeze({ shipyard: 8.5, lighthouse: 24.5 });
export const HOLD_BACK_UP = Object.freeze({ shipyard: 4.5, lighthouse: GALLERY_Y - 0.5 });
export const GUARD_HEADROOM = 1.95;
export const LAMP_RANGE = 28;
export const OFFICE_LAMP_RANGE = 9;
// The lighthouse height reaches up the hollow tower to just under the gallery, so a body rising inside is not
// sealed in, but never covers the gallery floor.
export const BEAM_PERIOD_S = 14;
export const BEAM_LEN_M = 150;
export const BEAM_PUFFS = 18;
export const BEAM_SIZE0 = 1.6;
export const BEAM_SIZE1 = 28;
export const BEAM_ALPHA = 0.42;
export const BEAM_DIP = 0.035;
export const BEAM_SEEN_M = 2600;
export const GLOW_NEAR_M = 4;
export const GLOW_ANGLE = 0.012;
export const BEAM_NEAR_FADE = 1.5;
export const ART_BUDGET_MS = 4;
const CUTOUT = Object.freeze({ cutout: true }), OWN_LIGHT = Object.freeze({ white: true }), NO_SHADOW = Object.freeze({ noShadow: true });
export const LIGHTHOUSE_LAMP_COLOR = Object.freeze([1, 0.85, 0.55]);

export const SHIPYARD_ROWS = Object.freeze([
  Object.freeze({ id: 'ships', label: 'Ships for sale' }),
  Object.freeze({ id: 'fleet', label: 'Your fleet' }),
  Object.freeze({ id: 'yard', label: 'Shipwright' }),
  Object.freeze({ id: 'refits', label: 'Refits' }),
]);
export const CREW_ROWS = Object.freeze([Object.freeze({ id: 'crew', label: 'Sign on hands' })]);
export const CLIMB_ROWS = Object.freeze([Object.freeze({ id: 'climb', label: 'Climb the tower' })]);
export const DOWN_ROWS = Object.freeze([Object.freeze({ id: 'down', label: 'Climb down' })]);
export const PORT_TEXT = Object.freeze({
  steal: SHIPYARD_TEXT.steal,
  lightSteal: 'The lightkeeper keeps the beacon\'s oil under lock.',
  shut: 'The shipmaster\'s window will not open here.',
  noSail: SHIPYARD_TEXT.noSail,
  sailor: 'Looking for a berth. Ask the crewmaster to sign hands on.',
  worker: 'At work on the hull on the stocks.',
  lampLit: 'The beacon burns from dusk to dawn. It is lit.',
  lampDark: 'The beacon burns from dusk to dawn.',
  hatch: 'Down the tower\'s stair.',
  stair: 'The stair up to the beacon.',
  shutStair: 'The lightkeeper keeps the stair shut just now.',
  riding: 'No horse climbs a lighthouse stair. Go up on foot.',
  foes: 'The lightkeeper bars the door while enemies are about.',
});

const NONE = Object.freeze([]);
/**
 * @param {string} way
 * @param {{ walking: boolean, onFoot: boolean, sailing: boolean, foes: boolean }} now
 */
export function stairRefusal(way, { walking, onFoot, sailing, foes }) {
  if (!walking) return PORT_TEXT.shutStair;
  if (way !== 'up') return null;
  if (!onFoot) return PORT_TEXT.riding;
  if (sailing) return PORT_TEXT.shutStair;
  return foes ? PORT_TEXT.foes : null;
}
export const stairFeetY = (way, feetY, ground) => (way === 'down' && Number.isFinite(ground) ? Math.max(feetY, ground + 0.02) : feetY);
export function folkOf(key, role, i) {
  const h = textSeed(`${key}|${role}|${i}`);
  const femaleShare = role === 'recruit' ? 0.35 : 0.15;
  return { sex: ((h >>> 4) & 0xff) / 256 < femaleShare ? 'female' : 'male', variant: (h >>> 13) & 3 };
}
export function peopleOf(site) {
  if (site?.kind === 'lighthouse') {
    const k = LIGHTHOUSE_POINTS.keeper;
    return [{ role: 'keeper', i: 0, at: [k[0], 0, k[2]], sex: site.keeper?.sex ?? 'male', variant: site.keeper?.variant ?? 0 }];
  }
  const P = SHIPYARD.points;
  return [
    { role: 'keeper', i: 0, at: [P.keeper[0], 0, P.keeper[1]], sex: site?.keeper?.sex ?? 'male', variant: site?.keeper?.variant ?? 0 },
    { role: 'crewmaster', i: 0, at: [P.crewmaster[0], 0, P.crewmaster[1]], sex: site?.crewmaster?.sex ?? 'male', variant: site?.crewmaster?.variant ?? 0 },
    ...P.recruits.map((p, i) => ({ role: 'recruit', i, at: [p[0], 0, p[1]], ...folkOf(site?.key ?? '', 'recruit', i) })),
    ...P.workers.map((p, i) => ({ role: 'worker', i, at: [p[0], p[2] ?? 0, p[1]], ...folkOf(site?.key ?? '', 'worker', i) })),
  ];
}
const T_ = LIGHTHOUSE.tower, G_ = LIGHTHOUSE.gallery, L_ = LIGHTHOUSE.lantern;
const LANTERN_TOP = GALLERY_Y + LANTERN_H;
function feetInFrame(site, at, f, out) {
  const a = (-(site.yaw ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = f[0] - at[0], dz = f[2] - at[2];
  out[0] = dx * c + dz * s; out[1] = f[1] - at[1]; out[2] = -dx * s + dz * c;
  return out;
}
const _ff = [0, 0, 0];
const axisR = (q) => { const x = q[0] - T_.x, z = q[2] - T_.z; return Math.sqrt(x * x + z * z); };
export function feetInPort(site, at, f) {
  if (!site || !at || !f) return false;
  const q = feetInFrame(site, at, f, _ff), F = PORT_FOOT[site.kind];
  if (!F || Math.abs(q[0]) > F.hx || Math.abs(q[2]) > F.hz || q[1] + 1.8 <= -0.5) return false;
  if (q[1] < (HOLD_BACK_UP[site.kind] ?? 2.5)) return true;
  return site.kind === 'lighthouse' && axisR(q) < L_.r && q[1] < LANTERN_TOP;
}
// The guard appears only when the feet are on the gallery with room for a 1.8 m body under its lid. A guard that is
// always present is a floor to a body landing from above.
export function guardFor(site, at, f, on) {
  if (!site || !at || !f) return false;
  const q = feetInFrame(site, at, f, _ff), r = axisR(q), y = q[1];
  return on ? y > GALLERY_Y - 0.5 && y < GALLERY_Y + G_.guardH && r < G_.parapetR + 0.5
    : y > GALLERY_Y - 0.1 && y < GALLERY_Y + G_.guardH - GUARD_HEADROOM && r > L_.r && r < G_.parapetR - 0.08;
}
function puffInto(rec, lamp, dx, dz, k) {
  const t = k / BEAM_PUFFS, d = BEAM_LEN_M * t * t;
  rec.pos[0] = lamp[0] + dx * d; rec.pos[1] = lamp[1] - BEAM_DIP * d; rec.pos[2] = lamp[2] + dz * d;
  rec.size = BEAM_SIZE0 + (BEAM_SIZE1 - BEAM_SIZE0) * t;
  return BEAM_ALPHA * (1 - t) ** 1.3;
}
// Avoids `Math.hypot`, which allocates per call in V8, because this runs for every puff each frame.
export const nearFade = (e, size) => Math.min(1, Math.max(0, (e / size - 0.5) / (BEAM_NEAR_FADE - 0.5)));
export function beamPuffs(lamp, theta) {
  const out = [], dx = Math.sin(theta), dz = Math.cos(theta);
  for (let k = 1; k <= BEAM_PUFFS; k++) { const r = { pos: [0, 0, 0], size: 0, alpha: 0 }; r.alpha = puffInto(r, lamp, dx, dz, k); out.push(r); }
  return out;
}
const glowRec = () => ({ pos: [0, 0, 0], size: 0, color: [LIGHTHOUSE_LAMP_COLOR[0], LIGHTHOUSE_LAMP_COLOR[1], LIGHTHOUSE_LAMP_COLOR[2], 0], rot: 0, blend: 'add', flat: false, solid: false, kind: 'lamp', aspect: 1 });
const dist3 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); };
const IDLE_KEYS = [];
const idleKey = (frame) => (IDLE_KEYS[frame] ??= `${PERSON_IDLE_RECORD}#${frame}`);

/**
 * `beamClock` defaults to the wall clock so every client shows the same beam sweep.
 * @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, sites: () => Array<any>, groundAt: (x: number, z: number) => number, collider?: () => any, feet?: () => (number[]|null), lit?: () => boolean, beamClock?: () => number, open?: (site: any, page: string) => boolean, climb?: (site: any, way: 'up'|'down', at: { feet: number[], yaw: number }) => (boolean|string), say?: (text: string) => void, midText?: (text: string) => void, now?: () => number, }} deps
 */
export function createPortHost({
  renderer = null, getTexture = null, uploadRecordFrame = null, sites, groundAt, collider = () => null,
  feet = () => null, lit = () => false, open = () => false, climb = () => false,
  say = () => {}, midText = () => {}, now = () => performance.now(), beamClock = () => Date.now() / 1000,
}) {
  /** @type {Map<string, any>} */
  const places = new Map();
  /** @type {Map<string, any>} */
  const meshes = new Map();
  /** @type {Map<string, any>} */
  const models = new Map();
  /** @type {Map<string, number[]>} */
  const boxes = new Map();
  let artAt = 0, artFrame = -1, guardMesh = null;
  const personTex = new Map();
  let frameN = 0;
  // Returned arrays are overwritten in place and truncated to their count, because `length = 0` followed by pushes
  // reallocates their storage each frame.
  const _batches = [], _targets = [], _lights = [], _glows = [];

  const MODELS = { shipyard: buildShipyardModel, lighthouse: buildLighthouseModel, fire: buildLighthouseFire };
  const modelOf = (kind) => { let m = models.get(kind); if (!m) { m = MODELS[kind](); models.set(kind, m); } return m; };
  function paintArt() {
    if (artAt >= PORT_PAINTERS.length) return true;
    if (artFrame === frameN) return false;
    artFrame = frameN;
    const t0 = now();
    do {
      const [rec, paint] = PORT_PAINTERS[artAt++], pic = paint(), how = PORT_HOW[rec];
      wearPainted(PORT_ARCHIVE, rec, () => dfLook(pic, lookSeed(PORT_ARCHIVE, rec)), (art, { replaced, late }) => {
        if (late) { renderer.releaseTexture?.(PORT_ARCHIVE, rec); if (how?.glows) renderer.evictEmissionTexture?.(`${PORT_ARCHIVE}_${rec}`); }
        renderer.uploadTexture?.(PORT_ARCHIVE, rec, art, how?.cutout ? CUTOUT : undefined);
        if (how?.glows) renderer.uploadEmissionTexture?.(PORT_ARCHIVE, rec, replaced ? art : pic, OWN_LIGHT);
      }, { topDown: true });
    } while (artAt < PORT_PAINTERS.length && now() - t0 < ART_BUDGET_MS);
    return artAt >= PORT_PAINTERS.length;
  }
  function meshOf(kind) {
    if (meshes.has(kind)) return meshes.get(kind);
    if (!renderer?.createMesh) return null;
    try {
      if (!paintArt()) return null;
      meshes.set(kind, renderer.createMesh(modelOf(kind)));
      if (kind === 'lighthouse') meshes.set('fire', renderer.createMesh(modelOf('fire')));
    } catch (e) { meshes.set(kind, null); console.warn('[port] a place would not build', e?.message ?? e); }
    return meshes.get(kind);
  }
  function texOf(archive) {
    const had = personTex.get(archive);
    if (had && !(had instanceof Promise)) return had.failed ? null : had.tex;
    if (!had && getTexture) {
      personTex.set(archive, Promise.resolve().then(() => getTexture(archive)).then(
        (tex) => { personTex.set(archive, tex ? { tex } : { failed: true }); },
        (e) => { personTex.set(archive, { failed: true }); console.warn('[port] a person\'s picture', e?.message ?? e); }));
    }
    return null;
  }
  const archiveOf = (site, p) => {
    const T = PERSON_TEXTURES[site.race] ?? PERSON_TEXTURES.Breton;
    const set = T[p.sex === 'female' ? 'female' : 'male'];
    return set[(p.variant ?? 0) % set.length];
  };
  function boxOf(pl) {
    let b = boxes.get(pl.site.kind);
    if (!b) { b = localAabb(modelOf(pl.site.kind).positions); boxes.set(pl.site.kind, b); }
    return transformedAabb(b, pl.matrix);
  }
  function colliderGeometry(pl) {
    const parts = [modelOf(pl.site.kind)];
    for (const p of peopleOf(pl.site)) parts.push(boxTriangles([p.at[0] - KEEPER_HALF, p.at[1], p.at[2] - KEEPER_HALF], [p.at[0] + KEEPER_HALF, p.at[1] + KEEPER_HEIGHT, p.at[2] + KEEPER_HALF]));
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
  function standCollider(pl) {
    const col = collider();
    if (!col?.addMesh) return;
    if (pl.colAt && pl.colAt[0] === pl.at[0] && pl.colAt[1] === pl.at[1] && pl.colAt[2] === pl.at[2]) return;
    const moved = pl.colAt !== null;
    if (pl.colAt) { col.removeBucket?.(pl.bucket); pl.colAt = null; }
    // The collider is held back while the feet are at the place's foot when it first appears, so the model never
    // rises around the player.
    if (!moved && feetInPort(pl.site, pl.at, feet())) return;
    const g = colliderGeometry(pl);
    col.addMesh(pl.bucket, g.positions, g.indices, pl.matrix, null, null, false, g.sight);
    pl.colAt = [pl.at[0], pl.at[1], pl.at[2]];
  }
  function guardFrame(pl, f) {
    const col = collider();
    if (!col?.addMesh) return;
    const on = pl.colAt !== null && (f ? guardFor(pl.site, pl.at, f, pl.guard !== null) : pl.guard !== null);
    if (on && pl.guard !== pl.colAt) {
      if (pl.guard) col.removeBucket?.(pl.guardBucket);
      const g = (guardMesh ??= guardBand());
      col.addMesh(pl.guardBucket, g.positions, g.indices, pl.matrix);
      pl.guard = pl.colAt;
    } else if (!on && pl.guard) { col.removeBucket?.(pl.guardBucket); pl.guard = null; }
  }
  function takeDown(key) {
    const pl = places.get(key);
    if (!pl) return;
    if (pl.guard) collider()?.removeBucket?.(pl.guardBucket);
    if (pl.colAt) collider()?.removeBucket?.(pl.bucket);
    for (const p of pl.people) if (p.batch) renderer?.destroyBillboardBatch?.(p.batch);
    places.delete(key);
  }
  function stand(site) {
    const pl = {
      site, key: site.key, bucket: `port:${site.key}`, guardBucket: `port:${site.key}:guard`, guard: null, at: null, matrix: null, colAt: null, box: null, targets: null,
      groundY: NaN, groundAt: [NaN, NaN, -Infinity, NaN], phase: (textSeed(String(site.key)) % 6283) / 1000,
      people: peopleOf(site).map((p) => ({ ...p, batch: null, origin: [0, 0, 0], frame: -1, keysOf: '', texKeys: [] })),
      lamp: [0, 0, 0], light: null, glow: null, seen: -1,
    };
    places.set(site.key, pl);
    return pl;
  }
  function posePeople(pl, t) {
    if (!renderer?.createBillboardBatch) return;
    for (const p of pl.people) {
      const archive = archiveOf(pl.site, p), tex = texOf(archive);
      if (!tex) continue;
      const frames = Math.max(1, tex.getFrameCount?.(PERSON_IDLE_RECORD) ?? 1);
      const frame = Math.floor((t / 1000) * PERSON_IDLE_FPS + p.i * 0.37) % frames;
      if (frame !== p.frame || !p.batch) {
        p.frame = frame;
        const rkey = idleKey(frame), sz = mobileBillboardSize(tex, PERSON_IDLE_RECORD);
        if (p.keysOf !== archive) { p.keysOf = archive; p.texKeys = []; }
        if (!renderer.textures?.has?.(p.texKeys[frame] ??= `${archive}_${rkey}`)) uploadRecordFrame?.(archive, PERSON_IDLE_RECORD, frame);
        if (!p.batch) { p.batch = renderer.createBillboardBatch(archive, rkey, { w: sz.w, h: sz.h }, [[0, 0, 0]]); p.batch.origin = p.origin; p.batch.size = { w: sz.w, h: sz.h }; }
        p.batch.record = rkey; p.batch.size.w = sz.w; p.batch.size.h = sz.h;
      }
      yardToScene(pl.at, pl.site.yaw, p.at[0], p.at[1], p.at[2], p.origin);
    }
  }
  function partOf(key) {
    if (typeof key !== 'string' || !key.startsWith('port:')) return null;
    const rest = key.slice(5), cut = rest.lastIndexOf('|');
    if (cut < 0) return null;
    const pl = places.get(rest.slice(0, cut));
    if (!pl?.at) return null;
    const [what, n] = rest.slice(cut + 1).split('.');
    return { pl, what, i: Number(n) || 0 };
  }
  const sceneYaw = (pl, dir) => {
    const a = (pl.site.yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return Math.atan2(dir[0] * c + dir[1] * s, -dir[0] * s + dir[1] * c);
  };
  const lampOf = (pl) => { const l = LIGHTHOUSE_POINTS.lamp; return yardToScene(pl.at, pl.site.yaw, l[0], l[1], l[2], pl.lamp); };
  const nameOf = (pl) => pl.site.name ?? PORT_PLACES[pl.site.kind]?.title ?? '';

  return {
    frame() {
      frameN++;
      const list = sites?.() ?? NONE, t = now();
      let f;
      for (const site of list) {
        if ((site?.kind !== 'shipyard' && site?.kind !== 'lighthouse') || !site.key) continue;
        const pl = places.get(site.key) ?? stand(site);
        pl.site = site; pl.seen = frameN;
        const comp = site.comp ?? 0, G = pl.groundAt;
        if (site.x !== G[0] || site.z !== G[1] || comp !== G[3] || !Number.isFinite(pl.groundY) || frameN - G[2] >= PORT_GROUND_EVERY) {
          pl.groundY = groundAt(site.x, site.z); G[0] = site.x; G[1] = site.z; G[2] = frameN; G[3] = comp;
        }
        if (!Number.isFinite(pl.groundY)) { if (pl.colAt) { collider()?.removeBucket?.(pl.bucket); pl.colAt = null; } pl.at = null; continue; }
        if (!pl.at || pl.at[0] !== site.x || pl.at[1] !== pl.groundY || pl.at[2] !== site.z) {
          pl.at = [site.x, pl.groundY, site.z];
          pl.matrix = trs(pl.at[0], pl.at[1], pl.at[2], 0, site.yaw, 0);
          pl.targets = null; pl.box = null;
        }
        meshOf(site.kind);
        standCollider(pl);
        if (site.kind === 'lighthouse') guardFrame(pl, f === undefined ? (f = feet()) : f);
        posePeople(pl, t);
      }
      for (const pl of places.values()) if (pl.seen !== frameN) takeDown(pl.key);
      return places.size;
    },
    draw(r = renderer, cull = null) {
      if (!r?.drawMesh) return 0;
      let n = 0;
      for (const pl of places.values()) {
        if (!pl.at || !pl.matrix) continue;
        const v = cull ? cull(pl.box ??= boxOf(pl)) : DECOR_DRAW;
        if (v === DECOR_SKIP) continue;
        const mesh = meshes.get(pl.site.kind);
        if (!mesh) continue;
        (v === DECOR_SHADOW ? castOnly(r) : r).drawMesh(mesh, pl.matrix, null);
        if (v !== DECOR_DRAW) continue;
        const fire = pl.site.kind === 'lighthouse' && lit() ? meshes.get('fire') : null;
        // The flames cast no shadow because the lamp light sits inside them.
        if (fire) r.drawMesh(fire, pl.matrix, null, NO_SHADOW);
        n++;
      }
      return n;
    },
    offerBodies(offer, eyeAt, dt) {
      for (const pl of places.values()) {
        if (!pl.at) continue;
        for (const p of pl.people) {
          const b = p.batch;
          if (!b) continue;
          const archive = archiveOf(pl.site, p), race = pl.site.race ?? 'Breton', key = `${archive}|${race}`;
          if (p._mwLookKey !== key) {
            p._mwLookKey = key;
            p._mwLook = folkLookOf({ archive, personFaceRecordId: 0, gender: p.sex === 'female' ? GENDERS.Female : GENDERS.Male, guard: false }, race, textSeed(`${pl.key}|${p.role}|${p.i}`));
          }
          offer(personActor(p, p._mwLook, b.origin, eyeAt, dt), b);
        }
      }
    },
    batches() {
      let n = 0;
      for (const pl of places.values()) if (pl.at) for (const p of pl.people) if (p.batch) _batches[n++] = p.batch;
      _batches.length = n;
      return _batches;
    },
    targets() {
      let n = 0;
      for (const pl of places.values()) {
        if (!pl.at) continue;
        pl.targets ??= (() => {
          const out = [];
          const add = (what, b) => out.push({ key: `port:${pl.key}|${what}`, aabb: yardBoxToScene(pl.at, pl.site.yaw, b), distance: RAY_DISTANCE, reach: PORT_REACH });
          const person = (p) => [p.at[0] - KEEPER_HALF, p.at[1], p.at[2] - KEEPER_HALF, p.at[0] + KEEPER_HALF, p.at[1] + KEEPER_HEIGHT, p.at[2] + KEEPER_HALF];
          for (const p of pl.people) add(p.role === 'keeper' || p.role === 'crewmaster' ? p.role : `${p.role}.${p.i}`, person(p));
          if (pl.site.kind === 'shipyard') { add('sign', shipsSignBox()); add('crewsign', crewSignBox()); add('notices', noticesBox()); add('hull', hullBox()); }
          else { add('door', doorBox()); add('hatch', hatchBox()); add('lamp', lanternBox()); }
          return out;
        })();
        for (const tg of pl.targets) _targets[n++] = tg;
      }
      _targets.length = n;
      return _targets;
    },
    hoverName(key) {
      const p = partOf(key);
      if (!p) return null;
      const s = p.pl.site;
      if (s.kind === 'lighthouse') {
        if (p.what === 'hatch') return { title: 'The hatch', subs: [PORT_TEXT.hatch], actions: DOWN_ROWS.map((r) => ({ ...r })) };
        if (p.what === 'lamp') return { title: 'The beacon', subs: [nameOf(p.pl), lit() ? PORT_TEXT.lampLit : PORT_TEXT.lampDark], actions: [] };
        return { title: nameOf(p.pl), subs: [`${PORT_PLACES.lighthouse.keeper}: ${s.keeper?.name ?? ''}`, p.what === 'door' ? PORT_TEXT.stair : (lit() ? PORT_TEXT.lampLit : PORT_TEXT.lampDark)], actions: CLIMB_ROWS.map((r) => ({ ...r })) };
      }
      if (p.what === 'crewmaster' || p.what === 'crewsign' || p.what === 'notices') {
        return { title: s.crewName ?? PORT_PLACES.crewhall.title, subs: [`${PORT_PLACES.crewhall.keeper}: ${s.crewmaster?.name ?? ''}`, PORT_PLACES.crewhall.trade], actions: CREW_ROWS.map((r) => ({ ...r })) };
      }
      if (p.what === 'recruit') return { title: 'Sailor', subs: [PORT_TEXT.sailor], actions: CREW_ROWS.map((r) => ({ ...r })) };
      if (p.what === 'worker') return { title: 'Shipwright', subs: [PORT_TEXT.worker, nameOf(p.pl)], actions: [] };
      return { title: nameOf(p.pl), subs: [`${PORT_PLACES.shipyard.keeper}: ${s.keeper?.name ?? ''}`, PORT_PLACES.shipyard.trade], actions: SHIPYARD_ROWS.map((r) => ({ ...r })) };
    },
    activate(key, mode = 'grab', verb = null) {
      const p = partOf(key);
      if (!p) return false;
      const s = p.pl.site;
      if (verb == null && mode === 'info') {
        const who = p.what === 'keeper' ? `${s.keeper?.name ?? ''}, the ${PORT_PLACES[s.kind].keeper.toLowerCase()}`
          : p.what === 'crewmaster' ? `${s.crewmaster?.name ?? ''}, the ${PORT_PLACES.crewhall.keeper.toLowerCase()}`
          : p.what === 'recruit' ? 'a sailor looking for a berth' : p.what === 'worker' ? 'a shipwright at work' : nameOf(p.pl);
        say(presentNpcInfoText(who));
        return true;
      }
      if (verb == null && mode === 'steal') { midText(s.kind === 'lighthouse' ? PORT_TEXT.lightSteal : PORT_TEXT.steal); return true; }
      if (s.kind === 'lighthouse') {
        if (p.what === 'lamp') { say(lit() ? PORT_TEXT.lampLit : PORT_TEXT.lampDark); return true; }
        const down = p.what === 'hatch';
        const pt = down ? LIGHTHOUSE_POINTS.foot : LIGHTHOUSE_POINTS.gallery;
        const feetAt = yardToScene(p.pl.at, s.yaw, pt[0], pt[1] + (down ? 0 : 0.05), pt[2]);
        const yaw = sceneYaw(p.pl, down ? [0, 1] : [0, -1]);
        const r = climb(s, down ? 'down' : 'up', { feet: feetAt, yaw });
        if (r !== true) midText(typeof r === 'string' && r ? r : PORT_TEXT.shutStair);
        else if (!down) noteFirstUse('lighthouse');
        return true;
      }
      if (p.what === 'worker') { say(presentNpcInfoText('a shipwright at work')); return true; }
      const crew = p.what === 'crewmaster' || p.what === 'crewsign' || p.what === 'notices' || p.what === 'recruit';
      const page = crew ? 'crew' : (SHIPYARD_ROWS.find((r) => r.id === verb)?.id ?? 'ships');
      if (!open(s, page)) midText(PORT_TEXT.shut);
      return true;
    },
    lights() {
      let n = 0;
      if (lit()) for (const pl of places.values()) {
        if (!pl.at) continue;
        const L = (pl.light ??= { x: 0, y: 0, z: 0, range: 0, color: null }), at = pl.lamp;
        if (pl.site.kind === 'lighthouse') { lampOf(pl); L.range = LAMP_RANGE; }
        else { const o = SHIPYARD.lantern; yardToScene(pl.at, pl.site.yaw, o[0], o[1], o[2], at); L.range = OFFICE_LAMP_RANGE; }
        L.x = at[0]; L.y = at[1]; L.z = at[2];
        _lights[n++] = L;
      }
      _lights.length = n;
      return _lights;
    },
    // Returns shared records rewritten in place, so callers read them before the next call.
    glows(eyeAt, t = beamClock()) {
      let n = 0;
      if (lit() && eyeAt) for (const pl of places.values()) {
        if (!pl.at || pl.site.kind !== 'lighthouse') continue;
        const l = lampOf(pl), d = dist3(l, eyeAt);
        if (d > BEAM_SEEN_M) continue;
        const G = (pl.glow ??= Array.from({ length: 1 + 2 * BEAM_PUFFS }, glowRec)), g0 = G[0];
        g0.pos[0] = l[0]; g0.pos[1] = l[1]; g0.pos[2] = l[2]; g0.size = Math.max(GLOW_NEAR_M, d * GLOW_ANGLE); g0.color[3] = 0.85;
        _glows[n++] = g0;
        const theta = pl.phase + (2 * Math.PI * (t % BEAM_PERIOD_S)) / BEAM_PERIOD_S;
        for (let b = 0; b < 2; b++) {
          const th = theta + b * Math.PI, dx = Math.sin(th), dz = Math.cos(th);
          for (let k = 1; k <= BEAM_PUFFS; k++) {
            const g = G[b * BEAM_PUFFS + k], a = puffInto(g, l, dx, dz, k);
            g.color[3] = a * nearFade(dist3(g.pos, eyeAt), g.size);
            _glows[n++] = g;
          }
        }
      }
      _glows.length = n;
      return _glows;
    },
    overworldMarks() {
      const out = [];
      for (const pl of places.values()) {
        if (!pl.at) continue;
        out.push({ key: `port:${pl.key}`, at: [pl.at[0], pl.at[1] + (PORT_MARK_LIFT[pl.site.kind] ?? 6), pl.at[2]], label: nameOf(pl), kind: `yard ${pl.site.kind}` });
      }
      return out;
    },
    state: () => [...places.values()].map((pl) => ({ key: pl.key, kind: pl.site.kind, at: pl.at, collider: pl.colAt !== null, name: nameOf(pl), people: pl.people.filter((p) => p.batch).length })),
    galleryY: GALLERY_Y,
    destroyAll() { for (const key of [...places.keys()]) takeDown(key); },
    dispose() {
      for (const key of [...places.keys()]) takeDown(key);
      for (const m of meshes.values()) if (m) renderer?.destroyMesh?.(m);
      meshes.clear(); artAt = 0; artFrame = -1;
    },
  };
}
