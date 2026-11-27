export const HOUSE_CONTAINER_GROUP = 418;
export const CONTAINER_GROUP_OFFSET = 41000;
export const HOUSE_CONTAINER_INDICES = Object.freeze([3, 4, 7, 8, 27, 32, 33, 34, 35, 37, 38, 50, 51]);
const IDX = new Set(HOUSE_CONTAINER_INDICES);

export function isHouseContainerModel(modelIdNum) {
  return Math.floor(modelIdNum / 100) === HOUSE_CONTAINER_GROUP ||
    IDX.has(modelIdNum - CONTAINER_GROUP_OFFSET);
}
export const containerTextureRecord = (modelIdNum) => modelIdNum % 100;
