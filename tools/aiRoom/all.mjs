// AI-ROOMS: every room spec, and the names, ids and indexes they are built under.
import * as batch1 from './rooms1.mjs';
import * as batch2 from './rooms2.mjs';
import * as batch3 from './rooms3.mjs';

export const FIRST_SHELL_ID = 7100101, FIRST_BLOCK_INDEX = 910001, FIRST_POSITION = 60000000, POSITION_STEP = 100000;
/** [{ spec, blockName, shellId, index, position }] in a fixed order: names count up per kind (B7000001.. and N7000001..). */
export function allRooms() {
  const counters = { border: 0, interior: 0 };
  return [...Object.values(batch1), ...Object.values(batch2), ...Object.values(batch3)].map((make, n) => {
    const spec = make(), num = ++counters[spec.kind];
    return { spec, blockName: `${spec.kind === 'border' ? 'B' : 'N'}${String(7000000 + num)}.RDB`, shellId: FIRST_SHELL_ID + n, index: FIRST_BLOCK_INDEX + n, position: FIRST_POSITION + n * POSITION_STEP };
  });
}
