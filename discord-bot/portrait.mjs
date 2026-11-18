import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pngjs from 'pngjs';
import { DFPalette } from '../src/formats/dfPalette.js';
import { composePaperDollPixels } from '../src/ui/paperDoll.js';

export async function portraitRenderer(folder) {
  if (!folder) return async () => null;
  const entries = new Map((await readdir(folder)).map((name) => [name.toUpperCase(), name]));
  const fetchBytes = async (name) => {
    const actual = entries.get(name.toUpperCase());
    if (!actual) throw new Error('Missing ARENA2 asset: ' + name);
    return new Uint8Array(await readFile(resolve(folder, actual)));
  };
  const palette = new DFPalette();
  palette.load(await fetchBytes('ART_PAL.COL'), 'ART_PAL.COL');
  return async ({ race, gender, face }) => {
    if (!race || !gender || !Number.isInteger(face)) return null;
    const doll = await composePaperDollPixels({ palette, fetchBytes }, { race, gender, faceIndex: face });
    if (!doll) return null;
    const { width, height, rgba } = doll;
    return pngjs.PNG.sync.write({ width, height, data: Buffer.from(rgba) });
  };
}
