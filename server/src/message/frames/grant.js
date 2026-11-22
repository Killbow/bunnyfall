// The `grant` frame's handler, called by message/dispatch.js with the room as `this`.

export function grantFrame(ws, a, m) {
  return this._grantFrame(ws, a, m);
}
