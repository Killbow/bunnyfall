import { EQUIP_SLOTS } from '../characters/paperdoll.js';
import { equipTableOf } from '../characters/equip.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { rriNativeMaterialValue } from '../mods/rriItems.js';
import { modSettingsOf } from '../mods/modSettings.js';
import { audio as defaultAudio } from './audio.js';
import { FOOTSTEP } from './footsteps.js';
import { multiply, trs } from '../world/mat4.js';
import { heardWeather, heardRainGain } from '../weather/weatherSim.js';
import { INDOOR_RAIN_GAIN, AMBIENT_RAIN_LOOP } from './ambientEffects.js';
import { immersiveFootsteps } from './immersiveFootsteps.js';
import { isSnowFreeClimate } from '../world/weather.js';
import { stringHash, NetRandom as SystemRandom } from '../formats/netRuntime.js';
import { perlinNoise } from '../world/perlin.js';
import { setRemoveHealthListener } from '../ui/damageFlash.js';
import { playerEntity } from '../characters/playerEntity.js';

export const BETTER_AMBIENCE_VENDOR = 'better-ambience';
export const BETTER_AMBIENCE_MOD = Object.freeze({
  title: 'Better Ambience', version: '0.1.4', author: 'Joshua Steinhauer',
  guid: 'd5655077-ba38-4dbc-a41f-2b358cb1d680', dfunity: '0.13',
  nexusFile: '0.1.5',
});

export const BA_SETTING_KEYS = Object.freeze([
  'Enabled',
  'Better Footsteps.enable', 'Better Footsteps.armorVolume', 'Better Footsteps.footstepVolume',
  'Dungeon Reverb.level',
  'Camera Shake.shakeAmountAdd', 'Camera Shake.shakeAmountMultiplier', 'Camera Shake.maxShake', 'Camera Shake.roughness', 'Camera Shake.fadeInTime', 'Camera Shake.fadeOutTime',
  'Dungeon Fog.enableFog', 'Dungeon Fog.maxFogDistance', 'Dungeon Fog.minFogDistance', 'Dungeon Fog.maxFogStart', 'Dungeon Fog.minFogStart',
  'Dungeon Lighting.enableFogAmbientEffect', 'Dungeon Lighting.dungeonDarkness', 'Dungeon Lighting.fogAmbientEffect',
  'Better Rain.enableBetterRain', 'Better Rain.enableBetterSnow',
]);

export function readBetterAmbienceSettings(read = () => modSettingsOf(BETTER_AMBIENCE_VENDOR)) {
  let s;
  try { s = read() ?? {}; } catch { s = {}; }
  const g = (k, d) => (s[k] === undefined ? d : s[k]);
  return {
    Enabled: s.Enabled !== false,
    // Better Footsteps ships off, unlike the mod, because Immersive Footsteps owns the stride and warns on overlap.
    footstepsEnable: g('Better Footsteps.enable', false), armorVolume: g('Better Footsteps.armorVolume', 1), footstepVolume: g('Better Footsteps.footstepVolume', 1),
    reverbLevel: g('Dungeon Reverb.level', 1),
    shakeAmountAdd: g('Camera Shake.shakeAmountAdd', 0), shakeAmountMultiplier: g('Camera Shake.shakeAmountMultiplier', 10), maxShake: g('Camera Shake.maxShake', 10),
    roughness: g('Camera Shake.roughness', 10), fadeInTime: g('Camera Shake.fadeInTime', 0.3), fadeOutTime: g('Camera Shake.fadeOutTime', 0.5),
    enableFog: g('Dungeon Fog.enableFog', true), maxFogDistance: g('Dungeon Fog.maxFogDistance', 100), minFogDistance: g('Dungeon Fog.minFogDistance', 80),
    maxFogStart: g('Dungeon Fog.maxFogStart', 10), minFogStart: g('Dungeon Fog.minFogStart', 0),
    enableAmbientLighting: g('Dungeon Lighting.enableFogAmbientEffect', true), dungeonDarkness: g('Dungeon Lighting.dungeonDarkness', 1), ambientLerp: g('Dungeon Lighting.fogAmbientEffect', 0.2),
    enableBetterRain: g('Better Rain.enableBetterRain', true), enableBetterSnow: g('Better Rain.enableBetterSnow', true),
  };
}
const sameSettings = (a, b) => a && b && Object.keys(a).every((k) => a[k] === b[k]);

export const CLIP_LISTS = Object.freeze({
  FootstepSoundBuilding: Object.freeze({ stem: 'sfx_footstep_wood', count: 4, pitch: [0.8, 1.2] }),
  FootstepSoundDungeon: Object.freeze({ stem: 'sfx_footstep_stone', count: 4, pitch: [0.8, 1.2] }),
  FootstepsArmor: Object.freeze({ stem: 'sfx_footstep_armor_light', count: 11, pitch: [1, 1.2] }),
  FootstepSoundOutside: Object.freeze({ stem: 'sfx_footstep_crunchy-grass', count: 4, pitch: [0.8, 1.2] }),
  FootstepSoundShallow: Object.freeze({ stem: 'sfx_footstep_water', count: 6, pitch: [0.8, 1.2] }),
});
export const CLASSIC_LISTS = Object.freeze({
  FootstepSoundSubmerged: Object.freeze({ clips: [FOOTSTEP.Submerged], pitch: [0.8, 1.2] }),
  FootstepSoundSnow: Object.freeze({ clips: [FOOTSTEP.Snow1, FOOTSTEP.Snow2], pitch: [0.8, 1.2] }),
});
export const LIST_VOLUME = Object.freeze({
  FootstepsArmor: ['armorVolume', 0.4], FootstepSoundDungeon: ['footstepVolume', 0.3], FootstepSoundBuilding: ['footstepVolume', 0.4],
  FootstepSoundShallow: ['footstepVolume', 0.4], FootstepSoundOutside: ['footstepVolume', 0.15], FootstepSoundSubmerged: ['footstepVolume', 1], FootstepSoundSnow: ['footstepVolume', 1],
});
export const AMBIENT_RAIN_CLIP = 'AmbientRaining';
export const AMBIENT_RAIN_LOWPASS_HZ = 4236;
export const baClipName = (stem, i) => `${stem}_${String(i).padStart(3, '0')}`;
export function baClipNames() {
  const out = [];
  for (const l of Object.values(CLIP_LISTS)) for (let i = 0; i < l.count; i++) out.push(baClipName(l.stem, i));
  out.push(AMBIENT_RAIN_CLIP);
  return out;
}
// The mod asks for six water clips and ships five; the missing one is skipped, as in the mod.
export const MISSING_CLIPS = Object.freeze(['sfx_footstep_water_001']);
export const baClipPath = (name) => `vendor/better-ambience/Sound/${name}.wav`;
const IN_BROWSER = typeof window !== 'undefined';
const URLS = IN_BROWSER
  ? import.meta.glob('../../vendor/better-ambience/Sound/*.wav', { eager: true, query: '?url', import: 'default' })
  : {};
export const baClipUrl = (name) => URLS[`../../${baClipPath(name)}`] ?? null;
export const baSoundKey = (name) => `ba:${name}`;
async function defaultFetchClip(name) {
  const url = baClipUrl(name);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

// The mod nulls the first stone and outdoor clips twice each, so the classic stride keeps the second of each.
export const CLASSIC_CLIPS_KEPT = Object.freeze(new Set([FOOTSTEP.Stone2, FOOTSTEP.Outside2]));

// As UnityEngine.Random.Range: the int form excludes max.
const rangeInt = (random, min, max) => min + Math.floor(random() * (max - min));
const rangeFloat = (random, min, max) => min + random() * (max - min);

export class SoundList {
  constructor() { this.soundClips = []; this.audioClips = []; this.pitchMin = 1; this.pitchMax = 1; this.volume = 1; }
  setVolume(v) { this.volume = v; }
  setPitchRange(min, max) { this.pitchMin = min; this.pitchMax = max; }
  playRandomClip(audio, volume, random) {
    const pitch = rangeFloat(random, this.pitchMin, this.pitchMax);
    const clip = this.getRandomClip(random);
    if (clip == null) return null;
    audio.playOneShot(clip, this.volume * volume, pitch);
    return { clip, pitch, volume: this.volume * volume };
  }
  getRandomClip(random) {
    const max = this.soundClips.length + this.audioClips.length;
    if (max === 0) return null;
    const rand = rangeInt(random, 0, max);
    if (rand < this.soundClips.length) return this.soundClips[rand];
    // The mod indexes its own clips by the unshifted roll; no list mixes the two kinds, so it never misses.
    return this.audioClips[rand] ?? null;
  }
  addAudioClip(c) { this.audioClips.push(c); }
  addAudioClips(cs) { this.audioClips.push(...cs); }
  addSoundClip(c) { this.soundClips.push(c); }
}

export const BA_WALK_STEP_INTERVAL = 2.5;
export const BA_RUN_STEP_INTERVAL = 2.5;
export const BA_FOOTSTEP_VOLUME_SCALE = 0.7;
// The mod enters shallow water at 0.55, not the classic footsteps' 0.57.
export const SHALLOW_ENTER = 0.55;
export const SHALLOW_LEAVE = 0.95;

export function hasArmor(entity) {
  let slots;
  try { slots = entity ? equipTableOf(entity) : null; } catch { slots = null; }
  if (!slots) return false;
  const chest = slots[EQUIP_SLOTS.ChestArmor], legs = slots[EQUIP_SLOTS.LegsArmor];
  if (chest && rriNativeMaterialValue(chest) !== ARMOR_MATERIAL.Leather) return true;
  if (legs && rriNativeMaterialValue(legs) !== ARMOR_MATERIAL.Leather) return true;
  return false;
}

export function createBetterFootsteps({ audio = defaultAudio, random = Math.random, snowFree = () => false } = {}) {
  const lists = {
    FootstepSoundDungeon: new SoundList(), FootstepSoundOutside: new SoundList(), FootstepSoundSnow: new SoundList(),
    FootstepSoundBuilding: new SoundList(), FootstepSoundShallow: new SoundList(), FootstepSoundSubmerged: new SoundList(), FootstepsArmor: new SoundList(),
  };
  let lastPosition = null;
  let lostGrounding = false;
  let distance = 0;
  let ignoreLostGrounding = true;
  let currentFootstepSoundList = lists.FootstepSoundDungeon;
  let currentSeason = 0, currentClimateIndex = 0, isInside = false, isInOutsideWater = false, isInOutsidePath = false, isOnStaticGeometry = false;
  const played = [];
  const nameOf = (l) => Object.keys(lists).find((k) => lists[k] === l) ?? null;

  function applyFootsteps(present) {
    for (const [k, l] of Object.entries(CLIP_LISTS)) {
      const clips = [];
      for (let i = 0; i < l.count; i++) { const n = baClipName(l.stem, i); if (present.has(n)) clips.push(baSoundKey(n)); }
      lists[k].addAudioClips(clips);
      lists[k].setPitchRange(l.pitch[0], l.pitch[1]);
    }
    for (const [k, l] of Object.entries(CLASSIC_LISTS)) { for (const c of l.clips) lists[k].addSoundClip(c); lists[k].setPitchRange(l.pitch[0], l.pitch[1]); }
  }
  function loadSettings(s) {
    for (const [k, [key, base]] of Object.entries(LIST_VOLUME)) lists[k].setVolume(base * s[key]);
  }
  function playFootstep(volume, entity) {
    if (!currentFootstepSoundList) return;
    const p = currentFootstepSoundList.playRandomClip(audio, volume, random);
    if (p) played.push({ list: nameOf(currentFootstepSoundList), ...p });
    if (currentFootstepSoundList !== lists.FootstepSoundSubmerged && hasArmor(entity)) {
      const a = lists.FootstepsArmor.playRandomClip(audio, volume, random);
      if (a) played.push({ list: 'FootstepsArmor', ...a });
    }
    if (played.length > 12) played.splice(0, played.length - 12);
  }
  // The mod's horizontal position zeroes y; Immersive Footsteps keeps it.
  const horizontal = (pos) => [pos[0], 0, pos[2]];

  function update(m) {
    if (m.loadInProgress) { ignoreLostGrounding = true; return; }
    if (lastPosition === null) lastPosition = horizontal(m.pos);
    const playerSeason = m.winter ? 1 : 0;
    const climateIndex = m.climateIndex ?? 0;
    const inside = !!m.inside;
    const inBuilding = !!m.inBuilding;
    const onExteriorWater = !!m.onExteriorWater;
    const pnExteriorPath = !!m.onExteriorPath;
    const onStaticGeometry = !!m.onStaticGeometry;
    if (playerSeason !== currentSeason || climateIndex !== currentClimateIndex || isInside !== inside || onExteriorWater !== isInOutsideWater || pnExteriorPath !== isInOutsidePath || onStaticGeometry !== isOnStaticGeometry) {
      currentSeason = playerSeason; currentClimateIndex = climateIndex; isInside = inside; isInOutsideWater = onExteriorWater; isInOutsidePath = pnExteriorPath; isOnStaticGeometry = onStaticGeometry;
      if (!isInside && !onStaticGeometry) {
        if (m.winter && !snowFree(currentClimateIndex)) currentFootstepSoundList = lists.FootstepSoundSnow;
        else currentFootstepSoundList = lists.FootstepSoundOutside;
      } else if (inBuilding) currentFootstepSoundList = lists.FootstepSoundBuilding;
      else currentFootstepSoundList = lists.FootstepSoundDungeon;
    }
    if (onExteriorWater) currentFootstepSoundList = lists.FootstepSoundSubmerged;
    if (pnExteriorPath) currentFootstepSoundList = lists.FootstepSoundDungeon;
    if (m.inDungeon && m.waterSurfaceY != null) {
      if (currentFootstepSoundList !== lists.FootstepSoundSubmerged && m.swimming) currentFootstepSoundList = lists.FootstepSoundSubmerged;
      else if (currentFootstepSoundList !== lists.FootstepSoundShallow && !m.swimming && (m.centreY - SHALLOW_ENTER) < m.waterSurfaceY) currentFootstepSoundList = lists.FootstepSoundShallow;
    }
    if (!onExteriorWater
      && (currentFootstepSoundList === lists.FootstepSoundSubmerged || currentFootstepSoundList === lists.FootstepSoundShallow)
      && (m.waterSurfaceY == null || (m.centreY - SHALLOW_LEAVE) >= m.waterSurfaceY)) {
      currentFootstepSoundList = lists.FootstepSoundDungeon;
    }
    // The mod's condition reads with C# precedence, where && binds tighter than ||.
    if (m.levitating || (m.onFoot === false && !m.onExteriorWaterAny)) { distance = 0; return; }
    if (!m.motorSwimming) {
      if (!m.grounded) { distance = 0; lostGrounding = true; return; }
      if (lostGrounding) {
        distance = 0;
        lastPosition = horizontal(m.pos);
        lostGrounding = false;
        if (ignoreLostGrounding) ignoreLostGrounding = false;
        else if (currentFootstepSoundList) playFootstep(BA_FOOTSTEP_VOLUME_SCALE, m.entity);
        return;
      }
    }
    if (m.standingStill) return;
    const position = horizontal(m.pos);
    distance += Math.hypot(position[0] - lastPosition[0], position[1] - lastPosition[1], position[2] - lastPosition[2]);
    lastPosition = position;
    const threshold = m.isRunning ? BA_RUN_STEP_INTERVAL : BA_WALK_STEP_INTERVAL;
    if (distance > threshold && currentFootstepSoundList) {
      let volumeScale = BA_FOOTSTEP_VOLUME_SCALE;
      if (m.movingLessThanHalfSpeed) volumeScale *= 0.5;
      playFootstep(volumeScale, m.entity);
      distance = 0;
    }
  }
  return {
    applyFootsteps, loadSettings, update,
    // A floating-origin shift is the mod's repositioning case, so the next landing step is swallowed.
    rebase() { lastPosition = null; ignoreLostGrounding = true; },
    lists,
    status() { return { list: nameOf(currentFootstepSoundList), distance, lostGrounding, ignoreLostGrounding, played: played.slice() }; },
  };
}

export class CameraShakeInstance {
  constructor(magnitude, roughness, fadeInTime = undefined, fadeOutTime = undefined, random = Math.random) {
    this.Magnitude = magnitude; this.Roughness = roughness;
    this.PositionInfluence = [0, 0, 0]; this.RotationInfluence = [0, 0, 0];
    this.DeleteOnInactive = true;
    this.roughMod = 1; this.magnMod = 1;
    this.fadeOutDuration = 0; this.fadeInDuration = 0; this.sustain = false; this.currentFadeTime = 0;
    this.amt = [0, 0, 0];
    if (fadeInTime === undefined) { this.sustain = true; }
    else {
      this.fadeOutDuration = fadeOutTime; this.fadeInDuration = fadeInTime;
      if (fadeInTime > 0) { this.sustain = true; this.currentFadeTime = 0; } else { this.sustain = false; this.currentFadeTime = 1; }
    }
    this.tick = rangeInt(random, -100, 100);
  }
  updateShake(dt) {
    this.amt[0] = perlinNoise(this.tick, 0) - 0.5;
    this.amt[1] = perlinNoise(0, this.tick) - 0.5;
    this.amt[2] = perlinNoise(this.tick, this.tick) - 0.5;
    if (this.fadeInDuration > 0 && this.sustain) {
      if (this.currentFadeTime < 1) this.currentFadeTime += dt / this.fadeInDuration;
      else if (this.fadeOutDuration > 0) this.sustain = false;
    }
    if (!this.sustain) this.currentFadeTime -= dt / this.fadeOutDuration;
    if (this.sustain) this.tick += dt * this.Roughness * this.roughMod;
    else this.tick += dt * this.Roughness * this.roughMod * this.currentFadeTime;
    const k = this.Magnitude * this.magnMod * this.currentFadeTime;
    return [this.amt[0] * k, this.amt[1] * k, this.amt[2] * k];
  }
  startFadeOut(t) { if (t === 0) this.currentFadeTime = 0; this.fadeOutDuration = t; this.fadeInDuration = 0; this.sustain = false; }
  startFadeIn(t) { if (t === 0) this.currentFadeTime = 1; this.fadeInDuration = t; this.fadeOutDuration = 0; this.sustain = true; }
  get isShaking() { return this.currentFadeTime > 0 || this.sustain; }
  get isFadingOut() { return !this.sustain && this.currentFadeTime > 0; }
  get isFadingIn() { return this.currentFadeTime < 1 && this.sustain && this.fadeInDuration > 0; }
  get currentState() { return this.isFadingIn ? 0 : this.isFadingOut ? 1 : this.isShaking ? 2 : 3; }
}

export const DEFAULT_POS_INFLUENCE = Object.freeze([0.15, 0.15, 0.15]);
export const DEFAULT_ROT_INFLUENCE = Object.freeze([1, 1, 1]);
const mulVec = (v, w) => [v[0] * w[0], v[1] * w[1], v[2] * w[2]];

export class CameraShaker {
  constructor(random = Math.random) { this.random = random; this.instances = []; this.posAddShake = [0, 0, 0]; this.rotAddShake = [0, 0, 0]; }
  update(dt) {
    let pos = [0, 0, 0], rot = [0, 0, 0];
    for (let i = 0; i < this.instances.length; i++) {
      const c = this.instances[i];
      if (c.currentState === 3 && c.DeleteOnInactive) { this.instances.splice(i, 1); i--; }
      else if (c.currentState !== 3) {
        // The mod calls updateShake twice per instance per frame, so the fade and the noise clock advance twice.
        const p = mulVec(c.updateShake(dt), c.PositionInfluence);
        const r = mulVec(c.updateShake(dt), c.RotationInfluence);
        pos = [pos[0] + p[0], pos[1] + p[1], pos[2] + p[2]];
        rot = [rot[0] + r[0], rot[1] + r[1], rot[2] + r[2]];
      }
    }
    this.posAddShake = pos; this.rotAddShake = rot;
  }
  shakeOnce(magnitude, roughness, fadeInTime, fadeOutTime) {
    if (magnitude === 0) return null;
    const shake = new CameraShakeInstance(magnitude, roughness, fadeInTime, fadeOutTime, this.random);
    shake.PositionInfluence = [...DEFAULT_POS_INFLUENCE]; shake.RotationInfluence = [...DEFAULT_ROT_INFLUENCE];
    this.instances.push(shake);
    return shake;
  }
  get active() { return this.instances.length > 0; }
}

export function damageShake(shaker, s, amount, maxHealth) {
  if (!shaker || !(maxHealth > 0)) return;
  let shakeAmount = s.shakeAmountAdd + (s.shakeAmountMultiplier * amount / maxHealth);
  shakeAmount = Math.max(0, Math.min(s.maxShake, shakeAmount));
  shaker.shakeOnce(shakeAmount, s.roughness, s.fadeInTime, s.fadeOutTime);
}

export function rigidInverse(m) {
  const r = new Float32Array(16);
  r[0] = m[0]; r[1] = m[4]; r[2] = m[8];
  r[4] = m[1]; r[5] = m[5]; r[6] = m[9];
  r[8] = m[2]; r[9] = m[6]; r[10] = m[10];
  r[12] = -(r[0] * m[12] + r[4] * m[13] + r[8] * m[14]);
  r[13] = -(r[1] * m[12] + r[5] * m[13] + r[9] * m[14]);
  r[14] = -(r[2] * m[12] + r[6] * m[13] + r[10] * m[14]);
  r[15] = 1;
  return r;
}
export function shakeView(view, pos, rotDeg) {
  if (!pos || (pos[0] === 0 && pos[1] === 0 && pos[2] === 0 && rotDeg[0] === 0 && rotDeg[1] === 0 && rotDeg[2] === 0)) return view;
  // In Unity, local +z points forward; in view space, forward is -z.
  const local = trs(pos[0], pos[1], -pos[2], rotDeg[0], rotDeg[1], rotDeg[2]);
  return multiply(rigidInverse(local), view);
}

export { SystemRandom };

export const dungeonGameObjectName = (regionName, name) => `DaggerfallDungeon [Region=${regionName}, Name=${name}]`;
const GREY = Object.freeze({ sky: [0.433, 0.433, 0.433], equator: [0.396, 0.396, 0.396], ground: [0.254, 0.254, 0.254] });
const lerp = (a, b, t) => a + t * (b - a);
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

export function dungeonFogFor(dungeonName, s, { totalRandom = false, now = 0 } = {}) {
  const rnd = new SystemRandom(totalRandom ? stringHash(String(now)) : stringHash(dungeonName));
  const fogColor = [rnd.nextDouble(), rnd.nextDouble(), rnd.nextDouble()];
  let fog = null, ambient = null;
  if (s.enableFog) {
    const start = rnd.nextDouble() * (s.maxFogStart - s.minFogStart) + s.minFogStart;
    const end = rnd.nextDouble() * (s.maxFogDistance - s.minFogDistance) + s.minFogDistance + start;
    fog = { mode: 'linear', density: 0, start, end, color: scale3(fogColor, s.dungeonDarkness) };
  }
  if (s.enableAmbientLighting) {
    ambient = {
      sky: scale3(lerp3(GREY.sky, fogColor, s.ambientLerp), s.dungeonDarkness),
      equator: scale3(lerp3(GREY.equator, fogColor, s.ambientLerp), s.dungeonDarkness),
      ground: scale3(lerp3(GREY.ground, fogColor, s.ambientLerp), s.dungeonDarkness),
    };
  }
  return { fogColor, fog, ambient };
}

export const REVERB_PRESETS = Object.freeze(['Cave', 'Stoneroom', 'Quarry']);
export const reverbPresetFor = (level) => REVERB_PRESETS[level] ?? null;

// The mod waits four frames after a start, a load, or a transition before it reads the new place.
export const TRANSITION_WAIT_FRAMES = 4;

export function createBetterAmbience({ audio = defaultAudio, settings = readBetterAmbienceSettings, random = Math.random, fetchClip = defaultFetchClip, weather = heardWeather, rainLevel = heardRainGain, snowFree = isSnowFreeClimate } = {}) {
  let s = null;
  const footsteps = createBetterFootsteps({ audio, random, snowFree });
  const shaker = new CameraShaker(random);
  let clipsLoaded = false, loading = null;
  const present = new Set();
  let place = { dungeon: null, building: false };
  let fogState = null;
  let reverbOn = null;
  let rainLoop = null;
  let rainKind = null;
  let rainWeather = null;
  let waitFrames = -1;

  async function loadAudio() {
    await Promise.all(baClipNames().map(async (name) => {
      if (present.has(name)) return;
      try {
        const bytes = await fetchClip(name);
        if (bytes && await audio.registerSound(baSoundKey(name), bytes)) present.add(name);
      } catch { }
    }));
    footsteps.applyFootsteps(present);
    clipsLoaded = true;
  }
  const settle = () => (loading ? loading.then(() => undefined) : Promise.resolve());
  function syncSettings() {
    const next = settings();
    if (sameSettings(s, next)) return;
    s = next;
    footsteps.loadSettings(s);
    if (s.Enabled && !clipsLoaded && !loading) loading = loadAudio().finally(() => { loading = null; });
  }

  function updateReverb(inDungeon) {
    // A held zone belongs to its holder; the cache is cleared so the first frame after release sets the preset.
    if (audio.reverbHeld?.() != null) { reverbOn = null; return; }
    const want = s.Enabled && inDungeon ? reverbPresetFor(s.reverbLevel) : null;
    if (want === reverbOn) return;
    reverbOn = want;
    audio.setReverb?.(want);
  }
  function stopRain() { if (rainLoop) { rainLoop.stop?.(); rainLoop = null; } rainWeather = null; }
  // The mod rain plays at the street level, matched to the street clip by RMS, so indoors it is never louder.
  function rainTarget() {
    const street = audio.clipLevel?.(AMBIENT_RAIN_LOOP);
    const mine = audio.clipLevel?.(baSoundKey(AMBIENT_RAIN_CLIP));
    const match = street > 0 && mine > 0 ? street / mine : 1;
    return rainLevel() * match * (rainKind === 'interior' ? INDOOR_RAIN_GAIN : 1);
  }

  function updateAmbientSoundSources() {
    stopRain();
    if (!s.Enabled) { rainKind = null; return; }
    if (place.dungeon) rainKind = place.dungeon.exitPos ? 'exit' : null;
    else if (place.building) rainKind = 'interior';
    else rainKind = null;
  }
  function updateSource() {
    const w = weather();
    if (w === 'rain' || w === 'thunder') {
      if (!rainLoop && present.has(AMBIENT_RAIN_CLIP)) {
        rainLoop = rainKind === 'interior'
          ? audio.loop(baSoundKey(AMBIENT_RAIN_CLIP), rainTarget(), { lowpass: AMBIENT_RAIN_LOWPASS_HZ })
          : audio.loop3d(baSoundKey(AMBIENT_RAIN_CLIP), place.dungeon.exitPos, rainTarget(), { refDistance: 1, maxDistance: 500, distanceModel: 'inverse', lowpass: AMBIENT_RAIN_LOWPASS_HZ });
      }
      // The weather counts as handled only once the loop plays, so a clip still decoding is tried again next frame.
      rainWeather = rainLoop ? w : null;
    } else { stopRain(); rainWeather = w; }
  }
  function updateDungeonFog() {
    s = settings();
    const d = place.dungeon;
    const inCastle = typeof d?.inCastle === 'function' ? !!d.inCastle() : !!d?.inCastle;
    if (!s.Enabled || !d || inCastle) { fogState = null; return; }
    fogState = dungeonFogFor(dungeonGameObjectName(d.regionName ?? '', d.name ?? ''), s);
  }
  function owe() { waitFrames = TRANSITION_WAIT_FRAMES; }
  function settle4() { updateDungeonFog(); updateAmbientSoundSources(); }

  const api = {
    frame(dt, m) {
      syncSettings();
      if (waitFrames >= 0 && --waitFrames < 0) settle4();
      if (!s.Enabled) { if (reverbOn) updateReverb(false); if (rainLoop) stopRain(); fogState = null; return; }
      updateReverb(!!m.inDungeon);
      if (rainKind && rainWeather !== weather()) updateSource();
      // A paused game freezes the shake, as Unity's deltaTime is 0 then.
      shaker.update(m.paused ? 0 : Math.max(0, Number(dt) || 0));
      if (s.footstepsEnable && clipsLoaded) footsteps.update(m);
    },
    view(view) { return s?.Enabled ? shakeView(view, shaker.posAddShake, shaker.rotAddShake) : view; },
    removeHealth(amount, maxHealth) { syncSettings(); if (s.Enabled) damageShake(shaker, s, amount, maxHealth); },
    weaponKick(magnitude) {
      syncSettings();
      if (!s.Enabled) return;
      const m = Math.max(0, Math.min(s.maxShake, Number(magnitude) || 0));
      shaker.shakeOnce(m, s.roughness, s.fadeInTime, s.fadeOutTime);
    },
    onStartGame() { syncSettings(); owe(); },
    onLoad() { syncSettings(); owe(); },
    // The rain kind is dropped with the place, so no frame before the settle asks for the old dungeon's exit.
    onTransition(next) { syncSettings(); place = { dungeon: next?.dungeon ?? null, building: !!next?.building }; fogState = null; stopRain(); rainKind = null; owe(); footsteps.rebase(); },
    settleTransition() { waitFrames = -1; settle4(); },
    dungeonFog() { return fogState?.fog ?? null; },
    dungeonAmbient() { return fogState?.ambient ?? null; },
    rebase() { footsteps.rebase(); },
    ownsStride() { return !!(s?.Enabled && s.footstepsEnable && clipsLoaded); },
    classicClipKept(clip) { return CLASSIC_CLIPS_KEPT.has(clip); },
    settle,
    footsteps, shaker,
    rainPlaying() { return !!rainLoop; },
    status() {
      return { enabled: !!s?.Enabled, footstepsOn: !!s?.footstepsEnable, clipsLoaded, present: [...present], place, fog: fogState, reverb: reverbOn, rain: rainLoop ? rainKind : null, rainWeather, shake: { pos: shaker.posAddShake, rot: shaker.rotAddShake, instances: shaker.instances.length } };
    },
  };
  return api;
}

export const betterAmbience = createBetterAmbience();
setRemoveHealthListener((amount) => betterAmbience.removeHealth(amount, playerEntity.maxHealth ?? 0));

export function classicFootstepAllowed(clip) {
  if (immersiveFootsteps.ownsStride()) return false;
  if (betterAmbience.ownsStride()) return betterAmbience.classicClipKept(clip);
  return true;
}
