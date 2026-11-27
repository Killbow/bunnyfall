const looks = new Map();
function family(material, entries) {
  for (const [action, form] of Object.entries(entries)) looks.set(action, { material, form });
}
family('shadow', { 'veil-cut':'crescent', 'kidney-step':'dash', 'marked-for-silence':'mark', nightfall:'claw',
  'silent-draw':'needle', 'vanishing-sheath':'veil', 'fatal-opening':'mark', 'one-perfect-stroke':'horizon',
  blackjack:'crack', 'silent-verdict':'needle', 'hidden-relay':'mark', 'vanishing-execution':'claw',
  'phantom-grip':'ward', 'dance-of-shadows':'braid', 'ghost-volley':'fan', 'shadow-pin':'mark', 'midnight-rain':'rain' });
family('gold', { 'battle-prayer':'halo', 'edge-ritual':'helix', 'shared-resolve':'ward', 'hundredfold-blessing':'crown',
  'measured-cut':'crescent', 'adaptive-guard':'ward', 'champions-answer':'fan', 'perfect-form':'crown',
  'iron-verdict':'crack', 'judgement-bastion':'ward', 'consecrated-break':'halo', 'hallowed-barrage':'rain',
  'commanders-call':'crown', 'sword-song':'braid', 'perfect-focus':'eye', 'lockbreaker':'key' });
family('steel', { 'extended-thrust':'helix', 'keep-away':'fan', 'piercing-line':'needle', 'kings-measure':'crown',
  'quickstep-slash':'dash', 'vaulting-riposte':'vault', 'dancing-route':'braid', 'untouchable-waltz':'orbit',
  'blade-weave':'braid', 'thousand-cuts':'claw', 'deadeye-bolt':'eye', 'anchored-sight':'ward',
  'armor-needle':'needle', 'final-verdict':'helix', 'wardbreaker':'fracture' });
family('moon', { crosscut:'cross', 'twin-guard':'ward', 'mirrored-tempo':'braid', 'two-moon-dance':'orbit',
  'flowing-pursuit':'dash', 'crescent-current':'crescent', 'moonlit-torrent':'helix', 'iai-cut':'horizon',
  'iron-draw':'needle', 'falling-moon':'vault', 'execution-stance':'mark', 'heaven-splitting-draw':'fracture',
  'double-lash':'braid', 'chain-flicker':'lash', 'storm-of-links':'orbit', 'silver-tempest':'crown' });
family('stone', { 'wayfarers-anchor-mark':'anchor', 'wayfarers-anchor-recall':'return', 'wide-arc':'crescent', earthwheel:'orbit', 'reaping-circle':'halo', greatstorm:'cyclone',
  'brace-and-hew':'cross', 'iron-root':'roots', 'guardians-break':'fracture', mountainfall:'crack',
  'crack-plate':'fracture', 'hammer-the-gap':'needle', 'crushing-verdict':'crack', 'shatter-dominion':'roots',
  skullsplitter:'fracture', 'hammer-drop':'crack', faultline:'roots', bonebreaker:'cross', worldbreaker:'fracture',
  'siege-stance':'ward', earthsplitter:'roots', 'siege-bolt':'helix', 'anchor-and-fire':'ward',
  linebreaker:'needle', 'siege-of-heaven':'rain', 'titans-hands':'crack' });
family('ember', { 'hunters-hook':'lash', 'blood-trail':'dash', 'relentless-pursuit':'claw', 'no-escape':'mark',
  'raking-chain':'lash', 'rolling-links':'orbit', 'blood-spiral':'helix', 'crimson-cyclone':'cyclone',
  'warlords-breach':'fracture', 'rallying-ruin':'crown', 'open-vein':'crescent', 'gutting-pursuit':'claw',
  'savage-entry':'dash', bloodstorm:'rain', ashstep:'veil', 'foxfire-feint':'orbit' });
family('leaf', { 'quick-draw-cleave':'cross', 'arrow-to-axe':'needle', 'split-pursuit':'braid', 'huntsmans-relay':'mark',
  'staff-jab':'needle', 'sweeping-ward':'halo', 'vault-strike':'vault', 'circle-of-the-master':'orbit',
  'quiet-shot':'needle', 'power-draw':'helix', 'broadhead-barrage':'fan', 'eagles-rhythm':'feather', skyfall:'rain',
  'hunting-line':'mark', 'predators-crossing':'cross', 'hunters-exchange':'braid', 'felling-volley':'fan',
  'forest-ambush':'claw', trailblazer:'step', 'hunters-awareness':'eye', 'field-antidote':'roots' });
family('wind', { 'jab-chain':'braid', 'shoulder-break':'fracture', 'flow-state':'orbit', 'hundred-fist-ascension':'cyclone',
  'reversal-step':'dash', 'cyclone-form':'cyclone', 'knockout-chain':'cross', 'windstep-shot':'feather', stormrunner:'dash',
  'predators-pounce':'claw', harebound:'vault', featherstep:'feather', breakaway:'veil' });
family('tide', { 'frostborn-charge':'fracture', 'marsh-coil':'helix', 'unbound-will':'fracture',
  'deepwater-training':'bubbles', riverstride:'step' });

const finishes = {
  'fatal-opening':'cross', 'shadow-pin':'roots', 'hidden-relay':'needle', 'vanishing-execution':'veil',
  'consecrated-break':'fracture', 'adaptive-guard':'crescent', 'judgement-bastion':'crown',
  'perfect-form':'eye', 'commanders-call':'halo', 'blade-weave':'cross', 'double-lash':'lash',
  'storm-of-links':'cyclone', 'silent-verdict':'mark', 'final-verdict':'eye', 'armor-needle':'fracture',
  'raking-chain':'claw', 'savage-entry':'crack', 'gutting-pursuit':'dash', 'predators-crossing':'mark',
  'staff-jab':'halo', 'quiet-shot':'veil', 'hunters-exchange':'fan', 'hunting-line':'needle',
  bonebreaker:'fracture', 'shatter-dominion':'crown', faultline:'crack', earthsplitter:'fan',
  'crack-plate':'mark', worldbreaker:'halo', 'crushing-verdict':'mark', 'hammer-drop':'vault',
  'titans-hands':'cross', linebreaker:'fan', 'foxfire-feint':'veil', 'felling-volley':'roots',
  'siege-stance':'roots', 'cyclone-form':'orbit', stormrunner:'helix',
  featherstep:'step', 'unbound-will':'ward',
};
for (const [action, finish] of Object.entries(finishes)) looks.get(action).finish = finish;

export const abilityArt = id => looks.get(id?.split('.').at(-1));

export function showAbilityArt(door, id, phase, at, options = {}) {
  if (!door?.fx || !at) return;
  const art = abilityArt(id);
  if (!art) return;
  door.fx('ability-art', at, { ...options, phase, form: art.form, material: art.material });
  if (art.finish && (phase === 'impact' || phase === 'self')) {
    door.fx('ability-art', at, { ...options, phase: 'finish', form: art.finish, material: art.material });
  }
}
