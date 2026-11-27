// Pauldrons (105 left, 106 right): standoff plate caps over each deltoid, tagged armL and armR.
import { loftPiece, shadePiece, compress } from './pieceLoft.js';

const SH_X = 0.235;

export function buildPauldrons(ramp) {
  const faces = [];
  const P = 0.6;
  const cap = (sign) => loftPiece(faces, [
    { y: 1.680, rx: 0.072, rz: 0.078, p: P },
    { y: 1.635, rx: 0.118, rz: 0.118, p: P },
    { y: 1.570, rx: 0.108, rz: 0.104, p: P },
    { y: 1.520, rx: 0.082, rz: 0.080, p: P },
  ], { cx: sign * SH_X, group: sign < 0 ? 'armL' : 'armR', seg: 20 });
  cap(-1); cap(1);
  compress(faces);
  return shadePiece(faces, ramp);
}
