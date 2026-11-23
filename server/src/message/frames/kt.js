// The `kt` frame's handler, called by message/dispatch.js with the room as `this`.

export function ktFrame(ws, a, m) {
  return this._ktFrameIn(ws, a, m);
}
