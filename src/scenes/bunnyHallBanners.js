// @ts-check
// BUNNY-GUILDS (2026-10-30, the owner: "the new guilds looking like houses"): A HALL'S BANNERS. Bunnyfall's halls are
// converted houses (systems/guild/bunnyGuilds.js), and from the street they were houses. Each now hangs its guild's arms
// (bunnyGuilds.js bunnyHallArms), two banners beside its door, on the halls' banner pass - as a Company's own hall does
// (scenes/hallBanners.js hallBannerAnchors, its measure and its keys) and a chapter's patron's (scenes/chapterBanners.js).
// A hall whose door the build did not measure hangs none. Online alone, as the halls are.
import { BANNERS_MAX } from '../render/bannerPass.js';
import { hallBannerAnchors, bannerKeyOf, BANNER_REFRESH_MS } from './hallBanners.js';
import { heraldryOf } from '../net/heraldryLaw.js';
import { isBunnyHall, bunnyHallArms, bunnyGuildsOn } from '../systems/guild/bunnyGuilds.js';
import { buildingSummaries } from '../world/buildingSummaries.js';

/** A town's halls, building key -> its guild's faction (the pixel builder's `bunnyHalls`), or an empty map offline. */
export function bunnyHallsOf(/** @type {any} */ dfLocation, /** @type {any[] | null} */ locBlocks) {
  if (!dfLocation || !locBlocks || !bunnyGuildsOn()) return new Map();
  return new Map(buildingSummaries(dfLocation.exterior?.buildings ?? [], locBlocks, { locationIndex: dfLocation.locationIndex ?? 0, locationName: dfLocation.name })
    .filter((b) => isBunnyHall(b)).map((b) => [b.buildingKey, b.factionId]));
}

/**
 * `deps`: `built()` the world's built pixels (each `{ px, py, homeFrames, bunnyHalls }`), `translation(px, py)` a pixel's
 * place in the scene now, `eye()` where the view stands, `now()` ms. `list()` answers this frame's banners.
 * @param {{ built: () => any, translation: (px: number, py: number) => number[], eye?: () => number[] | null, now?: () => number }} deps
 */
export function createBunnyHallBanners({ built, translation, eye = () => null, now = () => Date.now() }) {
  /** @type {any[]} */
  let held = [];
  /** @type {any[]} */
  let outs = [];
  let at = -Infinity;
  function read() {
    const out = [];
    for (const [, p] of built?.() ?? []) {
      if (!p?.bunnyHalls?.size || !p.homeFrames) continue;
      for (const [bk, faction] of p.bunnyHalls) {
        const h = heraldryOf(bunnyHallArms(faction));
        if (!h) continue;
        const anchors = hallBannerAnchors(p.homeFrames.get(bk));
        if (!anchors) continue;
        anchors.forEach((a, i) => out.push({ px: p.px, py: p.py, a, key: bannerKeyOf(h), heraldry: h, phase: (bk % 11) * 0.9 + i * 1.7 }));
      }
    }
    held = out;
    outs = held.map((b) => ({ key: b.key, heraldry: b.heraldry, phase: b.phase, top: [0, 0, 0], right: b.a.right, out: b.a.out }));
  }
  return {
    list() {
      if (now() - at >= BANNER_REFRESH_MS) { read(); at = now(); }
      for (let i = 0; i < held.length; i++) {
        const b = held[i], t = translation(b.px, b.py), top = outs[i].top;
        top[0] = t[0] + b.a.top[0]; top[1] = t[1] + b.a.top[1]; top[2] = t[2] + b.a.top[2];
      }
      if (outs.length <= BANNERS_MAX) return outs;
      const e = eye();
      if (!e) return outs.slice(0, BANNERS_MAX);
      return [...outs].sort((x, y) => Math.hypot(x.top[0] - e[0], x.top[2] - e[2]) - Math.hypot(y.top[0] - e[0], y.top[2] - e[2])).slice(0, BANNERS_MAX);
    },
  };
}
