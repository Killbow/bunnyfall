// The registry of which variant of a location, block, or building is in force.

export const NO_VARIANT = '';
export const ANY_LOCATION_KEY = -8;

let lastLocationKey = 0;
let newLocationVariants = [];
let locationVariants = new Map();
let blockVariants = new Map();
let buildingVariants = new Map();

export const makeLocationKey = (regionIndex, locationIndex) => (locationIndex * 100) + regionIndex;
const blockKey = (locationKey, blockName) => `${locationKey}|${blockName}`;
const buildingKey = (locationKey, blockName, recordIndex) => `${locationKey}|${blockName}|${recordIndex}`;

let _onChanged = null;
export function setVariantChangedHook(fn) { _onChanged = typeof fn === 'function' ? fn : null; }
let _newLocationIndex = () => -1;
export function setNewLocationIndexResolver(fn) { _newLocationIndex = typeof fn === 'function' ? fn : () => -1; }

export function setLastLocationKeyTo(regionIndex, locationIndex) { lastLocationKey = makeLocationKey(regionIndex, locationIndex); readingLocationKey = null; }
export const lastLocationKeyOf = () => lastLocationKey;

let readingLocationKey = null;
export function noteReadingLocation(regionIndex, locationIndex) { readingLocationKey = makeLocationKey(regionIndex, locationIndex); }
export const readingLocationKeyOf = () => readingLocationKey ?? lastLocationKey;

export function setLocationVariant(regionIndex, locationIndex, variant) {
  const locationKey = makeLocationKey(regionIndex, locationIndex);
  const added = locationVariants.has(locationKey);
  if (variant === NO_VARIANT) locationVariants.delete(locationKey);
  else locationVariants.set(locationKey, variant);
  _onChanged?.();
  return added;
}
export function setNewLocationVariant(regionIndex, locationName, variant) {
  const locationIndex = _newLocationIndex(regionIndex, locationName);
  if (locationIndex >= 0) {
    const locationKey = makeLocationKey(regionIndex, locationIndex);
    const added = !locationVariants.has(locationKey);
    if (variant === NO_VARIANT) locationVariants.delete(locationKey);
    else locationVariants.set(locationKey, variant);
    if (!newLocationVariants.includes(locationKey)) newLocationVariants.push(locationKey);
    _onChanged?.();
    return added;
  }
  console.warn('[worlddata] Failed to set a new location variant.');
  return true;
}
export function setBlockVariant(blockName, variant, locationKey = ANY_LOCATION_KEY) {
  const key = blockKey(locationKey, blockName);
  const added = !blockVariants.has(key);
  if (variant === NO_VARIANT) blockVariants.delete(key);
  else blockVariants.set(key, variant);
  _onChanged?.();
  return added;
}
export function setBuildingVariant(blockName, recordIndex, variant, locationKey = ANY_LOCATION_KEY) {
  const key = buildingKey(locationKey, blockName, recordIndex);
  const added = !buildingVariants.has(key);
  if (variant === NO_VARIANT) buildingVariants.delete(key);
  else buildingVariants.set(key, variant);
  _onChanged?.();
  return added;
}

export function getLocationVariant(locationKey) {
  lastLocationKey = locationKey;
  readingLocationKey = null;
  const v = locationVariants.get(locationKey);
  return { variant: v ?? NO_VARIANT, newLocation: v !== undefined && newLocationVariants.includes(locationKey) };
}
export function getBlockVariantHere(blockName) {
  if (lastLocationKey < 0) return NO_VARIANT;
  return blockVariants.get(blockKey(lastLocationKey, blockName)) ?? blockVariants.get(blockKey(ANY_LOCATION_KEY, blockName)) ?? NO_VARIANT;
}
export function getBuildingVariantHere(blockName, recordIndex, currentVariant = NO_VARIANT) {
  if (currentVariant !== NO_VARIANT) return NO_VARIANT;
  return buildingVariants.get(buildingKey(lastLocationKey, blockName, recordIndex)) ?? buildingVariants.get(buildingKey(ANY_LOCATION_KEY, blockName, recordIndex)) ?? NO_VARIANT;
}
export function getBlockVariant(regionIndex, locationIndex, blockName) {
  return blockVariants.get(blockKey(makeLocationKey(regionIndex, locationIndex), blockName)) ?? null;
}
export function getBuildingVariant(regionIndex, locationIndex, blockName, recordIndex) {
  return buildingVariants.get(buildingKey(makeLocationKey(regionIndex, locationIndex), blockName, recordIndex)) ?? null;
}

export function clearWorldDataVariants() {
  newLocationVariants = []; locationVariants = new Map(); blockVariants = new Map(); buildingVariants = new Map();
}
export function getWorldVariationSaveData() {
  return {
    newLocationVariants: [...newLocationVariants],
    locationVariants: Object.fromEntries(locationVariants),
    blockVariants: Object.fromEntries(blockVariants),
    buildingVariants: Object.fromEntries(buildingVariants),
  };
}
export function restoreWorldVariationData(data) {
  if (!data) return;
  if (data.newLocationVariants != null) newLocationVariants = [...data.newLocationVariants];
  if (data.locationVariants != null) locationVariants = new Map(Object.entries(data.locationVariants).map(([k, v]) => [Number(k), v]));
  if (data.blockVariants != null) blockVariants = new Map(Object.entries(data.blockVariants));
  if (data.buildingVariants != null) buildingVariants = new Map(Object.entries(data.buildingVariants));
}
