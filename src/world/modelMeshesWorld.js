import { localAabb } from '../render/frustum.js';

/** @param {any} shared */
export function createModelMeshesWorld(shared) {
  const { arch } = shared;
  // The classic reader divides both the extent and the vertices by `pointDivisor`, so `size * GLOBAL_SCALE` is the
  // world extent of the model.
  const dfMeshSizes = new Map();
  const dfMeshSize = (id) => {
    let sz = dfMeshSizes.get(id);
    if (sz === undefined) {
      const index = arch.getRecordIndex(id);
      sz = index === -1 ? null : (arch.getMesh(index)?.size ?? null);
      dfMeshSizes.set(id, sz);
    }
    return sz;
  };
  const archAabbs = new Map();
  const archAabb = (id, positions) => {
    let b = archAabbs.get(id);
    if (!b) archAabbs.set(id, b = localAabb(positions));
    return b;
  };
  return { archAabb, dfMeshSize };
}
