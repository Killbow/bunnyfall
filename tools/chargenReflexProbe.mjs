// Checks that the character wizard's primary button is uncovered and pressable at common window sizes.
// Run: node tools/chargenReflexProbe.mjs.

import { chromium } from 'playwright';
import { ENHANCED_CSS, ENHANCED_TOKENS } from '../src/ui/enhancedStyle.js';
const BUG = process.env.SHOW_BUG === '1';
const FIX = BUG ? `
/* the shipped-before state, for re-proving the bug */
.wizard .stagebody { grid-template-rows: auto; }
.choose { place-content: center; overflow-y: visible; }
` : false ? `
.wizard .stagebody { grid-template-rows: minmax(0, 1fr); }
.choose { place-content: safe center; overflow-y: auto; box-sizing: border-box; }
` : '';
const rail = ['Homeland','Sex','Class','History','Name','Face','Attributes','Skills','Reflexes','Review']
  .map((l,i)=>`<button class="railbtn ${i<8?'done':i===8?'on':'todo'}" ${i>8?'disabled':''}><span class="rk">${l}</span></button>`).join('');
const rows = [['Very High','Enemies strike fastest.'],['High','Enemies strike faster.'],
  ['Average','The pace the game is balanced for.'],['Low','Enemies strike slower.'],['Very Low','Enemies strike slowest.']]
  .map(([k,n],i)=>`<button class="bigbtn${i===2?' on':''}"><span class="bigk">${k}</span><span class="bign">${n}</span></button>`).join('');
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#0e1013}#app{height:100dvh}
${ENHANCED_TOKENS}${ENHANCED_CSS}${FIX}</style></head><body><div id="app">
<div class="shell wizard">
 <aside class="side">
  <div class="brand"><h1>New Character</h1><div class="sub">Daggerfall</div></div>
  <nav class="rail">${rail}</nav>
  <div class="strip"><div class="segs"></div><div class="steptext">Reflexes</div></div>
  <div class="foot">step 9 of 10</div>
 </aside>
 <main class="pane">
  <div class="stagebody solo"><div class="choose">
   <h2>How quick are you?</h2>
   <div class="bigchoice tall">${rows}</div>
   ${BUG ? '<div class="acts"><button class="act primary" id="go">Continue</button></div>' : ''}
  </div></div>
  <div class="actionbar"><button class="act" id="back">Back</button>${BUG ? '' : '<button class="act primary" id="go">Continue</button>'}</div>
 </main>
</div></div></body></html>`;
const b = await chromium.launch();
let bad = 0;
for (const [W,H] of [[1920,1080],[1600,900],[1366,768],[1280,720],[1280,600],[1024,576],[900,500],[800,600]]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  await p.setContent(PAGE, { waitUntil: 'load' });
  await p.waitForTimeout(120);
  const r = await p.evaluate(() => {
    const probe = (id) => {
      const el = document.getElementById(id); const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return { top: Math.round(r.top), bot: Math.round(r.bottom),
        hit: !!(top && (top === el || el.contains(top))),
        by: top ? (top.tagName+'.'+String(top.className||'')).slice(0,34) : 'OUTSIDE VIEWPORT' };
    };
    const pane = document.querySelector('.pane');
    return { go: probe('go'), back: probe('back'), vh: window.innerHeight,
      paneH: Math.round(pane.clientHeight), paneScroll: pane.scrollHeight,
      chooseH: Math.round(document.querySelector('.choose').getBoundingClientRect().height) };
  });
  console.log(`${W}x${H}  pane ${r.paneH}/${r.paneScroll} choose ${r.chooseH} | Continue ${r.go.top}..${r.go.bot} hit=${String(r.go.hit).padEnd(5)} <- ${r.go.by.padEnd(26)} | Back hit=${r.back.hit}`);
  if (!r.go.hit || !r.back.hit) bad++;
  await ctx.close();
}
await b.close();
console.log(bad ? `FAIL: ${bad} window size(s) cannot reach a wizard control` : 'OK: every control reachable at every size');
process.exit(bad ? 1 : 0);
