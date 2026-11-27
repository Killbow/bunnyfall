// No DFU world-data object has a key starting with `$`, so an object with a `$` key is a reference to expand. The
// pack builder (tools/worldDataPackBuild.mjs) refuses a pack when a file rebuilt here fails its sha256.

import { blockToDfuJson, locationToDfuJson, patchJson, jsonAt, canonicalJson } from './worldDataJson.js';

export const PACK_FORMAT = 'dfe-worlddata-pack/1';

const MODEL_KEYS = ['ModelIdNum', 'ObjectType', 'XPos', 'YPos', 'ZPos', 'XRotation', 'YRotation', 'ZRotation'];
const SCALE_KEYS = ['XScale', 'YScale', 'ZScale'];
const FLAT_KEYS = ['Position', 'XPos', 'YPos', 'ZPos', 'TextureArchive', 'TextureRecord', 'FactionID', 'Flags'];
const DOOR_KEYS = ['Position', 'XPos', 'YPos', 'ZPos', 'YRotation', 'OpenRotation', 'DoorModelIndex'];
const SECTION3_KEYS = ['XPos', 'YPos', 'ZPos'];
const BUILDING_KEYS = ['NameSeed', 'FactionId', 'Sector', 'LocationId', 'BuildingType', 'Quality'];
const TILE_KEYS = ['TileBitfield', 'TextureRecord', 'IsRotated', 'IsFlipped'];

function modelFromRow(row) {
  const o = { ModelId: String(row[0]), ModelIdNum: row[0], ObjectType: row[1], XPos: row[2], YPos: row[3], ZPos: row[4] };
  if (row.length > 8) {
    let at = 9;
    for (let k = 0; k < 3; k++) if (row[8] & (1 << k)) o[SCALE_KEYS[k]] = row[at++];
  }
  o.XRotation = row[5]; o.YRotation = row[6]; o.ZRotation = row[7];
  return o;
}
const fromPaddedRow = (keys) => (row) => {
  const o = {};
  for (let k = 0; k < keys.length; k++) o[keys[k]] = row[k] ?? 0;
  return o;
};
const flatFromRow = fromPaddedRow(FLAT_KEYS);
const doorFromRow = fromPaddedRow(DOOR_KEYS);
const section3FromRow = fromPaddedRow(SECTION3_KEYS);
const buildingFromRow = (row) => ({ NameSeed: row[0], FactionId: row[1], Sector: row[2], LocationId: row[3], BuildingType: row[4], Quality: row[5] });
const tileFromRow = (row) => ({ TileBitfield: row[0], TextureRecord: row[1], IsRotated: row[2] === 1, IsFlipped: row[3] === 1 });
const sceneryFromRow = (row) => ({ TextureRecord: row });

export const ROW_CODECS = Object.freeze({
  $m: modelFromRow, $f: flatFromRow, $d: doorFromRow, $3: section3FromRow, $b: buildingFromRow, $t: tileFromRow, $g: sceneryFromRow,
});

// tools/worldDataPackBuild.mjs encodes with `ROW_ENCODERS`; each encoder must stay the exact inverse of its
// `ROW_CODECS` decoder.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (o, keys) => { const k = Object.keys(o); return k.length === keys.length && keys.every((x) => Object.hasOwn(o, x)); };

export const ROW_ENCODERS = Object.freeze({
  $m: (o) => {
    if (!isObj(o) || typeof o.ModelId !== 'string' || o.ModelId !== String(o.ModelIdNum)) return null;
    const scales = SCALE_KEYS.filter((k) => Object.hasOwn(o, k));
    if (!sameKeys(o, ['ModelId', ...MODEL_KEYS, ...scales])) return null;
    if (MODEL_KEYS.some((k) => typeof o[k] !== 'number') || scales.some((k) => typeof o[k] !== 'number')) return null;
    const row = MODEL_KEYS.map((k) => o[k]);
    if (scales.length) row.push(scales.reduce((m, k) => m | (1 << SCALE_KEYS.indexOf(k)), 0), ...scales.map((k) => o[k]));
    return row;
  },
  $f: (o) => paddedRow(o, FLAT_KEYS),
  $d: (o) => paddedRow(o, DOOR_KEYS),
  $3: (o) => paddedRow(o, SECTION3_KEYS),
  $b: (o) => (isObj(o) && sameKeys(o, BUILDING_KEYS) && BUILDING_KEYS.every((k) => k === 'BuildingType' ? (typeof o[k] === 'number' || typeof o[k] === 'string') : typeof o[k] === 'number')
    ? BUILDING_KEYS.map((k) => o[k]) : null),
  $t: (o) => (isObj(o) && sameKeys(o, TILE_KEYS) && typeof o.TileBitfield === 'number' && typeof o.TextureRecord === 'number' && typeof o.IsRotated === 'boolean' && typeof o.IsFlipped === 'boolean'
    ? [o.TileBitfield, o.TextureRecord, o.IsRotated ? 1 : 0, o.IsFlipped ? 1 : 0] : null),
  $g: (o) => (isObj(o) && sameKeys(o, ['TextureRecord']) && typeof o.TextureRecord === 'number' ? o.TextureRecord : null),
});
function paddedRow(o, keys) {
  if (!isObj(o) || !sameKeys(o, keys) || keys.some((k) => typeof o[k] !== 'number')) return null;
  const row = keys.map((k) => o[k]);
  while (row.length && row[row.length - 1] === 0) row.pop();
  return row;
}

export function runLength(a) {
  const out = [];
  for (let i = 0; i < a.length;) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

export const DECODED_NODES_MAX = 1024;
export const REBUILT_FILES_MAX = 512;

function refKey(v) {
  if (!isObj(v)) return null;
  for (const k of Object.keys(v)) if (k.charCodeAt(0) === 36 && k !== '$o') return k;
  return null;
}

/**
 * @param {object} pack
 * @param {{ blocks: { getBlockName(i:number): string|null, readClassicBlock(i:number): object|null } }} env
 */
export function openWorldDataPack(pack, env) {
  if (pack?.format !== PACK_FORMAT) throw new Error(`world-data pack: ${pack?.vendor ?? '?'} is not ${PACK_FORMAT}`);
  const rawFiles = pack.files ?? {};
  const fileEntry = (name) => {
    const e = rawFiles[name];
    return typeof e === 'string' ? JSON.parse(e) : e;
  };
  const nodes = pack.nodes ?? [];
  const decodedNodes = new Map();
  const classicJson = new Map();
  const classicNames = pack.classicNames ?? null;
  const keptFiles = new Map();
  // Rebuilt block files share their nodes, so nothing may write to them.
  const rebuiltFiles = new Map();
  const baseTargets = new Set(pack.bases ?? []);
  if (!pack.bases) for (const name of Object.keys(rawFiles)) { const base = fileEntry(name)?.[1]; if (base?.[0] === 'f') baseTargets.add(base[1]); }
  const onRebuilt = typeof env.onRebuilt === 'function' ? env.onRebuilt : null;

  function classicBlockJson(index, wantName = null) {
    let j = classicJson.get(index);
    if (!j) {
      const got = env.blocks.getBlockName(index);
      if (wantName && got !== wantName) throw new Error(`world-data pack: ${pack.vendor} wants ${wantName} at block ${index}, BLOCKS.BSA has ${got}`);
      const b = env.blocks.readClassicBlock(index);
      if (!b) throw new Error(`world-data pack: block ${index} did not read`);
      j = blockToDfuJson(b);
      if (classicJson.size >= 64) classicJson.delete(classicJson.keys().next().value);
      classicJson.set(index, j);
    } else if (wantName && j.Name !== wantName) throw new Error(`world-data pack: ${pack.vendor} wants ${wantName} at block ${index}, BLOCKS.BSA has ${j.Name}`);
    return j;
  }

  function expand(v) {
    if (Array.isArray(v)) {
      let out = null;
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (x !== null && typeof x === 'object') {
          const y = expand(x);
          if (y !== x) { out ??= v.slice(); out[i] = y; }
        }
      }
      return out ?? v;
    }
    if (!isObj(v)) return v;
    const k = refKey(v);
    if (k === null) {
      let out = null;
      for (const key of Object.keys(v)) {
        const x = v[key];
        if (x !== null && typeof x === 'object') {
          const y = expand(x);
          if (y !== x) { out ??= { ...v }; out[key] = y; }
        }
      }
      return out ?? v;
    }
    let node;
    if (k === '$n') node = nodeAt(v.$n);
    else if (k === '$c') {
      const [index, path] = v.$c;
      node = jsonAt(classicBlockJson(index, classicNames?.[index] ?? null), path);
      if (node === undefined) throw new Error(`world-data pack: ${pack.vendor}: classic node ${JSON.stringify(v.$c)} not found`);
    } else if (k === '$r') {
      const runs = v.$r, out = [];
      for (let i = 0; i < runs.length; i += 2) for (let n = 0; n < runs[i + 1]; n++) out.push(runs[i]);
      node = out;
    } else if (Object.hasOwn(ROW_CODECS, k)) {
      const dec = ROW_CODECS[k];
      node = v[k].map((row) => (Array.isArray(row) || typeof row === 'number' ? dec(row) : expand(row)));
    } else throw new Error(`world-data pack: ${pack.vendor}: unknown reference ${k}`);
    return v.$o ? patchJson(node, expandOps(v.$o), null, { shared: true }) : node;
  }

  function nodeAt(id) {
    if (!(id >= 0 && id < nodes.length)) throw new Error(`world-data pack: ${pack.vendor}: no node ${id}`);
    let d = decodedNodes.get(id);
    if (d === undefined) {
      const n = nodes[id]; d = expand(typeof n === 'string' ? JSON.parse(n) : n);
      decodedNodes.set(id, d);
      if (decodedNodes.size > DECODED_NODES_MAX) decodedNodes.delete(decodedNodes.keys().next().value);
    } else { decodedNodes.delete(id); decodedNodes.set(id, d); }
    return d;
  }

  function expandOps(ops) {
    const out = [];
    for (const op of ops) {
      if (op[0] === 'sr') {
        const [, path, runs] = op;
        for (let i = 0; i < runs.length; i += 2) {
          const vals = runs[i + 1];
          for (let n = 0; n < vals.length; n++) out.push(['s', [...path, runs[i] + n], vals[n]]);
        }
      } else if (op[0] === 's' || op[0] === 'i') out.push([op[0], op[1], expand(op[2])]);
      else out.push(op);
    }
    return out;
  }

  function baseOf(name, base, maps) {
    if (!Array.isArray(base)) throw new Error(`world-data pack: ${pack.vendor}: ${name} has no base`);
    if (base[0] === 'b') return classicBlockJson(base[2], base[1]);
    if (base[0] === 'l') {
      const [, region, index, locName] = base;
      const loc = maps?.readClassicLocation?.(region, index);
      if (!loc) throw new Error(`world-data pack: ${pack.vendor}: ${name}: location ${region}/${index} did not read`);
      if (locName !== undefined && loc.name !== locName) throw new Error(`world-data pack: ${pack.vendor}: ${name} wants ${locName} at ${region}/${index}, MAPS.BSA has ${loc.name}`);
      return locationToDfuJson(loc);
    }
    if (base[0] === 'f') return rebuild(base[1], maps);
    throw new Error(`world-data pack: ${pack.vendor}: ${name}: unknown base ${JSON.stringify(base)}`);
  }

  function rebuild(name, maps = null) {
    const kept = keptFiles.get(name) ?? rebuiltFiles.get(name);
    if (kept) return kept;
    if (!Object.hasOwn(rawFiles, name)) throw new Error(`world-data pack: ${pack.vendor} has no ${name}`);
    const [sha, base, ops] = fileEntry(name);
    // A location base is a fresh read for this file, so edits apply in place; block and file bases are cached and
    // shared, so edits copy on write.
    const owned = base?.[0] === 'l';
    const json = patchJson(baseOf(name, base, maps), expandOps(ops), null, owned ? { owned } : { shared: true });
    if (baseTargets.has(name)) keptFiles.set(name, json);
    else if (!owned) {
      rebuiltFiles.set(name, json);
      if (rebuiltFiles.size > REBUILT_FILES_MAX) rebuiltFiles.delete(rebuiltFiles.keys().next().value);
    }
    onRebuilt?.(name, json, sha);
    return json;
  }

  return Object.freeze({
    vendor: pack.vendor,
    mod: pack.mod ?? null,
    names: () => Object.keys(rawFiles),
    has: (name) => Object.hasOwn(rawFiles, name),
    sha256Of: (name) => (Object.hasOwn(rawFiles, name) ? fileEntry(name)[0] : null),
    baseOf: (name) => (Object.hasOwn(rawFiles, name) ? fileEntry(name)[1] : null),
    rebuild,
    release() { decodedNodes.clear(); classicJson.clear(); keptFiles.clear(); rebuiltFiles.clear(); },
  });
}

// Bytes without a gzip header are read as text, because Vite's dev server sends a `.gz` with Content-Encoding: gzip
// and the browser inflates it.
export async function readPackText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof globalThis.DecompressionStream === 'function') {
      const stream = new Blob([bytes]).stream().pipeThrough(new globalThis.DecompressionStream('gzip'));
      return await new Response(stream).text();
    }
    if (typeof globalThis.process === 'undefined' || !globalThis.process.versions?.node) throw new Error('this browser cannot inflate the pack (no DecompressionStream)');
    const zlib = await import(/* @vite-ignore */ 'node:zlib');
    return zlib.gunzipSync(bytes).toString('utf8');
  }
  return new TextDecoder().decode(bytes);
}

export function classicIndicesOf(pack) {
  const out = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) if (x !== null && typeof x === 'object') walk(x); return; }
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v.$c) && Number.isInteger(v.$c[0])) out.add(v.$c[0]);
    for (const k of Object.keys(v)) { const x = v[k]; if (x !== null && typeof x === 'object') walk(x); }
  };
  for (const e of Object.values(pack.files ?? {})) walk(typeof e === 'string' ? JSON.parse(e) : e);
  for (const n of pack.nodes ?? []) walk(typeof n === 'string' ? JSON.parse(n) : n);
  return [...out].sort((a, b) => a - b);
}

export async function packFileSha256(json) {
  const bytes = new TextEncoder().encode(canonicalJson(json));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('sha256 needs WebCrypto (crypto.subtle): a secure context - https, or localhost');
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
