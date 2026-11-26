// Knowledge engine for Bunnyfall: live AST module graph, HTTP/WS/save routes,
// D1 SQLite schema, plain-English concept cards, and read-only Daggerfall Unity C# lookup.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { computeWorkspaceFingerprint, readDiskCache, writeDiskCache } from './lib/cache.mjs';
import { detectLayout, loadManifest, loadPathOverlay, mapFileForLayout, resolveExtraCardsDirs } from './lib/layout.mjs';
import { classifyAccountRoutes, scanCoreSaveHooks, scanMainRoomKeys, scanMainWsFrames } from './lib/mainScanners.mjs';
import { createMigrationsTableSql, listMigrations, MIGRATIONS_TABLE } from './lib/migrations.mjs';
import { splitSqlQuery } from './lib/sqlsplit.mjs';
import { METADATA_SCHEMA } from './lib/storage.mjs';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['src', 'server/src', 'server-account/src', 'selfhost', 'app'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.wrangler', 'dist', 'dist-gun', 'dist-pistol', 'dist-poi-editor', 'parity', 'release']);
const COMMENT_LINES_MAX = 8;
const VERSION_LOG_LINE = /^\/\/\s*(?:world|acct)\d+:/;
const CARD_KINDS = new Set(['overview', 'subcard', 'trap', 'decision']);
export const MAX_CARD_WORDS = 250;
export const DFU_REPO_URL = 'https://github.com/Interkarma/daggerfall-unity.git';

const toPosix = (p) => p.split(sep).join('/');

/** @param {string} dir @returns {boolean} */
export function isBunnyfallRepo(dir) {
  return existsSync(resolve(dir, 'server-account/migrations')) && existsSync(resolve(dir, 'src/main.js'));
}

/** @param {string} [explicitRoot] @returns {string} */
export function resolveRoot(explicitRoot) {
  if (explicitRoot) {
    const abs = resolve(explicitRoot);
    if (!existsSync(abs)) {
      throw new Error(`Bunnyfall root does not exist: ${abs}`);
    }
    return abs;
  }
  let dir = resolve(process.cwd());
  while (true) {
    if (isBunnyfallRepo(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (process.env.BUNNYFALL_ROOT) {
    const envRoot = resolve(process.env.BUNNYFALL_ROOT);
    if (existsSync(envRoot)) return envRoot;
    throw new Error(`BUNNYFALL_ROOT does not exist: ${envRoot}`);
  }
  throw new Error(
    `Could not locate a Bunnyfall repository from "${process.cwd()}". Run inside a Bunnyfall checkout, pass --root <path>, or set BUNNYFALL_ROOT.`,
  );
}

/** @param {string} candidate @param {string} defaultRoot @param {string[]} [allowedRoots] @returns {string} */
export function resolveAllowedRoot(candidate, defaultRoot, allowedRoots) {
  const abs = resolve(candidate);
  if (!existsSync(abs) || !isBunnyfallRepo(abs)) {
    throw new Error(`Target root is not a valid Bunnyfall repository: ${abs}`);
  }
  const envList = (process.env.BUNNYFALL_ALLOWED_ROOTS ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => resolve(s));
  const roots = allowedRoots?.length
    ? allowedRoots.map((s) => resolve(s))
    : envList.length
      ? envList
      : [resolve(defaultRoot), dirname(resolve(defaultRoot))];

  const normAbs = abs.toLowerCase();
  const ok = roots.some((base) => {
    const normBase = base.toLowerCase();
    return normAbs === normBase || normAbs.startsWith(normBase.endsWith(sep) ? normBase : `${normBase}${sep}`);
  });
  if (!ok) {
    throw new Error(`Target root "${abs}" is outside allowed Bunnyfall roots.`);
  }
  return abs;
}

function walkFiles(root, relDir, pred, out = []) {
  const absDir = resolve(root, relDir);
  if (!existsSync(absDir)) return out;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(root, relPath, pred, out);
    else if (pred(entry.name, relPath)) out.push(relPath);
  }
  return out;
}

function commentMetrics(text) {
  let commentLines = 0;
  let run = 0;
  let inBlock = false;
  let excess = 0;
  const flush = () => {
    excess += Math.max(0, run - COMMENT_LINES_MAX);
    run = 0;
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed && !inBlock) continue;
    let isComment = false;
    if (inBlock) {
      isComment = true;
      if (trimmed.includes('*/')) inBlock = false;
    } else if (trimmed.startsWith('//')) {
      isComment = true;
    } else if (trimmed.startsWith('/*')) {
      isComment = true;
      if (!trimmed.includes('*/')) inBlock = true;
    }
    if (isComment) commentLines++;
    if (isComment && !inBlock && VERSION_LOG_LINE.test(trimmed)) {
      flush();
      continue;
    }
    if (isComment) run++;
    else flush();
  }
  excess += Math.max(0, run - COMMENT_LINES_MAX);
  return { commentLines, commentExcess: excess };
}

function collectPatternNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name);
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) {
        if (prop.type === 'RestElement') collectPatternNames(prop.argument, out);
        else collectPatternNames(prop.value, out);
      }
      break;
    case 'ArrayPattern':
      for (const el of pattern.elements) if (el) collectPatternNames(el, out);
      break;
    case 'AssignmentPattern':
      collectPatternNames(pattern.left, out);
      break;
    case 'RestElement':
      collectPatternNames(pattern.argument, out);
      break;
    default:
      break;
  }
  return out;
}

function walkAst(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) if (child && typeof child.type === 'string') walkAst(child, visit);
    } else if (val && typeof val === 'object' && typeof val.type === 'string') {
      walkAst(val, visit);
    }
  }
}

function parseJs(src, relPath) {
  const isCjs = relPath.endsWith('.cjs');
  try {
    return parse(src, { ecmaVersion: 'latest', sourceType: isCjs ? 'script' : 'module', locations: true });
  } catch {
    try {
      return parse(src, { ecmaVersion: 'latest', sourceType: isCjs ? 'module' : 'script', locations: true });
    } catch {
      return null;
    }
  }
}

function resolveImportPath(fromFile, specifier, knownSet) {
  if (!specifier || !specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  if (knownSet.has(base)) return base;
  for (const ext of ['.js', '.mjs', '.cjs', '/index.js', '/index.mjs']) {
    if (knownSet.has(base + ext)) return base + ext;
  }
  return base;
}

function analyzeFile(root, relFile, knownSet) {
  const src = readFileSync(resolve(root, relFile), 'utf8');
  const lines = src.split('\n');
  const totalLines = lines.length;
  const nonEmptyLines = lines.filter((l) => /\S/.test(l)).length;
  const { commentLines, commentExcess } = commentMetrics(src);
  const ast = parseJs(src, relFile);

  const exports = [];
  const staticImports = [];
  const dynamicImports = [];
  const hostFunctions = [];
  const stringConsts = new Map();
  let topLevelBindings = 0;

  if (ast) {
    for (const stmt of ast.body) {
      const line = stmt.loc?.start.line ?? 1;
      const unwrap = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
      if (unwrap?.type === 'VariableDeclaration') {
        for (const decl of unwrap.declarations) {
          topLevelBindings += collectPatternNames(decl.id).length;
          if (decl.id?.type === 'Identifier' && decl.init?.type === 'Literal' && typeof decl.init.value === 'string') {
            stringConsts.set(decl.id.name, decl.init.value);
          }
        }
      } else if (unwrap?.type === 'FunctionDeclaration' || unwrap?.type === 'ClassDeclaration') {
        if (unwrap.id) topLevelBindings += 1;
      }
      if (unwrap?.type === 'FunctionDeclaration' && unwrap.body?.body) {
        let fnBindings = 0;
        for (const inner of unwrap.body.body) {
          if (inner.type === 'VariableDeclaration') fnBindings += inner.declarations.length;
          else if (inner.type === 'FunctionDeclaration' || inner.type === 'ClassDeclaration') fnBindings += 1;
        }
        if (fnBindings >= 20) {
          hostFunctions.push({ name: unwrap.id?.name ?? 'anonymous', line: unwrap.loc?.start.line ?? line, bindings: fnBindings });
        }
      }

      if (stmt.type === 'ImportDeclaration') {
        const specifier = String(stmt.source.value);
        const imported = stmt.specifiers.map((sp) => {
          if (sp.type === 'ImportDefaultSpecifier') return 'default';
          if (sp.type === 'ImportNamespaceSpecifier') return `* as ${sp.local.name}`;
          return sp.imported?.name ?? sp.local.name;
        });
        staticImports.push({
          specifier,
          resolved: resolveImportPath(relFile, specifier, knownSet),
          imported,
          line,
        });
      } else if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.source) {
          const specifier = String(stmt.source.value);
          const imported = stmt.specifiers.map((sp) => sp.local?.name ?? sp.exported?.name ?? '*');
          staticImports.push({
            specifier,
            resolved: resolveImportPath(relFile, specifier, knownSet),
            imported,
            line,
          });
        }
        if (stmt.declaration) {
          const d = stmt.declaration;
          const dLine = d.loc?.start.line ?? line;
          if (d.type === 'FunctionDeclaration' && d.id) {
            exports.push({ name: d.id.name, kind: 'function', line: dLine });
          } else if (d.type === 'ClassDeclaration' && d.id) {
            exports.push({ name: d.id.name, kind: 'class', line: dLine });
          } else if (d.type === 'VariableDeclaration') {
            for (const decl of d.declarations) {
              for (const name of collectPatternNames(decl.id)) {
                exports.push({ name, kind: d.kind, line: decl.loc?.start.line ?? dLine });
              }
            }
          }
        }
        for (const sp of stmt.specifiers ?? []) {
          exports.push({
            name: sp.exported?.name ?? sp.exported?.value ?? sp.local?.name,
            kind: stmt.source ? 're-export' : 'specifier',
            line: sp.loc?.start.line ?? line,
          });
        }
      } else if (stmt.type === 'ExportDefaultDeclaration') {
        exports.push({ name: 'default', kind: 'default', line });
      } else if (stmt.type === 'ExportAllDeclaration') {
        const specifier = String(stmt.source.value);
        staticImports.push({
          specifier,
          resolved: resolveImportPath(relFile, specifier, knownSet),
          imported: ['*'],
          line,
        });
        exports.push({ name: stmt.exported ? `* as ${stmt.exported.name}` : '*', kind: 'export-all', line });
      }
    }

    walkAst(ast, (node) => {
      if (node.type === 'ImportExpression') {
        const line = node.loc?.start.line ?? 1;
        const raw = node.source?.type === 'Literal' && typeof node.source.value === 'string' ? node.source.value : '<dynamic>';
        dynamicImports.push({
          specifier: raw,
          resolved: raw !== '<dynamic>' ? resolveImportPath(relFile, raw, knownSet) : null,
          line,
        });
      }
    });
  }

  return {
    file: relFile,
    ast,
    src,
    stringConsts,
    exports,
    staticImports,
    dynamicImports,
    metrics: {
      totalLines,
      nonEmptyLines,
      commentLines,
      commentExcess,
      staticImportCount: staticImports.length,
      dynamicImportCount: dynamicImports.length,
      exportCount: exports.length,
      topLevelBindings,
      hostFunctions,
    },
  };
}

function buildWorkspaceGraph(root) {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walkFiles(root, dir, (name) => /\.(?:m?js|cjs)$/.test(name), files);
  }
  files.sort();
  const knownSet = new Set(files);
  const byFile = new Map();
  const inbound = new Map();
  for (const f of files) inbound.set(f, []);

  for (const f of files) {
    byFile.set(f, analyzeFile(root, f, knownSet));
  }

  for (const info of byFile.values()) {
    for (const imp of info.staticImports) {
      if (imp.resolved && inbound.has(imp.resolved)) {
        inbound.get(imp.resolved).push({
          file: info.file,
          imported: imp.imported,
          kind: 'static',
          line: imp.line,
        });
      }
    }
    for (const imp of info.dynamicImports) {
      if (imp.resolved && inbound.has(imp.resolved)) {
        inbound.get(imp.resolved).push({
          file: info.file,
          imported: ['*'],
          kind: 'dynamic',
          line: imp.line,
        });
      }
    }
  }

  return { files, knownSet, byFile, inbound };
}

function serializeGraph(graph) {
  /** @type {Record<string, any>} */
  const entries = {};
  for (const [file, info] of graph.byFile.entries()) {
    entries[file] = {
      file: info.file,
      exports: info.exports,
      staticImports: info.staticImports,
      dynamicImports: info.dynamicImports,
      metrics: info.metrics,
    };
  }
  /** @type {Record<string, any[]>} */
  const inboundObj = {};
  for (const [file, list] of graph.inbound.entries()) {
    inboundObj[file] = list;
  }
  return { files: graph.files, entries, inbound: inboundObj };
}

function hydrateGraph(serialized) {
  const files = serialized.files ?? [];
  const knownSet = new Set(files);
  const byFile = new Map(Object.entries(serialized.entries ?? {}));
  const inbound = new Map(Object.entries(serialized.inbound ?? {}));
  return { files, knownSet, byFile, inbound };
}

function findLineNumbers(src, needle) {
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) out.push(i + 1);
  }
  return out;
}

function buildRoutesIndex(root, graph, layout) {
  const constPaths = new Map();
  for (const info of graph.byFile.values()) {
    if (info.file.startsWith('server-account/src/') || info.file.startsWith('server/src/') || info.file.startsWith('src/net/')) {
      for (const [k, v] of info.stringConsts) {
        if (v.startsWith('/v1/') || v.startsWith('/internal/') || v.startsWith('/')) constPaths.set(k, v);
      }
    }
  }

  const serviceInfo = graph.byFile.get('server-account/src/service.js');
  const {
    listedRoutes,
    openRoutes,
    patreonOpenRoutes,
    safeOpenRoutes,
    staffRoutes,
    replicaRoutes,
    primaryFirstRoutes,
    anyReplicaRoutes,
  } = classifyAccountRoutes(serviceInfo);

  const handlerSites = new Map();
  const addSite = (map, routePath, site) => {
    if (!map.has(routePath)) map.set(routePath, []);
    const list = map.get(routePath);
    if (!list.some((s) => s.file === site.file && s.line === site.line)) list.push(site);
  };

  for (const info of graph.byFile.values()) {
    const isAcct = info.file.startsWith('server-account/src/') && info.file !== 'server-account/src/service.js';
    const isRelay = info.file.startsWith('server/src/');
    if (!isAcct && !isRelay) continue;
    const lines = info.src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      for (const m of lineText.matchAll(/['`](\/(?:v1|internal)\/[a-z0-9\-/]+)['`]/g)) {
        const p = m[1];
        if (!p.endsWith('/') && !p.endsWith('-')) {
          addSite(handlerSites, p, { file: info.file, line: i + 1, service: isRelay ? 'relay' : 'account' });
        }
      }
      for (const [constName, constVal] of constPaths) {
        if ((constVal.startsWith('/v1/') || constVal.startsWith('/internal/')) && lineText.includes(constName) && !lineText.includes(`const ${constName}`)) {
          addSite(handlerSites, constVal, { file: info.file, line: i + 1, service: isRelay ? 'relay' : 'account' });
        }
      }
    }
  }

  const clientSites = new Map();
  for (const info of graph.byFile.values()) {
    if (!info.file.startsWith('src/')) continue;
    const lines = info.src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      for (const m of lineText.matchAll(/['`](\/v1\/[a-z0-9\-/]+)['`]/g)) {
        const p = m[1];
        if (!p.endsWith('/') && !p.endsWith('-')) addSite(clientSites, p, { file: info.file, line: i + 1 });
      }
    }
  }

  const allRoutePaths = new Set([...listedRoutes, ...handlerSites.keys()]);
  const isPoiRoute = (p) => /^\/v1\/poi\/(?:live|me|list|queue|draft|submit|withdraw|retire|review|rollback|shelf|unshelve|trade|event-claim)$/.test(p);
  const httpRoutes = [...allRoutePaths].sort().map((routePath) => {
    const handlers = handlerSites.get(routePath) ?? [];
    const auth = openRoutes.has(routePath)
      ? 'open'
      : patreonOpenRoutes.has(routePath)
        ? 'patreon-open'
        : safeOpenRoutes.has(routePath)
          ? 'safe-open'
          : staffRoutes.has(routePath)
            ? 'staff-session'
            : routePath.startsWith('/internal/')
              ? 'relay-internal'
              : 'session';
    const consistency = primaryFirstRoutes.has(routePath)
      ? 'primary-first'
      : anyReplicaRoutes.has(routePath)
        ? 'any-replica'
        : replicaRoutes.has(routePath)
          ? 'replica'
          : 'primary';
    return {
      path: routePath,
      inServiceRoutes: listedRoutes.has(routePath) || isPoiRoute(routePath),
      auth,
      consistency,
      handlers,
      clientCallers: (clientSites.get(routePath) ?? []).slice(0, 8),
    };
  });

  if (serviceInfo) {
    for (const [pattern, fnName] of [
      ['/v1/realm/:id/data', 'realmPathOf'],
      ['/v1/poi/:route', 'poiPathOf'],
      ['/v1/saves/:slot', 'savePathOf'],
    ]) {
      const fnLines = findLineNumbers(serviceInfo.src, `function ${fnName}`);
      if (fnLines.length) {
        httpRoutes.push({
          path: pattern,
          inServiceRoutes: true,
          auth: 'dynamic-matcher',
          consistency: 'primary',
          handlers: [{ file: 'server-account/src/service.js', line: fnLines[0], service: 'account' }],
          clientCallers: [],
        });
      }
    }
  }

  const wireInfo = graph.byFile.get('src/net/wire.js');
  const onlineInfo = graph.byFile.get('src/net/online.js');
  const onlineWorldInfo = graph.byFile.get('src/net/onlineWorld.js');

  const findFrameRefs = (info, frameType) => {
    if (!info) return [];
    const hits = [];
    const lines = info.src.split('\n');
    const patterns = [`t: '${frameType}'`, `t:'${frameType}'`, `t === '${frameType}'`, `case '${frameType}':`, `'${frameType}'`];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (patterns.slice(0, 4).some((p) => lines[i].includes(p))) hits.push(`${info.file}:${i + 1}`);
    }
    if (!hits.length) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (lines[i].includes(patterns[4])) hits.push(`${info.file}:${i + 1}`);
      }
    }
    return hits.slice(0, 6);
  };

  let wsFrames = [];
  let wsFrameSource = 'none';
  const framesIndex = graph.byFile.get('server/src/message/frames/index.js');
  if (framesIndex) {
    wsFrameSource = 'clean-frames-map';
    const frameOrder = [];
    for (const m of framesIndex.src.matchAll(/\['([a-z0-9]+)',\s*([A-Za-z0-9_]+)\]/g)) {
      frameOrder.push({ type: m[1], handlerName: m[2] });
    }
    const seenFrameTypes = new Set(frameOrder.map((f) => f.type));
    for (const f of graph.files) {
      if (f.startsWith('server/src/message/frames/') && f !== 'server/src/message/frames/index.js') {
        const base = posix.basename(f, '.js');
        if (!seenFrameTypes.has(base)) {
          frameOrder.unshift({ type: base, handlerName: `${base}Frame` });
          seenFrameTypes.add(base);
        }
      }
    }
    wsFrames = frameOrder.map(({ type, handlerName }) => {
      const serverFile = `server/src/message/frames/${type}.js`;
      const serverInfo = graph.byFile.get(serverFile);
      const exp = serverInfo?.exports.find((e) => e.name === handlerName) ?? serverInfo?.exports[0];
      return {
        frame: type,
        handler: exp?.name ?? handlerName,
        server: serverInfo ? `${serverFile}:${exp?.line ?? 1}` : null,
        inFramesMap: type !== 'hello',
        wireRefs: findFrameRefs(wireInfo, type),
        clientRefs: [...findFrameRefs(onlineInfo, type), ...findFrameRefs(onlineWorldInfo, type)].slice(0, 8),
      };
    });
  } else if (graph.byFile.has('server/src/index.js')) {
    wsFrameSource = 'main-monolith';
    wsFrames = scanMainWsFrames(graph, findFrameRefs);
  }

  const saveHooks = [];
  for (const info of graph.byFile.values()) {
    if (!info.file.startsWith('src/') || !info.ast) continue;
    walkAst(info.ast, (node) => {
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'registerModSaveData') {
        const arg0 = node.arguments[0];
        let vendor = '<dynamic>';
        if (arg0?.type === 'Literal' && typeof arg0.value === 'string') vendor = arg0.value;
        else if (arg0?.type === 'Identifier') vendor = info.stringConsts.get(arg0.name) ?? arg0.name;
        const arg1 = node.arguments[1];
        const hooks = arg1?.type === 'ObjectExpression'
          ? arg1.properties.map((p) => p.key?.name ?? p.key?.value).filter(Boolean)
          : [];
        saveHooks.push({
          kind: 'modSaveData',
          vendor,
          file: info.file,
          line: node.loc?.start.line ?? 1,
          hooks,
        });
      }
    });
  }
  saveHooks.push(...scanCoreSaveHooks(graph));

  return {
    layout,
    scannerStatus: { wsFrames: wsFrameSource },
    httpRoutes,
    wsFrames,
    saveHooks,
  };
}

function buildSchemaIndex(root, graph, layout) {
  const migDir = resolve(root, 'server-account/migrations');
  const files = existsSync(migDir) ? listMigrations(migDir) : [];
  const db = new DatabaseSync(':memory:');
  db.exec(createMigrationsTableSql(MIGRATIONS_TABLE));

  const tableOrigin = new Map([[MIGRATIONS_TABLE, '<d1-runtime>']]);
  const tableModified = new Map([[MIGRATIONS_TABLE, []]]);
  const indexOrigin = new Map();
  const triggerOrigin = new Map();
  const prevCols = new Map();

  const snapshotColumns = (tableName) => {
    const rows = db.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`).all();
    return new Set(rows.map((r) => String(r.name)));
  };
  prevCols.set(MIGRATIONS_TABLE, snapshotColumns(MIGRATIONS_TABLE));

  for (const name of files) {
    const sql = readFileSync(resolve(migDir, name), 'utf8');
    db.exec('BEGIN');
    for (const stmt of splitSqlQuery(`${sql}\nINSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ('${name.replace(/'/g, "''")}');`)) {
      db.exec(stmt);
    }
    db.exec('COMMIT');

    const masters = db.prepare('SELECT type, name FROM sqlite_master').all();
    const liveTables = new Set();
    for (const row of masters) {
      const objName = String(row.name);
      if (row.type === 'table') {
        liveTables.add(objName);
        const cols = snapshotColumns(objName);
        if (!tableOrigin.has(objName)) {
          tableOrigin.set(objName, objName === 'sqlite_sequence' ? '<sqlite-sequence>' : name);
          tableModified.set(objName, []);
          prevCols.set(objName, cols);
        } else {
          const before = prevCols.get(objName) ?? new Set();
          if (cols.size !== before.size || [...cols].some((c) => !before.has(c))) {
            tableModified.get(objName).push(name);
            prevCols.set(objName, cols);
          }
        }
      } else if (row.type === 'index' && !objName.startsWith('sqlite_autoindex_')) {
        if (!indexOrigin.has(objName)) indexOrigin.set(objName, name);
      } else if (row.type === 'trigger') {
        if (!triggerOrigin.has(objName)) triggerOrigin.set(objName, name);
      }
    }
    for (const known of [...tableOrigin.keys()]) {
      if (!liveTables.has(known)) {
        tableOrigin.delete(known);
        tableModified.delete(known);
        prevCols.delete(known);
      }
    }
  }

  db.exec(METADATA_SCHEMA);
  if (!tableOrigin.has('_cf_METADATA')) {
    tableOrigin.set('_cf_METADATA', '<durable-metadata>');
    tableModified.set('_cf_METADATA', []);
  }

  const tableRows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  const triggerRows = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
  const triggersByTable = new Map();
  for (const tr of triggerRows) {
    const tbl = String(tr.tbl_name);
    if (!triggersByTable.has(tbl)) triggersByTable.set(tbl, []);
    triggersByTable.get(tbl).push({
      name: String(tr.name),
      originMigration: triggerOrigin.get(String(tr.name)) ?? null,
    });
  }

  const tables = tableRows.map((row) => {
    const tName = String(row.name);
    const esc = tName.replace(/"/g, '""');
    const colInfo = db.prepare(`PRAGMA table_info("${esc}")`).all();
    const columns = colInfo.map((c) => ({
      name: String(c.name),
      type: String(c.type || 'ANY'),
      notNull: Boolean(c.notnull),
      defaultValue: c.dflt_value ?? null,
      pk: Number(c.pk),
    }));
    const primaryKeys = colInfo.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((c) => String(c.name));
    const idxList = db.prepare(`PRAGMA index_list("${esc}")`).all();
    const indexes = idxList
      .filter((idx) => !String(idx.name).startsWith('sqlite_autoindex_'))
      .map((idx) => {
        const idxName = String(idx.name);
        const idxCols = db.prepare(`PRAGMA index_info("${idxName.replace(/"/g, '""')}")`).all().map((ic) => String(ic.name ?? '<expr>'));
        return {
          name: idxName,
          unique: Boolean(idx.unique),
          columns: idxCols,
          originMigration: indexOrigin.get(idxName) ?? tableOrigin.get(tName) ?? null,
        };
      });
    return {
      name: tName,
      originMigration: tableOrigin.get(tName) ?? null,
      modifiedInMigrations: tableModified.get(tName) ?? [],
      columns,
      primaryKeys,
      indexes,
      triggers: triggersByTable.get(tName) ?? [],
    };
  });
  db.close();

  const roomKeys = [];
  const seenRoomKeys = new Set();
  const pushRoomKey = (entry) => {
    const sig = `${entry.name}\0${entry.pattern}`;
    if (seenRoomKeys.has(sig)) return;
    seenRoomKeys.add(sig);
    roomKeys.push(entry);
  };
  let roomKeySource = 'none';
  const keysRel = 'server/src/room/keys.js';
  if (existsSync(resolve(root, keysRel))) {
    roomKeySource = 'clean-keys-module';
    const keysInfo = graph.byFile.get(keysRel) ?? analyzeFile(root, keysRel, new Set([keysRel]));
    if (keysInfo.ast) {
      for (const stmt of keysInfo.ast.body) {
        if (stmt.type !== 'ExportNamedDeclaration' || !stmt.declaration) continue;
        const decl = stmt.declaration;
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id?.type !== 'Identifier') continue;
            const line = d.loc?.start.line ?? 1;
            let pattern = null;
            if (d.init?.type === 'Literal') {
              pattern = String(d.init.value);
            } else if (d.init?.type === 'ArrowFunctionExpression' && d.init.body?.type === 'TemplateLiteral') {
              pattern = d.init.body.quasis.map((q) => q.value.cooked).join('${id}');
            }
            if (pattern && (pattern.includes(':') || pattern.startsWith('/internal/'))) {
              pushRoomKey({
                name: d.id.name,
                kind: d.init?.type === 'ArrowFunctionExpression' ? 'keyBuilder' : 'constant',
                pattern,
                file: keysRel,
                line,
              });
            }
          }
        }
      }
    }
    const serverInfos = [...graph.byFile.values()]
      .filter((info) => info.file.startsWith('server/src/'))
      .sort((a, b) => a.file.localeCompare(b.file));
    for (const info of serverInfos) {
      for (const entry of scanMainRoomKeys(info)) pushRoomKey(entry);
    }
  } else if (graph.byFile.has('server/src/index.js')) {
    roomKeySource = 'main-monolith';
    for (const entry of scanMainRoomKeys(graph.byFile.get('server/src/index.js'))) pushRoomKey(entry);
  }

  const storageRel = 'selfhost/node/lib/storage.mjs';
  if (existsSync(resolve(root, storageRel))) {
    const storageInfo = graph.byFile.get(storageRel) ?? analyzeFile(root, storageRel, new Set([storageRel]));
    for (const schemaConst of ['KV_SCHEMA', 'METADATA_SCHEMA']) {
      const exp = storageInfo.exports.find((e) => e.name === schemaConst);
      if (exp) {
        roomKeys.push({
          name: schemaConst,
          kind: 'sqliteTable',
          pattern: schemaConst === 'KV_SCHEMA' ? '_cf_KV(key TEXT PRIMARY KEY, value BLOB)' : '_cf_METADATA(key INTEGER PRIMARY KEY, value BLOB)',
          file: storageRel,
          line: exp.line,
        });
      }
    }
  }

  return {
    layout,
    scannerStatus: { roomKeys: roomKeySource },
    migrationCount: files.length,
    tableCount: tables.length,
    triggerCount: triggerRows.length,
    migrations: files,
    tables,
    roomKeys,
  };
}

// Public plain-text filler checks aligned with Bunnyfall's tools/plainText.mjs.
const PUBLIC_PADDING_PATTERNS = [
  /\bseamless(?:ly)?\b/i,
  /\bdelve\b/i,
  /\belevate\b/i,
  /\bembark\b/i,
  /\bunleash\b/i,
  /\bvibrant\b/i,
  /\bbustling\b/i,
  /\ba testament to\b/i,
  /\btapestry\b/i,
  /\bin the world of\b/i,
  /\bdive into\b/i,
  /\bgame-?changer\b/i,
  /\bplease note\b/i,
  /\brest assured\b/i,
  /\bit'?s worth noting\b/i,
  /\bcomprehensive\b/i,
  /\brobust\b/i,
  /\bmoreover\b/i,
  /\bin order to\b/i,
  /\bserves as\b/i,
];

function stripCodeFromMarkdown(md) {
  const withoutFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const withoutFences = withoutFrontmatter.replace(/```[\s\S]*?```/g, ' ');
  return withoutFences.replace(/`[^`\n]+`/g, 'CODE');
}

const LIST_FRONTMATTER_KEYS = new Set([
  'files',
  'routes',
  'tables',
  'replacesBible',
  'related',
  'invariants',
  'traps',
  'dfu',
  'tags',
]);

function unquoteYaml(raw) {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith('`') && s.endsWith('`'))) {
    return s.slice(1, -1);
  }
  return s;
}

export function parseCardFrontmatter(content, fallbackSlug) {
  const meta = {
    slug: fallbackSlug,
    title: fallbackSlug,
    domain: 'general',
    kind: 'overview',
    parent: null,
    files: [],
    routes: [],
    tables: [],
    replacesBible: [],
    related: [],
    invariants: [],
    traps: [],
    dfu: [],
    tags: [],
  };
  let body = content;
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (fm) {
    body = fm[2];
    let currentList = null;
    for (const rawLine of fm[1].split('\n')) {
      const listMatch = /^\s*-\s+(.+)$/.exec(rawLine);
      if (listMatch && currentList) {
        meta[currentList].push(unquoteYaml(listMatch[1]));
        continue;
      }
      const kv = /^([a-zA-Z0-9_]+):\s*(.*)$/.exec(rawLine);
      if (!kv) {
        currentList = null;
        continue;
      }
      const key = kv[1];
      const val = kv[2].trim();
      if (LIST_FRONTMATTER_KEYS.has(key)) {
        if (val.startsWith('[') && val.endsWith(']')) {
          meta[key] = val.slice(1, -1).split(',').map(unquoteYaml).filter(Boolean);
          currentList = null;
        } else {
          meta[key] = [];
          currentList = key;
        }
      } else {
        currentList = null;
        if (key === 'slug' || key === 'title' || key === 'domain' || key === 'kind') {
          meta[key] = unquoteYaml(val);
        } else if (key === 'parent') {
          const cleanVal = unquoteYaml(val);
          meta.parent = !cleanVal || cleanVal === 'null' || cleanVal === '~' ? null : cleanVal;
        }
      }
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body);
  if (heading && meta.title === fallbackSlug) meta.title = heading[1].trim();
  const trimmedBody = body.trim();
  const wordCount = trimmedBody ? trimmedBody.split(/\s+/).filter(Boolean).length : 0;
  const totalWordCount = content.trim() ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const plainLines = trimmedBody.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const summary = (plainLines[0] ?? '').slice(0, 180);
  return { ...meta, body: trimmedBody, wordCount, totalWordCount, summary };
}

function checkProseText(text, issues) {
  if (/\u2014| \u2013 /.test(text)) {
    issues.push({ code: 'EM_DASH', message: 'Em-dashes and spaced en-dashes are not permitted.' });
  }
  if (/!/.test(text) || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) {
    issues.push({ code: 'EXCLAMATION_OR_EMOJI', message: 'Exclamation marks and emoji are not permitted in prose.' });
  }
  if (/\b[A-Za-z]+'s\s+[A-Za-z]+'s\b/.test(text) || /\b[A-Za-z]+'s\s*[.,;:)]/.test(text)) {
    issues.push({ code: 'GENITIVE_STACK', message: 'Stacked or trailing possessives are not permitted.' });
  }
  for (const re of PUBLIC_PADDING_PATTERNS) {
    if (re.test(text)) {
      issues.push({ code: 'PADDING_OR_FILLER', message: `Prose matched disallowed filler pattern: ${re}` });
      break;
    }
  }
}

/** @param {string} slug @param {string} content */
export function validateCard(slug, content) {
  const cleanSlug = String(slug ?? '').replace(/\.md$/i, '').trim();
  const issues = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
    issues.push({ code: 'SLUG_INVALID', message: `Card slug "${cleanSlug}" must be lowercase kebab-case.` });
  }
  if (content.includes('\r')) {
    issues.push({ code: 'CRLF_LINE_ENDINGS', message: 'Card content must use LF line endings only.' });
  }
  const parsed = parseCardFrontmatter(content, cleanSlug);
  if (parsed.slug !== cleanSlug) {
    issues.push({ code: 'SLUG_MISMATCH', message: `Frontmatter slug "${parsed.slug}" does not match "${cleanSlug}".` });
  }
  if (!CARD_KINDS.has(parsed.kind)) {
    issues.push({ code: 'KIND_INVALID', message: `Card kind "${parsed.kind}" must be overview, subcard, trap, or decision.` });
  }
  if (parsed.wordCount > MAX_CARD_WORDS) {
    issues.push({ code: 'WORD_LIMIT', message: `Card body has ${parsed.wordCount} words (limit ${MAX_CARD_WORDS}).` });
  }
  const prose = stripCodeFromMarkdown(content);
  const structuredProse = [...parsed.invariants, ...parsed.traps].join('\n');
  checkProseText(`${prose}\n${structuredProse}`, issues);

  const dedup = [];
  const seenCodes = new Set();
  for (const item of issues) {
    if (!seenCodes.has(item.code)) {
      seenCodes.add(item.code);
      dedup.push(item);
    }
  }
  return { ok: dedup.length === 0, wordCount: parsed.wordCount, totalWordCount: parsed.totalWordCount, issues: dedup };
}

function normalizeBibleRef(raw) {
  const cleaned = toPosix(String(raw ?? '').trim())
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^bible\//i, '');
  const hashIdx = cleaned.indexOf('#');
  if (hashIdx === -1) return { full: cleaned.toLowerCase(), page: cleaned.toLowerCase(), anchor: '' };
  return {
    full: cleaned.toLowerCase(),
    page: cleaned.slice(0, hashIdx).toLowerCase(),
    anchor: cleaned.slice(hashIdx + 1).toLowerCase(),
  };
}

function resolveDfuDirs(root) {
  const envDir = process.env.DFU_SOURCE_DIR ? resolve(process.env.DFU_SOURCE_DIR) : null;
  const repoCache = resolve(root, '.cache/dfu-scripts');
  const sharedCache = resolve(MODULE_ROOT, '.cache/dfu-scripts');
  const primary = envDir && existsSync(envDir)
    ? envDir
    : existsSync(repoCache)
      ? repoCache
      : existsSync(sharedCache)
        ? sharedCache
        : repoCache;
  const vendorDir = resolve(root, 'vendor');
  return { primary, vendorDir, isOverride: Boolean(envDir && existsSync(envDir)) };
}

function collectCsFiles(baseDir, sourceTag, rootPrefix = '') {
  if (!existsSync(baseDir)) return [];
  const out = [];
  const stack = [baseDir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = resolve(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (extname(entry.name).toLowerCase() === '.cs') {
        const rel = toPosix(relative(baseDir, full));
        out.push({
          source: sourceTag,
          relPath: rootPrefix ? `${rootPrefix}/${rel}` : rel,
          absPath: full,
        });
      }
    }
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

/**
 * @param {{
 *   root?: string,
 *   cardsDir?: string,
 *   extraCardsDirs?: string[],
 *   overlayPath?: string,
 *   manifestPath?: string,
 *   allowWrite?: boolean,
 *   useCache?: boolean,
 *   cacheDir?: string,
 * }} [options]
 */
export function createCodex(options = {}) {
  const root = resolveRoot(options.root);
  const layout = detectLayout(root);
  const allowWrite = options.allowWrite ?? true;
  const useCache = options.useCache ?? true;
  const cacheDir = resolve(options.cacheDir ?? resolve(MODULE_ROOT, '.cache/codex'));

  let memSnapshot = null;
  let dfuFilesCache = null;

  function ensureSnapshot() {
    const fp = computeWorkspaceFingerprint(root, SCAN_DIRS, SKIP_DIRS);
    if (memSnapshot && memSnapshot.fingerprint === fp.fingerprint) {
      return { ...memSnapshot, cacheStatus: 'memory-hit' };
    }
    if (useCache) {
      const disk = readDiskCache(cacheDir, root, fp.fingerprint);
      if (disk?.graph && disk?.routes && disk?.schema) {
        memSnapshot = {
          fingerprint: fp.fingerprint,
          head: fp.head,
          layout: disk.layout ?? layout,
          graph: hydrateGraph(disk.graph),
          routes: disk.routes,
          schema: disk.schema,
        };
        return { ...memSnapshot, cacheStatus: 'disk-hit' };
      }
    }

    const activeLayout = detectLayout(root);
    const fullGraph = buildWorkspaceGraph(root);
    const routes = buildRoutesIndex(root, fullGraph, activeLayout);
    const schema = buildSchemaIndex(root, fullGraph, activeLayout);
    const serializedGraph = serializeGraph(fullGraph);
    if (useCache) {
      writeDiskCache(cacheDir, root, fp.fingerprint, {
        head: fp.head,
        layout: activeLayout,
        graph: serializedGraph,
        routes,
        schema,
      });
    }
    memSnapshot = {
      fingerprint: fp.fingerprint,
      head: fp.head,
      layout: activeLayout,
      graph: hydrateGraph(serializedGraph),
      routes,
      schema,
    };
    return { ...memSnapshot, cacheStatus: 'rebuilt' };
  }

  const getDfuFiles = () => {
    if (dfuFilesCache) return dfuFilesCache;
    const { primary, vendorDir } = resolveDfuDirs(root);
    const dfuList = collectCsFiles(primary, 'dfu');
    const vendorList = collectCsFiles(vendorDir, 'vendor', 'vendor');
    dfuFilesCache = [...dfuList, ...vendorList];
    return dfuFilesCache;
  };

  function resolvePrimaryCardsDir() {
    if (options.cardsDir) return resolve(options.cardsDir);
    if (process.env.CODEX_CARDS_DIR && existsSync(resolve(process.env.CODEX_CARDS_DIR))) {
      return resolve(process.env.CODEX_CARDS_DIR);
    }
    const repoCardsDir = resolve(root, 'tools/codex/cards');
    if (existsSync(repoCardsDir)) return repoCardsDir;
    return resolve(MODULE_ROOT, 'tools/codex/cards');
  }

  function loadAllCards() {
    const primaryDir = resolvePrimaryCardsDir();
    const extraDirs = resolveExtraCardsDirs(detectLayout(root), { extraCardsDirs: options.extraCardsDirs });
    const sources = [{ dir: primaryDir, source: 'primary' }, ...extraDirs.map((dir) => ({ dir, source: 'overlay' }))];
    const bySlug = new Map();

    for (const { dir, source } of sources) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
        const slug = f.slice(0, -3);
        const absPath = resolve(dir, f);
        const content = readFileSync(absPath, 'utf8');
        const parsed = parseCardFrontmatter(content, slug);
        bySlug.set(slug, { ...parsed, content, source, absPath });
      }
    }
    return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  function queryModule(target) {
    const snap = ensureSnapshot();
    const graph = snap.graph;
    const norm = toPosix(String(target ?? '').trim()).replace(/^\.\//, '').replace(/\/+$/, '');
    if (!norm) throw new Error('queryModule requires a file or directory target.');

    const absCandidate = resolve(root, norm);
    if (existsSync(absCandidate) && statSync(absCandidate).isDirectory()) {
      const prefix = `${norm}/`;
      let matched = graph.files.filter((f) => f.startsWith(prefix));
      if (!matched.length) {
        matched = walkFiles(root, norm, (name) => /\.(?:m?js|cjs)$/.test(name)).sort();
        for (const f of matched) {
          if (!graph.byFile.has(f)) graph.byFile.set(f, analyzeFile(root, f, graph.knownSet));
        }
      }
      let totalLines = 0;
      let nonEmptyLines = 0;
      let commentLines = 0;
      let exportCount = 0;
      let externalCallerCount = 0;
      const modules = matched.map((f) => {
        const info = graph.byFile.get(f);
        const callers = graph.inbound.get(f) ?? [];
        const externalCallers = callers.filter((c) => !c.file.startsWith(prefix));
        totalLines += info.metrics.totalLines;
        nonEmptyLines += info.metrics.nonEmptyLines;
        commentLines += info.metrics.commentLines;
        exportCount += info.metrics.exportCount;
        externalCallerCount += externalCallers.length;
        return {
          file: f,
          lines: info.metrics.totalLines,
          nonEmptyLines: info.metrics.nonEmptyLines,
          exports: info.exports.map((e) => e.name),
          inboundCallerCount: callers.length,
          externalCallerCount: externalCallers.length,
        };
      });
      return {
        kind: 'directory',
        layout: snap.layout,
        cacheStatus: snap.cacheStatus,
        path: norm,
        fileCount: modules.length,
        totals: { totalLines, nonEmptyLines, commentLines, exportCount, externalCallerCount },
        modules,
      };
    }

    let resolvedFile = graph.byFile.has(norm) ? norm : null;
    if (!resolvedFile && existsSync(absCandidate) && statSync(absCandidate).isFile() && /\.(?:m?js|cjs)$/.test(norm)) {
      graph.byFile.set(norm, analyzeFile(root, norm, graph.knownSet));
      resolvedFile = norm;
    }
    if (!resolvedFile) {
      for (const ext of ['.js', '.mjs', '.cjs']) {
        if (graph.byFile.has(norm + ext)) {
          resolvedFile = norm + ext;
          break;
        }
      }
    }
    if (!resolvedFile) {
      const matches = graph.files.filter((f) => f.endsWith(`/${norm}`) || f.endsWith(`/${norm}.js`) || f.endsWith(`/${norm}.mjs`) || f.includes(norm));
      if (matches.length === 1) resolvedFile = matches[0];
      else if (matches.length > 1) {
        return { kind: 'matches', layout: snap.layout, query: norm, candidates: matches.slice(0, 25) };
      }
    }
    if (!resolvedFile) return null;

    const info = graph.byFile.get(resolvedFile);
    return {
      kind: 'file',
      layout: snap.layout,
      cacheStatus: snap.cacheStatus,
      file: info.file,
      metrics: info.metrics,
      exports: info.exports,
      staticImports: info.staticImports,
      dynamicImports: info.dynamicImports,
      inboundCallers: graph.inbound.get(resolvedFile) ?? [],
    };
  }

  function queryRoutes(filter = '') {
    const snap = ensureSnapshot();
    const all = snap.routes;
    const q = String(filter ?? '').trim().toLowerCase();
    const matchText = (parts) => !q || parts.some((p) => String(p ?? '').toLowerCase().includes(q));
    const httpRoutes = all.httpRoutes.filter((r) => matchText([r.path, r.auth, r.consistency, ...r.handlers.map((h) => h.file), ...r.clientCallers.map((c) => c.file)]));
    const wsFrames = all.wsFrames.filter((f) => matchText([f.frame, f.handler, f.server, ...f.wireRefs, ...f.clientRefs]));
    const saveHooks = all.saveHooks.filter((s) => matchText([s.kind, s.vendor, s.name, s.file, ...(s.hooks ?? [])]));
    return {
      layout: snap.layout,
      cacheStatus: snap.cacheStatus,
      scannerStatus: all.scannerStatus,
      filter: q || null,
      counts: {
        httpRoutes: httpRoutes.length,
        wsFrames: wsFrames.length,
        saveHooks: saveHooks.length,
        totalHttpRoutes: all.httpRoutes.length,
        totalWsFrames: all.wsFrames.length,
        totalSaveHooks: all.saveHooks.length,
      },
      httpRoutes,
      wsFrames,
      saveHooks,
    };
  }

  function querySchema(filter = '') {
    const snap = ensureSnapshot();
    const schema = snap.schema;
    const q = String(filter ?? '').trim().toLowerCase();
    const tables = !q
      ? schema.tables
      : schema.tables.filter((t) => (
        t.name.toLowerCase().includes(q)
        || String(t.originMigration ?? '').toLowerCase().includes(q)
        || t.modifiedInMigrations.some((m) => m.toLowerCase().includes(q))
        || t.columns.some((c) => c.name.toLowerCase().includes(q))
        || t.indexes.some((ix) => ix.name.toLowerCase().includes(q))
      ));
    const roomKeys = !q
      ? schema.roomKeys
      : schema.roomKeys.filter((k) => (
        k.name.toLowerCase().includes(q)
        || k.pattern.toLowerCase().includes(q)
        || k.file.toLowerCase().includes(q)
      ));
    return {
      layout: snap.layout,
      cacheStatus: snap.cacheStatus,
      scannerStatus: schema.scannerStatus,
      filter: q || null,
      migrationCount: schema.migrationCount,
      tableCount: schema.tableCount,
      triggerCount: schema.triggerCount,
      matchedTableCount: tables.length,
      matchedRoomKeyCount: roomKeys.length,
      tables,
      roomKeys,
    };
  }

  function listCards() {
    return loadAllCards().map((c) => ({
      slug: c.slug,
      title: c.title,
      domain: c.domain,
      kind: c.kind,
      parent: c.parent,
      files: c.files,
      routes: c.routes,
      tables: c.tables,
      replacesBible: c.replacesBible,
      related: c.related,
      dfu: c.dfu,
      tags: c.tags,
      wordCount: c.wordCount,
      summary: c.summary,
      source: c.source,
    }));
  }

  /** @param {string} slug @param {{ includeContent?: boolean }} [opts] */
  function readCard(slug, opts = {}) {
    const clean = String(slug ?? '').replace(/\.md$/i, '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) return null;
    const found = loadAllCards().find((c) => c.slug === clean);
    if (!found) return null;
    const { absPath: _ignored, content, ...pub } = found;
    return opts.includeContent ? { ...pub, content } : pub;
  }

  function searchCards(q = '') {
    const terms = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = loadAllCards();
    if (!terms.length) return listCards();
    const scored = [];
    for (const full of all) {
      const haySlug = `${full.slug} ${full.title} ${full.domain} ${full.tags.join(' ')}`.toLowerCase();
      const hayRefs = `${full.files.join(' ')} ${full.routes.join(' ')} ${full.tables.join(' ')} ${full.replacesBible.join(' ')} ${full.dfu.join(' ')}`.toLowerCase();
      const hayBody = `${full.body} ${full.invariants.join(' ')} ${full.traps.join(' ')}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (full.slug === term) score += 20;
        if (haySlug.includes(term)) score += 8;
        if (hayRefs.includes(term)) score += 5;
        if (hayBody.includes(term)) score += 2;
      }
      if (score > 0) {
        scored.push({
          slug: full.slug,
          title: full.title,
          domain: full.domain,
          kind: full.kind,
          parent: full.parent,
          files: full.files,
          routes: full.routes,
          tables: full.tables,
          replacesBible: full.replacesBible,
          related: full.related,
          dfu: full.dfu,
          tags: full.tags,
          wordCount: full.wordCount,
          summary: full.summary,
          source: full.source,
          score,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
    return scored;
  }

  /** @param {string} biblePath @param {{ includeContent?: boolean }} [opts] */
  function resolveBible(biblePath, opts = {}) {
    const target = normalizeBibleRef(biblePath);
    if (!target.page) {
      return { query: biblePath ?? '', normalized: '', directMatch: false, matchedCount: 0, cards: [], fallbackSearch: [] };
    }
    const targetBase = posix.basename(target.page);
    const all = loadAllCards();
    const scored = [];

    for (const card of all) {
      let best = 0;
      for (const entry of card.replacesBible) {
        const ref = normalizeBibleRef(entry);
        if (target.anchor && ref.full === target.full) best = Math.max(best, 100);
        else if (ref.page === target.page) best = Math.max(best, 80);
        else if (posix.basename(ref.page) === targetBase) best = Math.max(best, 50);
        else if (ref.page.includes(target.page) || target.page.includes(ref.page)) best = Math.max(best, 20);
      }
      if (best > 0) {
        const { absPath: _ignored, content, ...pub } = card;
        scored.push({ ...pub, ...(opts.includeContent ? { content } : {}), matchScore: best });
      }
    }
    scored.sort((a, b) => b.matchScore - a.matchScore || a.slug.localeCompare(b.slug));

    const fallbackKeywords = targetBase.replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
    const fallbackSearch = scored.length ? [] : searchCards(fallbackKeywords).slice(0, 5);
    return {
      query: biblePath,
      normalized: target.full,
      directMatch: scored.length > 0,
      matchedCount: scored.length,
      cards: scored,
      fallbackSearch,
    };
  }

  /** @param {string | { file?: string, route?: string, table?: string, domain?: string, query?: string, limit?: number, fields?: 'slugs' | 'full' }} [filter] */
  function queryInvariants(filter = {}) {
    const opts = typeof filter === 'string' ? { query: filter } : (filter ?? {});
    const fFile = String(opts.file ?? '').trim().toLowerCase();
    const fRoute = String(opts.route ?? '').trim().toLowerCase();
    const fTable = String(opts.table ?? '').trim().toLowerCase();
    const fDomain = String(opts.domain ?? '').trim().toLowerCase();
    const fQuery = String(opts.query ?? '').trim().toLowerCase();
    const limitNum = Number(opts.limit ?? 25);
    const limit = Number.isFinite(limitNum) && limitNum >= 1 ? Math.floor(limitNum) : 25;
    const keywordOnly = Boolean(fQuery) && !fFile && !fRoute && !fTable && !fDomain;
    const compact = opts.fields ? opts.fields === 'slugs' : keywordOnly;

    const overlay = loadPathOverlay(options.overlayPath);
    const activeLayout = detectLayout(root);
    const matched = [];

    for (const card of loadAllCards()) {
      const expandedFiles = card.files.flatMap((f) => [f, ...mapFileForLayout(f, activeLayout, overlay)]);
      if (fFile && !expandedFiles.some((f) => f.toLowerCase().includes(fFile))) continue;
      if (fRoute && !card.routes.some((r) => r.toLowerCase().includes(fRoute))) continue;
      if (fTable && !card.tables.some((t) => t.toLowerCase().includes(fTable))) continue;
      if (fDomain && card.domain.toLowerCase() !== fDomain) continue;
      let score = 0;
      if (fQuery) {
        const hit = (parts) => parts.join(' ').toLowerCase().includes(fQuery);
        if (card.slug === fQuery) score += 20;
        if (hit([card.slug, card.title, card.domain, ...card.tags])) score += 8;
        if (hit([...expandedFiles, ...card.routes, ...card.tables])) score += 5;
        if (hit([...card.invariants, ...card.traps, card.body])) score += 2;
        if (!score) continue;
      }
      matched.push({ card, score });
    }

    matched.sort((a, b) => b.score - a.score || a.card.slug.localeCompare(b.card.slug));
    const results = matched.slice(0, limit).map(({ card }) => {
      if (compact) {
        const lines = (list) => (fQuery ? list.filter((l) => l.toLowerCase().includes(fQuery)) : list);
        return {
          slug: card.slug,
          title: card.title,
          domain: card.domain,
          invariants: lines(card.invariants),
          traps: lines(card.traps),
        };
      }
      return {
        slug: card.slug,
        title: card.title,
        domain: card.domain,
        kind: card.kind,
        parent: card.parent,
        files: card.files,
        routes: card.routes,
        tables: card.tables,
        invariants: card.invariants,
        traps: card.traps,
        related: card.related,
        summary: card.summary,
      };
    });

    return {
      layout: activeLayout,
      filter: {
        file: fFile || null,
        route: fRoute || null,
        table: fTable || null,
        domain: fDomain || null,
        query: fQuery || null,
      },
      total: matched.length,
      matchedCount: matched.length,
      truncated: matched.length > results.length,
      results,
    };
  }

  /** @param {string} [baseRef] @param {string} [headRef] */
  function queryDiff(baseRef = '', headRef = '') {
    const snap = ensureSnapshot();
    const changedSet = new Set();

    if (baseRef) {
      const range = headRef ? `${baseRef}...${headRef}` : baseRef;
      const diffOut = execFileSync('git', ['-c', 'core.autocrlf=false', 'diff', '--name-only', range], {
        cwd: root,
        encoding: 'utf8',
      });
      for (const line of diffOut.split('\n')) {
        const p = line.trim();
        if (p) changedSet.add(toPosix(p));
      }
    } else {
      const statusOut = execFileSync('git', ['-c', 'core.autocrlf=false', 'status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      });
      for (const line of statusOut.split('\n')) {
        if (!line.trim()) continue;
        const body = line.slice(3).trim();
        const arrow = body.indexOf(' -> ');
        const p = arrow === -1 ? body : body.slice(arrow + 4);
        if (p) changedSet.add(toPosix(p.replace(/^"|"$/g, '')));
      }
    }

    const changedFiles = [...changedSet].sort();
    const changedMigrations = changedFiles.filter((f) => f.startsWith('server-account/migrations/') && f.endsWith('.sql'));
    const overlay = loadPathOverlay(options.overlayPath);

    const callerFilesOfChanged = new Set();
    for (const f of changedFiles) {
      for (const caller of snap.graph.inbound.get(f) ?? []) {
        callerFilesOfChanged.add(caller.file);
      }
    }

    const directlyCovered = new Set();
    const impactedCards = [];
    for (const card of loadAllCards()) {
      const cardFiles = new Set(card.files.flatMap((f) => [f, ...mapFileForLayout(f, snap.layout, overlay)]));
      const directMatches = changedFiles.filter((f) => cardFiles.has(f));
      const indirectMatches = [...callerFilesOfChanged].filter((f) => cardFiles.has(f) && !directMatches.includes(f));
      for (const m of directMatches) directlyCovered.add(m);
      if (directMatches.length || indirectMatches.length) {
        impactedCards.push({
          slug: card.slug,
          title: card.title,
          domain: card.domain,
          direct: directMatches.length > 0,
          matchedFiles: directMatches,
          indirectCallerMatches: indirectMatches,
          invariants: card.invariants,
          traps: card.traps,
          related: card.related,
        });
      }
    }
    impactedCards.sort((a, b) => Number(b.direct) - Number(a.direct) || a.slug.localeCompare(b.slug));

    const codePrefix = (f) => SCAN_DIRS.some((d) => f.startsWith(`${d}/`));
    const uncoveredFiles = changedFiles.filter((f) => codePrefix(f) && !directlyCovered.has(f));

    return {
      layout: snap.layout,
      baseRef: baseRef || null,
      headRef: headRef || null,
      changedCount: changedFiles.length,
      changedFiles,
      changedMigrations,
      impactedCards,
      uncoveredFiles,
    };
  }

  function writeCard(slug, content, writeOptions = {}) {
    if (!allowWrite && !writeOptions.forceWrite) {
      throw new Error('Codex write access is disabled in read-only mode. Set CODEX_ALLOW_WRITE=1 or use CLI --write from the maintainer lane.');
    }
    const clean = String(slug ?? '').replace(/\.md$/i, '').trim();
    const normalized = String(content ?? '').replace(/\r\n/g, '\n');
    const validation = validateCard(clean, normalized);
    if (!validation.ok) {
      const codes = validation.issues.map((i) => `${i.code}: ${i.message}`).join('; ');
      const err = new Error(`Card validation failed (${codes})`);
      /** @type {any} */ (err).issues = validation.issues;
      throw err;
    }
    if (!writeOptions.skipRepoCheck) {
      const parsed = parseCardFrontmatter(normalized, clean);
      const overlay = loadPathOverlay(options.overlayPath);
      const activeLayout = detectLayout(root);
      const missing = [];
      for (const relRef of parsed.files) {
        const candidates = mapFileForLayout(relRef, activeLayout, overlay);
        if (!candidates.some((c) => existsSync(resolve(root, c)))) {
          missing.push(relRef);
        }
      }
      if (missing.length) {
        throw new Error(`Card references missing repository files: ${missing.join(', ')}`);
      }
      if (parsed.routes.length || parsed.tables.length) {
        const snap = ensureSnapshot();
        const knownRoutes = new Set(snap.routes.httpRoutes.map((r) => r.path));
        const missingRoutes = [];
        for (const rawRoute of parsed.routes) {
          const m = /^(?:[A-Z]+\s+)?(\/v1\/[a-z0-9\-/]+)$/.exec(rawRoute.trim());
          if (m && !m[1].startsWith('/v1/poi/') && !knownRoutes.has(m[1])) {
            missingRoutes.push(rawRoute);
          }
        }
        if (missingRoutes.length) {
          throw new Error(`Card references unknown HTTP routes: ${missingRoutes.join(', ')}`);
        }
        const knownTables = new Set(snap.schema.tables.map((t) => t.name));
        const missingTables = parsed.tables.filter((t) => /^[a-z_][a-z0-9_]*$/i.test(t) && !knownTables.has(t));
        if (missingTables.length) {
          throw new Error(`Card references unknown SQLite tables: ${missingTables.join(', ')}`);
        }
      }
    }
    const targetDir = writeOptions.dir ? resolve(writeOptions.dir) : resolvePrimaryCardsDir();
    mkdirSync(targetDir, { recursive: true });
    const filePath = resolve(targetDir, `${clean}.md`);
    writeFileSync(filePath, normalized.endsWith('\n') ? normalized : `${normalized}\n`, 'utf8');
    return {
      slug: clean,
      path: toPosix(relative(root, filePath)),
      wordCount: validation.wordCount,
      totalWordCount: validation.totalWordCount,
    };
  }

  function fetchDfu(fetchOptions = {}) {
    dfuFilesCache = null;
    const { primary, isOverride } = resolveDfuDirs(root);
    if (isOverride) {
      const existing = collectCsFiles(primary, 'dfu');
      return { status: 'override', dir: toPosix(primary), csFileCount: existing.length };
    }
    const existing = collectCsFiles(primary, 'dfu');
    if (existing.length > 0 && !fetchOptions.force) {
      return { status: 'ready', dir: toPosix(relative(root, primary)), csFileCount: existing.length };
    }
    mkdirSync(dirname(primary), { recursive: true });
    if (!existsSync(resolve(primary, '.git'))) {
      execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', DFU_REPO_URL, primary], { stdio: 'pipe' });
    }
    execFileSync('git', ['-C', primary, 'sparse-checkout', 'set', 'Assets/Scripts'], { stdio: 'pipe' });
    if (fetchOptions.force) {
      execFileSync('git', ['-C', primary, 'fetch', '--depth', '1', 'origin'], { stdio: 'pipe' });
      execFileSync('git', ['-C', primary, 'reset', '--hard', 'FETCH_HEAD'], { stdio: 'pipe' });
    }
    const fetched = collectCsFiles(primary, 'dfu');
    return { status: 'cloned', dir: toPosix(relative(root, primary)), csFileCount: fetched.length };
  }

  function searchDfu(query, limit = 25) {
    const q = String(query ?? '').trim();
    if (!q) return { query: '', totalMatches: 0, results: [] };
    const qLow = q.toLowerCase();
    const cap = Math.max(1, Math.min(200, Number(limit) || 25));
    const files = getDfuFiles();
    const hits = [];
    let totalMatches = 0;

    for (const entry of files) {
      const fileNameMatch = entry.relPath.toLowerCase().includes(qLow);
      const text = readFileSync(entry.absPath, 'utf8');
      if (!fileNameMatch && !text.toLowerCase().includes(qLow)) continue;
      const lines = text.split('\n');
      let matchedInFile = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(qLow)) {
          matchedInFile = true;
          totalMatches++;
          const trimmed = lines[i].trim();
          const isDecl = /\b(?:class|struct|enum|interface|void|public|private|protected|internal)\b/.test(trimmed);
          hits.push({
            source: entry.source,
            file: entry.relPath,
            line: i + 1,
            text: trimmed.slice(0, 200),
            rank: (fileNameMatch ? 4 : 0) + (isDecl ? 2 : 0) + (lines[i].includes(q) ? 1 : 0),
          });
        }
      }
      if (fileNameMatch && !matchedInFile) {
        totalMatches++;
        hits.push({
          source: entry.source,
          file: entry.relPath,
          line: 1,
          text: lines[0]?.trim().slice(0, 200) ?? '',
          rank: 5,
        });
      }
    }

    hits.sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line);
    return {
      query: q,
      totalMatches,
      results: hits.slice(0, cap).map(({ source, file, line, text }) => ({ source, file, line, text })),
    };
  }

  function readDfu(file, startLine = 1, endLine = startLine + 119) {
    const target = toPosix(String(file ?? '').trim()).replace(/^\/+/, '');
    if (!target || target.includes('..')) throw new Error('Invalid C# file path.');
    const files = getDfuFiles();
    const targetLow = target.toLowerCase();
    const exact = files.find((f) => f.relPath.toLowerCase() === targetLow);
    const suffix = exact ? [exact] : files.filter((f) => f.relPath.toLowerCase().endsWith(`/${targetLow}`) || posix.basename(f.relPath).toLowerCase() === targetLow);
    if (!suffix.length) return null;
    const chosen = suffix[0];

    const { primary, vendorDir } = resolveDfuDirs(root);
    const resolved = resolve(chosen.absPath);
    if (!resolved.startsWith(resolve(primary)) && !resolved.startsWith(resolve(vendorDir))) {
      throw new Error('Path outside allowed C# reference roots.');
    }

    const lines = readFileSync(resolved, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const sLine = Math.max(1, Math.min(lines.length, Math.trunc(Number(startLine) || 1)));
    const rawEnd = endLine == null ? sLine + 119 : Math.trunc(Number(endLine) || sLine);
    const eLine = Math.max(sLine, Math.min(lines.length, Math.min(sLine + 399, rawEnd)));
    const slice = [];
    for (let ln = sLine; ln <= eLine; ln++) {
      slice.push({ line: ln, text: lines[ln - 1] });
    }
    const width = String(eLine).length;
    const excerpt = slice.map((r) => `${String(r.line).padStart(width, ' ')}: ${r.text}`).join('\n');
    return {
      source: chosen.source,
      file: chosen.relPath,
      totalLines: lines.length,
      startLine: sLine,
      endLine: eLine,
      lines: slice,
      excerpt,
    };
  }

  /** @param {{ overlayPath?: string, manifestPath?: string, checkSchemaAndRoutes?: boolean }} [checkOpts] */
  function checkAllCards(checkOpts = {}) {
    const cards = loadAllCards();
    const activeLayout = detectLayout(root);
    const overlay = loadPathOverlay(checkOpts.overlayPath ?? options.overlayPath);
    const manifest = loadManifest(checkOpts.manifestPath ?? options.manifestPath);
    const slugSet = new Set(cards.map((c) => c.slug));

    let tableSet = null;
    let routeSet = null;
    if (checkOpts.checkSchemaAndRoutes !== false) {
      const snap = ensureSnapshot();
      tableSet = new Set(snap.schema.tables.map((t) => t.name));
      routeSet = new Set(snap.routes.httpRoutes.map((r) => r.path));
    }

    const failures = [];
    for (const card of cards) {
      const res = validateCard(card.slug, card.content);
      const issues = [...res.issues];
      for (const relRef of card.files) {
        const mapped = mapFileForLayout(relRef, activeLayout, overlay);
        if (!mapped.some((c) => existsSync(resolve(root, c)))) {
          issues.push({ code: 'MISSING_REPO_FILE', message: `Referenced repo path does not exist (${activeLayout}): ${relRef}` });
        }
        if (manifest && overlay) {
          const manifestTargets = mapFileForLayout(relRef, /** @type {'main'|'clean'} */ (manifest.layout), overlay);
          if (!manifestTargets.some((c) => manifest.files.has(c))) {
            issues.push({ code: 'MISSING_MANIFEST_FILE', message: `Mapped ${manifest.layout} path not in manifest: ${relRef} -> ${manifestTargets.join(', ')}` });
          }
        }
      }
      if (card.parent && !slugSet.has(card.parent)) {
        issues.push({ code: 'MISSING_PARENT_CARD', message: `Parent card slug does not exist: ${card.parent}` });
      }
      for (const relSlug of card.related) {
        if (!slugSet.has(relSlug)) {
          issues.push({ code: 'MISSING_RELATED_CARD', message: `Related card slug does not exist: ${relSlug}` });
        }
      }
      if (tableSet) {
        for (const tbl of card.tables) {
          if (!tableSet.has(tbl)) {
            issues.push({ code: 'MISSING_SCHEMA_TABLE', message: `Referenced SQL table does not exist: ${tbl}` });
          }
        }
      }
      if (routeSet) {
        for (const rt of card.routes) {
          if (!routeSet.has(rt)) {
            issues.push({ code: 'MISSING_HTTP_ROUTE', message: `Referenced HTTP route does not exist: ${rt}` });
          }
        }
      }
      if (issues.length) failures.push({ slug: card.slug, issues });
    }

    return {
      ok: failures.length === 0,
      layout: activeLayout,
      cardsDir: toPosix(resolvePrimaryCardsDir()),
      overlayLoaded: Boolean(overlay),
      manifestLoaded: Boolean(manifest),
      cardCount: cards.length,
      failures,
    };
  }

  return {
    root,
    layout,
    allowWrite,
    queryModule,
    queryRoutes,
    querySchema,
    listCards,
    searchCards,
    readCard,
    resolveBible,
    queryInvariants,
    queryDiff,
    writeCard,
    validateCard,
    checkAllCards,
    fetchDfu,
    searchDfu,
    readDfu,
  };
}
