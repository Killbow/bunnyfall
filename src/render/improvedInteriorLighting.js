import { attachedDfmods, dfmodGeneration } from '../mods/dfmodTextures.js';
import { getPref } from '../ui/uiPrefs.js';
import { syncClassicShadowLane } from './classicShadowLane.js';
import { pageParam } from '../platform/pageQuery.js';

export const IIL_MOD = Object.freeze({
  guid: '55d7c31a-c571-45ea-bb72-fb5aa359e106',
  title: 'Improved Interior Lighting',
  version: '1.0.5',
  author: 'ShortBeard',
});

// The settings are the mod's shipped defaults, verbatim.
const WARM = Object.freeze([255, 147, 41]);
export const IIL_SETTINGS = Object.freeze({
  Interiors: Object.freeze({ Enabled: true, NpcShadows: true, InteriorLightsColor: WARM, InteriorLightsIntensity: 0.5, InteriorFlickeringLights: true, LightFlickerStrength: 0.5 }),
  Dungeons: Object.freeze({ Enabled: true, EnemyShadows: true, EnemyShadowsNoShadowEnemies: false, DungeonLightsColor: WARM, DungeonLightsIntensity: 0.5, FlickeringLights: true, LightFlickerStrength: 1.5 }),
  FirePlaces: Object.freeze({ EnabledInInteriors: true, FireplaceLightsColor: WARM, FireplaceIntensity: 1.0, FireplaceFlickeringLights: true, FireplaceFlickerStrength: 1.0 }),
  Torch: Object.freeze({ PlayerTorchChanged: true, PlayerTorchColor: WARM }),
});

export const IIL_FIREPLACE_MODELS = Object.freeze(new Set([41116, 41117]));
export const IIL_LIGHT_ARCHIVE = 210;
const LIGHT_RANGE = 10;
const FIREPLACE_RANGE = 15;
// Each flicker is [MaxReduction, MaxIncrease, RateDamping], as the mod's scripts pass them.
const FLICKER_ROOM = Object.freeze([1.5, 2.5, 0]);
const FLICKER_FIRE = Object.freeze([3, 4.5, 0.02]);

const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

export const isIilMod = (m) => !!m && (m.guid === IIL_MOD.guid || /^improved interior lighting$/i.test(String(m.title ?? '').trim()));
let _seenGen = -1, _seen = false;
const fromAttached = () => {
  const g = dfmodGeneration();
  if (g !== _seenGen) { _seenGen = g; _seen = attachedDfmods().some(isIilMod); }
  return _seen;
};
let _attached = fromAttached;
export function setIilAttachedSource(fn) { _attached = typeof fn === 'function' ? fn : fromAttached; }
export const iilOnLane = (search = globalThis.location?.search ?? '') => pageParam('iil', search) === 'shadows';
let _pref = (key) => getPref(key);
export function setIilPrefSource(fn) { _pref = typeof fn === 'function' ? fn : (key) => getPref(key); }
export const iilTier = () => {
  const v = _pref('moddedLighting');
  if (v === false || v === 'off') return 'off';
  return v === 'shadows' ? 'shadows' : 'on';
};
// The mod lights only the classic lane; with Enhanced Lighting on it runs only under the ?iil=shadows switch.
export const iilActive = (lightingLane, search) => {
  if (iilTier() === 'off' || !_attached()) return false;
  return !lightingLane || iilOnLane(search);
};

// Hosts call this every frame before iilActive, because the classic-look lane leaves renderer.lightingLane null.
export function iilSyncLane(renderer, inside) {
  const want = !!inside && iilTier() === 'shadows' && !!_attached();
  return syncClassicShadowLane(renderer, want);
}

export function stepFlicker(st, base, [maxReduction, maxIncrease, rate], strength, dt, random = Math.random) {
  st.wait -= dt;
  if (st.wait > 0) return st.intensity;
  st.wait = rate;
  const target = base - maxReduction + random() * (maxReduction + maxIncrease);
  const t = Math.min(1, Math.max(0, strength * dt));
  st.intensity = Math.max(0, st.intensity + (target - st.intensity) * t);
  return st.intensity;
}

// Hosts build the light list once per visit, so the list's identity keys the flicker state.
const _states = new WeakMap();
const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

function advance(key, build, section) {
  let s = _states.get(key);
  if (!s) {
    const lights = build();
    s = {
      at: now(),
      lights,
      ranges: lights.map((l) => l.range),
      st: lights.map((l) => ({ intensity: l.base, wait: 0 })),
      index: new Map(lights.map((l, i) => [l, i])),
    };
    _states.set(key, s);
  }
  const t = now();
  const dt = Math.min(0.25, Math.max(0, t - s.at));
  s.at = t;
  for (let i = 0; i < s.lights.length; i++) {
    const l = s.lights[i];
    if (l.flicker) stepFlicker(s.st[i], l.base, l.flicker, l.strength, dt);
    else s.st[i].intensity = l.base;
  }
  const colorOf = (l) => {
    const i = s.index.get(l);
    const k = i == null ? 0 : s.st[i].intensity;
    return [l.rgb[0] * k, l.rgb[1] * k, l.rgb[2] * k];
  };
  return { lights: s.lights, ranges: s.ranges, colorOf, section };
}

export function iilInteriorLights(roomLights, fireplaces = [], settings = IIL_SETTINGS) {
  const S = settings.Interiors, F = settings.FirePlaces;
  if (!S.Enabled) return null;
  return advance(roomLights, () => [
    ...roomLights.map((l) => ({
      x: l.x, y: l.y, z: l.z, range: LIGHT_RANGE, rgb: rgb(S.InteriorLightsColor), base: S.InteriorLightsIntensity,
      flicker: S.InteriorFlickeringLights ? FLICKER_ROOM : null, strength: S.LightFlickerStrength,
    })),
    ...(F.EnabledInInteriors ? fireplaces : []).map((f) => ({
      x: f.x, y: f.y, z: f.z, range: FIREPLACE_RANGE, rgb: rgb(F.FireplaceLightsColor), base: F.FireplaceIntensity,
      flicker: F.FireplaceFlickeringLights ? FLICKER_FIRE : null, strength: F.FireplaceFlickerStrength,
    })),
  ], 'Interiors');
}

export function iilDungeonLights(lightFlats, settings = IIL_SETTINGS) {
  const S = settings.Dungeons;
  if (!S.Enabled) return null;
  return advance(lightFlats, () => lightFlats.map((f) => ({
    x: f.x, y: f.y, z: f.z, range: LIGHT_RANGE, rgb: rgb(S.DungeonLightsColor), base: S.DungeonLightsIntensity,
    flicker: S.FlickeringLights ? FLICKER_ROOM : null, strength: S.LightFlickerStrength,
  })), 'Dungeons');
}

export function iilTorch(light, settings = IIL_SETTINGS) {
  if (!light || !settings.Torch.PlayerTorchChanged) return light;
  return { ...light, color: rgb(settings.Torch.PlayerTorchColor) };
}

export function _resetIilForTests() { _attached = fromAttached; _seenGen = -1; _pref = (key) => getPref(key); }
