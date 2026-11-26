// Browser probe that measures the enhanced pixel font in the online panels and the HUD text.
// Run: node tools/font1Probe.mjs; it needs network for the game's font request and exits 1 offline.
import { chromium } from 'playwright';
import { CHAT_CSS } from '../src/ui/chatPanel.js';
import { SOCIAL_CSS } from '../src/ui/socialPanel.js';
import { PARTY_CSS } from '../src/ui/partyPanel.js';
import { SOCIAL_MENU_CSS } from '../src/ui/socialMenu.js';
import { ENHANCED_CSS, ENHANCED_FONTS_URL } from '../src/ui/enhancedStyle.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function inlineFonts() {
  const css = await (await fetch(ENHANCED_FONTS_URL, { headers: { 'user-agent': UA } })).text();
  const out = [];
  for (const block of css.split('@font-face').slice(1)) {
    if (!/U\+0000-00FF/.test(block)) continue;
    const fam = /font-family: '([^']+)'/.exec(block)?.[1];
    const weight = /font-weight: ([\d ]+)/.exec(block)?.[1] ?? '400';
    const url = /url\((https[^)]+)\)/.exec(block)?.[1];
    if (!fam || !url) continue;
    const bytes = Buffer.from(await (await fetch(url, { headers: { 'user-agent': UA } })).arrayBuffer());
    out.push(`@font-face { font-family: '${fam}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2'); }`);
  }
  return out.join('\n');
}

const MEASURE_RATIO = () => {
  const samples = [
    [10, 'already in a party'], [11, 'last seen 5 days ago'], [12, 'ONLINE PLAYERS'],
    [13, 'Mac the Wanderer'], [14, 'Your Long Blade skill has improved.'], [15, 'Invite to party'],
  ];
  const w = (fam, size, text) => {
    const s = document.createElement('span');
    s.style.cssText = `position:absolute;white-space:pre;font-family:${fam};font-size:${size}px`;
    s.textContent = text;
    document.body.append(s);
    const r = s.getBoundingClientRect().width;
    s.remove();
    return r;
  };
  return samples.map(([size, text]) => {
    const barlow = w("'Barlow Semi Condensed'", size, text);
    const pixel = w("'Pixelify Sans'", size, text);
    return { size, text, barlow: +barlow.toFixed(1), pixel: +pixel.toFixed(1), ratio: +(pixel / barlow).toFixed(3) };
  });
};

const MEASURE_SURFACES = (touch) => {
  document.body.innerHTML = '';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  // NAME_MAX in net/wire.js is the longest name these rows receive, so it decides whether a column clips.
  const NAME = 'Maximilian Wanderer XIV';
  const chat = el('div', `dfchat${touch ? ' touch' : ''}`);
  chat.dataset.state = 'open';
  const peek = el('div', 'dfchat-peek');
  for (let i = 0; i < 3; i++) {
    const line = el('div', 'dfchat-line');
    line.append(el('span', 'dfchat-time', '12:34'), el('span', 'dfchat-name', NAME),
      el('span', 'dfchat-tag', '#ab12'), el('span', 'dfchat-text', 'the road to Daggerfall is 5 days from here'));
    peek.append(line);
  }
  const box = el('div', 'dfchat-box');
  const tabs = el('div', 'dfchat-tabs');
  tabs.append(el('button', 'dfchat-tab active', 'World'), el('button', 'dfchat-social dfchat-social-tab', '☻'));
  const cols = el('div', 'dfchat-cols');
  const main = el('div', 'dfchat-main');
  const list = el('div', 'dfchat-list');
  list.append(...peek.cloneNode(true).children);
  const form = el('div', 'dfchat-form');
  form.append(el('input', 'dfchat-input'), el('button', 'dfchat-send', 'Send'));
  main.append(list, form);
  const who = el('div', 'dfchat-who');
  const wholist = el('div', 'dfchat-wholist');
  const row = el('div', 'dfchat-who-row act');
  row.append(el('span', 'dfchat-who-name', NAME), el('span', 'dfchat-who-tag', '#ab12'));
  const menu = el('div', 'dfchat-rowmenu');
  const rowbtn = el('button', 'dfchat-rowbtn');
  rowbtn.append(el('span', null, 'Invite to party'), el('span', 'dfchat-rowwhy', 'already in a party'));
  menu.append(rowbtn);
  row.append(menu);
  wholist.append(row);
  who.append(el('div', 'dfchat-whohead', 'Online'), wholist);
  cols.append(main, who);
  box.append(tabs, cols);
  chat.append(peek, box);
  document.body.append(chat);

  const social = el('div', `dfsocial${touch ? ' touch' : ''}`);
  social.dataset.open = '1';
  const head = el('div', 'dfsocial-head');
  head.append(el('div', 'dfsocial-title', 'Friends & party'), el('button', 'dfsocial-close', 'Close'));
  const body = el('div', 'dfsocial-body');
  const srow = el('div', 'dfsocial-row');
  const swho = el('div', 'dfsocial-who');
  swho.append(el('div', 'dfsocial-name', NAME), el('div', 'dfsocial-sub', 'last seen 5 days ago'));
  const sbtn = el('button', 'dfsocial-btn', 'Invite');
  srow.append(el('i', 'dfsocial-dot on'), swho, el('span', 'dfsocial-left', '1:58 left'), sbtn);
  body.append(el('div', 'dfsocial-sec', 'Friends'), srow);
  const stabs = el('div', 'dfsocial-tabs');
  stabs.append(el('button', 'dfsocial-tab active', 'Friends'), el('button', 'dfsocial-tab', 'Party'));
  social.append(head, stabs, body);
  document.body.append(social);

  const party = el('div', `dfparty${touch ? ' touch' : ''}`);
  const card = el('div', 'dfparty-card');
  const pbody = el('div', 'dfparty-body');
  const phead = el('div', 'dfparty-head');
  phead.append(el('span', 'dfparty-name', NAME), el('span', 'dfparty-lead', '★'));
  const vital = el('div', 'dfparty-vital health');
  vital.append(el('div', 'dfparty-track'), el('span', 'dfparty-num', '100 / 100'));
  pbody.append(phead, el('div', 'dfparty-where', 'Daggerfall, Privateer\'s Hold'), vital);
  card.append(el('div', 'dfparty-face'), pbody);
  party.append(el('div', 'dfparty-title', 'Party'), card);
  document.body.append(party);

  const peer = el('div', 'dfpeer');
  peer.dataset.state = 'open';
  const pcard = el('div', 'dfpeer-card');
  const pbtn = el('button', 'dfpeer-btn');
  pbtn.append(el('span', null, 'Invite to party'), el('span', 'dfpeer-why', 'already in a party'));
  pcard.append(el('div', 'dfpeer-name', NAME), pbtn, el('button', 'dfpeer-btn cancel', 'Close'));
  peer.append(pcard);
  document.body.append(peer);

  // A box with text-overflow: ellipsis clips by design, so it is measured below rather than counted as a spill.
  const spills = [];
  for (const n of document.querySelectorAll('div, span, button')) {
    if (!n.className || typeof n.className !== 'string') continue;
    if (getComputedStyle(n).textOverflow === 'ellipsis') continue;
    if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) {
      spills.push({ cls: n.className, content: n.scrollWidth, box: n.clientWidth });
    }
  }
  const targets = ['dfchat-social', 'dfchat-rowbtn', 'dfsocial-tab', 'dfsocial-close', 'dfsocial-btn', 'dfpeer-btn']
    .map((cls) => {
      const n = document.querySelector('.' + cls.replace(/ /g, '.'));
      return n ? { cls, h: +n.getBoundingClientRect().height.toFixed(1) } : { cls, h: null };
    });
  const nameNode = document.querySelector('.dfparty-name');
  let fits = 0;
  for (let n = 1; n <= NAME.length; n++) {
    nameNode.textContent = NAME.slice(0, n);
    if (nameNode.scrollWidth <= nameNode.clientWidth + 1) fits = n;
  }
  nameNode.textContent = NAME;
  const clipped = {
    nameBox: +nameNode.clientWidth.toFixed(1),
    longest: +nameNode.scrollWidth.toFixed(1),
    fits,
    vitals: (() => { const n = document.querySelector('.dfparty-num'); n.textContent = '1000 / 1000'; return { box: +n.clientWidth.toFixed(1), content: +n.scrollWidth.toFixed(1) }; })(),
  };
  return { spills, targets, clipped };
};

const MEASURE_HUDTEXT = () => {
  document.body.innerHTML = '';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const hud = el('div', 'hud');
  const top = el('div', 'hud-top');
  const compass = el('div', 'hud-compass');
  compass.append(el('div', 'hud-strip'), el('i', 'hud-needle'));
  const foe = el('div', 'hud-foe on');
  foe.append(el('div', 'hud-foename', 'Grizzly Bear'), el('div', 'hud-track hud-foetrack'));
  top.append(compass, foe);
  hud.append(top);
  document.body.append(hud);
  const stack = el('div', 'notice-stack');
  const toast = (t) => { const n = el('div', 'notice notice-toast notice-in'); const b = el('div', 'notice-body'); b.append(el('div', 'notice-row', t)); n.append(b); return n; };
  const rows = ['Your Long Blade skill has improved.', 'You found 25 gold pieces.'];
  const first = toast(rows[0]);
  const second = toast('The wind carries the smell of the sea.');
  const box = el('div', 'notice notice-in');
  const boxBody = el('div', 'notice-body'); boxBody.append(el('div', 'notice-row', 'The door is locked.')); box.append(boxBody, el('div', 'notice-hint', 'click or press a key'));
  stack.append(first, second, box);
  document.body.append(stack);
  const firstBox = first.getBoundingClientRect();
  const secondBox = second.getBoundingClientRect();
  const stackBox = stack.getBoundingClientRect();
  const longRow = first.querySelector('.notice-row');
  const LONG = 'You have been given a letter of introduction to the Knights of the Dragon, and are expected at their hall in Daggerfall before the 15th of Hearthfire.';
  const shortH = +longRow.getBoundingClientRect().height.toFixed(1);
  longRow.textContent = LONG;
  const longBox = { content: +longRow.scrollWidth.toFixed(1), box: +longRow.clientWidth.toFixed(1), h: +longRow.getBoundingClientRect().height.toFixed(1), shortH };
  longRow.textContent = rows[0];
  const bottom = el('div', 'hud-bottom');
  const bars = el('div', 'hud-bars');
  for (const kind of ['magicka', 'health', 'fatigue']) {
    const v = el('div', `hud-vital hud-${kind}`);
    v.append(el('div', 'hud-track'));
    bars.append(v);
  }
  bottom.append(bars);
  hud.append(bottom);
  const mid = el('div', 'hudmid', 'Interaction is now in talk mode.');
  document.body.append(mid);
  const fallbackBox = mid.getBoundingClientRect();
  const s = Math.max(1, Math.floor(Math.min(window.innerWidth / 320, window.innerHeight / 200)));
  const oy = Math.floor((window.innerHeight - 200 * s) / 2);
  mid.style.setProperty('--hudmid-top', `${oy + 146 * s}px`);
  const midBox = mid.getBoundingClientRect();
  return {
    midFallbackTop: +fallbackBox.top.toFixed(1),
    midTop: +midBox.top.toFixed(1),
    midBottom: +midBox.bottom.toFixed(1),
    barsTop: +bottom.getBoundingClientRect().top.toFixed(1),
    reticleBottom: +(window.innerHeight / 2 + 9).toFixed(1),
    topBlockBottom: +top.getBoundingClientRect().bottom.toFixed(1),
    stackRight: +stackBox.right.toFixed(1),
    stackTop: +stackBox.top.toFixed(1),
    stackBottom: +stackBox.bottom.toFixed(1),
    firstBottom: +firstBox.bottom.toFixed(1),
    secondTop: +secondBox.top.toFixed(1),
    toastHint: !!first.querySelector('.notice-hint'),
    longRow: longBox,
    viewportW: window.innerWidth,
  };
};

const faces = await inlineFonts().catch((e) => { console.error(`the fonts did not load: ${e.message}`); return null; });
if (!faces || !/Pixelify Sans/.test(faces)) {
  console.error('FAILED: no Pixelify Sans to measure - this probe needs the network (ENHANCED_FONTS_URL).');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.setContent('<!doctype html><html><head></head><body style="margin:0"></body></html>');
await page.addStyleTag({ content: faces });
await page.addStyleTag({ content: ENHANCED_CSS });
for (const css of [CHAT_CSS, SOCIAL_CSS, PARTY_CSS, SOCIAL_MENU_CSS]) await page.addStyleTag({ content: css });
await page.evaluate(async () => {
  for (const f of ['400 14px "Pixelify Sans"', '600 14px "Pixelify Sans"', '400 14px "Barlow Semi Condensed"'])
    await document.fonts.load(f);
  await document.fonts.ready;
});

const fails = [];
console.log('1. THE RATIO - the pixel face against the launcher face, at one size');
const ratios = await page.evaluate(MEASURE_RATIO);
for (const r of ratios) console.log(`   ${String(r.size).padStart(2)}px  ${String(r.pixel).padStart(6)} vs ${String(r.barlow).padStart(6)}  x${r.ratio}   ${r.text}`);
const mean = ratios.reduce((a, r) => a + r.ratio, 0) / ratios.length;
console.log(`   mean x${mean.toFixed(3)}`);
if (!(mean > 1.05)) fails.push(`the two faces measure the same (x${mean.toFixed(3)}) - the page is drawing a fallback, not Pixelify`);

for (const touch of [false, true]) {
  console.log(`\n2. THE FOUR SURFACES (${touch ? 'touch' : 'desktop'} skin) - nothing wider than its box`);
  const { spills, targets, clipped } = await page.evaluate(MEASURE_SURFACES, touch);
  for (const s of spills) console.log(`   SPILL ${s.cls}: ${s.content}px of text in a ${s.box}px box`);
  if (!spills.length) console.log('   (none)');
  for (const s of spills) fails.push(`${s.cls} spills: ${s.content}px of text in a ${s.box}px box`);
  console.log(`   the party card's name box is ${clipped.nameBox}px: ${clipped.fits} of a name's characters fit whole,`
    + ` and the longest name the hub allows (NAME_MAX 24) measures ${clipped.longest}px`);
  console.log(`   its vitals column holds "1000 / 1000" in ${clipped.vitals.content}px of a ${clipped.vitals.box}px box`);
  if (clipped.fits < 16) fails.push(`only ${clipped.fits} characters of a party member's name fit the card - the face is too big for it`);
  if (clipped.vitals.content > clipped.vitals.box + 1) fails.push(`the party vitals column cuts "1000 / 1000" (${clipped.vitals.content}px in ${clipped.vitals.box}px)`);
  if (touch) {
    console.log('3. THE FINGER (AUDIT SOC C8): every target at least 44px tall');
    for (const t of targets) {
      console.log(`   ${t.cls}: ${t.h}px`);
      if (t.h === null) fails.push(`${t.cls} was not built - the probe and the sheet disagree`);
      else if (t.h < 44) fails.push(`${t.cls} is ${t.h}px, under the 44px AUDIT SOC C8 pinned`);
    }
  }
}

console.log('\n4. THE HUD\'S TEXT SURFACES - the mid-screen label on its line, PopupText\'s rows as toasts at the right edge (ENH-NOTICE3)');
const h = await page.evaluate(MEASURE_HUDTEXT);
console.log(`   the mid-screen label (DFU's y=146 of 200) stands ${h.midTop}-${h.midBottom}px, under the reticle's ${h.reticleBottom}px and over the bars at ${h.barsTop}px`);
console.log(`   ...where the sheet's 73% fallback alone would have put it at ${h.midFallbackTop}px (AUDIT FONT F11: the two agree at 16:10 and nowhere else)`);
if (h.midTop < h.reticleBottom) fails.push(`the mid-screen label starts at ${h.midTop}px, on top of the reticle (${h.reticleBottom}px)`);
if (h.midBottom > h.barsTop) fails.push(`the mid-screen label ends at ${h.midBottom}px, inside the bars at ${h.barsTop}px`);
console.log(`   the notice stack ends at the right edge (${h.stackRight}px of ${h.viewportW}) and stands ${h.stackTop}-${h.stackBottom}px, under the HUD's top block (${h.topBlockBottom}px)`);
if (Math.abs(h.stackRight - h.viewportW) > 0.5) fails.push(`the notice stack's right edge is ${h.stackRight}px, not the viewport's ${h.viewportW}px`);
if (h.stackTop < h.topBlockBottom) fails.push(`the notice stack starts at ${h.stackTop}px, inside the HUD's top block, which ends at ${h.topBlockBottom}px`);
console.log(`   the second model's toast starts at ${h.secondTop}px, under the first's ${h.firstBottom}px (AUDIT FONT F1's claim: two models stack, never overwrite); a toast carries a hint: ${h.toastHint}`);
if (h.secondTop < h.firstBottom - 0.5) fails.push(`the second model's toast starts at ${h.secondTop}px, over the first, which ends at ${h.firstBottom}px`);
if (h.toastHint) fails.push('a toast carries the "click or press a key" hint - nothing dismisses a toast');
console.log(`   a ${h.longRow.content}px line wraps into a ${h.longRow.box}px box ${h.longRow.h}px tall (one line is ${h.longRow.shortH}px; AUDIT FONT F8's claim)`);
if (h.longRow.content > h.longRow.box + 1) fails.push(`a TEXT.RSC-length line is ${h.longRow.content}px in a ${h.longRow.box}px box - it is being cut, not wrapped`);
if (h.longRow.h <= h.longRow.shortH + 0.5) fails.push('a long line did not wrap to a second row - the toast is still one line high');

await page.setViewportSize({ width: 1280, height: 520 });
const short = await page.evaluate(() => {
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const stack = el('div', 'notice-stack');
  const box = el('div', 'notice notice-in'); const bb = el('div', 'notice-body');
  for (const t of ['The door is locked.', 'You have no key.', 'A third line.']) bb.append(el('div', 'notice-row', t));
  box.append(bb, el('div', 'notice-hint', 'click or press a key')); stack.append(box);
  for (let i = 0; i < 8; i++) { const n = el('div', 'notice notice-toast notice-in'); const b = el('div', 'notice-body'); b.append(el('div', 'notice-row', `Your Long Blade skill has improved ${i}.`)); n.append(b); stack.append(n); }
  document.body.append(stack);
  const r = stack.getBoundingClientRect();
  const last = stack.lastElementChild.getBoundingClientRect();
  const out = { overflow: getComputedStyle(stack).overflow, stackBottom: +r.bottom.toFixed(1), lastBottom: +last.bottom.toFixed(1), innerHeight: window.innerHeight, toastRow: getComputedStyle(stack.lastElementChild.querySelector('.notice-row')).fontSize, boxRow: getComputedStyle(box.querySelector('.notice-row')).fontSize };
  stack.remove();
  return out;
});
console.log(`   1280x520: the stack ends at ${short.stackBottom}px of ${short.innerHeight} with overflow ${short.overflow}; its last toast's box ends at ${short.lastBottom}px; a toast row is ${short.toastRow}, a box row ${short.boxRow}`);
if (short.overflow !== 'hidden') fails.push('the notice stack does not clip: what will not fit spills off the screen');
if (short.stackBottom > short.innerHeight + 0.5) fails.push(`the notice stack itself runs past the viewport (${short.stackBottom} > ${short.innerHeight})`);
if (short.toastRow !== short.boxRow) fails.push(`on a short viewport a toast row is ${short.toastRow} while a box row is ${short.boxRow} - the media block does not reach the toast`);

await browser.close();
if (fails.length) {
  console.error('\nFAILED:');
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS: the enhanced face is what these surfaces are set in, nothing spills, the finger keeps its 44px,');
console.log('the label stands on its line and PopupText\'s rows stand as toasts at the right edge.');
