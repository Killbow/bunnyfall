// Loading and sizing of the Eye of the Beholder sprites turned into a drawable body.
import { ORIENTATIONS, stateFor, tableArchive, spriteKey, STATE_TABLES, frameCount } from './eotbBillboard.js';
import { layeredSprite, isLayeredKey } from './layeredArmor.js';
import { classSkinOf, classRecord, classFrame, classRecordScale } from './classSkins.js';
import { toColor32, toColor32OrderInPlace } from '../formats/color32Order.js';
import { horseLookCode, horseLookOfCode, lookSuffix, recolorHorse } from '../travel/horseCoats.js';
import spriteInfo from '../../vendor/eye-of-the-beholder/spriteInfo.json' with { type: 'json' };

const IN_BROWSER = typeof window !== 'undefined';
const URLS = IN_BROWSER
  ? {
    ...import.meta.glob('../../vendor/eye-of-the-beholder/Textures/*/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('../../vendor/class-skins/Textures/*/*.png', { eager: true, query: '?url', import: 'default' }),
  }
  : {};

const BY_KEY = Object.fromEntries(
  Object.entries(URLS).map(([p, u]) => [p.split('/').pop().replace(/\.png$/, ''), u]),
);
export const eotbSpriteUrl = (key) => (isLayeredKey(key) ? key : BY_KEY[key] ?? null);
const SPRITE_COUNT = Object.keys(BY_KEY).length;
export const spriteCount = () => SPRITE_COUNT;

export const SIZE_ON_FOOT = 0.019;
export const SIZE_RIDING_OR_TRANSFORMED = 0.029;
export const sizeMod = ({ riding = false, transformed = false, scale = 1 } = {}) =>
  (riding || transformed ? SIZE_RIDING_OR_TRANSFORMED : SIZE_ON_FOOT) * scale;

export function spriteOffset(archive, record) {
  const o = spriteInfo.offsets[`${archive}_${record}-0`];
  const d = spriteInfo.default;
  const xml = o ? { scale: o.scale ?? 1, x: o.x ?? 0, y: o.y ?? 0 } : { scale: d.scale ?? 1, x: d.x ?? 0, y: d.y ?? 0 };
  const k = classRecordScale(archive, record);
  const s = k * eotbRecordScale(archive, record);
  return s === 1 ? xml : { ...xml, scale: xml.scale * s };
}

export const EOTB_RECORD_SCALE = Object.freeze({ 112374: Object.freeze({ from: 45, to: 59, scale: 80 / 110 }) });
export function eotbRecordScale(archive, record) {
  const r = EOTB_RECORD_SCALE[archive];
  return r && record >= r.from && record <= r.to ? r.scale : 1;
}

export function spriteSize(w, h, state, xmlScale = 1) {
  const m = sizeMod(state);
  return { w: (w / xmlScale) * m, h: (h / xmlScale) * m };
}

export function spriteFor(table, orientation, frame, look = {}, { flip = false } = {}) {
  const st = stateFor(table, orientation);
  if (!st) return null;
  const mirror = st.mirror !== !!flip;
  if (look.wornArmour && !table.endsWith('Horse') && !table.endsWith('Lycan')) {
    const worn = layeredSprite(table, st.record - STATE_TABLES[table].base, frame, frameCount(table), look, mirror);
    if (worn) return worn;
  }
  const skin = !table.endsWith('Horse') && !table.endsWith('Lycan') ? classSkinOf(look.onFoot) : null;
  if (skin) {
    const record = classRecord(skin, table, st.record - STATE_TABLES[table].base);
    const f = classFrame(skin, record, frame, frameCount(table));
    return { archive: skin.archive, record, frame: f, mirror, key: spriteKey(skin.archive, record, f), rec: `${record}-${f}${mirror ? 'm' : ''}` };
  }
  const archive = tableArchive(table, look);
  const horse = table.endsWith('Horse') ? horseLookCode(horseLookOfCode(look.horse ?? 0)) : 0;
  return {
    archive,
    record: st.record,
    frame,
    mirror,
    key: spriteKey(archive, st.record, frame),
    rec: `${st.record}-${frame}${mirror ? 'm' : ''}${lookSuffix(horse)}`,
    horse,
  };
}

export const lookedPixels = (s, image) => (s?.horse ? recolorHorse(image, s.horse) : image);

export function tableKeys(table, frame, look = {}) {
  const out = [];
  for (let o = 0; o < ORIENTATIONS; o++) out.push(spriteFor(table, o, frame, look).key);
  return [...new Set(out)];
}

/**
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {{width:number,height:number,colors:Uint32Array}}
 */
export function worldOrderColors(image, { owned = false } = {}) {
  if (owned) { const { width, height, data } = toColor32OrderInPlace(image); return { width, height, colors: new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4) }; }
  const { width, height, colors } = toColor32(image);
  return { width, height, colors: new Uint32Array(colors.buffer, colors.byteOffset, colors.byteLength / 4) };
}

export function flipRows(colors, w, h) {
  const out = new Uint32Array(colors.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = colors[y * w + x];
  }
  return out;
}
