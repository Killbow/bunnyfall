// @ts-check

export const HILL_HOUSE_VENDOR = 'beautiful-villages';
export const DOOR_APPROACH_M = 4;

const row = (block, record, model, from, to, automap) => Object.freeze({
  vendor: HILL_HOUSE_VENDOR, block, record, model, from: Object.freeze(from), to: Object.freeze(to), automap: Object.freeze(automap),
});
export const CURATED_PLACEMENTS = Object.freeze([
  row('TEMPASD1.RMB', 6, 159, { xPos: 2816, zPos: 2176, yRotation: 0 }, { xPos: 3808, zPos: 2176, yRotation: 0 }, [57, 29, 61, 38]),
]);

export const curatedPlacementsOf = (name, vendor) => CURATED_PLACEMENTS.filter((r) => r.vendor === vendor && r.block === name);

export function curateBlockPlacements(dfBlock, vendor) {
  const rows = curatedPlacementsOf(dfBlock?.servedName ?? dfBlock?.name, vendor);
  let moved = 0;
  for (const r of rows) {
    const sub = dfBlock.rmbBlock?.subRecords?.[r.record];
    const first = sub?.exterior?.block3dObjectRecords?.[0];
    if (!sub || sub.xPos !== r.from.xPos || sub.zPos !== r.from.zPos || sub.yRotation !== r.from.yRotation || first?.modelIdNum !== r.model) continue;
    sub.xPos = r.to.xPos; sub.zPos = r.to.zPos; sub.yRotation = r.to.yRotation;
    const fh = dfBlock.rmbBlock.fldHeader;
    const pos = fh?.blockPositions?.[r.record];
    if (pos) { pos.xPos = r.to.xPos; pos.zPos = r.to.zPos; pos.yRotation = r.to.yRotation; }
    const type = fh?.buildingDataList?.[r.record]?.buildingType;
    const map = fh?.autoMapData;
    if (map && Number.isInteger(type) && type >= 0) {
      const [c0, r0, c1, r1] = r.automap;
      // Automap bytes hold the building type plus one, since zero marks an open cell for city navigation.
      for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) map[y * 64 + x] = type + 1;
    }
    moved++;
  }
  return moved;
}
