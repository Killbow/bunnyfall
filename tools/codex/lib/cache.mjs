// Atomic JSON disk cache keyed by repo root, git HEAD, and dirty-file stat fingerprint.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CACHE_VERSION = 3;

/** @param {string} root @returns {string} */
function readGitHead(root) {
  try {
    return execFileSync('git', ['-c', 'core.autocrlf=false', 'rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'no-git';
  }
}

/**
 * @param {string} root
 * @param {string} relDir
 * @param {Set<string>} skipDirs
 * @param {(name: string) => boolean} pred
 * @param {string[]} out
 */
function walkStatPaths(root, relDir, skipDirs, pred, out) {
  const absDir = resolve(root, relDir);
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkStatPaths(root, relPath, skipDirs, pred, out);
    else if (pred(entry.name)) out.push(relPath);
  }
}

/**
 * @param {string} root
 * @param {string[]} scanDirs
 * @param {Set<string>} skipDirs
 * @returns {{ head: string, fileCount: number, fingerprint: string }}
 */
export function computeWorkspaceFingerprint(root, scanDirs, skipDirs) {
  const head = readGitHead(root);
  /** @type {string[]} */
  const jsFiles = [];
  for (const dir of scanDirs) {
    walkStatPaths(root, dir, skipDirs, (name) => /\.(?:m?js|cjs)$/.test(name), jsFiles);
  }
  /** @type {string[]} */
  const sqlFiles = [];
  walkStatPaths(root, 'server-account/migrations', skipDirs, (name) => name.endsWith('.sql'), sqlFiles);

  jsFiles.sort();
  sqlFiles.sort();

  const hash = createHash('sha256');
  hash.update(`v${CACHE_VERSION}\0${head}\0`);
  for (const rel of jsFiles) {
    try {
      const st = statSync(resolve(root, rel));
      hash.update(`j:${rel}:${st.size}:${Math.trunc(st.mtimeMs)}\n`);
    } catch {
      hash.update(`j:${rel}:missing\n`);
    }
  }
  for (const rel of sqlFiles) {
    try {
      const st = statSync(resolve(root, rel));
      hash.update(`s:${rel}:${st.size}:${Math.trunc(st.mtimeMs)}\n`);
    } catch {
      hash.update(`s:${rel}:missing\n`);
    }
  }
  return {
    head,
    fileCount: jsFiles.length + sqlFiles.length,
    fingerprint: hash.digest('hex'),
  };
}

/** @param {string} cacheDir @param {string} root @returns {string} */
export function cacheFilePath(cacheDir, root) {
  const rootKey = createHash('sha256').update(resolve(root).toLowerCase()).digest('hex').slice(0, 16);
  return resolve(cacheDir, `index-v${CACHE_VERSION}-${rootKey}.json`);
}

/**
 * @param {string} cacheDir
 * @param {string} root
 * @param {string} expectedFingerprint
 */
export function readDiskCache(cacheDir, root, expectedFingerprint) {
  const filePath = cacheFilePath(cacheDir, root);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (parsed?.version !== CACHE_VERSION || parsed?.fingerprint !== expectedFingerprint) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string} cacheDir
 * @param {string} root
 * @param {string} fingerprint
 * @param {Record<string, unknown>} payload
 */
export function writeDiskCache(cacheDir, root, fingerprint, payload) {
  const filePath = cacheFilePath(cacheDir, root);
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({
    version: CACHE_VERSION,
    root: resolve(root),
    fingerprint,
    createdAt: new Date().toISOString(),
    ...payload,
  });
  try {
    writeFileSync(tmpPath, body, 'utf8');
    renameSync(tmpPath, filePath);
  } catch {
    try { rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
  }
}
