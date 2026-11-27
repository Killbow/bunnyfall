import { UMRandom } from '../formats/umRandom.js';

export const WEATHER_TYPES = Object.freeze([
  'sunny', 'cloudy', 'overcast', 'fog', 'rain', 'thunder', 'snow',
  'sandstorm',
]);

export const FOG_SETTINGS = Object.freeze({
  sunny: { mode: 'linear', density: 0, start: 0, end: 2400, excludeSky: true },
  overcast: { mode: 'linear', density: 0, start: 0, end: 2400, excludeSky: true },
  rainy: { mode: 'exp', density: 0.003, start: 0, end: 0, excludeSky: true },
  snowy: { mode: 'exp', density: 0.005, start: 0, end: 0, excludeSky: true },
  heavy: { mode: 'exp', density: 0.05, start: 0, end: 0, excludeSky: false },
  interior: { mode: 'exp', density: 0.001, start: 0, end: 0, excludeSky: false },
  dungeon: { mode: 'exp', density: 0.005, start: 0, end: 0, excludeSky: false },
  sandstorm: { mode: 'exp', density: 0.09, start: 0, end: 0, excludeSky: false },
});

export function scaleFogForDistance(fog, terrainDistance) {
  if (fog.mode !== 'linear' || !(terrainDistance > 3)) return fog;
  return { ...fog, end: fog.end * (terrainDistance / 3) };
}

const SNOW_FREE_CLIMATES = new Set([224, 225, 227, 229]);

export function isSnowFreeClimate(climateIndex) {
  return SNOW_FREE_CLIMATES.has(climateIndex);
}

export function fogForWeather(weather, table = FOG_SETTINGS) {
  switch (weather) {
    case 'overcast': return table.overcast;
    case 'fog': return table.heavy;
    case 'rain':
    case 'thunder': return table.rainy;
    case 'snow': return table.snowy;
    case 'sandstorm': return table.sandstorm ?? table.heavy;
    default: return table.sunny;
  }
}

export function skyOffsetForWeather(weather, rng) {
  if (weather === 'rain' || weather === 'thunder' || weather === 'fog') {
    return rng.nextFloat() > 0.5 ? 4 : 5;
  }
  if (weather === 'snow') {
    return rng.nextFloat() > 0.5 ? 6 : 7;
  }
  return 0;
}

export function weatherSunlightScale(weather, isWinter) {
  let scale = 1;
  if (isWinter) scale = 0.65;
  if (weather === 'rain') scale = 0.45;
  else if (weather === 'thunder') scale = 0.25;
  else if (weather === 'snow') scale = 0.45;
  else if (weather === 'overcast' || weather === 'fog') scale = 0.65;
  else if (weather === 'sandstorm') scale = 0.35;
  return scale;
}

export function weatherFlags(weather) {
  return Object.freeze({
    raining: weather === 'rain' || weather === 'thunder',
    storming: weather === 'thunder',
    snowing: weather === 'snow',
    overcast: weather === 'overcast' || weather === 'fog' || weather === 'rain'
      || weather === 'thunder' || weather === 'snow' || weather === 'sandstorm',
  });
}

export function precipitationForWeather(weather) {
  if (weather === 'rain') return 'rain';
  if (weather === 'thunder') return 'storm';
  if (weather === 'snow') return 'snow';
  if (weather === 'sandstorm') return 'sand';
  return null;
}

export function fogFactor(settings, distance) {
  if (settings.mode === 'linear') {
    if (settings.density === 0 && settings.end <= settings.start) return 1;
    const f = (settings.end - distance) / (settings.end - settings.start);
    return Math.max(0, Math.min(1, f));
  }
  if (settings.mode === 'exp2') {
    const f = settings.density * distance;
    return Math.exp(-f * f);
  }
  return Math.exp(-settings.density * distance);
}

export class LightningPlayer {
  constructor(seed = 1) {
    this._rng = new UMRandom((seed >>> 0) || 1);
    this._wait = this._nextWait();
    this._slots = 0;
    this._phase = 0;
    this._slotsDone = 0;
    this._litHalf = false;
    this._on = false;
    this.lastClipClass = null;
    this.strikes = 0;
  }

  _int(min, max) {
    return min + Math.floor(this._rng.nextFloat() * (max - min));
  }

  _nextWait() {
    return this._int(4, 35);
  }

  tick(dtSeconds) {
    this._wait -= dtSeconds;
    if (this._phase === 0) {
      if (this._wait > 0) return 1;
      const pick = this._rng.nextFloat();
      let min;
      let max;
      if (pick < 1 / 3) {
        this.lastClipClass = 'short'; min = 4; max = 8;
      } else if (pick < 2 / 3) {
        this.lastClipClass = 'thunder'; min = 5; max = 10;
      } else {
        this.lastClipClass = 'roll'; min = 20; max = 30;
      }
      this._slots = this._int(min, max);
      this._phase = 1;
      // Strikes are counted and never drawn from the stream, so the DFU schedule is untouched.
      this.strikes++;
      this._slotsDone = 0;
      this._litHalf = false;
      this._wait = this._nextWait();
    }
    if (this._litHalf) {
      this._on = false;
      this._litHalf = false;
      this._slotsDone++;
    } else if (this._rng.nextFloat() < 0.6) {
      this._on = true;
      this._litHalf = true;
    } else {
      this._on = false;
      this._slotsDone++;
    }
    if (this._slotsDone >= this._slots) {
      this._phase = 0;
      this._on = false;
    }
    return this._on ? 2 : 1;
  }
}

export function weatherRng(seed = 1) {
  return new UMRandom((seed >>> 0) || 1);
}
