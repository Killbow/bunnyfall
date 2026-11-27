// @ts-check

import {
  uvSessionOf, cornersOf, uvCentre, transformCorners, edgeKey, setSeam, projectPlanar, projectBox, projectCylinder,
  projectSphere, unwrapLscm, packIslands, texelDensity, setTexelDensity, meshFromSession, uvBounds, uvVertices, uvIslandsOf,
} from './uvMesh.js';
import { createUnwrapThread } from './uvUnwrapClient.js';

export const UV_UNDO_DEPTH = 100;
export const UV_UNDO_BYTES = 128 * 1024 * 1024;
export const UV_MODES = Object.freeze(['vertex', 'edge', 'face', 'island']);

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function inTri(p, a, b, c) {
  const s1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const s2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
  const s3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/**
 * @param {any} mesh
 * @param {{ sub?: number, workerFactory?: (() => any) | null, undoBytes?: number }} [opts]
 */
export function createUvEdit(mesh, { sub = 0, workerFactory = undefined, undoBytes = UV_UNDO_BYTES } = {}) {
  const s = uvSessionOf(mesh);
  /** @type {'vertex' | 'edge' | 'face' | 'island'} */
  let mode = 'face';
  let shownSub = sub;
  /** @type {Set<number>} */
  let sel = new Set();
  let undo = [], redo = [];
  let dragStart = null;
  let gen = 0;
  let selGen = 0;
  let uvGen = 0;
  let busy = false;
  let thread = null;
  let disposed = false;
  const shownFaces = () => { const out = []; for (let f = 0; f < s.faces; f++) if (s.triSub[f] === shownSub) out.push(f); return out; };
  const uv = (c) => [s.cornerUv[c * 2], s.cornerUv[c * 2 + 1]];

  let topoCache = null;
  const topo = () => {
    if (!topoCache || topoCache.uvGen !== uvGen || topoCache.sub !== shownSub) topoCache = { uvGen, sub: shownSub, ...uvVertices(s, shownFaces()) };
    return topoCache;
  };
  const islandOf = (f) => { const t = topo(), i = t.islandOf[f]; return i >= 0 ? t.islands[i] : [f]; };

  const kept = Float64Array.from(s.cornerUv);
  let held = 0, dropped = false;
  const bytesOf = (e) => e.corners.byteLength + e.uv.byteLength + 64 * (e.add.length + e.del.length + 1);
  const clearRedo = () => { for (const e of redo) held -= bytesOf(e); redo = []; };
  const record = (within, marked = [], cleared = []) => {
    const cs = [];
    const look = (c) => { if (s.cornerUv[c * 2] !== kept[c * 2] || s.cornerUv[c * 2 + 1] !== kept[c * 2 + 1]) cs.push(c); };
    if (within) for (const c of within) look(c); else for (let c = 0; c < s.faces * 3; c++) look(c);
    if (!cs.length && !marked.length && !cleared.length) return false;
    const corners = Int32Array.from(new Set(cs)), was = new Float64Array(corners.length * 2);
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      was[i * 2] = kept[c * 2]; was[i * 2 + 1] = kept[c * 2 + 1];
      kept[c * 2] = s.cornerUv[c * 2]; kept[c * 2 + 1] = s.cornerUv[c * 2 + 1];
    }
    const e = { corners, uv: was, add: cleared, del: marked };
    clearRedo();
    undo.push(e); held += bytesOf(e);
    while (undo.length > UV_UNDO_DEPTH || (held > undoBytes && undo.length > 1)) { held -= bytesOf(undo.shift()); dropped = true; }
    uvGen++; gen++;
    return true;
  };
  const swap = (e) => {
    for (let i = 0; i < e.corners.length; i++) for (let h = 0; h < 2; h++) {
      const a = e.corners[i] * 2 + h, was = s.cornerUv[a];
      s.cornerUv[a] = kept[a] = e.uv[i * 2 + h];
      e.uv[i * 2 + h] = was;
    }
    for (const k of e.del) s.seams.delete(k);
    for (const k of e.add) s.seams.add(k);
    [e.add, e.del] = [e.del, e.add];
    uvGen++; gen++;
  };
  const step = (fn, within = null) => { if (busy) return false; fn(); return record(within); };

  function selectedFaces() {
    if (!sel.size) return shownFaces();
    const out = new Set();
    if (mode === 'face' || mode === 'island') for (const f of sel) out.add(f);
    else if (mode === 'edge') for (const e of sel) out.add(Math.floor(e / 3));
    else for (const c of sel) out.add(Math.floor(c / 3));
    return [...out];
  }
  let cornersCache = null;
  function selectedCorners() {
    if (!sel.size) return cornersOf(shownFaces());
    const t = topo();
    if (cornersCache && cornersCache.selGen === selGen && cornersCache.topo === t) return cornersCache.out;
    const seen = new Uint8Array(t.start.length - 1), out = [];
    const addVertex = (c) => {
      const v = t.vertOf[c];
      if (v < 0 || seen[v]) return;
      seen[v] = 1;
      for (let p = t.start[v]; p < t.start[v + 1]; p++) out.push(t.corners[p]);
    };
    if (mode === 'vertex') for (const c of sel) addVertex(c);
    else if (mode === 'edge') for (const e of sel) { const f = Math.floor(e / 3), i = e % 3; addVertex(f * 3 + i); addVertex(f * 3 + (i + 1) % 3); }
    else for (const f of sel) for (let k = 0; k < 3; k++) addVertex(f * 3 + k);
    cornersCache = { selGen, topo: t, out };
    return out;
  }
  const selChanged = () => { selGen++; gen++; };
  const lay = (corners, uvs) => {
    for (let i = 0; i < corners.length; i++) { const c = corners[i]; s.cornerUv[c * 2] = uvs[i * 2]; s.cornerUv[c * 2 + 1] = uvs[i * 2 + 1]; }
    record(corners);
  };

  const api = {
    session: s,
    generation: () => gen,
    mode: () => mode,
    setMode(/** @type {'vertex' | 'edge' | 'face' | 'island'} */ m) { if (m !== mode) { mode = m; sel = new Set(); selChanged(); } },
    submesh: () => shownSub,
    setSubmesh(n) { if (n >= 0 && n < s.submeshes && n !== shownSub) { shownSub = n; sel = new Set(); selChanged(); } },
    faces: shownFaces,
    selection: () => new Set(sel),
    selectedCorners,
    selectedFaces,
    clear() { if (sel.size) { sel = new Set(); selChanged(); } },
    selectAll() {
      sel = new Set();
      if (mode === 'vertex') for (const c of cornersOf(shownFaces())) sel.add(c);
      else if (mode === 'edge') for (const f of shownFaces()) for (let i = 0; i < 3; i++) sel.add(f * 3 + i);
      else for (const f of shownFaces()) sel.add(f);
      selChanged();
    },

    pick(u, v, reach, add = false) {
      const p = [u, v];
      let hit = null;
      const faces = shownFaces();
      if (mode === 'vertex') {
        let best = reach;
        for (const c of cornersOf(faces)) { const d = Math.hypot(uv(c)[0] - u, uv(c)[1] - v); if (d <= best) { best = d; hit = c; } }
      } else if (mode === 'edge') {
        let best = reach;
        for (const f of faces) for (let i = 0; i < 3; i++) { const d = segDist(p, uv(f * 3 + i), uv(f * 3 + (i + 1) % 3)); if (d <= best) { best = d; hit = f * 3 + i; } }
      } else {
        for (const f of faces) if (inTri(p, uv(f * 3), uv(f * 3 + 1), uv(f * 3 + 2))) { hit = f; break; }
      }
      const items = hit === null ? [] : mode === 'island' ? islandOf(hit) : [hit];
      if (!add) sel = new Set();
      const all = items.length && items.every((x) => sel.has(x));
      for (const x of items) { if (add && all) sel.delete(x); else sel.add(x); }
      selChanged();
      return hit;
    },
    box(u0, v0, u1, v1, add = false) {
      const [a0, a1] = [Math.min(u0, u1), Math.max(u0, u1)], [b0, b1] = [Math.min(v0, v1), Math.max(v0, v1)];
      const inside = (q) => q[0] >= a0 && q[0] <= a1 && q[1] >= b0 && q[1] <= b1;
      if (!add) sel = new Set();
      const faces = shownFaces();
      if (mode === 'vertex') { for (const c of cornersOf(faces)) if (inside(uv(c))) sel.add(c); }
      else if (mode === 'edge') { for (const f of faces) for (let i = 0; i < 3; i++) if (inside(uv(f * 3 + i)) && inside(uv(f * 3 + (i + 1) % 3))) sel.add(f * 3 + i); }
      else {
        const t = mode === 'island' ? topo() : null, taken = t ? new Uint8Array(t.islands.length) : null;
        for (const f of faces) {
          const c = [(uv(f * 3)[0] + uv(f * 3 + 1)[0] + uv(f * 3 + 2)[0]) / 3, (uv(f * 3)[1] + uv(f * 3 + 1)[1] + uv(f * 3 + 2)[1]) / 3];
          if (!inside(c)) continue;
          if (!t) { sel.add(f); continue; }
          const i = t.islandOf[f];
          if (i < 0) { sel.add(f); continue; }
          if (taken[i]) continue;
          taken[i] = 1;
          for (const g of t.islands[i]) sel.add(g);
        }
      }
      selChanged();
    },

    pivot: () => uvCentre(s, selectedCorners()),
    transform(op) { const cs = selectedCorners(); const pivot = uvCentre(s, cs); return step(() => transformCorners(s, cs, { ...op, pivot: op.pivot ?? pivot }), cs); },
    begin() { if (busy) return; const cs = selectedCorners(); dragStart = { corners: cs, pivot: uvCentre(s, cs) }; },
    drag(op) {
      if (!dragStart) return;
      for (const c of dragStart.corners) { s.cornerUv[c * 2] = kept[c * 2]; s.cornerUv[c * 2 + 1] = kept[c * 2 + 1]; }
      transformCorners(s, dragStart.corners, { ...op, pivot: op.pivot ?? dragStart.pivot });
      gen++;
    },
    end() {
      if (!dragStart) return false;
      const cs = dragStart.corners;
      dragStart = null;
      return record(cs);
    },
    cancel() {
      if (!dragStart) return;
      for (const c of dragStart.corners) { s.cornerUv[c * 2] = kept[c * 2]; s.cornerUv[c * 2 + 1] = kept[c * 2 + 1]; }
      dragStart = null; gen++;
    },
    dragging: () => !!dragStart,
    flip(/** @type {'u' | 'v'} */ axis) { return api.transform({ scale: axis === 'u' ? [-1, 1] : [1, -1] }); },

    seams(on) {
      if (busy || mode !== 'edge' || !sel.size) return 0;
      const changed = [];
      for (const e of sel) {
        const f = Math.floor(e / 3), i = e % 3;
        const a = s.weld[s.tris[f * 3 + i]], b = s.weld[s.tris[f * 3 + (i + 1) % 3]];
        const had = s.seams.has(edgeKey(a, b));
        if (had !== on && setSeam(s, a, b, on)) changed.push(edgeKey(a, b));
      }
      record([], on ? changed : [], on ? [] : changed);
      return changed.length;
    },
    unwrap() {
      if (busy) return 0;
      const fs = selectedFaces();
      let pieces = [];
      step(() => { pieces = unwrapLscm(s, fs); });
      return pieces.length;
    },
    async unwrapOffThread() {
      if (busy || disposed) return 0;
      const fs = selectedFaces();
      thread ??= createUnwrapThread(mesh, { workerFactory });
      const seams = [];
      for (const k of s.seams) { const i = k.indexOf('_'); seams.push(Number(k.slice(0, i)), Number(k.slice(i + 1))); }
      busy = true; gen++;
      let r = null;
      try { r = await thread.unwrap(fs, seams); }
      finally { busy = false; gen++; }
      if (disposed) return 0;
      if (!r) {
        let pieces = [];
        step(() => { pieces = unwrapLscm(s, fs); });
        return pieces.length;
      }
      lay(r.corners, r.uvs);
      return r.pieces;
    },
    busy: () => busy,
    project(kind, axis = 'y') {
      const fs = selectedFaces();
      const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis] ?? [0, 1, 0];
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const c of cornersOf(fs)) { const v = s.tris[c]; cx += s.positions[v * 3]; cy += s.positions[v * 3 + 1]; cz += s.positions[v * 3 + 2]; n++; }
      const centre = n ? [cx / n, cy / n, cz / n] : [0, 0, 0];
      return step(() => {
        if (kind === 'box') projectBox(s, fs);
        else if (kind === 'cylinder') projectCylinder(s, fs, dir, centre);
        else if (kind === 'sphere') projectSphere(s, fs, centre);
        else projectPlanar(s, fs, { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[kind] ?? dir);
      });
    },
    pack({ margin = 0.01, rotate = true } = {}) {
      if (busy) return 0;
      const isl = uvIslandsOf(s, selectedFaces());
      let k = 0;
      step(() => { k = packIslands(s, isl, { margin, rotate }); });
      return k;
    },
    fit() {
      const cs = selectedCorners();
      const [u0, v0, u1, v1] = uvBounds(s, cs);
      const w = u1 - u0, h = v1 - v0, k = 1 / Math.max(w, h, 1e-9);
      return step(() => transformCorners(s, cs, { pivot: [u0, v0], scale: [k, k], move: [-u0, -v0] }), cs);
    },
    density: (w, h) => texelDensity(s, selectedFaces(), w, h),
    setDensity(target, w, h) { const isl = uvIslandsOf(s, selectedFaces()); return step(() => setTexelDensity(s, isl, target, w, h)); },

    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    undo() { if (busy) return false; const e = undo.pop(); if (!e) return false; swap(e); redo.push(e); return true; },
    redo() { if (busy) return false; const e = redo.pop(); if (!e) return false; swap(e); undo.push(e); return true; },
    changed: () => undo.length > 0 || dropped,
    undoBytes: () => held,
    result: () => meshFromSession(s),
    faceUvs(f) { return [uv(f * 3), uv(f * 3 + 1), uv(f * 3 + 2)]; },
    isSeam(f, i) { return s.seams.has(edgeKey(s.weld[s.tris[f * 3 + i]], s.weld[s.tris[f * 3 + (i + 1) % 3]])); },
    dispose() { disposed = true; thread?.close(); thread = null; },
  };
  return api;
}
