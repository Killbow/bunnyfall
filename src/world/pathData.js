// @ts-check
import { MAP_W, MAP_H } from './roadNetwork.js';

export const PATH_ROADS = 0;
export const PATH_TRACKS = 1;
export const PATH_RIVERS = 2;
export const PATH_STREAMS = 3;
export const PATH_KEYS = Object.freeze(['roads', 'tracks', 'rivers', 'streams']);

export const N = 128;
export const NE = 64;
export const E = 32;
export const SE = 16;
export const S = 8;
export const SW = 4;
export const W = 2;
export const NW = 1;

export const DIRECTIONS = Object.freeze([N, NE, E, SE, S, SW, W, NW]);

export const MP_WORLD_UNITS = 32768;
export const HALF_MP_WORLD_UNITS = MP_WORLD_UNITS / 2;
export const T_SIZE = MP_WORLD_UNITS / 128;
export const P_SIZE = T_SIZE * 2;

export function pathsDataPoint(net, mapPixelX, mapPixelY) {
  return (dataPoint(net, PATH_ROADS, mapPixelX, mapPixelY) | dataPoint(net, PATH_TRACKS, mapPixelX, mapPixelY)) & 0xff;
}

export function roadsDataPoint(net, mapPixelX, mapPixelY) {
  return dataPoint(net, PATH_ROADS, mapPixelX, mapPixelY);
}

export function dataPoint(net, pathType, mapPixelX, mapPixelY) {
  if (!net) return 0;
  if (mapPixelX < 0 || mapPixelY < 0 || mapPixelX >= MAP_W || mapPixelY >= MAP_H) return 0;
  const arr = net[PATH_KEYS[pathType]];
  if (!arr) return 0;
  return arr[mapPixelX + (mapPixelY * MAP_W)] & 0xff;
}
