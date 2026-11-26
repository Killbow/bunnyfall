// Helm (107): a rounded dome with two cheek guards, tagged 'head'.
import { loftPiece, shadePiece, compress } from './pieceLoft.js';

export function buildHelm(ramp) {
  const faces = [];
  const P = 0.78;
  loftPiece(faces, [
    { y: 2.070, rx: 0.052, rz: 0.058, p: P, cz: -0.012 },
    { y: 2.010, rx: 0.108, rz: 0.122, p: P, cz: -0.016 },
    { y: 1.945, rx: 0.140, rz: 0.152, p: P, cz: -0.014 },
    { y: 1.885, rx: 0.144, rz: 0.156, p: P, cz: -0.008 },
    { y: 1.855, rx: 0.140, rz: 0.150, p: P, cz: -0.004 },
  ], { group: 'head', seg: 26, capBottom: false });

  const cheeks = [
    { y: 1.855, rx: 0.142, rz: 0.150, p: P, cz: -0.004 },
    { y: 1.790, rx: 0.140, rz: 0.146, p: P, cz: 0 },
    { y: 1.740, rx: 0.132, rz: 0.138, p: P, cz: 0.004 },
  ];
  loftPiece(faces, cheeks, { group: 'head', seg: 8, arc: [-0.6, 0.6] });
  loftPiece(faces, cheeks, { group: 'head', seg: 8, arc: [Math.PI - 0.6, Math.PI + 0.6] });

  compress(faces);
  return shadePiece(faces, ramp);
}
