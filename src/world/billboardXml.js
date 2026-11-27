// Mods register xml billboard scale tables here, and the last live registrant naming a record wins, as a
// later-loaded mod's file does in DFU.

const _registry = [];
let _gen = 0;

export function registerBillboardXml(vendor, table, isOn = () => true) {
  const i = _registry.findIndex((r) => r.vendor === vendor);
  const entry = { vendor, table, isOn };
  if (i >= 0) _registry[i] = entry; else _registry.push(entry);
  _gen++;
}
export function unregisterBillboardXml(vendor) {
  const i = _registry.findIndex((r) => r.vendor === vendor);
  if (i >= 0) { _registry.splice(i, 1); _gen++; }
}
// Sizes cached with the xml applied must be rebuilt when this generation changes; a registrant's switch is read
// live at every ask.
export const billboardXmlGeneration = () => _gen;

// Returns the table's own array, not a copy, so callers must not mutate it.
export function billboardXmlScaleOf(archive, record) {
  if (archive == null || record == null) return null;
  for (let i = _registry.length - 1; i >= 0; i--) {
    const r = _registry[i];
    const s = r.table?.[archive]?.[record];
    if (s && r.isOn()) return s;
  }
  return null;
}
export function billboardXmlScale(archive, record) {
  const s = billboardXmlScaleOf(archive, record);
  return s ? { x: s[0], y: s[1] } : null;
}

export function applyBillboardXml(archive, record, size) {
  const s = billboardXmlScale(archive, record);
  if (!s || !size) return size;
  return { w: size.w * s.x, h: size.h * s.y };
}
