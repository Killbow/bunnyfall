// Cuirass (chest armor): plate on the neutral rig with a neckline, pauldron shelf, and hem.
import { loftPiece, shadePiece, compress, STEEL_RAMP } from './pieceLoft.js';

export function buildCuirass(ramp) {
  const faces = [];
  const P = 0.62, seg = 28;
  loftPiece(faces, [
    { y: 1.605, rx: 0.190, rz: 0.098, p: P },
    { y: 1.560, rx: 0.232, rz: 0.116, p: P },
    { y: 1.480, rx: 0.236, rz: 0.120, p: P },
    { y: 1.380, rx: 0.220, rz: 0.114, p: P },
    { y: 1.270, rx: 0.192, rz: 0.100, p: P },
    { y: 1.180, rx: 0.178, rz: 0.094, p: P },
    { y: 1.120, rx: 0.198, rz: 0.104, p: P },
  ], { seg, group: 'body' });
  compress(faces);
  return shadePiece(faces, ramp);
}
export { STEEL_RAMP };
