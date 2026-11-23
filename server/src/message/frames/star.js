// The `star` frame's handler, called by message/dispatch.js with the room as `this`.

export function starFrame(ws, a, m) {
  return this._starFrame(ws, a, m);
}
