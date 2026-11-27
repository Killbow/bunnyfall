// @ts-check
import { HERALDRY_COLOURS, HERALDRY_DEVICES, HERALDRY_DIVISIONS, heraldryOf, heraldryInk } from '../../net/heraldryLaw.js';

// The order of FLAG_SHAPES is part of the wire code.
export const FLAG_SHAPES = Object.freeze(['flag', 'swallowtail', 'pennant', 'burgee']);
const COLOURS = /** @type {string[]} */ (HERALDRY_COLOURS.map((c) => c.key));
const isColour = (k) => typeof k === 'string' && COLOURS.includes(k);

export const FLAG_DEFAULT = Object.freeze({ shape: 'flag', field: 'azure', division: 'plain', field2: null, border: 'gold', device: 'anchor', charge: 'gold', guild: false });

export function shipFlagOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = /** @type {any} */ (raw);
  const shape = r.shape ?? 'flag';
  if (!FLAG_SHAPES.includes(shape) || !isColour(r.field)) return null;
  const division = r.division ?? 'plain';
  if (!HERALDRY_DIVISIONS.includes(division)) return null;
  const parted = division !== 'plain';
  if (parted ? !isColour(r.field2) || r.field2 === r.field : r.field2 != null) return null;
  const border = r.border ?? null;
  if (border != null && (!isColour(border) || border === r.field)) return null;
  const device = r.device ?? null;
  if (device != null && !HERALDRY_DEVICES.includes(device)) return null;
  let charge = device ? r.charge ?? null : null;
  if (!device && r.charge != null) return null;
  if (device && charge == null) charge = [border, 'argent', 'sable', 'gold'].find((c) => c && c !== r.field && c !== r.field2) ?? null;
  if (charge != null && (!isColour(charge) || charge === r.field || (parted && charge === r.field2))) return null;
  if (r.guild != null && typeof r.guild !== 'boolean') return null;
  return Object.freeze({ shape, field: r.field, division, field2: parted ? r.field2 : null, border, device, charge, guild: !!r.guild });
}

export function fitFlag(raw) {
  const d = { ...FLAG_DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
  const shape = FLAG_SHAPES.includes(d.shape) ? d.shape : 'flag';
  const field = isColour(d.field) ? d.field : FLAG_DEFAULT.field;
  const division = HERALDRY_DIVISIONS.includes(d.division) ? d.division : 'plain';
  const field2 = division === 'plain' ? null : isColour(d.field2) && d.field2 !== field ? d.field2 : ['argent', 'sable', 'gold', 'azure'].find((c) => c !== field);
  const border = isColour(d.border) && d.border !== field ? d.border : null;
  const device = HERALDRY_DEVICES.includes(d.device) ? d.device : null;
  const ok = (c) => isColour(c) && c !== field && c !== field2;
  const charge = device ? (ok(d.charge) ? d.charge : [border, 'argent', 'sable', 'gold'].find(ok)) : null;
  return /** @type {any} */ (shipFlagOf({ shape, field, division, field2, border, device, charge, guild: d.guild === true }));
}

export function flownFlag(flag, arms = null) {
  const f = shipFlagOf(flag);
  if (!f) return null;
  const h = f.guild ? heraldryOf(arms) : null;
  if (!h) return f;
  return Object.freeze({ shape: f.shape, field: h.field, division: h.division ?? 'plain', field2: h.field2 ?? null, border: h.border, device: h.device, charge: heraldryInk(h), guild: true });
}

export function flagKey(flag) {
  const f = shipFlagOf(flag);
  return f ? [f.shape, f.field, f.division, f.field2 ?? '', f.border ?? '', f.device ?? '', f.charge ?? ''].join('|') : '';
}

// A flag travels as seven list indices (-1 for none), so each list order is a wire contract.
export function flagCode(flag) {
  const f = shipFlagOf(flag);
  if (!f) return 0;
  const at = (list, v) => (v == null ? -1 : list.indexOf(v));
  return [FLAG_SHAPES.indexOf(f.shape), COLOURS.indexOf(f.field), HERALDRY_DIVISIONS.indexOf(f.division), at(COLOURS, f.field2),
    at(COLOURS, f.border), at(HERALDRY_DEVICES, f.device), at(COLOURS, f.charge)];
}
export function flagOfCode(code) {
  if (!Array.isArray(code) || code.length !== 7 || !code.every((n) => Number.isInteger(n) && n >= -1 && n < 64)) return null;
  const pick = (list, i) => (i === -1 ? null : list[i] ?? undefined);
  const [shape, field, division, field2, border, device, charge] = [pick(FLAG_SHAPES, code[0]), pick(COLOURS, code[1]), pick(HERALDRY_DIVISIONS, code[2]),
    pick(COLOURS, code[3]), pick(COLOURS, code[4]), pick(HERALDRY_DEVICES, code[5]), pick(COLOURS, code[6])];
  if ([shape, field, division, field2, border, device, charge].includes(undefined) || shape == null || field == null || division == null) return null;
  if (device == null && charge != null) return null;
  if (device != null && charge == null) return null;
  return shipFlagOf({ shape, field, division, field2, border, device, charge });
}

// Indexed by hull in HULL_NAMES order; the Rowboat has no FlagObject, so it flies none.
export const FLAG_SIZES = Object.freeze([null, Object.freeze([1.2, 0.8]), Object.freeze([2.4, 1.6]), Object.freeze([2.7, 1.8]), Object.freeze([3, 2])]);
export const flagSizeOf = (hull) => FLAG_SIZES[hull] ?? null;
