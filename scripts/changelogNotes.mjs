// BUNNYFALL (2026-11-06, the owner: "i want players to have our github changelog inside the game like it was a while
// ago", answered: a player-facing CHANGELOG.md, shown in the desktop app's changelog): A RELEASE'S NOTES, OFF
// CHANGELOG.md. Prints, as markdown, the lines CHANGELOG.md gained since `<ref>` (the previous release's tag), under the
// headings they stand under; "Fixes and improvements." when it gained none - the launcher's news leaves such a release
// out (app/lib/launcherState.cjs isPlaceholder), so the panel shows only the releases that brought something to read.
//   node scripts/changelogNotes.mjs <previous-tag>     (no tag: the whole of the newest day)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const now = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\n');
const ref = process.argv[2] ?? '';
let before = null;
if (ref) {
  try { before = execFileSync('git', ['show', `${ref}:CHANGELOG.md`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n').split('\n'); }
  catch { before = []; }   // the release before had no changelog: all of it is new
}
const isHead = (l) => /^#{2,3} /.test(l);
const out = [];
if (before) {
  const had = new Map();
  for (const l of before) had.set(l, (had.get(l) ?? 0) + 1);
  let heads = [], printed = new Set();
  for (const l of now) {
    if (/^# /.test(l)) continue;   // the file's own title
    if (isHead(l)) { heads = l.startsWith('### ') ? [heads.find((h) => h.startsWith('## ')) ?? null, l].filter(Boolean) : [l]; continue; }
    if (!/^\s*[-*] /.test(l)) continue;   // a change is a list line; the file's own words are not news
    const n = had.get(l) ?? 0;
    if (n > 0) { had.set(l, n - 1); continue; }
    for (const h of heads) if (!printed.has(h)) { out.push('', h); printed.add(h); }
    out.push(l);
  }
} else {
  // no previous release: the newest day's section
  let i = now.findIndex((l) => l.startsWith('## '));
  if (i >= 0) { out.push(now[i]); for (i++; i < now.length && !now[i].startsWith('## '); i++) out.push(now[i]); }
}
const text = out.join('\n').trim();
process.stdout.write(`${text || 'Fixes and improvements.'}\n`);
