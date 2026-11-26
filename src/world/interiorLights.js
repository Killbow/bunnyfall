// Interior point lights from DaggerfallInterior.AddLight: one light per archive-210 flat at the billboard center
// plus a per-record offset. Range, intensity, and color start from the interior light prefab and are overridden per
// record.

export const INTERIOR_LIGHT_DIR = (() => {
  const d = new Float32Array([0.45, 0.8, 0.35]);
  const l = Math.hypot(d[0], d[1], d[2]);
  d[0] /= l; d[1] /= l; d[2] /= l;
  return d;
})();

export const INTERIOR_AMBIENT = Object.freeze([0.18, 0.18, 0.18]);
export const INTERIOR_NIGHT_AMBIENT = Object.freeze([0.20, 0.18, 0.20]);
export const INTERIOR_AMBIENT_ONLY = Object.freeze([0.8, 0.8, 0.8]);
export const INTERIOR_NIGHT_AMBIENT_ONLY = Object.freeze([0.5, 0.5, 0.5]);

/**
 * A room built with no lamps takes the DFU ambient-only level. Pass the lamps the room was built with, not the live
 * list, and pass the exported ambient constant because it is compared by identity.
 * @param {readonly number[]} ambient
 * @param {ArrayLike<unknown> | null | undefined} lamps
 */
export function roomAmbient(ambient, lamps) {
  if ((lamps?.length ?? 0) > 0) return ambient;
  return ambient === INTERIOR_NIGHT_AMBIENT ? INTERIOR_NIGHT_AMBIENT_ONLY : INTERIOR_AMBIENT_ONLY;
}

export const INTERIOR_LIGHT_RANGE = 15;
export const INTERIOR_LIGHT_INTENSITY = 1;
export const INTERIOR_LIGHT_COLOR = Object.freeze([1, 1, 1]);

const LIGHTS_ARCHIVE = 210;

const RECORD_OFFSETS = new Map([
  [0, -0.1], [2, 0.1], [3, 0.1], [5, 0.15], [6, 0.6], [9, 0.4],
  [11, -0.4], [13, -0.35], [17, 0.2], [20, 0.6], [22, -0.5],
  [24, -1.85], [25, -1.0], [27, -0.02],
]);

const PREFAB_LIGHT = Object.freeze({
  range: INTERIOR_LIGHT_RANGE,
  intensity: INTERIOR_LIGHT_INTENSITY,
  color: INTERIOR_LIGHT_COLOR,
});

const prop = (range, intensity, color) => Object.freeze({
  range, intensity, color: color ? Object.freeze(color) : INTERIOR_LIGHT_COLOR,
});

// Verbatim AddLight second switch resolved against `PREFAB_LIGHT`. Unlisted records (the DFU todo arms and anything
// outside 0-29) keep the prefab light because the switch has no default arm.
const RECORD_LIGHT_PROPS = new Map([
  [0,  prop(20.0, 1.1, [0.95, 0.91, 0.63])],
  [2,  prop(15 / 3, 0.6, [1.0, 0.99, 0.82])],
  [3,  prop(15 / 3, 1, null)],
  [4,  prop(15 / 3, 1, null)],
  [5,  prop(7.5, 0.33, [1.0, 0.89, 0.61])],
  [6,  prop(15.0, 0.75, [1.0, 0.93, 0.62])],
  [8,  prop(15, 1, [0.68, 1.0, 0.94])],
  [9,  prop(15.0, 0.65, [1.0, 0.92, 0.6])],
  [11, prop(5.0, 0.5, null)],
  [13, prop(15 * 1.2, 1.1, [0.93, 0.84, 0.49])],
  [17, prop(15, 0.8, [1.0, 0.97, 0.87])],
  [20, prop(12.0, 0.75, [1.0, 0.92, 0.72])],
  [21, prop(15 / 3, 0.5, [1.0, 0.95, 0.67])],
  [22, prop(15, 1.5, [1.0, 0.95, 0.78])],
  [24, prop(15, 1.4, [1.0, 0.98, 0.64])],
  [25, prop(15, 1.4, [1.0, 0.98, 0.64])],
  [26, prop(15, 1.4, [1.0, 0.98, 0.64])],
  [27, prop(15, 1.4, [1.0, 0.98, 0.64])],
]);

/**
 * @param {number} record
 * @returns {{range:number, intensity:number, color:readonly number[]}}
 */
export function interiorLightProperties(record) {
  return RECORD_LIGHT_PROPS.get(record) ?? PREFAB_LIGHT;
}

/**
 * @param {Array<{archive:number,record:number,x:number,y:number,z:number}>} flats
 * @param {(record:number) => {w:number,h:number}} getScaledSize
 * @returns {Array<{record:number,x:number,y:number,z:number,foot:number,w:number,h:number,range:number,intensity:number,color:readonly number[]}>}
 */
export function collectInteriorLights(flats, getScaledSize) {
  const lights = [];
  for (const f of flats) {
    if (f.archive !== LIGHTS_ARCHIVE) continue;
    const { w, h } = getScaledSize(f.record);
    let offset = RECORD_OFFSETS.get(f.record) ?? 0;
    if (f.record === 14 || f.record === 15) offset = h / 2;
    else if (f.record === 21) offset = h / 2.4;
    const light = interiorLightProperties(f.record);
    lights.push({
      record: f.record,
      x: f.x,
      y: f.y + h / 2 + offset,
      z: f.z,
      foot: f.y, w, h,
      range: light.range,
      intensity: light.intensity,
      color: light.color,
    });
  }
  return lights;
}
