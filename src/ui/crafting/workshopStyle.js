// @ts-check
const CSS = `
.wk { --wk-line: var(--iron, #514a3b); --wk-accent: var(--brass, #c08a3e); --wk-text: var(--bone, #e9e4d9); --wk-muted: var(--dim, #a89e8b); color: inherit; display:flex; flex-direction:column; min-height:0; height:100%; gap:12px; text-align:left; }
.wk * { box-sizing:border-box; }
.wk h2,.wk h3,.wk p { margin:0; }
.wk-header { display:flex; align-items:center; gap:28px; flex:none; padding:0 0 12px; border-bottom:1px solid var(--wk-line); }
.wk-header h2 { font:inherit; font-size:24px; letter-spacing:.04em; color:inherit; }
.wk-eyebrow { color:var(--wk-accent); font-size:11px; letter-spacing:.14em; text-transform:uppercase; }
.wk-pages { display:flex; gap:6px; }
.wk-header .wk-location { margin-left:auto; color:var(--wk-muted); font-size:12px; }
.wk-layout { display:grid; grid-template-columns:150px minmax(0,1fr); gap:18px; min-height:0; flex:1; }
.wk-crafts { display:flex; flex-direction:column; gap:7px; min-height:0; overflow-y:auto; }
.wk .wk-craft { text-align:left; white-space:normal; display:flex; flex-direction:column; align-items:flex-start; gap:3px; padding:10px; }
.wk-craft small { font-size:11px; opacity:.75; font-weight:400; }
.wk button[aria-pressed="true"] { outline:1px solid var(--wk-accent); outline-offset:-2px; }
.wk-craft.on { color:var(--wk-accent); }
.wk-crafts select { width:100%; font:inherit; }
.wk-workspace { min-width:0; min-height:0; display:flex; flex-direction:column; gap:10px; overflow:hidden; }
.wk-operation-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; flex:none; }
.wk-status { margin-left:auto; font-size:12px; color:var(--wk-muted); }
.wk-content { min-width:0; min-height:0; flex:1; overflow:hidden; display:flex; flex-direction:column; }
.wk-content > .cw { flex:1; min-height:0; gap:8px; color:inherit; font:inherit; }
.wk-content .cw-head,.wk-content .cw-tabs { display:none; }
.wk-content .cw-search { font:inherit; color:inherit; border:1px solid var(--wk-line); background:transparent; min-width:0; }
.wk-content .cw-chips { flex-wrap:nowrap; overflow-x:auto; flex:none; max-width:100%; padding-bottom:2px; }
.wk-content .cw-chip { flex:none; font:inherit; color:inherit; background:transparent; border-color:var(--wk-line); }
.wk-content .cw-chip.cw-on { color:var(--wk-accent); background:color-mix(in srgb,var(--wk-accent) 14%,transparent); }
.wk-content .cw-body { display:grid; grid-template-columns:minmax(200px,1fr) minmax(260px,34%); grid-template-rows:minmax(130px,42%) minmax(110px,1fr); gap:12px; align-items:stretch; flex:1; min-height:0; flex-wrap:nowrap; }
.wk-scene { position:relative; min-width:0; min-height:0; border:1px solid var(--wk-line); overflow:hidden; background:color-mix(in srgb,var(--ink,#101214) 75%,var(--wk-accent)); }
.wk-scene canvas { width:100%; height:100%; display:block; }
.wk-scene-caption { position:absolute; bottom:0; inset-inline:0; padding:6px 10px; display:flex; justify-content:space-between; gap:10px; font-size:11px; background:color-mix(in srgb,var(--ink,#111) 90%,transparent); color:var(--wk-text); }
.wk-content .cw-list { grid-column:1; grid-row:2; flex:none; min-height:0; max-height:none; overflow-y:auto; padding-right:4px; }
.wk-content .cw-row { font:inherit; color:inherit; background:transparent; border-color:var(--wk-line); padding:9px 10px; }
.wk-content .cw-row.cw-on { border-color:var(--wk-accent); }
.wk-content .cw-state,.wk-content .cw-note { font-size:12px; color:var(--wk-muted); }
.wk-content .cw-body > .cw-card { grid-column:2; grid-row:1/-1; min-height:0; min-width:0; display:flex; flex-direction:column; overflow-y:auto; background:color-mix(in srgb,var(--ink,#111) 12%,transparent); color:inherit; border:1px solid var(--wk-line); padding:12px; gap:12px; }
.wk-content .cw-ws-piece,.wk-content .cw-ws-mats,.wk-content .cw-ws-sum { width:100%; min-width:0; }
.wk-content .cw-ws-piece { background:transparent; color:inherit; padding:0; box-shadow:none; border:0; }
.wk-content .cw-ws-piece * { color:inherit; text-shadow:inherit; }
.wk-content .cw-ws-pic { width:64px; height:64px; background:transparent; border-color:var(--wk-line); }
.wk-content .cw-ws-pic img { max-width:100%; max-height:100%; object-fit:contain; image-rendering:pixelated; }
.wk-content .cw-ws-mats .cw-search { width:100%; }
.wk-content .cw-ws-title,.wk-content .cw-label { color:var(--wk-accent); font-size:12px; }
.wk-content .cw-ws-mats .cw-chips { flex-wrap:wrap; overflow:visible; }
.wk-details { border-top:1px solid var(--wk-line); padding-top:8px; font-size:12px; }
.wk-details summary { cursor:pointer; color:var(--wk-accent); padding:5px 0; }
.wk-details[open] > :not(summary) { margin-top:8px; }
.wk .cw-actions { position:sticky; bottom:0; display:flex; flex-wrap:wrap; gap:6px; padding:8px 0; background:var(--v-ground,var(--ink,#171b21)); z-index:1; }
.wk-content .cw-btn { font:inherit; }
.wk-content .cw-ws-sum { margin-top:auto; }
.wk-content .cw-line { border-color:var(--wk-line); }
.wk-content .cw:not(:has(.cw-body)) { overflow-y:auto; }
.wk-work-controls { grid-column:1; grid-row:2; overflow-y:auto; min-height:0; }
.wk-content.wk-working .cw-list,.wk-content.wk-working .cw > .cw-chips,.wk-content.wk-working .cw > .cw-search { display:none; }
.wk-content .cw-act { margin:0; background:transparent; color:inherit; border-color:var(--wk-line); }
.wk-content .cw-act-stage { height:155px; }
.wk-content .cw-work { max-height:155px; }
.wk-content .cw-act-row { display:flex; gap:8px; flex-wrap:wrap; }
.wk-content .cw-word { color:var(--wk-text); border-color:var(--wk-accent); background:color-mix(in srgb,var(--wk-accent) 12%,transparent); padding:8px; font-size:13px; }
.wk > .wk-other { overflow-y:auto; flex:1; min-height:0; padding:0 4px; }
.wk-mastery .cw-focus { margin-bottom:16px; }
.wk-mastery details { margin-bottom:16px; }
.wk-content .pv { flex:1; min-height:0; gap:10px; color:inherit; font:inherit; }
.wk-content .pv > .pv-head { display:none; }
.wk-content .pv-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(200px,1fr) minmax(250px,34%); grid-template-rows:minmax(130px,42%) minmax(100px,1fr); align-items:stretch; gap:12px; }
.wk-content .pv-mid { grid-column:1; grid-row:2; min-height:0; overflow-y:auto; display:flex; flex-direction:column; }
.wk-content .pv-ings { grid-column:2; grid-row:1/-1; min-height:0; max-height:none; overflow-y:auto; color:inherit; }
.wk-content .pv-parch { background:transparent; color:inherit; box-shadow:none; border-color:var(--wk-line); padding:10px; }
.wk-content .pv-parch * { color:inherit; text-shadow:inherit!important; }
.wk-content .pv-title,.wk-content .pv-lab { color:var(--wk-accent); }
.wk-content .pv-slot,.wk-content .pv-tr,.wk-content .pv-x { border-color:var(--wk-line); color:inherit; }
.wk-content .pv-tr.shared { background:var(--wk-accent); color:var(--ink,#111); }
.wk-content .pv-ing,.wk-content .pv-row,.wk-content .pv-chip { color:inherit; background:transparent; border-color:var(--wk-line); font:inherit; }
.wk-content .pv-ing.in { border-color:var(--wk-accent); }
.wk-content .pv-sum { color:inherit; background:transparent; border-color:var(--wk-line); padding:8px 0; flex:none; }
.wk-content .pv-name,.wk-content .pv-does b { color:var(--wk-accent); }
.wk-content .pv-go { flex-direction:row; flex-wrap:wrap; }
.wk-recipe-book { grid-column:1; margin:0; font-size:12px; }
.wk-recipe-book > summary { color:var(--wk-accent); cursor:pointer; padding:8px 0; }
.wk-content .pv-book { max-height:220px; overflow-y:auto; }
.wk-preparations { margin:8px 0; }
.wk-preparations summary { cursor:pointer; color:var(--wk-accent); padding:6px 0; }
.wk-content .pv-sim { background:transparent; color:inherit; border-color:var(--wk-line); }
.wk-content.wk-working .pv-body { grid-template-rows:230px minmax(110px,1fr); }
.wk-content.wk-working .pv-parch,.wk-content.wk-working .wk-preparations,.wk-content.wk-working .wk-recipe-book { display:none; }
.wk-content.wk-working .pv-ings { opacity:.5; pointer-events:none; }
.wk-content .prof-smelt { margin-bottom:8px; }
.wk-stage-static { flex:none; height:180px; margin-bottom:12px; }
.wk .wk-scroll { min-height:0; flex:1; overflow-y:auto; }
.wk-footer { display:flex; justify-content:space-between; gap:12px; flex:none; border-top:1px solid var(--wk-line); padding-top:8px; font-size:12px; color:var(--wk-muted); }
.wk-legacy { overflow-y:auto; }
.wk .wk-content .wk-item-work { position:static; inset:auto; z-index:auto; display:flex; flex:1; min-height:0; padding:0; background:transparent; backdrop-filter:none; }
.wk .wk-item-work .broker-win { position:static; width:100%; height:100%; max-width:none; max-height:none; min-height:0; margin:0; box-shadow:none; border:0; display:flex; flex-direction:column; }
.wk .wk-item-work .broker-body { min-height:0; flex:1; overflow:auto; }
.wk .wk-item-work .broker-head { flex:none; }
.wk-content .pv-body.wk-simmering .pv-sim { grid-column:1; grid-row:2; overflow:auto; min-height:0; }
.wk-content .pv-body.wk-simmering .pv-mid { display:none; }
.wk-pantry summary { cursor:pointer; color:var(--wk-accent); padding:6px 0; }
.wk-content > .cw > .cw-search,.wk-crafts > select { flex:none; height:34px; min-height:34px; }
.wk-content .cw-foot { display:none; }
.wk-content .cw-body > .cw-card { flex-wrap:nowrap; align-items:stretch; }
.wk-content .cw-ws-piece,.wk-content .cw-ws-mats,.wk-content .cw-ws-sum { flex:none; }
.wk-content .cw-body > .cw-card { overflow:hidden; }
.wk-content .cw-ws-piece { max-height:38%; overflow-y:auto; }
.wk-content .cw-ws-mats { flex:1; min-height:70px; overflow-y:auto; }
.wk-content .cw-ws-sum { max-height:45%; overflow-y:auto; background:transparent; padding:8px 0 0; }
.wk-quality > summary { cursor:pointer; font-size:12px; padding:4px 0; }
.wk .wk-content .cw-ws-piece :is(.cw-note,.cw-make,.cw-label,th,td) { color:inherit; }
.wk .wk-crafts select { background:transparent; color:inherit; border:1px solid var(--wk-line); }
.wk-content .cw-body.wk-working { grid-template-rows:minmax(0,1fr); }
.wk-content .cw-body.wk-working > .wk-scene { grid-column:1; grid-row:1; opacity:.48; }
.wk-content .cw-body.wk-working > .wk-work-controls { grid-column:1; grid-row:1; z-index:1; }
html .wk .wk-work-controls .cw-act { height:100%; min-height:0; display:flex; flex-direction:column; gap:8px; background:rgba(12,10,8,.8)!important; color:#f0e5cd!important; padding:16px; }
.wk .wk-work-controls .cw-act-stage { flex:1; min-height:220px; height:auto; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.wk .wk-work-controls .cw-work { width:min(100%,420px); height:auto; flex:1; min-height:220px; max-height:calc(100% - 48px); margin:0; }
.wk .cw-work-label,.wk .cw-work-sub,.wk .cw-work-hub { display:none; }
html .wk .wk-work-controls :is(.cw-act-head,.cw-work-caption,.cw-work-caption span) { color:#f0e5cd!important; text-shadow:none!important; }
html .wk .wk-work-controls .cw-work-caption b { color:#ffda83!important; text-shadow:none!important; }
html .wk .wk-work-controls .cw-act-row .cw-btn { color:#f0e5cd!important; background:rgba(25,19,12,.92)!important; border-color:#c49a51!important; }
.wk .cw-work-caption { display:flex; flex-direction:column; gap:4px; flex:none; min-height:44px; text-align:center; font-size:16px; line-height:1.3; }
.wk .cw-work-caption b { font-size:20px; color:#ffda83; }
.wk .cw-work-track { stroke:#ac8b50; }
.wk .cw-work-needle line { stroke:#fff5d5; stroke-width:1.8; }
.wk .cw-work-true { stroke:#fff4b5; }
.wk .wk-work-controls .cw-act-head { font-size:14px; line-height:1.4; }
@media(max-width:700px){ .wk-content .cw-body.wk-working > .wk-scene { display:none; }.wk .wk-work-controls .cw-act-stage { height:360px;flex:none; }.wk .wk-work-controls .cw-work { height:300px;flex:none;max-height:300px; }.wk .wk-work-controls .cw-act { min-height:480px; } }
@media(max-width:950px){ .wk-layout{grid-template-columns:125px minmax(0,1fr);gap:12px} .wk-content .cw-body,.wk-content .pv-body{grid-template-columns:minmax(180px,1fr) minmax(210px,40%)} .wk-header{gap:14px}.wk-header .wk-location{display:none}.wk-content .cw-ws-pic{width:45px;height:45px} }
@media(max-width:700px){ .wk-layout{display:flex;flex-direction:column;overflow-y:auto}.wk-crafts{flex-direction:row;overflow-x:auto;flex:none}.wk-crafts .wk-craft{min-width:112px}.wk-crafts select{width:150px;flex:none}.wk-header{flex-wrap:wrap}.wk-content{overflow:visible;flex:none}.wk-content .cw-body,.wk-content .pv-body{display:flex;flex-direction:column;overflow:visible}.wk-scene{height:210px;flex:none}.wk-content .cw-list{max-height:210px;flex:none}.wk-content .cw-body > .cw-card{flex:none;overflow:visible}.wk-content .pv-mid{overflow:visible}.wk-content .pv-ings{max-height:260px;flex:none}.wk-work-controls{overflow:visible}.wk-workspace{overflow:visible;flex:none}.wk-other{overflow-y:auto}.wk-header h2{font-size:20px} }
`;
export function ensureWorkshopStyle(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('bf-workshop-style')) return;
  const style = doc.createElement('style'); style.id = 'bf-workshop-style'; style.textContent = CSS; doc.head.append(style);
}
