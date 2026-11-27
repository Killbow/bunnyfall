// Lists unstruck Port-Ledger section C rows beside evidence they may have shipped: arc doc headings and DFU members
// in src/. It is an aid, not a gate, and a clean run proves nothing.
// Run: node tools/ledgerSweep.mjs [--all] [--ledger <path>].
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const LEDGER = argv.includes('--ledger')
  ? argv[argv.indexOf('--ledger') + 1]
  : join(ROOT, 'bible/01-Overview/Port-Ledger.md');

const ledger = readFileSync(LEDGER, 'utf8');
// Section C ends at the next ## heading; a missing heading is an error, not zero rows.
const HEAD_C = '## C. DFU features not yet ported';
const startC = ledger.indexOf(HEAD_C);
if (startC < 0) { console.error(`"${HEAD_C}" is not in ${LEDGER}`); process.exit(2); }
const endC = ledger.indexOf('\n## ', startC + HEAD_C.length);
const secC = ledger.slice(startC, endC < 0 ? undefined : endC);
const rows = secC.split('\n')
  .filter((l) => l.startsWith('|') && !l.startsWith('|---') && !l.startsWith('| Feature'))
  .map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    return { feature: c[0] ?? '', source: c[1] ?? '', target: c[2] ?? '' };
  });
// Kept and Not planned rows are decisions, not claims that something is unported, so they are skipped.
const open = rows.filter((r) => !r.feature.includes('~~') && !/^(Kept|Not planned)/.test(r.target));

const bible = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (f.endsWith('.md')) bible.push(f);
  }
})(join(ROOT, 'bible'));
const headings = [];
for (const f of bible) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (/^##+ /.test(line) && /\bSHIPPED\b|\bCLOSED\b/.test(line)) {
      headings.push({ file: f.slice(ROOT.length), text: line.replace(/^#+\s*/, '') });
    }
  }
}

const STOPW = new Set(['interior', 'exterior', 'player', 'system', 'systems', 'shipped', 'closed',
  'classic', 'verbatim', 'arc', 'until', 'their', 'these', 'those', 'which', 'where', 'still',
  'audit', 'window', 'windows', 'effects', 'effect', 'quest', 'items', 'item']);
const wordsOf = (s) => new Set((s.toLowerCase().match(/[a-z][a-z/-]{4,}/g) || [])
  .flatMap((w) => w.split(/[/-]/))
  .filter((w) => w.length >= 5 && !STOPW.has(w)));

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (f.endsWith('.js')) files.push(f);
  }
})(join(ROOT, 'src'));
const tree = files.map((f) => ({ path: f.slice(ROOT.length), src: readFileSync(f, 'utf8') }));

const STOP = new Set(['Systems', 'Rendering', 'Player', 'Audio', 'Combat', 'Kept', 'Unity', 'DFU',
  'Increased', 'Decreased', 'Interior', 'Exterior', 'Assets', 'Scripts']);
// Require two CamelCase humps: a single word such as Increased matches half the tree.
const membersOf = (s) => [...new Set((s.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || []))]
  .filter((m) => !STOP.has(m) && m.length >= 8);
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

let suspects = 0;
for (const r of open) {
  const fw = wordsOf(r.feature);
  const headHits = headings
    .map((h) => ({ h, shared: [...wordsOf(h.text)].filter((w) => fw.has(w)) }))
    .filter((x) => x.shared.length >= 2)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 2);

  const memberHits = [];
  for (const m of membersOf(r.source)) {
    let code = 0; const where = new Set();
    for (const f of tree) {
      for (const line of f.src.split('\n')) {
        if (line.includes(m) && !isComment(line)) { code++; where.add(f.path); }
      }
    }
    if (code) memberHits.push({ m, code, where: [...where].slice(0, 2) });
  }

  const hot = headHits.length || memberHits.length;
  if (!hot && !ALL) continue;
  if (hot) suspects++;
  console.log('\n' + (hot ? '  SUSPECT  ' : '  clear    ') + r.feature.slice(0, 86));
  for (const { h, shared } of headHits) {
    console.log(`      arc heading: "${h.text.slice(0, 66)}"`);
    console.log(`                   shares [${shared.join(', ')}]  ${h.file}`);
  }
  for (const h of memberHits) {
    console.log(`      in code:     ${h.m} x${h.code}  ${h.where.join(' ')}`);
  }
}

console.log(`\n${open.length} unstruck rows, ${rows.length - open.length} struck, ${suspects} suspect.`);
console.log('Read each suspect and decide: STRIKE it, NARROW it (say what landed AND what is');
console.log('still open), or leave it. A partial close recorded as a whole one is its own bug.');
if (!ALL) console.log('Run with --all to see the rows that matched nothing.');
