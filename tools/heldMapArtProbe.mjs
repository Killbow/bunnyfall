// Measures the held map sprite in a browser: alpha, art foot, sheet bounds, hand chroma, and cuff gaps.
// Run: node tools/heldMapArtProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const server = await createServer({ server: { port: 5287, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
await page.goto('http://127.0.0.1:5287/play/', { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const { HELD_MAP_URL, SPRITE, PAPER, THUMB_ZONES, HAND_CHROMA, SPRITE_ART_FOOT, CUFF_BAND,
    HELD_MAP_HEIGHT, HELD_MAP_BITE, extendCuffs, keyThumbPixels } = await import('/src/ui/heldMap.js');
  const img = new Image();
  const loaded = await new Promise((r) => { img.onload = () => r(true); img.onerror = () => r(false); img.src = HELD_MAP_URL; });
  if (!loaded) return { loaded: false };
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const raw = x.getImageData(0, 0, W, H).data;
  const A = (px, py) => raw[(((py * W) + px) * 4) + 3];
  const RB = (px, py) => { const i = ((py * W) + px) * 4; return raw[i] - raw[i + 2]; };
  const LUM = (px, py) => { const i = ((py * W) + px) * 4; return (0.299 * raw[i]) + (0.587 * raw[i + 1]) + (0.114 * raw[i + 2]); };

  let clear = 0, solid = 0;
  for (let i = 3; i < raw.length; i += 4) { if (raw[i] === 0) clear++; else if (raw[i] > 200) solid++; }

  let lastRow = 0;
  for (let y = 0; y < H; y++) { let n = 0; for (let px = 0; px < W; px++) if (A(px, y) > 8) n++; if (n / W > 0.002) lastRow = y; }

  const rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1);
  const colT = new Int32Array(W).fill(-1), colB = new Int32Array(W).fill(-1);
  // The 128 alpha threshold must match extendCuffs in src/ui/heldMap.js, or this measures a different picture.
  for (let y = 0; y < H; y++) { for (let px = 0; px < W; px++) if (A(px, y) > 128) { rowL[y] = px; break; }
    for (let px = W - 1; px >= 0; px--) if (A(px, y) > 128) { rowR[y] = px; break; } }
  for (let px = 0; px < W; px++) { for (let y = 0; y < H; y++) if (A(px, y) > 128) { colT[px] = y; break; }
    for (let y = H - 1; y >= 0; y--) if (A(px, y) > 128) { colB[px] = y; break; } }
  const thumbTop = Math.round(Math.min(...THUMB_ZONES.map((z) => z.y0)) * H);
  let sheetL = 0, sheetR = W - 1, sheetT = 0, sheetB = H - 1;
  for (let y = Math.max(0, colT[Math.round(W / 2)]) + 4; y < thumbTop; y++) {
    if (rowL[y] > sheetL) sheetL = rowL[y]; if (rowR[y] >= 0 && rowR[y] < sheetR) sheetR = rowR[y]; }
  for (let px = Math.round(W * 0.29); px <= Math.round(W * 0.69); px++) {
    if (colT[px] > sheetT) sheetT = colT[px]; if (colB[px] >= 0 && colB[px] < sheetB) sheetB = colB[px]; }
  const px0 = Math.round(PAPER.x0 * W), px1 = Math.round(PAPER.x1 * W);
  const py0 = Math.round(PAPER.y0 * H), py1 = Math.round(PAPER.y1 * H);
  let overhang = 0;
  for (let y = py0; y <= py1; y++) for (const px of [px0, px1]) if (A(px, y) <= 128) overhang++;
  for (let px = px0; px <= px1; px++) for (const y of [py0, py1]) if (A(px, y) <= 128) overhang++;

  const box = (bx0, bx1, by0, by1, f) => { for (let y = by0; y < by1; y++) for (let bx = bx0; bx < bx1; bx++) if (A(bx, y) > 128) f(bx, y); };
  let gN = 0, gUnder = 0, gLumMax = 0;
  for (const [a, b, d2, e] of [[Math.round(W * 0.207), Math.round(W * 0.262), 520, 620],
    [Math.round(W * 0.753), Math.round(W * 0.808), 520, 620]])
    box(a, b, d2, e, (bx, by) => { gN++; if (RB(bx, by) < HAND_CHROMA) gUnder++; const l = LUM(bx, by); if (l > gLumMax) gLumMax = l; });
  let sN = 0, sUnder = 0, sLumMin = 255;
  for (const [a, b, d2, e] of [[sheetL + 1, sheetL + 49, sheetT + 30, thumbTop - 20],
    [sheetR - 48, sheetR, sheetT + 30, thumbTop - 20],
    [Math.round(W * 0.28), Math.round(W * 0.69), sheetT + 4, sheetT + 39],
    [Math.round(W * 0.28), Math.round(W * 0.69), sheetB - 30, sheetB],
    [Math.round(W * 0.28), Math.round(W * 0.72), sheetT + 50, sheetB - 60]])
    box(a, b, d2, e, (bx, by) => { sN++; if (RB(bx, by) < HAND_CHROMA) sUnder++; const l = LUM(bx, by); if (l < sLumMin) sLumMin = l; });

  const zones = THUMB_ZONES.map((z) => {
    const zx = Math.floor(z.x0 * W), zy = Math.floor(z.y0 * H);
    const zw = Math.ceil((z.x1 - z.x0) * W), zh = Math.ceil((z.y1 - z.y0) * H);
    const d2 = x.getImageData(zx, zy, zw, zh);
    keyThumbPixels(d2.data, zw, zh, z.side);
    let kept = 0, keptOnPaper = 0, onPaper = 0, warmKept = 0;
    for (let yy = 0; yy < zh; yy++) for (let xx = 0; xx < zw; xx++) {
      const i = ((yy * zw) + xx) * 4;
      const inPaper = zx + xx >= px0 && zx + xx <= px1 && zy + yy >= py0 && zy + yy <= py1;
      if (inPaper) onPaper++;
      if (d2.data[i + 3] > 128) { kept++; if (inPaper) { keptOnPaper++; if (RB(zx + xx, zy + yy) >= HAND_CHROMA + 20) warmKept++; } }
    }
    return { side: z.side, kept, keptOnPaper, onPaper, warmKept,
      keptFrac: +(keptOnPaper / onPaper).toFixed(4), warmFrac: +(warmKept / Math.max(1, keptOnPaper)).toFixed(4) };
  });

  const band = CUFF_BAND * H;
  const sheetFoot = sheetB;
  const sheetCols = [], silhouette = [], cut = [];
  for (let px = 0; px < W; px++) {
    const last = colB[px];
    if (last < 0) continue;
    if (px >= sheetL && px <= sheetR && last <= sheetFoot + 32) sheetCols.push([px, last / H]);
    else if (last >= H - 4) continue;
    else cut.push([px, last / H]);
  }
  cut.sort((a, b) => a[1] - b[1]);
  const cutLine = lastRow - 40;
  const cutLow = cut.filter((c) => c[1] * H >= cutLine);
  for (const c of cut) if (c[1] * H < cutLine) silhouette.push(c);
  const gapTop = silhouette.length ? Math.max(...silhouette.map((c) => c[1])) : 0;
  const gapBot = cutLow.length ? Math.min(...cutLow.map((c) => c[1])) : 1;
  const vh = 900, sh = vh * HELD_MAP_HEIGHT / SPRITE_ART_FOOT, sy = vh - ((SPRITE_ART_FOOT - HELD_MAP_BITE) * sh);
  const ext = x.getImageData(0, 0, W, H);
  extendCuffs(ext.data, W, H);
  const painted = (px) => ext.data[((((H - 1) * W) + px) * 4) + 3] > 8;
  let armShort = 0, sheetSmeared = 0, silhouetteSmeared = 0;
  for (const [px, f] of cutLow) if (!painted(px) && sy + (f * sh) < vh) armShort++;
  for (const [px] of sheetCols) if (painted(px)) sheetSmeared++;
  for (const [px] of silhouette) if (painted(px)) silhouetteSmeared++;
  const short = cutLow.map(([, f]) => vh - (sy + (f * sh))).filter((v) => v > 0.5).sort((a, b) => b - a);

  return { loaded: true, size: [W, H], spriteConst: SPRITE,
    clearFrac: +(clear / (raw.length / 4)).toFixed(4), solidFrac: +(solid / (raw.length / 4)).toFixed(4),
    artFootConst: SPRITE_ART_FOOT, lastInkedRowFrac: +((lastRow + 1) / H).toFixed(4),
    sheet: [sheetL, sheetT, sheetR, sheetB],
    sheetFrac: [+(sheetL / W).toFixed(4), +(sheetT / H).toFixed(4), +((sheetR + 1) / W).toFixed(4), +((sheetB + 1) / H).toFixed(4)],
    paperConst: [PAPER.x0, PAPER.y0, PAPER.x1, PAPER.y1], overhang,
    chromaConst: HAND_CHROMA, gN, gUnderFrac: +(gUnder / gN).toFixed(4), gLumMax: Math.round(gLumMax),
    sN, sUnder, sUnderFrac: +(sUnder / sN).toFixed(6), sLumMin: Math.round(sLumMin),
    zones,
    bandConst: CUFF_BAND, sheetCols: sheetCols.length, silhouette: silhouette.length, cutCols: cutLow.length,
    gapTop: +gapTop.toFixed(4), gapBot: +gapBot.toFixed(4), gapRows: Math.round((gapBot - gapTop) * H),
    headroomRows: Math.round((CUFF_BAND - gapTop) * H),
    armLowMin: +(cutLow[0]?.[1] ?? 0).toFixed(4), armLowMax: +(cutLow[cutLow.length - 1]?.[1] ?? 0).toFixed(4),
    colsShortOfBottom: short.length, worstShortfallPx: +(short[0] ?? 0).toFixed(1), screenHeight: vh,
    cuffClearancePx: +Math.min(...cutLow.map(([, f]) => (sy + (f * sh)) - vh)).toFixed(1),
    armShort, sheetSmeared, silhouetteSmeared };
});

check('the art loads at all', out.loaded === true && pageErrors.length === 0, pageErrors.join(' | '));
if (!out.loaded) { await browser.close(); await server.close(); process.exit(1); }
console.log(`  ${out.size[0]}x${out.size[1]}  clear ${(out.clearFrac * 100).toFixed(1)}%  art foot ${out.lastInkedRowFrac}`);
console.log(`  sheet ${JSON.stringify(out.sheetFrac)}  PAPER ${JSON.stringify(out.paperConst)}  overhang ${out.overhang}px`);
console.log(`  r-b < ${out.chromaConst}: ${(out.gUnderFrac * 100).toFixed(1)}% of ${out.gN} glove px, ${out.sUnder} of ${out.sN} sheet px`);
console.log(`  ${out.sheetCols} sheet columns, ${out.silhouette} hand-silhouette, ${out.cutCols} cut cuffs ending ${out.armLowMin}..${out.armLowMax}`);
console.log(`  the gap CUFF_BAND must sit in: ${out.gapTop}..${out.gapBot} (${out.gapRows} rows); band ${out.bandConst}, headroom ${out.headroomRows} rows`);
out.zones.forEach((z) => console.log(`  thumb ${z.side}: keeps ${(z.keptFrac * 100).toFixed(1)}% of its box inside PAPER, ${(z.warmFrac * 100).toFixed(1)}% of that warm`));

check('SPRITE matches the file the port actually ships', out.size[0] === out.spriteConst.w && out.size[1] === out.spriteConst.h, `${out.size} vs ${out.spriteConst.w}x${out.spriteConst.h}`);
check('the file carries a REAL ALPHA CHANNEL, which is why there is no matte key any more', out.clearFrac > 0.3 && out.solidFrac > 0.3, `clear ${out.clearFrac}, solid ${out.solidFrac}`);
check('SPRITE_ART_FOOT is the PAINTING\'s foot, measured', Math.abs(out.artFootConst - out.lastInkedRowFrac) < 0.01, `const ${out.artFootConst} against measured ${out.lastInkedRowFrac}`);
check('...and it is short of the file\'s own foot, which is the gap anchoring the file would leave', out.artFootConst < 0.95, `${((1 - out.artFootConst) * 100).toFixed(1)}% of the file below the art`);

check('PAPER lies WHOLLY on the sheet - no edge of the ink hangs over the torn border', out.overhang === 0, `${out.overhang} border pixels off the sheet`);
check('...and it is not needlessly small - it spans most of the sheet it sits in',
  (out.paperConst[2] - out.paperConst[0]) > (out.sheetFrac[2] - out.sheetFrac[0]) * 0.9
  && (out.paperConst[3] - out.paperConst[1]) > (out.sheetFrac[3] - out.sheetFrac[1]) * 0.85,
  `paper ${(out.paperConst[2] - out.paperConst[0]).toFixed(3)}x${(out.paperConst[3] - out.paperConst[1]).toFixed(3)} in sheet ${(out.sheetFrac[2] - out.sheetFrac[0]).toFixed(3)}x${(out.sheetFrac[3] - out.sheetFrac[1]).toFixed(3)}`);

check('HAND_CHROMA calls a third of the THUMB steel - enough to seed a blob through', out.gUnderFrac > 0.25, `${(out.gUnderFrac * 100).toFixed(1)}% of ${out.gN} thumb pixels`);
check('...and almost none of the sheet, its burnt border included', out.sUnderFrac < 0.0005, `${out.sUnder} of ${out.sN} sheet pixels under the line`);
check('...where a BRIGHTNESS cut could not: the glove out-shines the sheet\'s own border', out.gLumMax > out.sLumMin, `glove reaches luma ${out.gLumMax}, the sheet falls to ${out.sLumMin}`);

for (const z of out.zones) {
  check(`the ${z.side} thumb covers a THUMB'S worth of its box on the paper`, z.keptFrac > 0.05 && z.keptFrac < 0.55, `${(z.keptFrac * 100).toFixed(1)}%`);
  check(`...and what it keeps there is steel, not parchment`, z.warmFrac < 0.12, `${(z.warmFrac * 100).toFixed(1)}% of it as warm as the sheet`);
}

check('no cut cuff is left short of the screen\'s bottom edge - the gap Mac saw', out.worstShortfallPx <= 0, `${out.colsShortOfBottom} of ${out.cutCols} cut columns short; the highest clears by ${out.cuffClearancePx.toFixed(1)}px on a ${out.screenHeight}px screen`);
check('extendCuffs closes ALL of them - no cut column is left ending in mid-air', out.armShort === 0, `${out.armShort} still short`);
check('...and it smears no parchment: the sheet\'s own columns are untouched', out.sheetSmeared === 0, `${out.sheetSmeared} of ${out.sheetCols} sheet columns streaked to the foot`);
check('...nor the hand\'s own silhouette, which is DRAWN to end where it ends', out.silhouetteSmeared === 0, `${out.silhouetteSmeared} of ${out.silhouette} silhouette columns streaked to the foot`);
check('CUFF_BAND falls in a gap the painting really leaves', out.gapTop < out.bandConst && out.bandConst < out.gapBot,
  `the silhouette ends by ${out.gapTop}, the cut cuffs begin at ${out.gapBot}, band at ${out.bandConst}`);
check('...and the gap is wide enough to hold it with room either side', out.gapRows >= 12 && out.headroomRows >= 4,
  `${out.gapRows} rows of gap, ${out.headroomRows} rows of headroom above the silhouette`);

await browser.close();
await server.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
