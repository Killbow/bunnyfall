// @ts-check

export const EG_REVERB_PRESETS = Object.freeze({ cave: 'Cave', stoneroom: 'Stoneroom', quarry: 'Quarry' });
export const EG_REVERB_OPEN = 'Quarry';
export const EG_REVERB_FADE_S = 0.4;
export const EG_REVERB_HYST_M = 1;
export const EG_REVERB_OWNER = 'eg:spire';

export const egReverbPreset = (name) => (typeof name === 'string' ? EG_REVERB_PRESETS[name.toLowerCase()] ?? null : null);

/** @param {any} spec */
export function egHallReverb(spec) {
  const zones = [];
  for (const f of spec?.frags ?? []) {
    const preset = egReverbPreset(f.reverb);
    if (!preset) continue;
    const cave = f.cls === 'passage' ? (spec.caves ?? []).find((q) => Math.abs(q.x - f.x) < 0.5 && q.z0 <= f.z0 + 0.5 && q.z1 >= f.z1 - 0.5) : null;
    const hero = f.hero ? (spec.heroes ?? []).find((q) => q.f === spec.frags.indexOf(f)) : null;
    const half = hero ? Math.max(f.x - hero.box[0], hero.box[3] - f.x) : cave ? cave.halfW : f.cls === 'chamber' ? (f.z1 - f.z0) / 2 : 6;
    zones.push({ x: f.x, half, z0: f.z0, z1: f.z1, preset });
  }
  const second = zones.find((q) => q.preset !== EG_REVERB_OPEN)?.preset ?? null;
  return { base: EG_REVERB_OPEN, zones, second };
}

/**
 * @param {ReadonlyArray<{ x: number, half: number, z0: number, z1: number }>} zones
 * @param {number} x
 * @param {number} z
 * @param {number} [cur]
 * @param {number} [hyst]
 */
export function egReverbZoneAt(zones, x, z, cur = -1, hyst = EG_REVERB_HYST_M) {
  const inside = (q, pad) => z >= q.z0 - pad && z <= q.z1 + pad && Math.abs(x - q.x) <= q.half + pad;
  if (cur >= 0 && zones[cur] && inside(zones[cur], hyst)) return cur;
  for (let i = 0; i < zones.length; i++) if (inside(zones[i], 0)) return i;
  return -1;
}

/** @param {{ audio?: any }} deps */
export function createEgReverb({ audio = null } = {}) {
  let held = false, key = '', plan = null, cur = -1, fades = 0, builds = 0;
  const api = {
    hold() {
      if (held) return true;
      held = !!audio?.holdReverb?.(EG_REVERB_OWNER);
      return held;
    },
    hall(k, spec) {
      if (!held || !spec || k === key) return false;
      key = k; plan = egHallReverb(spec); cur = -1;
      builds++;
      let made = true;
      try { made = audio?.reverbZone?.(plan.base, plan.second) !== false; } catch { made = false; }
      // Without an audio context (no user gesture yet) `reverbZone` fails, so clearing `key` retries the hall next
      // frame.
      if (!made) key = '';
      return made;
    },
    at(x, z) {
      if (!held || !plan || !Number.isFinite(x) || !Number.isFinite(z)) return false;
      const i = egReverbZoneAt(plan.zones, x, z, cur);
      if (i === cur) return false;
      cur = i;
      fades++;
      try { audio?.reverbFade?.(i < 0 ? plan.base : plan.zones[i].preset, EG_REVERB_FADE_S); } catch { }
      return true;
    },
    release() {
      const was = held;
      if (held) { try { audio?.releaseReverb?.(EG_REVERB_OWNER); } catch { } }
      held = false; key = ''; plan = null; cur = -1;
      return was;
    },
    state: () => ({ held, key, zone: cur, preset: plan ? (cur < 0 ? plan.base : plan.zones[cur].preset) : null, fades, builds }),
  };
  return api;
}
