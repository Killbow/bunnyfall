#!/usr/bin/env node
// CLI for codex: modules, routes, schema, cards, invariants, diff, moved paths, and DFU C# lookup.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodex, resolveRoot } from './engine.mjs';

function loadMoveChains(repoRoot) {
  const ledgerPath = join(repoRoot, 'tools', 'moveLedger.json');
  if (!existsSync(ledgerPath)) return [];
  let rows = [];
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    if (Array.isArray(raw)) rows = raw.filter((r) => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string');
  } catch {
    return [];
  }
  const nextMap = new Map();
  for (const [from, to] of rows) nextMap.set(from, to);
  const chains = [];
  const seenFrom = new Set();
  for (const [from] of rows) {
    if (seenFrom.has(from)) continue;
    seenFrom.add(from);
    let cur = from;
    const visited = new Set([cur]);
    while (nextMap.has(cur)) {
      const nxt = nextMap.get(cur);
      if (!nxt || visited.has(nxt)) break;
      visited.add(nxt);
      cur = nxt;
    }
    if (cur !== from) chains.push({ from, to: cur, exists: existsSync(join(repoRoot, cur)) });
  }
  return chains;
}

function parseArgs(argv) {
  const flags = {
    json: false,
    force: false,
    noCache: false,
    limit: 25,
    write: null,
    root: null,
    overlay: null,
    manifest: null,
    file: null,
    route: null,
    table: null,
    domain: null,
    fields: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--no-cache') flags.noCache = true;
    else if (a === '--limit' && argv[i + 1]) flags.limit = Number(argv[++i]);
    else if (a === '--write' && argv[i + 1]) flags.write = argv[++i];
    else if (a === '--root' && argv[i + 1]) flags.root = argv[++i];
    else if (a === '--overlay' && argv[i + 1]) flags.overlay = argv[++i];
    else if (a === '--manifest' && argv[i + 1]) flags.manifest = argv[++i];
    else if (a === '--file' && argv[i + 1]) flags.file = argv[++i];
    else if (a === '--route' && argv[i + 1]) flags.route = argv[++i];
    else if (a === '--table' && argv[i + 1]) flags.table = argv[++i];
    else if (a === '--domain' && argv[i + 1]) flags.domain = argv[++i];
    else if (a === '--fields' && argv[i + 1]) flags.fields = argv[++i];
    else positional.push(a);
  }
  return { cmd: positional[0] ?? 'help', rest: positional.slice(1), flags };
}

function usage() {
  return [
    'Usage: npm run codex -- <command> [args] [--json] [--root <dir>] [--no-cache]',
    '',
    'Commands:',
    '  module <file-or-dir>               AST exports, imports, callers, and line/binding metrics',
    '  routes [filter]                    HTTP account/relay routes, WS room frames, and save hooks',
    '  schema [filter]                    D1 SQLite tables/columns/indexes and room KV storage keys',
    '  cards [query]                      List all concept cards or search by keyword',
    '  card <slug> [--write <file>]       Read a concept card or validate and write one from a file',
    '  bible <path>                       Resolve a legacy bible/*.md citation path to concept cards',
    '  invariants [query]                 Query card invariants and traps (--file, --route, --table, --domain, --limit, --fields slugs|full)',
    '  moved <path-or-substr>             Resolve pre-PR-#130 paths via tools/moveLedger.json',
    '  diff [baseRef] [headRef]           Show concept cards impacted by changed files in git diff or status',
    '  dfu-fetch [--force]                Shallow sparse checkout of Daggerfall Unity Assets/Scripts',
    '  dfu-search <query> [--limit <n>]   Search Daggerfall Unity and vendored C# sources',
    '  dfu-read <file> [start] [end]      Read line-numbered C# excerpt (supports file:start-end)',
    '  check [--overlay <f>] [--manifest <f>]  Verify live routes, schema, cards, and DFU cache',
  ].join('\n');
}

/** @param {string[]} [argv] */
export function runCli(argv = process.argv.slice(2)) {
  const { cmd, rest, flags } = parseArgs(argv);

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(usage());
    return 0;
  }

  const codex = createCodex({
    root: flags.root ?? undefined,
    overlayPath: flags.overlay ?? undefined,
    manifestPath: flags.manifest ?? undefined,
    useCache: !flags.noCache,
    allowWrite: true,
  });

  const out = (data, renderText) => {
    if (flags.json) console.log(JSON.stringify(data, null, 2));
    else console.log(renderText(data));
  };

  if (cmd === 'moved' || cmd === 'move') {
    const q = (rest[0] ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!q) {
      console.error('Usage: codex moved <path-or-substr>');
      return 1;
    }
    const repoRoot = resolveRoot(flags.root ?? undefined);
    const chains = loadMoveChains(repoRoot);
    const qLc = q.toLowerCase();
    const exact = chains.filter((c) => c.from.toLowerCase() === qLc || c.to.toLowerCase() === qLc);
    const hits = (exact.length ? exact : chains.filter((c) => c.from.toLowerCase().includes(qLc) || c.to.toLowerCase().includes(qLc))).slice(0, flags.limit);
    if (!hits.length) {
      if (existsSync(join(repoRoot, q))) {
        out({ query: q, unchanged: true, matches: [{ from: q, to: q, exists: true }] }, () => `${q} -> ${q} (unchanged, exists)`);
        return 0;
      }
      console.error(`No moveLedger entry matched: ${q}`);
      return 1;
    }
    out({ query: q, count: hits.length, matches: hits }, (d) =>
      d.matches.map((m) => `${m.from} -> ${m.to}${m.exists ? '' : ' (missing)'}`).join('\n'));
    return 0;
  }

  if (cmd === 'module') {
    const target = rest[0];
    if (!target) {
      console.error('Usage: codex module <file-or-dir>');
      return 1;
    }
    let resolvedNote = null;
    let res = codex.queryModule(target);
    if (!res) {
      const repoRoot = resolveRoot(flags.root ?? undefined);
      const norm = target.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      const hit = loadMoveChains(repoRoot).find((c) => c.from.toLowerCase() === norm && c.exists);
      if (hit) {
        res = codex.queryModule(hit.to);
        if (res) resolvedNote = `(Resolved via tools/moveLedger.json: ${hit.from} -> ${hit.to})`;
      }
    }
    if (!res) {
      console.error(`No module or directory matched: ${target}`);
      return 1;
    }
    if (resolvedNote && !flags.json) console.log(resolvedNote);
    out(res, (d) => {
      if (d.kind === 'matches') {
        return `Multiple modules matched "${d.query}":\n` + d.candidates.map((c) => `  ${c}`).join('\n');
      }
      if (d.kind === 'directory') {
        const head = `${d.path}/ [${d.layout}] (${d.fileCount} files, ${d.totals.totalLines} lines, ${d.totals.exportCount} exports, ${d.totals.externalCallerCount} external callers)`;
        const rows = d.modules.slice(0, 60).map((m) => `  ${m.file} (${m.lines}L, ${m.exports.length} exports, ${m.inboundCallerCount} callers)`);
        if (d.modules.length > 60) rows.push(`  ... (${d.modules.length - 60} more files)`);
        return [head, ...rows].join('\n');
      }
      const m = d.metrics;
      const lines = [
        `${d.file} [${d.layout}] (${m.totalLines} lines, ${m.nonEmptyLines} non-empty, ${m.commentLines} comment, ${m.topLevelBindings} top-level bindings)`,
      ];
      if (m.hostFunctions.length) {
        lines.push(`Host functions: ${m.hostFunctions.map((h) => `${h.name}@L${h.line} (${h.bindings} bindings)`).join(', ')}`);
      }
      lines.push(`Exports (${d.exports.length}): ${d.exports.map((e) => `${e.name}@L${e.line}`).join(', ') || 'none'}`);
      lines.push(`Static imports (${d.staticImports.length}): ${d.staticImports.slice(0, 25).map((i) => `${i.resolved ?? i.specifier}@L${i.line}`).join(', ') || 'none'}`);
      if (d.staticImports.length > 25) lines.push(`  ... (${d.staticImports.length - 25} more static imports)`);
      if (d.dynamicImports.length) {
        lines.push(`Dynamic imports (${d.dynamicImports.length}): ${d.dynamicImports.map((i) => `${i.resolved ?? i.specifier}@L${i.line}`).join(', ')}`);
      }
      lines.push(`Inbound callers (${d.inboundCallers.length}): ${d.inboundCallers.slice(0, 30).map((c) => `${c.file}:${c.line}`).join(', ') || 'none'}`);
      if (d.inboundCallers.length > 30) lines.push(`  ... (${d.inboundCallers.length - 30} more callers)`);
      return lines.join('\n');
    });
    return 0;
  }

  if (cmd === 'routes') {
    const res = codex.queryRoutes(rest.join(' '));
    out(res, (d) => {
      const lines = [
        `Routes summary [${d.layout}, ws=${d.scannerStatus.wsFrames}]: ${d.counts.httpRoutes}/${d.counts.totalHttpRoutes} HTTP, ${d.counts.wsFrames}/${d.counts.totalWsFrames} WS frames, ${d.counts.saveHooks}/${d.counts.totalSaveHooks} save hooks`,
      ];
      if (d.httpRoutes.length) {
        lines.push('\nHTTP routes:');
        for (const r of d.httpRoutes.slice(0, 40)) {
          const h = r.handlers.map((s) => `${s.file}:${s.line}`).join(', ') || 'listed-only';
          lines.push(`  ${r.path} [${r.auth}, ${r.consistency}] -> ${h}`);
        }
        if (d.httpRoutes.length > 40) lines.push(`  ... (${d.httpRoutes.length - 40} more HTTP routes)`);
      }
      if (d.wsFrames.length) {
        lines.push('\nWebSocket room frames:');
        for (const f of d.wsFrames.slice(0, 60)) {
          lines.push(`  ${f.frame} (${f.handler}) -> ${f.server ?? 'missing'} | wire: ${f.wireRefs[0] ?? 'n/a'}`);
        }
      }
      if (d.saveHooks.length) {
        lines.push('\nSave hooks:');
        for (const s of d.saveHooks.slice(0, 35)) {
          const label = s.kind === 'modSaveData' ? `mod:${s.vendor}` : `fn:${s.name}`;
          lines.push(`  ${label} -> ${s.file}:${s.line}`);
        }
        if (d.saveHooks.length > 35) lines.push(`  ... (${d.saveHooks.length - 35} more save hooks)`);
      }
      return lines.join('\n');
    });
    return 0;
  }

  if (cmd === 'schema') {
    const res = codex.querySchema(rest.join(' '));
    out(res, (d) => {
      const lines = [
        `Schema [${d.layout}, keys=${d.scannerStatus.roomKeys}]: ${d.migrationCount} migrations, ${d.tableCount} tables, ${d.triggerCount} triggers (${d.matchedTableCount} matched tables, ${d.matchedRoomKeyCount} room keys)`,
      ];
      for (const t of d.tables.slice(0, 30)) {
        const pk = t.primaryKeys.length ? ` pk=(${t.primaryKeys.join(',')})` : '';
        const cols = t.columns.map((c) => `${c.name}:${c.type}`).join(', ');
        lines.push(`  ${t.name} [${t.originMigration}]${pk} -> ${cols}`);
      }
      if (d.tables.length > 30) lines.push(`  ... (${d.tables.length - 30} more tables)`);
      if (d.roomKeys.length) {
        lines.push('\nRoom KV storage keys:');
        for (const k of d.roomKeys.slice(0, 40)) {
          lines.push(`  ${k.name} (${k.pattern}) -> ${k.file}:${k.line}`);
        }
        if (d.roomKeys.length > 40) lines.push(`  ... (${d.roomKeys.length - 40} more room keys)`);
      }
      return lines.join('\n');
    });
    return 0;
  }

  if (cmd === 'cards') {
    const q = rest.join(' ').trim();
    const list = q ? codex.searchCards(q) : codex.listCards();
    out(list, (items) => {
      if (!items.length) return q ? `No cards matched "${q}".` : 'No cards found.';
      return items.map((c) => `${c.slug} [${c.domain}/${c.kind}] (${c.wordCount}w) - ${c.title}`).join('\n');
    });
    return 0;
  }

  if (cmd === 'card') {
    const slug = rest[0];
    if (!slug) {
      console.error('Usage: codex card <slug> [--write <file>]');
      return 1;
    }
    if (flags.write) {
      const content = readFileSync(resolve(flags.write), 'utf8');
      const saved = codex.writeCard(slug, content);
      out(saved, (s) => `Wrote ${s.path} (${s.wordCount} body words)`);
      return 0;
    }
    const card = codex.readCard(slug, { includeContent: true });
    if (!card) {
      console.error(`Card not found: ${slug}`);
      return 1;
    }
    out(card, (c) => c.content.trimEnd());
    return 0;
  }

  if (cmd === 'bible') {
    const target = rest.join(' ').trim();
    if (!target) {
      console.error('Usage: codex bible <bible-path>');
      return 1;
    }
    const res = codex.resolveBible(target);
    out(res, (r) => {
      if (r.cards.length) {
        const head = `Bible redirect "${r.normalized}": ${r.matchedCount} direct card(s)`;
        const rows = r.cards.map((c) => `  ${c.slug} [${c.domain}] - ${c.title}`);
        return [head, ...rows].join('\n');
      }
      const head = `No direct replacesBible mapping for "${r.normalized}".`;
      if (!r.fallbackSearch.length) return head;
      return [head, 'Nearest keyword cards:', ...r.fallbackSearch.map((c) => `  ${c.slug} [${c.domain}] - ${c.title}`)].join('\n');
    });
    return 0;
  }

  if (cmd === 'invariants') {
    const res = codex.queryInvariants({
      file: flags.file ?? undefined,
      route: flags.route ?? undefined,
      table: flags.table ?? undefined,
      domain: flags.domain ?? undefined,
      query: rest.join(' ').trim() || undefined,
      limit: flags.limit,
      fields: flags.fields ?? undefined,
    });
    out(res, (r) => {
      if (!r.results.length) return 'No matching cards found.';
      const shown = r.truncated ? `${r.results.length} of ${r.total} cards` : `${r.total} cards`;
      const lines = [`Invariants and traps (${shown}, layout=${r.layout}):`];
      for (const c of r.results) {
        lines.push(`\n${c.slug} [${c.domain}] - ${c.title}`);
        for (const inv of c.invariants) lines.push(`  invariant: ${inv}`);
        for (const trap of c.traps) lines.push(`  trap: ${trap}`);
        if (!c.invariants.length && !c.traps.length && c.summary) lines.push(`  summary: ${c.summary}`);
      }
      return lines.join('\n');
    });
    return 0;
  }

  if (cmd === 'diff') {
    const res = codex.queryDiff(rest[0] ?? '', rest[1] ?? '');
    out(res, (r) => {
      const lines = [
        `Codex diff [${r.layout}]: ${r.changedCount} changed files, ${r.impactedCards.length} impacted cards, ${r.changedMigrations.length} migrations, ${r.uncoveredFiles.length} uncovered code files`,
      ];
      if (r.impactedCards.length) {
        lines.push('\nImpacted cards:');
        for (const c of r.impactedCards) {
          const mode = c.direct ? 'direct' : 'caller';
          lines.push(`  ${c.slug} (${mode}) -> ${[...c.matchedFiles, ...c.indirectCallerMatches].slice(0, 4).join(', ')}`);
        }
      }
      if (r.uncoveredFiles.length) {
        lines.push('\nUncovered code files:');
        for (const f of r.uncoveredFiles.slice(0, 25)) lines.push(`  ${f}`);
        if (r.uncoveredFiles.length > 25) lines.push(`  ... (${r.uncoveredFiles.length - 25} more)`);
      }
      return lines.join('\n');
    });
    return 0;
  }

  if (cmd === 'dfu-fetch') {
    const res = codex.fetchDfu({ force: flags.force });
    out(res, (r) => `DFU C# reference (${r.status}): ${r.dir} (${r.csFileCount} .cs files)`);
    return 0;
  }

  if (cmd === 'dfu-search') {
    const q = rest.join(' ').trim();
    if (!q) {
      console.error('Usage: codex dfu-search <query> [--limit <n>]');
      return 1;
    }
    const res = codex.searchDfu(q, flags.limit);
    out(res, (r) => {
      const head = `DFU search "${r.query}": ${r.totalMatches} total matches (showing ${r.results.length})`;
      const rows = r.results.map((h) => `  [${h.source}] ${h.file}:${h.line}: ${h.text}`);
      return [head, ...rows].join('\n');
    });
    return 0;
  }

  if (cmd === 'dfu-read') {
    const rawTarget = rest[0];
    if (!rawTarget) {
      console.error('Usage: codex dfu-read <file> [startLine] [endLine]');
      return 1;
    }
    let file = rawTarget;
    let start = rest[1] ? Number(rest[1]) : 1;
    let end = rest[2] ? Number(rest[2]) : undefined;
    const colon = /^(.+):(\d+)(?:-(\d+))?$/.exec(rawTarget);
    if (colon) {
      file = colon[1];
      start = Number(colon[2]);
      end = colon[3] ? Number(colon[3]) : start + 80;
    }
    const res = codex.readDfu(file, start, end);
    if (!res) {
      console.error(`C# reference file not found: ${file}`);
      return 1;
    }
    out(res, (r) => `${r.file} (lines ${r.startLine}-${r.endLine} of ${r.totalLines}, source: ${r.source})\n${r.excerpt}`);
    return 0;
  }

  if (cmd === 'check') {
    const schema = codex.querySchema('');
    const routes = codex.queryRoutes('');
    const cards = codex.checkAllCards({
      overlayPath: flags.overlay ?? undefined,
      manifestPath: flags.manifest ?? undefined,
    });
    const dfu = codex.fetchDfu();
    const unservedAccountRoutes = routes.httpRoutes.filter(
      (r) => r.path.startsWith('/v1/') && !r.inServiceRoutes && !r.handlers.some((h) => h.service === 'relay'),
    );
    const ok = cards.ok && unservedAccountRoutes.length === 0 && schema.migrationCount > 0 && routes.counts.totalWsFrames > 0 && dfu.csFileCount > 0;
    const summary = {
      ok,
      layout: routes.layout,
      cacheStatus: routes.cacheStatus,
      cardsDir: cards.cardsDir,
      overlayLoaded: cards.overlayLoaded,
      manifestLoaded: cards.manifestLoaded,
      migrations: schema.migrationCount,
      tables: schema.tableCount,
      roomKeys: schema.matchedRoomKeyCount,
      httpRoutes: routes.counts.totalHttpRoutes,
      wsFrames: routes.counts.totalWsFrames,
      saveHooks: routes.counts.totalSaveHooks,
      cards: cards.cardCount,
      cardFailures: cards.failures,
      unlistedAccountRoutes: unservedAccountRoutes.map((r) => r.path),
      dfuFiles: dfu.csFileCount,
    };
    out(summary, (s) => {
      const lines = [
        `bf-codex check [${s.layout}, cache=${s.cacheStatus}]: ${s.ok ? 'PASS' : 'FAIL'}`,
        `  Schema: ${s.migrations} migrations, ${s.tables} tables, ${s.roomKeys} room KV keys`,
        `  Routes: ${s.httpRoutes} HTTP routes, ${s.wsFrames} WS frames, ${s.saveHooks} save hooks`,
        `  Cards:  ${s.cards} cards (${s.cardFailures.length} validation failures, dir=${s.cardsDir})`,
        `  DFU C#: ${s.dfuFiles} files indexed`,
      ];
      for (const f of s.cardFailures) {
        lines.push(`  FAIL card ${f.slug}: ${f.issues.map((i) => `${i.code} (${i.message})`).join('; ')}`);
      }
      for (const p of s.unlistedAccountRoutes) {
        lines.push(`  FAIL unlisted account route: ${p}`);
      }
      return lines.join('\n');
    });
    return ok ? 0 : 1;
  }

  console.error(`Unknown command: ${cmd}\n\n${usage()}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(err?.message ?? err);
    process.exitCode = 1;
  }
}
