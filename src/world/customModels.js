const _models = new Map();

export function registerCustomModel(id, build, isOn = () => true, { climateFree = false, needs = [], buildSliced = null } = {}) {
  _models.set(Number(id), { build, isOn: typeof isOn === 'function' ? isOn : () => true, cached: null, climateFree: !!climateFree, needs: Object.freeze([...needs].map(Number)), buildSliced: typeof buildSliced === 'function' ? buildSliced : null });
}
export async function customModelBuilt(id, ctx = null, breathe = null) {
  const m = _models.get(Number(id));
  if (!m || !m.isOn()) return null;
  if (m.cached || !breathe || !m.buildSliced) return customModelFor(id, ctx);
  const built = await m.buildSliced(ctx, breathe);
  return (m.cached ??= built);
}
export const isClimateFreeModel = (id) => !!_models.get(Number(id))?.climateFree;
// Every climate-free model shares this empty table, so nothing may write to it.
export const NO_CLIMATE_REMAP = new Map();
export const customModelNeeds = (id) => _models.get(Number(id))?.needs ?? [];
export function unregisterCustomModel(id) { _models.delete(Number(id)); _aliases.delete(Number(id)); }

const _aliases = new Map();
export function registerModelAlias(id, { model, remap = {} }, isOn = () => true) {
  _aliases.set(Number(id), { model: Number(model), remap: Object.freeze({ ...remap }), isOn: typeof isOn === 'function' ? isOn : () => true });
}
export function customAliasFor(id) {
  const a = _aliases.get(Number(id));
  return a && a.isOn() ? a : null;
}
export function aliasSubMeshes(subMeshes, remap) {
  return subMeshes.map((sm) => {
    const to = remap?.[`${sm.textureArchive}_${sm.textureRecord}`];
    return to ? { ...sm, textureArchive: to[0], textureRecord: to[1] } : sm;
  });
}
export const classicModelIdOf = (id) => customAliasFor(id)?.model ?? Number(id);

export function customModelFor(id, ctx = null) {
  const m = _models.get(Number(id));
  if (!m || !m.isOn()) return null;
  return (m.cached ??= m.build(ctx));
}
export const hasCustomModel = (id) => !!_models.get(Number(id))?.isOn();

// Matches Daggerfall returning no model data: an id with no ARCH3D record and no registration draws nothing and has
// no doors.
export function emptyModel() {
  return { positions: new Float32Array(0), normals: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint32Array(0), subMeshes: [], doors: [] };
}
export function _resetCustomModels() { _models.clear(); _aliases.clear(); }
