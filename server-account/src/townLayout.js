// @ts-check
// A building key names a building in only one layout of its town. Every home or hall row in a town is
// written in the layout of its oldest home, or refused.
import { HOME_LAYOUT_MODS, homeLayoutOk, homeLayoutsMatch } from '../../src/net/homeLaw.js';

// The layout check is inside the write, so two first claims in two layouts at once seat only one.
export const LAYOUT_MATCH_SQL = HOME_LAYOUT_MODS.map(() => `(instr(COALESCE(t.layout, ''), ?) > 0) = ?`).join(' AND ');
export const layoutMatchBinds = (layout) => {
  const mods = new Set(typeof layout === 'string' && layout ? layout.split('+').map((p) => p.split('@')[0]) : []);
  return HOME_LAYOUT_MODS.flatMap((m) => [`${m}@`, mods.has(m) ? 1 : 0]);
};
export const TOWN_LAYOUT_SQL = 'COALESCE((SELECT t.layout FROM homes t WHERE t.map_id = ? ORDER BY t.bought_at, t.building_key LIMIT 1), CASE WHEN EXISTS (SELECT 1 FROM homes t WHERE t.map_id = ?) THEN NULL ELSE ? END)';

export async function townLayoutRefusal(db, mapId, layout) {
  const town = await db.prepare('SELECT layout FROM homes WHERE map_id = ? ORDER BY bought_at, building_key LIMIT 1').bind(mapId).first();
  return town && !homeLayoutsMatch(town.layout, layout) ? { error: 'home-layout', layout: homeLayoutOk(town.layout) ? town.layout ?? null : null } : null;
}
