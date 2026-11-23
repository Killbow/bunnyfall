// The `ban` frame's handler, called by message/dispatch.js with the room as `this`.

export function banFrame(ws, a, m) {
  return this._banFrame(ws, m);
}
