// @ts-check

// The viewport's camera, as pure math. Left-handed like the game and the POI frame: +x east, +y up, +z north.
// Matrices are column-major arrays of 16, as WebGL takes them. Rays are in the POI's own frame, in metres.

/** @typedef {{ mode: 'persp' | 'top' | 'front' | 'side', target: number[], yaw: number, pitch: number, dist: number, orthoH: number, fovY: number }} Camera */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const NEAR = 0.1, FAR = 20000, FOV_Y = (60 * Math.PI) / 180;

/** @returns {Camera} */
export function createCamera() {
  return { mode: 'persp', target: [0, 1, 0], yaw: Math.PI * 0.85, pitch: 0.45, dist: 14, orthoH: 20, fovY: FOV_Y };
}

/** The eye's forward and up for the camera's mode. */
function basis(cam) {
  if (cam.mode === 'top') return { f: [0, -1, 0], up: [0, 0, 1] };
  if (cam.mode === 'front') return { f: [0, 0, 1], up: [0, 1, 0] };
  if (cam.mode === 'side') return { f: [-1, 0, 0], up: [0, 1, 0] };
  const cp = Math.cos(cam.pitch);
  // yaw 0 looks north; the eye sits behind the target
  return { f: norm([Math.sin(cam.yaw) * cp * -1, -Math.sin(cam.pitch), Math.cos(cam.yaw) * cp * -1]).map((v) => v), up: [0, 1, 0] };
}

/** Forward in persp mode: from the eye to the target. The eye is `target - f * dist`. */
export function eyeOf(cam) {
  const { f } = basis(cam);
  return sub(cam.target, mul(f, cam.mode === 'persp' ? cam.dist : 4000));
}

function lookAt(eye, f, up) {
  const r = norm(cross(up, f)), u = cross(f, r);
  return [r[0], u[0], f[0], 0, r[1], u[1], f[1], 0, r[2], u[2], f[2], 0, -dot(r, eye), -dot(u, eye), -dot(f, eye), 1];
}

function persp(fovY, a, n, f) {
  const t = 1 / Math.tan(fovY / 2);
  return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (f - n), 1, 0, 0, (-2 * f * n) / (f - n), 0];
}

function ortho(h, a, n, f) {
  return [1 / (h * a), 0, 0, 0, 0, 1 / h, 0, 0, 0, 0, 2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1];
}

export function mulMat(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export function invert(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det) return null;
  return inv.map((v) => v / det);
}

/** The view, projection and their product for a viewport `aspect` wide over high. */
export function matrices(cam, aspect) {
  const { f, up } = basis(cam);
  const eye = eyeOf(cam);
  const view = lookAt(eye, f, up);
  const proj = cam.mode === 'persp' ? persp(cam.fovY, aspect, NEAR, FAR) : ortho(cam.orthoH, aspect, 1, 8000);
  return { view, proj, vp: mulMat(proj, view), eye, viewDir: f, up };
}

/** Where a world point lands: `[x, y]` in -1..1 (y up) and its depth, or null behind the eye. */
export function project(cam, aspect, p) {
  const { vp } = matrices(cam, aspect);
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (w <= 0) return null;
  return { x: x / w, y: y / w, z: z / w };
}

/** The ray through a screen point (`nx`, `ny` in -1..1, y up): its origin and unit direction. */
export function rayAt(cam, aspect, nx, ny) {
  const { vp, eye, viewDir } = matrices(cam, aspect);
  const inv = invert(vp);
  if (!inv) return { o: eye, d: viewDir };
  const un = (z) => { const v = [nx, ny, z, 1]; const o = [0, 0, 0, 0].map((_, r) => inv[r] * v[0] + inv[4 + r] * v[1] + inv[8 + r] * v[2] + inv[12 + r] * v[3]); return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
  const a = un(-1), b = un(1);
  return cam.mode === 'persp' ? { o: eye, d: norm(sub(b, a)) } : { o: a, d: norm(sub(b, a)) };
}

/** Orbit by mouse movement in pixels (persp only). */
export function orbit(cam, dx, dy) {
  if (cam.mode !== 'persp') return;
  cam.yaw -= dx * 0.005;
  cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.005));
}

/** Pan the target across the view plane by pixels, `h` the viewport height. */
export function pan(cam, dx, dy, h, aspect) {
  const { viewDir, up } = matrices(cam, aspect);
  const r = norm(cross(up, viewDir)), u = cross(viewDir, r);
  const per = (cam.mode === 'persp' ? 2 * cam.dist * Math.tan(cam.fovY / 2) : 2 * cam.orthoH) / Math.max(1, h);
  cam.target = add(add(cam.target, mul(r, -dx * per)), mul(u, dy * per));
}

/** Dolly or zoom by a factor (wheel). */
export function zoom(cam, k) {
  if (cam.mode === 'persp') cam.dist = Math.max(0.5, Math.min(3000, cam.dist * k));
  else cam.orthoH = Math.max(0.5, Math.min(3000, cam.orthoH * k));
}

/** Free flight: move the target (and so the eye) along the eye's own axes by metres: `[right, up, forward]`. */
export function fly(cam, m) {
  const { f, up } = basis(cam);
  const r = norm(cross(up, f));
  cam.target = add(cam.target, add(add(mul(r, m[0]), mul(up, m[1])), mul(f, m[2])));
}

/** Frame a sphere (the F key). */
export function frame(cam, centre, radius) {
  cam.target = [...centre];
  const r = Math.max(0.5, radius);
  cam.dist = Math.min(3000, (r * 2.2) / Math.tan(cam.fovY / 2) / 1.2);
  cam.orthoH = r * 1.4;
}

/** Ground point under a ray at height `y`, or null. */
export function groundAt(ray, y = 0) {
  if (Math.abs(ray.d[1]) < 1e-6) return null;
  const t = (y - ray.o[1]) / ray.d[1];
  return t > 0 ? add(ray.o, mul(ray.d, t)) : null;
}
