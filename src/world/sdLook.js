// @ts-check

export const SD_RAMP = Object.freeze({
  void: Object.freeze([[5, 4, 3], [12, 9, 6], [24, 17, 10], [51, 38, 18], [92, 60, 24]]),
  basalt: Object.freeze([[14, 12, 12], [22, 20, 19], [34, 30, 28], [50, 45, 41], [70, 63, 56]]),
  cobble: Object.freeze([[30, 27, 25], [52, 48, 44], [74, 68, 60], [98, 90, 78], [124, 114, 98]]),
  brass: Object.freeze([[48, 30, 12], [88, 58, 22], [140, 98, 40], [196, 146, 64], [228, 184, 100], [246, 206, 120]]),
  verdigris: Object.freeze([[22, 34, 28], [36, 56, 46], [58, 88, 70], [88, 124, 98], [120, 156, 128]]),
  bronze: Object.freeze([[24, 17, 10], [40, 28, 16], [62, 44, 24], [86, 62, 34], [112, 84, 48]]),
  silver: Object.freeze([[40, 42, 46], [64, 68, 74], [106, 112, 120], [160, 166, 176], [214, 220, 228]]),
  pale: Object.freeze([[78, 75, 70], [100, 96, 90], [120, 116, 108], [150, 146, 138], [182, 178, 170]]),
  earth: Object.freeze([[18, 12, 8], [32, 22, 14], [50, 36, 22], [70, 52, 32], [92, 70, 44]]),
  baySky: Object.freeze([[14, 20, 44], [90, 60, 110], [210, 120, 60], [92, 140, 210], [150, 190, 235]]),
});

export const SD_LIGHT = Object.freeze({
  gold: Object.freeze([1.0, 0.78, 0.4]),
  mantella: Object.freeze([0.45, 1.0, 0.6]),
  ember: Object.freeze([1.0, 96 / 255, 40 / 255]),
  moon: Object.freeze([0.85, 0.9, 1.0]),
  red: Object.freeze([1.0, 0.32, 0.26]),
  moment: Object.freeze([1.0, 0.92, 0.62]),
});

export const SD_LADDER = Object.freeze({ void: 0.04, haze: 0.18, structure: 0.25, ambient: 0.45, signal: 0.8, critical: 0.85 });

export const SD_TICK_EASE_S = 0.25;
export function sdTick(t) {
  const s = Math.floor(t), e = Math.min(1, (t - s) / SD_TICK_EASE_S);
  return s + e * e * (3 - 2 * e);
}
export const handToTwelve = (remaining, total) => (total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0);

export const SD_HOUR_GRADE = Object.freeze({ adaptKey: 0.12, adaptMax: 1.15, bloom: 0.8, vignette: 0.34, contrast: 1.08 });
