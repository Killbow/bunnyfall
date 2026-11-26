// @ts-check
// `wagonLook` `{ o, w, f, c }` is saved on the wagon item and sent as one number, `wl = o + 6w + 36f + 216c`
// (horseCartWire.js, `validParkData` in net/wire.js). Changing `LOOK_COUNT` or reordering a list changes every
// saved and sent look.
import { validWagonKind, isWagonItem, activeWagonItem, wagonKindOf } from './wagonKinds.js';

export const LOOK_COUNT = 6;

export const WAGON_OUTSIDE_LOOKS = Object.freeze({
  cart: Object.freeze(['oak', 'red', 'blue', 'green', 'black', 'white']),
  openWagon: Object.freeze(['cream', 'red', 'blue', 'green', 'ochre', 'black']),
  caravan: Object.freeze(['green', 'oxblood', 'blue', 'ochre', 'black', 'white']),
});
export const CARAVAN_INSIDE_LOOKS = Object.freeze({
  walls: Object.freeze(['green', 'oak', 'whitewash', 'blue', 'oxblood', 'ochre']),
  floor: Object.freeze(['pine', 'oak', 'dark', 'redRug', 'blueRug', 'checker']),
  ceiling: Object.freeze(['boards', 'whitewash', 'night', 'green', 'oak', 'ochre']),
});
export const CARAVAN_INSIDE_PARTS = Object.freeze(['walls', 'floor', 'ceiling']);
const PART_FIELD = Object.freeze({ walls: 'w', floor: 'f', ceiling: 'c' });

export const LOOK_NAMES = Object.freeze({
  oak: 'Weathered oak', red: 'Red', blue: 'Blue', green: 'Green', black: 'Black', white: 'White', cream: 'Cream canvas',
  ochre: 'Ochre', oxblood: 'Oxblood', whitewash: 'Whitewash', pine: 'Pine boards', dark: 'Dark boards',
  redRug: 'Red rug', blueRug: 'Blue rug', checker: 'Checkered tiles', boards: 'Painted boards', night: 'Night sky',
});
export const LOOK_TEXT = Object.freeze({
  paint: 'Paint',
  outside: 'Outside',
  walls: 'Walls', floor: 'Floor', ceiling: 'Ceiling',
  painted: (name) => `Your wagon is painted ${name.toLowerCase()}.`,
  paintedInside: (part, name) => `The ${part} ${part === 'walls' ? 'are' : 'is'} now ${name.toLowerCase()}.`,
  noWagon: 'You have no wagon to paint.',
  notCaravan: 'Only a caravan has an inside to paint.',
});

const index = (v) => (Number.isInteger(v) && v >= 0 && v < LOOK_COUNT ? v : 0);

export function readWagonLook(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { o: index(o.o), w: index(o.w), f: index(o.f), c: index(o.c) };
}
export const wagonLookOf = (item) => readWagonLook(isWagonItem(item) ? item.wagonLook : null);
export const isBuiltLook = (look) => { const l = readWagonLook(look); return !l.o && !l.w && !l.f && !l.c; };

export const wagonLookCode = (look) => { const l = readWagonLook(look); return l.o + LOOK_COUNT * (l.w + LOOK_COUNT * (l.f + LOOK_COUNT * l.c)); };
export const WAGON_LOOK_CODE_MAX = LOOK_COUNT ** 4 - 1;
export function wagonLookOfCode(code) {
  if (!Number.isInteger(code) || code < 0 || code > WAGON_LOOK_CODE_MAX) return readWagonLook(null);
  return readWagonLook({ o: code % LOOK_COUNT, w: Math.floor(code / LOOK_COUNT) % LOOK_COUNT, f: Math.floor(code / LOOK_COUNT ** 2) % LOOK_COUNT, c: Math.floor(code / LOOK_COUNT ** 3) });
}

export const outsideLooksOf = (kind) => WAGON_OUTSIDE_LOOKS[validWagonKind(kind) ?? 'cart'];
export const outsideLookName = (kind, o) => LOOK_NAMES[outsideLooksOf(kind)[index(o)]];
export const insideLookName = (part, i) => LOOK_NAMES[CARAVAN_INSIDE_LOOKS[part]?.[index(i)] ?? 'green'];

export function paintedWagon(item, part, i) {
  if (!isWagonItem(item)) return null;
  const field = part === 'outside' ? 'o' : PART_FIELD[part];
  if (!field) return null;
  if (field !== 'o' && validWagonKind(item.wagonKind) !== 'caravan') return null;
  const look = { ...wagonLookOf(item), [field]: index(i) };
  const { wagonLook: _drop, ...rest } = item;
  return isBuiltLook(look) ? rest : { ...rest, wagonLook: look };
}

export function paintDrivenWagon(items, part, i) {
  const item = activeWagonItem(items);
  if (!item || !Array.isArray(items)) return { ok: false, text: LOOK_TEXT.noWagon };
  const kind = wagonKindOf(item);
  if (part !== 'outside' && kind !== 'caravan') return { ok: false, text: LOOK_TEXT.notCaravan };
  const painted = paintedWagon(item, part, i);
  if (!painted) return { ok: false, text: LOOK_TEXT.noWagon };
  items[items.indexOf(item)] = painted;
  const look = wagonLookOf(painted);
  return part === 'outside'
    ? { ok: true, text: LOOK_TEXT.painted(outsideLookName(kind, look.o)) }
    : { ok: true, text: LOOK_TEXT.paintedInside(LOOK_TEXT[part].toLowerCase(), insideLookName(part, look[PART_FIELD[part]])) };
}
export const caravanPaintRows = (look) => {
  const l = readWagonLook(look);
  return CARAVAN_INSIDE_PARTS.map((part) => ({ part, name: LOOK_TEXT[part], choices: CARAVAN_INSIDE_LOOKS[part].map((k) => LOOK_NAMES[k]), current: l[PART_FIELD[part]] }));
};
export const outsidePaintRow = (items) => {
  const item = activeWagonItem(items);
  if (!item) return null;
  return { choices: outsideLooksOf(wagonKindOf(item)).map((k) => LOOK_NAMES[k]), current: wagonLookOf(item).o };
};
