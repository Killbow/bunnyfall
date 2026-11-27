// @ts-check

/** @type {null | { foes: () => any[], feet: () => number[]|null, hurtFoe: (f: any, n: number) => void, castOnPlayer: (b: any, o?: { power?: boolean, placement?: { eye: number[], dir: number[] }, companionRange?: number }) => void, player?: () => any, clear?: (a: number[], b: number[]) => boolean, say?: (line: string) => void, sfx?: (id: number, at: number[]) => void, lairHere?: (at?: { x: number, y: number }) => any, isPuppet?: (f: any) => boolean, fx?: (recipe: string, at: number[], o?: any) => void }} */
let _door = null;
export function setPlayerDoor(door) { _door = door && typeof door === 'object' ? door : null; }
export const playerDoor = () => _door;

const _owed = new WeakMap();
export function oweFoe(entity, n) {
  if (entity && typeof entity === 'object' && n > 0) _owed.set(entity, (_owed.get(entity) ?? 0) + n);
}
export function takeOwed(entity) {
  if (!entity || typeof entity !== 'object') return 0;
  const n = _owed.get(entity) ?? 0;
  _owed.delete(entity);
  return n;
}

export function paidBack(f, n) {
  if (!(n > 0)) return 0;
  const h = f?.entity?.health;
  if (!Number.isFinite(h)) return n;
  return Math.max(0, Math.min(n, Math.ceil(h) - 1));
}
