
function dot(ax, ay, az, bx, by, bz) {
  return ax * bx + ay * by + az * bz;
}

/**
 * @param {Array<{x,y,z,nx,ny,nz,u,v}>} faceVertsIn
 * @param {Array} faceVertsOut
 * @returns {boolean}
 */
export function computeFaceUVCoordinates(faceVertsIn, faceVertsOut) {
  if (faceVertsIn.length > faceVertsOut.length) {
    throw new RangeError('calculatedUVBuffer overflow');
  }

  const P0 = [faceVertsIn[0].x, faceVertsIn[0].y, faceVertsIn[0].z];
  const P1 = [faceVertsIn[1].x, faceVertsIn[1].y, faceVertsIn[1].z];
  const P2 = [faceVertsIn[2].x, faceVertsIn[2].y, faceVertsIn[2].z];

  const V0 = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]];
  let V1 = [P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]];

  const k =
    dot(V1[0], V1[1], V1[2], V0[0], V0[1], V0[2]) /
    dot(V0[0], V0[1], V0[2], V0[0], V0[1], V0[2]);
  V1 = [V1[0] - V0[0] * k, V1[1] - V0[1] * k, V1[2] - V0[2] * k];

  const m0 = Math.sqrt(dot(V0[0], V0[1], V0[2], V0[0], V0[1], V0[2]));
  const m1 = Math.sqrt(dot(V1[0], V1[1], V1[2], V1[0], V1[1], V1[2]));
  if (m0 === 0 || m1 === 0) throw new Error('Can not normalize a vector when it\'s magnitude is zero');
  // Multiply by the inverse magnitude as DFU's Vector3.Normalize does. Dividing gives slightly different doubles
  // that change the truncated 2D basis for some faces.
  const i0 = 1 / m0, i1 = 1 / m1;
  const n0 = [V0[0] * i0, V0[1] * i0, V0[2] * i0];
  const n1 = [V1[0] * i1, V1[1] * i1, V1[2] * i1];

  const p0x = Math.trunc(dot(P0[0], P0[1], P0[2], n0[0], n0[1], n0[2]));
  const p0y = Math.trunc(dot(P0[0], P0[1], P0[2], n1[0], n1[1], n1[2]));
  const p1x = Math.trunc(dot(P1[0], P1[1], P1[2], n0[0], n0[1], n0[2]));
  const p1y = Math.trunc(dot(P1[0], P1[1], P1[2], n1[0], n1[1], n1[2]));
  const p2x = Math.trunc(dot(P2[0], P2[1], P2[2], n0[0], n0[1], n0[2]));
  const p2y = Math.trunc(dot(P2[0], P2[1], P2[2], n1[0], n1[1], n1[2]));

  // The stored UVs of points 1 and 2 are deltas, so each is summed onto the earlier points.
  const U = [
    faceVertsIn[0].u,
    faceVertsIn[1].u + faceVertsIn[0].u,
    faceVertsIn[2].u + faceVertsIn[1].u + faceVertsIn[0].u,
  ];
  const V = [
    faceVertsIn[0].v,
    faceVertsIn[1].v + faceVertsIn[0].v,
    faceVertsIn[2].v + faceVertsIn[1].v + faceVertsIn[0].v,
  ];
  const X = [p0x, p1x, p2x];
  const Y = [p0y, p1y, p2y];

  const matrix = computeDFUVMatrixXY(X, Y, U, V);
  if (!matrix) return false;

  for (let point = 0; point < faceVertsIn.length; point++) {
    let u = 0;
    let v = 0;
    if (point > 2) {
      const P = faceVertsIn[point];
      const pnx = Math.trunc(dot(P.x, P.y, P.z, n0[0], n0[1], n0[2]));
      const pny = Math.trunc(dot(P.x, P.y, P.z, n1[0], n1[1], n1[2]));
      u = Math.trunc(pnx * matrix.UA + pny * matrix.UB + matrix.UD);
      v = Math.trunc(pnx * matrix.VA + pny * matrix.VB + matrix.VD);
    } else if (point === 0) {
      u = faceVertsIn[0].u;
      v = faceVertsIn[0].v;
    } else if (point === 1) {
      u = faceVertsIn[0].u + faceVertsIn[1].u;
      v = faceVertsIn[0].v + faceVertsIn[1].v;
    } else {
      u = faceVertsIn[0].u + faceVertsIn[1].u + faceVertsIn[2].u;
      v = faceVertsIn[0].v + faceVertsIn[1].v + faceVertsIn[2].v;
    }

    faceVertsOut[point] = {
      x: faceVertsIn[point].x,
      y: faceVertsIn[point].y,
      z: faceVertsIn[point].z,
      nx: faceVertsIn[point].nx,
      ny: faceVertsIn[point].ny,
      nz: faceVertsIn[point].nz,
      u,
      v,
    };
  }

  return true;
}

function computeDFUVMatrixXY(X, Y, U, V) {
  const determinant =
    X[0] * Y[1] + Y[0] * X[2] + X[1] * Y[2] - Y[1] * X[2] - Y[0] * X[1] - X[0] * Y[2];

  if (determinant === 0) return null;

  const Xi = [
    (Y[1] - Y[2]) / determinant,
    (-X[1] + X[2]) / determinant,
    (X[1] * Y[2] - X[2] * Y[1]) / determinant,
  ];
  const Yi = [
    (-Y[0] + Y[2]) / determinant,
    (X[0] - X[2]) / determinant,
    (-X[0] * Y[2] + X[2] * Y[0]) / determinant,
  ];
  const Zi = [
    (Y[0] - Y[1]) / determinant,
    (-X[0] + X[1]) / determinant,
    (X[0] * Y[1] - X[1] * Y[0]) / determinant,
  ];

  return {
    UA: U[0] * Xi[0] + U[1] * Yi[0] + U[2] * Zi[0],
    UB: U[0] * Xi[1] + U[1] * Yi[1] + U[2] * Zi[1],
    UC: 0,
    UD: U[0] * Xi[2] + U[1] * Yi[2] + U[2] * Zi[2],
    VA: V[0] * Xi[0] + V[1] * Yi[0] + V[2] * Zi[0],
    VB: V[0] * Xi[1] + V[1] * Yi[1] + V[2] * Zi[1],
    VC: 0,
    VD: V[0] * Xi[2] + V[1] * Yi[2] + V[2] * Zi[2],
  };
}
