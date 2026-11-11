// The four worked examples from the World Builder spec as one v2 document, built on the game's real ids.
// The tests use it, and the editor probe can load it later. Template numbers come from itemTemplates.js (Red Berries 16,
// Troll's Blood 42, Iron 71, Copper 72, Elixir Vitae 62); foes are class enemies 136 (Rogue), 141 (Archer), 143 (Barbarian).
// Arch3d model 1 stands for any model the catalogue holds: the law only checks the number's range.

const part = (key, name, extra = {}) => ({ key, name, arch3d: 1, t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true, ...extra });
const npc = (key, name, t, extra = {}) => ({ key, name, t, yaw: 0, h: 1.8, look: { k: 'df', a: 182, r: 0 }, lines: [], ...extra });

export function poiV2Example() {
  return {
    v: 2,
    id: 'poi-0123456789ab',
    name: 'Bridge Market',
    about: 'A market, a bridge and a guard post.',
    tags: ['market', 'example'],
    place: { px: 500, py: 250, x: 100, z: 100, y: 0, ground: 'snap', r: [0, 0, 0, 1], s: 1 },
    groups: [{ key: 'market', name: 'Market', parent: null, visible: true, locked: false }, { key: 'bridge', name: 'Bridge', parent: null, visible: true, locked: false }],
    parts: [part('stall', 'Stall', { group: 'market' }), part('span', 'Bridge span', { group: 'bridge', t: [40, 0, 0] })],
    npcs: [
      npc('merchant', 'Wandering Merchant', [0, 0, 0], { route: 'patrol', group: 'market' }),
      npc('captain', 'Guard Captain', [20, 0, 5], { dialogue: 'captain', radius: 4 }),
      npc('nyra', 'Alchemist Nyra', [5, 0, 10], { trade: 'nyra', lines: ['Bring me what I ask for.'] }),
      npc('supplier', 'Supply Merchant', [8, 0, 12]),
    ],
    routes: [{
      key: 'patrol', name: 'Merchant Patrol', mode: 'loop',
      waypoints: [
        { key: 'entrance', name: 'Market Entrance', t: [0, 0, 0], radius: 1.5, waitS: 15 },
        { key: 'square', name: 'Market Square', t: [10, 0, 10], radius: 1.5, waitS: 15 },
        { key: 'tavern', name: 'Tavern', t: [20, 0, 10], radius: 1.5, waitS: 15 },
        { key: 'entrance-end', name: 'Market Entrance', t: [0, 0, 0], radius: 1.5, waitS: 15 },
      ],
    }],
    variables: [
      { key: 'supplies_delivered', name: 'Supplies delivered', type: 'boolean', scope: 'character', initial: false },
      { key: 'bridge_unlocked', name: 'Bridge unlocked', type: 'boolean', scope: 'poi_global', initial: false },
    ],
    interactives: [
      { key: 'gate', name: 'Bridge gate', kind: 'door', appearance: { k: 'part', key: 'span' }, t: [40, 0, 0], yaw: 0, radius: 3, state: 'locked' },
      { key: 'ambush-zone', name: 'Ambush zone', kind: 'trigger', appearance: { k: 'none' }, t: [30, 0, 0], yaw: 0, radius: 12, state: 'active' },
    ],
    encounters: [{
      key: 'ambush', name: 'Ambush at the Bridge', center: [35, 0, 0], radius: 20, aggression: 'hostile', respawn: 'never',
      spawns: [
        { key: 'bandits', foe: 136, count: 3, at: [35, 0, 2], spread: 4 },
        { key: 'archer', foe: 141, count: 1, at: [38, 0, 4], spread: 1 },
        { key: 'leader', foe: 143, count: 1, at: [36, 0, 6], spread: 1 },
      ],
      complete: { rule: 'all_dead' }, onComplete: 'ambush-done',
    }],
    trades: [
      { key: 'nyra', name: 'Nyra\'s brew', recipes: [{
        key: 'brew', name: 'Brew an elixir',
        requireItems: [{ template: 16, count: 5 }, { template: 42, count: 2 }], requireGold: 0,
        rewardItems: [{ template: 62, count: 1 }], rewardGold: 0, limitMode: 'unlimited',
      }] },
      { key: 'supplies', name: 'Supply delivery', recipes: [{
        key: 'delivery', name: 'Deliver the supplies',
        requireItems: [{ template: 71, count: 10 }, { template: 72, count: 5 }], requireGold: 0,
        rewardItems: [], rewardGold: 250, limitMode: 'once_per_char', onSuccessEvent: 'supplies-done',
      }] },
    ],
    dialogues: [{
      key: 'captain', name: 'Guard Captain', start: 'root',
      nodes: [
        { key: 'root', say: 'Halt. State your business.', options: [
          { text: 'What happened here?', then: { k: 'goto', node: 'story' } },
          { text: 'I have brought the supplies.', then: { k: 'run_trade_recipe', trade: 'supplies', recipe: 'delivery' } },
          { text: 'I want to leave.', then: { k: 'close' } },
        ] },
        { key: 'story', say: 'Bandits took the bridge last week.', options: [
          { text: 'Go back.', then: { k: 'goto', node: 'root' } },
          { text: 'I want to leave.', then: { k: 'close' } },
        ] },
      ],
    }],
    events: [
      { key: 'ambush-start', name: 'Ambush starts', trigger: { k: 'enter_area', interactive: 'ambush-zone' }, then: [{ k: 'start_encounter', encounter: 'ambush' }] },
      { key: 'ambush-done', name: 'Ambush ends', trigger: { k: 'chained' }, then: [
        { k: 'say', text: 'The bridge is clear.' }, { k: 'set_state', interactive: 'gate', state: 'open' }, { k: 'set_var', var: 'bridge_unlocked', to: true },
      ] },
      { key: 'supplies-done', name: 'Supplies delivered', trigger: { k: 'chained' }, then: [{ k: 'set_var', var: 'supplies_delivered', to: true }, { k: 'say', text: 'Thank you. That is the last of them.' }] },
      { key: 'supplier-talk', name: 'Supply Merchant talks', trigger: { k: 'npc_talk', npc: 'supplier' },
        when: { k: 'all', of: [{ k: 'has_item', item: { template: 71, count: 10 } }, { k: 'has_item', item: { template: 72, count: 5 } }] },
        then: [{ k: 'open_trade', trade: 'supplies' }], else: [{ k: 'say', text: 'You are still missing supplies.' }] },
    ],
    marker: { show: true, label: 'Bridge Market' },
  };
}
