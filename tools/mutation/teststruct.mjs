// Counts the assertions in each test() block under test/ and how many sit inside a conditional or loop.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TEST = path.join(ROOT, 'test');
const out = [];

for (const f of fs.readdirSync(TEST, { recursive: true }).map(String).filter(x => x.endsWith('.test.js')).sort()) {
  const text = fs.readFileSync(path.join(TEST, f), 'utf8');
  const lines = text.split('\n');
  const re = /^(\s*)(?:await\s+)?test\(/gm;
  let m;
  const starts = [];
  while ((m = re.exec(text))) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = i + 1 < starts.length ? starts[i + 1] : text.length;
    const body = text.slice(s, e);
    const startLine = text.slice(0, s).split('\n').length;
    const nameM = body.match(/test\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
    const name = nameM ? nameM[2] : '?';
    const asserts = [...body.matchAll(/\bassert\s*[.(]/g)];
    let guarded = 0;
    for (const a of asserts) {
      const before = body.slice(0, a.index);
      const lineStart = before.lastIndexOf('\n') + 1;
      const linePrefix = body.slice(lineStart, a.index);
      if (/^\s*(if|for|while)\s*\(.*\)\s*$/.test(linePrefix.trimEnd()) ||
          /\b(if|for|while)\s*\([^)]*\)\s*(\{\s*)?$/.test(linePrefix)) guarded++;
      else {
        let depth = 0; const stack = [];
        for (let k = before.length - 1, d = 0; k >= 0; k--) {
          const ch = before[k];
          if (ch === '}') d++;
          else if (ch === '{') { if (d === 0) { stack.push(k); break; } d--; }
        }
        if (stack.length) {
          const bi = stack[0];
          const ls = before.lastIndexOf('\n', bi) + 1;
          const head = before.slice(ls, bi);
          if (/\b(if|for|while)\s*\(/.test(head)) guarded++;
        }
        void depth;
      }
    }
    out.push({ file: f, line: startLine, name, asserts: asserts.length, guarded });
  }
  void lines;
}
out.sort((a, b) => a.asserts - b.asserts);
console.log('total test() blocks:', out.length);
console.log('--- tests with <=2 assertion sites ---');
for (const r of out.filter(r => r.asserts <= 2)) console.log(`${r.asserts}a/${r.guarded}g  ${r.file}:${r.line}  ${r.name.slice(0, 90)}`);
console.log('--- tests where EVERY assertion site is inside if/for/while ---');
for (const r of out.filter(r => r.asserts > 0 && r.guarded === r.asserts)) console.log(`${r.asserts}a  ${r.file}:${r.line}  ${r.name.slice(0, 90)}`);
fs.writeFileSync(path.join(ROOT, '.mutaudit', 'teststruct.json'), JSON.stringify(out, null, 1));
