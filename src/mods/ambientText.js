// Ambient Text 1.8 (Regnier), ported from its compiled scripts: a real-time clock, a percentage roll,
// and a key built from where and when the player is. The prose the key reaches is vendored verbatim.

import AMBIENT_TEXTS from '../../vendor/ambient-text/ambientTexts.json' with { type: 'json' };
import { LOCATION_TYPES, DUNGEON_TYPES } from '../formats/mapsFile.js';
import { dice100 } from '../combat/formulas.js';
import { weatherFlags } from '../world/weather.js';

export { AMBIENT_TEXTS };

export const AMBIENT_TEXT_SECTION = 'AmbientText';

export function readAmbientTextSettings(get) {
  return {
    textChance: get('textChance') | 0,
    stdInterval: Number(get('interval')),
    postTextInterval: Number(get('postTextInterval')),
    textDisplayTime: get('textDisplayTime') | 0,
  };
}

const enumName = (table, value) => {
  for (const [name, v] of Object.entries(table)) if (v === value) return name;
  return String(value);
};

export function weatherKey(flags) {
  if (flags.raining || flags.storming) return 'Rainy';
  if (flags.snowing) return 'Snowy';
  if (flags.overcast) return 'Cloudy';
  return 'Clear';
}

export const weatherKeyForWeather = (weather) => weatherKey(weatherFlags(weather));

export const CLIMATE_KEYS = Object.freeze([
  'Desert',
  'Desert',
  'Mountains',
  'Swamp',
  'Swamp',
  'Desert',
  'Woods',
  'Woods',
  'Woods',
]);

export function climateKey(climateIndex) {
  return CLIMATE_KEYS[(climateIndex | 0) - 224] ?? 'Ocean';
}

export function ambientTextKey({
  insideDungeon = false, dungeonType = DUNGEON_TYPES.NoDungeon,
  inLocationRect = false, locationType = LOCATION_TYPES.None,
  isDay = true, climateIndex = 223, weather = 'sunny',
  index = 0, tail = 0,
} = {}) {
  if (insideDungeon) return `${enumName(DUNGEON_TYPES, dungeonType)}${index}`;
  const loc = enumName(LOCATION_TYPES, inLocationRect ? locationType : LOCATION_TYPES.None);
  const time = isDay ? 'Day' : 'Night';
  if (tail === 0) return `${loc}${climateKey(climateIndex)}${index}`;
  if (tail === 1) return `${loc}${time}${index}`;
  return `${loc}${time}${weatherKeyForWeather(weather)}${index}`;
}

export const hasAmbientText = (key, texts = AMBIENT_TEXTS) => Object.prototype.hasOwnProperty.call(texts, key);

export function createAmbientText({
  settings, where = () => ({}), insideBuilding = () => false,
  ready = () => true, paused = () => false,
  say = () => {}, rolls = Math.random, enabled = () => true, texts = AMBIENT_TEXTS,
} = {}) {
  // lastIndex starts at -1 so the first draw is never rejected as a repeat.
  const w = { lastTickTime: 0, tickTimeInterval: 0, lastIndex: -1, started: false };

  const start = (unscaledTime) => {
    w.lastTickTime = unscaledTime;
    w.tickTimeInterval = settings().stdInterval;
    w.started = true;
  };

  const selectAmbientText = () => {
    // lastIndex is written only on a hit, so the roll rejects the last index that showed text.
    let index = w.lastIndex;
    do { index = Math.floor(rolls() * 10); } while (index === w.lastIndex);
    const at = where();
    // The tail roll is not spent in a dungeon, which keeps the draw count of a seeded stream equal to the mod's.
    const tail = at.insideDungeon ? 0 : Math.floor(rolls() * 3);
    const key = ambientTextKey({ ...at, index, tail });
    if (!hasAmbientText(key, texts)) return null;
    w.lastIndex = index;
    return texts[key];
  };

  const update = (unscaledTime) => {
    if (!ready() || paused()) return null;
    // Start is a lifecycle call: `enabled` must not gate it, or the first line's timing depends on switch history.
    if (!w.started) { start(unscaledTime); return null; }
    if (!enabled()) return null;
    // Returns before the clock is written, so the interval keeps running while the player is inside.
    if (insideBuilding()) return null;
    if (!(unscaledTime > w.lastTickTime + w.tickTimeInterval)) return null;
    const s = settings();
    w.lastTickTime = unscaledTime;
    w.tickTimeInterval = s.stdInterval;
    if (!dice100(s.textChance, rolls())) return null;
    const text = selectAmbientText();
    if (!text || !text.trim()) return null;
    say(text, s.textDisplayTime);
    w.tickTimeInterval = s.postTextInterval;
    return text;
  };

  return { start, update, selectAmbientText, state: w };
}


import { modSettingsOf } from './modSettings.js';

export const AMBIENT_TEXT_VENDOR = 'ambient-text';

let _host = null;

export function setAmbientTextHost(host) { _host = host; }

const _mod = createAmbientText({
  settings: () => readAmbientTextSettings((k) => modSettingsOf(AMBIENT_TEXT_VENDOR)[k]),
  enabled: () => !!modSettingsOf(AMBIENT_TEXT_VENDOR).Enabled,
  ready: () => !!_host,
  paused: () => !!_host?.paused?.(),
  insideBuilding: () => _host?.insideBuilding?.() ?? true,
  where: () => _host?.where?.() ?? {},
  say: (text, seconds) => _host?.say?.(text, seconds),
});

const wallSeconds = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export const tickAmbientText = (unscaledTime = wallSeconds()) => _mod.update(unscaledTime);
