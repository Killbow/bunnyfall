// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { lwSeed, textSeed } from './seed.js';

// Custom template index above the survival block at 1700; `PATRON_KEEPSAKE_TEMPLATE` in `src/net/patronLaw.js` must
// match it.
export const KEEPSAKE_TEMPLATE = 1800;
export const KEEPSAKE_GROUP = 'UselessItems2';
export const KEEPSAKE_ROW = Object.freeze({
  index: KEEPSAKE_TEMPLATE, name: 'Keepsake', baseWeight: 0.1, hitPoints: 100, capacityOrTarget: 0, basePrice: 1,
  enchantmentPoints: 0, rarity: 0, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: 254, worldTextureRecord: 56, playerTextureArchive: 0,
  playerTextureRecord: 0, stackable: false,
});
registerCustomTemplates([KEEPSAKE_ROW]);

export const KEEPSAKE_KINDS = Object.freeze(['locket', 'ring', 'brooch', 'charm']);

/** @param {string} id */
const placeIdOf = (id) => String(id ?? '').split('~')[0];

/** @param {{ id: string, name: string, town: number, home?: number|null }} res */
export function mintKeepsake(res) {
  const kind = KEEPSAKE_KINDS[lwSeed(textSeed(res.id), 0x6b656570) % KEEPSAKE_KINDS.length];
  const item = mintCondition(setItemFields({ group: KEEPSAKE_GROUP, templateIndex: KEEPSAKE_TEMPLATE, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1 }));
  return { ...item, name: `${res.name}'s ${kind}`, livingKeepsake: { id: res.id, name: res.name, town: res.town >>> 0, home: res.home ?? null } };
}

/** @param {any} it */
export const isKeepsake = (it) => it?.templateIndex === KEEPSAKE_TEMPLATE && !!it?.livingKeepsake;

/**
 * Keepsakes of dungeon divers carry no `home`, so `homeOf` resolves it from the keepsake's resident id.
 * @param {readonly any[]} items
 * @param {number} town
 * @param {number|null|undefined} home
 * @param {string} holder
 * @param {((id: string) => (number|null))|null} [homeOf]
 */
export function keepsakeFor(items, town, home, holder, homeOf = null) {
  if (home == null) return null;
  return (items ?? []).find((it) => isKeepsake(it) && it.livingKeepsake.town === (town >>> 0)
    && (it.livingKeepsake.home ?? homeOf?.(it.livingKeepsake.id) ?? null) === home
    && placeIdOf(it.livingKeepsake.id) !== placeIdOf(holder)) ?? null;
}
