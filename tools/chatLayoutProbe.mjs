// Measures chat row heights as lines pile up and checks that rows never shrink and the list scrolls.
// Run: node tools/chatLayoutProbe.mjs.

import { chromium } from 'playwright';
import { CHAT_CSS } from '../src/ui/chatPanel.js';

const MEASURE = (count) => {
  document.body.innerHTML = '';
  const el = (t, c, x) => { const e = document.createElement(t); e.className = c; if (x != null) e.textContent = x; return e; };
  const root = el('div', 'dfchat');
  root.dataset.state = 'open';
  const box = el('div', 'dfchat-box');
  const list = el('div', 'dfchat-list');
  for (let i = 0; i < count; i++) {
    const line = el('div', 'dfchat-line');
    line.append(el('span', 'dfchat-time', '12:34'), el('span', 'dfchat-name', 'Mac'),
      el('span', 'dfchat-tag', '#ab12'), el('span', 'dfchat-text', `message number ${i}`));
    list.append(line);
  }
  box.append(list);
  root.append(box);
  document.body.append(root);
  const rows = [...list.children].map((c) => c.getBoundingClientRect().height);
  return { min: Math.min(...rows), max: Math.max(...rows), listH: list.clientHeight, scrollH: list.scrollHeight };
};

const MEASURE_PEEK = (count) => {
  document.body.innerHTML = '';
  const el = (t, c, x) => { const e = document.createElement(t); e.className = c; if (x != null) e.textContent = x; return e; };
  const root = el('div', 'dfchat');
  root.dataset.state = 'closed';
  const peek = el('div', 'dfchat-peek');
  for (let i = 0; i < count; i++) {
    const line = el('div', 'dfchat-line');
    line.append(el('span', 'dfchat-name', 'Mac'), el('span', 'dfchat-text', `message number ${i}`));
    peek.append(line);
  }
  root.append(peek);
  document.body.append(root);
  return { min: Math.min(...[...peek.children].map((c) => c.getBoundingClientRect().height)) };
};

const COUNTS = [5, 10, 20, 40, 80, 200];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent('<!doctype html><html><head></head><body></body></html>');
await page.addStyleTag({ content: CHAT_CSS });

const fails = [];
let baseline = null;
for (const n of COUNTS) {
  const m = await page.evaluate(MEASURE, n);
  baseline ??= m.min;
  const scrolls = m.scrollH > m.listH + 1;
  const overflows = n * baseline > m.listH;
  console.log(`  ${String(n).padStart(3)} rows: ${m.min.toFixed(2)}-${m.max.toFixed(2)}px  list ${m.listH}px  scroll ${m.scrollH}px`);
  if (Math.abs(m.min - baseline) > 0.5) fails.push(`${n} rows: a row is ${m.min.toFixed(2)}px where 5 rows made it ${baseline.toFixed(2)}px - the rows are being squeezed`);
  if (overflows && !scrolls) fails.push(`${n} rows: ${n} x ${baseline.toFixed(2)}px does not fit ${m.listH}px and scrollHeight is still ${m.scrollH} - nothing to scroll`);
}
const peek = await page.evaluate(MEASURE_PEEK, 5);
console.log(`  peek: ${peek.min.toFixed(2)}px`);
if (Math.abs(peek.min - baseline) > 0.5) fails.push(`the closed peek's row is ${peek.min.toFixed(2)}px, not ${baseline.toFixed(2)}px`);
await browser.close();

if (fails.length) {
  console.error('\nFAILED:');
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nPASS: a chat row is ${baseline.toFixed(2)}px at every count up to ${COUNTS[COUNTS.length - 1]}, and the list scrolls once they do not fit.`);
