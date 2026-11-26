// @ts-check
// Runs the UV unwrap in a worker and returns null where it must run on the editor's thread.
// The mesh is copied to the worker, never transferred, because the editor's session reads the same arrays.

export const UV_UNWRAP_IDLE_MS = 30000;

export function uvThreadDisabled(search = globalThis.location?.search) {
  try { return /[?&]uvthread=off\b/.test(search ?? ''); }
  catch { return false; }
}

function defaultWorkerFactory() {
  return new Worker(new URL('./uvUnwrapWorker.js', import.meta.url), { type: 'module' });
}

/**
 * @param {{ positions: ArrayLike<number> & { slice(): any }, normals?: ArrayLike<number> & { slice(): any }, uvs: ArrayLike<number> & { slice(): any }, indices: ArrayLike<number> & { slice(): any }, submeshes: { start: number, count: number }[] }} mesh
 * @param {{ workerFactory?: (() => any) | null, idleMs?: number }} [opts]
 */
export function createUnwrapThread(mesh, { workerFactory = undefined, idleMs = UV_UNWRAP_IDLE_MS } = {}) {
  const factory = workerFactory === undefined
    ? ((uvThreadDisabled() || typeof Worker === 'undefined') ? null : defaultWorkerFactory)
    : workerFactory;
  let w = null, dead = !factory, idle = null, nextId = 1;
  const jobs = new Map();
  const wake = () => { if (idle !== null) { clearTimeout(idle); idle = null; } };
  const letGo = () => {
    wake();
    if (w) { try { w.terminate?.(); } catch { } w = null; }
    for (const r of jobs.values()) r(null);
    jobs.clear();
  };
  const rest = () => {
    wake();
    if (jobs.size || !w) return;
    idle = setTimeout(() => { idle = null; if (!jobs.size) letGo(); }, idleMs);
    idle.unref?.();
  };
  const fail = (why) => { console.warn('[poi] the UV unwrap worker is unavailable; unwrapping on the main thread -', why ?? 'the worker failed'); dead = true; letGo(); };
  const open = () => {
    try {
      w = factory();
      w.onerror = (e) => fail(e?.message);
      w.onmessage = (ev) => {
        const m = ev.data ?? {};
        const r = jobs.get(m.id);
        if (!r) return;
        jobs.delete(m.id);
        if (m.t !== 'laid') console.warn('[poi] the UV unwrap worker answered an error; unwrapping on the main thread -', m.message);
        r(m.t === 'laid' ? m : null);
        rest();
      };
      const copy = {
        positions: mesh.positions.slice(), normals: mesh.normals ? mesh.normals.slice() : new Float32Array(mesh.positions.length),
        uvs: mesh.uvs.slice(), indices: mesh.indices.slice(), submeshes: mesh.submeshes.map((sm) => ({ start: sm.start, count: sm.count })),
      };
      w.postMessage({ t: 'mesh', mesh: copy }, [copy.positions.buffer, copy.normals.buffer, copy.uvs.buffer, copy.indices.buffer]);
      return true;
    } catch (e) {
      fail(e?.message ?? e);
      return false;
    }
  };
  return {
    /**
     * @param {ArrayLike<number>} faces
     * @param {ArrayLike<number>} seams
     * @returns {Promise<{ corners: Int32Array, uvs: Float64Array, pieces: number, triangles: number } | null>}
     */
    unwrap(faces, seams) {
      if (dead || (!w && !open())) return Promise.resolve(null);
      wake();
      return new Promise((resolve) => {
        const id = nextId++;
        jobs.set(id, resolve);
        const f = Int32Array.from(faces), sm = Int32Array.from(seams);
        try { w.postMessage({ t: 'unwrap', id, faces: f, seams: sm }, [f.buffer, sm.buffer]); }
        catch (e) { fail(e?.message ?? e); }
      });
    },
    close() { dead = true; letGo(); },
    get onWorker() { return !!w; },
  };
}
