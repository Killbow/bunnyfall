// @ts-check
// Moves stray corners of the listed ARCH3D models onto the faces they should meet, closing holes in the original
// data. The patch applies to a copy so the parity harness still reads DFU's bytes. A rule change needs a
// `NAV_BAKE_VERSION` bump in ai/navClient.js, since the collider and nav mesh use the patched positions.

/** @typedef {{ axis: 'x'|'y'|'z', map: Record<string, number> }} AxisRule */
/** @typedef {{ at: [number, number, number], to: [number, number, number] }} PointRule */

const side = (axis, pairs) => ({ axis, map: Object.fromEntries(pairs) });
const point = (at, to) => ({ at, to });
const VAULT_CORNER = [point([128.242, -128, 31.199], [128, -128, 32]), point([-63.996, -95.02, -127.992], [-64, -95.996, -128])];
const SPIRAL = [side('x', [[120, 122], [-120, -122]]), side('z', [[120, 122], [-120, -122]])];
const SLOPED_STAIR = [
  point([2, 4, 64], [0, 0, 64]), point([-130, 4, 64], [-128, 0, 64]),
  point([2, -124, -192], [0, -128, -192]), point([-130, -124, -192], [-128, -128, -192]),
  point([-2, -2, 68], [-2, 0, 68]), point([-128, -2, 68], [-128, 0, 68]),
];
const ROUND_ROOM = [
  point([61.688, -126, 256.617], [64, -126, 256]),
  point([-256.617, -126, -61.684], [-256, -126, -64]),
  point([-255.621, -126, -193.121], [-256, -126, -192]),
  point([-256.082, -25.152, -215.754], [-256, -24, -216]),
];

/**
 * Values are in model units (an ARCH3D value over 256). An axis rule moves a coordinate that matches a `map` key
 * within `POINT_EPS`; a point rule moves a corner within `STRAY_EPS` of `at`.
 * @type {Readonly<Record<number, ReadonlyArray<AxisRule | PointRule>>>}
 */
export const SEAM_RULES = Object.freeze({
  61017: [side('x', [[62, 64], [-62, -64]])],
  61018: [side('x', [[62, 64], [-62, -64]])],
  61117: [side('x', [[62, 64], [-62, -64]])],
  61118: [side('x', [[62, 64], [-62, -64]])],
  61218: [side('x', [[62, 64], [-62, -64]])],
  67016: [side('x', [[63, 64], [-63, -64]])],
  67025: [side('x', [[63, 64], [-63, -64]])],
  67116: [side('x', [[63, 64], [-63, -64]])],
  67125: [side('x', [[63, 64], [-63, -64]])],
  67225: [side('x', [[63, 64], [-63, -64]])],
  58008: [side('x', [[48, 50], [-48, -50]])],
  58009: [side('x', [[358, 360], [154, 152]])],
  58050: [side('x', [[-358, -360], [-154, -152]])],
  59002: [side('x', [[-166, -168], [38, 40]]), side('y', [[-2, 0]])],
  59007: [side('x', [[-358, -360], [102, 104]])],
  59011: [side('x', [[102, 104], [-102, -104]])],
  59012: [side('x', [[230, 232], [-230, -232]])],
  59013: [side('x', [[102, 104], [-102, -104]])],
  59004: [side('x', [[26, 24]]), side('z', [[-26, -24]]), point([-256, -2, -24], [-256, 2, -24])],
  63026: SLOPED_STAIR,
  63126: SLOPED_STAIR,
  56300: SPIRAL,
  56301: SPIRAL,
  56000: [side('x', [[120, 124], [122, 124]]), side('z', [[120, 122], [-120, -122]])],
  56002: [side('x', [[122, 124]])],
  63022: [side('y', [[-2, 0], [-1, 0], [-124, -126]])],
  61004: VAULT_CORNER,
  61104: VAULT_CORNER,
  61204: VAULT_CORNER,
  63034: ROUND_ROOM,
  63134: ROUND_ROOM,
  63234: ROUND_ROOM,
});

export const POINT_EPS = 1e-6;
export const STRAY_EPS = 0.002;
const AXIS = { x: 'x', y: 'y', z: 'z' };

function movedPoint(p, rules) {
  let out = p;
  for (const r of rules) {
    if ('at' in r) {
      if (Math.abs(out.x - r.at[0]) <= STRAY_EPS && Math.abs(out.y - r.at[1]) <= STRAY_EPS && Math.abs(out.z - r.at[2]) <= STRAY_EPS) {
        out = { ...out, x: r.to[0], y: r.to[1], z: r.to[2] };
      }
      continue;
    }
    const k = AXIS[r.axis];
    const v = out[k];
    for (const from in r.map) {
      if (Math.abs(v - Number(from)) <= POINT_EPS) {
        if (out === p) out = { ...p };
        out[k] = r.map[from];
        break;
      }
    }
  }
  return out;
}

// Returns a patched copy, or the same mesh when the model has no rules; the source mesh is cached and shared, so it
// is never mutated.
export function patchSeams(modelId, dfMesh) {
  const rules = SEAM_RULES[modelId];
  if (!rules || !dfMesh?.subMeshes) return dfMesh;
  return {
    ...dfMesh,
    subMeshes: dfMesh.subMeshes.map((sm) => ({
      ...sm,
      planes: sm.planes.map((pl) => ({ ...pl, points: pl.points.map((p) => movedPoint(p, rules)) })),
    })),
  };
}
