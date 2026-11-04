// @ts-check
// BUNNYFALL (PORT-CHANNELS, 2026-11-04): THE PORTS' RIVERS AND INLETS, APPLIED. world/portChannelData.js (made by
// tools/portChannels.mjs) names the map pixels to make water so an inland port has a short way to the open sea; this lays
// them on the height map as WOODS.WLD loads (formats/woodsFile.js), so every reader of the map - the host, the terrain
// workers, the Deep Waters bake, the port law's open sea - sees the same water. Idempotent. Pure.
import { PORT_CHANNELS, PORT_CHANNEL_BYTE } from './portChannelData.js';

/** The map's width in pixels (WoodsFile's MAP_WIDTH) - a literal here so this stays a leaf of the file reader. */
const WIDTH = 1000, HEIGHT = 500;

/** Set every channel pixel of `heightMap` (WOODS.WLD's 1000x500 bytes) to the channel's sea-level byte.
 *  @param {Uint8Array} heightMap @returns {number} how many pixels it changed */
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
