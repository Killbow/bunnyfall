// The mod records are a world data layer laid onto whichever gate file is served, the mod file or a Beautiful
// Cities composite, in block coordinates. When the mod patch itself is served it already holds them, and the layer
// is skipped.

import { registerWorldDataLayer } from '../formats/worldDataReplacement.js';

export const IT_GATE_FILE = /^(WALLAA(?:08|09|10|11))(?:\.[A-Z0-9]+)?\.RMB\.json$/;
export const hasCarriageGate = (loc) => (loc?.exterior?.exteriorData?.blockNames ?? []).some((n) => IT_GATE_FILE.test(`${String(n ?? '').toUpperCase()}.json`));
const ARRAYS = Object.freeze(['Misc3dObjectRecords', 'MiscFlatObjectRecords']);

// Only `i` ops at or past the classic counts are taken. Every other op is skipped, never refused, because one op
// the layer cannot lay would stop every world from loading.
export function gateAppends(patch, counts = null) {
  const out = { Misc3dObjectRecords: [], MiscFlatObjectRecords: [] };
  for (const [kind, path, value] of patch?.ops ?? []) {
    if (kind !== 'i' || path?.length !== 3 || path[0] !== 'RmbBlock' || !ARRAYS.includes(path[1])) continue;
    if (counts && !(path[2] >= (counts[path[1]] ?? 0))) continue;
    out[path[1]].push(value);
  }
  return out;
}

// Four Beautiful Cities composites put a building on the gate spot; each [XPos, ZPos] block-unit shift clears it.
export const GATE_SHIFTS = Object.freeze({
  'WALLAA08.TVRNAS00.RMB.json': [160, 550],
  'WALLAA08.TVRNBS01.RMB.json': [840, 80],
  'WALLAA09.TVRNBS01.RMB.json': [100, 540],
  'WALLAA11.TVRNAS01.RMB.json': [-100, -760],
});

export function layGateRecords(json, appends, [dx, dz] = [0, 0]) {
  const rmb = json?.RmbBlock;
  if (!rmb) return json;
  const next = { ...rmb };
  for (const k of ARRAYS) {
    if (!appends[k]?.length) continue;
    const laid = appends[k].map((r) => ({ ...r, XPos: r.XPos + dx, ZPos: r.ZPos + dz }));
    next[k] = [...(Array.isArray(rmb[k]) ? rmb[k] : []), ...laid];
  }
  return { ...json, RmbBlock: next };
}

export function installImmersiveTravelGates(patches, own, isOn) {
  const byGate = new Map();
  (patches ?? []).forEach((p, i) => {
    const h = own?.[i]?.RmbBlock?.FldHeader;
    const counts = h ? { Misc3dObjectRecords: h.NumMisc3dObjectRecords, MiscFlatObjectRecords: h.NumMiscFlatObjectRecords } : null;
    byGate.set(String(p.rebuilds ?? '').replace(/\.RMB\.json$/, ''), gateAppends(p, counts));
  });
  if (!byGate.size) return false;
  const mine = new WeakSet((own ?? []).filter((j) => j && typeof j === 'object'));
  return registerWorldDataLayer({
    vendor: 'immersive-travel',
    isOn: typeof isOn === 'function' ? isOn : () => true,
    match: (fileName) => byGate.has(IT_GATE_FILE.exec(fileName)?.[1]),
    owns: (json) => mine.has(json),
    apply: (json, fileName) => {
      const appends = byGate.get(IT_GATE_FILE.exec(fileName)?.[1]);
      return layGateRecords(json, appends, GATE_SHIFTS[fileName]);
    },
  });
}
