// BUNNYFALL: the counter's floating pour points and the innkeeper's bound recipe book.
export const TAVERN_SERVICE_STYLE = `
.ts-window{position:fixed;inset:0;z-index:18;display:grid;place-items:center;padding:24px;box-sizing:border-box;color:#392719;font:17px Georgia,serif;background:rgba(14,10,5,.48);overscroll-behavior:contain}
.ts-window *{box-sizing:border-box}.ts-window [hidden]{display:none!important}
.ts-window button{font:inherit;cursor:pointer;color:inherit;touch-action:manipulation}
.ts-window button:disabled{cursor:default;opacity:.45}
.ts-window button:focus-visible{outline:3px solid #f1ca6c;outline-offset:5px}
.ts-window h1,.ts-window h2,.ts-window p{margin:0}.ts-window h1{font-weight:normal;font-size:clamp(25px,3vw,38px)}
.ts-window .ts-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.22em;color:#8b5933}
.ts-window .ts-rule{font-size:14px;line-height:1.6;max-width:38em}
.ts-window .ts-button{padding:10px 17px;border:1px solid #9f7441;border-radius:3px;background:linear-gradient(#f2dbac,#d9b579);color:#392719;box-shadow:inset 0 0 0 2px #f4dfa844}
.ts-window .ts-button:hover:not(:disabled){background:#f9e6bb}.ts-window .ts-primary{background:linear-gradient(#72402c,#48251e);color:#ffedc4;border-color:#b58a4b}
.ts-window .ts-primary:hover:not(:disabled){background:#855039}.ts-window .ts-quiet{background:transparent;border-color:transparent;box-shadow:none;text-decoration:underline;text-underline-offset:4px}
.ts-window footer{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px}
.ts-counter{width:min(740px,100%);max-height:calc(100dvh - 48px);overflow:auto;text-align:center;color:#f8e7c3;align-self:center}
.ts-counter header{text-shadow:0 2px 7px #000}.ts-counter .ts-kicker{color:#dfbb79;margin-bottom:8px}
.ts-counter .ts-rule{margin:12px auto;color:#f0d8ad}
.ts-points{display:flex;justify-content:space-around;gap:20px;margin:35px auto 26px;max-width:590px}
.ts-point{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:12px;width:130px;color:#ffecc3!important;text-shadow:0 2px 5px #000}
.ts-orb{position:relative;display:grid;place-items:center;width:88px;height:88px;border:1px solid #e2bd75;border-radius:50%;background:radial-gradient(circle,#54412fdd,#1c1711e8);box-shadow:0 0 0 5px #20160c88,0 5px 20px #0009,inset 0 0 20px #d2ae5033;transition:transform .15s,box-shadow .15s}
.ts-point:hover:not(:disabled) .ts-orb{transform:translateY(-5px);box-shadow:0 0 0 5px #d2ae5033,0 0 30px #e5ba5266}
.ts-orb svg{width:44px;height:62px;filter:drop-shadow(0 3px 2px #0008)}
.ts-point small{color:#e0c59a;font:12px Georgia,serif}.ts-point .ts-key{position:absolute;right:-4px;bottom:0;background:#e6ca91;color:#382717;text-shadow:none;font-size:12px;border-radius:50%;width:23px;height:23px;display:grid;place-items:center}
.ts-tray{padding:23px;border:1px solid #b4874e;border-radius:6px;background:linear-gradient(120deg,#eddbb3,#c6a374);color:#392719;box-shadow:0 15px 45px #0008,inset 0 0 0 4px #58341c33}
.ts-dose-slots{display:flex;justify-content:center;gap:13px;margin:15px 0}.ts-dose{width:25px;height:25px;display:inline-block;border-radius:50%;border:2px solid #9c774f;background:#6b4a2b22;box-shadow:inset 0 2px 5px #311c1333}
.ts-wine{background:#8e3545!important}.ts-cream{background:#fff0cb!important}.ts-beer{background:#d99734!important}
.ts-status{font-size:14px;min-height:22px;margin-bottom:13px!important}.ts-counter footer{margin-top:14px}
.ts-book{position:relative;display:grid;grid-template-columns:.85fr 1.15fr;width:min(880px,100%);max-height:calc(100dvh - 48px);overflow:auto;border:12px solid #512d20;border-radius:12px 18px 18px 12px;background:#dfc08a;box-shadow:0 25px 80px #000b,0 0 0 2px #b48345,inset 0 0 0 2px #f4dfad}
.ts-book:before{content:'';position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 35px #66371355;border:1px solid #b58346;border-radius:3px}
.ts-book-leaf{padding:36px 30px 24px;background:repeating-linear-gradient(8deg,#fff8db08 0 2px,#7a482406 3px 4px),radial-gradient(ellipse at center,#f4e4b8,#d5b17b);position:relative}
.ts-book-intro{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-right:1px solid #93663c;background:linear-gradient(to left,#58341b44,transparent 12%),radial-gradient(ellipse at center,#f4e4b8,#d5b17b)}
.ts-book-intro h1{margin:14px 0 15px;line-height:1.15}.ts-book-intro .ts-rule{font-style:italic;margin:15px 0}
.ts-flourish{font-size:27px;letter-spacing:.25em;color:#945e30;margin:15px 0}.ts-book-seal{width:106px;height:106px;border:1px solid #9c6c3e;border-radius:50%;box-shadow:0 0 0 6px #a3753b22;display:grid;place-items:center;margin:12px auto}
.ts-book-seal svg{width:45px;height:72px;transform:rotate(-12deg)}
.ts-book-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;font-size:12px;margin-top:10px}.ts-book-legend span{display:flex;align-items:center;gap:5px}.ts-book-legend i{width:9px;height:9px;border-radius:50%;border:1px solid #65452e}
.ts-book-recipes .ts-kicker{padding-bottom:15px;border-bottom:1px solid #a477453f}
.ts-recipe{display:grid;grid-template-columns:42px 1fr;gap:14px;padding:21px 0;border-bottom:1px solid #a477454d}
.ts-recipe-number{font-size:30px;font-style:italic;color:#9a6238;line-height:1.1}.ts-recipe h2{font-size:21px;font-weight:normal;margin-bottom:9px;line-height:1.2}.ts-recipe p{font-size:14px;line-height:1.5}.ts-recipe-doses{display:flex;gap:6px;margin-top:10px}.ts-recipe-doses .ts-dose{width:13px;height:13px;border-width:1px}
.ts-book footer{justify-content:space-between;margin-top:22px;gap:4px}.ts-book footer .ts-button{padding:8px 10px;font-size:13px}.ts-pagination{font-size:12px;color:#78502e}
.ts-window .ts-book-close{position:absolute;top:8px;right:9px;z-index:1;padding:0;border:0;background:none;box-shadow:none;font-size:24px;color:#70432a;width:34px;height:34px}
@media(max-width:620px){.ts-window{padding:12px;font-size:15px}.ts-book{grid-template-columns:1fr;max-height:calc(100dvh - 24px);border-width:7px}.ts-book-leaf{padding:25px 23px 18px}.ts-book-intro{border-right:0;border-bottom:1px solid #9d743e;padding:22px 25px 14px}.ts-book-intro h1{font-size:25px;margin:8px 0}.ts-book-intro .ts-rule{font-size:12px;margin:6px 0}.ts-book-seal,.ts-flourish,.ts-book-intro .ts-kicker{display:none}.ts-book-legend{margin-top:4px}.ts-recipe{padding:15px 0}.ts-recipe h2{font-size:20px}.ts-points{gap:8px;margin:23px auto}.ts-point{width:90px;font-size:15px;gap:8px}.ts-orb{width:66px;height:66px}.ts-orb svg{width:32px;height:47px}.ts-tray{padding:17px 12px}.ts-counter h1{font-size:27px}}
@media(max-height:600px) and (min-width:621px){.ts-book-leaf{padding:22px}.ts-recipe{padding:12px 0}.ts-book-intro .ts-flourish{margin:5px}.ts-book-seal{width:80px;height:80px}.ts-points{margin:17px auto}.ts-orb{width:65px;height:65px}.ts-orb svg{height:47px}.ts-tray{padding:13px}}
.ts-point.ts-pouring .ts-orb svg{animation:ts-tip .5s ease-in-out}
@keyframes ts-tip{35%,65%{transform:translate(-10px,-6px) rotate(-55deg)}}
.ts-dose.ts-fresh{animation:ts-drop .45s cubic-bezier(.3,1.5,.5,1)}
@keyframes ts-drop{from{transform:translateY(-26px) scale(.4);opacity:0}}
.ts-tray.ts-full .ts-dose-slots{animation:ts-lift .5s ease-out}
@keyframes ts-lift{40%{transform:translateY(-8px)}}
.ts-recipe .ts-note{font-style:italic;color:#7a5634;margin-top:4px}
.ts-window.ts-low{place-items:end center;background:linear-gradient(transparent 55%,rgba(14,10,5,.55));padding-bottom:18px}
.ts-chore{width:min(560px,100%);text-align:center;color:#f8e7c3;text-shadow:0 2px 6px #000;outline:none}
.ts-chore .ts-kicker{color:#dfbb79}.ts-chore h1{font-size:clamp(22px,2.6vw,30px)}.ts-chore .ts-rule{margin:6px auto 0;color:#f0d8ad}
.ts-chore-stage{position:relative;height:150px;margin:6px auto;width:min(360px,100%)}
.ts-chore-meter{height:8px;margin:4px auto 6px;width:min(360px,100%);border:1px solid #b58a4b;border-radius:4px;background:#1c1711cc;overflow:hidden}
.ts-chore-meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c08a3e,#f3cf86);transition:width .2s ease-out}
.ts-chore .ts-status{min-height:1.4em;font-size:14px;color:#f3cf86}
.ts-chore-pads .ts-button{min-width:84px}
.ts-broom{position:absolute;left:50%;top:0;width:110px;height:120px;margin-left:-55px;transform-origin:50% 5%}
.ts-broom.ts-left{animation:ts-swing-l .28s ease-out}.ts-broom.ts-right{animation:ts-swing-r .28s ease-out}
@keyframes ts-swing-l{50%{transform:rotate(26deg)}}@keyframes ts-swing-r{50%{transform:rotate(-26deg)}}
.ts-pile{position:absolute;left:50%;bottom:0;width:180px;height:50px;margin-left:-90px;transition:transform .25s ease-out;transform-origin:50% 80%}
.ts-puff{position:absolute;bottom:14px;width:26px;height:16px;border-radius:50%;background:radial-gradient(#d8c8a8cc,transparent 70%);pointer-events:none;animation:ts-puff .7s ease-out forwards}
.ts-puff-left{left:22%}.ts-puff-right{right:22%}.ts-puff-shine{left:46%;bottom:60px;background:radial-gradient(#fff6d8,transparent 70%)}
@keyframes ts-puff{from{transform:scale(.4);opacity:1}to{transform:translateY(-34px) scale(1.8);opacity:0}}
.ts-cups{position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;gap:22px}
.ts-cup{width:40px;height:48px;cursor:pointer;transition:transform .45s cubic-bezier(.3,1.4,.5,1),opacity .45s}
.ts-cup.ts-taken{transform:translateY(-60px) rotate(-20deg);opacity:0;pointer-events:none}
.ts-board{position:absolute;left:50%;bottom:0;width:240px;height:90px;margin-left:-120px}.ts-stain{transition:opacity .3s}
.ts-rag{position:absolute;left:50%;bottom:28px;width:54px;height:40px;margin-left:-27px;opacity:0;transition:transform .2s ease-out,opacity .3s}
.ts-wiping .ts-rag{opacity:1}.ts-rag[data-q="1"]{transform:translate(0,-14px)}.ts-rag[data-q="2"]{transform:translate(30px,0)}
.ts-rag[data-q="3"]{transform:translate(0,12px)}.ts-rag[data-q="0"]{transform:translate(-30px,0)}
.ts-rag.ts-slip{animation:ts-slip .3s}@keyframes ts-slip{30%{margin-left:-35px}70%{margin-left:-19px}}
.ts-arrows{position:absolute;right:0;top:4px;display:flex;gap:4px;font-size:18px;color:#bfa57a}.ts-arrows .ts-next{color:#fff3c4;transform:scale(1.3)}
.ts-chore-stage.ts-clean::after{content:"✦";position:absolute;left:50%;top:30%;font-size:40px;color:#ffe9a8;animation:ts-puff .9s ease-out forwards}
@media(prefers-reduced-motion:reduce){.ts-orb{transition:none}.ts-point.ts-pouring .ts-orb svg,.ts-dose.ts-fresh,.ts-tray.ts-full .ts-dose-slots,.ts-broom,.ts-puff,.ts-rag.ts-slip,.ts-chore-stage.ts-clean::after{animation:none}}
`;
