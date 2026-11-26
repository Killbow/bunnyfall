// The account service's D1 and R2 bindings over the wrangler CLI, for operator tools that call service functions.
// wrangler takes no parameters, so binds are written in as literals; run appends SELECT changes() to count rows.
// A missing R2 key returns null; other failures throw without the statement, which can name an account id.
// A dry binding answers each write as one row changed and holds it in held instead of running it.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { lit } from './sqlLit.mjs';

const WRITES = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const MISSING = /The specified key does not exist/;
export const CHANGES_SQL = 'SELECT changes() AS changes';

/**
 * @param {string} sql
 * @param {unknown[]} [args]
 */
export function literalSql(sql, args = []) {
  let out = '';
  /** @type {string | null} */
  let quote = null;
  let top = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      out += c;
      // A doubled quote closes and reopens the string, so the text is the same either way.
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c !== '?') { out += c; continue; }
    const digits = /^\d*/.exec(sql.slice(i + 1))[0];
    const n = digits ? Number(digits) : top + 1;
    if (!(n >= 1 && n <= args.length)) throw new Error(`literalSql: ?${n} binds nothing (${args.length} bound)`);
    out += lit(args[n - 1]);
    top = Math.max(top, n);
    i += digits.length;
  }
  if (quote) throw new Error('literalSql: a quote never closed');
  if (top !== args.length) throw new Error(`literalSql: ${args.length} bound, ${top} asked`);
  return out;
}

/** @param {{ command?: string, cwd?: string }} [o] */
export function wranglerExec({ command = process.env.WRANGLER || 'npx --yes wrangler@4', cwd = process.cwd() } = {}) {
  const [bin, ...pre] = command.split(/\s+/).filter(Boolean);
  return (/** @type {string[]} */ args) => {
    try {
      return execFileSync(bin, [...pre, ...args], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false', FORCE_COLOR: '0' },
      });
    } catch (e) {
      const said = String(e?.stderr ?? '').split('\n').filter((l) => /error|exist/i.test(l)).map((l) => l.trim()).join(' ');
      throw Object.assign(new Error(`wrangler ${args.slice(0, 3).join(' ')} failed (exit ${e?.status ?? '?'}): ${said || 'no words'}`), { stderr: String(e?.stderr ?? '') });
    }
  };
}

/**
 * @param {{ database: string, exec: (args: string[]) => string, where?: 'remote' | 'local', dry?: boolean, held?: string[] }} o
 */
export function wranglerD1({ database, exec, where = 'remote', dry = false, held = [] }) {
  const ask = (/** @type {string} */ sql) => {
    const out = JSON.parse(exec(['d1', 'execute', database, `--${where}`, '--json', '--yes', '--command', sql]));
    if (!Array.isArray(out) || out.some((r) => r?.success === false)) throw new Error('wrangler d1 execute: an answer that is no success');
    return out;
  };
  const rows = (/** @type {string} */ sql, /** @type {unknown[]} */ args) => {
    if (dry && WRITES.test(sql)) throw new Error('wranglerD1: a write asked for rows - a dry binding cannot answer it');
    return ask(literalSql(sql, args))[0]?.results ?? [];
  };
  return {
    prepare(/** @type {string} */ sql) {
      /** @type {unknown[]} */
      let args = [];
      const api = {
        bind(/** @type {unknown[]} */ ...a) { args = a; return api; },
        async first(/** @type {string} */ col) {
          const row = rows(sql, args)[0] ?? null;
          return col ? row?.[col] ?? null : row;
        },
        async all() { return { results: rows(sql, args), meta: {} }; },
        async run() {
          const text = literalSql(sql, args);
          if (dry && WRITES.test(sql)) {
            held.push(text);
            return { meta: { changes: 1 } };
          }
          const out = ask(`${text}; ${CHANGES_SQL}`);
          const changes = out[1]?.results?.[0]?.changes;
          if (!Number.isSafeInteger(changes)) throw new Error('wranglerD1: a write whose rows nobody counted');
          return { meta: { changes } };
        },
      };
      return api;
    },
    async batch() { throw new Error('wranglerD1: no batch - one statement a command, and no act run here asks one'); },
  };
}

/**
 * @param {{ bucket: string, exec: (args: string[]) => string, dir: string, where?: 'remote' | 'local', dry?: boolean, held?: string[] }} o
 */
export function wranglerR2({ bucket, exec, dir, where = 'remote', dry = false, held = [] }) {
  let n = 0;
  return {
    async get(/** @type {string} */ key) {
      const file = join(dir, `object-${++n}`);
      try {
        exec(['r2', 'object', 'get', `${bucket}/${key}`, `--${where}`, '--file', file]);
        const bytes = readFileSync(file);
        return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      } catch (e) {
        if (MISSING.test(String(e?.stderr ?? '')) || MISSING.test(String(e?.message ?? ''))) return null;
        throw e;
      } finally {
        // wrangler leaves an empty file behind for a missing key.
        rmSync(file, { force: true });
      }
    },
    async delete(/** @type {string} */ key) {
      if (dry) {
        held.push(`r2 object delete ${bucket}/${key}`);
        return;
      }
      exec(['r2', 'object', 'delete', `${bucket}/${key}`, `--${where}`]);
    },
  };
}
