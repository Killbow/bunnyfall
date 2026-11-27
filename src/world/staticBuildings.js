// StaticBuilding boxes and HasHit, ported from Daggerfall Unity's RMBLayout and DaggerfallStaticBuildings.
// Each box is the first loaded model's size and center, inflated by 1.01 for the hit test.
import { GLOBAL_SCALE } from './meshReader.js';

export function staticBuildingBox(dfMeshSize) {
  const s = dfMeshSize ?? { x: 0, y: 0, z: 0 };
  return {
    size: [s.x * GLOBAL_SCALE, s.y * GLOBAL_SCALE, s.z * GLOBAL_SCALE],
    centre: [0, (s.y / 2) * GLOBAL_SCALE, 0],
  };
}

// DFU's c.bounds is the world axis-aligned box of the rotated box, not an oriented-box test.
export function staticBuildingWorldAabb({ size, centre }, matrix) {
  const hx = (size[0] * 1.01) / 2;
  const hy = (size[1] * 1.01) / 2;
  const hz = (size[2] * 1.01) / 2;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const lx = centre[0] + ((i & 1) ? hx : -hx);
    const ly = centre[1] + ((i & 2) ? hy : -hy);
    const lz = centre[2] + ((i & 4) ? hz : -hz);
    const wx = matrix[0] * lx + matrix[4] * ly + matrix[8] * lz + matrix[12];
    const wy = matrix[1] * lx + matrix[5] * ly + matrix[9] * lz + matrix[13];
    const wz = matrix[2] * lx + matrix[6] * ly + matrix[10] * lz + matrix[14];
    if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
    if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
    if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
  }
  return { min, max };
}

// The first match wins, as in DFU, so array order decides.
export function staticBuildingsHasHit(buildings, point) {
  for (const b of buildings) {
    const { min, max } = b.aabb;
    if (point[0] >= min[0] && point[0] <= max[0]
      && point[1] >= min[1] && point[1] <= max[1]
      && point[2] >= min[2] && point[2] <= max[2]) return b;
  }
  return null;
}
