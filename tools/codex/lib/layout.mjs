// Repository layout detection, optional dual-layout path overlays, and manifest helpers.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** @param {string} root @returns {'clean' | 'main'} */
export function detectLayout(root) {
  const cleanProbes = [
    'server/src/message/frames/index.js',
    'src/saves/save.js',
    'selfhost/node/start.mjs',
  ];
  return cleanProbes.some((rel) => existsSync(resolve(root, rel))) ? 'clean' : 'main';
}

/**
 * @param {string | null | undefined} [overlayPath]
 * @returns {{ path: string, mainToClean: Record<string, string[]>, cleanToMain: Record<string, string[]> } | null}
 */
export function loadPathOverlay(overlayPath) {
  const chosen = overlayPath || process.env.CODEX_PATH_OVERLAY || '';
  if (!chosen) return null;
  const abs = resolve(chosen);
  if (!existsSync(abs)) return null;
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const toArrayMap = (obj) => {
    /** @type {Record<string, string[]>} */
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = [v];
      else if (Array.isArray(v)) out[k] = v.map(String).filter(Boolean);
    }
    return out;
  };
  const mainToClean = toArrayMap(raw.mainToClean);
  const cleanToMain = toArrayMap(raw.cleanToMain);
  for (const [mPath, cPaths] of Object.entries(mainToClean)) {
    for (const cPath of cPaths) {
      if (!cleanToMain[cPath]) cleanToMain[cPath] = [];
      if (!cleanToMain[cPath].includes(mPath)) cleanToMain[cPath].push(mPath);
    }
  }
  return { path: abs, mainToClean, cleanToMain };
}

/** @param {string | null | undefined} [manifestPath] @returns {{ path: string, layout: string, files: Set<string> } | null} */
export function loadManifest(manifestPath) {
  const chosen = manifestPath || process.env.CODEX_CLEAN_MANIFEST || '';
  if (!chosen) return null;
  const abs = resolve(chosen);
  if (!existsSync(abs)) return null;
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.files) ? raw.files : [];
  const layout = typeof raw?.layout === 'string' ? raw.layout : 'clean';
  return { path: abs, layout, files: new Set(list.map(String)) };
}

/**
 * @param {string} relPath
 * @param {'main' | 'clean'} layout
 * @param {ReturnType<typeof loadPathOverlay>} overlay
 * @returns {string[]}
 */
export function mapFileForLayout(relPath, layout, overlay) {
  if (!overlay) return [relPath];
  if (layout === 'clean' && overlay.mainToClean[relPath]?.length) {
    return [relPath, ...overlay.mainToClean[relPath].filter((p) => p !== relPath)];
  }
  if (layout === 'main' && overlay.cleanToMain[relPath]?.length) {
    return [relPath, ...overlay.cleanToMain[relPath].filter((p) => p !== relPath)];
  }
  return [relPath];
}

/**
 * @param {'main' | 'clean'} layout
 * @param {{ extraCardsDirs?: string[] }} [options]
 * @returns {string[]}
 */
export function resolveExtraCardsDirs(layout, options = {}) {
  const dirs = [];
  if (Array.isArray(options.extraCardsDirs)) {
    for (const d of options.extraCardsDirs) if (d && existsSync(resolve(d))) dirs.push(resolve(d));
  }
  const envDir = process.env.CODEX_EXTRA_CARDS_DIR;
  if (envDir && layout === 'clean' && existsSync(resolve(envDir))) {
    const abs = resolve(envDir);
    if (!dirs.includes(abs)) dirs.push(abs);
  }
  return dirs;
}
