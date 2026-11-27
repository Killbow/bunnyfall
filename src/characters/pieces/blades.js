import { loftPiece, shadePiece, compress, LEFT_FIST_X, GRIP_Y, SEAT_PITCH, TWO_HAND_GRIP_ROWS, pitchAbout } from './pieceLoft.js';

function buildBlade(ramp, spec) {
  const faces = [];
  const G = { group: 'armL', cx: LEFT_FIST_X, seg: 8 };
  const gripR = spec.gripR ?? 0.018;
  let gripLo;
  if (spec.twoHand) {
    gripLo = TWO_HAND_GRIP_ROWS[0].y;
    loftPiece(faces, TWO_HAND_GRIP_ROWS, { ...G, capTop: false, capBottom: false });
    loftPiece(faces, [
      { y: 1.058, rx: 0.014, rz: 0.014 },
      { y: 1.082, rx: 0.038, rz: 0.038 },
      { y: 1.108, rx: 0.020, rz: 0.020 },
    ], G);
  } else {
    gripLo = spec.gripLo ?? 0.790;
    loftPiece(faces, [
      { y: gripLo, rx: gripR, rz: gripR + 0.001 },
      { y: 0.900, rx: gripR + 0.0015, rz: gripR + 0.0025 },
      { y: 0.998, rx: gripR, rz: gripR + 0.001 },
    ], { ...G, capTop: false, capBottom: false });
    loftPiece(faces, [
      { y: 0.998, rx: 0.010, rz: 0.010 },
      { y: 1.018, rx: spec.pommelR ?? 0.028, rz: spec.pommelR ?? 0.028 },
      { y: 1.042, rx: 0.014, rz: 0.014 },
    ], G);
  }
  loftPiece(faces, [
    { y: gripLo - 0.024, rx: spec.guardT, rz: spec.guardW, p: 0.45 },
    { y: gripLo - 0.002, rx: spec.guardT + 0.002, rz: spec.guardW + 0.004, p: 0.45 },
  ], G);
  const b0 = gripLo - 0.030, bl = spec.blade;
  const N = 7;
  const rows = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    rows.push({
      y: b0 - bl * t,
      rx: spec.thick * (1 - 0.45 * t),
      rz: spec.wRoot * (1 - t) + (spec.wTip ?? 0.010) * t,
      p: 0.55,
      cz: (spec.curve ?? 0) * Math.sin(Math.PI * t),
    });
  }
  rows.push({ y: b0 - bl - 0.028, rx: 0.003, rz: 0.003, p: 0.55, cz: 0 });
  loftPiece(faces, rows, G);
  return compress(shadePiece(pitchAbout(faces, GRIP_Y, SEAT_PITCH), ramp));
}

export const BLADE_SPECS = {
  Dagger:     { blade: 0.30, wRoot: 0.030, thick: 0.008, guardW: 0.036, guardT: 0.010, pommelR: 0.023, gripLo: 0.810, gripR: 0.016 },
  Tanto:      { blade: 0.34, wRoot: 0.026, thick: 0.008, guardW: 0.024, guardT: 0.020, pommelR: 0.019, gripLo: 0.800, gripR: 0.016 },
  Shortsword: { blade: 0.46, wRoot: 0.040, thick: 0.009, guardW: 0.052, guardT: 0.011 },
  Wakazashi:  { blade: 0.52, wRoot: 0.030, thick: 0.008, curve: 0.022, guardW: 0.030, guardT: 0.030, pommelR: 0.020 },
  Broadsword: { blade: 0.62, wRoot: 0.058, thick: 0.010, guardW: 0.066, guardT: 0.012 },
  Saber:      { blade: 0.74, wRoot: 0.034, thick: 0.008, curve: 0.050, guardW: 0.048, guardT: 0.013 },
  Katana:     { blade: 0.80, wRoot: 0.030, thick: 0.008, curve: 0.035, guardW: 0.032, guardT: 0.032, pommelR: 0.019, gripLo: 0.760 },
  Dai_Katana: { blade: 1.05, wRoot: 0.034, thick: 0.009, curve: 0.050, guardW: 0.040, guardT: 0.040, twoHand: true },
};

export function buildBladeWeapon(ramp, name) {
  return buildBlade(ramp, BLADE_SPECS[name]);
}
