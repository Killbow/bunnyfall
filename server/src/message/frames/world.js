import { isWorldRoom, byteGate, FOES_ROOM_BYTES_PER_S, worldFrameMaxFor, WORLD_MIN_MS, WORLD_CHUNK } from '../../relay.js';
import { WORLD_META, worldChunkKey } from '../../room/keys.js';

export async function worldFrame(ws, a, m, message, doored) {
  const now = Date.now();
  if (doored !== 'world') { a = this._meter(ws, a, now); if (!a) return; }
  if (!isWorldRoom(a.key) || a.id !== this._hostOf()) return;
  if (message.length > worldFrameMaxFor(a.key)) return;
  const old = await this.state.storage.get(WORLD_META);
  const final = m.final && !a.finalUsed;
  if (!final && old && old.by === a.id && now - old.at < WORLD_MIN_MS) return;
  if (final) this._setAttach(ws, { ...a, finalUsed: true });
  const raw = JSON.stringify(m.data);
  const chunks = Math.max(1, Math.ceil(raw.length / WORLD_CHUNK));
  const puts = {};
  for (let i = 0; i < chunks; i++) puts[worldChunkKey(i)] = raw.slice(i * WORLD_CHUNK, (i + 1) * WORLD_CHUNK);
  puts[WORLD_META] = { chunks, size: raw.length, at: now, by: a.id };
  // Issue the world put and the stale-tail delete with no await between, so the runtime
  // coalesces them into one write and a crash leaves no orphan chunk.
  const ops = [this.state.storage.put(puts)];
  if (old && old.chunks > chunks) ops.push(this.state.storage.delete(Array.from({ length: old.chunks - chunks }, (_, i) => worldChunkKey(chunks + i))));
  await Promise.all(ops);
  this._worldMemo = raw;
  const unseen = [...this._all()].filter(([other, b]) => other !== ws && b.id && !b.worldSeen);
  if (unseen.length) {
    const out = `{"t":"world","id":${JSON.stringify(a.id)},"data":${raw}}`;
    let bucket = this._roomWorld;
    for (const [other, b] of unseen) {
      const budget = byteGate(bucket, now, out.length, FOES_ROOM_BYTES_PER_S, true);
      bucket = budget.bucket;
      if (!budget.pass) break;
      this._setAttach(other, { ...b, worldSeen: true }); this._send(other, out);
    }
    this._roomWorld = bucket;
  }
  return;
}
