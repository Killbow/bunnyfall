// @ts-check
import { buildProgram } from './glProgram.js';
import { duelClock } from './duelWall.js';

export const NPC_MARKS_MAX = 12;
export const MARK_HALF_M = 0.16;
// Keeps at least two screen pixels per icon cell; smaller, a far icon shimmers as it bobs.
export const MARK_MIN_RAD = 0.017;
export const MARK_BOB_M = 0.06;
// Whole cycles over the duel wall's wrapped clock, so the wrap never jumps the bob.
export const MARK_BOB_HZ = 1;
export const MARK_GRID = 16;
export const NPC_MARK_KINDS = Object.freeze({ quest: 0, merchant: 1, service: 2 });

const HEAD = `#version 300 es
precision highp float;
`;
export const NPC_MARK_VS = HEAD + `layout(location = 0) in vec2 aP;
uniform mat4 uVP;
uniform vec3 uAt;
uniform vec3 uRight;
uniform vec3 uEye;
uniform float uHalf;
uniform float uMinRad;
out vec2 vP;
void main() {
  float h = max(uHalf, length(uEye - uAt) * uMinRad);
  vec3 p = uAt + uRight * (aP.x * h) + vec3(0.0, (aP.y + 1.0) * h, 0.0);
  vP = aP;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const NPC_MARK_FS = HEAD + `in vec2 vP;
uniform int uKind;       // NPC_MARK_KINDS
uniform float uAlpha;
out vec4 o;
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  // the cell's centre, so every pixel of a cell is one colour
  vec2 p = (floor((vP * 0.5 + 0.5) * ${MARK_GRID}.0) + 0.5) / ${MARK_GRID}.0 * 2.0 - 1.0;
  float d;            // the shape's distance (inside < 0)
  float inner = 1.0;  // 0 where the shape's own darker detail is
  vec3 fill;
  if (uKind == ${NPC_MARK_KINDS.quest}) {
    // "!": a bar over a dot, both square to the pixel grid
    d = min(box(p - vec2(0.0, 0.3), vec2(0.21, 0.52)), box(p - vec2(0.0, -0.62), vec2(0.21, 0.2)));
    fill = vec3(1.0, 0.93, 0.3);   // a lemon yellow, apart from the coin's amber where both are a few pixels
  } else if (uKind == ${NPC_MARK_KINDS.merchant}) {
    // a coin: a disc, a ring stamped inside its rim
    float r = length(p);
    d = r - 0.8;
    inner = abs(r - 0.5) < 0.09 ? 0.0 : 1.0;
    fill = vec3(0.92, 0.58, 0.14);
  } else {
    // a gem: a rhombus, a facet cut inside it
    float m = abs(p.x) * 1.25 + abs(p.y);
    d = m - 0.95;
    inner = abs(m - 0.5) < 0.1 ? 0.0 : 1.0;
    fill = vec3(0.42, 0.66, 1.0);
  }
  float outline = 0.22;   // a dark pixel's rim round the shape, so it reads over a lit wall and a dark one alike
  if (d > outline) discard;
  vec3 c = d > 0.0 ? vec3(0.1, 0.07, 0.04) : mix(fill * 0.62, fill, inner);
  if (d <= 0.0 && p.y > 0.25 && p.x < 0.0 && inner > 0.5) c = mix(c, vec3(1.0), 0.3);   // the light's catch, top left
  o = vec4(c * uAlpha, uAlpha);
}`;

export function markQuadVertices() {
  return new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
}

export function markBob(seconds, phase, still = false) {
  if (still) return 0;
  return MARK_BOB_M * Math.sin(2 * Math.PI * (MARK_BOB_HZ * duelClock(seconds) + phase));
}

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export class NpcMarkRenderer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    const prog = buildProgram(gl, NPC_MARK_VS, NPC_MARK_FS, 'npcMarks');
    this.program = prog;
    /** @type {Record<string, WebGLUniformLocation | null>} */
    this.u = {};
    for (const n of ['uVP', 'uAt', 'uRight', 'uEye', 'uHalf', 'uMinRad', 'uKind', 'uAlpha']) this.u[n] = gl.getUniformLocation(prog, n);
    const verts = markQuadVertices();
    this.count = verts.length / 2;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  /**
   * @param {ReadonlyArray<{ at: number[], kind: string, alpha: number }>} marks
   * @param {number} n
   * @param {Float32Array} proj
   * @param {Float32Array} view
   * @param {ArrayLike<number>} eye
   */
  draw(marks, n, proj, view, eye) {
    this.drawn = 0;
    const last = Math.min(n | 0, NPC_MARKS_MAX);
    let any = false;
    for (let i = 0; i < last && !any; i++) any = marks[i].alpha > 0.001;
    // Bind nothing unless a mark draws: a bind without a draw leaves the renderer's program state wrong unmarked.
    if (!any || !this.program) return;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    // With the mirrored projection the first view row points left on screen, so the icon's right is its negative.
    gl.uniform3f(U.uRight, -view[0], -view[4], -view[8]);
    gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]);
    gl.uniform1f(U.uHalf, MARK_HALF_M);
    gl.uniform1f(U.uMinRad, MARK_MIN_RAD);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (let i = 0; i < last; i++) {
      const m = marks[i];
      if (!(m.alpha > 0.001)) continue;
      gl.uniform3f(U.uAt, m.at[0], m.at[1], m.at[2]);
      gl.uniform1i(U.uKind, NPC_MARK_KINDS[m.kind] ?? NPC_MARK_KINDS.quest);
      gl.uniform1f(U.uAlpha, Math.min(1, m.alpha));
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    if (!this.program) return;
    gl.deleteProgram(this.program); gl.deleteVertexArray(this.vao); gl.deleteBuffer(this.vbo);
    this.program = null; this.vao = null; this.vbo = null;
  }
}
