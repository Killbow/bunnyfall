// Draws the on-foot sprite in the armor actually worn, layered from the helmet, chest, and leg pieces.
import manifest from '../../vendor/layered-armor/manifest.json' with { type: 'json' };
import cloakManifest from '../../vendor/layered-armor/cloak/manifest.json' with { type: 'json' };
import { drawnPiece } from '../net/appearanceLaw.js';

export const LAYERED_ARCHIVE = Object.freeze({ male: 1700, female: 1701 });

export const OUTFIT_SLOTS = Object.freeze({ head: 12, top: 18, legs: 23 });

export const CLOAK_DEFAULT_DYE = 5;
export const CLOAK_SLOTS = Object.freeze(/** @type {number[]} */ (cloakManifest.slots));
const CLOAK_TEMPLATES = new Set(/** @type {number[]} */ (cloakManifest.templates));
export function cloakOfSlots(slots) {
  for (const s of CLOAK_SLOTS) {
    const it = slots?.[s];
    if (!it || !CLOAK_TEMPLATES.has(it.templateIndex)) continue;
    const dye = Number.isInteger(it.dye) ? it.dye : it.dyeColor;
    return Number.isInteger(dye) && dye >= 0 && dye <= 9 ? dye : CLOAK_DEFAULT_DYE;
  }
  return null;
}

const METALS = /** @type {string[]} */ (manifest.metals);
const PLATE_METAL = Object.freeze({
  0x0200: 'iron', 0x0201: 'steel', 0x0202: 'steel', 0x0203: 'steel', 0x0204: 'steel',
  0x0205: 'mithril', 0x0206: 'adamantium', 0x0207: 'ebony', 0x0208: 'orcish', 0x0209: 'daedric',
});
const CHAIN = new Set([0x0100, 0x0103]);

export function pieceCode(piece) {
  const m = drawnPiece(piece)?.material;
  if (!Number.isInteger(m)) return 'l';
  if (CHAIN.has(m)) return 'c';
  if (m >= 0x0200) return `p${Math.max(0, METALS.indexOf(PLATE_METAL[m] ?? 'steel'))}`;
  return 'l';
}

export const outfitOfSlots = (slots) => {
  const cloak = cloakOfSlots(slots);
  return `${pieceCode(slots?.[OUTFIT_SLOTS.head])}${pieceCode(slots?.[OUTFIT_SLOTS.top])}${pieceCode(slots?.[OUTFIT_SLOTS.legs])}${cloak == null ? '' : `~${cloak}`}`;
};

export function outfitOfItems(items) {
  const slots = {};
  for (const it of Array.isArray(items) ? items : []) if (Number.isInteger(it?.equipSlot)) slots[it.equipSlot] = it;
  return outfitOfSlots(slots);
}

const PIECE = /^(l|c|p[0-6])(l|c|p[0-6])(l|c|p[0-6])(?:~([0-9]))?$/;
const FAMILY = { l: 'leather', c: 'chain', p: 'plate' };
export function outfitPieces(outfit) {
  const m = PIECE.exec(String(outfit ?? ''));
  return m ? { head: m[1], top: m[2], legs: m[3], cloak: m[4] == null ? null : Number(m[4]) } : null;
}
export const outfitCombo = (p) => `${FAMILY[p.head[0]]}_${FAMILY[p.top[0]]}_${FAMILY[p.legs[0]]}`;

const bodyOf = (gender) => (gender === 'female' ? 'female' : 'male');

export const LAYERED_OWN = 3;

export const layeredGenderOf = (choice, own = null) => (choice === 1 ? 'female' : choice === 2 ? 'male'
  : choice === LAYERED_OWN ? bodyOf(own) : null);

function recordBase(table, hasRanged, hasHurt) {
  switch (table) {
    case 'Move': case 'MoveMelee': case 'MoveRanged': case 'MoveSpell': return 0;
    case 'AttackMelee': return 5;
    case 'AttackRanged': case 'AttackSpell': return hasRanged ? 20 : 15;
    case 'Death': return hasHurt ? 10 : 15;
    case 'Idle': case 'IdleMelee': case 'IdleRanged': case 'IdleSpell': return 15;
    default: return null;
  }
}

/**
 * @param {string} table
 * @param {number} offset
 * @param {number} frame
 * @param {number} tableFrames
 * @param {{gender?:string, outfit?:string}} look
 * @param {boolean} mirror
 */
export function layeredSprite(table, offset, frame, tableFrames, look, mirror) {
  const worn = outfitPieces(look?.outfit ?? 'lll');
  if (!worn) return null;
  const body = bodyOf(look?.gender);
  const pieces = worn;
  const combo = outfitCombo(pieces);
  const outfit = manifest[body]?.outfits?.[combo];
  if (!outfit) return null;
  const frames = /** @type {string[]} */ (outfit.frames);
  const base = recordBase(table, frames.includes('20-0'), frames.includes('10-0'));
  if (base == null) return null;
  const record = base + offset;
  const n = frames.filter((k) => k.startsWith(`${record}-`)).length || 1;
  const t = Math.max(1, tableFrames | 0);
  const f = Math.floor((Math.min(Math.max(frame | 0, 0), t - 1) * n) / t);
  const cloakFrames = /** @type {string[]|undefined} */ (cloakManifest[body]?.frames);
  const cloak = pieces.cloak != null && cloakFrames?.includes(`${record}-${f}`) ? pieces.cloak : null;
  const code = `${pieces.head}${pieces.top}${pieces.legs}${cloak == null ? '' : `~${cloak}`}`;
  return {
    archive: LAYERED_ARCHIVE[body], record, frame: f, mirror,
    key: `LA:${body}:${combo}:${record}-${f}:${code}`,
    rec: `${code}_${record}-${f}${mirror ? 'm' : ''}`,
  };
}

export const isLayeredKey = (key) => typeof key === 'string' && key.startsWith('LA:');

const IN_BROWSER = typeof window !== 'undefined';
const STRIPS = IN_BROWSER
  ? Object.fromEntries(Object.entries(import.meta.glob('../../vendor/layered-armor/*/*/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([p, u]) => [p.split('/').slice(-3).join('/').replace(/\.png$/, ''), /** @type {string} */ (u)]))
  : {};

const CLOAK_STRIPS = IN_BROWSER
  ? Object.fromEntries(Object.entries(import.meta.glob('../../vendor/layered-armor/cloak/*/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([p, u]) => [p.split('/').slice(-2).join('/').replace(/\.png$/, ''), /** @type {string} */ (u)]))
  : {};

const HOODFIX_STRIPS = IN_BROWSER
  ? Object.fromEntries(Object.entries(import.meta.glob('../../vendor/layered-armor/hoodfix/*/*/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([p, u]) => [p.split('/').slice(-3).join('/').replace(/\.png$/, ''), /** @type {string} */ (u)]))
  : {};

const SLOT_RGB = { head: [255, 0, 0], top: [0, 255, 0], legs: [0, 0, 255] };

export const layeredPreviewUrl = (gender) => STRIPS[`${bodyOf(gender)}/leather_leather_leather/15-0`] ?? null;

const GREEN_LUM = /** @type {number[][]} */ (cloakManifest.ramp).map(([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b);
function isCloth(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0 || mx < 31 || d / mx < 0.15) return false;
  let h;
  if (mx === r) h = (60 * (g - b)) / d; else if (mx === g) h = 120 + (60 * (b - r)) / d; else return false;
  if (h < 0) h += 360;
  return h >= 60 && h <= 165;
}
export function dyeCloth(r, g, b, dye) {
  const band = (/** @type {number[][][]} */ (cloakManifest.dyes))[dye] ?? cloakManifest.dyes[0];
  const L = 0.299 * r + 0.587 * g + 0.114 * b, last = GREEN_LUM.length - 1;
  let t = 0;
  if (L <= GREEN_LUM[last]) t = last;
  else if (L < GREEN_LUM[0]) { let i = 0; while (GREEN_LUM[i + 1] >= L) i++; t = i + (GREEN_LUM[i] - L) / (GREEN_LUM[i] - GREEN_LUM[i + 1]); }
  const a = Math.floor(t), c = Math.min(last, a + 1), f = t - a;
  return [0, 1, 2].map((k) => Math.round(band[a][k] * (1 - f) + band[c][k] * f));
}
/**
 * @param {Uint8Array} d
 * @param {number} w
 * @param {number} h
 * @param {Int16Array} foot
 */
export function closeHoodFoot(d, w, h, foot) {
  let low = -1;
  for (let x = 0; x < w; x++) if (foot[x] > low) low = foot[x];
  if (low < 0) return;
  for (let x = 0; x < w; x++) {
    const f = foot[x];
    if (f < 0 || f < low - 6) continue;
    let k = 1;
    while (k <= 5 && f + k < h && d[((f + k) * w + x) * 4 + 3] === 0) k++;
    if (k === 1 || k > 5 || f + k >= h) continue;
    const s = (f * w + x) * 4;
    for (let y = f + 1; y < f + k; y++) { const o = (y * w + x) * 4; d[o] = d[s]; d[o + 1] = d[s + 1]; d[o + 2] = d[s + 2]; d[o + 3] = 255; }
  }
}

/**
 * @param {{width:number,height:number,data:Uint8Array}} out
 * @param {{width:number,height:number,data:Uint8Array|Uint8ClampedArray}} cs
 * @param {number} dye
 * @param {boolean} over
 * @param {string} head
 * @param {boolean} [noSlivers]
 * @param {string} [top]
 */
export function applyCloak(out, cs, dye, over, head = 'l', noSlivers = false, top = 'l') {
  const w = out.width, h = out.height, d = out.data, sw = cs.width, c = cs.data;
  if (sw !== w * 7 || cs.height !== h) return;
  const TRIM = { l: 2, c: 3, p: 4 }[head] ?? 2, LOIN = 5, SHO = 6, TOP_BIT = { l: 1, c: 2, p: 4 }[top] ?? 1;
  const at = (tile, x, y) => (y * sw + tile * w + x) * 4;
  const put = (o, q) => {
    let r = c[q], g = c[q + 1], b = c[q + 2];
    if (isCloth(r, g, b)) [r, g, b] = dyeCloth(r, g, b, dye);
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (c[at(LOIN, x, y) + 3] && d[o + 3] && isCloth(d[o], d[o + 1], d[o + 2])) [d[o], d[o + 1], d[o + 2]] = dyeCloth(d[o], d[o + 1], d[o + 2], dye);
  }
  const hoodFoot = new Int16Array(w).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c[at(1, x, y) + 3]) hoodFoot[x] = y;
  let lowFoot = -1;
  for (let x = 0; x < w; x++) if (hoodFoot[x] > lowFoot) lowFoot = hoodFoot[x];
  const neck = (x, y) => hoodFoot[x] >= 0 && hoodFoot[x] >= lowFoot - 6 && y >= hoodFoot[x] - 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (c[at(TRIM, x, y) + 3] && !neck(x, y)) d[(y * w + x) * 4 + 3] = 0;
  const keep = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const s = at(SHO, x, y); if (c[s + 3] && d[o + 3] && (c[s] === 255 || (c[s] & TOP_BIT))) keep.push(o, d[o], d[o + 1], d[o + 2]); }
  const drawn = noSlivers ? new Uint8Array(w * h) : null;
  const under = noSlivers ? new Uint8Array(w * h * 4) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = at(0, x, y), o = (y * w + x) * 4;
    if (c[q + 3] && (over || d[o + 3] === 0)) {
      if (under) { under[o] = d[o]; under[o + 1] = d[o + 1]; under[o + 2] = d[o + 2]; under[o + 3] = d[o + 3]; }
      put(o, q); if (drawn) drawn[y * w + x] = 1;
    }
  }
  const restore = (i) => { const o = i * 4; d[o] = under[o]; d[o + 1] = under[o + 1]; d[o + 2] = under[o + 2]; d[o + 3] = under[o + 3]; };
  if (drawn) {
    const drop = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!drawn[y * w + x]) continue;
      const D = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && drawn[Y * w + X] === 1;
      if (!((D(x - 1, y) || D(x + 1, y)) && (D(x, y - 1) || D(x, y + 1)))) drop.push(y * w + x);
    }
    for (const i of drop) { restore(i); drawn[i] = 0; }
    const seen = new Uint8Array(w * h), stack = [];
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!drawn[i0] || seen[i0]) continue;
      const piece = []; stack.push(i0); seen[i0] = 1;
      while (stack.length) {
        const i = /** @type {number} */ (stack.pop()); piece.push(i);
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy, j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && drawn[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (piece.length <= 6) for (const i of piece) restore(i);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = at(1, x, y); if (c[q + 3]) put((y * w + x) * 4, q); }
  closeHoodFoot(d, w, h, hoodFoot);
  for (let n = 0; n < keep.length; n += 4) { const o = keep[n]; d[o] = keep[n + 1]; d[o + 1] = keep[n + 2]; d[o + 2] = keep[n + 3]; d[o + 3] = 255; }
}

/**
 * @param {{width:number,height:number,data:Uint8Array}} out
 * @param {{width:number,height:number,data:Uint8Array|Uint8ClampedArray}} fs
 * @param {{head:string,top:string,legs:string}} pieces
 * @param {number} dye
 */
export function applyHoodFix(out, fs, pieces, dye) {
  const w = out.width, h = out.height, d = out.data, sw = fs.width, f = fs.data;
  const tilesN = sw === w * 9 ? 9 : sw === w ? 1 : 0;
  if (!tilesN || fs.height !== h) return;
  const slotPiece = [pieces.head, pieces.top, pieces.legs];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let q = (y * sw + x) * 4;
    if (tilesN === 9) {
      const s = (y * sw + w + x) * 4;
      if (f[s + 3]) {
        const slot = f[s] ? 0 : f[s + 1] ? 1 : 2, p = slotPiece[slot];
        if (p[0] === 'p') { const m = (y * sw + (2 + Number(p.slice(1))) * w + x) * 4; if (f[m + 3]) q = m; }
      }
    }
    const a = f[q + 3];
    if (!a) continue;
    const o = (y * w + x) * 4;
    if (a === 1) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    let r = f[q], g = f[q + 1], b = f[q + 2];
    if (a === 255 && isCloth(r, g, b)) [r, g, b] = dyeCloth(r, g, b, dye);
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
}

/**
 * @param {{width:number,height:number,data:Uint8Array|Uint8ClampedArray}} strip
 * @param {string} code
 * @param {{strip:{width:number,height:number,data:Uint8Array|Uint8ClampedArray}, over:boolean, noSlivers?:boolean, fix?:{width:number,height:number,data:Uint8Array|Uint8ClampedArray}|null}|null} [cloak]
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function composeStrip(strip, code, cloak = null) {
  const pieces = outfitPieces(code);
  const plate = pieces ? Object.entries({ head: pieces.head, top: pieces.top, legs: pieces.legs }).filter(([, p]) => p[0] === 'p') : [];
  const tilesN = manifest.tiles.length;
  const w = plate.length && strip.width % tilesN === 0 ? strip.width / tilesN : strip.width;
  const h = strip.height, sw = strip.width, src = strip.data;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(src.subarray(y * sw * 4, (y * sw + w) * 4), y * w * 4);
  const res = { width: w, height: h, data: out };
  const finish = () => {
    if (cloak && pieces?.cloak != null) {
      applyCloak(res, cloak.strip, pieces.cloak, cloak.over, pieces.head[0], cloak.noSlivers === true, pieces.top[0]);
      if (cloak.fix) applyHoodFix(res, cloak.fix, pieces, pieces.cloak);
    }
    return res;
  };
  if (w === sw) return finish();
  for (const [slot, p] of plate) {
    const metal = METALS[Number(p.slice(1))] ?? 'steel';
    const mt = 2 + METALS.indexOf(metal), tt = manifest.trim[metal] === 'cuffs' ? 10 : 9;
    const [r, g, b] = SLOT_RGB[slot];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * sw + w + x) * 4;
        if (src[s + 3] === 0 || src[s] !== r || src[s + 1] !== g || src[s + 2] !== b) continue;
        const o = (y * w + x) * 4;
        for (const tile of [mt, tt]) {
          const q = (y * sw + tile * w + x) * 4;
          if (src[q + 3]) { out[o] = src[q]; out[o + 1] = src[q + 1]; out[o + 2] = src[q + 2]; out[o + 3] = src[q + 3]; }
        }
      }
    }
  }
  return finish();
}

const cloakOver = (body, rf) => {
  const rec = Number(rf.split('-')[0]), m = cloakManifest[body], of = m?.overFrames ?? [];
  return rec >= 20 ? of.includes(rf) : (m?.over ?? [3, 4]).includes(rec % 5) || of.includes(rf);
};

/**
 * @param {string} key
 * @param {(bytes:Uint8Array)=>Promise<{width:number,height:number,data:Uint8Array}>} decodePng
 */
export async function decodeLayered(key, decodePng, { fetchUrl = (u) => fetch(u), urlOf = (k) => STRIPS[k], cloakUrlOf = (k) => CLOAK_STRIPS[k], hoodFixUrlOf = (k) => HOODFIX_STRIPS[k] } = {}) {
  const [, body, combo, rf, code] = key.split(':');
  const url = urlOf(`${body}/${combo}/${rf}`);
  if (!url) throw new Error(`${key}: no art`);
  const res = await fetchUrl(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const strip = await decodePng(new Uint8Array(await res.arrayBuffer()));
  let cloak = null;
  if (outfitPieces(code)?.cloak != null) {
    const cu = cloakUrlOf(`${body}/${rf}`);
    try {
      const cr = cu ? await fetchUrl(cu) : null;
      if (cr?.ok) cloak = { strip: await decodePng(new Uint8Array(await cr.arrayBuffer())), over: cloakOver(body, rf), noSlivers: cloakManifest[body]?.noSlivers === true, fix: null };
    } catch { cloak = null; }
    const fu = cloak ? hoodFixUrlOf(`${body}/${combo}/${rf}`) : null;
    if (fu) {
      try { const fr = await fetchUrl(fu); if (fr?.ok) cloak.fix = await decodePng(new Uint8Array(await fr.arrayBuffer())); } catch {}
    }
  }
  return composeStrip(strip, code, cloak);
}
