// What one World of Daggerfall prefab object becomes.

export const WOD_LIGHTS_ARCHIVE = 210;
export const WOD_ANIMALS_ARCHIVE = 201;
export const WOD_TREASURE_ARCHIVE = 216;
export const WOD_EDITOR_ARCHIVE = 199;
export const WOD_BUSH_MODEL = 60610;
export const WOD_ROCK_SITES = Object.freeze(['Rocks', 'Mountains']);
export const isWodShrub = (modelId, siteName) => modelId === WOD_BUSH_MODEL && !WOD_ROCK_SITES.includes(siteName);

export const WOD_ROCK_SEAT_M = 0.5;
export const rockSeatDrop = (ground, bottom) => (Number.isFinite(ground) && Number.isFinite(bottom) && bottom > ground - WOD_ROCK_SEAT_M ? ground - WOD_ROCK_SEAT_M - bottom : 0);

/**
 * @param {Array<{matrix: ArrayLike<number>}>} models
 * @returns {Array<any>}
 */
export const supportsFirst = (models) => [...models].sort((a, b) => a.matrix[13] - b.matrix[13]);

const WOD_PERCH_GAP_M = 2;
/**
 * @param {ArrayLike<number>} box
 * @param {{positions: ArrayLike<number>, indices: ArrayLike<number>, floorAt?: number}} cpu
 * @param {ArrayLike<number>} m
 * @param {(x: number, z: number) => number} groundAt
 * @param {Array<ArrayLike<number>>} cleared
 * @param {number} size
 * @returns {boolean}
 */
export function hangsOffCleared(box, cpu, m, groundAt, cleared, size) {
  if (box[1] < groundAt((box[0] + box[3]) / 2, (box[2] + box[5]) / 2) || cpu.floorAt == null) return false;
  if (!cleared.some((c) => box[0] < c[3] && box[3] > c[0] && box[2] < c[5] && box[5] > c[2] && box[1] >= c[1] && box[1] <= c[4] + WOD_ROCK_SEAT_M)) return false;
  const P = cpu.positions;
  // The floor wodRockFloor adds is the pebble's open rim loop.
  const rim = [...new Set(Array.from(cpu.indices).slice(cpu.floorAt))].map((i) => {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  });
  const own = rim.filter(([x, , z]) => x >= 0 && z >= 0 && x <= size && z <= size);
  // Ground past the pixel edge is clamped, so judge only the rim over this pixel when any.
  return (own.length ? own : rim).some(([x, y, z]) => y - groundAt(x, z) > WOD_PERCH_GAP_M);
}

export const WOD_SPAWN_TYPE = Object.freeze({ Quest: 0, BillboardPerson: 1, Enemy: 2, Loot: 3, Good: 4 });
export const WOD_ENEMY_ID = Object.freeze({ Bandits: 1, Bears: 2, Warriors: 3 });

function parseUInt(name) {
  const n = Number(name.trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * @param {{type:number, name:string}} obj
 * @returns {{kind:'model', modelId:?number} | {kind:'flat', archive:number,
 *   record:number, visible:boolean, light:boolean, animal:boolean,
 *   treasure:boolean, spawners:Array<{spawnType:number, enemyID:number, questID:number}>}}
 */
export function classifyObject(obj) {
  if (obj.type === 0) return { kind: 'model', modelId: parseUInt(obj.name) };
  const arg = obj.name.split('.');
  const archive = Number(arg[0]);
  const record = Number(arg[1]);
  const treasure = arg[0] === '216';
  const spawners = [];
  if (treasure) spawners.push({ spawnType: WOD_SPAWN_TYPE.Loot, enemyID: 0, questID: 0 });
  if (arg[0] === '479') spawners.push({ spawnType: WOD_SPAWN_TYPE.Enemy, enemyID: WOD_ENEMY_ID.Bandits, questID: 0 });
  if (arg[0] === '483') spawners.push({ spawnType: WOD_SPAWN_TYPE.Good, enemyID: WOD_ENEMY_ID.Bandits, questID: 0 });
  if (arg[0] === '457') spawners.push({ spawnType: WOD_SPAWN_TYPE.Enemy, enemyID: WOD_ENEMY_ID.Bears, questID: 0 });
  if (arg[0] === '357' && arg[1] === '6') spawners.push({ spawnType: WOD_SPAWN_TYPE.Quest, enemyID: 0, questID: 0 });
  if (arg[0] === '478') spawners.push({ spawnType: WOD_SPAWN_TYPE.Enemy, enemyID: WOD_ENEMY_ID.Warriors, questID: 0 });
  return {
    kind: 'flat',
    archive,
    record,
    visible: spawners.length === 0 && archive !== WOD_EDITOR_ARCHIVE,
    light: arg[0] === '210',
    animal: arg[0] === '201',
    treasure,
    spawners,
  };
}

const LIGHT_LIFT = new Map([
  [0, -0.1], [2, 0.1], [3, 0.1], [5, 0.15], [6, 0.6], [9, 0.4],
  [11, -0.4], [13, -0.35], [14, 'half'], [15, 'half'], [17, 0.2], [20, 0.6],
  [21, 'fifth'], [22, -0.5], [24, -1.85], [25, -1.0], [27, -0.02], [29, 'half'],
]);

const PREFAB = Object.freeze({ range: 15, intensity: 1, color: Object.freeze([1, 1, 1]) });
const c32 = (r, g, b) => Object.freeze([r / 255, g / 255, b / 255]);
const L = (range, intensity, color) => Object.freeze({ range, intensity, color: color ? Object.freeze(color) : PREFAB.color });

const LIGHT_PROPS = new Map([
  [0, L(15, 1.2, c32(255, 147, 41))],
  [2, L(15 / 3, 0.6, [1.0, 0.99, 0.82])],
  [3, L(15 / 3, 1, null)],
  [4, L(15 / 3, 1, null)],
  [5, L(7.5, 0.33, [1.0, 0.89, 0.61])],
  [6, L(15.0, 0.75, [1.0, 0.93, 0.62])],
  [8, L(15, 1, [0.68, 1.0, 0.94])],
  [9, L(15.0, 0.65, [1.0, 0.92, 0.6])],
  [11, L(5.0, 0.5, null)],
  [13, L(15 * 1.2, 1.1, [0.93, 0.84, 0.49])],
  [17, L(15, 0.8, [1.0, 0.97, 0.87])],
  [20, L(12.0, 0.75, [1.0, 0.92, 0.72])],
  [21, L(15 / 3, 0.5, [1.0, 0.95, 0.67])],
  [22, L(15, 1.5, [1.0, 0.95, 0.78])],
  [24, L(15, 1.4, [1.0, 0.98, 0.64])],
  [25, L(15, 1.4, [1.0, 0.98, 0.64])],
  [26, L(15, 1.4, [1.0, 0.98, 0.64])],
  [27, L(15, 1.4, [1.0, 0.98, 0.64])],
]);
const DEFAULT_ARM = L(15, 1.2, c32(255, 147, 41));

export function wodLightProperties(record) {
  if (LIGHT_PROPS.has(record)) return LIGHT_PROPS.get(record);
  return record >= 0 && record <= 29 ? L(PREFAB.range, PREFAB.intensity, null) : DEFAULT_ARM;
}

/**
 * @param {number[]} base
 * @param {number} record
 * @param {{w:number,h:number}} size
 * @param {number} scaleY
 * @returns {number[]}
 */
export function wodLightPosition(base, record, size, scaleY = 1) {
  const lift = LIGHT_LIFT.get(record);
  const l = lift === 'half' ? size.h / 2 : lift === 'fifth' ? size.h / 2.4 : (lift ?? 0);
  return [base[0], base[1] + (size.h / 2 + l) * scaleY, base[2]];
}

function rotationColumns({ x, y, z, w }) {
  const n = Math.hypot(x, y, z, w);
  if (n > 0) { x /= n; y /= n; z /= n; w /= n; } else { x = 0; y = 0; z = 0; w = 1; }
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)],
    [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)],
    [2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)],
  ];
}

/** @returns {?Float32Array} */
export function objectNormalMatrix(rot, scale) {
  if (scale.x === scale.y && scale.y === scale.z) return null;
  if (!scale.x || !scale.y || !scale.z) return null;
  const [c0, c1, c2] = rotationColumns(rot);
  return new Float32Array([
    c0[0] / scale.x, c0[1] / scale.x, c0[2] / scale.x, 0,
    c1[0] / scale.y, c1[1] / scale.y, c1[2] / scale.y, 0,
    c2[0] / scale.z, c2[1] / scale.z, c2[2] / scale.z, 0,
    0, 0, 0, 1,
  ]);
}

/**
 * @param {number[]} pos
 * @param {{x:number,y:number,z:number,w:number}} rot
 * @param {{x:number,y:number,z:number}} scale
 * @returns {Float32Array}
 */
export function objectMatrix(pos, rot, scale) {
  const [c0, c1, c2] = rotationColumns(rot);
  return new Float32Array([
    c0[0] * scale.x, c0[1] * scale.x, c0[2] * scale.x, 0,
    c1[0] * scale.y, c1[1] * scale.y, c1[2] * scale.y, 0,
    c2[0] * scale.z, c2[1] * scale.z, c2[2] * scale.z, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}
