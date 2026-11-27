// @ts-check

import { decorFlatMirrored, decorMountFrame } from '../../../src/net/decorLaw.js';
import { find } from './scene.js';

const LAYER_MIN = -100, LAYER_MAX = 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function isMirrored(row, pair = null) {
  if (!row || row.kind === 'mount') return false;
  const flat = Array.isArray(row.flat) ? row.flat : pair;
  return decorFlatMirrored({ flat, item: row.kind === 'paperdoll' ? undefined : row.item, rot: row.rot });
}

export function setMirrored(row, on) {
  if (!row?.rot || row.kind === 'mount') return false;
  const now = isMirrored(row, [0, 0]);
  if (now === on) return true;
  row.rot = [on ? 180 : 0, row.rot[1], row.rot[2]];
  return true;
}

const wrap = (d) => { let v = d % 360; if (v > 180) v -= 360; if (v <= -180) v += 360; return v; };

export function turnFlat(row, deg) {
  if (!row?.rot || !Number.isFinite(deg)) return false;
  const i = row.kind === 'mount' ? 2 : 0;
  const rot = [...row.rot];
  rot[i] = r3(wrap(rot[i] + deg));
  row.rot = rot;
  return true;
}

export function pivotAt(pic, x, y, mode = 'pixel') {
  let fx = clamp(x / pic.width, 0, 1), fy = clamp(y / pic.height, 0, 1);
  if (mode === 'pixel') { fx = Math.round(x) / pic.width; fy = Math.round(y) / pic.height; }
  else if (mode === 'quarter') { fx = Math.round(fx * 4) / 4; fy = Math.round(fy * 4) / 4; }
  else if (mode === 'centre') { const near = (v) => [0, 0.5, 1].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)); fx = near(fx); fy = near(fy); }
  return [r3(clamp(fx, 0, 1)), r3(clamp(fy, 0, 1))];
}

export const PIVOT_PRESETS = Object.freeze({ feet: [0.5, 1], centre: [0.5, 0.5], top: [0.5, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1] });
export const DEFAULT_PIVOT = [0.5, 1];

export function setPivot(row, pv) {
  if (!row || !Array.isArray(pv) || pv.length !== 2 || pv.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) return false;
  row.pivot = [r3(pv[0]), r3(pv[1])];
  return true;
}

export function layerStack(doc) {
  return (doc?.flats ?? []).map((f, i) => ({ id: `flat:${f.key}`, name: f.name || f.key, layer: f.layer ?? 0, i }))
    .sort((a, b) => a.layer - b.layer || a.i - b.i).map(({ i, ...r }) => r);
}

export function shiftLayer(doc, id, dir) {
  const f = find(doc, id);
  if (!f || f.kind !== 'flat') return false;
  const stack = layerStack(doc), at = stack.findIndex((s) => s.id === id), next = stack[at + dir];
  if (!next) { const to = clamp((f.row.layer ?? 0) + dir, LAYER_MIN, LAYER_MAX); if (to === f.row.layer) return false; f.row.layer = to; return true; }
  const other = find(doc, next.id);
  if (!other) return false;
  if (other.row.layer === f.row.layer) { f.row.layer = clamp(f.row.layer + dir, LAYER_MIN, LAYER_MAX); return f.row.layer !== other.row.layer; }
  const mine = f.row.layer ?? 0;
  f.row.layer = other.row.layer ?? 0; other.row.layer = mine;
  return true;
}

export function layerEnd(doc, id, front) {
  const f = find(doc, id);
  if (!f || f.kind !== 'flat') return false;
  const others = (doc.flats ?? []).filter((x) => `flat:${x.key}` !== id).map((x) => x.layer ?? 0);
  if (!others.length) return false;
  const to = clamp(front ? Math.max(...others) + 1 : Math.min(...others) - 1, LAYER_MIN, LAYER_MAX);
  if (to === f.row.layer) return false;
  f.row.layer = to;
  return true;
}

export function mountSpin(row) { return row?.kind === 'mount' ? Math.atan2(decorMountFrame(row.rot).right[1], decorMountFrame(row.rot).up[1]) : 0; }
