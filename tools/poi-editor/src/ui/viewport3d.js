// @ts-check

// The 3D viewport: WebGL2 for the scene, a 2D canvas on top for text and the selection box.
// It draws the document in the POI's own frame (metres, +x east, +y up, +z north) and never pretends to be the world:
// there is no terrain here, and the banner says so. It reads the document and the selection each frame
// and tells the editor what the builder did through `on`.

import { createCamera, matrices, rayAt, orbit, pan, zoom, fly, frame, project, groundAt } from '../camera.js';
import { buildTree, find } from '../scene.js';
import { mat4FromQuatPosScale } from '../../../../src/world/quat.js';
import { gizmoSize, gizmoShape, pickHandle, beginGizmoDrag, dragResult, POI_SNAP_DEFAULT } from '../../../../src/poi/poiGizmo.js';
import { mapMetresOf } from '../../../../src/poi/poiEdit.js';
import { POI_PIXEL_M } from '../../../../src/poi/poiLaw.js';
import { moveNodes, turnNodes, sizeNodes, movable, centroid } from '../transforms.js';

const GLOBAL_SCALE = 0.025;
const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUv;
uniform mat4 uVP; uniform mat4 uModel;
out vec3 vN; out vec2 vUv;
void main(){ vN = mat3(uModel) * aNrm; vUv = aUv; gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;
const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec2 vUv; uniform sampler2D uTex; uniform vec4 uTint; uniform float uHasTex;
out vec4 o;
void main(){
  vec4 c = uHasTex > 0.5 ? texture(uTex, vUv) : vec4(0.72, 0.72, 0.74, 1.0);
  if (c.a < 0.1) discard;
  float l = 0.45 + 0.55 * abs(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.3))));
  o = vec4(c.rgb * l * uTint.rgb, c.a * uTint.a);
}`;
const LVS = `#version 300 es
in vec3 aPos; uniform mat4 uVP; void main(){ gl_Position = uVP * vec4(aPos, 1.0); }`;
const LFS = `#version 300 es
precision mediump float; uniform vec4 uColor; out vec4 o; void main(){ o = uColor; }`;

function program(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader'); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

/** The eight corners of a box `[min, max]` as 12 line segments (24 points). */
function boxLines(min, max) {
  const c = (i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
  const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return e.flatMap(([a, b]) => [...c(a), ...c(b)]);
}

const ring = (c, r, axis, n = 40) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const p = (t) => (axis === 1 ? [c[0] + Math.cos(t) * r, c[1], c[2] + Math.sin(t) * r] : axis === 0 ? [c[0], c[1] + Math.cos(t) * r, c[2] + Math.sin(t) * r] : [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r, c[2]]);
    out.push(...p(a), ...p(b));
  }
  return out;
};

/**
 * @param {{ canvas: HTMLCanvasElement, hud: HTMLCanvasElement, arena: any, getDoc: () => any, getSel: () => string[],
 *   edit: any, docId: () => string | null, on: { select: (ids: string[], how: 'set' | 'add' | 'toggle') => void, cursor?: (text: string) => void, changed?: () => void } }} o
 */
export function createViewport({ canvas, hud, arena, getDoc, getSel, edit, docId, on }) {
  const gl = /** @type {WebGL2RenderingContext | null} */ (canvas.getContext('webgl2', { antialias: true }));
  if (!gl) { const c = hud.getContext('2d'); if (c) { c.fillStyle = '#ddd'; c.fillText('WebGL2 is not available in this browser.', 12, 24); } return null; }
  const g = gl;
  const hctx = /** @type {CanvasRenderingContext2D} */ (hud.getContext('2d'));
  const cam = createCamera();
  const state = { mode: /** @type {'select' | 'move' | 'turn' | 'size'} */ ('move'), space: /** @type {'world' | 'local'} */ ('world'), snap: { ...POI_SNAP_DEFAULT }, snapOn: true, showGrid: true, wire: false, dirty: true };
  const meshP = program(g, VS, FS), lineP = program(g, LVS, LFS);
  const uni = (p, n) => g.getUniformLocation(p, n);
  const U = { vp: uni(meshP, 'uVP'), model: uni(meshP, 'uModel'), tex: uni(meshP, 'uTex'), tint: uni(meshP, 'uTint'), has: uni(meshP, 'uHasTex'), lvp: uni(lineP, 'uVP'), color: uni(lineP, 'uColor') };
  const lineBuf = g.createBuffer();
  const white = g.createTexture();
  g.bindTexture(g.TEXTURE_2D, white); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  /** @type {Map<number, any>} */ const gpuModels = new Map();
  /** @type {Map<string, WebGLTexture | 'loading'>} */ const gpuTex = new Map();
  const dirty = () => { state.dirty = true; };

  function textureOf(a, r) {
    const k = `${a}.${r}`;
    const have = gpuTex.get(k);
    if (have === 'loading' || have === undefined) {
      if (have === undefined) {
        gpuTex.set(k, 'loading');
        arena.picture(a, r).then((pic) => {
          if (!pic) { gpuTex.delete(k); gpuTex.set(k, /** @type {any} */ (null)); return; }
          const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, pic.width, pic.height, 0, g.RGBA, g.UNSIGNED_BYTE, pic.data);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
          gpuTex.set(k, t); dirty();
        });
      }
      return null;
    }
    return have;
  }

  /** @type {Set<number>} */ const asking = new Set();
  function gpuModel(id) {
    if (gpuModels.has(id)) return gpuModels.get(id);
    if (arena.state() !== 'loaded') return null;
    if (!asking.has(id)) { asking.add(id); arena.warm(id).then(() => { const m = arena.model(id); if (!m) { gpuModels.set(id, null); return; } gpuModels.set(id, upload(m)); dirty(); }); }
    return null;
  }
  function upload(m) {
    const n = m.positions.length / 3, inter = new Float32Array(n * 8);
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { const v = m.positions[i * 3 + k]; inter[i * 8 + k] = v; inter[i * 8 + 3 + k] = m.normals[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      inter[i * 8 + 6] = m.uvs[i * 2]; inter[i * 8 + 7] = m.uvs[i * 2 + 1];
    }
    const vbo = g.createBuffer(), ibo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, vbo); g.bufferData(g.ARRAY_BUFFER, inter, g.STATIC_DRAW);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo); g.bufferData(g.ELEMENT_ARRAY_BUFFER, m.indices, g.STATIC_DRAW);
    return { vbo, ibo, subs: m.subMeshes, min, max };
  }

  // ── what a node is, in the POI's frame ──
  /** @returns {{ model: number[], min: number[], max: number[], model3d?: any } | null} */
  function placed(kind, row) {
    if (kind === 'part') {
      const s = row.s ?? [1, 1, 1];
      const m = mat4FromQuatPosScale(row.r ?? [0, 0, 0, 1], row.t ?? [0, 0, 0], s);
      const gm = typeof row.arch3d === 'number' ? gpuModel(row.arch3d) : null;
      const lo = gm ? gm.min : [-0.5, 0, -0.5], hi = gm ? gm.max : [0.5, 1, 0.5];
      return { model: m, min: lo, max: hi, model3d: gm };
    }
    if (kind === 'light') return { model: mat4FromQuatPosScale([0, 0, 0, 1], row.t ?? [0, 0, 0], [1, 1, 1]), min: [-0.3, -0.3, -0.3], max: [0.3, 0.3, 0.3] };
    if (kind === 'npc') { const h = row.h ?? 1.8; return { model: mat4FromQuatPosScale([0, 0, 0, 1], row.t ?? [0, 0, 0], [1, 1, 1]), min: [-0.35, 0, -0.35], max: [0.35, h, 0.35] }; }
    if (kind === 'flat') { const [w, h] = flatSize(row); return { model: mat4FromQuatPosScale([0, 0, 0, 1], row.t ?? [0, 0, 0], [1, 1, 1]), min: [-w / 2, 0, -w / 2], max: [w / 2, h, w / 2] }; }
    return null;
  }
  function flatSize(row) {
    const pair = Array.isArray(row.flat) ? row.flat : null;
    const pic = pair ? flatPics.get(`${pair[0]}.${pair[1]}`) : null;
    if (pair && pic === undefined) { flatPics.set(`${pair[0]}.${pair[1]}`, null); arena.picture(pair[0], pair[1]).then((p) => { flatPics.set(`${pair[0]}.${pair[1]}`, p); dirty(); }); }
    const sc = (row.scale ?? 1) * GLOBAL_SCALE;
    return pic ? [pic.width * sc, pic.height * sc] : [1 * (row.scale ?? 1), 1.5 * (row.scale ?? 1)];
  }
  /** @type {Map<string, any>} */ const flatPics = new Map();

  const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  function worldBox(pl) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < 8; i++) { const p = xform(pl.model, [i & 1 ? pl.max[0] : pl.min[0], i & 2 ? pl.max[1] : pl.min[1], i & 4 ? pl.max[2] : pl.min[2]]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
    return { lo, hi };
  }

  /** Every drawable node with its box, tree order. */
  function nodes() {
    const doc = getDoc();
    if (!doc) return [];
    const out = [];
    const walk = (ns) => ns.forEach((n) => {
      if (n.kind !== 'group') { const f = find(doc, n.id); const pl = f ? placed(n.kind, f.row) : null; if (f && pl) out.push({ id: n.id, kind: n.kind, row: f.row, hidden: n.hidden, frozen: n.frozen, pl, box: worldBox(pl) }); }
      walk(n.children);
    });
    walk(buildTree(doc));
    return out;
  }

  // ── drawing ──
  function lines(pts, color, width = 1) {
    if (!pts.length) return;
    g.bindBuffer(g.ARRAY_BUFFER, lineBuf); g.bufferData(g.ARRAY_BUFFER, new Float32Array(pts), g.DYNAMIC_DRAW);
    const loc = g.getAttribLocation(lineP, 'aPos'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 3, g.FLOAT, false, 0, 0);
    g.uniform4fv(U.color, color); g.lineWidth(width);
    g.drawArrays(g.LINES, 0, pts.length / 3);
  }

  function gridLines(m) {
    const step = cam.mode === 'persp' ? (cam.dist > 120 ? 10 : 1) : Math.pow(10, Math.max(0, Math.floor(Math.log10(cam.orthoH / 3))));
    const span = Math.min(200, step * 50);
    const cx = Math.round(cam.target[0] / step) * step, cz = Math.round(cam.target[2] / step) * step, cy = Math.round(cam.target[1] / step) * step;
    const minor = [], major = [];
    for (let i = -span; i <= span; i += step) {
      const isMajor = Math.round((cx + i) / (step * 10)) * step * 10 === cx + i;
      const planeFront = cam.mode === 'front', planeSide = cam.mode === 'side';
      if (planeFront) { (isMajor ? major : minor).push(cx + i, -span, cam.target[2], cx + i, span, cam.target[2]); minor.push(cx - span, cy + i, cam.target[2], cx + span, cy + i, cam.target[2]); }
      else if (planeSide) { minor.push(cam.target[0], -span, cz + i, cam.target[0], span, cz + i); minor.push(cam.target[0], cy + i, cz - span, cam.target[0], cy + i, cz + span); }
      else { (isMajor ? major : minor).push(cx + i, 0, cz - span, cx + i, 0, cz + span); minor.push(cx - span, 0, cz + i, cx + span, 0, cz + i); }
    }
    lines(minor, [0.35, 0.37, 0.42, 0.55]); lines(major, [0.5, 0.52, 0.6, 0.8]);
    lines([-span * 2, 0.01, 0, span * 2, 0.01, 0], [0.85, 0.3, 0.3, 1], 2);   // +x east
    lines([0, 0.01, -span * 2, 0, 0.01, span * 2], [0.3, 0.5, 0.9, 1], 2);    // +z north
    lines([0, 0, 0, 0, span, 0], [0.3, 0.8, 0.4, 1], 2);
    void m;
  }

  function drawMeshNode(n, vp, tint) {
    const gm = n.pl.model3d;
    if (!gm) return;
    g.useProgram(meshP);
    g.uniformMatrix4fv(U.vp, false, vp); g.uniformMatrix4fv(U.model, false, n.pl.model);
    g.bindBuffer(g.ARRAY_BUFFER, gm.vbo); g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, gm.ibo);
    for (const [name, size, off] of /** @type {[string, number, number][]} */ ([['aPos', 3, 0], ['aNrm', 3, 12], ['aUv', 2, 24]])) { const loc = g.getAttribLocation(meshP, name); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, size, g.FLOAT, false, 32, off); }
    g.uniform4fv(U.tint, tint); g.uniform1i(U.tex, 0);
    for (const sm of gm.subs) {
      const t = textureOf(sm.textureArchive, sm.textureRecord);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, t ?? white); g.uniform1f(U.has, t ? 1 : 0);
      g.drawElements(g.TRIANGLES, sm.primitiveCount * 3, g.UNSIGNED_INT, sm.startIndex * 4);
    }
  }

  function render() {
    state.dirty = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.floor(canvas.clientWidth * dpr)), H = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; hud.width = W; hud.height = H; }
    g.viewport(0, 0, W, H); g.clearColor(0.13, 0.14, 0.17, 1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.enable(g.DEPTH_TEST); g.disable(g.CULL_FACE); g.enable(g.BLEND); g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    const aspect = W / H, mm = matrices(cam, aspect), sel = new Set(getSel());
    g.useProgram(lineP); g.uniformMatrix4fv(U.lvp, false, mm.vp);
    if (state.showGrid) gridLines(mm);
    const list = nodes();
    for (const n of list) {
      if (n.hidden) continue;
      const isSel = sel.has(n.id);
      if (n.kind === 'part' && n.pl.model3d) drawMeshNode(n, mm.vp, n.frozen ? [0.7, 0.7, 0.8, 1] : [1, 1, 1, 1]);
    }
    g.useProgram(lineP); g.uniformMatrix4fv(U.lvp, false, mm.vp);
    for (const n of list) {
      if (n.hidden) continue;
      const isSel = sel.has(n.id), c = isSel ? [1, 0.62, 0.15, 1] : n.frozen ? [0.5, 0.5, 0.55, 0.9] : [0.55, 0.75, 1, 0.9];
      const t = n.row.t ?? [0, 0, 0];
      if (n.kind === 'light') { const r = n.row.radius ?? 5; lines([...ring(t, 0.3, 1), ...ring(t, 0.3, 0)], c); lines([...ring(t, r, 1), ...ring(t, r, 0), ...ring(t, r, 2)], [n.row.color?.[0] ?? 1, n.row.color?.[1] ?? 0.85, n.row.color?.[2] ?? 0.6, 0.35]); }
      else if (n.kind === 'npc') { const h = n.row.h ?? 1.8; lines([...ring(t, 0.3, 1), ...ring([t[0], t[1] + h, t[2]], 0.3, 1), t[0] - 0.3, t[1], t[2], t[0] - 0.3, t[1] + h, t[2], t[0] + 0.3, t[1], t[2], t[0] + 0.3, t[1] + h, t[2]], c); }
      else if (n.kind === 'flat') { drawFlat(n, mm, c); }
      else if (n.kind === 'part' && (!n.pl.model3d || isSel)) lines(boxLines(n.box.lo, n.box.hi), n.pl.model3d ? c : [0.6, 0.5, 0.9, 0.9]);
      if (isSel && n.kind !== 'part') lines(boxLines(n.box.lo, n.box.hi), c);
    }
    drawGizmo(mm, H);
    drawHud(W, H, aspect, mm);
  }

  function drawFlat(n, mm, c) {
    const [w, h] = flatSize(n.row), t = n.row.t ?? [0, 0, 0];
    const right = [mm.view[0], mm.view[4], mm.view[8]];
    const a = [t[0] - right[0] * w / 2, t[1], t[2] - right[2] * w / 2], b = [t[0] + right[0] * w / 2, t[1], t[2] + right[2] * w / 2];
    lines([...a, ...b, ...b, b[0], b[1] + h, b[2], b[0], b[1] + h, b[2], a[0], a[1] + h, a[2], a[0], a[1] + h, a[2], ...a], c, 1);
  }

  // ── the gizmo ──
  function gizmo(aspect, H) {
    const ids = movable(getDoc() ?? {}, getSel());
    if (!ids.length || state.mode === 'select') return null;
    const c = centroid(getDoc(), ids);
    if (!c) return null;
    const mm = matrices(cam, aspect);
    const L = cam.mode === 'persp' ? gizmoSize(mm.eye, mm.viewDir, c, cam.fovY, H) : (110 * 2 * cam.orthoH) / H;
    const pxWorld = cam.mode === 'persp' ? gizmoSize(mm.eye, mm.viewDir, c, cam.fovY, H, 1) : (2 * cam.orthoH) / H;
    const axes = state.space === 'local' && ids.length === 1 ? localAxes(ids[0]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    return { mode: /** @type {'move' | 'turn' | 'size'} */ (state.mode), c, axes, L, viewDir: mm.viewDir, pxWorld };
  }
  function localAxes(id) {
    const f = find(getDoc(), id);
    const q = f?.row.r;
    if (!q) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const m = mat4FromQuatPosScale(q, [0, 0, 0], [1, 1, 1]);
    return [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  }
  function drawGizmo(mm, H) {
    const gz = gizmo(mm.proj[5] ? canvas.width / canvas.height : 1, H);
    if (!gz) return;
    g.disable(g.DEPTH_TEST);
    const cols = { x: [0.95, 0.3, 0.3, 1], y: [0.35, 0.85, 0.4, 1], z: [0.35, 0.55, 1, 1], view: [0.9, 0.9, 0.9, 1] };
    for (const s of gizmoShape(gz.mode, gz.c, gz.axes, gz.L, gz.viewDir)) {
      if (s.hidden) continue;
      const col = s.handle === drag?.handle || s.handle === hover ? [1, 0.95, 0.3, 1] : cols[s.handle[0] === 'x' && s.handle.length === 1 ? 'x' : s.handle === 'y' ? 'y' : s.handle === 'z' ? 'z' : 'view'];
      lines(s.segs.flat(2), col, 2);
    }
    g.enable(g.DEPTH_TEST);
  }

  function drawHud(W, H, aspect, mm) {
    hctx.clearRect(0, 0, W, H);
    const dpr = W / canvas.clientWidth;
    hctx.font = `${12 * dpr}px system-ui, sans-serif`; hctx.textBaseline = 'top';
    const doc = getDoc();
    const text = (s, x, y, c = '#cfd3dc') => { hctx.fillStyle = c; hctx.fillText(s, x * dpr, y * dpr); };
    if (!doc) { text('No POI open. Create one or open a draft from the File menu.', 14, 14); return; }
    text(`${cam.mode === 'persp' ? 'Perspective' : cam.mode[0].toUpperCase() + cam.mode.slice(1)}  |  ${state.mode}  |  ${state.space}  |  snap ${state.snapOn ? `${state.snap.move} m, ${state.snap.turn} deg` : 'off'}`, 12, 10, '#9aa3b5');
    if (arena.state() !== 'loaded') text('Game files not found: models and pictures show as boxes. Set ARENA2_PATH and restart.', 12, 28, '#e8c26a');
    text('No terrain here: the grid is metres from the POI, not the ground.', 12, H / dpr - 22, '#e8c26a');
    const [mx, mz] = mapMetresOf(doc.place);
    if (cursor) { const gp = groundAt(rayAt(cam, aspect, cursor.nx, cursor.ny), 0); if (gp) { const X = mx + gp[0], Z = mz + gp[2]; text(`x ${gp[0].toFixed(2)}  z ${gp[2].toFixed(2)}  |  map ${X.toFixed(1)}, ${Z.toFixed(1)} m  |  pixel ${(X / POI_PIXEL_M).toFixed(2)}, ${(-Z / POI_PIXEL_M).toFixed(2)}`, 12, H / dpr - 40, '#9aa3b5'); } }
    if (box) { hctx.strokeStyle = '#ffb347'; hctx.fillStyle = 'rgba(255,179,71,0.12)'; const x = Math.min(box.x0, box.x1) * dpr, y = Math.min(box.y0, box.y1) * dpr, w = Math.abs(box.x1 - box.x0) * dpr, h = Math.abs(box.y1 - box.y0) * dpr; hctx.fillRect(x, y, w, h); hctx.strokeRect(x, y, w, h); }
    void mm;
  }

  // ── input ──
  /** @type {{ nx: number, ny: number } | null} */ let cursor = null;
  /** @type {string | null} */ let hover = null;
  /** @type {{ handle: string, s: any, ids: string[], pivot: number[] } | null} */ let drag = null;
  /** @type {{ x0: number, y0: number, x1: number, y1: number } | null} */ let box = null;
  /** @type {{ kind: 'orbit' | 'pan', x: number, y: number } | null} */ let cam_drag = null;
  const keys = new Set();

  const aspectNow = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -(((e.clientY - r.top) / r.height) * 2 - 1), x: e.clientX - r.left, y: e.clientY - r.top }; };

  function pickNode(nx, ny) {
    const ray = rayAt(cam, aspectNow(), nx, ny);
    let best = null, bt = Infinity;
    for (const n of nodes()) {
      if (n.hidden || n.frozen) continue;
      let t0 = 0, t1 = Infinity, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const d = ray.d[k], o = ray.o[k];
        if (Math.abs(d) < 1e-9) { if (o < n.box.lo[k] || o > n.box.hi[k]) ok = false; continue; }
        let a = (n.box.lo[k] - o) / d, b = (n.box.hi[k] - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) ok = false;
      }
      if (ok && t0 < bt) { bt = t0; best = n.id; }
    }
    return best;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); canvas.focus();
    const p = ndc(e);
    if (e.button === 2 || (e.button === 0 && e.altKey)) { cam_drag = { kind: 'orbit', x: e.clientX, y: e.clientY }; return; }
    if (e.button === 1) { cam_drag = { kind: 'pan', x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    const gz = gizmo(aspectNow(), canvas.clientHeight);
    if (gz) {
      const ray = rayAt(cam, aspectNow(), p.nx, p.ny);
      const h = pickHandle(gz, ray.o, ray.d);
      if (h) {
        const s = beginGizmoDrag(gz, h, ray.o, ray.d);
        const id = docId();
        if (s && id) { edit.begin(id, `${state.mode} nodes`); drag = { handle: h, s, ids: movable(getDoc(), getSel()), pivot: gz.c }; return; }
      }
    }
    const hit = pickNode(p.nx, p.ny);
    if (hit) { on.select([hit], e.shiftKey ? 'add' : e.ctrlKey || e.metaKey ? 'toggle' : 'set'); box = null; }
    else box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, ...{ add: e.shiftKey } };
    dirty();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ndc(e);
    cursor = { nx: p.nx, ny: p.ny };
    if (cam_drag) {
      const dx = e.clientX - cam_drag.x, dy = e.clientY - cam_drag.y; cam_drag.x = e.clientX; cam_drag.y = e.clientY;
      if (cam_drag.kind === 'orbit') orbit(cam, dx, dy); else pan(cam, dx, dy, canvas.clientHeight, aspectNow());
      dirty(); return;
    }
    if (drag) {
      const ray = rayAt(cam, aspectNow(), p.nx, p.ny);
      const r = dragResult(drag.s, ray.o, ray.d, state.snapOn ? state.snap : null);
      if (r) edit.preview((d) => { if (r.move) moveNodes(d, drag?.ids ?? [], r.move); else if (r.turn) turnNodes(d, drag?.ids ?? [], r.turn.axis, r.turn.deg, drag?.pivot); else if (r.size) sizeNodes(d, drag?.ids ?? [], r.size); });
      dirty(); return;
    }
    if (box) { box.x1 = p.x; box.y1 = p.y; dirty(); return; }
    const gz = gizmo(aspectNow(), canvas.clientHeight);
    const before = hover;
    if (gz) { const ray = rayAt(cam, aspectNow(), p.nx, p.ny); hover = pickHandle(gz, ray.o, ray.d); } else hover = null;
    dirty(); void before;
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture(e.pointerId);
    if (cam_drag) { cam_drag = null; return; }
    if (drag) { edit.commit(); drag = null; on.changed?.(); dirty(); return; }
    if (box) {
      const b = box; box = null;
      if (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 4) { if (!(/** @type {any} */ (b)).add) on.select([], 'set'); }
      else {
        const aspect = aspectNow(), w = canvas.clientWidth, h = canvas.clientHeight;
        const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
        const hits = nodes().filter((n) => !n.hidden && !n.frozen).filter((n) => { const c = [(n.box.lo[0] + n.box.hi[0]) / 2, (n.box.lo[1] + n.box.hi[1]) / 2, (n.box.lo[2] + n.box.hi[2]) / 2]; const s = project(cam, aspect, c); if (!s) return false; const sx = (s.x * 0.5 + 0.5) * w, sy = (1 - (s.y * 0.5 + 0.5)) * h; return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1; }).map((n) => n.id);
        on.select(hits, (/** @type {any} */ (b)).add ? 'add' : 'set');
      }
      dirty();
    }
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(cam, e.deltaY > 0 ? 1.12 : 1 / 1.12); dirty(); }, { passive: false });
  canvas.addEventListener('pointerleave', () => { cursor = null; dirty(); });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
  canvas.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener('blur', () => keys.clear());

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (cam_drag?.kind === 'orbit' && cam.mode === 'persp') {
      const sp = (keys.has('shift') ? 30 : 8) * dt;
      const mv = [(keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0), (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0)];
      if (mv.some(Boolean)) { fly(cam, mv.map((v) => v * sp)); dirty(); }
    }
    if (state.dirty) { try { render(); } catch (err) { console.error('[viewport]', err); } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  new ResizeObserver(dirty).observe(canvas);

  return {
    camera: cam, state, dirty,
    setMode(m) { state.mode = m; dirty(); },
    setCamera(mode) { cam.mode = mode; dirty(); },
    /** Frame the selection, or everything. */
    frameSelection() {
      const sel = new Set(getSel());
      const list = nodes().filter((n) => !n.hidden && (!sel.size || sel.has(n.id)));
      if (!list.length) { frame(cam, [0, 1, 0], 6); dirty(); return; }
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const n of list) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], n.box.lo[k]); hi[k] = Math.max(hi[k], n.box.hi[k]); }
      frame(cam, lo.map((v, k) => (v + hi[k]) / 2), Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      dirty();
    },
    /** The ground point (y 0) under a client point, in the POI's frame, or null. */
    groundAtClient(clientX, clientY) { const r = canvas.getBoundingClientRect(); return groundAt(rayAt(cam, aspectNow(), ((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)), 0); },
    /** Where the 3D box of a node is, for the inspector and the tests. */
    boxes: () => nodes().map((n) => ({ id: n.id, lo: n.box.lo, hi: n.box.hi, hidden: n.hidden, frozen: n.frozen })),
  };
}
