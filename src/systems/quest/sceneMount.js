// Quest half of the scene mount. Kept C# quirks: the walk throws on a dangling quest or Place, the behavior
// snapshot is taken once per link, and an enemy shows only while killCount < spawnCount.

import { QuestResourceBehaviour } from './resourceBehaviour.js';
import { isShelved } from './quest.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { RDB_SIDE } from '../../world/rdbLayout.js';
import { MARKER_TYPES } from './place.js';
import { freeLodgedFeet } from '../../characters/foeSpacing.js';

export const getFlatData = (flat) => ({ archive: flat >> 7, record: flat & 0x7f });

export function questNpcFlatData(person) {
  if (person.isIndividualNPC) return getFlatData(person.factionData.flat1);
  if (person.isQuestor) {
    return { archive: person.questorData.billboardArchiveIndex, record: person.questorData.billboardRecordIndex };
  }
  if (person.gender === GENDERS.Male) return getFlatData(person.factionData.flat1);
  return getFlatData(person.factionData.flat2);
}

export function markerScenePosition(marker) {
  return {
    x: marker.dungeonX * RDB_SIDE + marker.flatPosition.x,
    y: marker.flatPosition.y,
    z: marker.dungeonZ * RDB_SIDE + marker.flatPosition.z,
  };
}

export function addQuestResourceObjects(machine, adapter, siteType, buildingKey = 0,
  { enableNPCs = true, enableFoes = true, enableItems = true, byName = !!machine?.mountByName } = {}) {
  void enableItems;
  const siteLinks = machine.getSiteLinks(siteType, adapter.currentMapId?.(), buildingKey);
  if (!siteLinks || siteLinks.length === 0) return;
  for (const link of siteLinks) {
    const quest = machine.getQuest(link.questUID);
    if (!quest) throw new Error(`Could not find active quest for UID ${link.questUID}`);
    if (isShelved(quest)) continue;
    const place = quest.getPlace(link.placeSymbol);
    if (!place) throw new Error(`Could not find Place symbol ${link.placeSymbol?.name} in quest UID ${link.questUID}`);
    const resourceBehaviours = adapter.findBehaviours?.() ?? [];
    // Relink standing behaviors first: a load restores new quests under the same uids, or resources mount twice.
    for (const b of resourceBehaviours) if (!b.isComponentDestroyed) b.relinkToLiveQuest?.();
    addMarkerResourceObjects(machine, adapter, siteType, enableNPCs, enableFoes, quest,
      resourceBehaviours, place.siteDetails.selectedMarker, byName);
    if (place.siteDetails.questSpawnMarkers) {
      for (const marker of place.siteDetails.questSpawnMarkers) {
        addMarkerResourceObjects(machine, adapter, siteType, enableNPCs, enableFoes, quest,
          resourceBehaviours, marker, byName);
      }
    }
  }
}

export function addMarkerResourceObjects(machine, adapter, siteType, enableNPCs, enableFoes,
  quest, resourceBehaviours, marker, byName = false) {
  if (!marker?.targetResources) return;
  for (const target of marker.targetResources) {
    const resource = quest.getResource(target);
    if (!resource) continue;
    if (isAlreadyInjected(resourceBehaviours, resource, byName)) continue;
    if (resource.isPerson && enableNPCs) {
      addQuestNPC(machine, adapter, siteType, quest, marker, resource);
    } else if (resource.isFoe && enableFoes) {
      if (resource.killCount < resource.spawnCount) {
        addQuestFoe(machine, adapter, siteType, quest, marker, resource);
      }
    } else if (resource.isItem) {
      addQuestItem(machine, adapter, siteType, quest, marker, resource);
    }
  }
}

// C# `==` on Symbol is reference identity; a name match would collide across quests that reuse names like _king_.
export function isAlreadyInjected(resourceBehaviours, resource, byName = false) {
  if (!resourceBehaviours || resourceBehaviours.length === 0) return false;
  for (const behaviour of resourceBehaviours) {
    if (behaviour.isComponentDestroyed) continue;
    if (behaviour.targetSymbol === resource.symbol) return true;
    // Only the repair pass also matches by quest and symbol name.
    if (byName && behaviour.questUID === resource.parentQuest?.uid && behaviour.targetSymbol?.name === resource.symbol?.name) return true;
  }
  return false;
}

function addQuestNPC(machine, adapter, siteType, quest, marker, person) {
  const flatData = questNpcFlatData(person);
  const position = markerScenePosition(marker);
  const behaviour = new QuestResourceBehaviour(machine);
  behaviour.assignResource(person);
  const host = adapter.standNPC?.({ quest, marker, person, flatData, position, behaviour }) ?? null;
  if (host) behaviour.bindHost(host);
  person.questResourceBehaviour = behaviour;
  behaviour.start();
}

// No enemy is placed during a load, so the restore can set its state; the injured trigger rearms per placement.
function addQuestFoe(machine, adapter, siteType, quest, marker, foe) {
  if (adapter.loadInProgress?.()) return;
  const gender = foe.gender === GENDERS.Female ? 'female' : 'male';
  const position = markerScenePosition(marker);
  const behaviour = new QuestResourceBehaviour(machine);
  behaviour.assignResource(foe);
  const host = adapter.standFoe?.({ quest, marker, foe, gender, position, behaviour }) ?? null;
  if (host) behaviour.bindHost(host);
  foe.questResourceBehaviour = behaviour;
  behaviour.start();
  foe.rearmInjured();
}

function addQuestItem(machine, adapter, siteType, quest, marker, item) {
  const position = markerScenePosition(marker);
  const behaviour = new QuestResourceBehaviour(machine);
  behaviour.assignResource(item);
  const host = adapter.standItem?.({ quest, marker, item, position, behaviour }) ?? null;
  if (host) behaviour.bindHost(host);
  item.questResourceBehaviour = behaviour;
  behaviour.start();
}

// A quest item on an acting dungeon marker moves with that marker, as Daggerfall Unity parents it.

// Returns null when more than one marker has the ID, since a block laid twice mints its IDs twice.
export function sceneMarkerOf(blocks, markerID) {
  let found = null;
  for (let index = 0; index < (blocks?.length ?? 0); index++) {
    for (const marker of blocks[index]?.layout?.markers ?? []) {
      if (marker.record !== MARKER_TYPES.QuestSpawn && marker.record !== MARKER_TYPES.QuestItem) continue;
      if (marker.loadID !== markerID) continue;
      if (found) return null;
      found = { index, marker };
    }
  }
  return found;
}

export function sceneMarkerMover(blocks, actions, markerID) {
  const at = sceneMarkerOf(blocks, markerID);
  const o = at ? actions?.objectAt?.(at.index, at.marker.position) ?? null : null;
  return o?.kind === 'moveFlat' ? o : null;
}

// The offset array is written in place by the mover, so the stand reads the whole travel from the marker start.
export function rideSceneMarker(stand, offset) {
  if (!stand || stand.dead || !offset) return;
  stand.off = offset;
  if (stand.batch) stand.batch.origin = offset;
}

export function questStandBox(s) {
  const o = s.off;
  const x = o ? s.x + o[0] : s.x, y = o ? s.y + o[1] : s.y, z = o ? s.z + o[2] : s.z;
  return { min: [x - s.width / 2, y, z - s.width / 2], max: [x + s.width / 2, y + s.height, z + s.width / 2] };
}

// A building quest marker with no floor within reach places its resource at the nearest spot with a floor.

export const MARKER_FLOOR_REACH = 4;

export function siteMarkerSpots(siteDetails, marker, items = true) {
  const own = marker?.flatPosition ? markerScenePosition(marker) : null;
  if (!own) return [];
  const d2 = (p) => (p.x - own.x) ** 2 + (p.y - own.y) ** 2 + (p.z - own.z) ** 2;
  return [...(siteDetails?.questSpawnMarkers ?? []), ...(items ? siteDetails?.questItemMarkers ?? [] : [])]
    .filter((m) => m?.flatPosition)
    .map(markerScenePosition)
    .filter((p) => d2(p) > 1e-9)
    .sort((a, b) => d2(a) - d2(b));
}

export function standSpot(own, spots, hasFloor) {
  if (hasFloor(own)) return own;
  for (const p of spots ?? []) if (hasFloor(p)) return p;
  return own;
}

export function freeQuestStand(collider, feet, height) {
  const f = [...feet];
  if (!collider || !freeLodgedFeet(collider, f, { height })) return feet;
  f[1] += height * 0.02;
  return f;
}

// A quest Person whose spot overlaps a standing person moves to the nearest clear spawn marker, else beside it.

export const CROWD_STOREY_M = 2;

export function crowdingPerson(p, w, people) {
  for (const pn of people ?? []) {
    if (!pn?.stood || pn.active === false) continue;
    const reach = (w + (pn.width || w)) / 2;
    if (Math.abs(pn.x - p[0]) < reach && Math.abs(pn.z - p[2]) < reach && Math.abs(pn.y - p[1]) < CROWD_STOREY_M) return pn;
  }
  return null;
}

export function buildingStandSpot(own, spots, collider, lift, w = null, people = null, stands = null, self = null) {
  const hasFloor = (p) => Number.isFinite(collider?.raycast?.([p[0], p[1] + lift, p[2]], [0, -1, 0], MARKER_FLOOR_REACH));
  const at = standSpot(own, spots, hasFloor);
  const crowd = crowdOf(people, stands, self);
  if (w == null || !crowdingPerson(at, w, crowd)) return at;
  for (const p of spots?.spawns ?? []) if (hasFloor(p) && !crowdingPerson(p, w, crowd)) return p;
  return besideSpot(at, collider, lift, w, crowd) ?? at;
}

export const QUEST_BESIDE_REACH = Object.freeze([1.1, 1.6]);
export const BESIDE_FLOOR_M = 0.3;

export function besideSpot(at, collider, lift, w, crowd) {
  const down = (p) => collider?.raycast?.([p[0], p[1] + lift, p[2]], [0, -1, 0], MARKER_FLOOR_REACH);
  const base = down(at);
  if (!Number.isFinite(base)) return null;
  const floor = at[1] + lift - base;
  for (const k of QUEST_BESIDE_REACH) {
    const d = k * w;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, dir = [Math.cos(a), 0, Math.sin(a)];
      const p = [at[0] + dir[0] * d, at[1], at[2] + dir[2] * d];
      const hit = down(p);
      if (!Number.isFinite(hit) || Math.abs((p[1] + lift - hit) - floor) > BESIDE_FLOOR_M) continue;
      const wall = collider?.raycast?.([at[0], floor + 1, at[2]], dir, d);
      if (Number.isFinite(wall) && wall < d) continue;
      if (!crowdingPerson(p, w, crowd)) return p;
    }
  }
  return null;
}

// Quest Persons already drawn in the room crowd too, so two quests on one marker do not stack their Persons.
export function crowdOf(people, stands = null, self = null) {
  const stood = [];
  for (const s of stands ?? []) {
    if (!s || s === self || !s.batch || s.dead || s.active === false || !s.behaviour?.targetResource?.isPerson) continue;
    stood.push({ stood: true, active: true, x: s.x, y: s.y, z: s.z, width: s.width });
  }
  return stood.length ? [...(people ?? []), ...stood] : people;
}

export const PLACE_FOE_DEFAULTS = Object.freeze({
  minDistance: 5, maxDistance: 20,
  wildernessMinDistance: 8, wildernessMaxDistance: 25,
  overlapSphereRadius: 0.65, separationDistance: 1.25, maxFloorDistance: 4,
});

// Roll order follows the C# source (offset, side coin, then one distance roll); null means retry next tick.
export function placeFoeFreely(env, { minDistance = PLACE_FOE_DEFAULTS.minDistance, maxDistance = PLACE_FOE_DEFAULTS.maxDistance, lineOfSightCheck = true } = {}) {
  const C = PLACE_FOE_DEFAULTS;
  const rolls = env.rolls ?? Math.random;

  // With lineOfSightCheck false the bearing may fall anywhere in the circle, so a released soul can appear in view.
  let yawDegrees;
  if (lineOfSightCheck) {
    let directionAngle = env.fovDegrees;
    directionAngle += rolls() * 4;
    yawDegrees = (rolls() > 0.5) ? -directionAngle : directionAngle;
  } else {
    yawDegrees = rolls() * 360;
  }
  const yaw = env.playerYawRadians + yawDegrees * Math.PI / 180;
  const spawnDirection = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };

  let currentPoint;
  const initialHit = env.raycast(env.playerPosition, spawnDirection, maxDistance);
  if (initialHit) {
    const n = normalize(initialHit.normal);
    const cosNormal = -(spawnDirection.x * n.x + spawnDirection.y * n.y + spawnDirection.z * n.z);
    if (cosNormal < 1e-6) return null;
    const separationForward = C.separationDistance / cosNormal;
    const distanceSlack = initialHit.distance - separationForward - minDistance;
    if (distanceSlack < 0) return null;
    const extraDistance = rolls() * Math.min(2, distanceSlack);
    const back = separationForward + extraDistance;
    currentPoint = {
      x: initialHit.point.x - spawnDirection.x * back,
      y: initialHit.point.y - spawnDirection.y * back,
      z: initialHit.point.z - spawnDirection.z * back,
    };
  } else {
    const dist = minDistance + rolls() * (maxDistance - minDistance);
    currentPoint = {
      x: env.playerPosition.x + spawnDirection.x * dist,
      y: env.playerPosition.y + spawnDirection.y * dist,
      z: env.playerPosition.z + spawnDirection.z * dist,
    };
  }

  const floorHit = env.raycast(currentPoint, { x: 0, y: -1, z: 0 }, C.maxFloorDistance);
  if (!floorHit) return null;

  const testPoint = { x: floorHit.point.x, y: floorHit.point.y + C.separationDistance, z: floorHit.point.z };
  if (env.overlapSphere?.(testPoint, C.overlapSphereRadius)) return null;
  if (env.bodyClear && !env.bodyClear(floorHit.point)) return null;

  return testPoint;
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
