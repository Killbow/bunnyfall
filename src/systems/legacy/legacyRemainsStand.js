// @ts-check
// Each remains pile shares its `items` array with the legacy record and is seeded `unsaved`, so the record stays
// the only owner and an heirloom is never handed out twice.

export const REMAINS_STAND_OWNER = 'legacy';
export const REMAINS_MARK = Object.freeze({ colour: Object.freeze([0.93, 0.88, 0.7]), h: 7, pulse: false, reach: 60 });

/**
 * @param {object} o
 * @param {() => any} o.pool
 * @param {(place: any) => (number[]|null)} o.feetOf
 * @param {(place: any) => (string|null)} [o.pixelKeyOf]
 * @param {{ archive: number, record: number }} o.icon
 * @param {(row: any) => string} o.label
 */
export function createRemainsStand({ pool, feetOf, pixelKeyOf = () => null, icon, label }) {
  /** @type {Map<string, { pile: any, pool: any }>} */
  const stood = new Map();
  const unstand = (/** @type {string} */ id) => {
    const s = stood.get(id);
    if (!s) return;
    stood.delete(id);
    try { s.pool?.removePile?.(s.pile); } catch { }
  };
  return {
    /** @param {any[]} rows */
    frame(rows) {
      const p = pool();
      /** @type {Map<string, { r: any, feet: number[] }>} */
      const want = new Map();
      for (const r of rows ?? []) {
        if (!p || r?.state !== 'lying' || !Array.isArray(r.items) || !r.items.length) continue;
        const feet = feetOf(r.place);
        if (Array.isArray(feet) && feet.length === 3 && feet.every(Number.isFinite)) want.set(r.id, { r, feet });
      }
      for (const [id, s] of [...stood]) {
        const w = want.get(id);
        if (!w || s.pool !== p || s.pile.dead || s.pile.inactive || s.pile.items !== w.r.items) unstand(id);
      }
      for (const [id, { r, feet }] of want) {
        if (stood.has(id)) continue;
        const pile = p.seedPile(r.items, feet, icon, null, pixelKeyOf(r.place), { unsaved: true, owner: REMAINS_STAND_OWNER });
        if (!pile) continue;
        pile.label = label(r);
        pile.mark = REMAINS_MARK;
        // No silver find: the pile is seeded again at every visit, so a rolled find would pay out on each return.
        pile.noFind = true;
        stood.set(id, { pile, pool: p });
      }
      return stood.size;
    },
    clear() { for (const id of [...stood.keys()]) unstand(id); },
  };
}
