// Counts what the NPC body lanes cost over a busy street of stub rigs, at the Near and All tiers.
// Usage: node tools/mwNpcLaneProbe.mjs.
import { createPopulationLane, createNpcBodies, createFrameBudget, NPC_BODY_TIERS, WATCH_BODY_TIERS, NPC_FRAME_TIERS } from '../src/characters/npcBodies.js';
import { isMain } from './lib/isMain.mjs';

const flush = () => new Promise((r) => setTimeout(r, 0));
const LOOK_RACES = Object.freeze(['Breton', 'Redguard', 'Nord', 'DarkElf', 'HighElf', 'WoodElf', 'Khajiit', 'Argonian']);
export const STREET = Object.freeze([
  ['foe', 10, NPC_BODY_TIERS], ['watch', 5, WATCH_BODY_TIERS], ['folk', 48, NPC_BODY_TIERS], ['people', 24, NPC_BODY_TIERS],
  ['siege', 16, NPC_BODY_TIERS], ['crew', 12, NPC_BODY_TIERS], ['roads', 8, NPC_BODY_TIERS],
]);

const rigOf = (c) => () => {
  const r = { mode: 'first', skinned: false,
    attach() {}, async build() { c.builds++; await flush(); return { ok: true }; },
    canThirdPerson: () => true, raceHeightScale: () => 1, setViewMode(m) { r.mode = m; return true; },
    thirdActive: () => r.mode === 'third' && r.skinned,
    update(dt, o) { if (o?.pose !== false) { r.skinned = true; c.skins++; } },
    drawThird() { c.draws++; return r.thirdActive(); }, unload() {}, setSheathed() {}, revive() {} };
  return r;
};

export async function runStreet(tier, shared, { frames = 600, warm = 120, walk = false } = {}) {
  const c = { skins: 0, draws: 0, builds: 0, binds: 0 };
  let t = 0;
  const budget = shared ? createFrameBudget() : null;
  let drawsAtBegin = 0;
  const renderer = { beginCharacterSpriteBatch() { drawsAtBegin = c.draws; }, flushCharacterSpriteBatch() { if (c.draws > drawsAtBegin) c.binds++; } };
  const lanes = STREET.map(([name, n, tiers], k) => {
    const lane = createPopulationLane({ laneName: name, renderer, want: () => true,
      make: () => createNpcBodies({ renderer, tier: () => tier, tiers, createRig: rigOf(c), now: () => t, budget, frameTiers: NPC_FRAME_TIERS }) });
    const actors = Array.from({ length: n }, (_, i) => {
      const r = 2 + ((i * 37 + k * 11) % 68) + 0.37 * k + 0.013 * i, a0 = (i * 2.399 + k) % (Math.PI * 2), w = 0.05 + ((i + k) % 7) * 0.02;
      const look = walk ? { race: LOOK_RACES[(i + k) % LOOK_RACES.length], gender: i % 2 ? 'female' : 'male', faceIndex: (i * 3 + k) % 10, items: [] } : { race: 'Breton', gender: 'male', faceIndex: 0, items: [] };
      return { r, a0, w, amp: walk ? Math.min(r - 1, 12 + (i % 5) * 4) : 0, wr: 0.08 + ((i * 7 + k) % 5) * 0.03, actor: { id: i, look, feet: [0, 0, 0], yaw: 0, moving: true, drawn: false } };
    });
    return { lane, actors, batches: actors.map(() => ({ castOnly: false })) };
  });
  let standing = 0, builtAtWarm = 0;
  for (let f = 0; f < warm + frames; f++) {
    if (f === warm) { c.skins = 0; c.draws = 0; c.binds = 0; standing = 0; builtAtWarm = c.builds; }
    for (const L of lanes) {
      L.lane.frame();
      L.actors.forEach((s, i) => {
        const a = s.a0 + s.w * t / 1000, r = s.r + s.amp * Math.sin(s.a0 + s.wr * t / 1000);
        s.actor.feet[0] = Math.sin(a) * r; s.actor.feet[2] = Math.cos(a) * r; s.actor.yaw = a + Math.PI / 2;
        L.lane.offer(s.actor, L.batches[i]);
      });
      L.lane.draw({}, null, null, [0, 0, 0], 1 / 60);
      if (f >= warm) for (const s of L.actors) if (L.lane.has(s.actor.id)) standing++;
    }
    t += 1000 / 60;
    await flush();
  }
  for (const L of lanes) L.lane.destroy();
  return { tier, shared, bodies: standing / frames, skins: c.skins / frames, draws: c.draws / frames, binds: c.binds / frames, builds: c.builds,
    buildsPerMin: ((c.builds - builtAtWarm) / frames) * 60 * 60 };
}

if (isMain(import.meta.url)) {
  console.log(`\nTHE NPC LANES - a port's street in a siege with a party on the road (${STREET.map(([n, k]) => `${n} ${k}`).join(', ')}), 600 frames walking round the eye 2..70 m out; stub rigs, exact counts\n`);
  console.log('tier   lanes            bodies/frame   skins/frame   draws/frame   binds/frame   rigs built');
  for (const tier of ['near', 'all']) {
    for (const shared of [false, true]) {
      const r = await runStreet(tier, shared);
      console.log(`${tier.padEnd(6)} ${(shared ? 'one budget' : 'each alone').padEnd(16)} ${r.bodies.toFixed(1).padStart(12)}   ${r.skins.toFixed(2).padStart(11)}   ${r.draws.toFixed(1).padStart(11)}   ${r.binds.toFixed(2).padStart(11)}   ${String(r.builds).padStart(10)}`);
    }
  }
  console.log(`\nthe budget: near ${NPC_FRAME_TIERS.near.bodies} bodies / ${NPC_FRAME_TIERS.near.skins} skins, all ${NPC_FRAME_TIERS.all.bodies} / ${NPC_FRAME_TIERS.all.skins}`);
  console.log('\nTHE CHURN (AUDIT MW-NPC II L5) - the same street, each actor also walking in and out across the cut, each in its own look');
  console.log('tier   lanes            bodies/frame   skins/frame   rigs built a minute');
  for (const tier of ['near', 'all']) {
    for (const shared of [false, true]) {
      const r = await runStreet(tier, shared, { walk: true, frames: 1800 });
      console.log(`${tier.padEnd(6)} ${(shared ? 'one budget' : 'each alone').padEnd(16)} ${r.bodies.toFixed(1).padStart(12)}   ${r.skins.toFixed(2).padStart(11)}   ${r.buildsPerMin.toFixed(0).padStart(19)}`);
    }
  }
}
