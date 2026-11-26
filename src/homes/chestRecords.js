export const CHEST_MATCH_REACH = 0.5;

const r2 = (v) => Math.round(v * 100) / 100;

export function chestIdentity(chest, origin) {
  const m = chest?.matrix;
  return m ? { model: chest.modelIdNum, at: [r2(m[12] - origin[0]), r2(m[13] - origin[1]), r2(m[14] - origin[2])] } : {};
}

// A chest record names its chest by model and position, because a placement that fails to load shifts every index.
// Older records carry only their index and take a chest no named record has claimed.
export function matchChests(records, chests, origin) {
  const list = chests ?? [], out = new Map(), taken = new Set();
  const mine = (records ?? []).filter((c) => typeof c?.key === 'string' && c.key.startsWith('container:'));
  const named = (c) => c.model != null && Array.isArray(c.at);
  for (const c of mine) {
    if (!named(c)) continue;
    let best = null, bd = CHEST_MATCH_REACH ** 2;
    for (const t of list) {
      if (taken.has(t) || t.modelIdNum !== c.model || !t.matrix) continue;
      const d = (t.matrix[12] - origin[0] - c.at[0]) ** 2 + (t.matrix[13] - origin[1] - c.at[1]) ** 2 + (t.matrix[14] - origin[2] - c.at[2]) ** 2;
      if (d <= bd) { bd = d; best = t; }
    }
    if (best) { out.set(c, best); taken.add(best); }
  }
  for (const c of mine) {
    if (named(c)) continue;
    const t = list[+c.key.split(':')[1]];
    if (t && !taken.has(t)) { out.set(c, t); taken.add(t); }
  }
  return out;
}
