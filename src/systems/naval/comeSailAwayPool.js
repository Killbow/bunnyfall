// @ts-check
import { loadComeSailAwayModels, rendererModel, rendererModelKey, bundleSlots, PORT_SHIPS } from './comeSailAwayModels.js';
import { createLiveryPaint } from './shipLiveryPaint.js';
import { afterFirstFrame } from '../afterFirstFrame.js';
import { warmLiveryArt } from '../../world/shipLiveryArt.js';
import { fitBoats } from './deckFittingsHost.js';
import { liveryCode } from './shipLivery.js';
import { spawnBoat, boatAssetNeeds, DUNGEON_LIGHT_HANDLER, HULL_NAMES, setBoatVariant, Boat, FIRST_HULL_MODEL_ID, meshLocalBounds, worldBounds } from './comeSailAwayBoat.js';
import { resolveNodePointer, instantiatePrefab, prefabShapeStamp } from '../../world/prefabNode.js';
import { StaticBatchBuilder } from '../../render/staticBatch.js';
import { instanceParticleSystems } from '../../world/unityParticles.js';
import { bakeSkinnedMesh, recalculateNormals, fixDeformationsTick } from '../../world/skinnedBake.js';
import { billboardSize } from '../../world/rmbFlats.js';
import { isNpcFlat } from '../../world/npcFlatArchives.js';
import { GLOBAL_SCALE } from '../../world/meshReader.js';
import { multiply, identity } from '../../world/mat4.js';
import { spherePlanes, sphereInPlanes, transformSphere } from '../../render/bounds.js';
import { cullDisabled } from '../../render/frustum.js';
import { mat4FromQuatPosScale, quatRotateInto } from '../../world/quat.js';
import { colliderPoses, boxColliderTriangles, invertAffine, BUILTIN_COLLIDER_MESHES } from '../../world/prefabColliders.js';
import { farLife, farTreeStep } from './farLife.js';
import { buildDeck } from './navalDeck.js';
import { hullBuild, setGalleonStanding, setShipStanding } from './navalShips.js';
import { registerGalleonArt, GALLEON_ARCHIVE, galleonCut, galleonGlow, GALLEON_NIGHT } from '../../world/galleonArt.js';
import { registerCarrackArt, CARRACK_ARCHIVE, carrackCut, carrackGlow, CARRACK_NIGHT } from '../../world/carrackArt.js';
import { registerLargeBoatArt, LARGE_BOAT_ARCHIVE } from '../../world/largeBoatArt.js';
import { toColor32 } from '../../formats/color32Order.js';
import { createShipPlaques, BLOCK_LETTERS, fntLetters } from './shipPlaque.js';
import { FntFile } from '../../formats/fntFile.js';
import { addVendorTextures, decodedTexture } from '../../render/textureReplacement.js';
import { adoptLight } from '../../render/lightId.js';

export const LANTERN_HANDLER_REACH = DUNGEON_LIGHT_HANDLER.unscaledBlockRange * GLOBAL_SCALE;
export const CSA_LIGHTS_MAX = 8;
export const FLAG_DONOR_HULL = 2;
export const PORT_ART = Object.freeze({
  galleon: Object.freeze({ archive: GALLEON_ARCHIVE, register: registerGalleonArt, cut: galleonCut, night: GALLEON_NIGHT, glow: galleonGlow }),
  carrack: Object.freeze({ archive: CARRACK_ARCHIVE, register: registerCarrackArt, cut: carrackCut, night: CARRACK_NIGHT, glow: carrackGlow }),
  largeBoat: Object.freeze({ archive: LARGE_BOAT_ARCHIVE, register: registerLargeBoatArt, cut: () => false, night: Object.freeze({}), glow: () => null }),
});
const artOf = (archive) => Object.values(PORT_ART).find((a) => a.archive === archive);
const cutOf = (archive, record) => !!artOf(archive)?.cut(record);
const nightOf = (archive, record) => artOf(archive)?.night[record] ?? null;
export const NIGHT_REMAP = new Map(Object.values(PORT_ART).flatMap((a) => Object.entries(a.night).map(([r, n]) => [`${a.archive}_${r}`, `${a.archive}_${n}`])));
// One merged map per host remap, so the renderer's per-submesh remap lookups stay cached night after night.
const _nightRemaps = new WeakMap();
export function nightRemapOf(texRemap) {
  if (!texRemap?.size) return NIGHT_REMAP;
  let m = _nightRemaps.get(texRemap);
  if (!m) { m = new Map([...NIGHT_REMAP, ...texRemap]); _nightRemaps.set(texRemap, m); }
  return m;
}

export function* activeObjects(root) {
  if (!root?.activeSelf) return;
  const stack = [[root, root.localMatrix()]];
  while (stack.length) {
    const [n, m] = stack.pop();
    yield [n, m];
    for (let i = n.children.length - 1; i >= 0; i--) {
      const c = n.children[i];
      if (c.activeSelf) stack.push([c, multiply(m, c.localMatrix(), new Float32Array(16))]);
    }
  }
}

export function vertexBox(positions) {
  if (!positions?.length) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let d = 0; d < 3; d++) { const v = positions[i + d]; if (v < min[d]) min[d] = v; if (v > max[d]) max[d] = v; }
  return { min, max };
}

// DaggerfallLight runs before DungeonLightHandler; Unity names no order between them, so this one is fixed.
/**
 * @param {any} light
 * @param {{ dt:number, cityLightsOn:boolean, playerPosition:number[] }} f
 */
export function lanternLightUpdate(light, { dt, cityLightsOn, playerPosition }) {
  const n = light.node;
  if (!n.activeInHierarchy) return;
  const dl = n.getComponent('DaggerfallLight');
  if (dl?.enabled) {
    if (dl.lastCityLightsFlag == null) dl.lastCityLightsFlag = !cityLightsOn;
    if (!dl.InteriorLight && dl.lastCityLightsFlag !== cityLightsOn) { light.enabled = cityLightsOn; dl.lastCityLightsFlag = cityLightsOn; }
  }
  const h = n.getComponent('DungeonLightHandler');
  if (h?.enabled) {
    h.timer = Math.fround(h.timer + Math.fround(dt));
    if (h.timer > Math.fround(h.UpdateInSeconds)) {
      const p = n.position;
      light.enabled = !(Math.hypot(p[0] - playerPosition[0], p[2] - playerPosition[2]) > LANTERN_HANDLER_REACH);
      h.timer = 0;
    }
  }
}

export const FADE_FLATS = 0.5;
export const CULL_DETAIL_PX = 1;
export const STILL_MIN = 2;
export const STILL_FRAMES = 20;
export const RIG_STILL_M = 0.001;

/**
 * @param {{ renderer?: any, pipeline?: any, fetchFn?: any, log?: any, liveryOf?: ((boat: any) => any) | null, fittingsOf?: ((boat: any) => any[]) | null,
 *   plaqueOf?: ((boat: any) => string | null) | null, plaqueFont?: (() => Promise<Uint8Array>) | null }} [o]
 */
export function createComeSailAwayPool({ renderer = null, pipeline = null, fetchFn = null, log = console, liveryOf = null, fittingsOf = null, plaqueOf = null, plaqueFont = null } = {}) {
  /** @type {any} */ let models = null;
  let modelsLoading = null, modelsFailed = false;
  /** @type {any[]} */ const boats = [];
  // Peer and sea boats draw like mine but never join `boats`, so host rays and activations skip them.
  /** @type {any[]} */ const peerBoats = [];
  /** @type {any[]} */ const seaBoats = [];
  const drawn = () => (peerBoats.length || seaBoats.length ? boats.concat(peerBoats, seaBoats) : boats);
  const mineBoats = new WeakSet();
  const paints = createLiveryPaint({ renderer, pipeline, log, portArchiveOf: (hull) => { const s = PORT_SHIPS.find((x) => x.hull === hull); return s && models?.[s.key] ? PORT_ART[s.key].archive : null; } });
  const liveryCodeOf = (boat) => {
    if (!mineBoats.has(boat)) return boat.livery | 0;
    const rec = liveryOf?.(boat) ?? null;
    if (boat._liveryRec !== rec || boat._liveryCode == null) { boat._liveryRec = rec; boat._liveryCode = liveryCode(rec); }
    return boat._liveryCode;
  };
  /** @type {any} */ let plaqueLetters = plaqueFont ? null : BLOCK_LETTERS;
  /** @type {Promise<void> | null} */ let plaqueLoad = null;
  const lettersNow = () => {
    if (!plaqueLetters && !plaqueLoad) {
      plaqueLoad = Promise.resolve().then(() => plaqueFont()).then((b) => { plaqueLetters = fntLetters(new FntFile().load(b)); },
        (e) => { log?.warn?.('[plaque] FONT0003.FNT will not load - her name is cut in block letters', e); plaqueLetters = BLOCK_LETTERS; });
    }
    return plaqueLetters;
  };
  const plaques = createShipPlaques({ renderer, surfaceOf: (hull) => hullSurface(hull), buildOf: (hull) => hullBuild(hull), letters: lettersNow });
  const plaqueNameOf = (boat) => (mineBoats.has(boat) ? plaqueOf?.(boat) ?? null : peerBoats.includes(boat) ? boat.plaqueName || null : null);
  const _cullOn = !cullDisabled();
  const _cullPv = new Float32Array(16), _cullPlanes = new Float32Array(24), _cullSphere = new Float32Array(4), _cullBox = new Float32Array(6);
  const meshes = new Map();
  const meshLoads = new Map();
  const bakes = new Map();
  const _rigV = [0, 0, 0], _rigBack = [0, 0, 0, 1];
  const flats = new Map();
  const crew = new Map();
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (warned.has(k)) return; warned.add(k); log?.warn?.(...a); };
  const walks = new Map();
  const _walkStack = [], _walkRecs = [];
  const _local = new Float32Array(16);
  // Every matrix making takes a new `_makings` count, so a node under a new parent never matches a stale `pver`.
  let walkStamp = 0, _makings = 0;
  let cityLights = false;
  const ROOT_MADE = -2;
  const recOf = (n) => {
    let r = n._walkRec;
    if (!r) {
      const l = new Float64Array(10).fill(NaN);
      r = { m: new Float32Array(16), ver: 0, pver: -1, pend: false, under: null, l, lq: l.subarray(0, 4), lt: l.subarray(4, 7), ls: l.subarray(7, 10), at: null };
      n._walkRec = r;
    }
    return r;
  };
  function localSame(r, n) {
    const q = n.localRotation, t = n.localPosition, sc = n.localScale, l = r.l;
    if (l[0] === q[0] && l[1] === q[1] && l[2] === q[2] && l[3] === q[3] && l[4] === t[0] && l[5] === t[1] && l[6] === t[2]
      && l[7] === sc[0] && l[8] === sc[1] && l[9] === sc[2]) return true;
    l[0] = q[0]; l[1] = q[1]; l[2] = q[2]; l[3] = q[3]; l[4] = t[0]; l[5] = t[1]; l[6] = t[2]; l[7] = sc[0]; l[8] = sc[1]; l[9] = sc[2];
    return false;
  }
  function walkBoat(boat, stamp) {
    let w = walks.get(boat);
    if (!w) { w = { stamp: -1, nodes: [], mats: [], recs: [], ver: 0, plan: null, heldAt: -1, draws: { at: -1, alone: [], still: [] } }; walks.set(boat, w); }
    w.stamp = stamp;
    const nodes = w.nodes, mats = w.mats, wrecs = w.recs;
    let at = 0, moved = false;
    const root = boat.GameObject;
    const seen = root?.parent === null ? stamp : -1;
    if (root?.activeSelf) {
      const rr = recOf(root);
      if (!localSame(rr, root) || rr.pend || rr.pver !== ROOT_MADE) { rr.pend = true; rr.under = null; }
      const stack = _walkStack, recs = _walkRecs;
      stack.length = 0; recs.length = 0;
      stack.push(root); recs.push(rr);
      while (stack.length) {
        const n = stack.pop(), pr = recs.pop();
        if (nodes[at] !== n) { nodes[at] = n; moved = true; }
        mats[at] = pr.m; wrecs[at] = pr; pr.seen = seen; at++;
        for (let i = n.children.length - 1; i >= 0; i--) {
          const c = n.children[i];
          if (!c.activeSelf) continue;
          const r = recOf(c);
          if (!localSame(r, c) || r.pend || pr.pend || r.pver !== pr.ver) { r.pend = true; r.under = pr; }
          stack.push(c); recs.push(r);
        }
      }
    }
    if (nodes.length !== at) { nodes.length = at; mats.length = at; wrecs.length = at; moved = true; }
    if (moved) w.ver++;
    return w;
  }
  function planOf(boat, w) {
    const stamp = prefabShapeStamp(boat.GameObject);
    let p = w.plan;
    if (p && p.ver === w.ver && p.stamp === stamp && p.frame === boat.MeshObject) return p;
    p = { ver: w.ver, stamp, frame: boat.MeshObject, holders: [], flats: [], parts: [] };
    for (let i = 0; i < w.nodes.length; i++) {
      const n = w.nodes[i];
      for (const c of n.components) if (c.type === 'FixDeformations') p.holders.push(c, n);
      const mr = n.getComponent('MeshRenderer');
      const bb = n.getComponent('DaggerfallBillboard');
      if (bb) p.flats.push({ i, node: n, bb, r: mr, at: -1, sx: 0, sy: 0 });
      if (mr) p.parts.push({ i, node: n, mr, mf: n.getComponent('MeshFilter'), fix: n.getComponent('FixDeformations'), mesh: null, mats: null, bundle: null, bundleN: -1, slots: null, key: null, gpu: null, chain: undefined, rec: null });
    }
    w.plan = p;
    return p;
  }
  // Compared by array identity: every writer of materials assigns a new array.
  function partKey(e, mesh) {
    const mr = e.mr, mats = mr.materials ?? null, bundle = mats ? null : (mr.m_Materials ?? null), bn = bundle ? bundle.length : -1;
    if (e.key === null || e.mesh !== mesh || e.mats !== mats || e.bundle !== bundle || e.bundleN !== bn) {
      e.mesh = mesh; e.mats = mats; e.bundle = bundle; e.bundleN = bn;
      e.slots = mats ?? bundleSlots(mr);
      e.key = rendererModelKey(mesh, e.slots);
    }
    return e.key;
  }
  const worldOf = (n) => {
    const r = n._walkRec;
    return r !== undefined && walkStamp > 0 && r.seen === walkStamp ? made(r) : n.worldMatrix();
  };
  function made(r) {
    if (!r.pend) return r.m;
    const p = r.under;
    if (p === null) { mat4FromQuatPosScale(r.lq, r.lt, r.ls, r.m); r.pver = ROOT_MADE; }
    else { multiply(made(p), mat4FromQuatPosScale(r.lq, r.lt, r.ls, _local), r.m); r.pver = p.ver; }
    r.ver = ++_makings; r.pend = false;
    return r.m;
  }
  const walkOf = (boat) => { const w = walks.get(boat); return w && walkStamp > 0 && (w.stamp === walkStamp || w.heldAt === walkStamp) ? w : walkBoat(boat, -1); };
  const walkMade = (boat) => { const w = walkOf(boat); for (const r of w.recs) made(r); return w; };

  const lives = new WeakMap();
  let _lifeSeq = 0;
  /** @type {ArrayLike<number> | null} */ let _lifeEye = null;
  /** @type {Float32Array | null} */ let _shift = null;
  function lifeOf(boat, dt) {
    let life = lives.get(boat);
    if (!life) { life = { ...farLife(_lifeSeq++), shiftAt: 0, shiftNow: null, shift: null, m: null }; lives.set(boat, life); }
    const w = walks.get(boat), root = boat.GameObject;
    const kept = w !== undefined && w.stamp > 0;
    const lived = farTreeStep(life, dt, root, kept ? (root.parent ? root.position : root.localPosition) : null, _lifeEye);
    if (lived === null) w.heldAt = walkStamp;
    return lived;
  }
  function heldShift(boat, w) {
    if (w.stamp === walkStamp || w.heldAt !== walkStamp) return null;
    const life = lives.get(boat);
    const hull = boat.MeshObject, hr = hull?._walkRec;
    const node = hr !== undefined && hr.seen === w.stamp ? hull : boat.GameObject, r = node?._walkRec;
    if (!r) return null;
    const was = made(r), now = node.worldMatrix();
    if (life.shiftAt === walkStamp && life.shiftNow === now) return life.shift;
    life.shiftAt = walkStamp; life.shiftNow = now; life.shift = null;
    let same = true;
    for (let i = 0; i < 16 && same; i++) same = was[i] === now[i];
    const inv = same ? null : invertAffine(was);
    if (inv) life.shift = multiply(now, inv, (life.m ??= new Float32Array(16)));
    return life.shift;
  }
  const placed = (r) => (_shift === null ? made(r) : multiply(_shift, made(r), (r.at ??= new Float32Array(16))));
  const _placedAt = new Float32Array(16);
  // Same products in the same order as `placed`, so the translation matches it to the bit.
  function placedAt(r) {
    const m = made(r), a = _shift;
    if (a === null) return m;
    for (let row = 0; row < 3; row++) _placedAt[12 + row] = 0 + a[row] * m[12] + a[4 + row] * m[13] + a[8 + row] * m[14] + a[12 + row] * m[15];
    return _placedAt;
  }

  async function ensureModels() {
    if (models || modelsFailed) return models;
    modelsLoading ??= loadComeSailAwayModels(fetchFn ?? globalThis.fetch, undefined, log).then((m) => {
      for (const [key, art] of Object.entries(PORT_ART)) {
        if (!m?.[key]) continue;
        // Port ship art registers before anything asks the pipeline for its archive.
        art.register(addVendorTextures);
        pipeline?.markClassicArt?.(art.archive);
      }
      if (m) { setGalleonStanding(m.galleon); setShipStanding(4, m.carrack); setShipStanding(1, m.largeBoat); }
      models = m; modelsFailed = !m; return m;
    });
    return modelsLoading;
  }

  const billboardSizeOf = (archive, record) => {
    const t = pipeline?.textureFiles?.get(archive);
    if (!t || t.vendor || !(t.recordCount > record)) return null;
    const s = billboardSize(t, record);
    return [s.w, s.h];
  };
  const modelBoundsOf = (id) => vertexBox(pipeline?.cpuModels?.get(id)?.positions);
  const modelWontLoad = (id, e) => warnOnce(`model:${id}`, `[come-sail-away] model ${id} will not load`, e);
  const _fitLoads = new Set();
  const _fitDeps = {
    ctx: { get models() { return models; }, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf },
    deckOf: (hull) => deckOf(hull),
    load: (m) => { if (_fitLoads.has(m) || !pipeline?.getGpuMesh) return; _fitLoads.add(m); Promise.resolve(pipeline.getGpuMesh(m)).catch((e) => modelWontLoad(m, e)); },
  };

  async function prepare(hull) {
    const need = boatAssetNeeds({ models }, hull);
    for (const [a, r] of need.flats) {
      try { const t = await pipeline.getTexture(a); if (t?.recordCount > r) pipeline.uploadRecord(a, r); }
      catch (e) { warnOnce(`flat:${a}`, `[come-sail-away] TEXTURE.${a} will not load - the boats' flats of it stand invisible`, e); }
    }
    for (const id of need.models) {
      try { await pipeline.getGpuMesh(id); } catch (e) { modelWontLoad(id, e); }
    }
  }

  /** @returns {Promise<any>} */
  async function spawn(boat, player) {
    if (!(await ensureModels())) return null;
    await prepare(boat.hull);
    return spawnNow(boat, player);
  }
  let preloaded = false, preloading = null;
  function preload() {
    preloading ??= (async () => {
      if (!(await ensureModels())) return false;
      for (let hull = 0; hull < HULL_NAMES.length; hull++) await prepare(hull);
      for (const [key, art] of Object.entries(PORT_ART)) {
        if (!models[key]) continue;
        try { await pipeline.getTexture(art.archive); for (const n of Object.values(art.night)) art.glow(n); }
        catch (e) { warnOnce(`tex:${art.archive}`, `[come-sail-away] TEXTURE.${art.archive} will not load - the boats' faces in it draw nothing`, e); }
      }
      // Decks and name boards bake while the world loads, never mid-voyage.
      for (let hull = 0; hull < HULL_NAMES.length; hull++) deckOf(hull, 0);
      for (let hull = 0; hull < HULL_NAMES.length; hull++) plaques.prime(hull);
      try { warmLiveryArt(); } catch { }
      preloaded = true;
      return true;
    })();
    return preloading;
  }
  function spawnNow(boat, player) {
    if (!models) return null;
    // Listed before it is built, so a spawn that throws halfway leaves its half-built hull, as in the mod.
    boats.push(boat); mineBoats.add(boat);
    spawnBoat(boat, { models, player: () => player, billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    return boat;
  }
  function setVariant(boat, variant) {
    setBoatVariant(boat, variant, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    walks.delete(boat);
  }
  function spawnPeerNow(boat) {
    if (!models) return null;
    spawnBoat(boat, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    peerBoats.push(boat);
    return boat;
  }
  function spawnSeaNow(boat) {
    if (!models) return null;
    spawnBoat(boat, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    graftColours(boat);
    seaBoats.push(boat);
    return boat;
  }
  function graftColours(boat) {
    if (boat.FlagObject || !boat.MeshObject) return;
    const find = (t) => (!t ? null : t.name === 'FlagObject' ? t : t.children.reduce((f, c) => f ?? find(c), null));
    const donor = find(models.prefab(FIRST_HULL_MODEL_ID + FLAG_DONOR_HULL));
    if (!donor) return;
    let truck = null;
    for (const node of boat.MeshObject.walk()) {
      const local = node.activeInHierarchy ? meshLocalBounds({ models }, node.getComponent('MeshFilter')?.m_Mesh) : null;
      if (!local) continue;
      const wb = worldBounds(node, local);
      if (!truck || wb.max[1] > truck.at[1]) truck = { node, at: [wb.center[0], wb.max[1], wb.center[2]] };
    }
    if (!truck) return;
    const flag = instantiatePrefab(donor, models.components);
    instanceParticleSystems(flag, {});
    flag.setParent(truck.node);
    flag.position = truck.at;
    boat.FlagObject = flag;
    boat.FlagEmitter = flag.getComponentInChildren('ParticleSystem')?.particleSystem ?? null;
    boat.FlagEmitterMain = boat.FlagEmitter?.main ?? null;
  }
  const hullRigCache = new Map();
  function hullRig(hull) {
    if (!models || !(hull >= 0 && hull < HULL_NAMES.length)) return null;
    let rig = hullRigCache.get(hull);
    if (!rig) {
      const b = new Boat(hull, 0);
      spawnBoat(b, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
      rig = Object.freeze({ nodes: b.Nodes.map((n) => [...n.localPosition]), sails: b.Sails.length, crewed: !!b.crewed, packable: !!b.packable, cargo: b.modifierCargoThreshold });
      hullRigCache.set(hull, rig);
    }
    return rig;
  }
  const portraitBoats = new Map();
  const _portraitSphere = new Float32Array(4);
  const holderAsks = new WeakMap();
  function portrait(hull) {
    if (!models || !(hull >= 0 && hull < HULL_NAMES.length)) return null;
    let b = portraitBoats.get(hull);
    if (!b) {
      b = new Boat(hull, 0);
      spawnBoat(b, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
      portraitBoats.set(hull, b);
    }
    const w = walkMade(b);
    const parts = [];
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let waiting = false;
    for (let i = 0; i < w.nodes.length; i++) {
      const node = w.nodes[i];
      for (const c of node.components) {
        if (c.type !== 'FixDeformations' || bakes.has(c)) continue;
        holderAsks.set(c, (holderAsks.get(c) ?? 0) + 1);
        lateUpdateHolder(c, node, 1);
      }
      const mr = node.getComponent('MeshRenderer');
      if (!mr || mr.m_Enabled === false || mr.materials?.[0]?.billboard) continue;
      let gpu = null;
      if (mr.classicModel != null) { gpu = pipeline?.gpuMeshes?.get(mr.classicModel) ?? null; if (!gpu) continue; }
      else {
        const mf = node.getComponent('MeshFilter');
        if (mf?.baked) {
          const fix = node.getComponent('FixDeformations');
          if (!bakes.has(fix) && (holderAsks.get(fix) ?? 0) > 2) continue;
          gpu = bakes.get(fix)?.gpu ?? null;
        } else if (mf?.m_Mesh?.mesh) {
          const slots = mr.materials ?? bundleSlots(mr);
          const key = rendererModelKey(mf.m_Mesh.mesh, slots);
          if (meshes.has(key) && !meshes.get(key)) continue;
          gpu = meshFor(key, () => rendererModel(models.geometry(mf.m_Mesh.mesh), slots));
        } else continue;
      }
      if (!gpu) { waiting = true; continue; }
      const m = w.mats[i];
      parts.push([gpu, m]);
      const local = meshLocalBounds({ models }, node.getComponent('MeshFilter')?.m_Mesh);
      if (local) {
        const wb = worldBounds(node, local);
        for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], wb.min[k]); box[k + 3] = Math.max(box[k + 3], wb.max[k]); }
      } else if (gpu.bounds && gpu.bounds[3] > 0) {
        const sp = transformSphere(m, gpu.bounds, _portraitSphere);
        for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], sp[k] - sp[3]); box[k + 3] = Math.max(box[k + 3], sp[k] + sp[3]); }
      }
    }
    return waiting || !parts.length || !(box[3] > box[0]) ? null : { parts, box };
  }
  function remove(boat) {
    const list = boats.includes(boat) ? boats : peerBoats.includes(boat) ? peerBoats : seaBoats;
    const i = list.indexOf(boat);
    if (i < 0) return;
    list.splice(i, 1);
    walks.delete(boat);
    const st = stills.get(boat);
    if (st?.mesh) renderer?.destroyMesh?.(st.mesh);
    stills.delete(boat);
    for (const n of boat.GameObject.walk()) {
      const b = flats.get(n); if (b) { renderer?.destroyBillboardBatch?.(b); flats.delete(n); crew.delete(n); }
      for (const c of n.components) if (c.type === 'FixDeformations') { const k = bakes.get(c); if (k?.gpu) renderer?.destroyMesh?.(k.gpu); bakes.delete(c); }
    }
  }

  function uploadFace(archive, record) {
    pipeline.uploadRecord(archive, record, { opaque: true, cutout: cutOf(archive, record) });
    const night = nightOf(archive, record);
    if (night == null) return;
    pipeline.uploadRecord(archive, night, { opaque: true });
    const glow = artOf(archive).glow(night);
    const lit = decodedTexture(archive, night, 0, 'Emission');
    if (lit || glow) renderer?.uploadEmissionTexture?.(archive, night, lit ?? toColor32(glow), { replacement: !pipeline.isClassicArt?.(archive) });
  }

  function meshFor(key, build) {
    if (meshes.has(key)) return meshes.get(key);
    if (!meshLoads.has(key) && renderer?.createMesh) {
      meshLoads.set(key, (async () => {
        const model = build();
        if (!model) { meshes.set(key, null); return; }
        for (const sm of model.subMeshes) {
          try { await pipeline.getTexture(sm.textureArchive); uploadFace(sm.textureArchive, sm.textureRecord); }
          catch (e) { warnOnce(`tex:${sm.textureArchive}`, `[come-sail-away] TEXTURE.${sm.textureArchive} will not load - the boats' faces in it draw nothing`, e); }
        }
        meshes.set(key, renderer.createMesh(model));
      })().catch((e) => { meshes.set(key, null); warnOnce(`mesh:${key}`, '[come-sail-away] a boat mesh failed to build', e); }).finally(() => meshLoads.delete(key)));
    }
    return null;
  }

  function lateUpdateHolder(script, holder, dt) {
    if (script.everyFrame ? !(dt > 0) : !fixDeformationsTick(script, dt)) return;
    const skinnedNode = holder.parent;
    const smr = script.skinnedMeshRenderer;
    const g = models.geometry(smr.m_Mesh?.mesh);
    if (!g?.bindPoses) return;
    let k = bakes.get(script);
    if (!k) { k = { gpu: null, positions: new Float32Array(g.vertexCount * 3), normals: new Float32Array(g.vertexCount * 3), loading: false }; bakes.set(script, k); }
    const shape = prefabShapeStamp(skinnedNode);
    if (k.bonesOf !== skinnedNode || k.bonesList !== smr.m_Bones || k.bonesStamp !== shape) {
      k.bones = smr.m_Bones.map((b) => resolveNodePointer(skinnedNode, b));
      k.bonesOf = skinnedNode; k.bonesList = smr.m_Bones; k.bonesStamp = shape;
      k.boneWorld = new Array(k.bones.length);
      k.pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    }
    const bones = k.bones, boneWorld = k.boneWorld;
    for (let b = 0; b < bones.length; b++) boneWorld[b] = bones[b] ? worldOf(bones[b]) : null;
    const pose = k.pose, sw = worldOf(skinnedNode), sq = skinnedNode._rotationKept();
    pose.position[0] = sw[12]; pose.position[1] = sw[13]; pose.position[2] = sw[14];
    pose.rotation[0] = sq[0]; pose.rotation[1] = sq[1]; pose.rotation[2] = sq[2]; pose.rotation[3] = sq[3];
    if (script.everyFrame && rigStill(k, boneWorld, pose)) return;
    bakeSkinnedMesh(g, boneWorld, g.bindPoses, pose, k.positions);
    recalculateNormals(k.positions, g.indices, g.subMeshes, k.normals);
    script.bakedMesh = k;
    if (k.gpu) { renderer.updateMeshVertices(k.gpu, k.positions, k.normals); return; }
    if (k.loading || !renderer?.createMesh) return;
    k.loading = true;
    const model = rendererModel({ ...g, positions: k.positions, normals: k.normals }, script.meshRenderer.materials);
    if (!model) return;
    (async () => {
      for (const sm of model.subMeshes) {
        try { await pipeline.getTexture(sm.textureArchive); uploadFace(sm.textureArchive, sm.textureRecord); } catch { }
      }
      if (!bakes.has(script)) return;
      k.gpu = renderer.createMesh({ ...model, positions: k.positions.slice(), normals: k.normals.slice() });
      renderer.updateMeshVertices(k.gpu, k.positions, k.normals);
    })().catch((e) => warnOnce('bake', '[come-sail-away] a sail bake failed to upload', e));
  }

  function rigStill(k, boneWorld, pose) {
    const n = boneWorld.length * 12;
    if (!k.rig || k.rig.length !== n) { k.rig = new Float64Array(n); k.rigNow = new Float64Array(n); k.rigBaked = false; }
    const q = pose.rotation, p = pose.position, back = _rigBack, v = _rigV, now = k.rigNow;
    back[0] = -q[0]; back[1] = -q[1]; back[2] = -q[2]; back[3] = q[3];
    let still = k.rigBaked;
    for (let b = 0; b < boneWorld.length; b++) {
      const m = boneWorld[b];
      if (!m) { k.rigBaked = false; return false; }
      for (let c = 0; c < 4; c++) {
        if (c < 3) quatRotateInto(back, m[c * 4], m[c * 4 + 1], m[c * 4 + 2], v);
        else quatRotateInto(back, m[12] - p[0], m[13] - p[1], m[14] - p[2], v);
        for (let j = 0; j < 3; j++) { const o = b * 12 + c * 3 + j; now[o] = v[j]; if (Math.abs(v[j] - k.rig[o]) > RIG_STILL_M) still = false; }
      }
    }
    if (still) return true;
    k.rig.set(now); k.rigBaked = true;
    return false;
  }

  /**
   * @param {number} gameDt
   * @param {{ minuteOfDay?:number, cityLightsOn?:boolean, playerPosition?:number[] }} [world]
   */
  function frame(gameDt, world = {}) {
    const playerPosition = world.playerPosition ?? [0, 0, 0];
    cityLights = !!world.cityLightsOn;
    walkStamp++;
    const lit = _lanternFrame;
    lit.dt = gameDt; lit.cityLightsOn = !!world.cityLightsOn; lit.playerPosition = playerPosition;
    if (models) { fitBoats(boats, (b) => fittingsOf?.(b), _fitDeps); fitBoats(peerBoats, (b) => b.fittings, _fitDeps); }
    _lifeEye = world.playerPosition ?? null;
    for (const boat of drawn()) {
      const dt = lifeOf(boat, gameDt);
      if (dt === null) continue;
      const holders = planOf(boat, walkBoat(boat, walkStamp)).holders;
      for (let k = 0; k < holders.length; k += 2) lateUpdateHolder(holders[k], holders[k + 1], dt);
      lit.dt = dt;
      for (const l of boat.Lights) lanternLightUpdate(l, lit);
    }
    syncFlats();
  }
  const _lanternFrame = { dt: 0, cityLightsOn: false, playerPosition: [0, 0, 0] };

  let _flatSweep = 0;
  const _flatScale = [0, 0, 0];
  function syncFlats() {
    const sweep = ++_flatSweep;
    for (const boat of drawn()) {
      if ((boat.fade ?? 1) < FADE_FLATS) continue;
      const walk = walkOf(boat);
      _shift = heldShift(boat, walk);
      const recs = walk.recs, list = planOf(boat, walk).flats;
      for (let f = 0; f < list.length; f++) {
        const e = list[f], { i, node: n, bb, r } = e;
        if (!r || r.m_Enabled === false) continue;
        const size = bb.Summary.Size, w = size[0], h = size[1];
        if (!(w > 0 && h > 0)) continue;
        const kept = e.at === walk.stamp;
        const m = kept ? placedAt(recs[i]) : placed(recs[i]);
        let b = flats.get(n);
        if (!b) {
          if (!renderer?.createBillboardBatch) continue;
          b = renderer.createBillboardBatch(bb.Summary.Archive, bb.Summary.Record, { w, h }, [[0, 0, 0]]);
          b.origin = [0, 0, 0];
          b._csaSweep = 0; b._csaSize = null;
          flats.set(n, b);
          // Named by deed uid (or hull) and walk index, so a boat's crew matches on every machine.
          if (isNpcFlat(bb.Summary.Archive)) crew.set(n, { piece: { id: `csa:${boat.uid || `h${boat.hull}`}:${i}`, flat: [bb.Summary.Archive, bb.Summary.Record] } });
        }
        if (!kept) { const s = n.lossyScaleOf(m, _flatScale); e.sx = Math.abs(s[0]); e.sy = Math.abs(s[1]); e.at = walk.stamp; }
        const sw = w * e.sx, sh = h * e.sy;
        if (b._csaSize !== null && b.size === b._csaSize) { b.size.w = sw; b.size.h = sh; }
        else b.size = b._csaSize = { w: sw, h: sh };
        b.origin[0] = m[12]; b.origin[1] = m[13] - b.size.h / 2; b.origin[2] = m[14];
        b.emissionOff = !!(r.emissionColor && r.emissionColor[0] === 0 && r.emissionColor[1] === 0 && r.emissionColor[2] === 0);
        b.conceal = boat.conceal ?? null;
        b._csaSweep = sweep;
      }
    }
    _shift = null;
    for (const [n, b] of flats) if (b._csaSweep !== sweep) { renderer?.destroyBillboardBatch?.(b); flats.delete(n); crew.delete(n); }
  }
  const batches = () => [...flats.values()];
  function people(fn) {
    for (const [n, f] of crew) { const b = flats.get(n); if (b) fn(f, b); }
  }

  function draw(r = renderer, texRemap = null) {
    if (!models || !r?.drawMesh) return 0;
    if (cityLights) texRemap = nightRemapOf(texRemap);
    const drawRemap = texRemap;
    const cull = _cullOn && !!r._proj && !!r._view;
    if (cull) spherePlanes(multiply(r._proj, r._view, _cullPv), _cullPlanes);
    const eye = r._camPos ?? null;
    const pxPerM = cull && eye ? r._proj[5] * (r.gl?.drawingBufferHeight ?? 0) / 2 : 0;
    let n = 0;
    const one = (gpu, m, texRemap = drawRemap) => {
      if (texRemap !== drawRemap) texRemap = paints.remapFor(gpu, texRemap, drawRemap);
      if (cull && gpu.bounds && gpu.bounds[3] > 0) {
        const sp = transformSphere(m, gpu.bounds, _cullSphere);
        if (pxPerM > 0 && 2 * sp[3] * pxPerM < CULL_DETAIL_PX * Math.hypot(sp[0] - eye[0], sp[1] - eye[1], sp[2] - eye[2])) return;
        if (!sphereInPlanes(_cullPlanes, sp[0], sp[1], sp[2], sp[3])) {
          const box = _cullBox;
          box[0] = sp[0] - sp[3]; box[1] = sp[1] - sp[3]; box[2] = sp[2] - sp[3]; box[3] = sp[0] + sp[3]; box[4] = sp[1] + sp[3]; box[5] = sp[2] + sp[3];
          if (r.shadowReach?.(box)) r.recordShadowMesh?.(gpu, m, texRemap);
          return;
        }
      }
      r.drawMesh(gpu, m, texRemap); n++;
    };
    for (const boat of drawn()) {
      const fade = Math.max(0, Math.min(1, boat.fade ?? 1));
      if (fade <= 0) continue;
      if (fade < 1) r.setDissolve?.(fade);
      const paint = paints.remapOf(boat.hull, liveryCodeOf(boat), cityLights, drawRemap);
      const walk = walkOf(boat);
      _shift = heldShift(boat, walk);
      const recs = walk.recs, parts = planOf(boat, walk).parts;
      const list = walk.draws;
      const still = list.still;
      if (walk.heldAt === walkStamp && list.at === walk.stamp) {
        for (const e of list.alone) one(e.gpu, placed(recs[e.i]), paint);
      } else {
        list.alone.length = 0; still.length = 0;
        for (let p = 0; p < parts.length; p++) {
          const e = parts[p], node = e.node, rec = recs[e.i], mr = e.mr;
          if (mr.m_Enabled === false || mr.materials?.[0]?.billboard) continue;
          let gpu = null, key = null;
          if (mr.classicModel != null) gpu = pipeline?.gpuMeshes?.get(mr.classicModel) ?? null;
          else {
            const mf = e.mf;
            if (mf?.baked) gpu = bakes.get(e.fix)?.gpu ?? null;
            else if (mf?.m_Mesh?.mesh) {
              key = partKey(e, mf.m_Mesh.mesh);
              gpu = meshes.has(key) ? meshes.get(key) : meshFor(key, () => rendererModel(models.geometry(e.mesh), e.slots));
            }
          }
          if (!gpu) continue;
          e.gpu = gpu;
          if (key && boat.MeshObject && e.chain === undefined) e.chain = stillChain(boat, node);
          const chain = key && boat.MeshObject ? e.chain : null;
          if (chain) { e.rec = rec; still.push(e); continue; }
          list.alone.push(e);
          one(gpu, placed(rec), paint);
        }
        list.at = walk.stamp;
      }
      const batch = stillBatch(boat, still);
      const hullRec = batch ? boat.MeshObject?._walkRec ?? null : null;
      const frame = hullRec ? (_shift !== null ? boat.MeshObject.worldMatrix() : made(hullRec)) : null;
      if (batch && frame) one(batch.mesh, frame, paint);
      for (const c of still) if (!batch || !frame || !batch.nodes.has(c.node)) one(c.gpu, placed(c.rec), paint);
      const shown = boat.GameObject?.activeSelf && boat.MeshObject?.activeSelf ? plaqueNameOf(boat) : null;
      if (shown) for (const mesh of plaques.meshesFor(boat, shown)) one(mesh, frame ?? worldOf(boat.MeshObject), paint);
      if (fade < 1) r.setDissolve?.(1);
    }
    _shift = null;
    plaques.sweep();
    return n;
  }

  const stills = new Map();
  const _stillChains = new WeakMap();
  function stillChain(boat, node) {
    const stamp = prefabShapeStamp(node), frame = boat.MeshObject;
    const had = _stillChains.get(node);
    if (had && had.stamp === stamp && had.frame === frame) return had.chain;
    let chain = [];
    let at = node;
    for (; at && at !== frame; at = at.parent) chain.push(at);
    if (!at) chain = null;
    chain?.reverse();
    _stillChains.set(node, { stamp, frame, chain });
    return chain;
  }
  function chainSnap(chain, out = new Float64Array(chain.length * 10)) {
    chain.forEach((c, k) => { const q = c.localRotation, t = c.localPosition, sc = c.localScale, o = k * 10; out[o] = q[0]; out[o + 1] = q[1]; out[o + 2] = q[2]; out[o + 3] = q[3]; out[o + 4] = t[0]; out[o + 5] = t[1]; out[o + 6] = t[2]; out[o + 7] = sc[0]; out[o + 8] = sc[1]; out[o + 9] = sc[2]; });
    return out;
  }
  function chainReads(chain, snap) {
    if (snap.length !== chain.length * 10) return false;
    for (let k = 0; k < chain.length; k++) {
      const c = chain[k], q = c.localRotation, t = c.localPosition, sc = c.localScale, o = k * 10;
      if (snap[o] !== q[0] || snap[o + 1] !== q[1] || snap[o + 2] !== q[2] || snap[o + 3] !== q[3] || snap[o + 4] !== t[0] || snap[o + 5] !== t[1]
        || snap[o + 6] !== t[2] || snap[o + 7] !== sc[0] || snap[o + 8] !== sc[1] || snap[o + 9] !== sc[2]) return false;
    }
    return true;
  }
  // Exact compares, no tolerance: a moved part leaves the batch until it is still for STILL_FRAMES again.
  function stillBatch(boat, still) {
    let st = stills.get(boat);
    if (!st) { st = { parts: new Map(), members: [], nodes: new Set(), mesh: null }; stills.set(boat, st); }
    const calm = [];
    for (const c of still) {
      let rec = st.parts.get(c.node);
      if (!rec) { rec = { snap: chainSnap(c.chain), calm: 0 }; st.parts.set(c.node, rec); }
      else if (chainReads(c.chain, rec.snap)) rec.calm++;
      else { rec.snap = chainSnap(c.chain); rec.calm = 0; }
      if (rec.calm >= STILL_FRAMES) calm.push(c);
    }
    let same = !!st.mesh && calm.length === st.members.length;
    for (let k = 0; same && k < calm.length; k++) same = calm[k].node === st.members[k].node && calm[k].key === st.members[k].key;
    if (same) return st;
    if (st.mesh) { renderer?.destroyMesh?.(st.mesh); st.mesh = null; }
    st.members = []; st.nodes = new Set();
    if (calm.length < STILL_MIN || !renderer?.createMesh) return null;
    const builder = new StaticBatchBuilder();
    for (const c of calm) {
      const model = rendererModel(models.geometry(c.mesh), c.slots);
      if (!model) continue;
      let rel = identity();
      for (const node of c.chain) rel = multiply(rel, mat4FromQuatPosScale(node.localRotation, node.localPosition, node.localScale, _local));
      builder.add(model, rel, (a, rec) => `${a}_${rec}`);
      st.members.push({ node: c.node, key: c.key });
      st.nodes.add(c.node);
    }
    const merged = st.members.length >= STILL_MIN ? builder.finish() : null;
    if (!merged) { st.members = []; st.nodes = new Set(); return null; }
    st.mesh = renderer.createMesh(merged);
    return st;
  }

  function lights(eye = null) {
    const out = [];
    for (const boat of drawn()) {
      if ((boat.fade ?? 1) < FADE_FLATS) continue;
      for (const l of boat.Lights) {
        if (!l.enabled || !l.node.activeInHierarchy) continue;
        const p = l.node.position;
        out.push({ x: p[0], y: p[1], z: p[2], range: l.range, color: [l.color[0] * l.intensity, l.color[1] * l.intensity, l.color[2] * l.intensity], _d: eye ? Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) : 0, _src: l });
      }
    }
    out.sort((a, b) => a._d - b._d);
    return out.slice(0, CSA_LIGHTS_MAX).map(({ _d, _src, ...l }) => adoptLight(l, _src));
  }

  function offsetAll(offset) {
    for (const boat of boats) {
      const p = boat.GameObject.localPosition;
      boat.GameObject.localPosition = [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
      walks.delete(boat);
    }
  }
  function destroyAll() { for (const b of [...boats, ...peerBoats, ...seaBoats]) remove(b); }

  const decks = new Map();
  // Parts under a DoorTrigger open and shut, so the deck keeps them as walls, never as floor.
  const opens = (node) => !!node?.children?.some((k) => k.name === 'DoorTrigger');
  function deckOf(hull, variant = 0) {
    if (!models) return null;
    // Rigs carry no colliders, so one deck per hull serves every variant; `variant` is never the key.
    if (decks.has(hull)) return decks.get(hull);
    const probe = new Boat(hull, 0);
    spawnBoat(probe, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    const meshes = [];
    const frame = invertAffine(probe.MeshObject.worldMatrix());
    for (const { node, collider: c, world } of colliderPoses(probe.GameObject)) {
      if (c.m_IsTrigger || c.m_Enabled === false) continue;
      const m = frame ? multiply(frame, world, new Float32Array(16)) : world;
      const cpu = c.classicModel != null ? pipeline?.cpuModels?.get(c.classicModel) : null;
      const g = c.type === 'BoxCollider' ? boxColliderTriangles(c) : c.classicModel != null ? (cpu?.positions && cpu.indices ? cpu : null)
        : c.m_Mesh?.mesh ? models.geometry(c.m_Mesh.mesh) : c.m_Mesh?.builtin ? BUILTIN_COLLIDER_MESHES[c.m_Mesh.builtin] : null;
      if (!g) continue;
      const p = g.positions, out = new Float64Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
        out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      meshes.push({ positions: out, indices: g.indices, moves: opens(node) });
    }
    const b = hullBuild(hull);
    const deck = buildDeck(meshes, { minX: -b.halfWidth - 1, maxX: b.halfWidth + 1, minZ: b.aftZ - 1, maxZ: b.bowZ + 1 });
    decks.set(hull, deck);
    return deck;
  }

  function hullSurface(hull) {
    if (!models) return null;
    const probe = new Boat(hull, 0);
    spawnBoat(probe, { models, player: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }), billboardSize: billboardSizeOf, modelBounds: modelBoundsOf });
    const frame = invertAffine(probe.MeshObject.worldMatrix());
    const out = [];
    const stack = [probe.MeshObject];
    while (stack.length) {
      const n = stack.pop();
      if (n === probe.FlagObject || n.activeSelf === false) continue;
      for (const c of n.children) stack.push(c);
      const mr = n.getComponent?.('MeshRenderer'), mf = n.getComponent?.('MeshFilter');
      if (!mr || mr.m_Enabled === false || mr.materials?.[0]?.billboard || mf?.baked) continue;
      const cpu = mr.classicModel != null ? pipeline?.cpuModels?.get(mr.classicModel) : null;
      const g = mr.classicModel != null ? (cpu?.positions && cpu.indices ? cpu : null) : mf?.m_Mesh?.mesh ? models.geometry(mf.m_Mesh.mesh) : null;
      if (!g?.positions || !g.indices) continue;
      const m = frame ? multiply(frame, n.worldMatrix(), new Float32Array(16)) : n.worldMatrix();
      const p = g.positions, pos = new Float64Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
        pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      out.push({ positions: pos, indices: g.indices, name: n.name ?? '' });
    }
    return out;
  }

  return {
    hullSurface,
    ensureModels, spawn, spawnNow, preload, ready: () => preloaded,
    preloadSoon: () => afterFirstFrame(() => { void preload(); }), remove, setVariant, frame, batches, people, draw, lights, offsetAll, destroyAll,
    deckOf,
    hullRig,
    portrait,
    spawnPeerNow, spawnSeaNow,
    lifeEye: () => _lifeEye,
    walkOf: walkMade,
    stillOf: (boat) => { const st = stills.get(boat); return st?.mesh ? { nodes: st.nodes, mesh: st.mesh } : null; },
    get boats() { return boats; },
    get peerBoats() { return peerBoats; },
    get seaBoats() { return seaBoats; },
    get models() { return models; },
    stat: () => boats.map((b) => ({ hull: b.hull, variant: b.variant, position: b.GameObject.position.map((v) => +v.toFixed(2)), meshes: [...meshes.values()].filter(Boolean).length, bakes: [...bakes.values()].filter((k) => k.gpu).length, flats: flats.size, lights: b.Lights.filter((l) => l.enabled).length })),
  };
}

export function boatRootMatrix(position, yawRadians) {
  return mat4FromQuatPosScale([0, Math.sin(yawRadians / 2), 0, Math.cos(yawRadians / 2)], position, [1, 1, 1]);
}
