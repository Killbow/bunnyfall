// The hafted weapon family (Daggerfall 115, 124, 125, 126, 127, 128): one parameterized builder on the grip system.
import { loftPiece, shadePiece, compress, LEFT_FIST_X, GRIP_Y, SEAT_PITCH, TWO_HAND_GRIP_ROWS, pitchAbout } from './pieceLoft.js';

function buildHafted(ramp, spec) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 8 };
  const sR = spec.shaftR ?? 0.020;
  let gripLo;
  if (spec.twoHand) {
    gripLo = TWO_HAND_GRIP_ROWS[0].y;
    loftPiece(faces, TWO_HAND_GRIP_ROWS, { ...G, capTop: false, capBottom: false });
  } else {
    gripLo = 0.790;
    loftPiece(faces, [
      { y: 0.790, rx: 0.019, rz: 0.020 },
      { y: 0.900, rx: 0.021, rz: 0.022 },
      { y: 0.998, rx: 0.019, rz: 0.020 },
    ], { ...G, capTop: false, capBottom: false });
  }
  const bTop = spec.twoHand ? 1.058 : 0.998;
  loftPiece(faces, [
    { y: bTop, rx: sR + 0.003, rz: sR + 0.003 },
    { y: bTop + (spec.staffUp ?? 0.028), rx: spec.staffUp ? sR : 0.006, rz: spec.staffUp ? sR : 0.006 },
  ], G);
  const headY = gripLo - 0.02 - spec.shaft;
  loftPiece(faces, [
    { y: gripLo - 0.002, rx: sR, rz: sR },
    { y: headY + 0.02, rx: sR, rz: sR },
  ], { ...G, capTop: false, capBottom: false });
  if (spec.head === 'mace') {
    loftPiece(faces, [
      { y: headY + 0.02, rx: 0.022, rz: 0.022 },
      { y: headY - 0.02, rx: 0.070, rz: 0.070 },
      { y: headY - 0.12, rx: 0.078, rz: 0.078 },
      { y: headY - 0.17, rx: 0.026, rz: 0.026 },
    ], G);
  } else if (spec.head === 'axe' || spec.head === 'waraxe') {
    const sides = spec.head === 'waraxe' ? [0.082, -0.082] : [0.075];
    for (const off of sides) {
      loftPiece(faces, [
        { y: headY + 0.08, rx: 0.013, rz: 0.082, p: 0.5, cz: off * 0.45 },
        { y: headY - 0.03, rx: 0.016, rz: 0.140, p: 0.5, cz: off },
        { y: headY - 0.14, rx: 0.013, rz: 0.082, p: 0.5, cz: off * 0.45 },
      ], G);
    }
    loftPiece(faces, [
      { y: headY + 0.02, rx: 0.016, rz: 0.016 },
      { y: headY - 0.05, rx: 0.012, rz: 0.012 },
    ], G);
  } else if (spec.head === 'hammer') {
    loftPiece(faces, [
      { y: headY + 0.04, rx: 0.060, rz: 0.060, cz: 0.026 },
      { y: headY - 0.08, rx: 0.068, rz: 0.068, cz: 0.032 },
      { y: headY - 0.13, rx: 0.030, rz: 0.030, cz: 0.016 },
    ], G);
  } else if (spec.head === 'ball') {
    loftPiece(faces, [
      { y: headY + 0.02, rx: 0.009, rz: 0.009 },
      { y: headY - 0.10, rx: 0.009, rz: 0.009 },
    ], { ...G, capTop: false, capBottom: false });
    loftPiece(faces, [
      { y: headY - 0.10, rx: 0.016, rz: 0.016 },
      { y: headY - 0.16, rx: 0.055, rz: 0.055 },
      { y: headY - 0.22, rx: 0.018, rz: 0.018 },
    ], G);
  } else {
    loftPiece(faces, [
      { y: headY + 0.02, rx: sR + 0.002, rz: sR + 0.002 },
      { y: headY - 0.02, rx: 0.007, rz: 0.007 },
    ], G);
  }
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, SEAT_PITCH), ramp));
}

export const HAFTED_SPECS = {
  Mace:       { shaft: 0.44, head: 'mace' },
  Battle_Axe: { shaft: 0.56, head: 'axe' },
  Staff:      { shaft: 0.72, shaftR: 0.011, staffUp: 0.34, twoHand: true },
  Flail:      { shaft: 0.36, head: 'ball', twoHand: true },
  Warhammer:  { shaft: 0.62, head: 'hammer', twoHand: true },
  War_Axe:    { shaft: 0.64, head: 'waraxe', twoHand: true },
};

export function buildHaftedWeapon(ramp, name) {
  return buildHafted(ramp, HAFTED_SPECS[name]);
}
