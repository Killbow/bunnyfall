#!/usr/bin/env node
// BUNNYFALL PHASE 3: THE DFMOD IMPORTER - a developer tool, nothing in the game. Hand it a Daggerfall Unity mod
// (.dfmod) and it unpacks what the browser can use into vendor/<mod>/, for the work of bringing the mod in:
//
//   <mod>.dfmod.json   the manifest (title, author, version, dependencies)
//   modsettings.json   and every other TextAsset, by its own name: settings, quest and text files, the mod's .dll
//   Textures/*.png     every Texture2D, decoded
//   Sound/*.ogg        every AudioClip (FSB5 Vorbis, remuxed untouched)
//   inventory.json     everything in the bundle by kind and name, extracted or not (meshes, prefabs, scripts)
//   README.md          what the mod is, where it came from, and what is left to port
//
// A mod that only adds pictures, sounds or text is mostly done here. A mod with C# behaviour (its .dll) is ported by
// hand from there, as every mod under vendor/ was.
//
//   node tools/importDfmod.mjs <path/to/mod.dfmod> [--name <folder>] [--force] [--extra <folder>]
//
//   --name    the folder under vendor/ (default: the file's name, lower-case, dashed)
//   --force   write over an existing vendor/<folder>/
//   --extra   a folder of loose files from the mod's download (textures, a readme, a licence), copied in as they are
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { isMain } from './lib/isMain.mjs';
import { readUnityFs, readSerializedFile, decodeTexture2D, CLASS_ID } from '../src/formats/unity/unityBundle.js';
import { fsb5ToOgg } from './lib/fsb5Vorbis.mjs';
import { writePng } from './pngIO.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASS_AUDIO_CLIP = 83;
/** Unity class ids worth naming in the inventory. */
const CLASS_NAMES = Object.freeze({
  1: 'GameObject', 4: 'Transform', 21: 'Material', 23: 'MeshRenderer', 28: 'Texture2D', 33: 'MeshFilter', 43: 'Mesh',
  48: 'Shader', 49: 'TextAsset', 74: 'AnimationClip', 83: 'AudioClip', 91: 'AnimatorController', 95: 'Animator',
  114: 'MonoBehaviour', 115: 'MonoScript', 137: 'SkinnedMeshRenderer', 142: 'AssetBundle', 187: 'Texture2DArray',
});

/** A folder name from a file name: "Heat Haze.dfmod" -> "heat-haze". */
export const slugOf = (file) => basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mod';
/** A safe file name for an asset. */
const safe = (name) => String(name ?? 'unnamed').replace(/[\\/:*?"<>|\0]/g, '_').trim() || 'unnamed';

/** The bundle opened: its objects (classId, read) and the resource streams' reader. */
function openBundle(bytes) {
  const fs = readUnityFs(bytes);
  const main = fs.files.find((f) => !/\.res(S|ource)$/.test(f.path));
  if (!main) throw new Error('not a Unity bundle this reader knows (no serialized file)');
  const sf = readSerializedFile(main, main.path);
  const resource = (path, offset, size) => {
    const base = path.slice(path.lastIndexOf('/') + 1);
    const f = fs.files.find((x) => x.path === base || x.path === path);
    if (!f) throw new Error(`the bundle has no stream ${path}`);
    return f.read(offset, size);
  };
  return { objects: sf.objects.map((o) => ({ classId: o.classId, read: () => o.read() })), resource };
}

/** The Vorbis setup headers vendor/vorbis-fsb-setups/ carries, by CRC32. */
function setupHeaders() {
  const setups = new Map();
  const dir = join(ROOT, 'vendor/vorbis-fsb-setups');
  if (!existsSync(dir)) return setups;
  for (const f of readdirSync(dir).filter((n) => /^setup_[0-9a-f]{8}\.bin$/.test(n))) {
    const b = new Uint8Array(readFileSync(join(dir, f)));
    setups.set(zlib.crc32(b) >>> 0, b);
  }
  return setups;
}

/** The file name a TextAsset is written under: its own extension, else .json for JSON, .txt for text, .bytes else. */
function textAssetFile(name, bytes) {
  const n = safe(name);
  if (/\.[a-z0-9]{1,5}$/i.test(n) && !/\.dfmod$/i.test(n)) return n;
  const text = new TextDecoder('utf-8', { fatal: true });
  try {
    const s = text.decode(bytes);
    try { JSON.parse(s); return `${n}.json`; } catch { return `${n}.txt`; }
  } catch { return `${n}.bytes`; }
}

/** Unpack `bytes` (a .dfmod): the files to write (path under the mod's folder -> bytes) and a report. */
export function unpackDfmod(bytes) {
  const b = openBundle(bytes);
  const files = new Map();
  const report = [];
  const inventory = {};
  const setups = setupHeaders();
  let manifest = null;
  for (const o of b.objects) {
    const kind = CLASS_NAMES[o.classId] ?? `class ${o.classId}`;
    let obj = null;
    try { obj = o.read(); } catch { (inventory[kind] ??= []).push('(unreadable)'); continue; }
    const name = obj?.m_Name ?? '';
    (inventory[kind] ??= []).push(name);
    try {
      if (o.classId === CLASS_ID.TextAsset) {
        const data = new Uint8Array(obj.m_Script);
        if (/\.dfmod$/i.test(name)) {
          try { const j = JSON.parse(new TextDecoder().decode(data)); if (j?.ModTitle) { manifest = j; files.set('__manifest__', data); continue; } } catch { /* not the manifest */ }
        }
        files.set(textAssetFile(name, data), data);
      } else if (o.classId === CLASS_ID.Texture2D) {
        files.set(`Textures/${safe(name)}.png`, writePng(decodeTexture2D(obj, b.resource)));
      } else if (o.classId === CLASS_AUDIO_CLIP && obj.m_Resource) {
        const fsb = b.resource(obj.m_Resource.m_Source, Number(obj.m_Resource.m_Offset), Number(obj.m_Resource.m_Size));
        files.set(`Sound/${safe(name)}.ogg`, fsb5ToOgg(fsb, (crc) => setups.get(crc) ?? null));
      }
    } catch (e) {
      report.push(`skipped ${kind} "${name}": ${e?.message ?? e}`);
    }
  }
  for (const k of Object.keys(inventory)) inventory[k].sort();
  return { manifest, files, inventory, report };
}

/** The README a fresh import gets. */
function readmeOf(slug, manifest, source, inventory) {
  const m = manifest ?? {};
  const kinds = Object.entries(inventory).map(([k, v]) => `- ${k}: ${v.length}`).join('\n');
  const dll = (inventory.TextAsset ?? []).filter((n) => /\.dll$/i.test(n));
  return `# ${m.ModTitle ?? slug}

${m.ModDescription ?? ''}

- Author: ${m.ModAuthor ?? 'unknown'}
- Version: ${m.ModVersion ?? 'unknown'}
- Source file: \`${basename(source)}\`, imported ${new Date().toISOString().slice(0, 10)} with \`tools/importDfmod.mjs\`
- Licence: check the mod's page and add it here (and a LICENSE file) before it ships

## What the bundle holds

${kinds || '- nothing readable'}

## Port status

${dll.length ? `Has C# behaviour (${dll.join(', ')}): to be ported by hand.` : 'No C# assembly: assets only.'}
Not wired into the game yet.
`;
}

function main(argv) {
  const src = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--name' && argv[argv.indexOf(a) - 1] !== '--extra');
  if (!src) { console.error('usage: node tools/importDfmod.mjs <mod.dfmod> [--name <folder>] [--force] [--extra <folder>]'); return 2; }
  if (!existsSync(src) || !statSync(src).isFile()) { console.error(`no such file: ${src}`); return 2; }
  const at = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const slug = at('--name') ?? slugOf(src);
  const out = join(ROOT, 'vendor', slug);
  if (existsSync(out) && !argv.includes('--force')) { console.error(`vendor/${slug}/ already exists - pass --force to write over it, or --name another`); return 1; }
  const { manifest, files, inventory, report } = unpackDfmod(new Uint8Array(readFileSync(src)));
  mkdirSync(out, { recursive: true });
  for (const [rel, data] of files) {
    const path = join(out, rel === '__manifest__' ? `${slug}.dfmod.json` : rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  writeFileSync(join(out, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  if (!existsSync(join(out, 'README.md'))) writeFileSync(join(out, 'README.md'), readmeOf(slug, manifest, src, inventory));
  const extra = at('--extra');
  if (extra && existsSync(extra)) cpSync(extra, join(out, 'Extra'), { recursive: true });
  console.log(`${manifest?.ModTitle ?? slug} ${manifest?.ModVersion ?? ''} -> vendor/${slug}/ (${files.size} files)`);
  for (const [k, v] of Object.entries(inventory)) console.log(`  ${k}: ${v.length}`);
  for (const line of report) console.log(`  ${line}`);
  if (!manifest) console.log('  no manifest found in the bundle');
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
