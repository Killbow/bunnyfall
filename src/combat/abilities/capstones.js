import { effectiveLevel } from '../../characters/mentorMode.js';
import { skillValue } from '../../characters/skills.js';
import { liveStat } from '../../characters/statMods.js';
import { weaponMaterialModifier } from '../../characters/weapons.js';
import { sigilRenown } from '../../items/sigil.js';
import { rayHit } from '../../player/groundRay.js';
import { coverDistance } from '../../ai/cover.js';
import { floorUnder, groundAim, volleyPoints } from '../techniques.js';

/** Added before the attack formula applies armor, material and hit rules. */
export function capstonePower({ base, stat }, entity, skill, weapon) {
  const proficiency = Math.max(0, Math.min(120, skillValue(entity, skill)));
  const level = Math.max(1, Math.min(30, effectiveLevel(entity)));
  const renown = Math.max(0, Math.min(50, sigilRenown() ?? 0));
  const attribute = Math.max(0, Math.min(120, liveStat(entity, stat)));
  const material = Math.max(0, weaponMaterialModifier(weapon?.material));
  return Math.round(base * (0.65 + proficiency / 200 + level / 65 + renown / 250 + attribute / 250 + material / 60));
}

export function abilityLook(cam, yaw = cam.yaw) {
  const pitch = cam.pitch ?? 0;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/** Choose visible ground and fit each shaft under its own ceiling. */
export function skyfallPattern(cam, collider, { rain, rangeM, ammo }) {
  if (!cam || !collider) return null;
  const aim = groundAim(cam.pos, abilityLook(cam), cam.feet, collider, rangeM);
  if (!aim || aim.dist < 2 || Math.abs(aim.point[1] - cam.feet[1]) > 8) return null;
  const centre = aim.point;
  const shots = [];
  const points = [centre, ...volleyPoints(centre, rain.radius, ammo - 1)];
  for (const [i, point] of points.entries()) {
    const [x, , z] = point;
    const y = floorUnder(point, collider);
    if (y == null || Math.abs(y - centre[1]) > 2.5 || Math.hypot(x - cam.feet[0], z - cam.feet[2]) > rangeM) continue;
    const sight = [x - cam.pos[0], y + 0.8 - cam.pos[1], z - cam.pos[2]];
    const length = Math.hypot(...sight);
    if (!(length > 0)) continue;
    const ray = sight.map(n => n / length);
    if (Math.min(rayHit(cam.pos, ray, length, collider), coverDistance(collider, cam.pos, ray, length, true)) < length - 0.05) continue;
    const base = [x, y + 0.4, z];
    const height = rain.height * (0.57 + 0.43 * i / Math.max(1, points.length - 1));
    const ceiling = rayHit(base, [0, 1, 0], height, collider);
    const start = Math.min(height, ceiling - 0.2);
    if (start < 0.65) continue;
    shots.push({ from: [x, base[1] + start, z], dir: [0, -1, 0], rangeM: start + 0.6 });
  }
  return shots.length ? { centre, shots } : null;
}
