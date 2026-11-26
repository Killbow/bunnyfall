// @ts-check
// Daggerfall class sprites offered as player skins.

import manifest from '../../vendor/class-skins/skins.json' with { type: 'json' };

export const EOTB_FOOT_SET_COUNT = 16;

/** @typedef {{archive:number, name:string, gender:string|null, bow:boolean, scale?:Readonly<Record<string, number>>, frames:ReadonlyArray<number>}} ClassSkin */
/** @type {ReadonlyArray<ClassSkin>} */
export const CLASS_SKINS = Object.freeze(manifest.skins.map((s) => Object.freeze({
  ...s, frames: Object.freeze([...s.frames]), ...(s.scale ? { scale: Object.freeze({ ...s.scale }) } : {}),
})));

export function classRecordScale(archive, record) {
  return CLASS_SKINS.find((s) => s.archive === archive)?.scale?.[record] ?? 1;
}

export const FOOT_SKIN_COUNT = EOTB_FOOT_SET_COUNT + CLASS_SKINS.length;

export const classSkinOf = (onFoot) => (Number.isInteger(onFoot) && onFoot >= EOTB_FOOT_SET_COUNT ? CLASS_SKINS[onFoot - EOTB_FOOT_SET_COUNT] ?? null : null);

export const classSkinLabel = (skin) => (skin.gender ? `${skin.name} (${skin.gender})` : skin.name);

export const CLASS_TABLE_BASE = Object.freeze({
  Idle: 15, Move: 0, Death: 10,
  IdleMelee: 15, MoveMelee: 0, AttackMelee: 5,
  IdleRanged: 15, MoveRanged: 0, AttackRanged: 20,
  IdleSpell: 15, MoveSpell: 0, AttackSpell: 20,
});
export const CLASS_BOW_BASE = 25;

export function classRecord(skin, table, offset) {
  const base = table === 'AttackRanged' && skin.bow ? CLASS_BOW_BASE : CLASS_TABLE_BASE[table];
  return base == null ? null : base + offset;
}

export function classFrame(skin, record, frame, tableFrames) {
  const n = skin.frames[record] ?? 1;
  const t = Math.max(1, tableFrames | 0);
  const f = Math.min(Math.max(frame | 0, 0), t - 1);
  return Math.floor((f * n) / t);
}
