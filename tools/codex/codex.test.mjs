// Automated test suite for codex: engine layers 1-3, caching, guardrails, CLI, and stdio MCP.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCodex, isBunnyfallRepo, MAX_CARD_WORDS, resolveAllowedRoot, resolveRoot, validateCard } from './engine.mjs';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const MODULE_ROOT = resolve(HERE, '..', '..');
const CLI_PATH = resolve(HERE, 'cli.mjs');
const MCP_PATH = resolve(HERE, 'mcp.mjs');

function findTestRepoRoot() {
  const candidates = [
    process.env.BUNNYFALL_ROOT,
    MODULE_ROOT,
    resolve(process.cwd()),
  ].filter(Boolean);
  for (const c of candidates) {
    if (isBunnyfallRepo(c)) return resolve(c);
  }
  throw new Error('Set BUNNYFALL_ROOT to a Bunnyfall repository checkout before running codex.test.mjs.');
}

const ROOT = findTestRepoRoot();
const TMP_CACHE = mkdtempSync(join(tmpdir(), 'bf-codex-cache-'));
const codex = createCodex({ root: ROOT, cacheDir: TMP_CACHE });

test('resolveRoot fails explicitly outside a repository when BUNNYFALL_ROOT is unset', () => {
  const outside = mkdtempSync(join(tmpdir(), 'bf-codex-empty-'));
  const prevCwd = process.cwd();
  const prevEnv = process.env.BUNNYFALL_ROOT;
  try {
    delete process.env.BUNNYFALL_ROOT;
    process.chdir(outside);
    assert.throws(() => resolveRoot(), /Could not locate a Bunnyfall repository/);
  } finally {
    process.chdir(prevCwd);
    if (prevEnv !== undefined) process.env.BUNNYFALL_ROOT = prevEnv;
    rmSync(outside, { recursive: true, force: true });
  }
});

test('Layer 1 queryModule: file AST exports, imports, inbound callers, and directory summary', () => {
  const formulas = codex.queryModule('src/combat/formulas.js');
  assert.ok(formulas && formulas.kind === 'file');
  assert.equal(formulas.file, 'src/combat/formulas.js');
  assert.ok(formulas.exports.length >= 20);
  assert.ok(formulas.inboundCallers.length >= 20);
  assert.ok(formulas.metrics.totalLines > 100);
  assert.ok(formulas.metrics.nonEmptyLines > 80);

  const world = codex.queryModule('src/scenes/world.js');
  assert.ok(world && world.kind === 'file');
  assert.ok(world.metrics.hostFunctions.some((h) => h.name === 'bootWorld' && h.bindings > 100));

  const dirSummary = codex.queryModule('server-account/src');
  assert.ok(dirSummary && dirSummary.kind === 'directory');
  assert.ok(dirSummary.fileCount >= 20);
  assert.ok(dirSummary.totals.exportCount > 20);
});

test('Layer 1 queryRoutes: HTTP routes with auth/consistency, WS room frames, and save hooks', () => {
  const all = codex.queryRoutes('');
  assert.ok(all.counts.totalHttpRoutes >= 480);
  assert.ok(all.counts.totalWsFrames >= 51);
  assert.ok(all.counts.totalSaveHooks >= 50);

  const health = codex.queryRoutes('/v1/health');
  assert.ok(health.httpRoutes.some((r) => r.path === '/v1/health' && r.inServiceRoutes && r.auth === 'open'));

  const patreon = codex.queryRoutes('/v1/patreon/webhook');
  assert.ok(patreon.httpRoutes.some((r) => r.path === '/v1/patreon/webhook' && r.auth === 'patreon-open'));

  const token = codex.queryRoutes('/v1/auth/token');
  assert.ok(token.httpRoutes.some((r) => r.path === '/v1/auth/token' && r.consistency === 'primary-first'));

  const heartbeat = codex.queryRoutes('/v1/heartbeat');
  assert.ok(heartbeat.httpRoutes.some((r) => r.path === '/v1/heartbeat' && r.consistency === 'replica'));

  const market = codex.queryRoutes('/v1/market/buy');
  const buyRoute = market.httpRoutes.find((r) => r.path === '/v1/market/buy');
  assert.ok(buyRoute && buyRoute.inServiceRoutes);
  assert.ok(buyRoute.handlers.length >= 1);

  const renownFrame = all.wsFrames.find((f) => f.frame === 'renown');
  assert.ok(renownFrame && renownFrame.server);
  if (all.layout === 'clean') {
    assert.match(String(renownFrame.server), /^server\/src\/message\/frames\/renown\.js:\d+$/);
  } else {
    assert.match(String(renownFrame.server), /^server\/src\/index\.js:\d+$/);
  }

  const modHooks = all.saveHooks.filter((s) => s.kind === 'modSaveData');
  const coreHooks = all.saveHooks.filter((s) => s.kind === 'worldOrPlayerSave');
  assert.ok(modHooks.length >= 15);
  assert.ok(coreHooks.length >= 10);
});

test('Layer 1 querySchema: SQLite migrations, tables, columns, PKs, and room KV keys', () => {
  const full = codex.querySchema('');
  assert.ok(full.migrationCount >= 209);
  assert.ok(full.tableCount >= 300);
  assert.ok(full.triggerCount >= 40);
  assert.ok(full.roomKeys.length >= 20);
  assert.ok(full.roomKeys.some((k) => k.name === 'WORLD_META' && k.pattern === 'world:meta'));
  assert.ok(full.roomKeys.some((k) => k.name === 'partyKey'));

  const players = codex.querySchema('players').tables.find((t) => t.name === 'players');
  assert.ok(players);
  assert.equal(players.originMigration, '0001_accounts.sql');
  assert.deepEqual(players.primaryKeys, ['id']);
  assert.ok(players.columns.some((c) => c.name === 'handle'));
});

test('Atomic disk cache: warm read hits disk cache and skips rebuild', () => {
  const fresh = createCodex({ root: ROOT, cacheDir: TMP_CACHE });
  const first = fresh.querySchema('players');
  assert.equal(first.cacheStatus, 'disk-hit');
  const second = fresh.querySchema('players');
  assert.equal(second.cacheStatus, 'memory-hit');
});

test('Layer 2 cards: guardrails, structured frontmatter, resolveBible, invariants, and read-only guard', () => {
  const goodCard = [
    '---',
    'slug: sample-valid-card',
    'title: Sample Valid Card',
    'domain: combat',
    'kind: overview',
    'files:',
    '  - src/combat/formulas.js',
    'routes:',
    '  - /v1/health',
    'tables:',
    '  - players',
    'replacesBible:',
    '  - 05-Combat/Sample-Arc.md',
    'invariants:',
    '  - "Classic damage tables stay integer-clamped."',
    'traps:',
    '  - "Do not bypass armor mitigation checks."',
    'tags:',
    '  - combat',
    '---',
    '',
    '# Sample Valid Card',
    '',
    'Damage helpers live in `src/combat/formulas.js` and keep classic table math intact.',
    '',
  ].join('\n');

  assert.equal(validateCard('sample-valid-card', goodCard).ok, true);

  const emDash = goodCard.replace('table math intact.', `table math ${'\u2014'} intact.`);
  assert.ok(validateCard('sample-valid-card', emDash).issues.some((i) => i.code === 'EM_DASH'));

  const genitive = goodCard.replace('table math intact.', "the player's sword's swing hits first.");
  assert.ok(validateCard('sample-valid-card', genitive).issues.some((i) => i.code === 'GENITIVE_STACK'));

  const filler = goodCard.replace('table math intact.', 'seamless combat math intact.');
  assert.ok(validateCard('sample-valid-card', filler).issues.some((i) => i.code === 'PADDING_OR_FILLER'));

  const badKind = goodCard.replace('kind: overview', 'kind: bogus');
  assert.ok(validateCard('sample-valid-card', badKind).issues.some((i) => i.code === 'KIND_INVALID'));

  const tooLong = `${goodCard}\n${new Array(MAX_CARD_WORDS + 10).fill('word').join(' ')}\n`;
  assert.ok(validateCard('sample-valid-card', tooLong).issues.some((i) => i.code === 'WORD_LIMIT'));

  const tmpCards = mkdtempSync(join(tmpdir(), 'bf-codex-cards-'));
  try {
    const roCodex = createCodex({ root: ROOT, cardsDir: tmpCards, allowWrite: false, cacheDir: TMP_CACHE });
    assert.throws(() => roCodex.writeCard('sample-valid-card', goodCard, { dir: tmpCards }), /read-only/i);

    const rwCodex = createCodex({ root: ROOT, cardsDir: tmpCards, allowWrite: true, cacheDir: TMP_CACHE });
    const saved = rwCodex.writeCard('sample-valid-card', goodCard, { dir: tmpCards });
    assert.equal(saved.slug, 'sample-valid-card');
    const diskText = readFileSync(join(tmpCards, 'sample-valid-card.md'), 'utf8');
    assert.equal(diskText.includes('\r'), false);
    assert.throws(() => rwCodex.writeCard('sample-valid-card', filler, { dir: tmpCards }), /PADDING_OR_FILLER/);

    const resolved = rwCodex.resolveBible('bible/05-Combat/Sample-Arc.md');
    assert.equal(resolved.directMatch, true);
    assert.equal(resolved.cards[0].slug, 'sample-valid-card');

    const inv = rwCodex.queryInvariants({ table: 'players', domain: 'combat' });
    assert.equal(inv.matchedCount, 1);
    assert.equal(inv.results[0].invariants.length, 1);
  } finally {
    rmSync(tmpCards, { recursive: true, force: true });
  }

  const checked = codex.checkAllCards();
  assert.equal(checked.ok, true, JSON.stringify(checked.failures));
  if (checked.cardCount > 0) {
    const listed = codex.listCards();
    assert.equal(listed.length, checked.cardCount);
    const first = codex.readCard(listed[0].slug);
    assert.ok(first && first.wordCount <= MAX_CARD_WORDS);
    const hits = codex.searchCards(listed[0].slug.split('-')[0]);
    assert.ok(hits.length >= 1);
  }
});

test('Layer 2 queryDiff and resolveAllowedRoot guard', () => {
  const diff = codex.queryDiff('HEAD~1', 'HEAD');
  assert.equal(typeof diff.changedCount, 'number');
  assert.ok(Array.isArray(diff.impactedCards));

  assert.equal(resolveAllowedRoot(ROOT, ROOT), ROOT);
  const badOutside = mkdtempSync(join(tmpdir(), 'bf-outside-root-'));
  try {
    mkdirSync(join(badOutside, 'src'), { recursive: true });
    writeFileSync(join(badOutside, 'src/main.js'), '// fake\n');
    mkdirSync(join(badOutside, 'server-account/migrations'), { recursive: true });
    assert.throws(() => resolveAllowedRoot(badOutside, ROOT, [ROOT]), /outside allowed/);
  } finally {
    rmSync(badOutside, { recursive: true, force: true });
  }
});

test('Layer 3 DFU C# reference: fetchDfu, searchDfu, and readDfu on WeaponManager.cs and FormulaHelper.cs', () => {
  const status = codex.fetchDfu();
  assert.ok(status.csFileCount >= 800);

  const searchRes = codex.searchDfu('CalculateAttackDamage', 10);
  assert.ok(searchRes.totalMatches >= 1);
  assert.ok(searchRes.results.some((r) => r.file.endsWith('FormulaHelper.cs')));

  const excerpt = codex.readDfu('WeaponManager.cs', 1, 35);
  assert.ok(excerpt);
  assert.equal(excerpt.file, 'Assets/Scripts/Game/WeaponManager.cs');
  assert.equal(excerpt.startLine, 1);
  assert.equal(excerpt.endLine, 35);
  assert.equal(excerpt.lines.length, 35);
  assert.match(excerpt.excerpt, /WeaponManager/);

  assert.throws(() => codex.readDfu('../package.json', 1, 5), /Invalid C# file path/);
});

test('CLI subcommands: module, routes, schema, invariants, dfu-read, and check', () => {
  const run = (args) => spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', CLI_PATH, ...args],
    { cwd: ROOT, encoding: 'utf8' },
  );

  const modTarget = existsSync(resolve(ROOT, 'src/saves/modSaveData.js'))
    ? 'src/saves/modSaveData.js'
    : 'src/systems/modSaveData.js';
  const modOut = run(['module', modTarget, '--json']);
  assert.equal(modOut.status, 0, modOut.stderr);
  assert.equal(modOut.stderr, '');
  const modJson = JSON.parse(modOut.stdout);
  assert.equal(modJson.file, modTarget);
  assert.ok(modJson.exports.some((e) => e.name === 'registerModSaveData'));

  const schemaOut = run(['schema', 'homes', '--json']);
  assert.equal(schemaOut.status, 0, schemaOut.stderr);
  const schemaJson = JSON.parse(schemaOut.stdout);
  assert.ok(schemaJson.migrationCount >= 209);
  assert.ok(schemaJson.tableCount >= 300);
  assert.ok(schemaJson.tables.length >= 1);

  const invOut = run(['invariants', '--file', 'src/scenes/world.js', '--json']);
  assert.equal(invOut.status, 0, invOut.stderr);
  const invJson = JSON.parse(invOut.stdout);
  assert.ok(invJson.matchedCount >= 1);

  const dfuReadOut = run(['dfu-read', 'DaggerfallMissile.cs:1-25', '--json']);
  assert.equal(dfuReadOut.status, 0, dfuReadOut.stderr);
  const dfuJson = JSON.parse(dfuReadOut.stdout);
  assert.equal(dfuJson.file, 'Assets/Scripts/Game/DaggerfallMissile.cs');
  assert.equal(dfuJson.lines.length, 25);

  const checkOut = run(['check', '--json']);
  assert.equal(checkOut.status, 0, checkOut.stdout + checkOut.stderr);
  const checkJson = JSON.parse(checkOut.stdout);
  assert.equal(checkJson.ok, true);
  assert.ok(checkJson.wsFrames >= 51);
  assert.ok(checkJson.roomKeys >= 20);
});

test('MCP stdio server: newline JSON-RPC, Content-Length framing, read-only guard, and new tools', async () => {
  const outsideCwd = mkdtempSync(join(tmpdir(), 'bf-mcp-cwd-'));
  writeFileSync(join(outsideCwd, 'note.txt'), 'outside workspace\n');
  assert.equal(resolveRoot(ROOT), ROOT);

  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MCP_PATH], {
    cwd: outsideCwd,
    env: { ...process.env, BUNNYFALL_ROOT: ROOT, CODEX_ALLOW_WRITE: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let stdoutBuf = Buffer.alloc(0);

  const parseIncoming = () => {
    while (stdoutBuf.length > 0) {
      const probe = stdoutBuf.subarray(0, Math.min(stdoutBuf.length, 48)).toString('utf8');
      if (probe.startsWith('Content-Length:')) {
        const idx = stdoutBuf.indexOf('\r\n\r\n');
        if (idx === -1) break;
        const m = /Content-Length:\s*(\d+)/i.exec(stdoutBuf.subarray(0, idx).toString('utf8'));
        const len = Number(m[1]);
        if (stdoutBuf.length < idx + 4 + len) break;
        const msg = JSON.parse(stdoutBuf.subarray(idx + 4, idx + 4 + len).toString('utf8'));
        stdoutBuf = stdoutBuf.subarray(idx + 4 + len);
        pending.get(msg.id)?.({ msg, framed: true });
        continue;
      }
      const nl = stdoutBuf.indexOf(0x0a);
      if (nl === -1) break;
      const line = stdoutBuf.subarray(0, nl).toString('utf8').trim();
      stdoutBuf = stdoutBuf.subarray(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.({ msg, framed: false });
    }
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
    parseIncoming();
  });

  const rpc = (id, method, params, useFrame = false) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`RPC timeout on ${method}`)), 15000);
    pending.set(id, (val) => {
      clearTimeout(timer);
      pending.delete(id);
      res(val);
    });
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    if (useFrame) {
      child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    } else {
      child.stdin.write(`${payload}\n`);
    }
  });

  try {
    const init = await rpc(1, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'codex-test', version: '1.1.0' },
    });
    assert.equal(init.framed, false);
    assert.equal(init.msg.result.protocolVersion, '2025-03-26');
    assert.equal(init.msg.result.serverInfo.name, 'codex');

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    const list = await rpc(2, 'tools/list', {});
    const toolNames = list.msg.result.tools.map((t) => t.name);
    assert.deepEqual(toolNames, [
      'codex_module',
      'codex_routes',
      'codex_schema',
      'codex_card',
      'codex_invariants',
      'codex_diff',
      'codex_dfu',
    ]);

    const writeDenied = await rpc(3, 'tools/call', {
      name: 'codex_card',
      arguments: { action: 'write', slug: 'blocked-test', content: '---\nslug: blocked-test\n---\n# Blocked\n' },
    });
    assert.equal(writeDenied.msg.result.isError, true);
    assert.match(writeDenied.msg.result.content[0].text, /read-only/i);

    const schemaCall = await rpc(4, 'tools/call', { name: 'codex_schema', arguments: { filter: 'players' } });
    const schemaData = JSON.parse(schemaCall.msg.result.content[0].text);
    assert.ok(schemaData.migrationCount >= 209);
    assert.ok(schemaData.tableCount >= 300);
    assert.ok(schemaData.tables.some((t) => t.name === 'players'));

    const invCall = await rpc(5, 'tools/call', { name: 'codex_invariants', arguments: { file: 'src/scenes/world.js' } });
    const invData = JSON.parse(invCall.msg.result.content[0].text);
    assert.ok(invData.matchedCount >= 1);

    const dfuFramed = await rpc(6, 'tools/call', {
      name: 'codex_dfu',
      arguments: { action: 'read', file: 'WeaponManager.cs', startLine: 1, endLine: 15 },
    }, true);
    assert.equal(dfuFramed.framed, true);
    const dfuData = JSON.parse(dfuFramed.msg.result.content[0].text);
    assert.equal(dfuData.file, 'Assets/Scripts/Game/WeaponManager.cs');
    assert.equal(dfuData.lines.length, 15);
  } finally {
    child.stdin.end();
    if (child.exitCode === null) {
      await new Promise((r) => {
        child.once('exit', r);
        child.kill();
      });
    }
    rmSync(outsideCwd, { recursive: true, force: true });
    rmSync(TMP_CACHE, { recursive: true, force: true });
  }
});
