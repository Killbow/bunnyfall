// @ts-check
// Lays portChannelData's water pixels on the height map as WOODS.WLD loads, so every reader sees the same water.
// Idempotent and pure.
import { PORT_CHANNELS, PORT_CHANNEL_BYTE } from './portChannelData.js';

const WIDTH = 1000, HEIGHT = 500;

/**
 * @param {Uint8Array} heightMap
 * @returns {number}
 */
export function applyPortChannels(heightMap) {
  if (!heightMap || heightMap.length < WIDTH * HEIGHT) return 0;
  let n = 0;
  for (const c of PORT_CHANNELS) {
    for (const [x, y] of c.pixels) {
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
      const i = y * WIDTH + x;
      if (heightMap[i] !== PORT_CHANNEL_BYTE) { heightMap[i] = PORT_CHANNEL_BYTE; n++; }
    }
  }
  return n;
}
