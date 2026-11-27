// Online death respawns the player at the nearest safe place instead of loading a save.
import { cromwarkSettlementRemoved } from '../world/wild/cromwarkSettlements.js';
import { LOCATION_TYPES, DUNGEON_TYPES, longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { cureAllOfKind } from '../magic/effects.js';
import { maxFatigue, liveStat, STAT_KEYS_ORDER } from '../characters/statMods.js';
import { sharedClockOn, worldMinutes, skipDeadMinutes } from '../world/worldTick.js';
import { SD_REALM_TEXT } from '../world/sdRealm.js';

const SAFE_KINDS = Object.freeze([
  { kind: 'temple', match: (e) => e.locationType === LOCATION_TYPES.ReligionTemple },
  { kind: 'city', match: (e) => e.locationType === LOCATION_TYPES.TownCity
    || e.locationType === LOCATION_TYPES.TownHamlet || e.locationType === LOCATION_TYPES.TownVillage },
  { kind: 'graveyard', match: (e) => e.locationType === LOCATION_TYPES.Graveyard && e.dungeonType === DUNGEON_TYPES.Cemetery },
]);

export function nearestSafeLocation(mapTable, mapPixelXY, accept = null) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < (mapTable?.length ?? 0); i++) {
    const e = mapTable[i];
    if (!e || cromwarkSettlementRemoved(e.mapId)) continue;
    const found = SAFE_KINDS.find((t) => t.match(e));
    if (!found) continue;
    const px = longitudeLatitudeToMapPixel(e.longitude, e.latitude);
    const dx = px.x - mapPixelXY.x, dz = px.y - mapPixelXY.y;
    const d2 = dx * dx + dz * dz;
    if (d2 >= bestDist) continue;
    const hit = { kind: found.kind, locationIndex: i, mapPixel: px };
    if (accept && !accept(hit)) continue;
    bestDist = d2; best = hit;
  }
  return best;
}

export function nearestSafeLocationAnywhere(maps, mapPixelXY, accept = null) {
  const before = maps?._lastRegion ?? -1;
  let best = null;
  let bestDist = Infinity;
  for (let r = 0; r < (maps?.regionCount ?? 0); r++) {
    const hit = nearestSafeLocation(maps.getRegion(r)?.mapTable ?? [], mapPixelXY, accept);
    if (!hit) continue;
    const dx = hit.mapPixel.x - mapPixelXY.x, dz = hit.mapPixel.y - mapPixelXY.y;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist) { bestDist = d2; best = hit; }
  }
  if (before >= 0 && typeof maps?.loadRegion === 'function') maps.loadRegion(before);
  return best;
}

const FLAVOR = Object.freeze({
  temple: [
    'The temple priests found you at death\u2019s door and pulled you back through it. You wake on cool stone, a healer\u2019s hand still warm on your chest.',
    'The Divines were not ready for you yet. You wake on the temple steps, the chanting still fading from your ears.',
  ],
  city: [
    'You wake in an alley just outside the gates, alive against the odds and with no idea how you got here.',
    'A passing guard found you and dragged you to the city gate. You come to just outside the walls, owing him one.',
  ],
  graveyard: [
    'You claw your way up through loose earth. It was not your grave. Not yet.',
    'You wake among the headstones, cold and very much alive, brushing the dirt from your clothes.',
  ],
  dungeon: [
    'You wake in the open air, the dungeon door standing behind you and no memory of the walk out.',
    'Something dragged you out before the dark could keep you. You come to just outside the entrance.',
  ],
  hour: [SD_REALM_TEXT.died],
});

export function respawnFlavorText(kind, roll = Math.random) {
  const pool = FLAVOR[kind] ?? FLAVOR.city;
  return pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))];
}

export const RESPAWN_HEALTH_FRACTION = 0.5;
export const respawnHealth = (maxHealth) => {
  const m = Number.isFinite(maxHealth) ? maxHealth : 0;
  return Math.max(1, Math.floor(m * RESPAWN_HEALTH_FRACTION));
};

export function undergroundWakeSpot(mapTable, pixel) {
  const safe = nearestSafeLocation(mapTable, pixel);
  return safe
    ? { kind: safe.kind, mapPixel: safe.mapPixel }
    : { kind: 'dungeon', mapPixel: { x: pixel.x, y: pixel.y } };
}

const WAKE_FLAVOR = Object.freeze({
  temple: 'You fell asleep underground and wake on the temple steps. Someone carried you out while you were away.',
  city: 'You fell asleep underground and wake just outside the city gate. Someone carried you out while you were away.',
  graveyard: 'You fell asleep underground and wake among the headstones. Someone carried you out while you were away.',
  dungeon: 'You fell asleep underground and wake outside the dungeon door. Someone carried you out while you were away.',
});

export const undergroundWakeText = (kind) => WAKE_FLAVOR[kind] ?? WAKE_FLAVOR.city;

export const LETHAL_DRAINS = Object.freeze(['poison', 'continuousDamage', 'transferHealth']);

export function endLethalDrains(entity) {
  const had = new Set((entity?.activeEffects ?? []).map((a) => a?.kind));
  const cleared = LETHAL_DRAINS.filter((k) => had.has(k));
  for (const kind of cleared) cureAllOfKind(entity, kind);
  return cleared;
}

export const DEATH_HOLDS = Object.freeze(['paralyze', 'silenced', 'continuousDamageFatigue', 'continuousDamageSpellPoints']);

export function endDeathHolds(entity) {
  const had = new Set((entity?.activeEffects ?? []).map((a) => a?.kind));
  const released = DEATH_HOLDS.filter((k) => had.has(k));
  for (const kind of released) cureAllOfKind(entity, kind);
  return released;
}

export const REVIVED_SURVIVAL_RESET = Object.freeze({ exposure: 0, wet: 0 });

export function endLethalExposure(entity) {
  const s = entity?.survival;
  if (!s || typeof s !== 'object') return [];
  const cleared = [];
  for (const [k, v] of Object.entries(REVIVED_SURVIVAL_RESET)) {
    if ((s[k] ?? 0) !== v) { s[k] = v; cleared.push(k); }
  }
  return cleared;
}

export function liftZeroedStats(entity) {
  const lifted = [];
  for (const stat of STAT_KEYS_ORDER) {
    const permanent = entity?.stats?.[stat];
    if (permanent == null || liveStat(entity, stat) > 0) continue;
    const target = respawnHealth(permanent);
    for (const hold of holdsOn(entity, stat)) {
      if (!(hold.get() < 0)) continue;
      hold.set(0);
      const live = liveStat(entity, stat);
      if (live >= target) { hold.set(-(live - target)); break; }
    }
    if (liveStat(entity, stat) > 0) lifted.push(stat);
  }
  return lifted;
}

function holdsOn(entity, stat) {
  const holds = [];
  for (const a of entity.activeEffects ?? []) {
    if (a?.kind === 'disease' && a.statMods) holds.push({ get: () => a.statMods[stat] ?? 0, set: (v) => { a.statMods[stat] = v; } });
  }
  for (const a of entity.activeEffects ?? []) {
    if ((a?.kind === 'drainAttribute' || a?.kind === 'transferAttribute') && a.stat === stat) holds.push({ get: () => -(a.magnitude ?? 0), set: (v) => { a.magnitude = -v; } });
  }
  return holds;
}

export function reviveForPlay(entity, { force = false } = {}) {
  if (!entity) return { revived: false, cleared: [] };
  const dead = !(entity.health > 0);
  if (dead || force) entity.health = respawnHealth(entity.maxHealth);
  const cleared = endLethalDrains(entity), exposure = endLethalExposure(entity);
  const released = (dead || force) ? endDeathHolds(entity) : [];
  const lifted = liftZeroedStats(entity);
  if (dead || force) entity.fatigue = Math.max(entity.fatigue > 0 ? entity.fatigue : 0, respawnHealth(maxFatigue(entity)));
  const skipped = (dead || force) && sharedClockOn() ? skipDeadMinutes(entity, worldMinutes()) : false;
  return { revived: dead || force, cleared, exposure, lifted, skipped, released };
}
