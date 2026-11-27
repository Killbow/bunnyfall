// @ts-check
import { riteLocalOf, riteFaithfulOf, riteStands, riteWindow, riteRosterFell, RITE_REACH_M, RITE_CAREERS, RITE_FAITHFUL_MAX, RITE_SUMMONER_CAREER, RITE_SUMMONER_HEALTH, RITE_WORD_MS } from '../net/gateRite.js';
import { gateSpotLocal } from '../net/gateLaw.js';
import { worldRoom, GATE_TOP_MAX } from '../net/wire.js';
import { riteSiteId } from '../world/wodShared.js';
import { buildRiteModel, riteLayout, RITE_BRAZIER_H, RITE_BRAZIER_R, RITE_SIGIL_R, RITE_ALTAR } from '../world/riteModel.js';
import { gateArt, riteArt, GATE_ARCHIVE } from '../world/gateArt.js';
import { RiteSmokeRenderer, RITE_SMOKE_PROGRAMS, SMOKE_FADE_MIN } from '../render/riteSmoke.js';
import { compiledPass } from '../render/glProgram.js';
import { FlatAnim } from '../render/flatAnimation.js';
import { GLOBAL_SCALE } from '../player/activate.js';
import { FIRE_FLAT, TENT_MODEL, FIRE_LIGHT_RANGE } from '../systems/survival/camp.js';
import { riteChestItems, riteChestOpened, markRiteChest, riteMemory, riteSeen } from './riteChest.js';
import { trs } from '../world/mat4.js';

const listOf = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const byWords = (by, n) => {
  const names = (Array.isArray(by) ? by : []).filter((x) => typeof x === 'string' && x).slice(0, GATE_TOP_MAX);
  const others = Number.isSafeInteger(n) ? Math.max(0, n - names.length) : 0;
  return names.length ? `, by ${listOf([...names, ...(others ? [`${others} other${others === 1 ? '' : 's'}`] : [])])}` : '';
};

export const RITE_TEXT = Object.freeze({
  broken: ({ near, by = [], n = 0 }) => `The faithful's rite is broken near ${near}${byWords(by, n)}.`,
  pass: 'The faithful pass into the breach.',
  sealed: 'Sealed by the faithful\'s rite.',
  chest: 'The Faithful\'s Chest',
  sealedSub: 'Sealed',
  openedSub: 'Opened',
  summoner: 'the Summoner',
  faithful: 'Dagon\'s Faithful',
  mark: (n) => (n === 1 ? 'Dagon\'s Faithful' : `Dagon's Faithful, ${n}`),
  markAsk: (n) => (n === 1 ? 'Dagon\'s Faithful' : `Dagon's Faithful (${n})`),
});

export const RITE_SPRING_M = 100;
// Five meters inside the relay's `RITE_REACH_M`, so a pose one frame behind the player is never refused at the
// edge.
export const RITE_SAY_REACH_M = RITE_REACH_M - 5;
// A changed message is sent again after this delay because the relay's rate bucket can drop the first one.
export const RITE_RESAY_MS = 1000;
export const RITE_SIGHT_M = 12;
export const RITE_ALERT_M = 30;
// Five full enemy frames from the owner (`FOES_FULL_MS` in `net/wire.js`); keep it above that period or live
// faithful look orphaned.
export const RITE_ORPHAN_MS = 10_000;
export const RITE_RESTAND_MS = 5000;
export const RITE_TEND_M = 200;
export const RITE_CHEST_SEED_M = 40;
export const RITE_LIGHT_REACH_M = 70;
export const RITE_GLOW_RANGE = RITE_BRAZIER_R + 6;
export const RITE_SMOKE_IN_MS = 8000;
export const RITE_SMOKE_OUT_MS = 30000;
export const RITE_GROUND_EVERY = 15;
export const RITE_GROUND_TOL = 0.01;
export const RITE_BARE_R = RITE_BRAZIER_R + 1;
export const RITE_BUCKET = 'wb:rite';
// Past this distance the sigil, a few centimeters above the ground, z-fights with the land, so it is not drawn.
export const RITE_SIGIL_DRAW_M = 250;
export const RITE_FLAME_SCALE = 0.8;
export const RITE_FLAME_PHASES = 3;
const BROKEN_KEPT = 8;

const NONE = Object.freeze([]);
const circleKey = (d, px, py) => `${d}:${px},${py}`;
function groundSamples(L) {
  const pts = [[0, 0], ...L.braziers, [L.casket.x, L.casket.z], ...L.tents.map((t) => [t.x, t.z]), L.fire];
  for (let i = 0; i < 12; i++) pts.push([Math.sin((i / 12) * 2 * Math.PI) * RITE_SIGIL_R, Math.cos((i / 12) * 2 * Math.PI) * RITE_SIGIL_R]);
  for (let i = 0; i < 6; i++) pts.push([Math.sin(((i + 0.5) / 6) * 2 * Math.PI) * RITE_SIGIL_R * 0.5, Math.cos(((i + 0.5) / 6) * 2 * Math.PI) * RITE_SIGIL_R * 0.5]);
  return Float64Array.from(pts.flat());
}

/** @param {{ renderer?: any, gl?: WebGL2RenderingContext|null, meshes?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, collider?: (() => any)|null, now: () => number, omen?: () => any, fellAt?: (day: number) => (number|null), pixelTranslation: (px: number, py: number, out?: number[]) => number[], groundAt?: (x: number, z: number) => number, coarseGround?: ((px: number, py: number, x: number, z: number) => number)|null, feet?: () => number[]|null, online?: () => boolean, onBare?: (x0: number, z0: number, x1: number, z1: number) => void, foes?: { spawn: (career: number, xz: number[], o: { yaw: number, site: string, transient: boolean }) => Promise<any>, list: () => any[], drop: (site: string) => void, remove: (foe: any) => void, reclaim?: (site: string) => void, campId: () => number }|null, peerSprang?: (site: string) => boolean, peerHeldAgo?: (site: string) => number, forgetPeer?: (site: string) => void, sprang?: (site: string) => void, unsprang?: (site: string) => void, struckAt?: (foe: any) => (number|null), send?: (word: any, cell: string) => boolean, say?: (text: string) => void, sayNear?: (text: string) => void, loot?: { seed: (items: any[], feet: number[], pixelKey: string) => any, keyOf?: (pile: any) => string }|null, level?: () => number, rolls?: () => number, }} deps */
export function createRiteHost({
  renderer = null, gl = null, meshes = null, getTexture = null, uploadRecordFrame = null, collider = null,
  now, omen = () => null, fellAt = () => null, pixelTranslation, groundAt = () => NaN, coarseGround = null, feet = () => null, online = () => false, onBare = () => {},
  foes = null, peerSprang = () => false, peerHeldAgo = () => 0, forgetPeer = () => {}, sprang = () => {}, unsprang = () => {}, struckAt = () => null,
  send = () => false, say = () => {}, sayNear = () => {}, loot = null, level = () => 1, rolls = Math.random,
}) {
  let C = null;
  let model = null, sigilModel = null, modelGen = -1, modelFailedGen = -1, mesh = null, sigilMesh = null, meshGen = -1, meshFailedGen = -1, artUp = false;
  let tent = null, tentTried = false;
  let fire = null, fireTried = false, flamesGen = -1, flamesList = NONE, anim = null;
  let smokePass = null;
  const smokeOf = gl ? compiledPass(gl, RITE_SMOKE_PROGRAMS, () => new RiteSmokeRenderer(gl), (e) => console.warn('[rite] the smoke would not build', e?.message ?? e)) : null;
  let colliderGen = -1;
  let madeAt = null, mats = null, target = null;
  const lightPts = Object.freeze([{ x: 0, y: 0, z: 0, range: RITE_GLOW_RANGE }, { x: 0, y: 0, z: 0, range: FIRE_LIGHT_RANGE }]);
  const smoke = { origin: null, fade: 0 }, smokeList = Object.freeze([smoke]);
  const bare = { x: 0, z: 0, r: RITE_BARE_R, key: '' };
  const brokenWords = new Map();
  const clearedWords = new Map();
  let qDay = NaN, qPx = NaN, qPy = NaN, qKey = '';
  const keyFor = (d, px, py) => { if (d !== qDay || px !== qPx || py !== qPy) { qDay = d; qPx = px; qPy = py; qKey = circleKey(d, px, py); } return qKey; };
  let frameN = 0;
  const T3 = [0, 0, 0];

  function enter(s) {
    leave();
    const [e, n] = riteLocalOf(s.day), [gx, gz] = gateSpotLocal(s.day);
    const facing = Math.atan2(gx - e, gz - n), layout = riteLayout(facing), samples = groundSamples(layout);
    C = {
      day: s.day, px: s.px, py: s.py, near: s.near ?? null, site: riteSiteId(s.px, s.py, s.day), cell: worldRoom(s.px, s.py),
      key: circleKey(s.day, s.px, s.py), win: riteWindow(s.day),
      local: [e, n], facing, layout, heart: [0, 0, 0], known: false,
      samples, sig: new Float64Array(samples.length / 2).fill(NaN), sampledAt: -Infinity, gen: 0, groundGen: 0,
      bared: false, spawned: false, standAt: -Infinity, pending: 0, retry: [], camp: null, ownLive: 0, pupLive: 0, counted: new Set(),
      passed: false, wordAt: -Infinity, saidKey: -1, resayAt: Infinity,
      pile: null, snap: null,
    };
  }
  function leave() {
    if (C) { foes?.drop(C.site); unsprang(C.site); }
    if (C?.bared) { placeHeart(); bareSaid(); }
    dropFlames();
    if (mesh) { renderer?.destroyMesh?.(mesh); mesh = null; }
    if (sigilMesh) { renderer?.destroyMesh?.(sigilMesh); sigilMesh = null; }
    if (colliderGen !== -1) { collider?.()?.removeBucket?.(RITE_BUCKET); colliderGen = -1; }
    model = null; sigilModel = null; modelGen = modelFailedGen = meshGen = meshFailedGen = flamesGen = -1;
    C = null; madeAt = null; mats = null; target = null;
  }
  function placeHeart() {
    const t = pixelTranslation(C.px, C.py, T3);
    const x = t[0] + C.local[0], z = t[2] + C.local[1];
    let y = groundAt(x, z);
    C.known = Number.isFinite(y);
    if (!C.known) y = coarseGround ? coarseGround(C.px, C.py, x, z) : NaN;
    C.heart[0] = x; C.heart[1] = Number.isFinite(y) ? y : t[1]; C.heart[2] = z;
  }
  const bareSaid = () => onBare(C.heart[0] - RITE_BARE_R, C.heart[2] - RITE_BARE_R, C.heart[0] + RITE_BARE_R, C.heart[2] + RITE_BARE_R);
  const heightAt = (lx, lz) => { const y = groundAt(C.heart[0] + lx, C.heart[2] + lz); return Number.isFinite(y) ? y - C.heart[1] : 0; };
  const sceneAt = (lx, lz) => [C.heart[0] + lx, C.heart[1] + heightAt(lx, lz), C.heart[2] + lz];
  function made() {
    const h = C.heart;
    const moved = !madeAt || madeAt[0] !== h[0] || madeAt[1] !== h[1] || madeAt[2] !== h[2];
    let ground = false;
    if (moved || frameN - C.sampledAt >= RITE_GROUND_EVERY) {
      C.sampledAt = frameN;
      const s = C.samples, sig = C.sig;
      for (let i = 0; i < sig.length; i++) {
        const v = heightAt(s[2 * i], s[2 * i + 1]);
        if (!(Math.abs(v - sig[i]) <= RITE_GROUND_TOL)) { ground = true; sig[i] = v; }
      }
    }
    if (!moved && !ground) return;
    if (ground) C.groundGen++;
    C.gen++;
    madeAt = [h[0], h[1], h[2]];
    mats = { stone: trs(h[0], h[1], h[2], 0, 0, 0), tents: C.layout.tents.map((tt) => { const p = sceneAt(tt.x, tt.z); return trs(p[0], p[1], p[2], 0, (tt.yaw * 180) / Math.PI, 0); }) };
    const c = C.layout.casket, p = sceneAt(c.x, c.z);
    target = [{ key: `rite:${C.day}`, aabb: { min: [p[0] - 0.6, p[1], p[2] - 0.6], max: [p[0] + 0.6, p[1] + 0.8, p[2] + 0.6] }, distance: 3.2, reach: 3.2 }];
    const fp = sceneAt(C.layout.fire[0], C.layout.fire[1]);
    Object.assign(lightPts[0], { x: h[0], y: h[1] + RITE_BRAZIER_H + 0.4, z: h[2] });
    Object.assign(lightPts[1], { x: fp[0], y: fp[1] + 0.6, z: fp[2] });
  }

  const brokenHere = () => (C ? brokenWords.get(C.key) : undefined);
  const clearedHere = () => !!C && clearedWords.has(C.key);
  const ownSite = (f) => !!f && f.site === C.site;

  function survivors() {
    if (clearedHere()) return [];
    const mem = riteMemory(C.day), left = { ...mem.slain }, out = [];
    riteFaithfulOf(C.day).forEach((m, i) => {
      if (m.summoner) { if (!mem.fell && !brokenHere()) out.push([m, i]); return; }
      if (left[m.career] > 0) { left[m.career]--; return; }
      out.push([m, i]);
    });
    return out;
  }
  function riteFoe(f, summoner, career, camp, fresh) {
    f.riteRole = summoner ? 'summoner' : 'faithful'; f.riteCareer = career;
    f.campId = camp; f.campAlertRadius = RITE_ALERT_M;
    if (f.entity) f.entity.campId = camp;
    if (f.ai && !f.ai.target) f.ai.sightRadius = RITE_SIGHT_M;
    if (fresh && summoner && f.entity) { f.entity.maxHealth = Math.max(1, Math.round((f.entity.maxHealth ?? 1) * RITE_SUMMONER_HEALTH)); f.entity.health = f.entity.maxHealth; f.entity.healthMult = (f.entity.healthMult ?? 1) * RITE_SUMMONER_HEALTH; }
  }
  function stand(t, todo = survivors()) {
    C.standAt = t;
    if (!todo.length) { C.spawned = true; return; }
    foes.reclaim?.(C.site);
    sprang(C.site);
    const c = C, site = C.site, camp = C.camp ?? foes.campId(), ring = C.layout.ring(riteFaithfulOf(C.day).length - 1);
    c.camp = camp;
    for (const [m, i] of todo) {
      const [x, z, yaw] = m.summoner ? c.layout.summoner : ring[i - 1];
      c.pending++;
      const landed = (f) => {
        c.pending--;
        if (f && (C !== c || now() >= c.win.to)) { foes.remove(f); return; }
        // Keep only failed slots. Retrying the whole ring would duplicate the faithful that did spawn.
        if (!f && C === c && now() < c.win.to) c.retry.push([m, i]);
        if (f) { c.spawned = true; riteFoe(f, m.summoner, m.career, camp, true); if (f.entity && m.summoner) f.entity.properName = RITE_TEXT.summoner; }
        if (!c.pending && !c.spawned && C === c) unsprang(site);
      };
      foes.spawn(m.career, [c.heart[0] + x, c.heart[2] + z], { yaw, site, transient: true }).then(landed, () => landed(null));
    }
  }
  // Puppets are keyed by owner and sequence number, so a copy shown again after a handover is not counted as a
  // second death.
  function counted(f, career, summoner, holds, mem) {
    const k = f.puppet ? `${f.puppet}:${f.seq}` : f;
    if (C.counted.has(k)) return;
    C.counted.add(k);
    if (summoner) { if (holds) mem.fell = 1; return; }
    if (RITE_CAREERS.includes(career)) mem.slain[career] = Math.min(RITE_FAITHFUL_MAX, (mem.slain[career] ?? 0) + 1);
  }
  function tend(holds) {
    const mem = riteMemory(C.day), list = foes.list();
    let own = 0, pup = 0, waker = null;
    for (const f of list) {
      if (!ownSite(f)) continue;
      const career = f.riteCareer ?? f.mobileType;
      const summoner = f.riteRole ? f.riteRole === 'summoner' : career === RITE_SUMMONER_CAREER;
      const e = f.entity;
      if (e && (f.riteRole || summoner || RITE_CAREERS.includes(career))) {
        const name = summoner ? RITE_TEXT.summoner : RITE_TEXT.faithful;
        if (e.name !== name) e.name = name;
        if (summoner && e.properName !== RITE_TEXT.summoner) e.properName = RITE_TEXT.summoner;
      }
      if (!mem.struck && struckAt(f) != null) mem.struck = 1;
      // A dead enemy with no corpse was removed or walked away, so it is not a fall.
      if (f.dead) { if (f.corpse) counted(f, career, summoner, holds, mem); continue; }
      if (f.puppet) { pup++; continue; }
      own++;
      if (!f.riteRole) riteFoe(f, summoner, career, C.camp ?? (C.camp = foes.campId()), false);
      if (!waker && f.ai?.target) waker = f;
    }
    // Wake every faithful once any has a target: the camp wake in `exteriorFoes.js` fires only on sight, so a blow
    // from an unseen striker wakes just one.
    if (waker) for (const g of list) if (ownSite(g) && !g.puppet && !g.dead && g.ai && !g.ai.target) g.ai.target = waker.ai.target;
    C.ownLive = own; C.pupLive = pup;
    if (own) C.spawned = true;
  }
  function maybeStand(t) {
    // Peer ownership or the all-fallen message from the hub clears the retry list, because retries bypass
    // `survivors()` and would spawn beside peer copies.
    if (C.pupLive || peerSprang(C.site) || clearedHere()) C.retry.length = 0;
    if (C.pending || C.pupLive || t - C.standAt < RITE_RESTAND_MS) return;
    if (C.retry.length && !peerSprang(C.site)) {
      const mem = riteMemory(C.day);
      const todo = C.retry.filter(([m]) => !m.summoner || (!mem.fell && !brokenHere()));
      C.retry = [];
      stand(t, todo);
      return;
    }
    if (C.ownLive) return;
    if (peerSprang(C.site)) {
      if (!(peerHeldAgo(C.site) >= RITE_ORPHAN_MS)) return;
      forgetPeer(C.site);
      C.spawned = false;
    }
    if (!C.spawned) stand(t);
  }
  function word(t) {
    // The hub's broken message counts as seeing the Summoner fall: he never respawns for a character who missed it, so
    // the roster could not complete otherwise.
    const mem = riteMemory(C.day), s = mem.struck ? 1 : 0, f = mem.fell ? 1 : 0, c = riteRosterFell(C.day, mem.slain, mem.fell || brokenHere() ? 1 : 0) ? 1 : 0, k = s * 4 + f * 2 + c;
    const changed = k !== C.saidKey;
    if (!changed && t - C.wordAt < RITE_WORD_MS && t < C.resayAt) return;
    if (!send({ d: C.day, px: C.px, py: C.py, s, f, c }, C.cell)) return;
    C.resayAt = changed && k > 0 ? t + RITE_RESAY_MS : Infinity;
    C.wordAt = t; C.saidKey = k;
  }
  function pass(d) {
    C.passed = true;
    let standing = 0;
    for (const f of foes?.list() ?? NONE) if (ownSite(f) && !f.dead) standing++;
    foes?.drop(C.site);
    const mem = riteMemory(C.day);
    if (standing && !mem.passed && d <= RITE_SPRING_M) { mem.passed = 1; sayNear(RITE_TEXT.pass); }
  }
  function untouched(p) {
    const items = p.items ?? NONE, snap = C.snap ?? NONE;
    if (items.length !== snap.length) return false;
    return snap.every(([it, n]) => items.includes(it) && (it.stackCount ?? 1) === n);
  }
  function chest(d) {
    if (C.pile) {
      if (!riteChestOpened(C.day) && !untouched(C.pile)) markRiteChest(C.day);
      if (C.pile.dead || !C.pile.items?.length) { C.pile = null; C.snap = null; }
      return;
    }
    if (!loot || !C.known || !brokenHere() || riteChestOpened(C.day) || d > RITE_CHEST_SEED_M) return;
    const c = C.layout.casket, p = sceneAt(c.x, c.z);
    C.pile = loot.seed(riteChestItems(level(), rolls), [p[0], p[1] + 0.6, p[2]], `${C.px},${C.py}`);
    C.snap = (C.pile?.items ?? NONE).map((it) => [it, it.stackCount ?? 1]);
  }

  function ensureModel() {
    if (modelGen === C.groundGen || modelFailedGen === C.groundGen) return;
    try {
      model = buildRiteModel(C.facing, heightAt, { sigil: false });
      sigilModel = buildRiteModel(C.facing, heightAt, { stone: false });
      modelGen = C.groundGen;
    } catch (e) { console.warn('[rite] the circle would not build', e?.message ?? e); modelFailedGen = C.groundGen; }
  }
  function ensureMesh() {
    if (!model || !renderer?.createMesh || meshGen === modelGen || meshFailedGen === modelGen) return;
    try {
      if (!artUp) {
        // `white: true` keeps the fire in its own texture color instead of the window emission tint.
        for (const [rec, art] of [...gateArt(), ...riteArt()]) { renderer.uploadTexture?.(GATE_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(GATE_ARCHIVE, rec, art.emission, { white: true }); }
        artUp = true;
      }
      const next = renderer.createMesh(model), nextSigil = renderer.createMesh(sigilModel);
      if (mesh) renderer.destroyMesh?.(mesh);
      if (sigilMesh) renderer.destroyMesh?.(sigilMesh);
      mesh = next; sigilMesh = nextSigil; meshGen = modelGen;
    } catch (e) { console.warn('[rite] the circle would not build', e?.message ?? e); meshFailedGen = modelGen; }
  }
  function standCollider() {
    const col = collider?.();
    if (!col?.addMesh || !model || colliderGen === C.gen) return;
    col.removeBucket?.(RITE_BUCKET);
    col.addMesh(RITE_BUCKET, model.positions, model.indices, mats.stone);
    colliderGen = C.gen;
  }
  function ensureTent() {
    if (tent || tentTried || !meshes?.getGpuMesh) return;
    tentTried = true;
    Promise.resolve(meshes.getGpuMesh(TENT_MODEL)).then((g) => { tent = g ?? null; }).catch(() => {});
  }
  function ensureFire() {
    if (fire || fireTried || !getTexture) return;
    fireTried = true;
    Promise.resolve(getTexture(FIRE_FLAT.archive)).then((t) => {
      if (!t) return;
      const count = t.getFrameCount?.(FIRE_FLAT.record) ?? 1;
      for (let i = 0; i < count; i++) uploadRecordFrame?.(FIRE_FLAT.archive, FIRE_FLAT.record, i);
      const size = t.getSize(FIRE_FLAT.record);
      const w = size.width * GLOBAL_SCALE, h = size.height * GLOBAL_SCALE;
      fire = { count, size: { w: w * RITE_FLAME_SCALE, h: h * RITE_FLAME_SCALE }, camp: { w, h } };
    }).catch(() => {});
  }
  function mountFlames() {
    if (!fire || !renderer?.createBillboardBatch || flamesGen === C.gen) return;
    dropFlames();
    const top = (x, z, up) => { const p = sceneAt(x, z); return [p[0], p[1] + up, p[2]]; };
    const ring = C.layout.braziers.map(([x, z]) => top(x, z, RITE_BRAZIER_H));
    const sets = [
      [fire.size, [...ring.filter((_, i) => i % 2 === 0), top(0, 0, RITE_ALTAR.h)]],
      [fire.size, ring.filter((_, i) => i % 2 === 1)],
      [fire.camp, [top(C.layout.fire[0], C.layout.fire[1], 0)]],
    ];
    flamesList = Object.freeze(sets.map(([size, pos]) => { const b = renderer.createBillboardBatch(FIRE_FLAT.archive, FIRE_FLAT.record, size, pos); b.frame = 0; return b; }));
    anim = fire.count > 1 ? new FlatAnim(FIRE_FLAT.archive, fire.count, false) : null;
    flamesGen = C.gen;
  }
  function dropFlames() {
    for (const b of flamesList) renderer?.destroyBillboardBatch?.(b);
    flamesList = NONE;
  }
  function smokeFade(t = now()) {
    if (!C) return 0;
    const w = C.win, v = Math.min(1, Math.max(0, (t - w.from) / RITE_SMOKE_IN_MS), Math.max(0, 1 - (t - w.to) / RITE_SMOKE_OUT_MS));
    return v > SMOKE_FADE_MIN ? v : 0;
  }
  function smokes() {
    const fade = smokeFade();
    if (!(fade > 0)) return NONE;
    smoke.origin = C.heart; smoke.fade = fade;
    return smokeList;
  }

  return {
    // Call before the renderer's frame, since this builds the smoke pass that `drawSmoke` uses.
    frame() {
      frameN++;
      const t = now();
      const c = omen?.() ?? null, s = c?.site ?? null;
      if (!s || !Number.isSafeInteger(s.day) || !riteStands(s.day, t, fellAt(s.day))) { if (C) leave(); return null; }
      if (!C || C.day !== s.day || C.px !== s.px || C.py !== s.py) enter(s);
      if (s.near && !C.near) C.near = s.near;
      placeHeart();
      if (C.known && !C.bared) { C.bared = true; bareSaid(); }
      const f = feet(), d = f ? Math.hypot(f[0] - C.heart[0], f[2] - C.heart[2]) : Infinity;
      const holds = t >= C.win.from && t < C.win.to, on = online();
      if (foes && d <= RITE_TEND_M) tend(holds);
      if (foes && C.ownLive && clearedHere()) { foes.drop(C.site); C.ownLive = 0; }
      if (on && holds && foes && C.known && d <= RITE_SPRING_M) maybeStand(t);
      const mem = riteMemory(C.day), b = brokenHere();
      if (b && holds && C.near && !mem.saidBroken) { mem.saidBroken = 1; say(RITE_TEXT.broken({ near: C.near, by: b.by, n: b.n })); }
      if (!holds && t >= C.win.to && !C.passed) pass(d);
      if (on && holds && d <= RITE_SAY_REACH_M) word(t);
      chest(d);
      if (C.known) { made(); ensureModel(); ensureMesh(); standCollider(); ensureTent(); ensureFire(); mountFlames(); }
      if (!smokePass && smokeOf && smokeFade(t) > 0) smokePass = smokeOf();
      return C;
    },
    tick(dt) {
      if (!anim || !flamesList.length) return;
      const f = anim.tick(dt);
      for (let i = 0; i < flamesList.length; i++) flamesList[i].frame = (f + Math.round((i * fire.count) / RITE_FLAME_PHASES)) % fire.count;
    },
    onBroken(w) {
      if (!w || !Number.isSafeInteger(w.d) || !Number.isSafeInteger(w.px) || !Number.isSafeInteger(w.py)) return;
      if (w.k === 'cl') {
        const k = circleKey(w.d, w.px, w.py);
        clearedWords.delete(k); clearedWords.set(k, Number.isSafeInteger(w.at) && w.at > 0 ? w.at : 0);
        if (clearedWords.size > BROKEN_KEPT) clearedWords.delete(clearedWords.keys().next().value);
        return;
      }
      const k = circleKey(w.d, w.px, w.py), by = Array.isArray(w.by) ? w.by.filter((x) => typeof x === 'string' && x) : [];
      brokenWords.delete(k);
      brokenWords.set(k, { by, n: Number.isSafeInteger(w.n) ? Math.max(w.n, by.length) : by.length });
      if (brokenWords.size > BROKEN_KEPT) brokenWords.delete(brokenWords.keys().next().value);
    },
    isBroken: (day, px, py) => brokenWords.has(circleKey(day, px, py)),
    // Pass `ownEyes` false on a relay that sends the cleared word, so only the relay decides and every screen
    // agrees about the cage.
    isCleared(day, px, py, ownEyes = true) {
      const k = keyFor(day, px, py);
      if (clearedWords.has(k)) return true;
      if (!ownEyes) return false;
      const mem = riteSeen(day);
      return !!mem && riteRosterFell(day, mem.slain, mem.fell || brokenWords.has(k) ? 1 : 0);
    },
    clearedAt(day, px, py) { const at = clearedWords.get(keyFor(day, px, py)); return at > 0 ? at : NaN; },
    draw(r = renderer, texRemap = null, eye = null) {
      if (!C?.known || !r?.drawMesh) return 0;
      made();
      let n = 0;
      if (mesh) { r.drawMesh(mesh, mats.stone, texRemap); n++; }
      if (sigilMesh && (!eye || Math.hypot(eye[0] - C.heart[0], eye[1] - C.heart[1], eye[2] - C.heart[2]) <= RITE_SIGIL_DRAW_M)) { r.drawMesh(sigilMesh, mats.stone, texRemap); n++; }
      if (tent) for (const m of mats.tents) { r.drawMesh(tent, m, texRemap); n++; }
      return n;
    },
    batches: () => (C?.known ? flamesList : NONE),
    lights() {
      if (!C?.known) return NONE;
      const f = feet();
      if (!f || Math.hypot(f[0] - C.heart[0], f[2] - C.heart[2]) > RITE_LIGHT_REACH_M) return NONE;
      made();
      return lightPts;
    },
    smokes,
    smoking: () => !!smokePass && smokeFade() > 0,
    drawSmoke(proj, view, eye, seconds, fog = null) {
      const list = smokes();
      if (!smokePass || !list.length) return 0;
      smokePass.draw(list, proj, view, eye, seconds, fog);
      return smokePass.drawn;
    },
    targets() {
      if (!C?.known || C.pile) return NONE;
      made();
      return target;
    },
    hoverName(key) {
      if (typeof key !== 'string' || !C) return null;
      if (key.startsWith('rite:')) return { title: RITE_TEXT.chest, subs: !brokenHere() ? [RITE_TEXT.sealedSub] : riteChestOpened(C.day) ? [RITE_TEXT.openedSub] : [] };
      return C.pile && loot?.keyOf && key === loot.keyOf(C.pile) ? { title: RITE_TEXT.chest } : null;
    },
    activate(key) {
      if (typeof key !== 'string' || !key.startsWith('rite:') || !C) return false;
      if (!brokenHere()) sayNear(RITE_TEXT.sealed);
      return true;
    },
    clearing() {
      if (!C) return null;
      bare.x = C.heart[0]; bare.z = C.heart[2]; bare.key = C.key;
      return bare;
    },
    siteNow: () => C?.site ?? null,
    state: () => (C ? { day: C.day, site: C.site, heart: C.heart, known: C.known, spawned: C.spawned, pending: C.pending, own: C.ownLive, copies: C.pupLive, struck: !!riteMemory(C.day).struck, fell: !!riteMemory(C.day).fell, broken: !!brokenHere(), cleared: clearedHere(), passed: C.passed, pile: !!C.pile, mesh: !!mesh, sigil: !!sigilMesh, gen: C.gen, groundGen: C.groundGen } : null),
    destroyAll() { leave(); },
  };
}
