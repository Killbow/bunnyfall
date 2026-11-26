// The Longsword, held in the rig's left fist and tagged 'armL' so it follows the arm.
import { loftPiece, shadePiece, compress, LEFT_FIST_X, GRIP_Y, SEAT_PITCH, pitchAbout } from './pieceLoft.js';

export function buildSword(ramp) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 10 };
  loftPiece(faces, [
    { y: 0.998, rx: 0.014, rz: 0.014 },
    { y: 1.018, rx: 0.024, rz: 0.024 },
    { y: 1.042, rx: 0.018, rz: 0.018 },
  ], G);
  loftPiece(faces, [
    { y: 0.790, rx: 0.021, rz: 0.022 },
    { y: 0.900, rx: 0.023, rz: 0.024 },
    { y: 0.998, rx: 0.021, rz: 0.022 },
  ], { ...G, capTop: false, capBottom: false });
  loftPiece(faces, [
    { y: 0.766, rx: 0.015, rz: 0.084, p: 0.45 },
    { y: 0.792, rx: 0.017, rz: 0.090, p: 0.45 },
  ], G);
  loftPiece(faces, [
    { y: 0.766, rx: 0.009, rz: 0.030, p: 0.55 },
    { y: 0.560, rx: 0.0085, rz: 0.028, p: 0.55 },
    { y: 0.340, rx: 0.008, rz: 0.024, p: 0.55 },
    { y: 0.150, rx: 0.006, rz: 0.016, p: 0.55 },
    { y: 0.068, rx: 0.003, rz: 0.003, p: 0.55 },
  ], { ...G, capTop: false });
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, SEAT_PITCH), ramp));
}
