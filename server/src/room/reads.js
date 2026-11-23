// What a room reads once a wake from storage: its world chunks and its recent home words.
import { WORLD_META, worldChunkKey } from './keys.js';
import { HOME_WORDS_KEY, validHomeWord, HOME_WORDS_KEEP_MS, HOME_WORDS_MAX } from '../relay.js';

export class ReadsPart {
  async _worldRaw() {
    // Read once a wake; every write or delete of the world chunks must also
    // set or clear `_worldMemo`.
    if (this._worldMemo !== undefined) return this._worldMemo;
    this._worldMemo = await this._worldRead();
    return this._worldMemo;
  }
  async _worldRead() {
    const meta = await this.state.storage.get(WORLD_META);
    if (!meta || !(meta.chunks > 0)) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => worldChunkKey(i));
    const parts = await this.state.storage.get(keys);
    let raw = '';
    for (const k of keys) { const c = parts.get(k); if (typeof c !== 'string') return null; raw += c; }
    return raw;
  }
  async _homeWordsHeld(now) {
    if (this._homeWords === undefined) {
      const kept = await this.state.storage.get(HOME_WORDS_KEY);
      this._homeWords = Array.isArray(kept) ? kept.filter((w) => validHomeWord(w) && Number.isFinite(w?.at) && typeof w?.sig === 'string') : [];
    }
    this._homeWords = this._homeWords.filter((w) => now - w.at < HOME_WORDS_KEEP_MS).slice(-HOME_WORDS_MAX);
    return this._homeWords;
  }
}
