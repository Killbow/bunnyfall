// @ts-check
// Wall of Earth's three sounds (earthRise, earthSettle, earthSlide) are built at runtime by systems/soundRemix.js from
// DAGGER.SND records 24 and 68 and the Immersive Footsteps clips Bunnyfall ships. The clip gains and lengths were
// measured with ffmpeg, and scatter() replays the approved remix's seeded grains, so keep its order of rnd() calls.
import { remixSounds, WORK_RATE } from '../soundRemix.js';
import { seededRng } from '../wind/wind.js';

const CLIP_GAIN_DB = { land1: 17, g1: 30.8, g2: 27, g3: 21, g4: 27, g5: 29, g6: 24.9, p1: 31, p2: 29, p3: 27, p4: 31, p5: 25, p6: 27.1 };
const CLIP_S = { g1: 0.329138, g2: 0.264104, g3: 0.342404, g4: 0.405215, g5: 0.345941, g6: 0.312313, p1: 0.271315, p2: 0.272494, p3: 0.292472, p4: 0.206236, p5: 0.3022, p6: 0.267937 };
const clipName = (n) => (n === 'land1' ? 'HQ_Unarmored_Hard_Landing_1' : `HQ_${n[0] === 'g' ? 'Gravel' : 'Path'}_Footstep_${n[1]}`);
const ALL = Object.keys(CLIP_S), GRAVEL = ALL.slice(0, 6);

const f3 = (x) => +x.toFixed(3);
function scatter(rnd, [filter, pool, count, t0, t1, { dur, rate, gain, attack = 0.003, warp = (u) => u }]) {
  const rr = ([a, b]) => a + (b - a) * rnd();
  return Array.from({ length: count }, (_, k) => {
    const u = (k + rnd() * 0.9) / count, name = pool[Math.floor(rnd() * pool.length)], d = rr(dur);
    const start = rr([0.01, Math.max(0.011, CLIP_S[name] - d - 0.01)]), speed = rr(rate), len = d / speed, fo = f3(len * 0.4);
    return [name, Math.round(f3(t0 + warp(u) * (t1 - t0)) * 1000), f3(gain(u)),
      `atrim=${f3(start)}:${f3(start + d)},asetrate=${Math.round(WORK_RATE * speed)},afade=t=in:d=${attack},afade=t=out:st=${f3(len - fo)}:d=${fo},${filter}`];
  });
}
function withGrains({ seed, grains, ...r }) {
  const rnd = seededRng(seed);
  return { ...r, layers: [...r.layers, ...grains.flatMap((g) => scatter(rnd, g))] };
}

const EARTH_WALL = {
  records: { snd24: 24, snd68: 68 },
  clips: Object.fromEntries(Object.entries(CLIP_GAIN_DB).map(([n, db]) => [n, [clipName(n), db]])),
  recipes: {
    earthRise: withGrains({
      len: 1.4, peak: 0.89, seed: 101,
      layers: [['land1', 0, 1, 'asetrate=22050,lowpass=f=1200'], ['snd24', 20, 0.75, 'atrim=0:0.8,asetrate=27342,lowpass=f=2500,afade=t=out:st=0.95:d=0.34']],
      grains: [['lowpass=f=3500', ALL, 16, 0.06, 0.85, { dur: [0.12, 0.25], rate: [0.65, 0.85], gain: (u) => 0.95 - 0.6 * u }],
        ['highpass=f=600', GRAVEL, 9, 0.75, 1.3, { dur: [0.04, 0.09], rate: [1.0, 1.25], gain: (u) => 0.3 - 0.18 * u }]],
      synth: (t) => 0.45 * Math.sin(2 * Math.PI * (40 * t + 22 * 0.12 * (1 - Math.exp(-t / 0.12)))) * (Math.min(1, t / 0.008) * Math.exp(-t / 0.3)),
      post: 'acompressor=threshold=0.15:ratio=3:attack=4:release=150:makeup=1.5,highpass=f=28,afade=t=out:st=1.15:d=0.25',
    }),
    earthSettle: withGrains({
      len: 2, peak: 0.334, seed: 1004,
      layers: [['snd68', 1100, 0.45, 'asetrate=22050,lowpass=f=320,afade=t=in:d=0.9:curve=qsin']],
      grains: [['lowpass=f=2200', ALL, 22, 0.1, 1.9, { dur: [0.04, 0.1], rate: [0.75, 1.1], gain: (u) => 0.2 + 0.35 * u, attack: 0.01, warp: (u) => Math.pow(u, 0.5) }]],
      post: 'acompressor=threshold=0.1:ratio=2:attack=5:release=150:makeup=1.2,highpass=f=40,lowpass=f=3500,afade=t=out:st=1.85:d=0.15',
    }),
    earthSlide: withGrains({
      len: 1.9, peak: 0.89, seed: 808,
      layers: [['snd68', 0, 0.6, 'asetrate=22050,lowpass=f=320']],
      grains: [['lowpass=f=1800', ALL, 40, 0.0, 1.55, { dur: [0.1, 0.22], rate: [0.55, 0.75], gain: (u) => 0.25 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.15)), attack: 0.02 }]],
      post: 'afade=t=in:d=0.5:curve=tri,afade=t=out:st=1.03:d=0.85:curve=tri,acompressor=threshold=0.07:ratio=4:attack=15:release=200:makeup=2,highpass=f=35,lowpass=f=2400',
    }),
  },
};

export const loadEarthWallSounds = (io) => remixSounds(EARTH_WALL, io);
