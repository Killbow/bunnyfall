#!/usr/bin/env node
// Checks or writes every vendored Daggerfall Enemy Expansion file from the shipped bundle and the local ARENA2.
// Run: node tools/dexExtract.mjs <arena2> "<path>/daggerfall enemy expansion.dfmod" [--write].

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { DFPalette } from '../src/formats/dfPalette.js';
import { composeDerivedPicture, deriveSpec } from '../src/formats/derivedTexture.js';
import { readCsvTable, parseCsInt } from '../src/mods/enemyExpansion/dexCsv.js';
import { readPng } from './pngIO.mjs';
import { encodeSprite, sameOnScreen } from './diverseWeaponsExtract.mjs';
import { classicRecords, findClassicSource } from './detailedShipsAssets.mjs';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEX_GUID = '76557441-7025-402e-a145-e3e1a28a093d';
export const VENDOR_DIR = 'vendor/daggerfall-enemy-expansion';
export const OWN_DIR = 'public/art/daggerfall-enemy-expansion';
export const REPAINT_DIR = 'public/art/daggerfall-enemy-expansion-repainted';
export const ART_INDEX = 'src/mods/enemyExpansion/dexArt.js';
export const TABLE_TEXT = 'src/mods/enemyExpansion/dexTableText.js';
export const REPAINTED_ARCHIVES = Object.freeze([1504, 1505, 1509, 1511, 1512, 1530, 1531, 1532, 1533, 1609]);

export const SILHOUETTE_IOU = 0.6;
export const SILHOUETTE_TRACED = 0.25;
export const SILHOUETTE_ALLOWED = Object.freeze({
  1603: "the Bat (mobile 260), the 1995 demo's: its outline is the retail bat's, TEXTURE.289, on 24 of its 45 pictures. The demo's art is the mod's own, not the retail ARENA2 the doctrine names (Mac, 2026-10-19: \"Mod art, ship it\"; bible/04-Characters/Enemy-Expansion.md section 2)",
});

export function outlineOf(pic) {
  const { width: w, height: h, data } = pic;
  const m = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < m.length; i++) if (data[i * 4 + 3] !== 0) { m[i] = 1; n++; }
  return n === 0 || n === m.length ? null : { w, h, m };
}

export function outlinesBySize(records) {
  const out = new Map();
  for (const r of records) {
    const o = outlineOf(r.rgba);
    if (!o) continue;
    const k = `${o.w}x${o.h}`;
    (out.get(k) ?? out.set(k, []).get(k)).push({ archive: r.archive, record: r.record, frame: r.frame, o });
  }
  return out;
}

function overlap(a, b, scale, mirrored) {
  let both = 0, either = 0;
  for (let y = 0; y < a.h; y++) {
    const row = ((y / scale) | 0) * b.w;
    for (let x = 0; x < a.w; x++) {
      const bx = (x / scale) | 0;
      const p = a.m[y * a.w + x], q = b.m[row + (mirrored ? b.w - 1 - bx : bx)];
      if (p | q) { either++; if (p & q) both++; }
    }
  }
  return either ? both / either : 0;
}

export function bestTrace(pic, outlines) {
  const a = outlineOf(pic);
  if (!a) return null;
  let best = { iou: 0, from: null, scale: 1, mirrored: false };
  for (const scale of [1, 2]) {
    if (a.w % scale || a.h % scale) continue;
    for (const c of outlines.get(`${a.w / scale}x${a.h / scale}`) ?? []) {
      for (const mirrored of [false, true]) {
        const iou = overlap(a, c.o, scale, mirrored);
        if (iou > best.iou) best = { iou, from: [c.archive, c.record, c.frame], scale, mirrored };
      }
    }
  }
  return best;
}

export function silhouetteLedger(records) {
  const outlines = outlinesBySize(records);
  const by = new Map();
  const traced = () => [...by.values()].filter((e) => e.of > 0 && e.traced >= SILHOUETTE_TRACED * e.of).sort((x, y) => x.archive - y.archive);
  return {
    measure(archive, name, pic) {
      const t = bestTrace(pic, outlines);
      if (!t) return;
      const e = by.get(archive) ?? by.set(archive, { archive, of: 0, traced: 0, best: null }).get(archive);
      e.of++;
      if (t.iou >= SILHOUETTE_IOU) e.traced++;
      if (!e.best || t.iou > e.best.iou) e.best = { name, ...t };
    },
    traced,
    refusals({ repainted = REPAINTED_ARCHIVES, allowed = SILHOUETTE_ALLOWED } = {}) {
      const found = traced(), out = [];
      const said = (e) => `${e.traced} of its ${e.of} pictures trace a TEXTURE frame's outline (${e.best.from ? `${e.best.name} follows TEXTURE.${String(e.best.from[0]).padStart(3, '0')} record ${e.best.from[1]} frame ${e.best.from[2]}${e.best.scale > 1 ? ' at twice its size' : ''}, IoU ${e.best.iou.toFixed(3)}` : 'no frame is of any of their sizes'})`;
      for (const e of found) {
        if (repainted.includes(e.archive) || Object.hasOwn(allowed, e.archive)) continue;
        out.push(`${e.archive}: ${said(e)} - Daggerfall's sprite under the authors' paint, which ships only as Port-Doctrine's fourth exception carries it (REPAINTED_ARCHIVES) or as the owner allows it (SILHOUETTE_ALLOWED, with the reason)`);
      }
      const at = new Set(found.map((e) => e.archive));
      for (const a of repainted) if (!at.has(a)) out.push(`${a}: REPAINTED_ARCHIVES names it and the measure finds no repaint (${by.has(a) ? said(by.get(a)) : 'no picture of it measured'}) - the exception names what the measure finds`);
      for (const a of Object.keys(allowed).map(Number)) if (!at.has(a)) out.push(`${a}: SILHOUETTE_ALLOWED names it and the measure finds nothing to allow (${by.has(a) ? said(by.get(a)) : 'no picture of it measured'})`);
      return out;
    },
  };
}

// DFU draws a mod's pictures for a classic archive only when the bundle replaces its record 0, frame 0.
export function drawnClassic(archive, names, arena2) {
  const classic = existsSync(join(arena2, `TEXTURE.${String(archive).padStart(3, '0')}`));
  return !classic || names.has(`${archive}_0-0`);
}

export const VERBATIM_TEXT = Object.freeze({
  'DaggerfallBestiaryProject.dfmod': 'daggerfall-enemy-expansion.dfmod.json',
  modsettings: 'modsettings.json',
  'MonsterBase.mdb': 'MonsterBase.mdb.csv',
  'ClassBase.mdb': 'ClassBase.mdb.csv',
  'CareerBase.cdb': 'CareerBase.cdb.csv',
  'ClassicMonsterReplacement.mdb': 'ClassicMonsterReplacement.mdb.csv',
  'ClassicClassBase.mdb': 'ClassicClassBase.mdb.csv',
  'DefaultTableReplacement.tdb': 'DefaultTableReplacement.tdb.csv',
  SpellRecords: 'SpellRecords.json',
  '1618_20.imported': 'Prefabs/1618_20.imported.json',
  'Daggerfall Enemy Expansion.dll': 'Daggerfall Enemy Expansion.dll',
});

export const PREFAB_COMPONENTS = Object.freeze({ '1618_20': 'Prefabs/1618_20.components.json' });
const UNITY_CLASS = Object.freeze({ 4: 'Transform', 23: 'MeshRenderer', 33: 'MeshFilter', 65: 'BoxCollider', 114: 'MonoBehaviour', 135: 'SphereCollider', 136: 'CapsuleCollider' });
export function prefabComponents(assets, name) {
  for (const a of assets) {
    const byId = new Map(a.objects.map((o) => [String(o.pathId), o]));
    for (const o of a.objects) {
      if (o.classId !== 1) continue;
      const g = o.read();
      if (g.m_Name !== name) continue;
      const components = (g.m_Component ?? []).map((c) => {
        const co = byId.get(String((c.component ?? c).m_PathID));
        if (!co) throw new Error(`${name}: a component outside the asset`);
        const body = co.read(), out = { class: UNITY_CLASS[co.classId] ?? `#${co.classId}` };
        if (co.classId === 114) {
          out.script = byId.get(String(body.m_Script.m_PathID))?.read().m_ClassName ?? null;
          for (const [k, v] of Object.entries(body)) if (!k.startsWith('m_') && (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')) out[k] = v;
        } else if (co.classId === 135) Object.assign(out, { m_IsTrigger: body.m_IsTrigger, m_Radius: body.m_Radius, m_Center: body.m_Center });
        return out;
      });
      return `${JSON.stringify({ GameObject: name, Components: components }, null, 1)}\n`;
    }
  }
  throw new Error(`the bundle carries no GameObject ${name}`);
}

const sha = (b) => createHash('sha256').update(b).digest('hex');
const NAME = /^(\d+)_(\d+)-(\d+)(?:_([A-Za-z]+))?$/;

export function archivesDrawn(text) {
  const out = new Set();
  for (const name of ['MonsterBase.mdb', 'ClassBase.mdb', 'ClassicMonsterReplacement.mdb', 'ClassicClassBase.mdb']) {
    const t = readCsvTable(text(name));
    for (const col of ['MaleTexture', 'FemaleTexture', 'CorpseTextureArchive', 'FemaleCorpseTextureArchive']) {
      const c = t.column(col);
      if (c == null) continue;
      for (const r of t.rows) if (r.tokens[c]) out.add(parseCsInt(r.tokens[c]));
    }
  }
  const prefab = JSON.parse(text('1618_20.imported'));
  for (const c of prefab.Components) for (const k of ['Archive', 'AshArchive']) if (Number.isInteger(c[k])) out.add(c[k]);
  return out;
}

export function readXml(xmlByName) {
  const scale = {}, emission = {};
  for (const [name, text] of Object.entries(xmlByName)) {
    const sx = /<scaleX>\s*([-\d.]+)\s*<\/scaleX>/.exec(text), sy = /<scaleY>\s*([-\d.]+)\s*<\/scaleY>/.exec(text);
    const em = /<emission>\s*(\w+)\s*<\/emission>/i.exec(text);
    const m = /^(\d+)_(\d+)-(\d+)$/.exec(name), a = /^(\d+)$/.exec(name);
    if (m && (sx || sy)) ((scale[m[1]] ??= {})[m[2]] = [sx ? Number(sx[1]) : 1, sy ? Number(sy[1]) : 1]);
    if (a && em) emission[a[1]] = em[1].toLowerCase() === 'true';
  }
  return { scale, emission };
}

const listing = (title, version, author, bundleSha, note, files) => `${JSON.stringify({
  ModTitle: title, ModVersion: version, ModAuthor: author,
  Source: 'https://www.nexusmods.com/daggerfallunity/mods/372',
  Bundle: 'Mods/daggerfall enemy expansion.dfmod', BundleSha256: bundleSha, Note: note,
  Files: Object.keys(files).sort(), Sha256: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))),
}, null, 2)}\n`;

export function tableFilesInManifestOrder(manifest) {
  const wanted = new Set(['.cdb.csv', '.mdb.csv', '.tdb.csv']);
  const tables = manifest.Files.map((f) => f.slice(f.lastIndexOf('/') + 1)).filter((n) => [...wanted].some((x) => n.endsWith(x)));
  return [...tables, 'SpellRecords.json', 'Prefabs/1618_20.imported.json'];
}

export function renderTableText(entries, version) {
  const rows = entries.map(([name, text]) => `  ${JSON.stringify(name)}: ${JSON.stringify(text)},`);
  return `// GENERATED by tools/dexExtract.mjs from the shipped bundle (Daggerfall Enemy Expansion ${version}) - do not edit.
// The mod's tables, its spell records and its troll corpse prefab as TEXT, each the bytes of the vendored file of the
// same name under vendor/daggerfall-enemy-expansion/ exactly, in the manifest's order (BestiaryMod.GetDBAssets walks
// its Files): what systems/enemyExpansion/dexTables.js reads with the mod's own CSV helpers, as the mod reads them.
export const DEX_TABLE_TEXT = Object.freeze({
${rows.join('\n')}
});
`;
}

export function renderArtIndex(index, version) {
  const rows = Object.keys(index).map(Number).sort((a, b) => a - b).map((a) => `  ${a}: ${JSON.stringify(index[a])},`);
  return `// GENERATED by tools/dexExtract.mjs from the shipped bundle (Daggerfall Enemy Expansion ${version}) and the player's
// own ARENA2 - do not edit. Per archive the mod's tables draw: where its pictures come from (\`own\` - the authors'
// renders under ${OWN_DIR}/; \`repainted\` - Port-Doctrine's fourth exception, under ${REPAINT_DIR}/;
// \`derived\` - rebuilt from the player's own records, vendor/daggerfall-enemy-expansion/derived.json), each record's
// frames as DFU imports them (\`frames\`, by record: frame 0 to the first one missing - a picture past a gap is shipped
// and never drawn, as in DFU), the frames carrying an emission map (\`emissive\`: record -> frames), the archive's own
// xml emission flag (\`emission\`: a frame with no map of its own lights its albedo) and each record's xml scale
// (\`scale\`: record -> [x, y]). A picture derived.json names is rebuilt whatever its archive's \`from\` says (a set of
// the authors' with one record's picture in it).
export const DEX_ART = Object.freeze({
${rows.join('\n')}
});
`;
}

export function dexAssets(arena2, bundleBytes) {
  const bundle = readUnityBundle(bundleBytes);
  const textByName = new Map(bundle.textAssets.map((t) => [t.name, t]));
  const text = (name) => { const t = textByName.get(name); if (!t) throw new Error(`the bundle carries no ${name}`); return t.text; };
  const manifest = JSON.parse(text('DaggerfallBestiaryProject.dfmod'));
  if (manifest.GUID !== DEX_GUID) throw new Error(`the bundle is ${manifest.ModTitle} (${manifest.GUID}), not Daggerfall Enemy Expansion`);
  const out = {};
  for (const [name, path] of Object.entries(VERBATIM_TEXT)) out[`${VENDOR_DIR}/${path}`] = textByName.get(name).bytes;
  for (const [name, path] of Object.entries(PREFAB_COMPONENTS)) out[`${VENDOR_DIR}/${path}`] = prefabComponents(bundle.assets, name);
  const xmlByName = {};
  for (const t of bundle.textAssets) if (/^\d+(_\d+-\d+)?$/.test(t.name) && /<info>/.test(t.text)) xmlByName[t.name] = t.text;
  out[`${VENDOR_DIR}/Textures/xml.json`] = `${JSON.stringify(Object.fromEntries(Object.entries(xmlByName).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1)}\n`;
  const { scale, emission } = readXml(xmlByName);

  const drawn = archivesDrawn(text);
  const textures = bundle.textures.filter((t) => NAME.test(t.name));
  const names = new Set(textures.map((t) => t.name));
  const wears = (a) => drawn.has(a) && drawnClassic(a, names, arena2);
  const carried = textures.filter((t) => wears(Number(NAME.exec(t.name)[1])));
  const notCarried = [...new Set(textures.filter((t) => !wears(Number(NAME.exec(t.name)[1]))).map((t) => Number(NAME.exec(t.name)[1])))].sort((a, b) => a - b);

  const palette = new DFPalette();
  palette.load(new Uint8Array(readFileSync(join(arena2, 'ART_PAL.COL'))), 'ART_PAL.COL');
  const records = [...classicRecords(arena2, palette)];
  const keyOf = (p) => { const d = Buffer.alloc(p.data.length); for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] !== 0) { d[i] = p.data[i]; d[i + 1] = p.data[i + 1]; d[i + 2] = p.data[i + 2]; d[i + 3] = 255; } return `${p.width}x${p.height}:${sha(d)}`; };
  const exact = new Map();
  for (const r of records) { const k = keyOf(r.rgba); if (!exact.has(k)) exact.set(k, r); }
  const bySize = new Map();
  for (const r of records) for (const dw of [-1, 0, 1]) for (const dh of [-1, 0, 1]) { const k = `${r.rgba.width + dw}x${r.rgba.height + dh}`; (bySize.get(k) ?? bySize.set(k, []).get(k)).push(r); }

  const derived = {}, own = {}, repainted = {}, index = {};
  const held = {}, lit = {};
  const shipped = { own: 0, repainted: 0, indexed: 0, bytes: 0 };
  const outlines = silhouetteLedger(records);
  for (const t of carried) {
    const [, a, r, f, map] = NAME.exec(t.name);
    const archive = Number(a), record = Number(r), frame = Number(f);
    const pic = t.rgba();
    const repaint = REPAINTED_ARCHIVES.includes(archive);
    const hit = exact.get(keyOf(pic)) ?? (repaint ? null : findClassicSource(pic, bySize.get(`${pic.width}x${pic.height}`) ?? []));
    const entry = (index[archive] ??= { from: null, frames: [], ...(scale[archive] ? { scale: scale[archive] } : {}), ...(emission[archive] ? { emission: true } : {}) });
    if (!map || map === 'Emission') (((map ? lit : held)[archive] ??= {})[record] ??= new Set()).add(frame);
    if (hit) {
      const spec = deriveSpec([hit.archive, hit.record, hit.frame], pic, hit.rgba, hit.at ?? [0, 0]);
      if (!sameOnScreen(composeDerivedPicture(spec, hit.rgba), pic)) throw new Error(`${t.name}: the rebuild from ${hit.archive}_${hit.record}-${hit.frame} differs from the texel`);
      derived[t.name] = spec;
      entry.derived = (entry.derived ?? 0) + 1;
      continue;
    }
    if (!map) outlines.measure(archive, t.name, pic);
    const { png, indexed } = encodeSprite(pic);
    if (!sameOnScreen(pic, readPng(png))) throw new Error(`${t.name}: the PNG read back differs from the texel`);
    (repaint ? repainted : own)[`${t.name}.png`] = sha(png);
    out[`${repaint ? REPAINT_DIR : OWN_DIR}/${t.name}.png`] = png;
    shipped[repaint ? 'repainted' : 'own']++; shipped.indexed += indexed ? 1 : 0; shipped.bytes += png.length;
  }
  const refused = outlines.refusals();
  if (refused.length) throw new Error(`the silhouette guard refuses ${refused.length}:\n${refused.join('\n')}`);
  for (const [a, e] of Object.entries(index)) {
    const total = textures.filter((t) => Number(NAME.exec(t.name)[1]) === Number(a)).length;
    e.from = e.derived === total ? 'derived' : REPAINTED_ARCHIVES.includes(Number(a)) ? 'repainted' : 'own';
    delete e.derived;
    const h = held[a] ?? {}, l = lit[a] ?? {};
    const records = Math.max(...Object.keys(h).map(Number)) + 1;
    // DFU imports a record's frames from 0 up to the first missing one.
    e.frames = Array.from({ length: records }, (_, r) => { let n = 0; while (h[r]?.has(n)) n++; return n; });
    const emissive = {};
    for (const [r, set] of Object.entries(l)) { const fs = [...set].filter((f) => f < e.frames[r]).sort((x, y) => x - y); if (fs.length) emissive[r] = fs; }
    if (Object.keys(emissive).length) e.emissive = emissive;
  }
  const bundleSha = sha(bundleBytes);
  const v = manifest.ModVersion, who = manifest.ModAuthor;
  out[`${VENDOR_DIR}/derived.json`] = `{\n${Object.entries(derived).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, s]) => `${JSON.stringify(k)}: ${JSON.stringify(s)}`).join(',\n')}\n}\n`;
  out[`${VENDOR_DIR}/daggerfall-enemy-expansion.files.json`] = listing(manifest.ModTitle, v, who, bundleSha,
    `Generated by tools/dexExtract.mjs from the shipped bundle - not written by hand. Every file under ${OWN_DIR}/: the authors' own enemy sprites (and their emission maps) for every archive the mod's tables draw, re-encoded as indexed PNG where the picture fits one, each read back against its texel. A picture any classic record covers is not here (derived.json rebuilds it from the player's own ARENA2) and neither is a repaint (repainted.files.json). The authority test/tooling/doctrine.test.js reads for what may stand in that directory.`, own);
  out[`${VENDOR_DIR}/repainted.files.json`] = listing(manifest.ModTitle, v, who, bundleSha,
    `Generated by tools/dexExtract.mjs from the shipped bundle - not written by hand. Every file under ${REPAINT_DIR}/: the archives Port-Doctrine's fourth exception carries (Mac, 2026-10-19) - ${REPAINTED_ARCHIVES.join(', ')} - Daggerfall's own sprites under the authors' paint, re-encoded losslessly. The authority test/tooling/doctrine.test.js reads for what may stand in that directory.`, repainted);
  out[ART_INDEX] = renderArtIndex(index, v);
  const decode = (b) => new TextDecoder('utf-8').decode(b);
  out[TABLE_TEXT] = renderTableText(tableFilesInManifestOrder(manifest).map((f) => [f, decode(out[`${VENDOR_DIR}/${f}`])]), v);
  return { out, report: { carried: carried.length, derived: Object.keys(derived).length, ...shipped, notCarried, archives: Object.keys(index).length, traced: outlines.traced() } };
}

if (isMain(import.meta.url)) {
  const [arena2, src] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const write = process.argv.includes('--write');
  if (!arena2 || !src) { console.error('usage: node tools/dexExtract.mjs <arena2> "<daggerfall enemy expansion.dfmod>" [--write]'); process.exit(2); }
  const t0 = Date.now();
  const { out, report } = dexAssets(arena2, new Uint8Array(readFileSync(src)));
  console.log(`${report.carried} pictures of ${report.archives} archives: ${report.derived} derived from the player's records, ${report.own} own and ${report.repainted} repainted shipped (${report.indexed} indexed), ${(report.bytes / 1e6).toFixed(1)} MB; not carried (no table draws them, or DFU never wears them): ${report.notCarried.join(', ')}; ${Date.now() - t0} ms`);
  console.log(`following Daggerfall's outlines (the silhouette guard): ${report.traced.map((e) => `${e.archive} ${e.traced}/${e.of}${Object.hasOwn(SILHOUETTE_ALLOWED, e.archive) ? ' (allowed)' : ''}`).join(', ')}`);
  const wanted = new Set(Object.keys(out));
  if (write) {
    for (const dir of [OWN_DIR, REPAINT_DIR]) {
      mkdirSync(join(ROOT, dir), { recursive: true });
      for (const f of readdirSync(join(ROOT, dir))) if (!wanted.has(`${dir}/${f}`)) unlinkSync(join(ROOT, dir, f));
    }
    for (const [p, b] of Object.entries(out)) { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), b); }
    console.log(`wrote ${wanted.size} files`);
  } else {
    const bad = Object.entries(out).filter(([p, b]) => !existsSync(join(ROOT, p)) || Buffer.compare(readFileSync(join(ROOT, p)), Buffer.from(b)) !== 0).map(([p]) => p);
    for (const dir of [OWN_DIR, REPAINT_DIR]) if (existsSync(join(ROOT, dir))) for (const f of readdirSync(join(ROOT, dir))) if (!wanted.has(`${dir}/${f}`)) bad.push(`${dir}/${f} (a stranger)`);
    if (bad.length) { console.error(`${bad.length} files differ from what the bundle makes:\n${bad.slice(0, 20).join('\n')}`); process.exit(1); }
    console.log('the tree is what the bundle makes');
  }
}
