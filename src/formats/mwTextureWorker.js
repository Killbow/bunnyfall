// Runs inside a Worker with no DOM, so it may import only pure modules and nothing under ui/, scenes/, or render/.

import { decodeTextureImage } from './mwTexture.js';

export function handleDecode(m, post) {
  try {
    if (m.t !== 'decode') throw new Error(`mw texture worker: unknown message ${JSON.stringify(m.t)}`);
    const bytes = m.bytes instanceof Uint8Array ? m.bytes : new Uint8Array(m.bytes);
    const image = decodeTextureImage(m.path, bytes, m.levels == null ? undefined : { levels: m.levels });
    // Transferring every level is safe because the decoders create a fresh buffer for each level.
    post({ t: 'image', id: m.id, image }, image.mips.map((l) => l.rgba.buffer));
  } catch (e) {
    post({ t: 'error', id: m.id, message: e?.message ?? String(e) });
  }
}

globalThis.onmessage = (ev) => handleDecode(ev.data ?? {}, (msg, transfer) => globalThis.postMessage(msg, transfer ?? []));
