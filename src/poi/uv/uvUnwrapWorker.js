// Worker entry for the UV unwrap. It may import only pure modules: a worker has no DOM.

import { uvSessionOf, unwrapLscm, edgeKey } from './uvMesh.js';

let session = null;

export function handleUnwrap(m, post) {
  try {
    if (m.t === 'mesh') { session = uvSessionOf(m.mesh); return; }
    if (m.t !== 'unwrap') throw new Error(`uv unwrap worker: unknown message ${JSON.stringify(m.t)}`);
    if (!session) throw new Error('uv unwrap worker: no mesh');
    session.seams = new Set();
    for (let i = 0; i + 1 < m.seams.length; i += 2) session.seams.add(edgeKey(m.seams[i], m.seams[i + 1]));
    const pieces = unwrapLscm(session, Array.from(m.faces));
    let n = 0;
    for (const p of pieces) n += p.length * 3;
    const corners = new Int32Array(n), uvs = new Float64Array(n * 2);
    let k = 0;
    for (const p of pieces) for (const f of p) for (let j = 0; j < 3; j++) {
      const c = f * 3 + j;
      corners[k] = c; uvs[k * 2] = session.cornerUv[c * 2]; uvs[k * 2 + 1] = session.cornerUv[c * 2 + 1]; k++;
    }
    post({ t: 'laid', id: m.id, corners, uvs, pieces: pieces.length, triangles: n / 3 }, [corners.buffer, uvs.buffer]);
  } catch (e) {
    post({ t: 'error', id: m.id, message: e?.message ?? String(e) });
  }
}

globalThis.onmessage = (ev) => handleUnwrap(ev.data ?? {}, (msg, transfer) => globalThis.postMessage(msg, transfer ?? []));
