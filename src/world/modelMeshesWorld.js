// The world's model mesh sizes and bounding boxes, each read once per model id and then reused.
import { localAabb } from '../render/frustum.js';

/** @param {any} shared */
export function createModelMeshesWorld(shared) {
  const { arch } = shared;
  /** AUDIT 64 F11: DFMesh.Size for a model id - `modelData.DFMesh.Size`
   *  at RMBLayout.cs:873. Arch3dFile.cs:711-713 divides the raw extent by
   *  pointDivisor and WritePoint (:941-943) divides the VERTICES by the
   *  same, so `size * GlobalScale` is the model's world extent - the
   *  building's silhouette, which is what HasHit boxes. */
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
