// Every field an item record may carry, with its kind and bounds. An undeclared field still passes the wire clamp.
import { GROUP_TEMPLATE_INDICES } from './itemTemplatesData.js';
import { validAffix, RARITY_ORDER, SOCKET_VALUES, REFORGES_MAX } from './lootRarity.js';
import { validSigil } from './sigil.js';
import { validBardBuffField, BARD_ITEM_NAME_MAX } from '../net/bardServiceLaw.js';
import { validAppearanceField } from '../net/appearanceLaw.js';

export const ITEM_STR_MAX = 128;
export const ITEM_EQUIP_SLOTS = 27;

const int = (o = {}) => ({ kind: 'int', ...o });
const num = (o = {}) => ({ kind: 'number', ...o });
const bool = () => ({ kind: 'bool' });
const str = () => ({ kind: 'string', max: ITEM_STR_MAX });
const oneOf = (values) => ({ kind: 'enum', values: Object.freeze([...values]) });
const list = (of) => ({ kind: 'array', of });
const rec = (check) => ({ kind: 'object', check });

export const validEnchantment = (e) => !!e && typeof e === 'object' && !Array.isArray(e)
  && Number.isInteger(e.type) && Number.isInteger(e.param);
export const validRepairData = (r) => !!r && typeof r === 'object' && !Array.isArray(r)
  && (typeof r.buildingKey === 'string' || Number.isInteger(r.buildingKey))
  && Number.isInteger(r.timeStarted) && Number.isInteger(r.repairTime);

export const BINDER_DECK_NAME_MAX = 40;
export const validBinderDeck = (d) => !!d && typeof d === 'object' && !Array.isArray(d)
  && typeof d.name === 'string' && d.name.length <= BINDER_DECK_NAME_MAX && Array.isArray(d.cards) && d.cards.length <= 40
  && d.cards.every((c) => typeof c === 'string' && c.length > 0 && c.length <= 40);

export const ITEM_FIELDS = Object.freeze({
  templateIndex: int({ min: 0, max: 65535 }),
  group: oneOf(Object.keys(GROUP_TEMPLATE_INDICES)),
  name: str(),
  material: int(),
  dye: int({ min: 0 }),
  variant: int({ min: 0 }),
  flags: int(),
  value: num(),
  currentCondition: int({ min: 0 }),
  maxCondition: int({ min: 0 }),
  minDamage: int(),
  maxDamage: int(),
  message: int(),
  stackCount: int({ min: 0 }),
  weightInKg: num({ min: 0 }),
  typeDependentData: int(),
  enchantmentPoints: int(),
  potionRecipeKey: int({ min: 0 }),
  playerTextureArchive: int({ min: 0 }),
  playerTextureRecord: int({ min: 0 }),
  worldTextureArchive: int({ min: 0 }),
  worldTextureRecord: int({ min: 0 }),
  equipSlot: int({ min: 0, max: ITEM_EQUIP_SLOTS - 1 }),
  magic: bool(),
  artifact: bool(),
  isIdentified: bool(),
  artifactIndexBitfield: int(),
  enchantments: list(validEnchantment),
  customEnchantments: list(validEnchantment),
  poisonType: int({ min: -1 }),
  trappedSoulType: int(),
  soulBoundReleased: bool(),
  timeForItemToDisappear: int({ min: 0 }),
  timeHealthLeechLastUsed: int({ min: 0 }),
  timeEffectsLastRerolled: int({ min: 0 }),
  stockedDate: int({ min: 0 }),
  repairData: rec(validRepairData),
  rriVariant: bool(),
  questItem: bool(),
  questUID: int({ min: 0 }),
  questSymbol: rec((s) => typeof s.name === 'string'),
  questClone: bool(),
  rarity: oneOf(RARITY_ORDER),
  legendary: str(),
  aetheric: str(),
  gilded: str(),
  affixes: list(validAffix),
  qlNamed: bool(),
  lookHidden: bool(),
  exalted: bool(),
  untaken: bool(),
  reforged: int({ min: 0, max: 15 }),
  reforges: int({ min: 1, max: REFORGES_MAX }),
  imprint: str(),
  imbued: bool(),
  imbueWorth: int({ min: 0 }),
  // The hones a piece has taken, or absent; a honed piece never crosses the market (smithItems.js).
  honed: int({ min: 1, max: 63 }),
  cursed: rec(validEnchantment),
  socket: oneOf(SOCKET_VALUES),
  sockets: list((v) => SOCKET_VALUES.includes(v)),
  sigil: rec(validSigil),
  bardName: { kind: 'string', max: BARD_ITEM_NAME_MAX },
  bardBuff: rec(validBardBuffField),
  locked: bool(),
  junk: bool(),
  bound: bool(),
  stonesPaid: int({ min: 1 }),
  quality: int({ min: 0, max: 4 }),
  provenance: str(),
  maker: str(),
  kitMetal: int({ min: 0, max: 9 }),
  fieldKit: bool(),
  card: str(),
  decks: list(validBinderDeck),
  recipe: str(),
  marked: bool(),
  slowRot: bool(),
  noRot: bool(),
  chef: bool(),
  hand: int({ min: 1, max: 2 }),
  potent: int({ min: 25, max: 40 }),
  // Counter, stolen, and uid marks travel with the piece. RECEIVER_MARKS in realmTradeLaw.js lists stripped ones.
  counterBought: bool(),
  counterPaid: int({ min: 0 }),
  counterValue: int({ min: 0 }),
  socketBought: list((v) => Array.isArray(v) && v.length === 2 && Number.isSafeInteger(v[0]) && v[0] >= 0 && v[0] < 8
    && (v[1] === null || (Number.isSafeInteger(v[1]) && v[1] >= 0))),
  stolen: bool(),
  foundCondition: int({ min: 0 }),
  selfMended: int({ min: 0 }),
  uid: str(),
  acquired: bool(),
  wagonKind: oneOf(['cart', 'openWagon', 'caravan']),
  wagonLook: rec((l) => Object.keys(l).every((k) => ['o', 'w', 'f', 'c'].includes(k) && Number.isInteger(l[k]) && l[k] >= 0 && l[k] < 6)),
  wagonEntry: oneOf(['private', 'party', 'public', 'guild']),
  horseCoat: int({ min: 1, max: 6 }),
  horsePattern: int({ min: 1, max: 4 }),
  horseLegs: int({ min: 1, max: 2 }),
  horseSeed: int({ min: 1, max: 65535 }),
  horseBond: int({ min: 1, max: 1000 }),
  horseFed: int({ min: 1 }),
  appearance: rec(validAppearanceField),
});

export const ITEM_FIELD_NAMES = Object.freeze(Object.keys(ITEM_FIELDS));
export const itemFieldsOfKind = (kind) => ITEM_FIELD_NAMES.filter((k) => ITEM_FIELDS[k].kind === kind);
export const isDeclaredItemField = (name) => Object.hasOwn(ITEM_FIELDS, name);

export function validItemField(name, v) {
  const d = ITEM_FIELDS[name];
  if (!d) return v;
  if (v == null) return v;
  switch (d.kind) {
    case 'int':
      if (!Number.isInteger(v)) return undefined;
      if (d.min != null && v < d.min) return undefined;
      if (d.max != null && v > d.max) return undefined;
      return v;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      if (d.min != null && v < d.min) return undefined;
      return v;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'string': return typeof v === 'string' ? (v.length > d.max ? v.slice(0, d.max) : v) : undefined;
    case 'enum': return d.values.includes(v) ? v : undefined;
    case 'array': return Array.isArray(v) && v.every(d.of) ? v : undefined;
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v) && d.check(v) ? v : undefined;
    default: return undefined;
  }
}

export function validItemFields(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  for (const k of Object.keys(item)) {
    if (!isDeclaredItemField(k)) continue;
    const c = validItemField(k, item[k]);
    if (c === undefined) return null;
    item[k] = c;
  }
  return item;
}
