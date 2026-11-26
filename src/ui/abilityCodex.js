// The spellbook's Abilities page. BUNNYFALL: laid out like the Spells page - a compact scrolling rail of every ability
// on the left, grouped and folded by skill, and the chosen ability on the right with its numbers and one-click hotbar
// slots. A rail row also drags onto the hotbar, or takes a slot key while pointed at, as a spell row does.
import { abilityIcon } from './abilityIcon.js';
import { t } from './textManager.js';
import { beginHotbarDrag, hotbarAcceptsDrops, takeHotbarDragClick } from './enhancedHotbar.js';
import { CAPSTONE_RECOVERY_MS } from '../combat/abilities/engine.js';
import { SKILL_NAMES, skillValue } from '../characters/skills.js';
import { raceByKey } from '../characters/races.js';
import { ABILITIES, PHYSICAL_SKILLS } from '../combat/abilities/registry.js';
import { learnedAbility } from '../combat/abilities/progress.js';
import { milestoneDelivery } from '../combat/abilities/milestones.js';
import { utilityProfile } from '../combat/abilities/utilityProfiles.js';
import { racialDelivery, racialKey, RACIAL_FAVORITES, RACIAL_TRAITS } from '../combat/abilities/racialProfiles.js';
import { combinationDelivery, combinationDescription } from '../combat/abilities/combinations.js';
import { meleeBeatMult, shotMult } from '../combat/abilities/damage.js';
import { buffRounds, ROUND_SECONDS, withBuffDuration } from '../combat/abilities/buffDuration.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { hotbarEntry, hotbarEntryForAbility, hotbarEntryForWeaponRank, setHotbarSlot } from '../items/quickslots.js';
import { activeAbilityWeapon } from '../combat/abilities/rig.js';

const styleNames = {
  'archers-axe': () => t('abilities.style.archersAxe', 'Archer’s Axe'),
  'light-flail': () => t('abilities.style.lightFlail', 'Light Flail'),
  crossbow: () => t('abilities.style.crossbow', 'Crossbow'),
  ballista: () => t('abilities.style.ballista', 'Royal Ballista'),
  'hand-to-hand': () => t('abilities.style.unarmed', 'Unarmed'),
};
const customStyleNames = { 513: styleNames['archers-axe'], 514: styleNames['light-flail'], 563: styleNames.crossbow };

// Persists across repaints of the book, so a pick or an assignment never moves the page.
const memory = { picked: null, open: new Set(), hand: 'weapon', learnedOnly: false, query: '', reveal: true };

export function resetAbilityCodex() {
  memory.query = '';
  memory.learnedOnly = false;
  memory.reveal = true;
}
export const revealAbilityPick = () => { memory.reveal = true; };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function abilityStatChips(ability, profile = null) {
  const delivery = withBuffDuration(ability, profile?.kind ? profile : milestoneDelivery(ability.id) ?? combinationDelivery(ability.id, null) ?? racialDelivery(ability.id));
  const chips = [];
  if (delivery?.spend != null) {
    chips.push([t('abilities.chip.cost', 'Cost'), delivery.kind === 'self'
      ? t('abilities.chip.costSelf', '{n} fatigue', { n: delivery.spend })
      : t('abilities.chip.costSwing', "{n} fatigue plus the swing's cost", { n: delivery.spend })]);
  }
  // Every timed buff an ability grants lasts the same rounds (src/combat/abilities/buffDuration.js).
  const timed = [].concat(delivery?.selfEffect ?? delivery?.crouchEffect ?? []).some(effect => effect?.rounds != null) || !!delivery?.accuracy
    || (!delivery?.kind && (profile?.rounds != null || !!profile?.effects?.some(effect => effect.rounds != null)));
  if (timed) {
    chips.push([t('abilities.chip.lasts', 'Lasts'), t('abilities.chip.lastsValue', '{rounds} magic rounds ({s} s)',
      { rounds: buffRounds(ability), s: buffRounds(ability) * ROUND_SECONDS })]);
  }
  const shield = [].concat(delivery?.selfEffect ?? []).find(effect => effect?.type === 35);
  if (shield) chips.push([t('abilities.chip.shield', 'Shield'), t('abilities.chip.shieldPoints', '{magnitude} points', { magnitude: shield.magnitude })]);
  const recovery = (delivery ?? profile)?.cooldownMs;
  if (recovery) chips.push([t('abilities.chip.recovers', 'Recovers'), t('abilities.chip.seconds', '{s} s', { s: Math.round(recovery / 100) / 10 })]);
  if (delivery?.kind === 'melee') {
    const beats = delivery.beats ?? 1;
    if (beats > 1) chips.push([t('abilities.chip.hits', 'Hits'), String(beats)]);
    const shares = Array.from({ length: beats }, (_, beat) => delivery.stages?.[beat]?.share ?? 1 / beats);
    const each = Math.min(...shares.map(share => meleeBeatMult(ability, delivery.potency, share)));
    // A capstone adds flat damage before the formula, so its share of a plain swing understates the hit.
    if (!delivery.capstone) {
      chips.push([beats > 1 ? t('abilities.chip.eachHit', 'Each hit') : t('abilities.chip.damage', 'Damage'),
        t('abilities.chip.timesSwing', '{x} times a plain swing', { x: each.toFixed(1) })]);
    }
    const advance = delivery.stages?.[0]?.advance ?? delivery.advance;
    if (advance) {
      chips.push([t('abilities.chip.moves', 'Moves'), advance.mech === 'leap' ? t('abilities.chip.leap', 'Leap')
        : advance.aim === 'side' ? t('abilities.chip.sideHop', 'Side hop') : t('abilities.chip.dash', 'Dash')]);
    }
  } else if (delivery?.kind === 'ranged') {
    const arrows = delivery.ammo ?? 1;
    chips.push([t('abilities.chip.arrows', 'Arrows'), String(arrows)]);
    if (!delivery.capstone) {
      chips.push([t('abilities.chip.eachArrow', 'Each arrow'),
        t('abilities.chip.timesShot', '{x} times a plain shot', { x: shotMult(ability, delivery.potency, arrows).toFixed(1) })]);
    }
  }
  return chips;
}

function catalog(entity) {
  const groups = [];
  const add = (label, kind, skill = null) => {
    const group = { label, kind, skill, items: [] };
    groups.push(group);
    return group;
  };
  const push = (group, ability, profile, sub = null) => {
    const kind = group.kind;
    const rank = kind === 'racial' ? t('abilities.racial', 'Racial') : t('abilities.rank', 'Rank {rank}', { rank: ability.rank });
    group.items.push({ ability, profile, sub, kind, rank, capstone: ability.rank === 100 && kind !== 'utility',
      learned: !!profile && learnedAbility(entity, ability.id), foreign: kind === 'racial' && ability.race !== racialKey(entity) });
  };
  const weaponsBySkill = new Map(PHYSICAL_SKILLS.map(skill => [skill, new Map()]));
  for (const ability of ABILITIES) {
    if (ability.category !== 'weapon') continue;
    const [, style] = ability.id.split('.');
    const weapons = weaponsBySkill.get(ability.skills[0]);
    if (!weapons.has(style)) weapons.set(style, []);
    weapons.get(style).push(ability);
  }
  for (const [skill, weapons] of weaponsBySkill) {
    const group = add(SKILL_NAMES[skill], 'weapon', skill);
    for (const [style, abilities] of weapons) {
      const name = styleNames[style]?.() ?? templateByIndex(abilities[0].templates[0])?.name ?? style;
      for (const ability of abilities) push(group, ability, milestoneDelivery(ability.id), name);
    }
  }
  const combinations = add(t('abilities.group.combinations', 'Combinations'), 'combination');
  for (const ability of ABILITIES) {
    if (ability.category !== 'combination') continue;
    const text = combinationDescription(ability.id);
    const active = activeAbilityWeapon(entity);
    const template = ability.templates.find(value => value !== 'bare');
    const weapon = ability.templates.includes(active?.templateIndex ?? 'bare') ? active : { templateIndex: template };
    push(combinations, ability, text ? { ...combinationDelivery(ability.id, weapon), description: text } : null,
      ability.skills.map(id => SKILL_NAMES[id]).join(' + '));
  }
  const racial = add(t('abilities.group.racial', 'Racial abilities'), 'racial');
  for (const ability of ABILITIES) {
    if (ability.category !== 'racial') continue;
    const favorites = RACIAL_FAVORITES[ability.race].map(id =>
      id === 'bare' ? styleNames['hand-to-hand']() : customStyleNames[id]?.() ?? templateByIndex(id)?.name);
    const trait = RACIAL_TRAITS[ability.race];
    push(racial, ability, { ...racialDelivery(ability.id), description: [
      t('abilities.racial.active', 'Active: {text}', { text: racialDelivery(ability.id).description }),
      t('abilities.racial.passive', 'Passive: {weapons} gain 4 weapon accuracy at half health or higher.',
        { weapons: favorites.join(t('abilities.and', ' and ')) }),
      trait.passive + (trait.passive.endsWith('.') ? '' : '.'),
      trait.movement,
    ].join(' ') }, raceByKey(ability.race)?.name ?? ability.race);
  }
  const utilities = add(t('abilities.group.utilities', 'Universal utilities'), 'utility');
  for (const ability of ABILITIES) if (utilityProfile(ability.id)) push(utilities, ability, utilityProfile(ability.id));
  return groups;
}

/** The hotbar entry a row binds by default: a weapon rank follows the hand, everything else is itself. */
function entryFor(item, hand = memory.hand) {
  return item.kind === 'weapon' && hand !== 'manual'
    ? hotbarEntryForWeaponRank(item.ability.rank) : hotbarEntryForAbility(item.ability.id);
}

const sameEntry = (held, entry) => !!held && held.type === entry.type && (entry.id ? held.id === entry.id : held.key === entry.key);

export function buildAbilityCodex(entity, size) {
  const groups = catalog(entity);
  const all = groups.flatMap(group => group.items);
  const playable = all.filter(item => item.profile && !item.foreign);
  const learnedCount = playable.filter(item => item.learned).length;
  let picked = all.find(item => item.ability.id === memory.picked)
    ?? all.find(item => item.learned && item.kind === 'racial') ?? all.find(item => item.learned) ?? all[0];
  if (!memory.open.size) {
    const home = groups.find(group => group.items.includes(picked));
    if (home) memory.open.add(home.label);
  }

  const panel = element('div', null, 'sb-abilities px-journal');
  panel.setAttribute('aria-label', t('abilities.page', 'Abilities'));
  const rail = element('div', null, 'px-qrail sb-ability-rail');
  const detail = element('div', null, 'px-qdetail sb-ability-detail');

  // The rail's head: the count, the search and the learned filter, kept above the scrolling list.
  const head = element('div', null, 'sb-rail-head');
  const count = element('span', t('abilities.learnedCount', '{n} / {total} learned', { n: learnedCount, total: playable.length }),
    'sb-rail-count');
  const learnedOnly = element('button', t('abilities.filter.learned', 'Learned'), 'act sb-filter');
  learnedOnly.type = 'button';
  learnedOnly.setAttribute('aria-pressed', String(memory.learnedOnly));
  learnedOnly.title = t('abilities.filter.learnedTip', 'Show only the abilities you have learned');
  const search = element('input', null, 'sb-ability-search');
  search.type = 'search';
  search.placeholder = t('abilities.search', 'Find an ability or weapon');
  search.setAttribute('aria-label', search.placeholder);
  search.value = memory.query;
  const top = element('div', null, 'sb-rail-top');
  top.append(count, learnedOnly);
  head.append(top, search);
  const list = element('div', null, 'sb-rail-list');
  const empty = element('p', t('abilities.search.none', 'No matching abilities.'), 'px-note');
  empty.hidden = true;
  rail.append(head, list);
  list.append(empty);

  const rows = [];
  const folds = [];
  for (const group of groups) {
    const fold = element('details', null, 'sb-fold');
    fold.open = memory.open.has(group.label);
    fold.addEventListener('toggle', () => {
      if (fold.open) memory.open.add(group.label);
      else memory.open.delete(group.label);
    });
    const summary = element('summary', null, 'sb-fold-head');
    const learned = group.items.filter(item => item.learned).length;
    const total = group.items.filter(item => item.profile && !item.foreign).length;
    summary.append(element('span', group.label, 'sb-fold-name'), element('span', learned + '/' + total, 'sb-fold-count'));
    if (group.skill != null) summary.title = SKILL_NAMES[group.skill] + ' ' + Math.round(skillValue(entity, group.skill));
    fold.append(summary);
    let sub = null;
    const groupRows = [];
    for (const item of group.items) {
      if (item.sub && item.sub !== sub && group.kind !== 'racial') {
        sub = item.sub;
        const label = element('div', sub, 'sb-fold-sub');
        fold.append(label);
        groupRows.push({ label, sub });
      }
      const row = element('button', null, 'sb-arow');
      row.type = 'button';
      row.classList.toggle('on', item === picked);
      row.classList.toggle('sb-locked', !item.learned);
      row.classList.toggle('sb-capstone', item.capstone);
      const icon = element('img', null, 'sb-arow-icon');
      icon.src = abilityIcon(item.ability.id);
      icon.alt = '';
      icon.draggable = false;
      row.append(icon, element('span', item.ability.name, 'sb-arow-name'),
        element('span', item.kind === 'racial' ? item.sub : String(item.ability.rank), 'sb-arow-rank'));
      if (item.learned) {
        Object.defineProperty(row, '_hotbarEntry', { get: () => entryFor(item) });
        row.onpointerdown = (e) => {
          if (!hotbarAcceptsDrops()) return;
          beginHotbarDrag(e, { kind: 'entry', entry: entryFor(item) }, { iconSrc: icon.src, label: item.ability.name });
        };
      }
      row.onclick = () => {
        if (takeHotbarDragClick()) return;
        picked = item;
        memory.picked = item.ability.id;
        for (const other of rows) other.row.classList.toggle('on', other.item === item);
        showDetail();
      };
      fold.append(row);
      const entry = { row, item, group, sub: item.sub, fold };
      rows.push(entry);
      groupRows.push(entry);
    }
    list.append(fold);
    folds.push({ fold, group, groupRows });
  }

  function filter() {
    const terms = memory.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let any = false;
    for (const { fold, group, groupRows } of folds) {
      let shown = 0;
      const subsShown = new Set();
      for (const entry of groupRows) {
        if (!entry.row) continue;
        const text = [group.label, entry.sub, entry.item.ability.name, entry.item.rank].join(' ').toLowerCase();
        entry.row.hidden = (memory.learnedOnly && !entry.item.learned) || !terms.every(term => text.includes(term));
        if (!entry.row.hidden) { shown++; subsShown.add(entry.sub); }
      }
      for (const entry of groupRows) if (entry.label) entry.label.hidden = !subsShown.has(entry.sub);
      fold.hidden = !shown;
      if (terms.length && shown) fold.open = true;
      any ||= shown > 0;
    }
    empty.hidden = any;
  }
  search.addEventListener('input', () => { memory.query = search.value; filter(); });
  learnedOnly.addEventListener('click', () => {
    memory.learnedOnly = !memory.learnedOnly;
    learnedOnly.setAttribute('aria-pressed', String(memory.learnedOnly));
    filter();
  });
  filter();

  function showDetail() {
    const item = picked;
    detail.replaceChildren();
    if (!item) return;
    const { ability, profile, kind } = item;
    const title = element('div', null, 'sb-adetail-head');
    const icon = element('img', null, 'sb-adetail-icon');
    icon.src = abilityIcon(ability.id);
    icon.alt = '';
    const words = element('div', null, 'sb-adetail-words');
    words.append(element('h3', ability.name), element('p', [
      kind === 'combination' ? t('abilities.kind.combination', 'Combination') : null,
      kind === 'racial' ? t('abilities.kind.racial', 'Racial ability') : item.rank,
      item.sub && kind !== 'racial' ? item.sub : null,
      item.capstone ? t('abilities.kind.capstone', 'Capstone') : null,
    ].filter(Boolean).join(' · '), 'sb-adetail-kind'));
    title.append(icon, words);
    detail.append(title);
    const skills = kind === 'utility' ? t('abilities.lock.anySkill', 'any weapon skill or Hand-to-Hand')
      : ability.skills.map(id => SKILL_NAMES[id]).join(t('abilities.and', ' and '));
    const lock = !profile ? t('abilities.lock.planned', 'Not available yet.')
      : item.foreign ? t('abilities.lock.race', 'Only for {race}.', { race: raceByKey(ability.race)?.name ?? ability.race })
        : ability.rank ? t('abilities.lock.reach', 'Not learned yet: reach {rank} in {skills}.', { rank: ability.rank, skills })
          : t('abilities.lock.locked', 'Not learned yet.');
    if (!item.learned) detail.append(element('p', lock, 'sb-adetail-lock'));
    const chips = abilityStatChips(ability, profile);
    if (chips.length) {
      const grid = element('dl', null, 'sb-adetail-chips');
      for (const [label, value] of chips) {
        const chip = element('div', null, 'sb-achip');
        chip.append(element('dt', label), element('dd', value));
        grid.append(chip);
      }
      detail.append(grid);
    }
    let text = profile?.description ?? '';
    if (profile?.weakPointBonus) text += ' ' + t('abilities.text.weakPoint', 'A weak point is a hit in the top 22% of the enemy’s height.');
    if (profile?.counterBonus) text += ' ' + t('abilities.text.counter', 'Counter during an enemy wind-up or its overreach after an attack.');
    if (item.capstone && (kind === 'weapon' || kind === 'combination')) {
      text += ' ' + t('abilities.text.capstoneWait', 'Using any capstone makes every capstone wait {s} seconds.',
        { s: CAPSTONE_RECOVERY_MS / 1000 });
    }
    if (text) detail.append(element('p', text, 'sb-adetail-text'));
    if (!item.learned) return;

    const bind = element('div', null, 'sb-bind');
    if (kind === 'weapon') {
      const hands = element('div', null, 'sb-hands');
      hands.setAttribute('role', 'group');
      hands.setAttribute('aria-label', t('abilities.bind', 'Binding'));
      for (const [hand, label] of [['weapon', t('abilities.bind.follow', 'Follow active weapon · Rank {rank}', { rank: ability.rank })],
        ['manual', t('abilities.bind.this', 'This ability')]]) {
        const button = element('button', label, 'act sb-hand');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(memory.hand === hand));
        button.onclick = () => {
          memory.hand = hand;
          showDetail();
          detail.querySelector?.('.sb-hand[data-hand="' + hand + '"]')?.focus?.();
        };
        button.dataset.hand = hand;
        hands.append(button);
      }
      bind.append(hands);
      bind.append(element('p', memory.hand === 'manual' ? t('abilities.bind.thisNote', 'The slot always uses this ability.')
        : t('abilities.bind.followNote', 'The slot uses the rank {rank} ability of whatever weapon you hold.', { rank: ability.rank }),
      'sb-bind-note'));
    }
    const entry = entryFor(item);
    const slots = element('div', null, 'sb-slots');
    slots.setAttribute('role', 'group');
    slots.setAttribute('aria-label', t('abilities.slots', 'Put on hotbar slot'));
    slots.style.setProperty('--cols', String(size > 6 ? Math.ceil(size / 2) : size));
    const status = element('p', null, 'sb-bind-status');
    status.setAttribute('role', 'status');
    const label = element('p', t('abilities.slots.label', 'Put on the hotbar'), 'sb-slots-label');
    const paintSlots = () => {
      slots.replaceChildren();
      for (let i = 0; i < size; i++) {
        const held = hotbarEntry(i);
        const here = sameEntry(held, entry);
        const button = element('button', null, 'act sb-slotkey');
        button.type = 'button';
        button.append(element('span', String(i + 1), 'sb-slotnum'));
        const heldIcon = held?.type === 'ability' ? abilityIcon(held.id) : '';
        if (heldIcon) {
          const img = element('img', null, 'sb-slotimg');
          img.src = heldIcon;
          img.alt = '';
          button.append(img);
        } else if (held) button.append(element('span', held.type === 'weapon-rank' ? t('abilities.slot.rankMark', 'R{rank}', { rank: held.rank }) : held.name.slice(0, 2), 'sb-slotmark'));
        button.classList.toggle('on', here);
        button.classList.toggle('full', !!held && !here);
        button.title = here ? t('abilities.slot.here', 'Already here')
          : held ? t('abilities.slot.replace', 'Replace {name}', { name: held.name }) : t('abilities.slot.empty', 'Empty');
        button.onclick = () => {
          if (here || !setHotbarSlot(i, entry)) return;
          status.textContent = t('abilities.slot.done', '{name} is on slot {n}.', { name: entry.name, n: i + 1 });
          paintSlots();
          slots.children[i]?.focus?.();
        };
        slots.append(button);
      }
    };
    paintSlots();
    bind.append(label, slots, status);
    detail.append(bind);
  }
  showDetail();

  panel.append(rail, detail);
  if (memory.reveal) {
    memory.reveal = false;
    requestAnimationFrame?.(() => rows.find(entry => entry.item === picked)?.row.scrollIntoView?.({ block: 'nearest' }));
  }
  return panel;
}
