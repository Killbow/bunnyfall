// @ts-check
import { ATTACKS, COURTS, FLOOR, HOST, HOST_GONE, captiveSpent, wardTakes } from '../net/gateBrain.js';
import { captiveIndexOf, captiveNameOf } from '../net/gateLaw.js';
import { CAPTIVE_DAMES } from '../net/gateMods.js';
import { attackColor, bossFrame, knightAct, knightLookOf, WARD_COLOR } from '../world/gateBoss.js';
import { courtToDungeon } from '../world/gateArena.js';
import { TELEGRAPH_KIND, TELEGRAPH_STYLE, TELEGRAPH_POOL, TELEGRAPH_EDGE_SAFE } from '../render/gateTelegraph.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { t } from '../ui/textManager.js';

// Announcements older than this are skipped, so a player who arrives late hears no stale news; it matches
// `FED_LATE_MS` in `gateCourt.js`.
export const CAPTIVE_LATE_MS = 2000;
export const CAPTIVE_GONE_MS = 1500;
export const CAPTIVE_LIGHT_RANGE = 8;
export const CAPTIVE_LIGHT_Y = 1.4;
export const CAPTIVE_CHAIN_HALF_W = 0.3;
export const CAPTIVE_CHAIN_ALPHA = 0.55;
export const CAPTIVE_TEXT = Object.freeze({
  chained: (name) => t('gate.captive.chained', '{name} of the Covenant lies chained in the Pen. Cut down the gaolers!', { name }),
  felled: (who, n) => t('gate.captive.felled', '{who} cuts down a gaoler. {n, plural, one {# stands} other {# stand}}.', { who: who || t('gate.host.someone', 'A challenger'), n }),
  freed: (name) => t('gate.captive.freed', '{name} is free! The Covenant\'s ward stands over the court.', { name }),
  ward: (name) => t('gate.captive.ward', '{name} raises the Covenant\'s ward against Dagon\'s Reckoning!', { name }),
  spent: (name) => t('gate.captive.spent', 'Dagon\'s Reckoning breaks on the Covenant\'s ward. {name} goes back through the breach.', { name }),
});

export const CAPTIVE_AT = COURTS[FLOOR.pen];
export const CAPTIVE_YAW = Math.atan2(COURTS[FLOOR.first][0] - CAPTIVE_AT[0], COURTS[FLOOR.first][1] - CAPTIVE_AT[1]);
export function captiveShown(s, now) {
  const K = s?.cp;
  if (!K || !(K.at > 0) || s.fell || s.wrath != null) return false;
  const spent = captiveSpent(K, s.atk, now);
  return !spent || now < (K.s > 0 ? K.s : s.atk?.at ?? now) + CAPTIVE_GONE_MS;
}

/**
 * @param {any} s
 * @param {number} now
 * @param {any[]} [out]
 * @param {number} [max]
 */
export function captiveChains(s, now, out = [], max = 4) {
  out.length = 0;
  const K = s?.cp;
  if (!K || !(K.at > 0) || K.f > 0 || s.fell || s.wrath != null) return out;
  const color = attackColor(ATTACKS.reckon, null), seethe = (now % 60_000) / 1000;
  let slots = CHAIN_SLOTS.get(out);
  if (!slots) CHAIN_SLOTS.set(out, (slots = []));
  for (const a of s.lg?.ads ?? []) {
    if (out.length >= max) break;
    if (a.k !== HOST.gaoler) continue;
    const sh = (slots[out.length] ??= { kind: TELEGRAPH_KIND.lane, origin: [0, 0], yaw: 0, r: 0, halfArc: 0, body: 0, end: [CAPTIVE_AT[0], CAPTIVE_AT[1]], halfW: CAPTIVE_CHAIN_HALF_W,
      r0: 0, r1: 0, points: [], n: 0, t: 1, flash: 0, alpha: CAPTIVE_CHAIN_ALPHA, color, edge: color, court: FLOOR.pen, style: TELEGRAPH_STYLE.weight,
      since: 0, span: 1, after: -1, runS: 0, pool: TELEGRAPH_POOL.path });
    sh.origin[0] = a.x; sh.origin[1] = a.z; sh.color = color; sh.edge = color; sh.since = seethe;
    out.push(sh);
  }
  return out;
}
const CHAIN_SLOTS = new WeakMap();

/** @param {{ renderer?: any, getTexture?: any, uploadRecordFrame?: any, cam?: () => any, say?: (text: string) => void, burst?: (at: number[], t: number) => void }} deps */
export function createGateCaptive({ renderer = null, getTexture = null, uploadRecordFrame = null, cam = () => null, say = () => {}, burst = () => {} } = {}) {
  let day = null, chainedSaid = false, freedSaid = false, spentSaid = false, wardSaid = -1;
  const goneSeen = new Set();
  let look = null, body = null, loading = null, batch = null, shown = false;
  const _batches = [], _lights = [], _shapes = [];
  const _light = { x: 0, y: 0, z: 0, range: CAPTIVE_LIGHT_RANGE, color: [0, 0, 0] };

  function reset(d) {
    day = d; chainedSaid = false; freedSaid = false; spentSaid = false; wardSaid = -1;
    goneSeen.clear();
    if (batch) { renderer?.destroyBillboardBatch?.(batch); batch = null; }
    shown = false;
    // The host reads these lists every frame, and no court frame refills them after the player leaves, so they are
    // emptied here.
    _batches.length = 0; _lights.length = 0; _shapes.length = 0;
  }
  function loadBody(d) {
    const want = knightLookOf(!!CAPTIVE_DAMES[captiveIndexOf(d)]);
    if (look && look.archive !== want.archive) { body = null; loading = null; if (batch) { renderer?.destroyBillboardBatch?.(batch); batch = null; } }
    look = want;
    if (body || loading || !getTexture || !uploadRecordFrame || !renderer?.createBillboardBatch || !look.archive) return;
    const archive = look.archive;
    loading = Promise.resolve().then(() => getTexture(archive)).then((tex) => {
      if (look?.archive === archive) body = tex ? { tex, archive } : { failed: true };
    }, () => { body = { failed: true }; });
  }
  function drawBody(s, now) {
    loadBody(s.day);
    if (!body?.tex) { shown = false; return; }
    const act = /** @type {any} */ (knightAct(s.cp.f > 0, now)), at = courtToDungeon(CAPTIVE_AT[0], 0, CAPTIVE_AT[1]), eye = cam() ?? at;
    const fr = bossFrame(act, CAPTIVE_YAW, at, eye, (r) => body.tex.getFrameCount?.(r) ?? 1);
    const rkey = `${fr.record}#${fr.frame}`;
    if (!renderer.textures?.has?.(`${body.archive}_${rkey}`)) uploadRecordFrame(body.archive, fr.record, fr.frame);
    const sz = mobileBillboardSize(body.tex, fr.record);
    if (!batch) { batch = renderer.createBillboardBatch(body.archive, rkey, { w: sz.w, h: sz.h }, [[0, 0, 0]]); batch.origin = [0, 0, 0]; }
    shown = true;
    batch.record = rkey;
    batch.size = { w: fr.flip ? -sz.w : sz.w, h: sz.h };
    if (batch.bounds) batch.bounds[3] = Math.hypot(sz.w, sz.h) * 0.5;
    batch.origin[0] = at[0]; batch.origin[1] = at[1]; batch.origin[2] = at[2];
  }
  function words(s, now) {
    const K = s.cp, name = captiveNameOf(s.day), live = !s.fell && s.wrath == null;
    if (!chainedSaid && K.at > 0) { chainedSaid = true; if (live && now - K.at <= CAPTIVE_LATE_MS) say(CAPTIVE_TEXT.chained(name)); }
    let left = 0;
    for (const a of s.lg?.ads ?? []) if (a.k === HOST.gaoler) left++;
    const fresh = [];
    for (const g of s.lg?.gone ?? []) if (g.k === HOST.gaoler && g.w === HOST_GONE.slain && !goneSeen.has(`${g.i}@${g.at}`)) { goneSeen.add(`${g.i}@${g.at}`); fresh.push(g); }
    left += fresh.length;
    for (const g of fresh) { left--; if (live && left > 0 && now - g.at <= CAPTIVE_LATE_MS) say(CAPTIVE_TEXT.felled(g.n, left)); }
    if (!freedSaid && K.f > 0) {
      freedSaid = true;
      if (live && now - K.f <= CAPTIVE_LATE_MS) { say(CAPTIVE_TEXT.freed(name)); burst(courtToDungeon(CAPTIVE_AT[0], 1, CAPTIVE_AT[1]), K.f); }
    }
    if (wardTakes(K, s.atk) && wardSaid !== s.atk.i) { wardSaid = s.atk.i; if (live && now < s.atk.at) say(CAPTIVE_TEXT.ward(name)); }
    if (!spentSaid && captiveSpent(K, s.atk, now)) {
      spentSaid = true;
      const at = K.s > 0 ? K.s : s.atk?.at ?? now;
      if (live && now - at <= CAPTIVE_LATE_MS) { say(CAPTIVE_TEXT.spent(name)); burst(courtToDungeon(CAPTIVE_AT[0], 1, CAPTIVE_AT[1]), at); }
    }
  }

  return {
    /**
     * @param {any} s
     * @param {number} now
     */
    frame(s, now) {
      _batches.length = 0; _lights.length = 0; _shapes.length = 0;
      if (!s || s.day === null || !s.cp) { if (day !== null) reset(null); return; }
      if (s.day !== day) reset(s.day);
      words(s, now);
      if (!captiveShown(s, now)) { shown = false; return; }
      drawBody(s, now);
      if (shown && batch) _batches.push(batch);
      if (s.cp.f > 0) {
        const k = 0.85 + 0.2 * Math.sin(now / 220);
        const [x, y, z] = courtToDungeon(CAPTIVE_AT[0], CAPTIVE_LIGHT_Y, CAPTIVE_AT[1]);
        _light.x = x; _light.y = y; _light.z = z;
        _light.color[0] = WARD_COLOR[0] * k; _light.color[1] = WARD_COLOR[1] * k; _light.color[2] = WARD_COLOR[2] * k;
        _lights.push(_light);
      }
      captiveChains(s, now, _shapes);
    },
    dress(shape, s) {
      if (!shape || !wardTakes(s?.cp, s?.atk)) return shape;
      shape.color = WARD_COLOR; shape.edge = TELEGRAPH_EDGE_SAFE; shape.style = TELEGRAPH_STYLE.weight;
      return shape;
    },
    batches: () => _batches,
    lights: () => _lights,
    shapes: () => _shapes,
    state: () => ({ day, shown, chainedSaid, freedSaid, spentSaid, wardSaid }),
    leave() { reset(null); },
  };
}
