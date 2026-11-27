// @ts-check

import { SNOW_ATTR } from './snowfallGlsl.js';
import { MID, BLANKET, snowUniforms } from '../weather/snowfallRuntime.js';

const EXCLUDED = [-1, 0, 0, 0];
const LOCAL_GENERIC = [[SNOW_ATTR.ctxA, EXCLUDED], [SNOW_ATTR.blanket, [0, 0, 1, 0]], [SNOW_ATTR.ctxB, EXCLUDED], [SNOW_ATTR.ctxC, EXCLUDED], [SNOW_ATTR.blanketNormal, [0, 1, 0, 0]]];
const BLANKET_GENERIC = [[SNOW_ATTR.blanket, [0, 0, 1, 0]], [SNOW_ATTR.ctxB, EXCLUDED], [SNOW_ATTR.ctxC, EXCLUDED], [SNOW_ATTR.blanketNormal, [0, 1, 0, 0]]];

function textures(t, dynamic, statics, context, far, albedo) {
  t.dynamic = dynamic; t.static = statics; t.context = context; t.far = far; t.albedo = albedo;
  return t;
}

export class SnowfallSurface {
  /** @param {WebGL2RenderingContext} gl @param {any} renderer */
  constructor(gl, renderer) {
    this.gl = gl;
    this.renderer = renderer;
    this._seam();
    this.white = this._texture(1, 1, gl.NEAREST, new Uint8Array([255, 255, 255, 255]));
    this.albedo = null;
    this.local = null;
    this.mid = null;
    this.far = null;
    /** @type {Map<any, any>} */
    this.tiles = new Map();
    this.nextHistoryUpload = 0;
    this.drawn = 0;
    this.localUploads = 0;
    this._og = [0, 0, 0];
    this._box = new Float32Array(6);
    this._u = { local: snowUniforms(), mid: snowUniforms(), blanket: snowUniforms() };
    this._tex = { local: {}, mid: {}, blanket: {} };
  }

  // The image arrives bottom row first (an ImageBitmap takes no UNPACK_FLIP_Y_WEBGL), so row 0 is Unity's v = 0.
  setAlbedo(image) {
    const gl = this.gl;
    this._seam();
    if (this.albedo) gl.deleteTexture(this.albedo);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.albedo = tex;
  }

  // Runs before any bind here: an index buffer bound under the renderer's open vertex array would join that array.
  _seam() {
    this.renderer?.endUiRun?.();
    this.renderer?.markForeignPass?.();
  }

  _texture(w, h, filter, data = null) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  _upload(tex, res, pixels, part = { full: true }) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (part.full) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res, res, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    else {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, res); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, part.x); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, part.z);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, part.x, part.z, part.w, part.h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  _mesh(channels, index) {
    const gl = this.gl, vao = gl.createVertexArray(), buffers = [];
    gl.bindVertexArray(vao);
    for (const [loc, size, data, shared] of channels) {
      const b = shared ?? gl.createBuffer();
      if (!shared) { buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); } else gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    const ib = index.shared ?? gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    if (!index.shared) { buffers.push(ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index.data, gl.STATIC_DRAW); }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { vao, buffers, indexCount: index.count };
  }
  _rewrite(buffer, data) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); gl.bindBuffer(gl.ARRAY_BUFFER, null); }
  _dropMesh(m) { if (!m) return; const gl = this.gl; gl.deleteVertexArray(m.vao); for (const b of m.buffers) gl.deleteBuffer(b); }

  /** @param {any} rt */
  sync(rt, now) {
    const gl = this.gl, L = rt.local, M = rt.mid, B = rt.blanket, F = rt.far;
    this._seam();
    if (!this.local || this.local.res !== L.res || this.local.mres !== L.mres || this.local.sres !== L.sres || rt.dirty.gridRebuilt) {
      rt.dirty.gridRebuilt = false;
      this._dropLocal();
      const mesh = this._mesh([[SNOW_ATTR.pos, 3, L.pos], [SNOW_ATTR.normal, 3, L.nrm], [SNOW_ATTR.uv, 2, L.uv]], { data: L.index, count: L.index.length });
      this.local = { res: L.res, mres: L.mres, sres: L.sres, mesh: { ...mesh, generic: LOCAL_GENERIC },
        dynamic: this._texture(L.mres, L.mres, gl.LINEAR, L.dynamic), statics: this._texture(L.sres, L.sres, gl.LINEAR, L.statics), context: this._texture(L.sres, L.sres, gl.LINEAR, L.context) };
      rt.dirty.localMesh = false; rt.dirty.localStatic = false; rt.rects.local.take();
    }
    if (L.visible) {
      if (rt.dirty.localMesh) { rt.dirty.localMesh = false; this._rewrite(this.local.mesh.buffers[0], L.pos); this._rewrite(this.local.mesh.buffers[1], L.nrm); }
      if (rt.dirty.localStatic) { rt.dirty.localStatic = false; this._upload(this.local.statics, L.sres, L.statics); this._upload(this.local.context, L.sres, L.context); }
      const lp = rt.rects.local.take();
      if (lp) { this._upload(this.local.dynamic, L.mres, L.dynamic, lp); this.localUploads++; }
    }
    if (!this.mid) {
      const mesh = this._mesh([[SNOW_ATTR.pos, 3, M.pos], [SNOW_ATTR.normal, 3, M.nrm], [SNOW_ATTR.uv, 2, M.uv], [SNOW_ATTR.ctxA, 4, M.ctxA], [SNOW_ATTR.blanket, 4, M.heights],
        [SNOW_ATTR.ctxB, 4, M.ctxB], [SNOW_ATTR.ctxC, 4, M.ctxC], [SNOW_ATTR.blanketNormal, 3, M.bnrm]], { data: M.index, count: M.index.length });
      this.mid = { mesh, history: this._texture(MID.history, MID.history, gl.LINEAR, M.history), statics: this._texture(MID.staticRes, MID.staticRes, gl.LINEAR), context: this._texture(MID.staticRes, MID.staticRes, gl.LINEAR) };
    }
    if (rt.dirty.mid) {
      rt.dirty.mid = false;
      const b = this.mid.mesh.buffers;
      for (const [i, data] of [M.pos, M.nrm, M.uv, M.ctxA, M.heights, M.ctxB, M.ctxC, M.bnrm].entries()) if (i !== 2) this._rewrite(b[i], data);
      this._upload(this.mid.statics, MID.staticRes, M.statics); this._upload(this.mid.context, MID.staticRes, M.context);
      this._upload(this.mid.history, MID.history, M.history); rt.rects.mid.take();
    }
    if (rt.rects.mid.full || now >= this.nextHistoryUpload) {
      const mp = rt.rects.mid.take();
      if (mp) { this._upload(this.mid.history, MID.history, M.history, mp); this.nextHistoryUpload = now + MID.historyUpload; }
    }
    if (!this.far) this.far = this._texture(641, 641, gl.LINEAR, F.pixels);
    const fp = rt.rects.far.take();
    if (fp) this._upload(this.far, 641, F.pixels, fp);
    for (const o of rt.dirty.blanket) {
      let g = this.tiles.get(o);
      if (o.dead) { if (g) { this._dropMesh(g.mesh); gl.deleteTexture(g.statics); this.tiles.delete(o); } continue; }
      if (!g) {
        this._blanketShared ??= this._sharedBlanket(B);
        const mesh = this._mesh([[SNOW_ATTR.pos, 3, o.pos], [SNOW_ATTR.normal, 3, o.nrm], [SNOW_ATTR.uv, 2, null, this._blanketShared.uv], [SNOW_ATTR.ctxA, 4, o.ctx]],
          { shared: this._blanketShared.index, count: B.index.length });
        g = { mesh: { ...mesh, generic: BLANKET_GENERIC }, statics: this._texture(BLANKET.staticRes, BLANKET.staticRes, gl.NEAREST, o.statics) };
        this.tiles.set(o, g);
      } else {
        this._rewrite(g.mesh.buffers[0], o.pos); this._rewrite(g.mesh.buffers[1], o.nrm); this._rewrite(g.mesh.buffers[2], o.ctx);
        this._upload(g.statics, BLANKET.staticRes, o.statics);
      }
    }
    rt.dirty.blanket.clear();
  }
  _sharedBlanket(B) {
    const gl = this.gl, uv = gl.createBuffer(), index = gl.createBuffer();
    // An element buffer binding belongs to the bound VAO; unbind it through the renderer so its shadow stays true.
    if (this.renderer?._bindVao) this.renderer._bindVao(null); else gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.bufferData(gl.ARRAY_BUFFER, B.uv, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, B.index, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return { uv, index };
  }

  /** @param {any} rt @param {((box: Float32Array, x: number, y: number, z: number) => boolean)|null} [outside] */
  draw(rt, outside = null) {
    this.drawn = 0;
    if (!this.albedo || !this.local) return false;
    const R = this.renderer, tiers = rt.visibleTiers(), U = this._u, T = this._tex;
    const distant = tiers.far;
    R.drawSnowBegin?.();
    try {
      if (tiers.local) {
        textures(T.local, this.local.dynamic, this.local.statics, this.local.context, this.white, this.albedo);
        R.drawSnow(this.local.mesh, rt.depthUniforms(rt.localUniforms(U.local)), T.local);
        this.drawn++;
      }
      if (tiers.mid && this.mid) {
        textures(T.mid, this.mid.history, this.mid.statics, this.mid.context, distant ? this.far : this.white, this.albedo);
        R.drawSnow(this.mid.mesh, rt.depthUniforms(rt.midUniforms(U.mid)), T.mid);
        this.drawn++;
      }
      if (tiers.blanket) {
        const rise = outside ? rt.blanketRise() : 0, box = this._box, u = rt.depthUniforms(U.blanket), t = T.blanket;
        textures(t, distant ? this.far : this.white, null, this.white, this.white, this.albedo);
        for (const [o, g] of this.tiles) {
          if (!o.ready || !rt.blanket.live.has(o.t)) continue;
          if (outside) {
            const og = o.t.origin(this._og);
            box[0] = 0; box[1] = o.minY; box[2] = 0; box[3] = o.t.size; box[4] = o.maxY + rise; box[5] = o.t.size;
            if (outside(box, og[0], og[1], og[2])) continue;
          }
          t.static = g.statics;
          R.drawSnow(g.mesh, rt.blanketUniforms(o, distant, u), t);
          this.drawn++;
        }
      }
    } finally { R.drawSnowEnd?.(); }
    return this.drawn > 0;
  }

  _dropLocal() {
    if (!this.local) return;
    const gl = this.gl;
    this._dropMesh(this.local.mesh);
    for (const t of [this.local.dynamic, this.local.statics, this.local.context]) gl.deleteTexture(t);
    this.local = null;
  }
  dispose() {
    const gl = this.gl;
    this._dropLocal();
    if (this.mid) { this._dropMesh(this.mid.mesh); for (const t of [this.mid.history, this.mid.statics, this.mid.context]) gl.deleteTexture(t); this.mid = null; }
    for (const g of this.tiles.values()) { this._dropMesh(g.mesh); gl.deleteTexture(g.statics); }
    this.tiles.clear();
    if (this._blanketShared) { gl.deleteBuffer(this._blanketShared.uv); gl.deleteBuffer(this._blanketShared.index); this._blanketShared = null; }
    for (const t of [this.far, this.albedo, this.white]) if (t) gl.deleteTexture(t);
    this.far = this.albedo = this.white = null;
  }
}
