// @ts-check
import { lookAt, perspective, mirrorProjectionX } from '../../world/mat4.js';
import { panelPicture, canvasBoxUnder } from '../../homes/panelPicture.js';

export const SHIP_PORTRAIT_W = 480;
export const SHIP_PORTRAIT_H = 240;
export const SHIP_PORTRAITS_A_FRAME = 1;
export const SHIP_PORTRAIT_WAIT_MS = 30_000;
export const SHIP_PORTRAIT_TURN = 1.15;
export const SHIP_PORTRAIT_LOOK_DOWN = 0.22;
const FOV = 30 * (Math.PI / 180);

export function shipPortraitCamera(box, aspect = SHIP_PORTRAIT_W / SHIP_PORTRAIT_H) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 || 1;
  const dist = rad / Math.sin(FOV / 2);
  const flat = dist * Math.cos(SHIP_PORTRAIT_LOOK_DOWN);
  const eye = [c[0] + flat * Math.sin(SHIP_PORTRAIT_TURN), c[1] + dist * Math.sin(SHIP_PORTRAIT_LOOK_DOWN), c[2] - flat * Math.cos(SHIP_PORTRAIT_TURN)];
  return {
    proj: mirrorProjectionX(perspective(FOV, aspect, Math.max(0.05, dist - rad * 1.5), dist + rad * 1.5)),
    view: lookAt(eye, c, [0, 1, 0]),
  };
}

/**
 * @param {{ renderer: any, canvas: any, doc: any, portrait: (hull: number) => ({ parts: Array<[any, Float32Array]>, box: number[] } | null), now?: () => number }} deps
 */
export function createShipPortraits(deps) {
  const now = () => deps.now?.() ?? Date.now();
  /** @type {Map<number, Promise<string|null>>} */
  const made = new Map();
  /** @type {Array<{ hull: number, where: () => any, asked: number, resolve: (url: string|null|PromiseLike<string|null>) => void }>} */
  const asks = [];
  /**
   * @param {number} hull
   * @param {() => any} where
   */
  function picture(hull, where) {
    if (!deps.renderer?.panelFrame || !deps.canvas || !deps.doc) return null;
    let p = made.get(hull);
    for (const a of asks) if (a.hull === hull) a.where = where;
    if (!p) {
      p = new Promise((resolve) => { asks.push({ hull, where, asked: now(), resolve }); });
      p.then((url) => { if (!url) made.delete(hull); });
      made.set(hull, p);
    }
    return p;
  }
  function draw() {
    let drawn = 0;
    for (let i = 0; i < asks.length && drawn < SHIP_PORTRAITS_A_FRAME;) {
      const ask = asks[i];
      if (now() - ask.asked > SHIP_PORTRAIT_WAIT_MS) { asks.splice(i, 1); ask.resolve(null); continue; }
      const rect = canvasBoxUnder(deps.canvas, ask.where?.() ?? null, SHIP_PORTRAIT_W, SHIP_PORTRAIT_H);
      const ship = rect ? deps.portrait(ask.hull) : null;
      if (!ship) { i++; continue; }
      asks.splice(i, 1);
      drawn++;
      const cam = shipPortraitCamera(ship.box, rect.w / rect.h);
      ask.resolve(panelPicture({
        renderer: deps.renderer, canvas: deps.canvas, doc: deps.doc, rect, proj: cam.proj, view: cam.view,
        body: () => { for (const [gpu, m] of ship.parts) deps.renderer.drawMesh(gpu, m, null); },
      }));
    }
    return drawn;
  }
  return { picture, draw, pending: () => asks.length };
}
