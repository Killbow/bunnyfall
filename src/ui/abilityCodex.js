// The spellbook's Abilities page. BUNNYFALL: laid out like the Spells page - a compact scrolling rail of every ability
// on the left, grouped and folded by skill, and the chosen ability on the right with its numbers and one-click hotbar
// slots. A rail row also drags onto the hotbar, or takes a slot key while pointed at, as a spell row does.
import { abilityIcon } from './abilityIcon.js';
import { beginHotbarDrag, hotbarAcceptsDrops, takeHotbarDragClick } from './enhancedHotbar.js';
import { CAPSTONE_RECOVERY_MS } from '../combat/abilities/engine.js';
import { SKILL_NAMES, skillValue } from '../characters/skills.js';
import { raceByKey } from '../characters/races.js';
import { ABILITIES, PHYSICAL_SKILLS } from '../combat/abilities/registry.js';
import { learnedAbility } from '../combat/abilities/progress.js';
import { milestoneDelivery } from '../combat/abilities/milestones.js';
import { utilityProfile } from '../combat/abilities/utilityProfiles.js';
import { racialDelivery, RACIAL_FAVORITES, RACIAL_TRAITS } from '../combat/abilities/racialProfiles.js';
import { combinationDelivery, combinationDescription } from '../combat/abilities/combinations.js';
import { meleeBeatMult, shotMult } from '../combat/abilities/damage.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { hotbarEntry, hotbarEntryForAbility, hotbarEntryForWeaponRank, setHotbarSlot } from '../items/quickslots.js';
import { activeAbilityWeapon } from '../combat/abilities/rig.js';

const styleNames = {
  'archers-axe': 'Archer’s Axe',
  'light-flail': 'Light Flail',
  crossbow: 'Crossbow',
  ballista: 'Royal Ballista',
  'hand-to-hand': 'Unarmed',
};
const customStyleNames = { 513: styleNames['archers-axe'], 514: styleNames['light-flail'], 563: styleNames.crossbow };

// Kept across repaints of the book, so a pick or an assignment never moves the page.
const memory = { picked: null, open: new Set(), hand: 'weapon', learnedOnly: false, query: '' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** The numbers a player weighs before binding an ability, in plain words. */
export function abilityStatChips(ability, profile = null) {
  const delivery = profile?.kind ? profile : milestoneDelivery(ability.id) ?? combinationDelivery(ability.id, null) ?? racialDelivery(ability.id);
  const chips = [];
  if (delivery?.spend != null) chips.push(['Cost', delivery.spend + ' fatigue' + (delivery.kind === 'self' ? '' : ' + swing')]);
  const shield = [].concat(delivery?.selfEffect ?? []).find(effect => effect?.type === 35);
  if (shield) chips.push(['Shield', shield.magnitude + ' for ' + shield.rounds + (shield.rounds === 1 ? ' round' : ' rounds')]);
  const recovery = (delivery ?? profile)?.cooldownMs;
  if (recovery) chips.push(['Recovers', Math.round(recovery / 100) / 10 + ' s']);
  if (delivery?.kind === 'melee') {
    const beats = delivery.beats ?? 1;
    if (beats > 1) chips.push(['Hits', String(beats)]);
    const shares = Array.from({ length: beats }, (_, beat) => delivery.stages?.[beat]?.share ?? 1 / beats);
    const each = Math.min(...shares.map(share => meleeBeatMult(ability, delivery.potency, share)));
    chips.push([beats > 1 ? 'Each hit' : 'Damage', '×' + each.toFixed(1) + ' a plain swing']);
    const advance = delivery.stages?.[0]?.advance ?? delivery.advance;
    if (advance) chips.push(['Moves', advance.mech === 'leap' ? 'Leap' : advance.aim === 'side' ? 'Side hop' : 'Dash']);
  } else if (delivery?.kind === 'ranged') {
    const arrows = delivery.ammo ?? 1;
    chips.push(['Arrows', String(arrows)]);
    chips.push(['Each arrow', '×' + shotMult(ability, delivery.potency, arrows).toFixed(1) + ' a plain shot']);
  }
  return chips;
}

/** Every ability in its group, with what the page shows for it. */
function catalog(entity) {
  const groups = [];
  const add = (label, kind, skill = null) => {
    const group = { label, kind, skill, items: [] };
    groups.push(group);
    return group;
  };
  const push = (group, ability, profile, sub = null) => {
    const kind = group.kind;
    const rank = kind === 'combination' ? ability.rank + '/' + ability.rank
      : kind === 'racial' ? 'Racial' : kind === 'utility' ? 'Rank ' + ability.rank : 'Rank ' + ability.rank;
    group.items.push({ ability, profile, sub, kind, rank, capstone: ability.rank === 100 && kind !== 'utility',
      learned: !!profile && learnedAbility(entity, ability.id) });
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
      const name = styleNames[style] ?? templateByIndex(abilities[0].templates[0])?.name ?? style;
      for (const ability of abilities) push(group, ability, milestoneDelivery(ability.id), name);
    }
  }
  const combinations = add('Combinations', 'combination');
  for (const ability of ABILITIES) {
    if (ability.category !== 'combination') continue;
    const text = combinationDescription(ability.id);
    const active = activeAbilityWeapon(entity);
    const template = ability.templates.find(value => value !== 'bare');
    const weapon = ability.templates.includes(active?.templateIndex ?? 'bare') ? active : { templateIndex: template };
    push(combinations, ability, text ? { ...combinationDelivery(ability.id, weapon), description: text } : null,
      ability.skills.map(id => SKILL_NAMES[id]).join(' + '));
  }
  const racial = add('Racial abilities', 'racial');
  for (const ability of ABILITIES) {
    if (ability.category !== 'racial') continue;
    const favorites = RACIAL_FAVORITES[ability.race].map(id =>
      id === 'bare' ? styleNames['hand-to-hand'] : customStyleNames[id] ?? templateByIndex(id)?.name);
    const trait = RACIAL_TRAITS[ability.race];
    push(racial, ability, { ...racialDelivery(ability.id), description: [
      'Active: ' + racialDelivery(ability.id).description,
      'Passive: ' + favorites.join(' and ') + ' gain 4 weapon accuracy at half health or higher.',
      trait.passive + (trait.passive.endsWith('.') ? '' : '.'),
      trait.movement,
    ].join(' ') }, raceByKey(ability.race)?.name ?? ability.race);
  }
  const utilities = add('Universal utilities', 'utility');
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
  const playable = all.filter(item => item.profile);
  const learnedCount = playable.filter(item => item.learned).length;
  let picked = all.find(item => item.ability.id === memory.picked)
    ?? all.find(item => item.learned && item.kind === 'racial') ?? all.find(item => item.learned) ?? all[0];
  if (!memory.open.size) {
    const home = groups.find(group => group.items.includes(picked));
    if (home) memory.open.add(home.label);
  }

  const panel = element('div', null, 'sb-abilities px-journal');
  panel.setAttribute('aria-label', 'Abilities');
  const rail = element('div', null, 'px-qrail sb-ability-rail');
  const detail = element('div', null, 'px-qdetail sb-ability-detail');

  // The rail's head: the count, the search and the learned filter, kept above the scrolling list.
  const head = element('div', null, 'sb-rail-head');
  const count = element('span', learnedCount + ' / ' + playable.length + ' learned', 'sb-rail-count');
  const learnedOnly = element('button', 'Learned', 'act sb-filter');
  learnedOnly.type = 'button';
  learnedOnly.setAttribute('aria-pressed', String(memory.learnedOnly));
  learnedOnly.title = 'Show only the abilities you have learned';
  const search = element('input', null, 'sb-ability-search');
  search.type = 'search';
  search.placeholder = 'Find an ability or weapon';
  search.setAttribute('aria-label', search.placeholder);
  search.value = memory.query;
  const top = element('div', null, 'sb-rail-top');
  top.append(count, learnedOnly);
  head.append(top, search);
  const list = element('div', null, 'sb-rail-list');
  const empty = element('p', 'No matching abilities.', 'px-note');
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
    const total = group.items.filter(item => item.profile).length;
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
        element('span', item.kind === 'racial' ? item.sub : item.rank.replace('Rank ', ''), 'sb-arow-rank'));
      if (item.learned) {
        row._hotbarEntry = entryFor(item);
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
      kind === 'combination' ? 'Combination ' + item.rank : kind === 'racial' ? 'Racial ability' : item.rank,
      item.sub && kind !== 'racial' ? item.sub : null,
      item.capstone ? 'Capstone' : null,
    ].filter(Boolean).join(' · '), 'sb-adetail-kind'));
    title.append(icon, words);
    detail.append(title);
    if (!item.learned) detail.append(element('p', profile ? 'Not learned yet' + (ability.rank ? ': reach ' + ability.rank + ' in '
      + ability.skills.map(id => SKILL_NAMES[id]).join(' and ') + '.' : '.') : 'Planned.', 'sb-adetail-lock'));
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
    if (profile?.weakPointBonus) text += ' A weak point is a hit in the top 22% of the foe’s height.';
    if (profile?.counterBonus) text += ' Counter during an enemy wind-up or its overreach after an attack.';
    if (item.capstone && (kind === 'weapon' || kind === 'combination')) {
      text += ' Other capstones recover for ' + CAPSTONE_RECOVERY_MS / 1000 + ' seconds.';
    }
    if (text) detail.append(element('p', text, 'sb-adetail-text'));
    if (!item.learned) return;

    const bind = element('div', null, 'sb-bind');
    if (kind === 'weapon') {
      const hands = element('div', null, 'sb-hands');
      hands.setAttribute('role', 'group');
      hands.setAttribute('aria-label', 'Binding');
      for (const [hand, label] of [['weapon', 'Follow active weapon · Rank ' + ability.rank], ['manual', 'This ability']]) {
        const button = element('button', label, 'act sb-hand');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(memory.hand === hand));
        button.onclick = () => { memory.hand = hand; showDetail(); };
        hands.append(button);
      }
      bind.append(hands);
      bind.append(element('p', memory.hand === 'manual' ? 'The slot always uses this ability.'
        : 'The slot uses the rank ' + ability.rank + ' ability of whatever weapon you hold.', 'sb-bind-note'));
    }
    const entry = entryFor(item);
    const slots = element('div', null, 'sb-slots');
    slots.setAttribute('role', 'group');
    slots.setAttribute('aria-label', 'Put on hotbar slot');
    slots.style.setProperty('--cols', String(size > 6 ? Math.ceil(size / 2) : size));
    const status = element('p', null, 'sb-bind-status');
    status.setAttribute('role', 'status');
    const label = element('p', 'Put on the hotbar', 'sb-slots-label');
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
        } else if (held) button.append(element('span', held.type === 'weapon-rank' ? 'R' + held.rank : held.name.slice(0, 2), 'sb-slotmark'));
        button.classList.toggle('on', here);
        button.classList.toggle('full', !!held && !here);
        button.title = here ? 'Already here' : held ? 'Replace ' + held.name : 'Empty';
        button.onclick = () => {
          if (here || !setHotbarSlot(i, entry)) return;
          status.textContent = entry.name + ' is on slot ' + (i + 1) + '.';
          paintSlots();
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
  requestAnimationFrame?.(() => rows.find(entry => entry.item === picked)?.row.scrollIntoView?.({ block: 'nearest' }));
  return panel;
}
