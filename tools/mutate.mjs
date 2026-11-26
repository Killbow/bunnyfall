// Runs committed mutation lists: each mutant applied, its named tests run, and the file restored byte for byte.
// Run: node tools/mutate.mjs [--jobs N] tools/mutants/*.json.
// Exit 1 on an unexpected survivor, an unexpected death, or a mutant that does not apply; 2 when a source cannot be
// restored; 130 when interrupted.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, cpSync, mkdtempSync, symlinkSync, rmSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

let jobs = 1;
const listArgs = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], eq = /^--jobs=(\d+)$/.exec(a);
  if (a === '--jobs' || a === '-j') { jobs = Math.max(1, Number(process.argv[++i]) | 0); continue; }
  if (eq) { jobs = Math.max(1, Number(eq[1]) | 0); continue; }
  listArgs.push(a);
}
const lists = listArgs.map((listPath) => [listPath, JSON.parse(readFileSync(listPath, 'utf8'))]);

// A .mutbak left by an interrupted run is the only clean copy of its file, so nothing runs while one exists.
const leftovers = [...new Set(lists.flatMap(([, list]) => list.map((m) => m.file)))].filter((f) => existsSync(`${f}.mutbak`));
if (leftovers.length) {
  for (const f of leftovers) console.log(`${f}.mutbak exists - a previous run was interrupted: move it back over ${f} and re-run`);
  process.exit(2);
}

// A signal must not kill this process mid-mutant, because the finally below restores the source. The children run
// async because a signal handler cannot run while spawnSync blocks.
let interrupted = null;
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { interrupted = sig; for (const c of children) c.kill(sig); });

const run = (args, opts = {}) => new Promise((resolve) => {
  const chunks = [];
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  children.add(child);
  child.stdout.on('data', (c) => chunks.push(c));
  child.on('error', (error) => { children.delete(child); resolve({ status: null, signal: null, error, stdout: '' }); });
  child.on('close', (status, signal) => { children.delete(child); resolve({ status, signal, error: null, stdout: Buffer.concat(chunks).toString('utf8') }); });
});

async function verdict(m, cwd, env) {
  // A mutant that does not parse fails every test that loads the file, so its death proves nothing.
  if (!m.syntax && /\.[cm]?js$/.test(m.file)) {
    const chk = await run(['--check', m.file], { cwd, env });
    if (interrupted) return null;
    if (chk.status !== 0) return { kind: 'noapply', text: `  ${m.name}: DOES NOT PARSE - not a verdict; re-aim the record by content` };
  }
  // Ask for TAP, because Node's default reporter may be spec.
  const r = await run(['--test', '--test-reporter=tap', ...m.tests], { cwd, env });
  if (interrupted) return null;
  const failing = (r.stdout.match(/^not ok/gm) ?? []).length;
  if (r.error || r.status === null) return { kind: 'noapply', text: `  ${m.name}: HARNESS ERROR (${r.error?.code ?? `signal ${r.signal}`}) - not a verdict` };
  if (m.equivalent) {
    if (r.status === 0) return { kind: 'equivalent', text: `  ${m.name}: equivalent, as recorded - ${m.why ?? ''}` };
    return { kind: 'stale', text: `  ${m.name}: recorded as equivalent but DIED (${failing} failing) - the record is stale` };
  }
  if (r.status === 0) return { kind: 'survived', text: `  ${m.name}: SURVIVED  <-- the pins cannot fail this` };
  return { kind: 'dead', text: `  ${m.name}: dead (${failing} failing)` };
}

async function judgeInPlace(m) {
  const src = readFileSync(m.file, 'utf8');
  if (!src.includes(m.old)) return { kind: 'noapply', text: `  ${m.name}: COULD NOT APPLY - the source moved; update the record` };
  const bak = m.file + '.mutbak';
  copyFileSync(m.file, bak);
  try {
    // A function replacer, so $& and $1 in the new text stay literal.
    writeFileSync(m.file, src.replace(m.old, () => m.new));
    return await verdict(m);
  } finally {
    copyFileSync(bak, m.file); unlinkSync(bak);
    if (readFileSync(m.file, 'utf8') !== src) { console.log(`  !! ${m.file} NOT RESTORED`); process.exit(2); }
    if (interrupted) { console.log(`\ninterrupted (${interrupted}) - ${m.file} restored, no verdict for ${m.name}`); process.exit(130); }
  }
}

const counts = { dead: 0, survived: 0, equivalent: 0, stale: 0, noapply: 0 };
const tally = (v) => { counts[v.kind]++; console.log(v.text); };

const LINKED = new Set(['node_modules', 'public', 'vendor', 'bible']);
const LEFT_OUT = (name) => name === '.git' || name === 'dist' || name.startsWith('dist-') || name === '.wrangler' || name === '.claude';

function workspace() {
  const root = process.cwd();
  const ws = mkdtempSync(join(tmpdir(), 'mutate-'));
  for (const name of readdirSync(root)) {
    if (LEFT_OUT(name)) continue;
    const from = join(root, name), to = join(ws, name);
    if (LINKED.has(name) && statSync(from).isDirectory()) { symlinkSync(from, to, 'dir'); continue; }
    cpSync(from, to, { recursive: true, filter: (p) => !/[\\/](node_modules|\.wrangler|\.git)$/.test(p) || p === from });
    const nested = join(from, 'node_modules');
    if (statSync(from).isDirectory() && existsSync(nested)) symlinkSync(nested, join(to, 'node_modules'), 'dir');
  }
  mkdirSync(join(ws, '.tmp'));
  return ws;
}
const envOf = (ws) => ({ ...process.env, TMPDIR: join(ws, '.tmp'), TEMP: join(ws, '.tmp'), TMP: join(ws, '.tmp') });

async function judgeIn(ws, m) {
  const path = join(ws, m.file);
  const src = readFileSync(path, 'utf8');
  if (!src.includes(m.old)) return { kind: 'noapply', text: `  ${m.name}: COULD NOT APPLY - the source moved; update the record` };
  writeFileSync(path, src.replace(m.old, () => m.new));
  try { return await verdict(m, ws, envOf(ws)); } finally { writeFileSync(path, src); }
}

async function failingHere(tests) {
  const bad = new Set();
  for (const f of tests) {
    const r = await run(['--test', '--test-reporter=tap', f]);
    if (interrupted) { console.log(`\ninterrupted (${interrupted}) - nothing was mutated here`); process.exit(130); }
    if (r.status !== 0) bad.add(f);
  }
  return bad;
}
const unrunnable = (m, broken) => {
  const bad = m.tests.filter((f) => broken.has(f));
  return bad.length ? { kind: 'noapply', text: `  ${m.name}: ITS TESTS FAIL UNMUTATED (${bad.join(', ')}) - not a verdict; make them pass first` } : null;
};

async function parallel(n) {
  const all = lists.flatMap(([listPath, list]) => (list.length ? list.map((m, i) => ({ listPath, first: i === 0, count: list.length, m })) : [{ listPath, first: true, count: 0, m: null }]));
  const spaces = Array.from({ length: n }, workspace);
  process.on('exit', () => { for (const ws of spaces) rmSync(ws, { recursive: true, force: true }); });
  const tests = [...new Set(all.flatMap((e) => e.m?.tests ?? []))];
  const fails = new Set();
  let t = 0;
  await Promise.all(spaces.map(async (ws) => {
    while (t < tests.length && !interrupted) {
      const f = tests[t++];
      const r = await run(['--test', '--test-reporter=tap', f], { cwd: ws, env: envOf(ws) });
      if (r.status !== 0) fails.add(f);
    }
  }));
  if (interrupted) { console.log(`\ninterrupted (${interrupted}) - nothing was mutated here`); process.exit(130); }
  const inPlace = (m) => !!m && (m.tests.some((f) => fails.has(f)) || LINKED.has(m.file.split(/[\\/]/)[0]));
  const mutants = all.filter((e) => e.m).length;
  console.log(`(${n} workspaces; ${all.filter((e) => inPlace(e.m)).length} of ${mutants} mutants judged in place${fails.size ? ` - their tests do not pass outside this tree: ${[...fails].join(', ')}` : ''})`);
  const broken = await failingHere([...fails]);
  if (broken.size) console.log(`(no verdict for their records - these fail here too, with no mutant: ${[...broken].join(', ')})`);
  const out = all.map((e) => (e.m ? null : { kind: null }));
  let printed = 0;
  const flush = () => {
    while (printed < all.length && out[printed]) {
      const e = all[printed];
      if (e.first) console.log(`\n== ${e.listPath} (${e.count} mutants)`);
      if (e.m) tally(out[printed]);
      printed++;
    }
  };
  let next = 0;
  const workers = spaces.map(async (ws) => {
    while (!interrupted) {
      let k = next;
      while (k < all.length && (out[k] || !all[k].m || inPlace(all[k].m) || all[k].taken)) k++;
      next = Math.max(next, k);
      if (k >= all.length) return;
      all[k].taken = true;
      const v = await judgeIn(ws, all[k].m);
      if (!v) return;
      out[k] = v; flush();
    }
  });
  const here = (async () => {
    for (let k = 0; k < all.length && !interrupted; k++) {
      if (!all[k].m || !inPlace(all[k].m)) continue;
      out[k] = unrunnable(all[k].m, broken) ?? await judgeInPlace(all[k].m); flush();
    }
  })();
  await Promise.all([...workers, here]);
  if (interrupted) { console.log(`\ninterrupted (${interrupted}) - the sources are untouched`); process.exit(130); }
  flush();
}

if (jobs <= 1) {
  const broken = await failingHere([...new Set(lists.flatMap(([, list]) => list.flatMap((m) => m.tests)))]);
  if (broken.size) console.log(`(no verdict for their records - these fail with no mutant: ${[...broken].join(', ')})`);
  for (const [listPath, list] of lists) {
    console.log(`\n== ${listPath} (${list.length} mutants)`);
    for (const m of list) tally(unrunnable(m, broken) ?? await judgeInPlace(m));
  }
} else {
  await parallel(jobs);
}
console.log(`\n${counts.dead} dead, ${counts.survived} survived, ${counts.equivalent} equivalent as recorded, ${counts.stale} stale records, ${counts.noapply} did not apply`);
process.exit(counts.survived || counts.noapply || counts.stale ? 1 : 0);
