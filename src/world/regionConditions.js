// The region condition store: the Flags, Flags2, and Values half of PlayerEntity's regionData.

export const REGION_FLAGS = Object.freeze({
  WarBeginning: 0, WarOngoing: 1, WarWon: 2, WarLost: 3,
  PlagueBeginning: 4, PlagueOngoing: 5, PlagueEnding: 6,
  FamineBeginning: 7, FamineOngoing: 8, FamineEnding: 9,
  WitchBurnings: 10, CrimeWave: 11, NewRuler: 12, BadHarvest: 13,
  TGMInJail: 14, TGMSetFree: 15, TGMExecuted: 16, NewTGM: 17,
  PersecutedTemple: 18, PricesHigh: 19, PricesLow: 20,
  HappyHoliday: 21, ScaryHoliday: 22, HolyHoliday: 23,
  MadWizardNearby: 24, MadWizardDies: 25,
  Condition26: 26, Condition27: 27, Condition28: 28, Condition29: 29,
});

export const FLAGS_TO_FLAGS2 = Object.freeze([
  0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 6, 7, 8, 9, 3, 3, 3, 3, 10, 4, 4, 11, 12, 13, 5, 5, 0, 0, 0, 0,
]);

export const VALUES_WIDTH = 29;
export const FLAGS_WIDTH = 29;
export const FLAGS2_WIDTH = 14;

export const CONDITION_VALUE_MIN = Object.freeze([
  0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x05, 0x01, 0x0A,
  0x0A, 0x01, 0x01, 0x01, 0x01, 0x0A, 0x0A, 0x0A, 0x01, 0x01, 0x01, 0x05, 0x01,
]);
export const CONDITION_VALUE_MAX = Object.freeze([
  0x0A, 0x0A, 0x0A, 0x0A, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x1E, 0x0A, 0x0A, 0x64,
  0x14, 0x14, 0x01, 0x01, 0x01, 0x64, 0x14, 0x14, 0x01, 0x01, 0x01, 0x1E, 0x01,
]);

export const REGION_COUNT = 62;

const blankRegion = () => ({
  values: new Uint8Array(VALUES_WIDTH),
  flags: new Array(FLAGS_WIDTH).fill(false),
  flags2: new Array(FLAGS2_WIDTH).fill(false),
  precipitationOverride: 0,
  severePunishmentFlags: 0,
  idOfPersecutedTemple: 0,
  banishedUntil: null,
});

export function createRegionConditions(regionCount = REGION_COUNT) {
  return Array.from({ length: regionCount }, blankRegion);
}

export function turnOnConditionFlag(store, regionID, flagID, rolls = Math.random) {
  const r = store[regionID];
  if (!r) return;
  const group = FLAGS_TO_FLAGS2[flagID];
  if (r.flags2[group]) {
    for (let i = 0; i < FLAGS_WIDTH; i++) {
      if (FLAGS_TO_FLAGS2[i] === group) r.flags[i] = false;
    }
  }
  const min = CONDITION_VALUE_MIN[flagID];
  const max = CONDITION_VALUE_MAX[flagID];
  r.values[flagID] = min + Math.floor(rolls() * (max + 1 - min));
  r.flags[flagID] = true;
  r.flags2[group] = true;
}

// Turning off one condition clears its whole group flag, as DFU does.
export function turnOffConditionFlag(store, regionID, flagID) {
  const r = store[regionID];
  if (!r) return;
  r.flags[flagID] = false;
  r.flags2[FLAGS_TO_FLAGS2[flagID]] = false;
}

export const conditionFlag = (store, regionID, flagID) => !!store?.[regionID]?.flags[flagID];
export const conditionValue = (store, regionID, flagID) => store?.[regionID]?.values[flagID] ?? 0;
export const conditionGroupFlag = (store, regionID, group) => !!store?.[regionID]?.flags2[group];

export function resetWarDataForRegion(store, faction, PROVINCE_TYPE) {
  if (!faction) return;
  const regionID = faction.region;
  if (regionID === -1 || faction.type !== PROVINCE_TYPE) return;
  const r = store[regionID];
  if (!r) return;
  r.flags[REGION_FLAGS.WarBeginning] = false;
  r.flags[REGION_FLAGS.WarOngoing] = false;
  r.flags[REGION_FLAGS.WarWon] = false;
  r.flags[REGION_FLAGS.WarLost] = false;
  r.flags2[FLAGS_TO_FLAGS2[REGION_FLAGS.WarBeginning]] = false;
  r.values[REGION_FLAGS.WarOngoing] = 0;
}

export function snapshotRegionConditions(store) {
  if (!store) return null;
  return store.map((r) => ({
    v: [...r.values],
    f: r.flags.map((b) => (b ? 1 : 0)).join(''),
    g: r.flags2.map((b) => (b ? 1 : 0)).join(''),
    p: r.precipitationOverride, s: r.severePunishmentFlags, t: r.idOfPersecutedTemple,
    ...(Number.isFinite(r.banishedUntil) ? { b: r.banishedUntil } : {}),
  }));
}
export function restoreRegionConditions(snap, regionCount = REGION_COUNT) {
  const store = createRegionConditions(regionCount);
  if (!Array.isArray(snap)) return store;
  for (let i = 0; i < Math.min(snap.length, store.length); i++) {
    const s = snap[i]; if (!s) continue;
    const r = store[i];
    for (let j = 0; j < Math.min((s.v ?? []).length, VALUES_WIDTH); j++) r.values[j] = s.v[j];
    for (let j = 0; j < Math.min((s.f ?? '').length, FLAGS_WIDTH); j++) r.flags[j] = s.f[j] === '1';
    for (let j = 0; j < Math.min((s.g ?? '').length, FLAGS2_WIDTH); j++) r.flags2[j] = s.g[j] === '1';
    r.precipitationOverride = s.p ?? 0;
    r.severePunishmentFlags = s.s ?? 0;
    r.idOfPersecutedTemple = s.t ?? 0;
    r.banishedUntil = Number.isFinite(s.b) ? s.b : null;
  }
  return store;
}
