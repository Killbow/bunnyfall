// @ts-check
// Runtime sound recipes (`meteorFall`, `meteorImpact`) for Meteor, mixed by `systems/soundRemix.js` from DAGGER.SND
// records; `METEOR_PICK` selects the active candidate from `METEOR_CANDIDATES` for each sound.
import { remixSounds, WORK_RATE } from '../audio/soundRemix.js';

const RECORDS = {
  fireDaemon: 11, bodyFall: 15, doorBash: 7, doorClose: 24, windMoan: 65, windDeep: 66, grind: 68, windBlow: 70,
  castSpell4: 84, fireHit: 89, fallHard: 92, swingLow: 105, lightning: 348, thunder: 349, thunderRoll: 350, burning: 420,
};
const f3 = (x) => +x.toFixed(3);
const rate = (speed) => `asetrate=${Math.round(WORK_RATE * speed)}`;

function rising(src, n, t0, t1, { dur, at = 0.1, speed, gain, filter }) {
  return Array.from({ length: n }, (_, k) => {
    const u = n > 1 ? k / (n - 1) : 0, s = speed[0] + (speed[1] - speed[0]) * u, len = f3(dur / s), fo = f3(len * 0.45);
    return [src, Math.round((t0 + (t1 - t0) * u) * 1000), f3(gain[0] + (gain[1] - gain[0]) * u),
      `atrim=${f3(at + 0.05 * k)}:${f3(at + 0.05 * k + dur)},${rate(s)},afade=t=in:d=${f3(len * 0.4)},afade=t=out:st=${f3(len - fo)}:d=${fo},${filter}`];
  });
}
function rubble(sources, n, t0, t1, gain) {
  return Array.from({ length: n }, (_, k) => {
    const u = k / n, src = sources[k % sources.length], s = 1.1 + ((k * 7) % 5) * 0.15, start = f3(((k * 3) % 4) * 0.02);
    return [src, Math.round((t0 + (t1 - t0) * u ** 1.6) * 1000), f3(gain * (1 - 0.75 * u)),
      `atrim=${start}:${f3(start + 0.12)},${rate(s)},afade=t=out:st=${f3(0.06 / s)}:d=${f3(0.06 / s)},highpass=f=350,lowpass=f=3200`];
  });
}

export const METEOR_CANDIDATES = {
  fallWhistle: {
    len: 1.15, peak: 0.8,
    layers: [...rising('windMoan', 12, 0, 0.85, { dur: 0.3, speed: [1, 2.4], gain: [0.15, 1], filter: 'highpass=f=300,lowpass=f=5000' }),
      ['swingLow', 820, 0.7, `${rate(0.7)},lowpass=f=2500`]],
    post: 'acompressor=threshold=0.2:ratio=3:attack=5:release=120:makeup=1.4,afade=t=out:st=1.02:d=0.13',
  },
  fallRoar: {
    len: 1.15, peak: 0.85,
    layers: [...rising('fireDaemon', 10, 0, 0.85, { dur: 0.35, at: 0.2, speed: [0.55, 1], gain: [0.15, 1], filter: 'lowpass=f=1800' }),
      ['burning', 200, 0.5, `atrim=0:1,${rate(0.8)},lowpass=f=1200,afade=t=in:d=0.8:curve=qsin`],
      ['windDeep', 0, 0.6, `atrim=0.3:1.5,lowpass=f=600,afade=t=in:d=0.9`]],
    post: 'acompressor=threshold=0.2:ratio=3:attack=5:release=120:makeup=1.3,highpass=f=40,afade=t=out:st=1.02:d=0.13',
  },
  fallRush: {
    len: 1.15, peak: 0.8,
    layers: [['castSpell4', 0, 0.8, `atrim=0:1.2,${rate(0.55)},lowpass=f=2200,afade=t=in:d=1:curve=qsin`],
      ...rising('windBlow', 10, 0, 0.85, { dur: 0.3, at: 1, speed: [1.2, 2.6], gain: [0.1, 0.9], filter: 'highpass=f=500' })],
    post: 'acompressor=threshold=0.2:ratio=3:attack=5:release=120:makeup=1.3,afade=t=out:st=1.02:d=0.13',
  },
  impactThunder: {
    len: 2.4, peak: 0.95,
    layers: [['thunderRoll', 0, 1, `atrim=0:2.4,${rate(0.6)},lowpass=f=700,afade=t=out:st=1.4:d=1`],
      ['doorClose', 0, 0.9, `${rate(0.55)},lowpass=f=900`],
      ...rubble(['doorClose', 'doorBash', 'bodyFall'], 22, 0.04, 1.1, 0.5)],
    post: 'acompressor=threshold=0.15:ratio=3:attack=3:release=200:makeup=1.6,highpass=f=30,afade=t=out:st=2.1:d=0.3',
  },
  impactCrack: {
    len: 2.4, peak: 0.95,
    layers: [['lightning', 0, 0.8, `atrim=0:0.5,${rate(0.7)},lowpass=f=2500,afade=t=out:st=0.4:d=0.3`],
      ['thunder', 40, 1, `atrim=0:2.4,${rate(0.7)},lowpass=f=600,afade=t=out:st=1.5:d=0.9`],
      ['fireHit', 0, 0.7, `${rate(0.5)},lowpass=f=1200`],
      ...rubble(['doorBash', 'bodyFall', 'fallHard'], 20, 0.05, 1, 0.45)],
    post: 'acompressor=threshold=0.15:ratio=3:attack=3:release=200:makeup=1.5,highpass=f=30,afade=t=out:st=2.1:d=0.3',
  },
  impactSlam: {
    len: 2.4, peak: 0.95,
    layers: [['fireHit', 0, 1, `${rate(0.45)},lowpass=f=900`],
      ['doorBash', 0, 0.8, `${rate(0.5)},lowpass=f=1500`],
      ['bodyFall', 30, 0.7, `${rate(0.6)},lowpass=f=1200`],
      ['grind', 250, 0.5, `${rate(0.6)},lowpass=f=500,afade=t=out:st=1.2:d=0.8`],
      ...rubble(['doorClose', 'doorBash', 'bodyFall', 'fallHard'], 24, 0.03, 1.2, 0.5)],
    post: 'acompressor=threshold=0.15:ratio=3:attack=3:release=200:makeup=1.6,highpass=f=30,afade=t=out:st=2.1:d=0.3',
  },
};
export const METEOR_PICK = { meteorFall: 'fallRush', meteorImpact: 'impactThunder' };

export const meteorSpec = (pick) => ({ records: RECORDS, clips: {}, recipes: Object.fromEntries(Object.entries(pick).map(([k, c]) => [k, METEOR_CANDIDATES[c]])) });
const METEOR = meteorSpec(METEOR_PICK);

export const loadMeteorSounds = (io) => remixSounds(METEOR, io);
