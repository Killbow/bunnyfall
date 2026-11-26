import { loftPiece, shadePiece, compress, LEFT_FIST_X, GRIP_Y, pitchAbout } from './pieceLoft.js';

const GRIP_PITCH = -Math.PI / 2;
const NOCK_CZ = 0.30;

function buildBow(ramp, half) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 8 };
  const lo = GRIP_Y - half, hi = GRIP_Y + half;
  const limb = (t) => -0.05 + 0.082 * Math.sin(Math.PI * t);
  const rows = [];
  const N = 8;
  for (let k = 0; k <= N; k++) {
    const t = k / N, y = lo + (hi - lo) * t;
    const taper = 0.009 + 0.016 * Math.sin(Math.PI * t);
    rows.push({ y, rx: taper, rz: taper + 0.004, cz: limb(t) });
  }
  rows.push({ y: GRIP_Y, rx: 0.028, rz: 0.032, cz: limb(0.5) });
  loftPiece(faces, rows, G);
  loftPiece(faces, [
    { y: lo + 0.012, rx: 0.0035, rz: 0.0035, cz: -0.05 },
    { y: GRIP_Y - 0.02, rx: 0.0035, rz: 0.0035, cz: NOCK_CZ - 0.012 },
  ], { ...G, seg: 6, capTop: false, capBottom: false });
  loftPiece(faces, [
    { y: GRIP_Y + 0.02, rx: 0.0035, rz: 0.0035, cz: NOCK_CZ - 0.012 },
    { y: hi - 0.012, rx: 0.0035, rz: 0.0035, cz: -0.05 },
  ], { ...G, seg: 6, capTop: false, capBottom: false });
  loftPiece(faces, [
    { y: GRIP_Y - 0.012, rx: 0.007, rz: 0.007, cz: NOCK_CZ },
    { y: GRIP_Y + 0.012, rx: 0.007, rz: 0.007, cz: NOCK_CZ },
  ], { ...G, seg: 8, capTop: true, capBottom: true });
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, GRIP_PITCH), ramp));
}

export function buildNockedArrow(ramp) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 6 };
  loftPiece(faces, [
    { y: GRIP_Y - 0.24, rx: 0.002, rz: 0.002 },
    { y: GRIP_Y - 0.20, rx: 0.013, rz: 0.013 },
    { y: GRIP_Y - 0.19, rx: 0.0045, rz: 0.0045 },
    { y: GRIP_Y + 0.19, rx: 0.0045, rz: 0.0045 },
    { y: GRIP_Y + 0.20, rx: 0.012, rz: 0.012 },
    { y: GRIP_Y + 0.27, rx: 0.012, rz: 0.012 },
    { y: GRIP_Y + NOCK_CZ - 0.01, rx: 0.004, rz: 0.004 },
  ], { ...G, seg: 6 });
  pitchAbout(faces, GRIP_Y, Math.PI / 2);
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, GRIP_PITCH), ramp));
}

export function buildLongBow(ramp) { return buildBow(ramp, 0.62); }
export function buildShortBow(ramp) { return buildBow(ramp, 0.44); }
