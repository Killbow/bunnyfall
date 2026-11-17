// @ts-check
// A station-sized view, with the selected item's real sprite and feedback from the live crafting acts.
export function createWorkshopScene(host, station, name, available) {
  const doc = host.ownerDocument, box = doc.createElement('div'), canvas = doc.createElement('canvas');
  box.className = 'wk-scene'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${name} — crafting work surface`);
  const caption = doc.createElement('div'); caption.className = 'wk-scene-caption';
  const title = doc.createElement('span'), status = doc.createElement('span');
  title.textContent = name; status.textContent = available ? 'Station available' : 'Planning · matching station required'; caption.append(title, status); box.append(canvas, caption);
  const ctx = canvas.getContext('2d'); if (!ctx) return { el: box, stop() {} };
  let raf = 0, last = 0, flash = 0, heat = .35, stopped = false, width = 1, height = 1, attached = false;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const feedback = (event) => { flash = 1; if (Number.isFinite(event.detail?.heat)) heat = event.detail.heat; };
  host.addEventListener('bf-workshop-feedback', feedback);
  function stop() { if (stopped) return; stopped = true; cancelAnimationFrame(raf); host.removeEventListener('bf-workshop-feedback', feedback); observer?.disconnect(); }
  const poly = (points, color) => { ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill(); };
  const rect = (x,y,w,h,c) => { ctx.fillStyle = c; ctx.fillRect(x,y,w,h); };
  function draw(time) {
    if (stopped) return;
    if (host.isConnected) attached = true; else if (attached) { stop(); return; }
    const bounds = box.getBoundingClientRect(), ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (bounds.width > 0 && bounds.height > 0 && (width !== bounds.width || height !== bounds.height)) { width = bounds.width; height = bounds.height; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    ctx.setTransform(canvas.width / 600,0,0,canvas.height / 270,0,0); ctx.imageSmoothingEnabled = false;
    const style = globalThis.getComputedStyle(host), ink = style.getPropertyValue('--ink').trim() || '#181817', brass = style.getPropertyValue('--brass').trim() || '#b59a62', text = style.color || '#dfd5bd';
    rect(0,0,600,270,ink); ctx.globalAlpha=.12;
    for (let r=0;r<5;r++) for(let c=0;c<10;c++) rect(c*68-(r%2)*34+2,r*35+2,64,31,text);
    ctx.globalAlpha=1;
    rect(26,0,14,195,ink); rect(554,0,15,195,ink); rect(0,0,600,13,ink);
    ctx.globalAlpha=.26; rect(420,27,108,107,brass); ctx.globalAlpha=1; rect(471,27,5,107,ink); rect(420,78,108,5,ink);
    poly([[0,195],[600,182],[600,270],[0,270]],ink);
    ctx.globalAlpha=.17; for(let i=0;i<10;i++) poly([[i*75,188],[i*90-70,270],[i*90-66,270],[i*75+2,188]],text); ctx.globalAlpha=1;
    ctx.globalAlpha=.5; rect(60,54,150,7,brass); for(let i=0;i<5;i++) rect(74+i*24,32+(i%2)*5,13,21-(i%2)*5,text); ctx.globalAlpha=1;
    // The station is art within the menu; all crafting eligibility still comes from the world provider.
    ctx.globalAlpha=.45; poly([[129,196],[461,190],[494,233],[103,241]],brass); ctx.globalAlpha=.65; poly([[103,241],[494,233],[494,245],[103,254]],brass); ctx.globalAlpha=1;
    rect(137,252,12,18,ink); rect(447,244,13,26,ink);
    const working = !!host.querySelector('.cw-act,.pv-sim');
    const motion = working && !reduced ? Math.sin(time/330) : 0;
    if (station === 'anvil' || station === 'fire') {
      ctx.globalAlpha=.35; rect(76,99,111,90,brass); ctx.globalAlpha=1; rect(95,115,76,61,ink);
      ctx.globalAlpha=.4+heat*.4; poly([[100,168],[114,136],[126,160],[142,123],[155,153],[165,144],[163,174]],brass); ctx.globalAlpha=1;
    }
    if(station==='anvil') {
      ctx.globalAlpha=.6; poly([[230,160],[341,160],[370,174],[340,184],[241,184]],text); poly([[258,184],[320,184],[331,215],[246,215]],text); ctx.globalAlpha=1;
      ctx.save(); ctx.translate(347,142); ctx.rotate(-.5+(reduced?0:flash*.9)); rect(-3,-6,7,52,brass); rect(-20,-13,42,17,text); ctx.restore();
    } else if(station==='fire'||station==='alchemy') {
      ctx.globalAlpha=.7; poly([[245,174],[351,174],[340,222],[259,222]],text); ctx.globalAlpha=1; ctx.fillStyle=brass; ctx.beginPath(); ctx.ellipse(298,174,53,12,0,0,Math.PI*2); ctx.fill();
      ctx.save();ctx.translate(308,134);ctx.rotate(-.3+motion*.3);rect(-2,-8,5,60,text);ctx.restore();
      ctx.strokeStyle=text;ctx.globalAlpha=.22;ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(272+i*24,150);ctx.bezierCurveTo(259+i*24+motion*4,130,288+i*24,121,272+i*24,103);ctx.stroke();}ctx.globalAlpha=1;
    } else if(station==='loom') {
      ctx.globalAlpha=.55;poly([[222,173],[266,180],[305,167],[355,208],[320,225],[292,243],[245,229],[211,214]],brass);ctx.globalAlpha=1;ctx.strokeStyle=text;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(254,187);ctx.lineTo(311,219);ctx.stroke();ctx.setLineDash([]);
    } else if(station==='enchant'||station==='jeweller') {
      ctx.globalAlpha=.35;ctx.strokeStyle=brass;ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(298,203,27+i*12,11+i*5,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;poly([[299,145],[315,168],[299,190],[282,168]],text);
    } else {
      ctx.globalAlpha=.75;poly([[225,183],[336,178],[369,206],[253,216]],brass);ctx.globalAlpha=1;rect(270+(motion*14),169,37,17,text);
    }
    const image = host.querySelector('.cw-ws-pic img');
    if(image?.complete && image.naturalWidth) { const scale=Math.min(100/image.naturalWidth,65/image.naturalHeight); ctx.drawImage(image,275-image.naturalWidth*scale/2,178-image.naturalHeight*scale/2,image.naturalWidth*scale,image.naturalHeight*scale); }
    if(flash>.05&&!reduced){ctx.fillStyle=brass;ctx.globalAlpha=flash;for(let i=0;i<12;i++){const a=i*2.4,d=(1-flash)*65;ctx.fillRect(299+Math.cos(a)*d,174+Math.sin(a)*d,2,2);}ctx.globalAlpha=1;}
    if(last) flash=Math.max(0,flash-(time-last)/500);last=time;
    status.textContent=working?'Working · timing affects the result':available?'Station available':'Planning · matching station required';
    raf=requestAnimationFrame(draw);
  }
  const observer = typeof ResizeObserver!=='undefined'?new globalThis.ResizeObserver(()=>{width=0;}):null; observer?.observe(box);
  raf=requestAnimationFrame(draw);
  return { el: box, stop };
}
