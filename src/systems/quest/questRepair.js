// @ts-check
// Repair active quests: puts back only what a quest's completed placements put in the world and a fault removed.
// It never restores anything gone on purpose, such as a destroyed person, a taken item, or a killed enemy.
import { MARKER_PREFERENCE, SITE_TYPES } from './place.js';
import { ONLINE_DUNGEONS_STATE, portSize } from '../../world/smallerDungeons.js';
import { isOnlinePage } from '../../platform/onlineLane.js';
import { isShelved } from './quest.js';
import { t } from '../../ui/textManager.js';

const PLACEMENTS = Object.freeze({ PlaceNpc: 'npcSymbol', PlaceItem: 'itemSymbol', PlaceFoe: 'foeSymbol', CreateNpc: 'npcSymbol' });

const homeOf = (person) => (person?.isPerson && !person.isQuestor && !person.isIndividualNPC ? person.getHomePlace?.() ?? null : null);

export const questRunning = (quest) => !!quest && !quest.questComplete && !quest.questTombstoned;

// Item markers count too: a resource an item marker holds is placed, whether or not the mount shows it.
export function targetedNames(quest) {
  const names = new Set();
  for (const r of quest.resources?.values?.() ?? []) {
    if (!r?.isPlace) continue;
    const sd = r.siteDetails;
    for (const m of [sd?.selectedMarker, ...(sd?.questSpawnMarkers ?? []), ...(sd?.questItemMarkers ?? [])]) {
      for (const t of m?.targetResources ?? []) if (t?.name) names.add(t.name);
    }
  }
  return names;
}

// Only the selected marker and the spawn markers count, the two the scene mount reads.
export function placeHoldsTargets(place) {
  const sd = place?.siteDetails;
  return [sd?.selectedMarker, ...(sd?.questSpawnMarkers ?? [])].some((m) => (m?.targetResources?.length ?? 0) > 0);
}

export function goneOnPurpose(res, quest, { carriesQuestItem = null } = {}) {
  if (res.isPerson) return !!res.isDestroyed || !!(res.isIndividualNPC && res.isIndividualAtHome);
  if (res.isItem) {
    if (res.isHidden || res.madePermanent || res.playerDropped) return true;
    if (carriesQuestItem?.(res)) return true;
    const df = res.daggerfallUnityItem ?? null;
    if (df) for (const r of quest.resources?.values?.() ?? []) if (r?.isFoe && r.itemQueue?.includes?.(df)) return true;
    return false;
  }
  if (res.isFoe) return !!res.isHidden || !((res.killCount ?? 0) < (res.spawnCount ?? 0));
  return true;
}

export function placementIntents(quest) {
  const out = new Map();
  for (const task of quest.tasks?.values?.() ?? []) {
    for (const a of task.actions ?? []) {
      const field = PLACEMENTS[a?.typeName];
      if (!field || !a.isComplete) continue;
      const res = quest.getResource?.(a[field]);
      const place = a.typeName === 'CreateNpc' ? homeOf(res) : quest.getPlace?.(a.placeSymbol);
      if (!res || !place) continue;
      const name = res.symbol?.name;
      const prev = out.get(name);
      const intent = { res, place, marker: Number.isInteger(a.marker) ? a.marker : -1, pref: a.markerPreference ?? MARKER_PREFERENCE.Default, ambiguous: false };
      if (!prev) out.set(name, intent);
      else if (prev.place !== place) prev.ambiguous = true;
    }
  }
  for (const [name, it] of out) {
    if (!it.res.isPerson || !it.res.assignedPlaceSymbol) continue;
    const last = quest.getPlace?.(it.res.assignedPlaceSymbol);
    if (!last) continue;
    if (last !== it.place) out.set(name, { ...it, place: last, marker: -1, pref: MARKER_PREFERENCE.Default, ambiguous: false });
    else it.ambiguous = false;
  }
  return out;
}

export function putBackPlacements(quest, env = {}, report = { people: 0, items: 0, foes: 0, failed: 0 }) {
  const held = targetedNames(quest);
  for (const [name, it] of placementIntents(quest)) {
    if (it.ambiguous || held.has(name) || goneOnPurpose(it.res, quest, env)) continue;
    try { it.place.assignQuestResource(it.res.symbol, it.marker, it.pref, false); } catch { report.failed++; continue; }
    if (it.res.isPerson && !it.res.assignedPlaceSymbol) it.res.setAssignedPlaceSymbol?.(it.place.symbol);
    held.add(name);
    if (it.res.isPerson) report.people++;
    else if (it.res.isItem) report.items++;
    else report.foes++;
  }
  return report;
}

const markerAddresses = (list) => (list ?? []).map((m) => `${m?.dungeonX},${m?.dungeonZ},${m?.markerID}`).join(';');

// Online every dungeon builds at the world's size, so a quest whose markers came from another layout has its
// dungeon Places enumerated again and its placements put back. A quest with an unreadable dungeon keeps its stamp.
export function relayOnlineDungeons(machine, env = {}) {
  let relaid = 0;
  for (const quest of machine?.quests?.values?.() ?? []) {
    if (questRunning(quest) && relayQuestOnline(quest, env)) relaid++;
  }
  return relaid;
}

export function relayQuestOnline(quest, env = {}) {
  if (!quest) return false;
  const { moved, unread } = relayDungeonPlaces(quest);
  if (!unread) quest.smallerDungeonsState = ONLINE_DUNGEONS_STATE;
  if (!moved) return false;
  putBackPlacements(quest, env);
  return true;
}

function relayDungeonPlaces(quest, { only = null } = {}) {
  const world = quest.hooks?.world ?? null;
  let moved = false, unread = false;
  for (const r of quest.resources?.values?.() ?? []) {
    const sd = r?.isPlace ? r.siteDetails : null;
    if (sd?.siteType !== SITE_TYPES.Dungeon) continue;
    const index = world?.maps?.getRegion?.(sd.regionIndex)?.mapNameLookup?.get?.(sd.locationName);
    const location = index == null ? null : world.maps.getLocation(sd.regionIndex, index);
    if (!location?.dungeon?.blocks) { unread = true; continue; }
    if (only && !only(sd, location)) continue;
    let markers;
    try { markers = r._enumerateDungeonQuestMarkers(world, location); } catch { unread = true; continue; }
    if (markerAddresses(markers.questSpawnMarkers) === markerAddresses(sd.questSpawnMarkers)
      && markerAddresses(markers.questItemMarkers) === markerAddresses(sd.questItemMarkers)) continue;
    r.siteDetails = { ...sd, questSpawnMarkers: markers.questSpawnMarkers, questItemMarkers: markers.questItemMarkers, selectedMarker: { targetResources: null } };
    moved = true;
  }
  return { moved, unread };
}

// Runs before the dungeon's scene mount: a Place with a target on a marker this build lacks is enumerated again.
export function relayBuiltDungeon(machine, location, env = {}, mapId = location?.mapTableData?.mapId ?? 0) {
  if (!machine?.getSiteLinks || !location?.dungeon?.blocks?.length) return 0;
  let relaid = 0;
  const seen = new Set();
  for (const link of machine.getSiteLinks(SITE_TYPES.Dungeon, mapId, 0) ?? []) {
    const quest = machine.getQuest?.(link.questUID);
    if (!questRunning(quest) || isShelved(quest)) continue;
    const place = quest.getPlace?.(link.placeSymbol);
    const sd = place?.siteDetails;
    if (!sd || sd.siteType !== SITE_TYPES.Dungeon || seen.has(place)) continue;
    seen.add(place);
    const world = quest.hooks?.world ?? null;
    if (!world?.getBlock) continue;
    let markers;
    try { markers = place._enumerateDungeonQuestMarkers(world, location); } catch { continue; }
    const here = new Set(`${markerAddresses(markers.questSpawnMarkers)};${markerAddresses(markers.questItemMarkers)}`.split(';'));
    const held = [sd.selectedMarker, ...(sd.questSpawnMarkers ?? []), ...(sd.questItemMarkers ?? [])]
      .filter((m) => (m?.targetResources?.length ?? 0) > 0 && Number.isInteger(m.dungeonX));
    if (!held.length || held.every((m) => here.has(markerAddresses([m])))) continue;
    if (!markers.questSpawnMarkers && !markers.questItemMarkers) continue;
    place.siteDetails = { ...sd, questSpawnMarkers: markers.questSpawnMarkers, questItemMarkers: markers.questItemMarkers, selectedMarker: { targetResources: null } };
    putBackPlacements(quest, env);
    relaid++;
  }
  return relaid;
}

// Medium builds no longer repeat an interior block, so a dungeon whose build changed is enumerated again.
export function relayMovedLayouts(machine, env = {}, online = isOnlinePage()) {
  let relaid = 0;
  for (const quest of machine?.quests?.values?.() ?? []) if (relayQuestMovedLayout(quest, machine, env, online)) relaid++;
  return relaid;
}
// Offline only a dungeon a site link holds is compared, since without a link the build follows the settings.
export function relayQuestMovedLayout(quest, machine, env = {}, online = isOnlinePage()) {
  if (!questRunning(quest) || !portSize(quest.smallerDungeonsState)) return false;
  const only = (sd, location) => location.dungeon?.distinct === true
    && (online || (machine?.getSiteLinks?.(SITE_TYPES.Dungeon, sd.mapId) ?? []).length > 0);
  if (!relayDungeonPlaces(quest, { only }).moved) return false;
  putBackPlacements(quest, env);
  return true;
}

export function repairActiveQuests(machine, env = {}) {
  const report = { quests: 0, people: 0, items: 0, foes: 0, relinked: 0, revealed: 0, topics: 0, failed: 0 };
  const quests = [...(machine?.quests?.values?.() ?? [])].filter((q) => questRunning(q) && !isShelved(q));
  report.quests = quests.length;
  const was = !!machine?.mountByName;
  if (machine) machine.mountByName = true;
  try {
    for (const quest of quests) {
      try {
        putBackPlacements(quest, env, report);
        for (const r of quest.resources?.values?.() ?? []) {
          if (!r?.isPlace || !placeHoldsTargets(r)) continue;
          const linked = (machine.siteLinks ?? []).some((l) => l.questUID === quest.uid && l.placeSymbol?.name === r.symbol?.name);
          if (linked) continue;
          machine.createSiteLink(quest, r.symbol);
          report.relinked++;
        }
        // Topics go only to a quest that never had any; adding them again un-discovers residences already learned.
        for (const task of quest.tasks?.values?.() ?? []) {
          for (const a of task.actions ?? []) {
            if (a?.typeName !== 'RevealLocation' || !a.isComplete) continue;
            const place = quest.getPlace?.(a.placeSymbol);
            if (!place?.siteDetails) continue;
            try { if (env.discoverLocation?.(place.siteDetails.regionName, place.siteDetails.locationName) === true) report.revealed++; } catch { report.failed++; }
          }
        }
        if (env.hasQuestTopics && env.addQuestTopics && !env.hasQuestTopics(quest)) { env.addQuestTopics(quest); report.topics++; }
      } catch { report.failed++; }
    }
  } finally {
    if (machine) machine.mountByName = was;
  }
  report.text = questRepairText(report);
  return report;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function questRepairText(r) {
  if (!r || !r.quests) return 'You have no active quests to repair.';
  const put = [r.people ? plural(r.people, 'person', 'people') : null, r.items ? plural(r.items, 'item', 'items') : null, r.foes ? plural(r.foes, 'foe', 'foes') : null].filter(Boolean);
  const parts = [];
  if (put.length) parts.push(`put back ${put.join(', ')}`);
  if (r.relinked) parts.push(`reconnected ${plural(r.relinked, 'place', 'places')}`);
  if (r.revealed) parts.push(`marked ${plural(r.revealed, 'location', 'locations')} on your map`);
  if (r.topics) parts.push(`restored what people know about ${plural(r.topics, 'quest', 'quests')}`);
  const head = parts.length ? `Quests repaired: ${parts.join('; ')}.`
    : `Nothing was missing from ${r.quests === 1 ? 'your active quest' : `your ${r.quests} active quests`}.`;
  return r.failed ? `${head} ${plural(r.failed, 'part', 'parts')} could not be checked.` : head;
}
