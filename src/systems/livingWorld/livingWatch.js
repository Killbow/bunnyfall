// @ts-check
// Each turned guard carries `livingFrom`, the struck body's `living` record, never the pooled body, which is
// dressed again. When the guard ends, a watch resident whose guard leaves a corpse is `slain` by a player kill and
// `killed` otherwise; every other resident goes `back` to their day.

export const WATCH_WAIT = 600;

/** @typedef {{ guard: any, from: { id: string, res?: any, town?: any }, res: any, town: any, lent: boolean, waited: number }} Turned */

/**
 * @param {Turned[]} turned
 * @param {readonly any[]} guards
 * @param {{ resolve?: (id: string) => ({ town: any, res: any }|null), localOf?: (town: any, feet: number[]) => (number[]|null) }} [o]
 */
export function watchStep(turned, guards, { resolve = () => null, localOf = (_town, feet) => feet } = {}) {
  for (const g of guards) {
    if (!g?.livingFrom || g.livingFollowed) continue;
    // `livingFollowed` marks each guard once, so a corpse that stays in `guards` is never recorded as a second
    // deed.
    g.livingFollowed = true;
    const from = g.livingFrom;
    turned.push({ guard: g, from, res: from.res ?? null, town: from.town ?? null, lent: false, waited: 0 });
  }
  for (let i = turned.length - 1; i >= 0; i--) {
    const w = turned[i];
    if (!w.res || !w.town) { const got = resolve(w.from.id); if (got) { w.res = got.res; w.town = got.town; } }
    if (!w.lent && w.res && w.town) { w.town.lend(w.res); w.lent = true; }
    const g = w.guard;
    const ended = !!g.dead || !guards.includes(g);
    if (!ended) {
      if (!w.lent && ++w.waited > WATCH_WAIT) turned.splice(i, 1);
      continue;
    }
    turned.splice(i, 1);
    if (!w.lent) continue;
    if (g.dead && g.corpse && w.res.guard) {
      const person = { living: { id: w.res.id, res: w.res, town: w.town }, pos: localOf(w.town, g.ai?.feet ?? null) };
      if (g.killedBy === 'player') w.town.slain(person);
      else w.town.killed(person);
    } else w.town.back(w.res);
  }
}
