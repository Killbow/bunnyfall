import { lootCrown } from './lootLines.js';
export const WILD_MINE_MARK = Object.freeze({ colour: Object.freeze([0.95, 0.24, 0.16]), h: 9, pulse: true, reach: 80 });
import { FlatAnimator, armFlatAnim } from '../render/flatAnimation.js';
import { billboardSize } from '../world/rmbFlats.js';
import { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS } from './loot.js';
import { CONTAINER_IMAGES } from '../ui/targetIconPanel.js';
import { RAY_DISTANCE, TREASURE_ACTIVATION_DISTANCE } from '../player/activate.js';
import { createPhysicalItems } from './physicalItemsLayer.js';

export { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS };

export const droppedLootHooks = (pile) => ({
  items: () => pile.items,
  playerOwned: !pile.container,
  textureArchive: pile.archive,
  textureRecord: pile.record,
  containerImage: () => CONTAINER_IMAGES.Chest,
  pos: [...pile.pos],
  ...(pile.noStore ? { capacity: () => pile.noStore } : {}),
});

export const containerDropPos = (at, feet) => (at ? [at[0], feet[1], at[2]] : feet);

export function createDroppedLoot({ renderer, getTexture, uploadRecordFrame, pick, physical: physicalDeps = {} }) {
  const piles = [];
  const physical = createPhysicalItems({ renderer, ...physicalDeps });
  // Free only this pile: releaseEmptied would also deactivate a scene's unopened empty treasure.
  physical.attach({ emptied: (backing) => { if (backing?.kind === 'pile' && backing.pile && !backing.pile.items.length) removePile(backing.pile); } });
  const presented = (p) => p.physical === true && physical.presents(p);
  const flatAnims = new FlatAnimator();
  // Removing a pile frees its batch here, so the animator entry goes with the GPU batch.
  function freeBatch(p) {
    if (!p.batch) return;
    flatAnims.remove(p.batch);
    renderer.destroyBillboardBatch(p.batch);
  }
  function remintBatch(p) {
    const was = p.batch;
    renderer.destroyBillboardBatch(was);
    p.batch = renderer.createBillboardBatch(p.archive, p.record, p.size, [[p.pos[0], p.pos[1], p.pos[2]]]);
    p.batch.noShadow = true;
    p.batch.frame = 0;
    flatAnims.rebind(was, p.batch);
  }
  // Ids are never reused, so target keys survive the splices in releaseEmptied.
  let _nextId = 0;
  const roll = pick ?? (() => Math.floor(Math.random() * RANDOM_TREASURE_ICONS.length));

  function mount(pile) {
    getTexture(pile.archive).then((t) => {
      // The pile can be removed while its texture loads; dead tells this continuation to mint nothing.
      if (pile.dead) return;
      uploadRecordFrame(pile.archive, pile.record, 0);
      const size = billboardSize(t, pile.record);
      pile.size = size;
      pile.batch = renderer.createBillboardBatch(pile.archive, pile.record, size, [[pile.pos[0], pile.pos[1], pile.pos[2]]]);
      pile.batch.noShadow = true;
      pile.batch.frame = 0;
      armFlatAnim(pile.batch, t, pile.archive, pile.record, flatAnims, uploadRecordFrame);
    }).catch(() => {});
  }

  function dropPile(items, feet, pixelKey = null, icon = null) {
    if (!items?.length) return null;
    const archive = icon?.archive ?? RANDOM_TREASURE_ARCHIVE;
    const record = icon?.record ?? RANDOM_TREASURE_ICONS[roll()];
    const pile = { id: ++_nextId, items, pos: [feet[0], feet[1], feet[2]], archive, record, batch: null, pixelKey };
    piles.push(pile);
    mount(pile);
    return pile;
  }

  function dropPhysical(items, feet, forward, pixelKey = null) {
    const list = (items ?? []).filter(Boolean);
    if (!list.length) return [];
    const at = physical.placeDrops(list, feet, forward, piles.filter((p) => p.physical === true && alive(p)));
    return list.map((it, i) => {
      const pile = dropPile([it], at[i], pixelKey);
      pile.physical = true;
      return pile;
    });
  }

  function seedPile(items, feet, icon, key = null, pixelKey = null, { unsaved = false, drawn = true, owner = null } = {}) {
    const pile = {
      id: ++_nextId, items: items ?? [], pos: [feet[0], feet[1], feet[2]],
      archive: icon.archive, record: icon.record, batch: null, pixelKey,
      container: true, containerKey: key, unsaved, drawn, owner,
    };
    piles.push(pile);
    if (drawn) mount(pile);
    return pile;
  }

  function removePile(pile) {
    const i = piles.indexOf(pile);
    if (i < 0) return;
    pile.dead = true;
    freeBatch(pile);
    pile.batch = null;
    piles.splice(i, 1);
  }

  function collectPixel(pixelKey) {
    for (let i = piles.length - 1; i >= 0; i--) {
      const p = piles[i];
      if (p.pixelKey !== pixelKey) continue;
      p.dead = true;
      freeBatch(p);
      piles.splice(i, 1);
    }
  }

  function takePixel(pixelKey, keep) {
    const out = [];
    for (let i = piles.length - 1; i >= 0; i--) {
      const p = piles[i];
      if (p.pixelKey !== pixelKey || !keep(p)) continue;
      p.dead = true;
      freeBatch(p);
      piles.splice(i, 1);
      out.unshift({ items: p.items, pos: [...p.pos], archive: p.archive, record: p.record, ...(p.physical ? { physical: true } : {}) });
    }
    return out;
  }

  function snapshotWorld(toNative) {
    return piles.filter((p) => p.items.length && !p.unsaved).map((p) => {
      const wc = toNative(p.pos);
      return { nativeX: wc.x, nativeZ: wc.z, y: p.pos[1], archive: p.archive, record: p.record, pixelKey: p.pixelKey ?? null, items: p.items.map((it) => ({ ...it })), ...(p.physical ? { physical: true } : {}) };
    });
  }
  function restoreWorld(saved, fromNative, yOffset = 0) {
    for (const p of piles) { p.dead = true; freeBatch(p); }
    piles.length = 0;
    physical.clear();
    for (const s of saved ?? []) {
      if (!s.items?.length) continue;
      const [lx, lz] = fromNative(s.nativeX, s.nativeZ);
      // Older saves have no archive; every pile in them used RANDOM_TREASURE_ARCHIVE.
      const pile = { id: ++_nextId, items: s.items.map((it) => ({ ...it })), pos: [lx, s.y + yOffset, lz], archive: s.archive ?? RANDOM_TREASURE_ARCHIVE, record: s.record, batch: null, pixelKey: s.pixelKey ?? null, ...(s.physical ? { physical: true, settled: true } : {}) };
      piles.push(pile);
      mount(pile);
    }
  }

  // Scene-built containers are written even when empty, so an emptied pile stays emptied after re-entry.
  // Remains owned by the open zone belong to the room, never to the scene cache.
  function snapshotScene() {
    return piles.filter((p) => (p.items.length || p.container) && p.owner !== 'wild' && !p.unsaved).map((p) => ({
      pos: [...p.pos], archive: p.archive, record: p.record,
      container: !!p.container, containerKey: p.containerKey ?? null,
      items: p.items.map((it) => ({ ...it })),
      ...(p.physical ? { physical: true } : {}),
    }));
  }

  function restorePiles(saved) {
    for (const p of piles) { p.dead = true; freeBatch(p); }
    piles.length = 0;
    physical.clear();
    for (const s of saved ?? []) {
      if (!s.items?.length && !s.container) continue;
      const pile = { id: ++_nextId, items: s.items?.map((it) => ({ ...it })) ?? [], pos: [s.pos[0], s.pos[1], s.pos[2]], archive: s.archive ?? RANDOM_TREASURE_ARCHIVE, record: s.record, batch: null, container: !!s.container, containerKey: s.containerKey ?? null, inactive: false, ...(s.physical ? { physical: true, settled: true } : {}), ...(typeof s.remainsKey === 'string' ? { remainsKey: s.remainsKey } : {}) };
      piles.push(pile);
      // An empty scene container stays in the list, inactive, so the marker pass does not roll a fresh one.
      if (!pile.items.length) { deactivate(pile); continue; }
      mount(pile);
    }
  }

  function deactivate(pile) {
    pile.inactive = true;
    freeBatch(pile);
    pile.batch = null;
  }

  // Ticking is kept out of batches() because some hosts read batches twice a frame.
  const tickFlats = (dt) => { flatAnims.tick(dt); physical.frame(dt, piles.filter((p) => p.physical === true && alive(p))); };
  const alive = (p) => !p.inactive && (p.items.length > 0 || p.container === true);
  const batches = () => {
    const out = piles.filter((p) => alive(p) && p.batch && !presented(p)).map((p) => p.batch);
    for (const b of physical.batches()) out.push(b);
    return out;
  };
  function lootTargets() {
    const out = [];
    piles.forEach((p) => {
      if (!alive(p) || presented(p)) return;
      // The pile competes at the ray's reach and carries the treasure reach, so a far pile says it is too far.
      out.push({ key: `droppedLoot:${p.id}`, aabb: { min: [p.pos[0] - 0.5, p.pos[1], p.pos[2] - 0.5], max: [p.pos[0] + 0.5, p.pos[1] + 0.6, p.pos[2] + 0.5] }, distance: RAY_DISTANCE, reach: TREASURE_ACTIVATION_DISTANCE });
    });
    for (const t of physical.targets()) out.push(t);
    return out;
  }
  const pileFor = (key) => piles.find((p) => p.id === Number(key.split(':')[1]) && alive(p)) ?? null;

  const activePiles = () => piles.filter(alive);

  const containerSeeded = (key) => key != null && piles.some((p) => p.containerKey === key);

  function releaseEmptied() {
    for (let i = piles.length - 1; i >= 0; i--) {
      const p = piles[i];
      if (p.items.length || p.inactive) continue;
      // Deactivate scene containers instead of removing them, or the marker pass refills them on every entry.
      if (p.container) { deactivate(p); continue; }
      p.dead = true;
      freeBatch(p);
      piles.splice(i, 1);
    }
  }

  function offsetAll(offset) {
    const [dx, dy, dz] = offset;
    physical.offsetAll(offset);
    for (const p of piles) {
      p.pos[0] += dx; p.pos[1] += dy; p.pos[2] += dz;
      // Batch centers live in a static buffer, so a moved pile remints its batch.
      if (p.batch) remintBatch(p);
    }
  }

  function groundMoved(x0, z0, x1, z1, dy) {
    physical.groundMoved(x0, z0, x1, z1, dy);
    for (const p of piles) {
      if (!(p.pos[0] >= x0 && p.pos[0] < x1 && p.pos[2] >= z0 && p.pos[2] < z1)) continue;
      const d = dy(p.pos[0], p.pos[2]);
      if (!d) continue;
      p.pos[1] += d;
      if (p.batch) remintBatch(p);
    }
  }

  const contents = (key) => (physical.owns(key) ? physical.contents(key) : piles.find((p) => `droppedLoot:${p.id}` === key && !p.dead)?.items ?? null);
  const labelFor = (key) => piles.find((p) => `droppedLoot:${p.id}` === key && !p.dead)?.label ?? null;
  const undrawnPiles = () => piles.filter((p) => p.drawn === false && alive(p));
  const lootFinds = () => [...piles.filter((p) => alive(p) && p.items?.length && !presented(p)).map((p) => (p.wild?.mine ? { root: lootCrown(p.pos, p.size), items: p.items, mark: WILD_MINE_MARK } : p.mark ? { root: lootCrown(p.pos, p.size), items: p.items, mark: p.mark } : { root: lootCrown(p.pos, p.size), items: p.items })), ...physical.finds()];
  return { contents, labelFor, dropPile, dropPhysical, physical, seedPile, removePile, restorePiles, collectPixel, takePixel, snapshotWorld, restoreWorld, batches, tickFlats, lootTargets, pileFor, activePiles, undrawnPiles, containerSeeded, snapshotScene, releaseEmptied, offsetAll, groundMoved, lootFinds, _piles: piles };
}
