import { fitBlowToGround } from '../../ai/foeBlows.js';
import { inCromwarkMark } from './cromwarkPatterns.js';

export const CROMWARK_FIXED_PACK = 25;
export const CROMWARK_ROAMING_PACK = 20;
export const cromwarkBlightEliteChance = (level) => .05 + Math.min(3, Math.max(0, level)) * .07;
export const cromwarkBlightLoot = (level) => level > 0 ? 1.15 : 1;

export function rodneyBarrage(origin, yaw, rotation) {
  const color = [.75, .16, 1];
  const mark = (kind, dim, start, land, angle = yaw, point = origin) =>
    ({ kind, dim, start, land, origin: [...point], yaw: angle, color });
  const marks = [
    mark('slam', { r: 4, ahead: 0 }, 0, 1.5),
    mark('ring', { rIn: 5, rOut: 11 }, .7, 2.8),
    mark('ring', { rIn: 11, rOut: 17 }, 2.0, 4.15),
  ];
  const bearing = yaw + rotation;
  for (let i = 0; i < 4; i++) {
    const angle = bearing + i * Math.PI / 2;
    marks.push(mark('lunge', { len: 19, halfW: 1.6 }, 1.35, 3.35, angle));
    const a = angle + Math.PI / 4;
    const point = [origin[0] + Math.sin(a) * 7, origin[1], origin[2] + Math.cos(a) * 7];
    marks.push(mark('slam', { r: 3.8, ahead: 0 }, 3.2, 5.15, 0, point));
  }
  return marks;
}

export function createCromwarkBlight({ roll = Math.random, toward, hurt, warn, collider, onBlight }) {
  const fires = new Set();
  let level = 0, remaining = 0, age = 0, cast = [], drawn = [], phase = 0;
  function reset() {
    fires.clear();
    level = 0; remaining = 0; age = 0; cast = []; drawn = [];
  }
  return {
    level: () => level,
    marks: () => drawn,
    reset,
    expose(id) {
      if (fires.has(id)) return;
      fires.add(id);
      if (!level) remaining = 24 + roll() * 20;
      if (level < 3) {
        level++;
        onBlight?.(level);
      }
    },
    frame(dt, feet, inside, active) {
      if (!inside) { reset(); return; }
      if (!active || !feet || !(dt > 0) || !level) return;
      drawn = [];
      if (!cast.length) {
        remaining -= dt;
        if (remaining > 0) return;
        cast = rodneyBarrage(feet, toward(feet), phase++ * Math.PI / 7);
        for (const mark of cast) fitBlowToGround(mark, collider);
        age = 0;
        warn();
      }
      const previous = age;
      age += Math.min(dt, .25);
      let struck = false;
      for (const blow of cast) {
        if (age >= blow.start && age <= blow.land + .25) {
          drawn.push({ blow, phase: { t: Math.min(1, (age - blow.start) / (blow.land - blow.start)), flash: age >= blow.land ? 1 : 0 } });
        }
        if (previous < blow.land && age >= blow.land && inCromwarkMark(blow, feet)) struck = true;
      }
      if (struck) hurt(.3 + .05 * level);
      if (age > 5.4) { cast = []; remaining = 36 + roll() * 29 - level * 4; }
    },
    offset(delta) {
      for (const mark of cast) for (let axis = 0; axis < 3; axis++) mark.origin[axis] += delta[axis];
    },
  };
}
