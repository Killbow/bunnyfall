// Camera-frustum gate for melee hits.
export function makeInView(proj, view, multiply) {
  const pv = multiply(proj, view);
  return ([x, y, z]) => {
    const w = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
    if (w <= 0) return false;
    const nx = (pv[0] * x + pv[4] * y + pv[8] * z + pv[12]) / w;
    const ny = (pv[1] * x + pv[5] * y + pv[9] * z + pv[13]) / w;
    return nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1;
  };
}
