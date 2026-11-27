// @ts-check
// One compile-and-link path for the renderer and every foreign pass. A leaf with no imports.

const STARTED = new WeakMap();
const PARALLEL = new WeakMap();

export function parallelCompile(gl) {
  if (!PARALLEL.has(gl)) PARALLEL.set(gl, gl.getExtension?.('KHR_parallel_shader_compile') ?? null);
  return PARALLEL.get(gl);
}

function link(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  const stage = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
    return sh;
  };
  const vs = stage(gl.VERTEX_SHADER, vsSrc);
  const fs = stage(gl.FRAGMENT_SHADER, fsSrc);
  gl.linkProgram(prog);
  return { prog, vs, fs };
}

// Asks COMPLETION_STATUS_KHR without waiting; without KHR_parallel_shader_compile, ready() is true at once.
/**
 * @param {any} gl
 * @param {ReadonlyArray<readonly [string, string]>} pairs
 * @returns {() => boolean}
 */
export function startPrograms(gl, pairs) {
  let started = STARTED.get(gl);
  if (!started) STARTED.set(gl, (started = new Map()));
  const keyed = pairs.map(([vs, fs]) => [`${vs}\0${fs}`, vs, fs]);
  const startAll = () => keyed.map(([k, vs, fs]) => {
    let s = started.get(k);
    if (!s) started.set(k, (s = link(gl, vs, fs)));
    return s.prog;
  });
  startAll();
  const ext = parallelCompile(gl);
  let done = false;
  return () => {
    if (done || !ext || gl.isContextLost?.()) return (done = true);
    return (done = startAll().every((p) => gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR) === true));
  };
}

/**
 * @param {any} gl
 * @param {ReadonlyArray<readonly [string, string]>} pairs
 */
export function releasePrograms(gl, pairs) {
  const started = STARTED.get(gl);
  if (!started) return;
  for (const [vs, fs] of pairs) {
    const k = `${vs}\0${fs}`, s = started.get(k);
    if (!s) continue;
    started.delete(k);
    gl.deleteShader(s.vs); gl.deleteShader(s.fs); gl.deleteProgram(s.prog);
  }
}

// `get(true)` builds the pass now, waiting on the compile, for a pass the frame cannot skip.
/**
 * @template T
 * @param {any} gl
 * @param {ReadonlyArray<readonly [string, string]>} programs
 * @param {() => T} make
 * @param {(e: any) => void} [fail]
 * @returns {((need?: boolean) => T|null) & { readonly settled: boolean }}
 */
export function compiledPass(gl, programs, make, fail = () => {}) {
  let ready = /** @type {(() => boolean)|null} */ (null), pass = /** @type {T|null} */ (null), tried = false;
  const door = (need = false) => {
    if (pass || tried || !gl) return pass;
    if (!(ready ??= startPrograms(gl, programs))() && !need) return null;
    tried = true;
    try { pass = make(); } catch (e) { fail(e); pass = null; releasePrograms(gl, programs); }
    return pass;
  };
  return /** @type {any} */ (Object.defineProperty(door, 'settled', { get: () => !!pass || tried }));
}

export function buildProgram(gl, vsSrc, fsSrc, label = '') {
  // One LINK_STATUS read is the only sync point; a stage is checked only when the link fails, since a compile
  // fault always fails the link.
  const key = `${vsSrc}\0${fsSrc}`;
  const started = STARTED.get(gl);
  const took = started?.get(key);
  if (took) started.delete(key);
  const { prog, vs, fs } = took ?? link(gl, vsSrc, fsSrc);
  let fault = /** @type {string|null} */ (null);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    for (const sh of [vs, fs]) if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { fault = `${label ? `${label} shader: ` : ''}${gl.getShaderInfoLog(sh)}`; break; }
    fault ??= `${label ? `${label} link: ` : ''}${gl.getProgramInfoLog(prog)}`;
  }
  // Attached stages live as long as the program and go with its deleteProgram.
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (fault != null) { gl.deleteProgram(prog); throw new Error(fault); }
  return prog;
}
