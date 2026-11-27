// @ts-check
import { skyState, moonlightTerm, WEATHER_SKY } from './enhancedSky.js';
import { isNight, daylightScale } from '../world/worldClock.js';

export function cloudsStateUnderMod(st, moons, { minuteOfDay, weather, classicMinutes = 0, skyMinutes = classicMinutes, seconds = 0, drift = null, row = null, skyRow = null }) {
  const base = skyState({ minuteOfDay, weather, classicMinutes, skyMinutes, seconds, drift, row });
  return {
    ...base,
    sunDir: st.sunDir,
    masser: moons?.masser ?? base.masser,
    secunda: moons?.secunda ?? base.secunda,
    horizon: modHorizon(st.clearColor ?? base.horizon, base.cloudShade, skyRow ?? row ?? WEATHER_SKY[weather] ?? WEATHER_SKY.sunny),
  };
}

// Blends the mod fog color toward the cloud shade by the weather `grey` value, matching the built-in dome horizon.
export function modHorizon(modColor, shade, w) {
  const g = Math.max(0, Math.min(1, w?.grey ?? 0));
  if (g === 0 || !shade) return modColor;
  return [
    modColor[0] + (shade[0] - modColor[0]) * g,
    modColor[1] + (shade[1] - modColor[1]) * g,
    modColor[2] + (shade[2] - modColor[2]) * g,
  ];
}

export function dynamicMoonState(dyn, minuteOfDay, cover = 0) {
  const mat = dyn.mat;
  const sunY = dyn._sunDir?.[1] ?? 0;
  const span = mat._NightStartHeight - mat._NightEndHeight;
  const day = span === 0 ? (sunY >= mat._NightStartHeight ? 1 : 0) : Math.max(0, Math.min(1, (sunY - mat._NightEndHeight) / span));
  // Same moonlight dimming as the dome in enhancedSky.js, since the CPU cannot sample the mod cloud textures.
  const cloud = 1 - cover * 0.35;
  const moon = (which, phase, color) => {
    const dir = dyn.moonDirection(which);
    return { dir, vis: dir[1] > 0 ? (1 - day) * cloud : 0, phase, color: [color[0], color[1], color[2]] };
  };
  return {
    night: isNight(minuteOfDay),
    daylight: daylightScale(minuteOfDay),
    masser: moon('Moon', dyn.phases?.masser?.phase ?? -1, mat._MoonColor),
    secunda: moon('Secunda', dyn.phases?.secunda?.phase ?? -1, mat._SecundaColor),
  };
}

export const dynamicMoonlight = (moons) => (moons ? moonlightTerm(moons) : null);
