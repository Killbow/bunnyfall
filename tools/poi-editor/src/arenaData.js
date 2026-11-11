// @ts-check

// The game's own models and pictures for the viewport, read straight from the ARENA2 files the dev server
// serves at /arena2 (tools/poi-editor/vite.config.js). Nothing is cached on disk and nothing is built into the
// app. `state()` says plainly whether the data is there, so the viewport can show its banner.

import { Arch3dFile } from '../../../src/formats/arch3dFile.js';
import { TextureFile } from '../../../src/formats/textureFile.js';
import { DFPalette } from '../../../src/formats/dfPalette.js';
import { dfMeshToModel } from '../../../src/world/meshReader.js';
import { readGameFile } from './gameFiles.js';

/** @param {(url: string) => Promise<any>} [fetcher] */
export function createArenaData(fetcher = (u) => fetch(u)) {
  /** @type {'unknown' | 'loaded' | 'missing'} */
  let status = 'unknown';
  /** @type {Arch3dFile | null} */
  let arch = null;
  /** @type {DFPalette | null} */
  let pal = null;
  /** @type {Map<number, Promise<TextureFile | null>>} */
  const textures = new Map();
  /** @type {Map<number, TextureFile>} */
  const loaded = new Map();
  const models = new Map();
  const pictures = new Map();

  const get = (name) => readGameFile(name, fetcher);

  return {
    state: () => status,
    /** Load the model archive and the palette. Answers whether the game data is there. */
    async open() {
      try {
        arch = new Arch3dFile(); arch.load(await get('ARCH3D.BSA'));
        pal = new DFPalette(); pal.load(await get('ART_PAL.COL'), 'ART_PAL.COL');
        status = 'loaded';
      } catch { status = 'missing'; arch = null; pal = null; }
      return status === 'loaded';
    },
    async texture(archive) {
      if (!pal) return null;
      if (!textures.has(archive)) {
        textures.set(archive, (async () => {
          try { const name = `TEXTURE.${String(archive).padStart(3, '0')}`; const t = new TextureFile(); t.load(await get(name), name, pal); loaded.set(archive, t); return t; } catch { return null; }
        })());
      }
      return textures.get(archive);
    },
    /** A texture record's first frame as RGBA (index 0 clear), or null. */
    async picture(archive, record) {
      const key = `${archive}.${record}`;
      if (pictures.has(key)) return pictures.get(key);
      const t = await this.texture(archive);
      let out = null;
      if (t && record < t.recordCount && pal) {
        const b = t.getDFBitmap(record, 0);
        if (b?.data?.length) {
          const data = new Uint8Array(b.width * b.height * 4);
          for (let i = 0; i < b.width * b.height; i++) { const p = b.data[i]; if (p) { data[i * 4] = pal.getRed(p); data[i * 4 + 1] = pal.getGreen(p); data[i * 4 + 2] = pal.getBlue(p); data[i * 4 + 3] = 255; } }
          out = { width: b.width, height: b.height, data };
        }
      }
      pictures.set(key, out);
      return out;
    },
    /** A model by id: `{ positions, normals, uvs, indices, subMeshes }` in metres, or null. Textures must be warmed first with `warm`. */
    model(id) {
      if (models.has(id)) return models.get(id);
      let m = null;
      try {
        const i = arch?.getRecordIndex(id) ?? -1;
        if (i >= 0 && arch) {
          const mesh = arch.getMesh(i);
          m = mesh?.totalVertices ? dfMeshToModel(mesh, (a, r) => loaded.get(a)?.getSize(r) ?? { width: 64, height: 64 }) : null;
          arch.discardRecord(i);
        }
      } catch { m = null; }
      models.set(id, m);
      return m;
    },
    /** Load the texture files a model's pieces use, so `model` finds their sizes. */
    async warm(id) {
      const i = arch?.getRecordIndex(id) ?? -1;
      if (i < 0 || !arch) return;
      const mesh = arch.getMesh(i);
      for (const sm of mesh?.subMeshes ?? []) await this.texture(sm.textureArchive);
      arch.discardRecord(i);
    },
  };
}
