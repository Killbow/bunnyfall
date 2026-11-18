// BUILDING-NAMES (Bunnyfall): THE TOWN'S NAMED BUILDINGS, ON THE OVERWORLD. A building the player has found - a shop
// they have entered, a guild hall (the Bunnyfall halls are public, the Thieves' and Brotherhood's hideouts are revealed to
// their members) - wears its name over its roof on the Overworld, as a yard's name stands over its ground
// (scenes/merchantYardsHost.js overworldMarks), so a town can be read without waypoints. The same law as the town map's
// plates (ui/exteriorAutomapWindow.js buildPlates): only DISCOVERED buildings, a plain residence never.
//
// Host-split: world.js constructs it and travelViewMarks.js adds its marks; it holds no state but a cache of who each
// static building is (the lookup is per building, the discovery read per frame).
import { BUILDING_TYPES, isResidence } from '../world/buildingNames.js';
import { bunnyGuildOfFaction } from '../systems/guild/bunnyGuilds.js';
import { getDiscoveredBuilding, shownBuildingName } from '../systems/discovery.js';

/** How far over a building's roof its name stands, metres. */
export const BUILDING_MARK_LIFT = 4;

/**
 * @param {{ buildings: () => any[], identify: (b: any) => any, locationOf: (pixelKey: string) => any }} deps
 *   buildings: the static buildings of every built pixel, in the scene (modes.buildingBoxes); identify: one's directory
 *   record (modes.buildingIdentity); locationOf: the town a pixel key belongs to ({ regionIndex, name }).
 */
export function createBuildingNameMarks({ buildings, identify, locationOf }) {
  const who = new WeakMap();   // a static building's matrix -> its directory record (null when it has none)
  const identity = (b) => {
    const key = b.matrix;
    if (key && typeof key === 'object' && who.has(key)) return who.get(key);
    let rec = null;
    try { rec = identify(b) ?? null; } catch { rec = null; }
    if (key && typeof key === 'object') who.set(key, rec);
    return rec;
  };
  return {
    /** The Overworld marks of the named buildings about the player: `yard hall` for a guild hall, `yard shop` for the rest. */
    overworldMarks() {
      const out = [];
      const seen = new Set();
      for (const b of buildings() ?? []) {
        const loc = locationOf(b.pixelKey);
        if (!loc?.name) continue;
        const d = identity(b);
        if (!d || d.buildingKey == null) continue;
        const rec = getDiscoveredBuilding(`${loc.regionIndex}:${loc.name}`, d.buildingKey);
        if (!rec) continue;
        const name = String(rec.customUserDisplayName || shownBuildingName(rec, d.name) || d.name || '');
        if (!name) continue;
        const hall = rec.buildingType === BUILDING_TYPES.GuildHall || !!bunnyGuildOfFaction(rec.factionId) || (rec.isOverrideName && !!rec.factionId);
        if (isResidence(rec.buildingType) && !hall) continue;   // a house is named by a quest alone, and no plate says so here
        const key = `bname:${b.pixelKey}:${d.buildingKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = b.aabb;
        out.push({ key, at: [(a.min[0] + a.max[0]) / 2, a.max[1] + BUILDING_MARK_LIFT, (a.min[2] + a.max[2]) / 2], label: name, kind: hall ? 'yard hall' : 'yard shop' });
      }
      return out;
    },
  };
}
