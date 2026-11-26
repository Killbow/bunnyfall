// Renders the account card at every stage in Chromium and checks computed styles, loaded font faces, and layout.
// Run with `node tools/accountCardProbe.mjs`; PROBE_SHOTS=<dir> also writes screenshots.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const shots = process.env.PROBE_SHOTS ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const ROOTS = { '/src/': new URL('../src/', import.meta.url), '/vendor/': new URL('../vendor/', import.meta.url) };
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const served = (path) => {
  const root = Object.keys(ROOTS).find((r) => path.startsWith(r));
  if (!root || path.includes('..')) return null;
  const type = TYPES[path.slice(path.lastIndexOf('.'))];
  if (!type) return null;
  try { return { contentType: type, body: readFileSync(new URL(path.slice(root.length), ROOTS[root])) }; } catch { return null; }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Only src/ and vendor/ are served and every other request is aborted, so the page never reaches a live service.
await page.route('**/*', async (route) => {
  const path = new URL(route.request().url()).pathname;
  const file = served(path);
  if (file) return route.fulfill({ status: 200, ...file });
  if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="app"></div></body></html>' });
  return route.abort();
});

await page.goto('http://probe.invalid/', { waitUntil: 'domcontentloaded' });

const { ENHANCED_CSS, ENHANCED_FONTS_URL } = await import('../src/ui/enhancedStyle.js');
// The font faces are fetched here and inlined; the font host returns woff2 only to a browser User-Agent.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
let fontCss = await (await fetch(ENHANCED_FONTS_URL, { headers: { 'user-agent': UA } })).text();
const urls = [...new Set([...fontCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
for (const u of urls) {
  const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
  fontCss = fontCss.split(u).join(`data:font/woff2;base64,${buf.toString('base64')}`);
}
await page.addStyleTag({ content: fontCss });
await page.addStyleTag({ content: ENHANCED_CSS });
await page.evaluate(() => document.fonts.ready);

const STAGES = [
  { stage: 'out', label: 'signed out' },
  { stage: 'register', label: 'creating an account' },
  { stage: 'login', label: 'signing in' },
  { stage: 'recover', label: 'spending the recovery code' },
  { stage: 'code', label: 'the recovery codes', codes: ['7GEPQ-47BS9-AYK70-QMWYW', 'TJY8S-KEWD8-R12W3-TZTAX', 'A2B3C-D4E5F-G6H7J-K8M9N', 'P0Q1R-S2T3V-W4X5Y-Z6A7B', 'C8D9E-F0G1H-J2K3M-N4P5Q', 'R6S7T-V8W9X-Y0Z1A-B2C3D', 'E4F5G-H6J7K-M8N9P-Q0R1S', 'T2V3W-X4Y5Z-A6B7C-D8E9F'] },
  { stage: 'in', label: 'signed in', account: { name: 'Nystul', handle: 'Nystul', kind: 'linked', nameAs: 'account', recoveryLeft: 8 } },
  { stage: 'in', label: 'a guest', account: { name: 'Mithriil Stormaire', guestName: 'Mithriil Stormaire', handle: null, kind: 'guest', nameAs: 'character' } },
  { stage: 'password', label: 'changing the password' },
  { stage: 'codes', label: 'new recovery codes' },
];

const measured = await page.evaluate(async (stages) => {
  const { AccountFlow } = await import('/src/ui/accountFlow.js');
  const { accountCard } = await import('/src/ui/enhancedAccount.js');
  const app = document.getElementById('app');
  app.style.cssText = 'padding:24px;max-width:640px;margin:0 auto;';
  const out = [];
  for (const s of stages) {
    const flow = AccountFlow({ io: { fetch: () => { throw new Error('the probe makes no requests'); } }, storage: null });
    flow.stage = s.stage;
    if (s.codes) flow.recoveryCodes = s.codes;
    if (s.account) flow.account = s.account;
    const card = accountCard(document, flow);
    app.append(card.root);
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const label = card.root.querySelector('label.field .fieldlabel');
    const code = card.root.querySelector('.acctcode code');
    const primary = card.root.querySelector('.act.primary');
    out.push({
      stage: s.stage,
      label: s.label,
      width: card.root.getBoundingClientRect().width,
      height: card.root.getBoundingClientRect().height,
      bg: cs(card.root).backgroundColor,
      border: cs(card.root).borderTopColor,
      labelColor: label ? cs(label).color : null,
      inputs: card.root.querySelectorAll('input').length,
      inputBg: cs(card.root.querySelector('input'))?.backgroundColor ?? null,
      codeColor: code ? cs(code).color : null,
      codeSize: code ? cs(code).fontSize : null,
      primaryColor: primary ? cs(primary).borderTopColor : null,
      headFamily: cs(card.root.querySelector('h3')).fontFamily,
      bodyFamily: cs(card.root.querySelector('p.meta') ?? card.root).fontFamily,
      grouping: [...card.root.querySelectorAll('.fieldhint')].map((h) => {
        const box = h.previousElementSibling;
        const nextLabel = h.parentElement.nextElementSibling?.querySelector?.('.fieldlabel');
        if (!box || !nextLabel) return null;
        return {
          toOwn: Math.round(h.getBoundingClientRect().top - box.getBoundingClientRect().bottom),
          toNext: Math.round(nextLabel.getBoundingClientRect().top - h.getBoundingClientRect().bottom),
        };
      }).filter(Boolean),
      agree: [...card.root.querySelectorAll('label.acctagree')].map((row) => {
        const box = row.querySelector('input'), link = row.querySelector('a');
        return {
          type: box?.type, checked: box?.checked, height: row.getBoundingClientRect().height,
          accent: box ? cs(box).accentColor : null, linkColor: link ? cs(link).color : null,
          href: link?.href ?? null, target: link?.target ?? null, rel: link?.rel ?? null,
        };
      }),
      nameAs: (() => {
        const box = card.root.querySelector('.acctnameas');
        if (!box) return null;
        const btns = [...box.querySelectorAll('button')];
        const note = box.querySelector('p.meta');
        const row = box.querySelector('.acctwearrow');
        return {
          buttons: btns.map((b) => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed'), color: cs(b).color, border: cs(b).borderTopColor,
            borderW: cs(b).borderTopWidth, opacity: cs(b).opacity, h: b.getBoundingClientRect().height })),
          note: note?.textContent ?? null, noteColor: note ? cs(note).color : null,
          noteGap: note && row ? Math.round(note.getBoundingClientRect().top - row.getBoundingClientRect().bottom) : null,
        };
      })(),
      overflow: [...card.root.querySelectorAll('*')].some(
        (n) => n.getBoundingClientRect().right > card.root.getBoundingClientRect().right + 1,
      ),
    });
  }
  return out;
}, STAGES);

const { ENHANCED_TOKENS } = await import('../src/ui/enhancedStyle.js');
const token = (name) => ENHANCED_TOKENS.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
const rgb = (hex) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const DIM = rgb(token('dim'));
const BONE = rgb(token('bone'));
const BRASS = rgb(token('brass'));

check('the card renders at every stage with real size', measured.every((m) => m.width > 200 && m.height > 80),
  measured.map((m) => `${m.label}:${Math.round(m.width)}x${Math.round(m.height)}`).join(' '));
check('no page errors while building any stage', errors.length === 0, errors.join(' | '));
check('nothing overflows the card it is drawn in', measured.every((m) => !m.overflow));
check('every form stage drew its boxes', measured.filter((m) => ['register', 'login', 'recover', 'password'].includes(m.stage)).every((m) => m.inputs >= 2));

// A label in BONE means its color token was invalid and the label inherited the body color.
const labelled = measured.filter((m) => m.labelColor);
check('ACC1e F1: a field label is DIM, not the body colour', labelled.length > 0 && labelled.every((m) => m.labelColor === DIM),
  `want ${DIM}, got ${[...new Set(labelled.map((m) => m.labelColor))].join('/')}${labelled.some((m) => m.labelColor === BONE) ? ' (BONE = the --ash bug is back)' : ''}`);

const codeRow = measured.find((m) => m.codeColor);
check('the recovery code is brass and large', codeRow?.codeColor === BRASS && parseFloat(codeRow.codeSize) >= 16,
  `${codeRow?.codeColor} at ${codeRow?.codeSize}`);
check('the leading button wears brass', measured.filter((m) => m.primaryColor).every((m) => m.primaryColor === BRASS));

const reg = measured.find((m) => m.stage === 'register');
check('TERMS1: creating an account draws two boxes, both UNTICKED', reg?.agree.length === 2 && reg.agree.every((a) => a.type === 'checkbox' && a.checked === false),
  JSON.stringify(reg?.agree.map((a) => a.checked)));
check('TERMS1: each box\'s row stands at a thumb\'s 44px', reg?.agree.every((a) => a.height >= 44), reg?.agree.map((a) => Math.round(a.height)).join('/'));
check('TERMS1: the box and its document wear the skin\'s brass', reg?.agree.every((a) => a.accent === BRASS && a.linkColor === BRASS),
  reg?.agree.map((a) => `${a.accent} ${a.linkColor}`).join(' / '));
check('TERMS1: each document opens outside the game, at the site', reg?.agree.every((a) => a.target === '_blank' && a.rel === 'noopener' && /^https:\/\/daggerfalljs\.dev\/(terms|privacy)\/$/.test(a.href)),
  reg?.agree.map((a) => a.href).join(' '));
check('TERMS1: no other stage draws a box', measured.filter((m) => m.stage !== 'register').every((m) => m.agree.length === 0));

const toggles = measured.filter((m) => m.nameAs);
check('NAME-AS: every signed-in card draws the name-in-game toggle, two buttons', toggles.length === 2 && toggles.every((m) => m.nameAs.buttons.length === 2 && m.nameAs.buttons[0].text === 'Account name' && m.nameAs.buttons[1].text === 'Character name'),
  JSON.stringify(toggles.map((m) => m.nameAs.buttons.map((b) => b.text))));
check('NAME-AS: the buttons wear the card\'s bone, edge and words', toggles.every((m) => m.nameAs.buttons.every((b) => b.color === BONE && b.border === BONE)),
  [...new Set(toggles.flatMap((m) => m.nameAs.buttons.map((b) => `${b.color}/${b.border}`)))].join(' '));
check('NAME-AS: the chosen one pressed at full strength behind a doubled edge, the other dimmed', toggles.every((m) => m.nameAs.buttons.every((b) => (b.pressed === 'true') === (b.opacity === '1' && b.borderW === '2px'))) && toggles.every((m) => m.nameAs.buttons.filter((b) => b.pressed === 'true').length === 1),
  toggles.map((m) => m.nameAs.buttons.map((b) => `${b.pressed}:${b.opacity}:${b.borderW}`).join(',')).join(' | '));
check('NAME-AS: the line under them is DIM, names what others see, and sits close under its buttons', toggles.every((m) => m.nameAs.noteColor === DIM && /^Others see /.test(m.nameAs.note) && m.nameAs.noteGap >= 0 && m.nameAs.noteGap <= 8),
  toggles.map((m) => `${m.nameAs.noteColor} ${m.nameAs.noteGap}px "${m.nameAs.note}"`).join(' | '));
check('NAME-AS: a thumb can press each', toggles.every((m) => m.nameAs.buttons.every((b) => b.h >= 28)), toggles.map((m) => m.nameAs.buttons.map((b) => Math.round(b.h)).join('/')).join(' '));

const faces = await page.evaluate(() => ({
  display: document.fonts.check('400 22px Cormorant'),
  data: document.fonts.check('400 15px "Barlow Semi Condensed"'),
  loaded: [...document.fonts].map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i),
}));
check('the enhanced faces actually LOADED, not just declared', faces.display && faces.data,
  `Cormorant ${faces.display}, Barlow Semi Condensed ${faces.data} (loaded: ${faces.loaded.join(', ') || 'none'})`);
check('a heading is set in the skin\'s DISPLAY face', measured.every((m) => /Cormorant/.test(m.headFamily)),
  measured[0]?.headFamily);
check('body copy is set in the skin\'s DATA face', measured.every((m) => /Barlow/.test(m.bodyFamily)),
  measured[0]?.bodyFamily);

const groups = measured.flatMap((m) => m.grouping);
check('a field hint is nearer its own box than the next field\'s label',
  groups.length > 0 && groups.every((g) => g.toNext > g.toOwn + 4),
  groups.length ? `own ${groups[0].toOwn}px vs next ${groups[0].toNext}px` : 'no hints measured');

await page.evaluate(() => { document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#0e1013'; });
await page.screenshot({ path: `${shots}/acc1e-card.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 1400 });
const phoneOverflow = await page.evaluate(() => [...document.querySelectorAll('.card.acct')].some(
  (c) => [...c.querySelectorAll('*')].some((n) => n.getBoundingClientRect().right > c.getBoundingClientRect().right + 1),
));
check('nothing overflows at phone width either', !phoneOverflow);
await page.screenshot({ path: `${shots}/acc1e-card-phone.png`, fullPage: true });

const wrapped = () => page.evaluate(() => [...document.querySelectorAll('.acctcode li code')].filter((c) => c.getClientRects().length > 1).length);
const bands = [];
for (const width of [320, 390, 421, 430, 480, 600, 1280]) {
  await page.setViewportSize({ width, height: 1400 });
  bands.push(`${width}:${await wrapped()}`);
  await page.addStyleTag({ content: '.acctcode li code { font-family: nobody-has-this !important; }' });
  bands.push(`${width}f:${await wrapped()}`);
  await page.evaluate(() => { for (const t of document.querySelectorAll('style')) if (t.textContent.includes('nobody-has-this')) t.remove(); });
}
check('AUDIT RECOVERY-SET B2: no code of the set breaks across lines, at any width, in either face', bands.every((b) => b.endsWith(':0')), bands.join(' '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks`);
console.log(`sheets: ${shots}/acc1e-card.png, ${shots}/acc1e-card-phone.png`);
process.exit(failed.length ? 1 : 0);
