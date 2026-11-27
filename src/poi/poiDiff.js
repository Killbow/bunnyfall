// @ts-check

import { POI_PIXEL_M } from './poiLaw.js';
import { quatMultiply } from '../world/quat.js';

export const POI_DIFF_KINDS = Object.freeze(['npcs', 'groups', 'flats', 'routes', 'encounters', 'interactives', 'dialogues', 'trades', 'variables', 'events']);

const MOVE_EPS = 0.005, TURN_EPS = 0.05, SIZE_EPS = 1e-4;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function quatAngleDeg(a, b) {
  const [x, y, z, w] = quatMultiply(a, [-b[0], -b[1], -b[2], b[3]]);
  return (2 * Math.atan2(Math.hypot(x, y, z), Math.abs(w)) * 180) / Math.PI;
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mapSpot = (p) => [p.px * POI_PIXEL_M + p.x, p.y, -p.py * POI_PIXEL_M + p.z];

/**
 * @param {any} before
 * @param {any} after
 * @returns {{ code: string, [arg: string]: any }[]}
 */
export function poiDiff(before, after) {
  if (!after) return [{ code: 'retire' }];
  if (!before) {
    /** @type {{ code: string, [arg: string]: any }[]} */
    const made = [{ code: 'new', parts: after.parts?.length ?? 0, lights: after.lights?.length ?? 0 }];
    for (const kind of POI_DIFF_KINDS) if (after[kind]?.length) made.push({ code: 'collection', kind, count: after[kind].length });
    if (after.interior) made.push({ code: 'interior' });
    return made;
  }
  const out = [];
  if (before.v !== after.v) out.push({ code: 'upgraded', from: before.v, to: after.v });
  if (before.name !== after.name) out.push({ code: 'name', from: before.name, to: after.name });
  if ((before.about ?? '') !== (after.about ?? '')) out.push({ code: 'about' });
  if (!same(before.tags ?? [], after.tags ?? [])) out.push({ code: 'tags', tags: [...(after.tags ?? [])] });
  const p0 = before.place, p1 = after.place;
  const moved = dist3(mapSpot(p0), mapSpot(p1));
  if (moved > MOVE_EPS) out.push({ code: 'moved', m: Math.round(moved * 100) / 100 });
  if (p0.ground !== p1.ground) out.push({ code: 'ground', to: p1.ground });
  const turned = quatAngleDeg(p0.r, p1.r);
  if (turned > TURN_EPS) out.push({ code: 'turned', deg: Math.round(turned * 10) / 10 });
  if (Math.abs(p1.s / p0.s - 1) > SIZE_EPS) out.push({ code: 'sized', from: p0.s, to: p1.s });
  const was = new Map((before.parts ?? []).map((q) => [q.key, q]));
  const now = new Map((after.parts ?? []).map((q) => [q.key, q]));
  for (const [key, q] of now) {
    const old = was.get(key);
    const name = q.name || key;
    if (!old) { out.push({ code: 'part-added', name }); continue; }
    const what = [];
    if (old.mesh !== q.mesh || old.arch3d !== q.arch3d) what.push('model');
    if (dist3(old.t, q.t) * p1.s > MOVE_EPS) what.push('moved');
    if (quatAngleDeg(old.r, q.r) > TURN_EPS) what.push('turned');
    if (old.s.some((c, i) => Math.abs(q.s[i] / c - 1) > SIZE_EPS)) what.push('sized');
    if (!same(old.materials, q.materials)) what.push('materials');
    if (old.collide !== q.collide || old.shadow !== q.shadow) what.push('solidity');
    if ((old.name ?? '') !== (q.name ?? '')) what.push('name');
    if (old.group !== q.group || old.visible !== q.visible || old.locked !== q.locked) what.push('layout');
    if (what.length) out.push({ code: 'part-changed', name, what });
  }
  for (const [key, q] of was) if (!now.has(key)) out.push({ code: 'part-removed', name: q.name || key });
  if (!same(before.lights ?? [], after.lights ?? [])) out.push({ code: 'lights', from: before.lights?.length ?? 0, to: after.lights?.length ?? 0 });
  if (!same(before.marker ?? { show: false }, after.marker ?? { show: false })) out.push({ code: 'marker', show: !!after.marker?.show, label: after.marker?.label ?? '' });
  if (!same(before.interior, after.interior)) out.push({ code: 'interior' });
  for (const kind of POI_DIFF_KINDS) out.push(...keyedDiff(kind, before[kind], after[kind]));
  return out;
}

/**
 * @param {string} kind
 * @param {any[] | undefined} was
 * @param {any[] | undefined} now
 */
function keyedDiff(kind, was, now) {
  const out = [];
  const old = new Map((was ?? []).map((o) => [o.key, o]));
  const cur = new Map((now ?? []).map((o) => [o.key, o]));
  const nameOf = (o) => o.name || o.key;
  for (const [key, o] of cur) {
    const prev = old.get(key);
    if (!prev) { out.push({ code: 'item-added', kind, name: nameOf(o) }); continue; }
    const what = [...new Set([...Object.keys(prev), ...Object.keys(o)])].filter((f) => f !== 'key' && !same(prev[f], o[f]));
    if (what.length) out.push({ code: 'item-changed', kind, name: nameOf(o), what });
  }
  for (const [key, o] of old) if (!cur.has(key)) out.push({ code: 'item-removed', kind, name: nameOf(o) });
  return out;
}
