// @ts-check

import { onShopShelfStocked } from '../mods/rriKits.js';
import { RRI_VENDOR } from '../mods/rriItems.js';

/**
 * @typedef {object} ContainerLootArgs
 * @property {number} containerType
 * @property {object[]} items
 * @property {number} [buildingType]
 * @property {number} [quality]
 * @property {number} [luck]
 * @property {() => number} [rolls]
 */

const _handlers = new Map([
  [RRI_VENDOR, (/** @type {ContainerLootArgs} */ a) => {
    onShopShelfStocked(a.items, /** @type {any} */ ({ buildingType: a.buildingType, quality: a.quality, containerType: a.containerType }), a.rolls ? { rolls: a.rolls } : {});
  }],
]);
export function registerContainerLootHandler(name, fn) { if (typeof fn === 'function') _handlers.set(name, fn); else _handlers.delete(name); }
export function raiseContainerLootSpawned(/** @type {ContainerLootArgs} */ args) {
  for (const fn of _handlers.values()) {
    try { fn(args); } catch (e) { console.warn('[lootSpawned] a container handler threw', e); }
  }
  return args.items;
}
