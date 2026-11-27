// Every step rounds to float32 with `f`, matching the mod's C# float math, so positions match it.
import { roundToInt } from '../../world/mathf.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../../formats/woodsFile.js';
import { REGION_PANEL_OFFSET } from '../../ui/travelMapWindow.js';

const f = Math.fround;

export const TRAVEL_MAP_IMG = 'TRAV0I00.IMG';
export const TRAVEL_MAP_INTERIOR = Object.freeze([320, 160]);
export const LINE_TEXTURE = Object.freeze({ archive: 0, record: 112, frame: 0 });

export const MAP_MARKER_MODE_LABELS = Object.freeze(['Yellow', 'Green', 'Cyan', 'Blue', 'Magenta', 'Red', 'White', 'Gray']);
const rgba = (r, g, b, a = 1) => Object.freeze({ r: f(r), g: f(g), b: f(b), a: f(a) });
export const MAP_MARKER_MODE_COLORS = Object.freeze([
  rgba(1, 0.92156863, 0.015686275),
  rgba(0, 1, 0), rgba(0, 1, 1), rgba(0, 0, 1), rgba(1, 0, 1), rgba(1, 0, 0), rgba(1, 1, 1),
  rgba(0.5, 0.5, 0.5),
]);
export const COLOR_BLACK = rgba(0, 0, 0);
export const COLOR_WHITE = rgba(1, 1, 1);
export const COLOR_RED = rgba(1, 0, 0);
export const COLOR_GREEN = rgba(0, 1, 0);
export const COLOR_BLUE = rgba(0, 0, 1);
export const DAGGERFALL_DEFAULT_TEXT_COLOR = rgba(243 / 255, 239 / 255, 44 / 255);
export const DAGGERFALL_DEFAULT_SHADOW_POS = Object.freeze([1, 1]);

export const MAP_HELP_LINES = Object.freeze([
  'Left-click to place a marker',
  'Right-click to remove a marker',
  'Press 1-8 to change the marker color',
  'Hold Left Shift for finer placement',
  'Press Esc to exit',
]);

export function travelMapPicture(bitmap, colorOf, width = MAP_WIDTH, height = MAP_HEIGHT) {
  const [iw, ih] = TRAVEL_MAP_INTERIOR;
  const data = new Uint8ClampedArray(width * height * 4);
  // Nearest sampling at texel centers matches the mod's bundled picture best.
  for (let y = 0; y < height; y++) {
    const sy = Math.min(ih - 1, Math.round((y + 0.5) * ih / height - 0.5));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(iw - 1, Math.round((x + 0.5) * iw / width - 0.5));
      const c = colorOf(bitmap.data[(sy + REGION_PANEL_OFFSET) * bitmap.width + sx]);
      const i = (y * width + x) * 4;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export const guiRectContains = (r, p) => p[0] >= r.x && p[0] < f(r.x + r.w) && p[1] >= r.y && p[1] < f(r.y + r.h);
export const vector2IntDistance = (a, b) => f(Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])));
/**
 * @param {{ x?: number, y?: number, width: number, height: number }} screenRect
 * @param {number[]} scale
 */
export function mapRect(screenRect, scale) {
  const [screenScaleX, screenScaleY] = scale;
  const num2 = f(1000 * screenScaleX);
  const num3 = f(500 * screenScaleY);
  // The width is scaled again before it is halved, so a scaled screen puts the map off center, as in the mod.
  return {
    x: f(f(f(screenRect.x ?? 0) + f(f(f(screenRect.width) * screenScaleX) / 2)) - f(num2 / 2)),
    y: f(f(f(screenRect.y ?? 0) + f(f(f(screenRect.height) * screenScaleY) / 2)) - f(num3 / 2)),
    w: num2, h: num3,
  };
}

export const guiMouse = (screenRect, mouse) => [f(mouse[0]), f(f(screenRect.height) - f(mouse[1]))];
// Measured in screen pixels from the map's corner, not picture pixels, as the mod reads it.
export const mapPixelUnder = (rect, gui) => [roundToInt(f(gui[0] - rect.x)), roundToInt(f(gui[1] - rect.y))];

export function dayOfMonthWithSuffix(day) {
  const d = day + 1;
  const s = d === 1 || d === 21 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th';
  return `${d}${s}`;
}
export const markerLabel = (pos, dayWithSuffix, monthName) => `(${pos[0]}, ${pos[1]}) - ${dayWithSuffix} of ${monthName}`;

export function csFloatString(v) {
  v = f(v);
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (v === 0) return '0';
  const sign = v < 0 ? '-' : '';
  const [m, e] = Math.abs(v).toExponential(6).split('e');
  const exp = Number(e);
  if (exp >= 7 || exp <= -5) {
    const mant = m.replace(/\.?0+$/, '');
    return `${sign}${mant}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  const fixed = Math.abs(v).toPrecision(7);
  return sign + (fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed);
}

export function mapOverlayDraws(o) {
  const draws = [];
  const quad = (tex, x, y, w, h, color) => draws.push({ kind: 'quad', tex, rect: { x: f(x), y: f(y), w: f(w), h: f(h) }, color });
  const text = (str, pos, scale, color, shadowPos) => draws.push({ kind: 'text', text: str, x: f(pos[0]), y: f(pos[1]), scale, color, shadow: COLOR_BLACK, shadowPos });
  quad('line', 0, 0, o.screen[0], o.screen[1], { ...COLOR_BLACK, a: f(o.opacity) });
  const r = mapRect(o.screenRect, o.scale);
  const num2 = r.w, num3 = r.h;
  quad('map', r.x, r.y, r.w, r.h, COLOR_WHITE);
  const val4 = mapPixelUnder(r, o.mouse);
  if (o.showingPosition && f(Math.sin(f(f(o.unscaledTime) * 5))) > 0) {
    const t = o.lineThickness;
    quad('line', f(r.x + f(f(f(o.pixel[0]) * o.scale[0]) - t)), r.y, 1 + t * 2, num3, COLOR_RED);
    quad('line', r.x, f(f(r.y + f(f(o.pixel[1]) * o.scale[1])) - t), num2, 1 + t * 2, COLOR_RED);
  }
  const shadow3 = [DAGGERFALL_DEFAULT_SHADOW_POS[0] * 3, DAGGERFALL_DEFAULT_SHADOW_POS[1] * 3];
  MAP_HELP_LINES.forEach((line, i) => text(line, [0, 20 * i], 3, DAGGERFALL_DEFAULT_TEXT_COLOR, shadow3));
  text(`Current marker color is ${MAP_MARKER_MODE_LABELS[o.markerMode]}`, [0, f(o.screen[1] - 20)], 3, DAGGERFALL_DEFAULT_TEXT_COLOR, shadow3);
  for (const m of o.markers) {
    const t = o.markerThickness, ot = o.outlineThickness;
    const x = f(f(r.x + m.position[0]) - t), y = f(f(r.y - t) + m.position[1]), w = 1 + t * 2, h = 1 + t * 2;
    if (ot !== 0) quad('line', f(x - ot), f(y - ot), w + ot * 2, h + ot * 2, COLOR_BLACK);
    quad('line', x, y, w, h, m.color);
  }
  for (const m of o.markers) {
    // Labels use the raw marker thickness, not the one Left Shift zeroes, as in the mod.
    const t = o.markerThicknessRaw;
    const x = f(f(r.x + m.position[0]) - t), y = f(f(r.y - t) + m.position[1]);
    if (vector2IntDistance(val4, m.position) <= o.clickRange) text(m.label, [f(x + 10), f(y - 20)], 3, DAGGERFALL_DEFAULT_TEXT_COLOR, shadow3);
  }
  return draws;
}
