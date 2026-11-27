// @ts-check
import { pickFoeHit, pickActivatableHit, activationTargets } from '../player/activate.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { properName } from '../characters/champions.js';
import { isEliteFoe } from '../characters/eliteFoes.js';
import { isActionDoorObject } from '../world/actionSystem.js';
import { searchableKind, searchName } from '../items/searchables.js';
import { nearestPerson, rayPersonDistance } from '../talk/townTalk.js';
import { pickPeerInFront } from '../player/socialPick.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/[^\w .'-]/g, '').trim().slice(0, 48);

/**
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} dir
 * @param {{ collider?: { raycast?: (o: ArrayLike<number>, d: ArrayLike<number>, m: number) => number }|null, foes?: ReadonlyArray<object>|null, objects?: Map<string, { key?: string, modelIdNum?: number, currentLockValue?: number, kind?: string }>|null, look?: { targets?: ReadonlyArray<object>, name?: (key: string) => string }|null, crowd?: ReadonlyArray<{ name?: string, elite?: boolean, dist: number }>|null, reach?: number }} src
 * @returns {{ name: string, elite: boolean, dist: number }|null}
 */
export function pingSubject(eye, dir, { collider = null, foes = null, objects = null, look = null, crowd = null, reach = 64 } = {}) {
  if (!eye || !dir || !collider) return null;
  /** @type {{ name: string, elite: boolean, dist: number }[]} */
  const found = [];
  const foeHit = foes?.length ? pickFoeHit(eye, dir, foes, collider, reach) : null;
  if (foeHit?.foe && Number.isFinite(foeHit.distance)) {
    const foe = /** @type {{ entity?: { mobileType?: number }|null, mobileType?: number }} */ (foeHit.foe);
    const entity = foe.entity ?? null;
    const own = properName(entity);
    const mobile = foe.mobileType ?? entity?.mobileType ?? -1;
    const name = clean(own ? String(own).replace(/^The /, '') : enemyDisplayName(mobile));
    if (name) found.push({ name, elite: isEliteFoe(entity), dist: foeHit.distance });
  }
  if (look?.targets && typeof look.name === 'function') {
    const act = pickActivatableHit(eye, dir, look.targets, collider);
    const title = act ? clean(look.name(act.key)) : '';
    if (title && Number.isFinite(act.distance)) found.push({ name: title, elite: false, dist: act.distance });
  } else if (objects && typeof objects.values === 'function' && typeof objects.get === 'function') {
    const act = pickActivatableHit(eye, dir, activationTargets(/** @type {Map<string, object>} */ (objects), reach), collider);
    const o = act ? objects.get(act.key) : null;
    const name = objectName(o);
    if (name && act && Number.isFinite(act.distance)) found.push({ name, elite: false, dist: act.distance });
  }
  for (const c of crowd ?? []) {
    const name = clean(c?.name);
    if (name && Number.isFinite(c.dist)) found.push({ name, elite: !!c.elite, dist: c.dist });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found[0] ?? null;
}

/** @param {{ modelIdNum?: number, currentLockValue?: number, kind?: string }|null|undefined} o */
function objectName(o) {
  if (!o) return null;
  if (isActionDoorObject(o)) return 'Door';
  const kind = searchableKind(o.modelIdNum);
  if (!kind) return null;
  return searchName(kind, (o.currentLockValue ?? 0) > 0);
}

/**
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} dir
 * @param {number} reach
 * @param {Array<{ pos: number[] }>|null} persons
 * @param {Array<{ id: string, feet: number[] }>|null} peers
 * @param {(p: any) => string|null|undefined} personName
 * @param {(p: any) => string|null|undefined} peerName
 * @param {{ raycast?: (o: ArrayLike<number>, d: ArrayLike<number>, m: number) => number }|null} collider
 */
export function pingCrowd(eye, dir, reach, persons, peers, personName, peerName, collider) {
  /** @type {{ name: string, dist: number }[]} */
  const out = [];
  const blocked = (d) => {
    const w = collider?.raycast?.(eye, dir, d);
    return Number.isFinite(w) && w < d - 0.05;
  };
  const o = [eye[0], eye[1], eye[2]], d = [dir[0], dir[1], dir[2]];
  const n = nearestPerson(o, d, persons);
  if (n && n.distance <= reach && !blocked(n.distance)) {
    const name = clean(typeof personName === 'function' ? personName(n.entry) : '');
    if (name) out.push({ name, dist: n.distance });
  }
  const peer = pickPeerInFront(o, d, peers, reach, rayPersonDistance);
  if (peer && !blocked(peer.distance)) {
    const name = clean(typeof peerName === 'function' ? peerName(peer.peer) : '');
    if (name) out.push({ name, dist: peer.distance });
  }
  return out;
}
