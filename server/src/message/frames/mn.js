// The `mn` frame's handler, called by message/dispatch.js with the room as `this` (BUNNYFALL 2026-11-25, caverns).

export function mnFrame(ws, a, m) {
  return this._mnFrameIn(ws, a, m);
}
