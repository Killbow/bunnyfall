// @ts-check
// The Tamriel frame: one grid that holds the whole continent, with Daggerfall's 1000 x 500 map inside it.
// A Tamriel pixel is 819.2 m like a Bay pixel, so the Bay maps to Tamriel by one offset (BAY_ORIGIN), no scale.
// The continent is authored on the 320 x 200 picture grid; every consumer converts through the functions below.

import { MAP_WIDTH, MAP_HEIGHT } from '../formats/woodsFile.js';
export const PICTURE_W = 320;
export const PICTURE_H = 200;
export const PIXELS_PER_PICTURE_UNIT = 18.75;
export const TAMRIEL_W = PICTURE_W * PIXELS_PER_PICTURE_UNIT;
export const TAMRIEL_H = PICTURE_H * PIXELS_PER_PICTURE_UNIT;
export const BAY_W = MAP_WIDTH;
export const BAY_H = MAP_HEIGHT;
export const BAY_ORIGIN = Object.freeze({ x: 862, y: 975 });

let _fit = { ox: BAY_ORIGIN.x, oy: BAY_ORIGIN.y, ppu: PIXELS_PER_PICTURE_UNIT };
export function setTamrielFit(fit) {
  _fit = fit && Number.isFinite(fit.ox) && Number.isFinite(fit.oy) && fit.ppu > 0
    ? { ox: fit.ox, oy: fit.oy, ppu: fit.ppu }
    : { ox: BAY_ORIGIN.x, oy: BAY_ORIGIN.y, ppu: PIXELS_PER_PICTURE_UNIT };
}
export const tamrielFit = () => _fit;
export const tamrielSize = () => ({ w: PICTURE_W * _fit.ppu, h: PICTURE_H * _fit.ppu });

export const KM_PER_PIXEL = 0.8192;

export function bayToTamriel(x, y) {
  return [x + _fit.ox, y + _fit.oy];
}
export function tamrielToBay(tx, ty) {
  return [tx - _fit.ox, ty - _fit.oy];
}
export function pictureToBay(px, py) {
  return [px * _fit.ppu - _fit.ox, py * _fit.ppu - _fit.oy];
}
export function bayToPicture(x, y) {
  return [(x + _fit.ox) / _fit.ppu, (y + _fit.oy) / _fit.ppu];
}
export function inBay(x, y) {
  return x >= 0 && y >= 0 && x < BAY_W && y < BAY_H;
}
export function bayPictureRect() {
  const [x0, y0] = bayToPicture(0, 0);
  const [x1, y1] = bayToPicture(BAY_W, BAY_H);
  return { x0, y0, x1, y1 };
}
export function tamrielFrameInBay() {
  const [x0, y0] = tamrielToBay(0, 0);
  const { w, h } = tamrielSize();
  return { x0, y0, w, h };
}
export const pixelsToKm = (px) => px * KM_PER_PIXEL;
