// @ts-check
// The mid-screen label holds one line and each write replaces it, so dungeon event lines go through this queue
// instead of writing the label directly.
import { courtSaySeconds } from './gateCourt.js';

export const SD_VOICE_RANK = Object.freeze({ turn: 0, note: 1, readout: 2 });
export const SD_VOICE_WAIT_MS = Object.freeze([8000, 8000, 5000]);
export const SD_VOICE_READ_MS = 1000;

/** @param {{ show: (text: string, seconds: number) => void, now: () => number, seconds?: (text: string) => number, covered?: () => boolean }} o */
export function createSdVoice({ show, now, seconds = courtSaySeconds, covered = () => false }) {
  let standing = null;
  /** @type {{ text: string, rank: number, at: number, key: string|null }[]} */
  const waiting = [];
  const put = (text, rank, t, key) => { show(text, seconds(text)); standing = { text, rank, until: t + seconds(text) * 1000, key }; };
  const back = (w, t) => {
    if (w.until - t < SD_VOICE_READ_MS || waiting.some((x) => x.text === w.text)) return;
    let i = 0;
    while (i < waiting.length && waiting[i].rank < w.rank) i++;
    waiting.splice(i, 0, { text: w.text, rank: w.rank, at: t, key: w.key });
  };
  // The label pauses while a window covers it, so the standing line and the turn and note waits pause too; readout
  // waits keep running in real time.
  let coveredAt = null;
  function pump(t) {
    if (covered()) { coveredAt ??= t; return; }
    if (coveredAt !== null) {
      if (standing) standing.until += t - coveredAt;
      for (const w of waiting) if (w.rank !== SD_VOICE_RANK.readout) w.at += t - Math.max(coveredAt, w.at);
      coveredAt = null;
      if (standing && waiting.length && waiting[0].rank < standing.rank) { back(standing, t); standing = null; }
    }
    if (standing && t < standing.until) return;
    standing = null;
    while (waiting.length) {
      const w = waiting.shift();
      if (t - w.at <= SD_VOICE_WAIT_MS[w.rank]) { put(w.text, w.rank, t, w.key); return; }
    }
  }
  return {
    say(text, rank = SD_VOICE_RANK.turn, key = null) {
      if (typeof text !== 'string' || !text) return;
      const r = Number.isInteger(rank) && rank >= 0 && rank < SD_VOICE_WAIT_MS.length ? rank : SD_VOICE_RANK.turn;
      const k = typeof key === 'string' && key ? key : null;
      const t = now();
      pump(t);
      if (coveredAt === null && (!standing || r < standing.rank || (k !== null && standing.key === k))) {
        if (k !== null) { const j = waiting.findIndex((w) => w.key === k); if (j >= 0) waiting.splice(j, 1); }
        if (standing && r < standing.rank && (k === null || standing.key !== k)) back(standing, t);
        put(text, r, t, k);
        return;
      }
      if (k !== null) {
        const j = waiting.findIndex((w) => w.key === k);
        if (j >= 0 && waiting[j].rank === r) { waiting[j] = { text, rank: r, at: t, key: k }; return; }
        if (j >= 0) waiting.splice(j, 1);
      }
      if (waiting.some((w) => w.text === text)) return;
      let i = waiting.length;
      while (i > 0 && waiting[i - 1].rank > r) i--;
      waiting.splice(i, 0, { text, rank: r, at: t, key: k });
    },
    frame() { pump(now()); },
    clear() { waiting.length = 0; },
    leave() { for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].rank !== SD_VOICE_RANK.turn) waiting.splice(i, 1); },
    waiting: () => waiting.map((w) => w.text),
  };
}
