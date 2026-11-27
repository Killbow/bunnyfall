import { townWayCells, gatePassage, carveNav, componentsOf, edgePieces, snapCell } from './townWalk.js';
import { worldCoordToMapPixel } from '../formats/mapsFile.js';
import { CITY_GATE_OPEN_MODEL_ID } from '../world/rmbLayout.js';

// Each journey grid holds a copy of the town grid plus its search scratch and piece labels, up to about 8 MB for
// the largest city.
export const JOURNEY_GRIDS_MAX = 4;

/** @param {{ built: Map<string, any>, state: any }} host */
export function createTownWalk(host) {
  const { built, state } = host;
  const grids = new Map();
  function townAt(n) {
    const px = worldCoordToMapPixel(n.x, n.z);
    const key = `${px.x},${px.y}`;
    const b = built.get(key);
    const nav = b?.population?.nav, o = b?.locOrigin;
    if (!nav || !o) return null;
    const t = state.pixelTranslation(px.x, px.y);
    const [sx, sz] = state.localFromWorld(n.x, n.z);
    const cell = nav.worldToNav(sx - o[0] - t[0], sz - o[2] - t[2]);
    return { key, b, nav, o, t, cell, inside: nav.inBounds(cell[0], cell[1]) };
  }
  function journeyGrid(town, allOpen = false) {
    const gates = (town.b.cityGates ?? []).map((g) => ({ open: allOpen || g.gate?.modelId === CITY_GATE_OPEN_MODEL_ID, local: g.local }));
    const sig = gates.map((g) => (g.open ? 1 : 0)).join('');
    const key = `${town.key}|${sig}`;
    const kept = grids.get(key);
    if (kept && kept.base === town.nav) return kept;
    const passages = gates.filter((g) => g.open && g.local).map((g) => gatePassage(town.nav, town.nav.worldToNav(g.local[12] - town.o[0], g.local[14] - town.o[2]))).filter(Boolean);
    const made = { base: town.nav, sig, nav: carveNav(town.nav, passages), shut: gates.some((g) => !g.open) };
    for (const [k, g] of grids) if (built.get(k.split('|')[0])?.population?.nav !== g.base) grids.delete(k);
    grids.delete(key);
    grids.set(key, made);
    if (grids.size > JOURNEY_GRIDS_MAX) grids.delete(grids.keys().next().value);
    return made;
  }
  function nativeOf(town, c) {
    const [lx, lz] = town.nav.navToWorld(c[0], c[1]);
    const w = state.worldCoords([lx + town.o[0] + town.t[0], 0, lz + town.o[2] + town.t[2]]);
    return { x: w.x, z: w.z };
  }
  return {
    gridsKept: () => grids.size,
    townKey(n) {
      const town = townAt(n);
      return town?.inside ? town.key : null;
    },
    townPace(n) {
      const town = townAt(n);
      if (!town?.inside) return null;
      const pieces = edgePieces(town.nav);
      if (!town.b.cityGates?.length || pieces.edge.size >= pieces.all) return town.key;
      const at = snapCell(town.nav, town.cell);
      // A walled city's grid extends past its walls, so a cell in a piece that reaches the grid edge is countryside
      // and gets no town pace.
      return at && pieces.edge.has(componentsOf(town.nav)[at[1] * town.nav.width + at[0]]) ? null : town.key;
    },
    townWay(from, to) {
      const town = townAt(from);
      if (!town?.inside) return null;
      const t = state.localFromWorld(to.x, to.z);
      const toCell = town.nav.worldToNav(t[0] - town.o[0] - town.t[0], t[1] - town.o[2] - town.t[2]);
      const grid = journeyGrid(town);
      const way = townWayCells(grid.nav, town.cell, toCell);
      // A way that stops short reports `shut` only when the same way with every gate open reaches the point.
      if (!way?.reached && grid.shut && townWayCells(journeyGrid(town, true).nav, town.cell, toCell)?.reached) return { pts: [], inside: !!way?.inside, shut: true };
      if (!way) return null;
      return { pts: way.cells.map((c) => nativeOf(town, c)), inside: way.inside, shut: false };
    },
  };
}
