const pilot = new Map([
  ['utility.trailblazer', { effect: 9, subType: 6, rounds: 6, magnitude: 12, safePace: true,
    description: 'Gain 12 Speed for travel when no enemy is nearby.' }],
  ['utility.unbound-will', { cooldownMs: 60000, effect: 26, rounds: 4, description: 'Move through paralysis and resist it, using the Free Action effect. Recovers in 60 seconds.' }],
  ['utility.featherstep', { cooldownMs: 45000, effect: 25, rounds: 5, description: 'Slow your descent and protect yourself from falls with Slowfall. Recovers in 45 seconds.' }],
  ['utility.wayfarers-anchor-mark', { cooldownMs: 60000, travel: 'mark', description: 'Set a Wayfarer’s Anchor where you stand and leave a lit lantern on the ground to mark it. Recovers in 60 seconds.' }],
  ['utility.wayfarers-anchor-recall', { cooldownMs: 120000, travel: 'recall', description: 'Return to your Wayfarer’s Anchor lantern and consume it on arrival. Recovers in 120 seconds.' }],
  ['utility.hunters-awareness', { effect: 39, subType: 1, rounds: 5, description: 'Track nearby hostile creatures with Detect Enemies.' }],
  ['utility.deepwater-training', { effect: 30, rounds: 8, description: 'Breathe underwater with the Water Breathing effect.' }],
  ['utility.riverstride', { effect: 31, rounds: 6, description: 'Walk across the water’s surface with Water Walking.' }],
  ['utility.breakaway', { effects: [{ effect: 9, subType: 6, rounds: 1, magnitude: 18 }, { effect: 23, subType: 0, rounds: 1 }],
    cooldownMs: 22000, description: 'Gain 18 Speed and blend into your surroundings to escape. Recovers in 22 seconds.' }],
  ['utility.field-antidote', { effect: 3, subType: 1, description: 'Remove active poisons with the Cure Poison effect.' }],
  ['utility.lockbreaker', { effect: 17, description: 'Arm Open for the next eligible lock you activate. The normal lock and quest rules apply.' }],
]);

export const utilityProfile = id => pilot.get(id) ?? null;
