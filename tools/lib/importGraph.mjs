// The repo's relative import graph: what a file imports and every file it reaches.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

export function importsOf(file, text, root = ROOT) {
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec || !spec.startsWith('.')) continue;
    const base = normalize(join(dirname(file), spec));
    for (const cand of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) {
      const abs = join(root, cand);
      if (existsSync(abs) && statSync(abs).isFile()) { out.push(relative(root, abs).split('\\').join('/')); break; }
    }
  }
  return out;
}

export function closureOf(test, root = ROOT, cache = new Map()) {
  const seen = new Set([test]);
  const stack = [test];
  while (stack.length) {
    const f = stack.pop();
    let deps = cache.get(f);
    if (!deps) {
      let text = '';
      try { text = readFileSync(join(root, f), 'utf8'); } catch { }
      deps = importsOf(f, text, root);
      cache.set(f, deps);
    }
    for (const d of deps) if (!seen.has(d)) { seen.add(d); stack.push(d); }
  }
  return seen;
}
