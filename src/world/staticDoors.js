// StaticDoor triggers from model door data, ported from Daggerfall Unity's GameObjectHelper.GetStaticDoors.
// Door center and normal stay in model space; consumers apply `matrix` themselves.

/**
 * @param {object} model
 * @param {number} blockIndex
 * @param {number} recordIndex
 * @param {Float32Array|number[]} matrix
 * @returns {Array<{matrix,doorType:number,blockIndex:number,recordIndex:number,
 *   doorIndex:number,centre:{x,y,z},normal:{x,y,z},size:{x,y,z}}>|null}
 */
export function getStaticDoors(model, blockIndex, recordIndex, matrix) {
  if (!model.doors) return null;

  const staticDoors = new Array(model.doors.length);
  for (let i = 0; i < model.doors.length; i++) {
    const door = model.doors[i];
    const v0 = door.vert0;
    const v2 = door.vert2;

    const width = Math.abs(v2.x - v0.x);
    const height = Math.abs(v2.y - v0.y);
    const depth = Math.abs(v2.z - v0.z);
    const thickness = Math.max(width, depth);
    const size = {
      x: thickness,
      y: Math.max(height, thickness),
      z: Math.min(height, thickness),
    };

    staticDoors[i] = {
      matrix,
      doorType: door.type,
      blockIndex,
      recordIndex,
      doorIndex: door.index,
      centre: {
        x: (v0.x + v2.x) / 2,
        y: (v0.y + v2.y) / 2,
        z: (v0.z + v2.z) / 2,
      },
      normal: door.normal,
      size,
    };
  }

  return staticDoors;
}
