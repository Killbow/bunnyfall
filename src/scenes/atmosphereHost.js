// ATMO1 (2026-11-13, Killbunny) - THE AIR'S SMALL LIFE IN A HOST: the runtime scenes/world.js builds beside Windfall's.
// A host calls `frame` once an outdoor frame with what the world already knows (the player's place, the ground, the
// sun, WIND3's wind, the weather) and `draw` once the opaque world stands, next to Windfall's leaves. Everything it
// draws is a picture: no collision data is read or written, nothing goes over the network, nothing is saved.
//
// THE DOORS: it is OFF unless the page carries ?atmo=on (it has not been tried in the real game yet). ?atmoSeason=spring|summer|autumn|winter pins the calendar's season
// for it (a probe's door - the season the leaves, petals and fireflies follow is otherwise the world clock's).

import { Atmosphere } from '../render/atmosphere.js';
import { dateFromClassicMinutes, seasonValue, SEASONS } from '../systems/gameDate.js';
import { dayFraction } from '../world/worldClock.js';

const SEASON_NAME = { [SEASONS.Spring]: 'spring', [SEASONS.Summer]: 'summer', [SEASONS.Fall]: 'autumn', [SEASONS.Winter]: 'winter' };
const RAINY = /rain|thunder|storm|fog|snow/i;

/** The unit vector toward the sun, UNCLAMPED (worldClock's sunDirection holds the sun on the horizon all night, and the
 *  fireflies and the moon-lit hours need to know it is below it): it dips under the horizon after dusk and comes back by dawn. */
const sunUnclamped = (minute) => { const a = Math.PI * Math.max(-0.6, Math.min(1.6, dayFraction(minute))); return [Math.cos(a), Math.sin(a), 0]; };

const params = () => (typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams());

/**
 * `gl` the renderer's context, `enhanced` the host's lane (the enhanced outdoors' - off it, nothing is made),
 * `heightAt(x, z)` the land's height (NaN where there is none - the eye's own height stands in).
 */
export function createAtmosphereHost({ gl = null, enhanced = false, heightAt = null, random = Math.random } = {}) {
  const q = params();
  const on = enhanced && !!gl && q.get('atmo') === 'on';   // OFF BY DEFAULT until it has been seen running in the real game
  const pin = q.get('atmoSeason');
  const sim = on ? new Atmosphere(gl, { random }) : null;
  const right = new Float32Array(3), up = new Float32Array(3);
  const fx = { shafts: true, fireflies: true, butterflies: true, petals: true, birds: true };
  let eyeY = 0, broken = false;
  const groundY = (x, z) => { const h = heightAt ? heightAt(x, z) : NaN; return Number.isFinite(h) ? h : eyeY - 1.7; };

  const api = {
    sim, fx,
    /**
     * `f` { dt (game seconds), outside, weather (the port's word), minutes (the world clock's classic minutes), dayMinute
     * (the minute of the day, the sun's), windV [x, z] and gust (windDrive's), feet [x, y, z], density (1 by default) }.
     */
    frame(f) {
      if (!sim || broken) return;
      try {
        if (!f.outside) { sim.live.petals = sim.live.fireflies = sim.live.butterflies = sim.live.shafts = sim.live.birds = 0; sim.f = null; return; }
        eyeY = f.feet[1];
        const season = pin ?? SEASON_NAME[seasonValue(dateFromClassicMinutes(Math.floor(f.minutes ?? 0)))] ?? 'summer';
        sim.step({
          eye: f.feet, groundY, sun: sunUnclamped(f.dayMinute ?? f.minutes ?? 0), windV: f.windV ?? [0, 0], gust: f.gust ?? 0, season,
          rainy: RAINY.test(String(f.weather ?? '')), density: f.density ?? 1, fx,
        }, f.dt);
      } catch (e) {
        broken = true;
        console.warn('[atmo] a frame threw - the air goes still here:', e?.stack ?? e);
      }
    },
    /** Drawn with the opaque world (view's own right and up - billboards in the camera's plane). Answers whether it drew. */
    draw(proj, view, light) {
      if (!sim || broken || !sim.f) return false;
      right[0] = view[0]; right[1] = view[4]; right[2] = view[8];
      up[0] = view[1]; up[1] = view[5]; up[2] = view[9];
      try { return sim.draw(proj, view, right, up, light); } catch (e) { broken = true; console.warn('[atmo] a draw threw - the air goes still here:', e?.stack ?? e); return false; }
    },
    offsetOrigin(o) { sim?.offsetOrigin(o); },
    get live() { return sim?.live ?? null; },
    dispose() { sim?.dispose(); },
  };
  if (typeof window !== 'undefined' && q.has('atmoDebug')) window.__atmo = api;   // a probe's handle (the harness reads the live counts and the toggles)
  return api;
}
