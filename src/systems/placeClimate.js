// @ts-check
// The running host registers a reader that returns the climate, season, underground flag, and dungeon wall picture at
// a scene point. The last registration wins, and any spell can ask it without the host passing it down.

let reader = null;

export function registerPlace(read) { reader = read; }

export function placeNow(at) {
  try { return reader?.(at) ?? {}; } catch { return {}; }
}
