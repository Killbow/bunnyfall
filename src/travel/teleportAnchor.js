
import { stampLayout, layoutStampOfPixel } from '../world/layoutPins.js';
import { instanceOfWord } from '../net/instanceRoom.js';

export const WORLD_CONTEXT = Object.freeze({
  Nothing: 'Nothing', Exterior: 'Exterior', Interior: 'Interior', Dungeon: 'Dungeon',
});

export const TELEPORT_OR_SET_ANCHOR = 4000;
export const ANCHOR_MUST_BE_SET = 4001;

/**
 * `y` is stored without the world compensation (`pf[1] - compensation[1]`) and the landing adds the live
 * compensation back, so the anchor needs no compensation field.
 * @param {object} p
 * @param {string} p.worldContext
 * @param {{x:number,y:number}} p.pixel
 * @param {number} p.nativeX
 * @param {number} p.nativeZ
 * @param {number} p.y
 * @param {number[]|null} p.local
 * @param {number} p.yaw
 * @param {number} p.pitch
 * @param {object|null} p.interior
 * @param {number} p.buildingKey
 * @param {{ins?: string, whole?: boolean}|null} [p.dungeon]
 */
export function makeAnchor({
  worldContext = WORLD_CONTEXT.Exterior, pixel, nativeX, nativeZ, y = 0,
  local = null, yaw = 0, pitch = 0, interior = null, buildingKey = 0, terrainScale = null, dungeon = null,
} = {}) {
  const insideBuilding = worldContext === WORLD_CONTEXT.Interior;
  const insideDungeon = worldContext === WORLD_CONTEXT.Dungeon;
  const anchor = {
    worldContext,
    // `mode` is still written so that older saves and current saves read the same in both directions.
    mode: insideBuilding ? 'interior' : insideDungeon ? 'dungeon' : 'world-exterior',
    pixel: { x: pixel.x, y: pixel.y },
    nativeX, nativeZ, y,
    terrainScale: terrainScale > 0 ? terrainScale : null,
    local: local ? [...local] : null,
    yaw, pitch,
    insideBuilding, insideDungeon,
    buildingKey: insideBuilding ? buildingKey : 0,
    interior: insideBuilding ? interior : null,
    dungeon: insideDungeon && dungeon ? { ...(instanceOfWord(dungeon.ins) ? { ins: dungeon.ins } : {}), whole: dungeon.whole === true } : null,
  };
  // A building anchor re-enters by its door, and door keys depend on the town layout, so the anchor stores that
  // layout for the load to keep.
  if (insideBuilding) stampLayout(anchor, layoutStampOfPixel(pixel.x, pixel.y));
  return anchor;
}

// Older anchors carry only `mode`, so callers read the context here instead of from `worldContext` directly.
export function anchorContextOf(anchor) {
  if (!anchor) return WORLD_CONTEXT.Nothing;
  if (anchor.worldContext) return anchor.worldContext;
  if (anchor.mode === 'interior') return WORLD_CONTEXT.Interior;
  if (anchor.mode === 'dungeon') return WORLD_CONTEXT.Dungeon;
  return WORLD_CONTEXT.Exterior;
}

/**
 * @param {object|null} anchor
 * @param {object} here
 */
export function isSameInterior(anchor, here = {}) {
  const inside = !!here.insideBuilding || !!here.insideDungeon;
  if (!inside || !anchor) return false;
  const ctx = anchorContextOf(anchor);
  if (here.insideBuilding && ctx === WORLD_CONTEXT.Interior) {
    // The pixel is compared too, as in DFU, because buildings in different places can share a key.
    if ((anchor.buildingKey ?? 0) !== (here.buildingKey ?? 0)) return false;
    return anchor.pixel?.x === here.pixel?.x && anchor.pixel?.y === here.pixel?.y;
  }
  if (here.insideDungeon && ctx === WORLD_CONTEXT.Dungeon) {
    // DFU allows only one dungeon per map pixel.
    return anchor.pixel?.x === here.pixel?.x && anchor.pixel?.y === here.pixel?.y;
  }
  return false;
}

/**
 * The plan has no scene-restore field, because DFU restores by where the player is when the respawn completes,
 * which only the caller knows.
 * @returns {null}
 * @returns {{kind:'same-interior', local, yaw, pitch, teleportedIntoDungeon:boolean}}
 * @returns {{kind:'cross', cacheScene:'exterior'|'building'|null, dungeonExitImmediate:boolean, arrive:'exterior'|'building'|'dungeon', anchor, teleportedIntoDungeon:boolean}}
 */
export function teleportPlan(anchor, here = {}) {
  if (!anchor) return null;
  if (isSameInterior(anchor, here)) {
    return {
      kind: 'same-interior',
      local: anchor.local ? [...anchor.local] : null,
      yaw: anchor.yaw ?? 0, pitch: anchor.pitch ?? 0,
      teleportedIntoDungeon: !!here.insideDungeon,
    };
  }
  const ctx = anchorContextOf(anchor);
  const arrive = ctx === WORLD_CONTEXT.Dungeon ? 'dungeon'
    : ctx === WORLD_CONTEXT.Interior ? 'building' : 'exterior';
  return {
    kind: 'cross',
    cacheScene: here.insideDungeon ? null : here.insideBuilding ? 'building' : 'exterior',
    dungeonExitImmediate: !!here.insideDungeon,
    arrive,
    anchor,
    teleportedIntoDungeon: ctx === WORLD_CONTEXT.Dungeon,
  };
}
