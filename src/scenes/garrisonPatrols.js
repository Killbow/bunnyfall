// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): PATROLS IN A HELD TOWN - a garrison's soldiers on their set
// routes (net/garrisonLaw.js ROUTES), walking the town's own street grid in the watch's sprite, washed in their
// owner's colours. Every client in the town stands the same routes with the same number of soldiers (the account
// service's word, systems/garrisonBook.js); where each one is along it is this client's own.
//
// THE ROUTES, out of the town's layout - its battlefield's points (systems/siegeField.js: the Throne at the palace door,
// the Gate's banner inside the far gate, the Market, the Temple): the palace ring walks the Throne and the Market, the
// gate route the Gate and the Market, the temple route the Temple and the Market. A town with no palace has no field:
// every route there walks the back streets. The back streets are a walker's own wander, as the townsfolk's.
//
// A PATROL WALKER steers. It is a townsperson (characters/mobile/mobilePerson.js) whose next step is the free street
// cell nearest its route's next point - one in six taken at random, so it never wedges in a corner - and once there it
// turns for the next point. A walker that has made no headway in a long while is stood at its next point, out of sight.
//
// A module the world host wires (bible/01-Overview/Host-Split.md): it owns its walkers and their batches; the host hands
// the built towns and asks for the batches to draw each frame.
import { MobilePerson, GUARD_TEXTURE } from '../characters/mobile/mobilePerson.js';
import { ROUTE_KEYS, ROUTE_SHOWN_MAX } from '../net/garrisonLaw.js';
import { HERALDRY_COLOURS } from '../net/heraldryLaw.js';

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // mobilePerson.js's own order
const RANDOM_STEP = 1 / 6;
const STUCK_SEEKS = 80;
const OUT_OF_SIGHT_M = 40;

/** A colour key's wash on the watch's sprite: the colour lifted most of the way to white, so the sprite still reads. */
export function patrolTint(key) {
  const hex = HERALDRY_COLOURS.find((c) => c.key === key)?.hex;
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => 0.55 + 0.45 * (c / 255));
}

class PatrolWalker extends MobilePerson {
  /** @param {any} nav @param {any} opts @param {[number, number][]} points the route's points, location frame */
  constructor(nav, opts, points) {
    super(nav, opts);
    this.points = points;
    this.leg = 0;
    this.sinceHeadway = 0;
    this.best = Infinity;
  }
  _seek() {
    if (!this.points.length) { super._seek(); return; }
    this.seekCount++;
    if (this.gx === -1 || this.gy === -1) [this.gx, this.gy] = this.nav.worldToNav(this.pos[0], this.pos[2]);
    const [wx, wz] = this.points[this.leg % this.points.length];
    const [tx, ty] = this.nav.worldToNav(wx, wz);
    const dist = Math.abs(tx - this.gx) + Math.abs(ty - this.gy);
    if (dist <= 1) { this.leg++; this.best = Infinity; this.sinceHeadway = 0; return; }
    if (dist < this.best) { this.best = dist; this.sinceHeadway = 0; } else this.sinceHeadway++;
    const open = [0, 1, 2, 3].filter((d) => this._weight(d) > 0 && this._clear(d));
    if (!open.length) return;
    let d = open[Math.floor(this.rand() * open.length)];
    if (this.rand() >= RANDOM_STEP) {
      let bestD = Infinity;
      for (const k of open) { const nd = Math.abs(tx - (this.gx + DIRS[k][0])) + Math.abs(ty - (this.gy + DIRS[k][1])); if (nd < bestD) { bestD = nd; d = k; } }
    }
    this.dir = d;
    this._setTarget();
  }
}

/**
 * @param {{
 *   built: () => Iterable<any>,                         the built pixels (scenes/pixelBuild.js's records)
 *   garrisons: () => any[],                              every garrison (systems/garrisonBook.js `all`)
 *   townPixel: (mapId: number) => ({ px: number, py: number } | null),
 *   fieldOf: (mapId: number) => any,                     the town's battlefield (systems/siegeField.js), or null
 *   renderer: any, frameCount: (record: number, archive: number) => number,
 *   draw: (person: any, batch: any, out: any, p: any) => void,   the host's billboard dressing (frame, size, origin)
 * }} deps
 */
export function createGarrisonPatrols({ built, garrisons, townPixel, fieldOf, renderer, frameCount, draw }) {
  /** pixel record -> { sig, walkers: [{ person, batch }] } */
  const towns = new Map();
  /** @type {any[]} */
  const out = [];

  /** The points a route walks in a town, location frame - none for the back streets or a town with no field. */
  function routePoints(route, field, locOrigin) {
    if (!field || route === 'streets') return [];
    const at = (p) => (p ? [p[0] - locOrigin[0], p[1] - locOrigin[2]] : null);
    const market = at(field.banners?.[1]);
    const one = route === 'palace' ? at(field.throne) : route === 'gate' ? at(field.banners?.[0]) : at(field.banners?.[2]);
    return [one, market].filter(Boolean);
  }

  /** A walkable street cell near the town's middle, or near `near` (location frame). */
  function spawnCell(nav, near) {
    const [cx, cy] = near ? nav.worldToNav(near[0], near[1]) : [Math.floor(nav.width / 2), Math.floor(nav.height / 2)];
    for (let r = 0; r < 40; r++) {
      for (let i = 0; i < 12; i++) {
        const gx = cx + Math.round((Math.random() * 2 - 1) * r), gy = cy + Math.round((Math.random() * 2 - 1) * r);
        if (nav.weightAt(gx, gy) > 0 && !nav.occupied(gx, gy)) return [gx, gy];
      }
    }
    return null;
  }

  function clearTown(p) {
    const t = towns.get(p);
    if (!t) return;
    for (const w of t.walkers) { w.person.release(); renderer.destroyBatch(w.batch); }
    towns.delete(p);
  }

  /** Stand the right walkers in a built town for its garrison (or none). */
  function stand(p, g) {
    const sig = g ? `${g.owner}|${ROUTE_KEYS.map((k) => g.routes?.[k] ?? 0).join(',')}|${g.field}` : '';
    const had = towns.get(p);
    if (had && had.sig === sig) return had;
    clearTown(p);
    if (!g) return null;
    const nav = p.population?.nav;
    const borrow = p.population?.pool?.find?.((i) => i.person)?.person;
    if (!nav) return null;
    const field = fieldOf(g.mapId);
    const tint = patrolTint(g.field) ?? patrolTint(g.border);
    const walkers = [];
    for (const route of ROUTE_KEYS) {
      const n = Math.min(ROUTE_SHOWN_MAX, g.routes?.[route] ?? 0);
      const points = routePoints(route, field, p.locOrigin);
      for (let i = 0; i < n; i++) {
        const person = new PatrolWalker(nav, { archive: GUARD_TEXTURE, guard: true, frameCount, collider: borrow?.collider ?? null, groundY: borrow?.groundY ?? (() => 0) }, points);
        person.leg = i;   // spread them along the route
        const cell = spawnCell(nav, points[i % Math.max(1, points.length)] ?? null);
        if (!cell) continue;
        person.place(cell[0], cell[1]);
        const batch = renderer.createBillboardBatch(GUARD_TEXTURE, 0, { w: 1, h: 1 }, [[0, 0, 0]]);
        if (tint) batch.tint = tint;
        walkers.push({ person, batch });
      }
    }
    const t = { sig, walkers };
    towns.set(p, t);
    return t;
  }

  return {
    /**
     * A frame: each built town's patrols stood and walked; answers the batches to draw. `camLocal(p)` the camera in the
     * town's location frame.
     * @param {number} dt
     * @param {(p: any) => number[]} camLocal
     */
    frame(dt, camLocal) {
      out.length = 0;
      const all = garrisons() ?? [];
      const seen = new Set();
      for (const p of built()) {
        if (!p?.population) continue;
        const g = all.find((x) => { const tp = townPixel(x.mapId); return tp && tp.px === p.px && tp.py === p.py; }) ?? null;
        const t = stand(p, g);
        seen.add(p);
        if (!t) continue;
        const cam = camLocal(p);
        for (const w of t.walkers) {
          const person = w.person;
          // a walker with no headway in a long while stands at its next point, where nobody is watching
          if (person.sinceHeadway > STUCK_SEEKS && person.points.length && Math.hypot(person.pos[0] - cam[0], person.pos[2] - cam[2]) > OUT_OF_SIGHT_M) {
            const pt = person.points[person.leg % person.points.length];
            const cell = spawnCell(p.population.nav, pt);
            if (cell) { person.release(); person.place(cell[0], cell[1]); }
            person.sinceHeadway = 0; person.best = Infinity;
          }
          const o = person.update(dt, cam, false);
          if (draw(person, w.batch, o, p) !== false) out.push(w.batch);   // a sprite not yet loaded draws nothing
        }
      }
      for (const p of [...towns.keys()]) if (!seen.has(p)) clearTown(p);
      return out;
    },
    /** Every walker let go (the world closing). */
    clear() { for (const p of [...towns.keys()]) clearTown(p); },
  };
}
