
import { CLIMATES } from '../formats/mapsFile.js';
import { MINUTES_PER_HOUR, MINUTES_PER_DAY } from '../world/gameDate.js';
import { isOnShip } from '../systems/naval/ship.js';

export const CLIMATE_INDICES = Object.freeze([0, 0, 0, 1, 2, 3, 4, 5, 5, 5]);
export const TERRAIN_MOVEMENT_MODIFIERS = Object.freeze([240, 220, 200, 200, 230, 250]);

// The classic longest-axis stepper, not true Bresenham: the increment compares with `>`, not `>=`. The start pixel
// is never in the list, because the C# loop never charges it.
export function walkTravelPath(start, end) {
  let px = start.x, py = start.y;
  const dx = end.x - px, dy = end.y - py;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const furthest = adx <= ady ? ady : adx;
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;

  const path = [];
  let moves = 0, inc = 0;
  while (moves < furthest) {
    if (furthest === adx) {
      px += sx;
      inc += ady;
      if (inc > adx) { inc -= adx; py += sy; }
    } else {
      py += sy;
      inc += adx;
      if (inc > ady) { inc -= ady; px += sx; }
    }
    path.push({ x: px, y: py });
    ++moves;
  }
  return path;
}

export function travelPixelMinutes(terrain, transportModifier, {
  travelShip = false, sleepModeInn = false,
} = {}) {
  let thisMove;
  if (terrain === CLIMATES.Ocean) {
    thisMove = travelShip ? 51 : 255;
  } else {
    const idx = CLIMATE_INDICES[terrain - CLIMATES.Ocean];
    thisMove = (((102 * transportModifier) >> 8)
      * (256 - TERRAIN_MOVEMENT_MODIFIERS[idx] + 256)) >> 8;
  }
  if (!sleepModeInn) thisMove = (300 * thisMove) >> 8;
  return thisMove;
}

// Every travel reckoning reads this factor (the window, the maps, the quest clock, and the party fare), so the time
// shown matches the time taken.
let seaTide = null;
export function setSeaTide(fn) { seaTide = typeof fn === 'function' ? fn : null; }
const seaTideAt = (end) => (seaTide && end ? seaTide(end) : 1);

// Aboard an owned ship the live pixel is the open-ocean mooring, so travel is reckoned from the pixel where the
// player boarded, as DFU does.
export function playerTravelPosition(player, boardShipPosition, currentPixel) {
  if (!isOnShip(player, boardShipPosition, currentPixel)) return currentPixel;
  const px = boardShipPosition.mapPixel;
  return px ? { x: px.x, y: px.y } : currentPixel;
}

export function calculateTravelTime(start, end, {
  speedCautious = false, sleepModeInn = false, travelShip = false,
  hasHorse = false, hasCart = false, seaMult = seaTideAt(end),
} = {}, getClimateIndex) {
  const transportModifier = hasHorse ? 128 : hasCart ? 192 : 256;

  let minutes = 0, oceanPixels = 0;
  for (const { x, y } of walkTravelPath(start, end)) {
    const terrain = getClimateIndex(x, y);
    if (terrain === CLIMATES.Ocean) ++oceanPixels;
    const m = travelPixelMinutes(terrain, transportModifier, { travelShip, sleepModeInn });
    minutes += terrain === CLIMATES.Ocean && seaMult !== 1 ? Math.floor(m * seaMult) : m;
  }

  if (!speedCautious) minutes = minutes >> 1;
  return { minutes, oceanPixels };
}

// Every caller passes `freeTavernRooms` (the Knightly Order perk), because the false default makes a knight pay inn
// nights that DFU waives.
export function calculateTripCost(travelTimeMinutes, oceanPixels, {
  sleepModeInn = false, hasShip = false, travelShip = false, freeTavernRooms = false,
} = {}) {
  const hours = Math.trunc((travelTimeMinutes + 59) / 60);
  let piecesCost = 0;
  if (sleepModeInn && !freeTavernRooms) {
    piecesCost = 5 * Math.trunc((hours - oceanPixels) / 24);
    if (piecesCost < 0) piecesCost = 0;
    piecesCost += 5;
  }
  let totalCost = piecesCost;
  if (oceanPixels > 0 && !hasShip && travelShip) totalCost += 25 * (Math.trunc(oceanPixels / 24) + 1);
  return { piecesCost, totalCost };
}

export function arrivalClampMinutes(classicMinutes, { speedCautious = false, sunAverse = false } = {}) {
  const hour = Math.trunc(classicMinutes / MINUTES_PER_HOUR) % 24;
  const minute = classicMinutes % MINUTES_PER_HOUR;
  if (sunAverse) {
    if (hour >= 6 && hour < 18) return (18 - hour) * MINUTES_PER_HOUR;
    return 0;
  }
  if (!speedCautious) return 0;
  if (hour < 7 || (hour === 7 && minute < 10)) return (7 - hour) * MINUTES_PER_HOUR + (10 - minute);
  if (hour > 17) return (31 - hour) * MINUTES_PER_HOUR + (10 - minute);
  return 0;
}

export const travelDays = (minutes) => Math.trunc((minutes + MINUTES_PER_DAY - 1) / MINUTES_PER_DAY);
