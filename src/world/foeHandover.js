import { FOES_FRAME_MAX } from '../net/wire.js';

// Splits a handover into frames within `FOES_FRAME_MAX` without splitting one enemy record. Every frame sets
// `full: 0` so the receiver keeps the enemies sent in the other frames.
export function foeHandoverFrames(frame, nextSequence) {
  if (!frame) return [];
  const frames = [];
  const make = (records, n) => {
    const ids = new Set(records.map(r => r.i));
    const data = { n, k: frame.k, full: 0, f: records };
    for (const key of ['st', 'qf', 'rz', 'cz']) {
      const tags = frame[key]?.filter(r => ids.has(r[0]));
      if (tags?.length) data[key] = tags;
    }
    for (const key of ['dz', 'al', 'cw']) {
      const tags = frame[key]?.filter(id => ids.has(id));
      if (tags?.length) data[key] = tags;
    }
    // Companion names are parallel to cp, so project the pair together.
    const companions = (frame.cp ?? []).map((id, i) => [id, frame.cn?.[i] ?? '']).filter(([id]) => ids.has(id));
    if (companions.length) { data.cp = companions.map(([id]) => id); data.cn = companions.map(([, name]) => name); }
    return data;
  };
  const fits = data => JSON.stringify({ t: 'foes', data }).length <= FOES_FRAME_MAX;
  let batch = [], n = nextSequence();
  for (const record of frame.f ?? []) {
    if (!record.e || record.it === undefined) continue;
    // An enemy record too large for one frame is skipped and stays with its original owner.
    if (!fits(make([record], n))) continue;
    if (batch.length && !fits(make([...batch, record], n))) {
      frames.push(make(batch, n)); batch = []; n = nextSequence();
    }
    batch.push(record);
  }
  if (batch.length) frames.push(make(batch, n));
  return frames;
}
