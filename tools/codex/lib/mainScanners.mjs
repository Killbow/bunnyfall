// Main-layout scanners for HTTP route metadata, monolith WS frames, DO room KV keys, and core save hooks.

const MAIN_SAVE_EXACT = new Set([
  'src/systems/classicSave.js',
  'src/systems/cloudSaves.js',
  'src/systems/realmSaves.js',
  'src/net/realm/realmSaveCodec.js',
]);

/** @param {any} node @returns {string[]} */
function extractStringLiterals(node) {
  /** @type {string[]} */
  const out = [];
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    out.push(node.value);
    return out;
  }
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements ?? []) {
      if (el?.type === 'Literal' && typeof el.value === 'string') {
        out.push(el.value);
      } else if (el?.type === 'ArrayExpression' && el.elements?.[0]?.type === 'Literal' && typeof el.elements[0].value === 'string') {
        out.push(el.elements[0].value);
      }
    }
    return out;
  }
  if (node.type === 'NewExpression' && node.arguments?.length) {
    for (const arg of node.arguments) out.push(...extractStringLiterals(arg));
  }
  return out;
}

/** @param {any} serviceInfo */
export function classifyAccountRoutes(serviceInfo) {
  const listedRoutes = new Set();
  const openRoutes = new Set();
  const patreonOpenRoutes = new Set();
  const safeOpenRoutes = new Set();
  const staffRoutes = new Set();
  const replicaRoutes = new Set();
  const primaryFirstRoutes = new Set();
  const anyReplicaRoutes = new Set();

  if (!serviceInfo) {
    return {
      listedRoutes,
      openRoutes,
      patreonOpenRoutes,
      safeOpenRoutes,
      staffRoutes,
      replicaRoutes,
      primaryFirstRoutes,
      anyReplicaRoutes,
    };
  }

  /** @type {Record<string, Set<string>>} */
  const targets = {
    ROUTES: listedRoutes,
    OPEN_ROUTES: openRoutes,
    PATREON_OPEN_ROUTES: patreonOpenRoutes,
    SAFE_OPEN_ROUTES: safeOpenRoutes,
    REPLICA_ROUTES: replicaRoutes,
    PRIMARY_FIRST_ROUTES: primaryFirstRoutes,
    ANY_REPLICA_ROUTES: anyReplicaRoutes,
  };

  if (serviceInfo.ast) {
    for (const stmt of serviceInfo.ast.body) {
      const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
      if (decl?.type !== 'VariableDeclaration') continue;
      for (const d of decl.declarations) {
        if (d.id?.type !== 'Identifier') continue;
        const set = targets[d.id.name];
        if (!set) continue;
        for (const lit of extractStringLiterals(d.init)) {
          if (lit.startsWith('/v1/') && !lit.endsWith('/') && !lit.endsWith('-')) set.add(lit);
        }
      }
    }
  }

  if (listedRoutes.size === 0) {
    for (const m of serviceInfo.src.matchAll(/['`](\/v1\/[a-z0-9\-/]+)['`]/g)) {
      if (!m[1].endsWith('/') && !m[1].endsWith('-')) listedRoutes.add(m[1]);
    }
  }

  for (const r of listedRoutes) {
    if (r.startsWith('/v1/staff/') && r !== '/v1/staff/net-feed') staffRoutes.add(r);
  }

  return {
    listedRoutes,
    openRoutes,
    patreonOpenRoutes,
    safeOpenRoutes,
    staffRoutes,
    replicaRoutes,
    primaryFirstRoutes,
    anyReplicaRoutes,
  };
}

/**
 * @param {any} graph
 * @param {(info: any, frameType: string) => string[]} findFrameRefs
 */
export function scanMainWsFrames(graph, findFrameRefs) {
  const srvInfo = graph.byFile.get('server/src/index.js');
  if (!srvInfo) return [];

  const lines = srvInfo.src.split('\n');
  const seen = new Map();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    for (const match of raw.matchAll(/\bm\.t\s*===\s*'([a-z0-9_]+)'/g)) {
      const frame = match[1];
      const isControlFlow = /^\s*(?:else\s+)?if\s*\(/.test(raw) || /^\s*const\s+posed\s*=/.test(raw);
      if (!isControlFlow) continue;

      const delegated = /return\s+this\.([A-Za-z0-9_]+)\s*\(/.exec(raw);
      const handler = delegated ? delegated[1] : 'inline:_message';
      if (!seen.has(frame)) {
        seen.set(frame, { frame, handler, line: i + 1 });
      }
    }
  }

  const wireInfo = graph.byFile.get('src/net/wire.js');
  if (wireInfo) {
    const wireLines = wireInfo.src.split('\n');
    const pcIdx = wireLines.findIndex((l) => l.includes('export function parseClient'));
    if (pcIdx !== -1) {
      for (let i = pcIdx; i < Math.min(wireLines.length, pcIdx + 500); i++) {
        const line = wireLines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        for (const m of line.matchAll(/\b(?:t|m\.t)\s*===\s*'([a-z0-9_]+)'|\bcase\s*'([a-z0-9_]+)':/g)) {
          const frame = m[1] || m[2];
          if (frame && !seen.has(frame)) {
            seen.set(frame, { frame, handler: 'wire-only', line: null });
          }
        }
      }
    }
  }

  const onlineInfo = graph.byFile.get('src/net/online.js');
  const onlineWorldInfo = graph.byFile.get('src/net/onlineWorld.js');
  const onlineDirInfos = [];
  for (const info of graph.byFile.values()) {
    if (info.file.startsWith('src/systems/online/')) onlineDirInfos.push(info);
  }

  return [...seen.values()].map(({ frame, handler, line }) => {
    const clientRefs = [
      ...findFrameRefs(onlineInfo, frame),
      ...findFrameRefs(onlineWorldInfo, frame),
      ...onlineDirInfos.flatMap((inf) => findFrameRefs(inf, frame)),
    ].slice(0, 8);
    return {
      frame,
      handler,
      server: line ? `server/src/index.js:${line}` : null,
      inFramesMap: false,
      wireRefs: findFrameRefs(wireInfo, frame),
      clientRefs,
    };
  });
}

/** @param {any} srvInfo */
export function scanMainRoomKeys(srvInfo) {
  if (!srvInfo) return [];
  const file = srvInfo.file;
  const out = [];
  const seen = new Set();
  const addKey = (name, kind, pattern, line) => {
    const sig = `${name}\0${pattern}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ name, kind, pattern, file, line });
  };

  if (srvInfo.ast) {
    for (const stmt of srvInfo.ast.body) {
      const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
      if (decl?.type !== 'VariableDeclaration') continue;
      for (const d of decl.declarations) {
        if (d.id?.type !== 'Identifier') continue;
        const name = d.id.name;
        const line = d.loc?.start.line ?? 1;
        const looksLikeKeyConst = /(?:KEY|META|PREFIX|WORDS)$/.test(name) || /(?:Key|KeyOf)$/.test(name);
        if (!looksLikeKeyConst) continue;
        if (d.init?.type === 'Literal' && typeof d.init.value === 'string') {
          addKey(name, 'constant', d.init.value, line);
        } else if (d.init?.type === 'ArrowFunctionExpression' && d.init.body?.type === 'TemplateLiteral') {
          const pattern = d.init.body.quasis.map((q) => q.value.cooked).join('${id}');
          addKey(name, 'keyBuilder', pattern, line);
        }
      }
    }
  }

  const lines = srvInfo.src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const m of lineText.matchAll(/(?:this\.state\.storage\.(?:get|put|delete|list)|this\._keysOf)\s*\(([^)]+)\)/g)) {
      const arg = m[1];
      for (const lit of arg.matchAll(/'([a-zA-Z0-9_:.-]+)'/g)) {
        const val = lit[1];
        if (!val || val === 'prefix') continue;
        const kind = val.endsWith(':') ? 'prefixLiteral' : 'storageLiteral';
        addKey(val, kind, val, i + 1);
      }
    }
  }

  return out;
}

/** @param {any} graph */
export function scanCoreSaveHooks(graph) {
  const out = [];
  for (const info of graph.byFile.values()) {
    const isCleanSave = info.file.startsWith('src/saves/');
    const isMainSave = info.file.startsWith('src/systems/save/') || MAIN_SAVE_EXACT.has(info.file);
    if (!isCleanSave && !isMainSave) continue;
    for (const exp of info.exports) {
      if (exp.kind === 'function') {
        out.push({
          kind: 'worldOrPlayerSave',
          name: exp.name,
          file: info.file,
          line: exp.line,
        });
      }
    }
  }
  return out;
}
