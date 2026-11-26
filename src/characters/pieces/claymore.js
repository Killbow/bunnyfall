// The Claymore (template 122, 2H): a greatsword on the Longsword's grip system, tagged 'armL'.
import { loftPiece, shadePiece, compress, LEFT_FIST_X, GRIP_Y, SEAT_PITCH, TWO_HAND_GRIP_ROWS, pitchAbout } from './pieceLoft.js';

export function buildClaymore(ramp) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 10 };
  loftPiece(faces, [
    { y: 1.058, rx: 0.016, rz: 0.016 },
    { y: 1.078, rx: 0.030, rz: 0.030 },
    { y: 1.104, rx: 0.022, rz: 0.022 },
  ], G);
  loftPiece(faces, TWO_HAND_GRIP_ROWS, { ...G, capTop: false, capBottom: false });
  loftPiece(faces, [
    { y: 0.694, rx: 0.018, rz: 0.118, p: 0.45 },
    { y: 0.724, rx: 0.020, rz: 0.126, p: 0.45 },
  ], G);
  loftPiece(faces, [
    { y: 0.694, rx: 0.010, rz: 0.036, p: 0.55 },
    { y: 0.420, rx: 0.0095, rz: 0.034, p: 0.55 },
    { y: 0.120, rx: 0.009, rz: 0.030, p: 0.55 },
    { y: -0.150, rx: 0.007, rz: 0.020, p: 0.55 },
    { y: -0.256, rx: 0.003, rz: 0.003, p: 0.55 },
  ], { ...G, capTop: false });
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, SEAT_PITCH), ramp));
}
