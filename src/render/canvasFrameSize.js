// @ts-check
// The size is cached per frame, because a read after the HUD writes to the page forces a layout.

import { framesBegun } from '../platform/frameClock.js';

/** @param {{ clientWidth: number, clientHeight: number }} canvas */
export function createCanvasFrameSize(canvas) {
  const size = { w: 0, h: 0 };
  let at = -1;
  return () => {
    const f = framesBegun();
    if (f !== at) { at = f; size.w = canvas.clientWidth; size.h = canvas.clientHeight; }
    return size;
  };
}
