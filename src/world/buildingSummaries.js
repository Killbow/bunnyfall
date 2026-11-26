// Position is (XPos, 0, RMBDimension - ZPos) x GlobalScale, as in RMBLayout. Rows stop at the block's declared
// record count, since an appended subrecord past it is not a building.

import { mergeNamedBuildings, blockBuildingCount, makeBuildingKey } from '../talk/talkTopics.js';
import { generateBuildingName, isResidence } from './buildingNames.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { hasInteriorModels } from './interiorLayout.js';
import { RMB_DIMENSION, ROTATION_DIVISOR } from '../formats/blocksFile.js';
import { getSeed, setSeed } from '../formats/dfRandom.js';

export function buildingPosition(sub, globalScale = GLOBAL_SCALE) {
  return [
    (sub?.xPos ?? 0) * globalScale,
    0,
    (RMB_DIMENSION - (sub?.zPos ?? 0)) * globalScale,
  ];
}

export const buildingRotationY = (sub) => -(sub?.yRotation ?? 0) / ROTATION_DIVISOR;

/**
 * @param exteriorBuildings
 * @param blocks
 * @param nameOpts
 */
export function buildingSummaries(exteriorBuildings, blocks, nameOpts = {}) {
  const merged = mergeNamedBuildings(exteriorBuildings ?? [], blocks ?? [], { locationIndex: nameOpts.locationIndex ?? 0 });
  const out = [];
  // Building names reseed the shared random numbers; restore the seed so later rolls are unchanged.
  const seed = getSeed();
  for (const b of blocks ?? []) {
    const list = merged.get(b) ?? [];
    const subs = b.dfBlock?.rmbBlock?.subRecords ?? [];
    const count = Math.min(list.length, blockBuildingCount(b.dfBlock) ?? list.length);
    for (let i = 0; i < count; i++) {
      const data = list[i];
      if (!data) continue;
      const sub = subs[i] ?? null;
      out.push({
        buildingKey: makeBuildingKey(b.x ?? 0, b.y ?? 0, i),
        recordIndex: i,
        blockX: b.x ?? 0,
        blockY: b.y ?? 0,
        position: buildingPosition(sub),
        rotationY: buildingRotationY(sub),
        buildingType: data.buildingType,
        factionId: data.factionId,
        quality: data.quality,
        nameSeed: data.nameSeed,
        isResidence: isResidence(data.buildingType),
        name: generateBuildingName(data.nameSeed, data.buildingType, { ...nameOpts, factionId: data.factionId }),
        hasInterior: hasInteriorModels(sub),
      });
    }
  }
  setSeed(seed);
  return out;
}
