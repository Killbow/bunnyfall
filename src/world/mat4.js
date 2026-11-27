// Column-major 4x4 matrices. `trs` matches Unity Matrix4x4.TRS with Quaternion.Euler: degrees in, R = Ry * Rx * Rz,
// and parent * child composition, which the RMB layout formulas assume.

export function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

// One shared up axis for every caller; never write to it.
export const UP_Y = new Float32Array([0, 1, 0]);

// Uses `%` and not a loop, because a large wire-fed angle never leaves a subtract loop in doubles. NaN returns NaN,
// so callers with wire data check `Number.isFinite`.
export function wrapAngle(a) {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

// One module scratch, because `out` may alias `a` or `b`; `multiply` must never call itself.
const _mulScratch = new Float32Array(16);

// Computes a * b, so b applies first; `out` may alias `a` or `b`.
export function multiply(a, b, out = new Float32Array(16)) {
  const r = _mulScratch;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      r[col * 4 + row] = sum;
    }
  }
  out.set(r);
  return out;
}

const DEG2RAD = Math.PI / 180;

export function trs(tx, ty, tz, rxDeg, ryDeg, rzDeg, sx = 1, sy = 1, sz = 1) {
  const rx = rxDeg * DEG2RAD;
  const ry = ryDeg * DEG2RAD;
  const rz = rzDeg * DEG2RAD;
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);

  const r00 = cy * cz + syn * sxn * szn;
  const r01 = -cy * szn + syn * sxn * cz;
  const r02 = syn * cx;
  const r10 = cx * szn;
  const r11 = cx * cz;
  const r12 = -sxn;
  const r20 = -syn * cz + cy * sxn * szn;
  const r21 = syn * szn + cy * sxn * cz;
  const r22 = cy * cx;

  return new Float32Array([
    r00 * sx, r10 * sx, r20 * sx, 0,
    r01 * sy, r11 * sy, r21 * sy, 0,
    r02 * sz, r12 * sz, r22 * sz, 0,
    tx, ty, tz, 1,
  ]);
}

// Takes a unit quaternion in Unity component order [x, y, z, w], so a prefab `m_LocalRotation` passes in unchanged.
export function quatToMat4([x, y, z, w]) {
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz),     2 * (xz - wy),     0,
    2 * (xy - wz),     1 - 2 * (xx + zz), 2 * (yz + wx),     0,
    2 * (xz + wy),     2 * (yz - wx),     1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ]);
}

export function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

export function perspective(fovYRad, aspect, near, far) {
  const f = 1 / Math.tan(fovYRad / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

// World data is left-handed, so negating the NDC x row puts world +x on screen right. This flips screen winding
// (the renderer uses `frontFace(CW)`) and the input signs.
export function mirrorProjectionX(m) {
  m[0] = -m[0];
  m[8] = -m[8];
  return m;
}

export function lookAt(eye, center, up) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl];
  const x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(x[0], x[1], x[2]);
  x[0] /= xl; x[1] /= xl; x[2] /= xl;
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

export function ortho(halfW, halfH, near, far) {
  const out = new Float32Array(16);
  out[0] = 1 / halfW;
  out[5] = 1 / halfH;
  out[10] = -2 / (far - near);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}
