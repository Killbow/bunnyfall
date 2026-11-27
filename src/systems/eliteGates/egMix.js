// @ts-check
import { BOSS_CUES } from '../../world/gateBoss.js';
import { setPeerSoundScope } from '../../net/peerFx.js';

export const EG_MIX = Object.freeze({ duckDb: 6, duckMs: 300, addGapMs: 1500, barksPerKind: 4, peerDb: -4, watchfirePitch: 1.4 });
export const egDbGain = (db) => 10 ** (db / 20);
export const EG_CRITICAL = Object.freeze(['sting', 'windup', 'release', 'check']);

export const egStingWanted = (kind, now, lastAddAt = -Infinity) => kind === 'lord' || kind === 'check' || (kind === 'add' && now - lastAddAt >= EG_MIX.addGapMs);

export function egBarkCull(barks, ear, per = EG_MIX.barksPerKind) {
  const d2 = (b) => (ear && b.at ? (b.at[0] - ear[0]) ** 2 + (b.at[1] - ear[1]) ** 2 + (b.at[2] - ear[2]) ** 2 : 0);
  const sorted = [...barks].sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || d2(a) - d2(b));
  const n = new Map(), out = [];
  for (const b of sorted) {
    const k = n.get(b.kind) ?? 0;
    if (k >= per && !b.critical) continue;
    n.set(b.kind, k + 1);
    out.push(b);
  }
  return out;
}

export const EG_TELL_CUE = Object.freeze({ clip: BOSS_CUES.sting.clip, pitch: EG_MIX.watchfirePitch, volume: BOSS_CUES.sting.volume, reach: BOSS_CUES.sting.reach });

/** @param {{ audio?: any, music?: any, now?: () => number }} deps */
export function createSpireMix({ audio = null, music = null, now = () => Date.now() } = {}) {
  let lastAdd = -Infinity, stings = 0, ducks = 0, tells = 0, peersOn = false;
  const mix = {
    critical() { ducks++; try { music?.duck?.(EG_MIX.duckDb, EG_MIX.duckMs / 1000); } catch { } },
    sting(kind, at) {
      const t = now();
      if (!egStingWanted(kind, t, lastAdd)) return false;
      if (kind === 'add') lastAdd = t;
      stings++;
      const c = BOSS_CUES.sting;
      try { if (at) audio?.play3d?.(c.clip, at, c.volume, { maxDistance: c.reach, distanceModel: 'linear', pitch: c.pitch }); } catch { }
      mix.critical();
      return true;
    },
    barks(list, ear, play) {
      if (!list.length) return 0;
      const kept = egBarkCull(list, ear);
      for (const b of kept) { try { play(b); } catch { } if (b.critical) mix.critical(); }
      return kept.length;
    },
    beat(S) {
      if (!S || !Number.isInteger(S.rec)) return false;
      let played = false;
      try { if (audio?.playOneShot) { audio.playOneShot(S.rec, S.vol ?? 1, S.pitch ?? 1); played = true; } } catch { }
      mix.critical();
      return played;
    },
    peerVolume: (v) => v * egDbGain(EG_MIX.peerDb),
    // `setPeerSoundScope` sets one global scope for every peer sound; passing null restores full peer volume.
    peers(on) {
      const want = !!on;
      if (want === peersOn) return peersOn;
      peersOn = want;
      setPeerSoundScope(want ? (run) => (typeof audio?.scaled === 'function' ? audio.scaled(mix.peerVolume(1), run) : run()) : null);
      return peersOn;
    },
    tell(at) {
      if (!at || !audio?.play3d) return false;
      tells++;
      try { audio.play3d(EG_TELL_CUE.clip, at, EG_TELL_CUE.volume, { maxDistance: EG_TELL_CUE.reach, distanceModel: 'linear', pitch: EG_TELL_CUE.pitch }); } catch { }
      return true;
    },
    stats: () => ({ stings, ducks }),
    heard: () => ({ tells, peers: peersOn }),
  };
  return mix;
}
