// @ts-check
// Samples GPU object counts and frame costs for crash.log. Nothing runs in the frame: no getError or getParameter.

export const GPU_TRAIL_MS = 30_000;
export const GPU_TRAIL_FIRST_MS = 5_000;
// app/lib/rendererGone.cjs TRAIL_KEEP keeps as many; change both together.
export const GPU_TRAIL_KEEP = 20;

export const GL_KINDS = Object.freeze([['Texture', 'textures'], ['Buffer', 'buffers'], ['VertexArray', 'vaos'], ['Framebuffer', 'framebuffers'], ['Program', 'programs']]);

/** @typedef {{ textures: number, buffers: number, vaos: number, framebuffers: number, programs: number }} GlLive */

/** @returns {GlLive} */
const noneLive = () => ({ textures: 0, buffers: 0, vaos: 0, framebuffers: 0, programs: 0 });

// A delete counts only an object counted alive, so the count never drifts below what the context holds.
/**
 * @param {WebGL2RenderingContext} gl
 * @param {GlLive} [live]
 * @returns {GlLive}
 */
export function countGlObjects(gl, live = noneLive()) {
  const g = /** @type {any} */ (gl), n = /** @type {Record<string, number>} */ (live);
  for (const [kind, key] of GL_KINDS) {
    const create = g[`create${kind}`], remove = g[`delete${kind}`];
    const held = new WeakSet();
    g[`create${kind}`] = function () { const o = create.call(gl); if (o) { held.add(o); n[key]++; } return o; };
    g[`delete${kind}`] = function (o) { if (o && held.delete(o)) n[key]--; return remove.call(gl, o); };
  }
  return live;
}

// Must run before `new Renderer(canvas)`: the renderer gets its context and builds its programs in its constructor.
/**
 * @param {HTMLCanvasElement} canvas
 * @returns {GlLive}
 */
export function countCanvasGl(canvas) {
  const live = noneLive();
  const c = /** @type {any} */ (canvas);
  const own = c.getContext;
  c.getContext = function (type, attrs) {
    const ctx = own.call(canvas, type, attrs);
    if (ctx && type === 'webgl2') { delete c.getContext; countGlObjects(ctx, live); }
    return ctx;
  };
  return live;
}

export function createTrail(keep = GPU_TRAIL_KEEP) {
  /** @type {object[]} */
  const ring = [];
  return {
    /** @param {object} s */
    push(s) { ring.push(s); if (ring.length > keep) ring.splice(0, ring.length - keep); return ring.slice(); },
  };
}

const whole = (v) => (Number.isFinite(v) ? Math.round(v) : null);

/** @param {any} frame */
const hitchOf = (frame) => (frame ? (frame.hitch ? whole(frame.hitch.ms) : 0) : null);

/** @param {{ at: number, upMs: number, live: GlLive, frame: any, heap: number|null, hidden: boolean, lost: boolean, restored?: boolean }} o */
export function gpuSample({ at, upMs, live, frame, heap, hidden, lost, restored = false }) {
  return {
    at, upS: whole(upMs / 1000),
    textures: live.textures, buffers: live.buffers, vaos: live.vaos, framebuffers: live.framebuffers, programs: live.programs,
    fps: whole(frame?.fps), frameMs: Number.isFinite(frame?.meanMs) ? Math.round(frame.meanMs * 10) / 10 : null, worstMs: whole(frame?.worstMs),
    hitchMs: hitchOf(frame), draws: whole(frame?.draws), binds: whole(frame?.binds), viewDraws: whole(frame?.viewDraws), shadowDraws: whole(frame?.shadowDraws),
    heapMB: heap == null ? null : whole(heap / 1048576), hidden: !!hidden, lost: !!lost, restored: !!restored,
  };
}

/**
 * @param {{ canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, live: GlLive, frames: () => any, gpu?: string|null,
 *   send: (trail: { gpu: string|null, samples: object[] }) => void, timers?: any }} o
 */
export function startGpuTrail({ canvas, gl, live, frames, gpu = null, send, timers = globalThis }) {
  const trail = createTrail();
  let lastFrame = null;
  const sample = (restored = false) => {
    const frame = frames?.() ?? null;
    const s = gpuSample({
      at: Date.now(), upMs: globalThis.performance?.now?.() ?? 0, live, frame: frame === lastFrame ? null : frame,
      heap: /** @type {any} */ (globalThis.performance)?.memory?.usedJSHeapSize ?? null, hidden: !!globalThis.document?.hidden, lost: gl.isContextLost(),
      restored,
    });
    lastFrame = frame;
    try { send({ gpu, samples: trail.push(s) }); } catch { }
  };
  // A timer and the lost event would hand their own argument to `sample`; each says what it is instead.
  const sampleNow = () => sample(false);
  const sampleRestored = () => sample(true);
  const first = timers.setTimeout(sampleNow, GPU_TRAIL_FIRST_MS);
  const every = timers.setInterval(sampleNow, GPU_TRAIL_MS);
  canvas.addEventListener('webglcontextlost', sampleNow);
  canvas.addEventListener('webglcontextrestored', sampleRestored);
  return {
    sample: sampleNow,
    stop() {
      timers.clearTimeout(first); timers.clearInterval(every);
      canvas.removeEventListener('webglcontextlost', sampleNow); canvas.removeEventListener('webglcontextrestored', sampleRestored);
    },
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {(trail: { gpu: string|null, samples: object[] }) => void} send
 */
export function gpuTrailOn(canvas, send) {
  const live = countCanvasGl(canvas);
  return {
    /** @param {{ gl: WebGL2RenderingContext, gpuName?: string|null }} renderer @param {() => any} frames */
    start: (renderer, frames) => startGpuTrail({ canvas, gl: renderer.gl, live, frames, gpu: renderer.gpuName ?? null, send }),
  };
}
