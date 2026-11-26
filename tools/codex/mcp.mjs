#!/usr/bin/env node
// Zero-dependency stdio MCP server exposing codex tools over JSON-RPC 2.0.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodex, resolveAllowedRoot, resolveRoot } from './engine.mjs';

const SERVER_INFO = { name: 'codex', version: '1.1.0' };
const SUPPORTED_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

const ROOT_PROP = {
  type: 'string',
  description: 'Optional Bunnyfall repository or worktree root path (defaults to BUNNYFALL_ROOT).',
};

/** @param {boolean} allowWrite */
export function buildTools(allowWrite = false) {
  const cardActions = allowWrite
    ? ['list', 'search', 'read', 'resolve-bible', 'check', 'write']
    : ['list', 'search', 'read', 'resolve-bible', 'check'];
  const cardDesc = allowWrite
    ? 'List, search, read, resolve bible citation paths, validate, or write distilled Bunnyfall concept cards (<= 250 body words).'
    : 'List, search, read, resolve bible citation paths, or validate distilled Bunnyfall concept cards (read-only mode).';

  return [
    {
      name: 'codex_module',
      description: 'Inspect live AST exports, static and dynamic imports, inbound callers across the repository, and line/comment/binding metrics for any Bunnyfall file or directory.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Repository-relative file or directory path (for example "src/combat/formulas.js" or "server-account/src").' },
          root: ROOT_PROP,
        },
        required: ['target'],
      },
    },
    {
      name: 'codex_routes',
      description: 'Query live HTTP account/relay routes (with auth and replica consistency), WebSocket room frame handlers, and mod/world save hooks with exact file:line locations.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional substring filter matching route path, frame name, vendor key, or file path.' },
          kind: { type: 'string', enum: ['all', 'http', 'ws', 'save'], description: 'Optional slice selector (defaults to "all").' },
          root: ROOT_PROP,
        },
      },
    },
    {
      name: 'codex_schema',
      description: 'Query the live SQLite D1 schema (migrations, tables, columns, primary keys, indexes, triggers, originating migration) and Durable Object room KV storage keys.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional table, column, migration, or room-key filter.' },
          root: ROOT_PROP,
        },
      },
    },
    {
      name: 'codex_card',
      description: cardDesc,
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: cardActions,
            description: 'Card operation to run (defaults to "resolve-bible" if biblePath is set, "read" if slug is set, "search" if query is set, else "list").',
          },
          slug: { type: 'string', description: 'Card slug for "read" or "write" (for example "arrow-flight-and-conjured-arrows").' },
          query: { type: 'string', description: 'Search keywords for "search".' },
          biblePath: { type: 'string', description: 'Legacy bible path (for example "12-Enhanced-AI/Feud-Arc.md") to resolve to clean concept cards.' },
          content: { type: 'string', description: 'Full markdown content (with frontmatter) for "write" when CODEX_ALLOW_WRITE=1.' },
          includeContent: { type: 'boolean', description: 'For "read" and "resolve-bible": also return each raw markdown card as "content" (off by default; it repeats the parsed fields).' },
          root: ROOT_PROP,
        },
      },
    },
    {
      name: 'codex_invariants',
      description: 'Query structured invariants and traps across concept cards filtered by repo file, HTTP route, SQL table, domain, or keyword.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Repository-relative file substring filter.' },
          route: { type: 'string', description: 'HTTP route substring filter.' },
          table: { type: 'string', description: 'SQL table name substring filter.' },
          domain: { type: 'string', description: 'Exact card domain filter (for example "combat", "multiplayer", "account").' },
          query: { type: 'string', description: 'Free-text keyword filter. Slug, title, and tag hits rank above body hits.' },
          limit: { type: 'number', description: 'Maximum cards returned (default 25). The result reports total and truncated.' },
          fields: { type: 'string', enum: ['slugs', 'full'], description: '"slugs" returns only slug, title, domain, and the invariant and trap lines that match the query. Defaults to "slugs" for a keyword-only query and "full" when file, route, table, or domain is set.' },
          root: ROOT_PROP,
        },
      },
    },
    {
      name: 'codex_diff',
      description: 'Map changed files in a git diff or dirty working tree to impacted concept cards, invariants, traps, migrations, and uncovered code files.',
      inputSchema: {
        type: 'object',
        properties: {
          baseRef: { type: 'string', description: 'Optional base git ref (for example "main" or a commit SHA). Omit to inspect dirty working-tree files.' },
          headRef: { type: 'string', description: 'Optional head git ref (for example "HEAD" or a branch name).' },
          root: ROOT_PROP,
        },
      },
    },
    {
      name: 'codex_dfu',
      description: 'Search, read line-numbered excerpts, or fetch read-only Daggerfall Unity (Assets/Scripts) and vendored C# reference sources.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['search', 'read', 'fetch'], description: 'DFU operation to run (defaults to "read" when file is set, else "search").' },
          query: { type: 'string', description: 'Symbol, method, class, or substring to search across C# sources.' },
          file: { type: 'string', description: 'C# file path or basename to read (for example "WeaponManager.cs" or "Assets/Scripts/Game/DaggerfallMissile.cs").' },
          startLine: { type: 'integer', description: '1-based start line for "read" (defaults to 1).' },
          endLine: { type: 'integer', description: '1-based inclusive end line for "read" (defaults to startLine + 119).' },
          limit: { type: 'integer', description: 'Maximum search hits to return (defaults to 25).' },
          root: ROOT_PROP,
        },
      },
    },
  ];
}

export const TOOLS = buildTools(false);

const okResult = (payload) => ({
  content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }],
});

const errResult = (message) => ({
  content: [{ type: 'text', text: String(message) }],
  isError: true,
});

/** @param {{ root?: string, allowWrite?: boolean, allowedRoots?: string[], useCache?: boolean }} [options] */
export function createMcpDispatcher(options = {}) {
  const allowWrite = options.allowWrite ?? (process.env.CODEX_ALLOW_WRITE === '1');
  const defaultRoot = resolveRoot(options.root);
  const tools = buildTools(allowWrite);
  const instances = new Map();

  const getCodex = (requestedRoot) => {
    const targetRoot = requestedRoot
      ? resolveAllowedRoot(requestedRoot, defaultRoot, options.allowedRoots)
      : defaultRoot;
    if (!instances.has(targetRoot)) {
      instances.set(targetRoot, createCodex({
        ...options,
        root: targetRoot,
        allowWrite,
      }));
    }
    return instances.get(targetRoot);
  };

  function callTool(name, args = {}) {
    try {
      const codex = getCodex(args.root);

      if (name === 'codex_module') {
        const res = codex.queryModule(args.target);
        if (!res) return errResult(`No module or directory matched "${args.target ?? ''}".`);
        return okResult(res);
      }

      if (name === 'codex_routes') {
        const res = codex.queryRoutes(args.filter ?? '');
        const kind = args.kind ?? 'all';
        if (kind === 'http') return okResult({ layout: res.layout, cacheStatus: res.cacheStatus, counts: res.counts, httpRoutes: res.httpRoutes });
        if (kind === 'ws') return okResult({ layout: res.layout, cacheStatus: res.cacheStatus, scannerStatus: res.scannerStatus, counts: res.counts, wsFrames: res.wsFrames });
        if (kind === 'save') return okResult({ layout: res.layout, cacheStatus: res.cacheStatus, counts: res.counts, saveHooks: res.saveHooks });
        return okResult(res);
      }

      if (name === 'codex_schema') {
        const res = codex.querySchema(args.filter ?? '');
        const compactTables = !args.filter && res.tables.length > 50
          ? res.tables.map((t) => ({ name: t.name, originMigration: t.originMigration, primaryKeys: t.primaryKeys, columnCount: t.columns.length }))
          : res.tables;
        return okResult({
          layout: res.layout,
          cacheStatus: res.cacheStatus,
          scannerStatus: res.scannerStatus,
          filter: res.filter,
          migrationCount: res.migrationCount,
          tableCount: res.tableCount,
          triggerCount: res.triggerCount,
          matchedTableCount: res.matchedTableCount,
          matchedRoomKeyCount: res.matchedRoomKeyCount,
          tables: compactTables,
          roomKeys: res.roomKeys,
        });
      }

      if (name === 'codex_card') {
        const action = args.action ?? (args.biblePath ? 'resolve-bible' : args.content ? 'write' : args.slug ? 'read' : args.query ? 'search' : 'list');
        if (action === 'list') return okResult(codex.listCards());
        if (action === 'search') return okResult(codex.searchCards(args.query ?? ''));
        if (action === 'resolve-bible') {
          if (!args.biblePath) return errResult('codex_card resolve-bible requires "biblePath".');
          return okResult(codex.resolveBible(args.biblePath, { includeContent: args.includeContent === true }));
        }
        if (action === 'check') return okResult(codex.checkAllCards());
        if (action === 'read') {
          const card = codex.readCard(args.slug ?? '', { includeContent: args.includeContent === true });
          if (!card) return errResult(`Card not found: ${args.slug ?? ''}`);
          return okResult(card);
        }
        if (action === 'write') {
          if (!allowWrite) {
            return errResult('codex_card write is disabled in read-only MCP mode. Set CODEX_ALLOW_WRITE=1 or use CLI --write from the maintainer lane.');
          }
          if (!args.slug || typeof args.content !== 'string') {
            return errResult('codex_card write requires both "slug" and "content".');
          }
          return okResult(codex.writeCard(args.slug, args.content));
        }
        return errResult(`Unsupported codex_card action: ${action}`);
      }

      if (name === 'codex_invariants') {
        return okResult(codex.queryInvariants({
          file: args.file,
          route: args.route,
          table: args.table,
          domain: args.domain,
          query: args.query,
          limit: args.limit,
          fields: args.fields,
        }));
      }

      if (name === 'codex_diff') {
        return okResult(codex.queryDiff(args.baseRef ?? '', args.headRef ?? ''));
      }

      if (name === 'codex_dfu') {
        const action = args.action ?? (args.file ? 'read' : args.query ? 'search' : 'fetch');
        if (action === 'fetch') return okResult(codex.fetchDfu());
        if (action === 'search') {
          if (!args.query) return errResult('codex_dfu search requires "query".');
          return okResult(codex.searchDfu(args.query, args.limit ?? 25));
        }
        if (action === 'read') {
          if (!args.file) return errResult('codex_dfu read requires "file".');
          const res = codex.readDfu(args.file, args.startLine ?? 1, args.endLine);
          if (!res) return errResult(`C# file not found: ${args.file}`);
          return okResult(res);
        }
        return errResult(`Unsupported codex_dfu action: ${action}`);
      }

      return errResult(`Unknown tool: ${name}`);
    } catch (err) {
      return errResult(err?.message ?? String(err));
    }
  }

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    }
    if (msg.id === undefined) {
      return null;
    }
    const { id, method, params } = msg;
    if (method === 'initialize') {
      const requested = String(params?.protocolVersion ?? '');
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested) ? requested : '2024-11-05';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }
    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools } };
    }
    if (method === 'tools/call') {
      const toolName = params?.name;
      if (typeof toolName !== 'string') {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
      }
      return { jsonrpc: '2.0', id, result: callTool(toolName, params?.arguments ?? {}) };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }

  return { handleMessage, callTool, tools };
}

export function startStdioServer(options = {}) {
  const { handleMessage } = createMcpDispatcher(options);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  let buf = Buffer.alloc(0);

  const send = (payload, framed) => {
    if (!payload) return;
    const json = JSON.stringify(payload);
    if (framed) {
      const byteLen = Buffer.byteLength(json, 'utf8');
      output.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
      output.write(`${json}\n`);
    }
  };

  const drain = () => {
    while (buf.length > 0) {
      let lead = 0;
      while (lead < buf.length && (buf[lead] === 0x0d || buf[lead] === 0x0a || buf[lead] === 0x20 || buf[lead] === 0x09)) {
        lead++;
      }
      if (lead > 0 && !buf.subarray(0, lead + 16).toString('utf8').startsWith('Content-Length:')) {
        buf = buf.subarray(lead);
      }
      if (buf.length === 0) break;

      const headProbe = buf.subarray(0, Math.min(buf.length, 64)).toString('utf8');
      if (/^Content-Length:/i.test(headProbe)) {
        const sepIdx = buf.indexOf('\r\n\r\n');
        const altIdx = sepIdx === -1 ? buf.indexOf('\n\n') : -1;
        const headerEnd = sepIdx !== -1 ? sepIdx : altIdx;
        const delimLen = sepIdx !== -1 ? 4 : 2;
        if (headerEnd === -1) break;
        const headerStr = buf.subarray(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(headerStr);
        if (!m) {
          buf = buf.subarray(headerEnd + delimLen);
          continue;
        }
        const bodyLen = Number(m[1]);
        const frameEnd = headerEnd + delimLen + bodyLen;
        if (buf.length < frameEnd) break;
        const rawJson = buf.subarray(headerEnd + delimLen, frameEnd).toString('utf8');
        buf = buf.subarray(frameEnd);
        try {
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed)) {
            const responses = parsed.map(handleMessage).filter(Boolean);
            if (responses.length) send(responses, true);
          } else {
            send(handleMessage(parsed), true);
          }
        } catch {
          send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, true);
        }
        continue;
      }

      const nlIdx = buf.indexOf(0x0a);
      if (nlIdx === -1) break;
      const line = buf.subarray(0, nlIdx).toString('utf8').trim();
      buf = buf.subarray(nlIdx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          const responses = parsed.map(handleMessage).filter(Boolean);
          if (responses.length) send(responses, false);
        } else {
          send(handleMessage(parsed), false);
        }
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, false);
      }
    }
  };

  input.on('data', (chunk) => {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    buf = buf.length === 0 ? b : Buffer.concat([buf, b]);
    drain();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  startStdioServer();
}
