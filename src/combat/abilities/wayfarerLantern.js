// BUNNYFALL: the lantern left on the ground where Wayfarer's Anchor Mark was set. It belongs to the scene the mark was
// set in (the running host's player door) and shows there while the player is near. A new mark moves it; Recall
// consumes the anchor, which puts the lantern out, as does a reload (the restored anchor is a new record).
import { LANTERN_BEAT_S } from '../../render/wayfarerLanternFx.js';
import { playerDoor } from '../../player/playerDoor.js';

export const LANTERN_SEEN_M = 70;
const lanterns = new WeakMap();

export const wayfarerLantern = entity => lanterns.get(entity) ?? null;

export function placeWayfarerLantern(entity, door = playerDoor()) {
  const feet = door?.feet?.();
  if (!entity?.wayfarerAnchor || !feet) return false;
  lanterns.set(entity, { anchor: entity.wayfarerAnchor, door, at: [feet[0], feet[1], feet[2]], clock: 0 });
  return true;
}

export function stepWayfarerLantern(entity, dt, door = playerDoor()) {
  const lantern = lanterns.get(entity);
  if (!lantern) return;
  if (!entity.wayfarerAnchor || entity.wayfarerAnchor !== lantern.anchor) { lanterns.delete(entity); return; }
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  if (door !== lantern.door || door?.player?.() !== entity) return;
  const feet = door.feet?.();
  if (!feet || Math.hypot(feet[0] - lantern.at[0], feet[1] - lantern.at[1], feet[2] - lantern.at[2]) > LANTERN_SEEN_M) return;
  lantern.clock -= step;
  if (lantern.clock > 0) return;
  lantern.clock = LANTERN_BEAT_S;
  door.fx?.('wayfarer-lantern', lantern.at, { ground: lantern.at[1] });
}
