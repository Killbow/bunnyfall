// Prints which keydown listeners Chromium reaches when a synthesized event goes to the window or the document.
// Usage: node tools/padDispatchProbe.mjs.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas></canvas>');
const seen = await page.evaluate(() => {
  const out = [];
  document.addEventListener('keydown', (e) => out.push(`document-capture:${e.code}`), { capture: true });
  window.addEventListener('keydown', (e) => out.push(`window:${e.code}`));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'JoystickButton4', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'JoystickButton5', bubbles: true }));
  return out;
});
await browser.close();
console.log(JSON.stringify(seen));
const ok = !seen.includes('document-capture:JoystickButton4') && seen.includes('document-capture:JoystickButton5') && seen.includes('window:JoystickButton5');
console.log(ok ? 'PASS: a window-targeted key never reaches a document listener; a document-targeted one reaches both' : 'FAIL');
process.exit(ok ? 0 : 1);
