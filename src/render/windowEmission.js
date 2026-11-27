// @ts-check
// Window emission styles, constants from Daggerfall Unity's MaterialReader. The emission is color times intensity.

// Disabled is plain black in Daggerfall Unity, and its interiors use it, so interior glass stays unlit.
export const WINDOW_STYLES = Object.freeze({
  day: { color: [89, 154, 178], intensity: 0.5 },
  night: { color: [255, 182, 56], intensity: 0.8 },
  fog: { color: [117, 117, 117], intensity: 0.5 },
  custom: { color: [200, 0, 200], intensity: 1.0 },
  disabled: { color: [0, 0, 0], intensity: 0 },
});

export function windowEmissionRGB(style) {
  const s = WINDOW_STYLES[style] || WINDOW_STYLES.day;
  return new Float32Array([
    (s.color[0] / 255) * s.intensity,
    (s.color[1] / 255) * s.intensity,
    (s.color[2] / 255) * s.intensity,
  ]);
}
