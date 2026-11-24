import { abilityIcon } from './abilityIcon.js';
import { CAPSTONE_RECOVERY_MS } from '../combat/abilities/engine.js';
import { SKILL_NAMES } from '../characters/skills.js';
import { raceByKey } from '../characters/races.js';
import { ABILITIES, PHYSICAL_SKILLS } from '../combat/abilities/registry.js';
import { learnedAbility } from '../combat/abilities/progress.js';
import { milestoneDelivery } from '../combat/abilities/milestones.js';
import { utilityProfile } from '../combat/abilities/utilityProfiles.js';
import { racialDelivery, RACIAL_FAVORITES, RACIAL_TRAITS } from '../combat/abilities/racialProfiles.js';
import { combinationDescription } from '../combat/abilities/combinations.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { hotbarEntry, hotbarEntryForAbility, hotbarEntryForHandAbility, setHotbarSlot } from '../items/quickslots.js';

const styleNames = {
  'archers-axe': 'Archer’s Axe',
  'light-flail': 'Light Flail',
  crossbow: 'Crossbow',
  ballista: 'Royal Ballista',
  'hand-to-hand': 'Unarmed',
};
const customStyleNames = { 513: styleNames['archers-axe'], 514: styleNames['light-flail'], 563: styleNames.crossbow };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function buildAbilityCodex(entity, size) {
  const panel = element('div', null, 'sb-abilities');
  panel.setAttribute('aria-label', 'Abilities');
  const nav = element('nav', null, 'sb-skill-nav');
  nav.setAttribute('aria-label', 'Jump to a skill');
  const roster = element('div', null, 'sb-roster');
  const search = element('input', null, 'sb-ability-search');
  search.type = 'search';
  search.placeholder = 'Find a weapon, ability, or rank';
  search.setAttribute('aria-label', search.placeholder);
  const empty = element('p', 'No matching abilities.', 'sb-roster-note');
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  roster.append(empty);
  const sections = [];

  const slots = element('select');
  slots.setAttribute('aria-label', 'Hotbar slot');
  const binding = element('select');
  binding.setAttribute('aria-label', 'Ability binding');
  const description = element('p');
  const status = element('p');
  status.setAttribute('role', 'status');
  const assign = element('button', 'Assign', 'act');
  assign.type = 'button';
  const assignment = element('div', null, 'sb-assignment');
  const controls = element('div', null, 'sb-assignment-controls');
  controls.append(binding, slots, assign);
  assignment.append(description, controls, status);
  let selected = null;

  function selectedEntry() {
    return binding.value === 'manual'
      ? hotbarEntryForAbility(selected.ability.id)
      : hotbarEntryForHandAbility(binding.value, selected.ability.rank);
  }

  function refreshSlots(preferred = '') {
    slots.replaceChildren();
    const prompt = element('option', 'Choose a hotbar slot');
    prompt.value = '';
    prompt.disabled = true;
    slots.append(prompt);
    let free = '', assigned = '';
    const entry = selectedEntry();
    for (let i = 0; i < size; i++) {
      const held = hotbarEntry(i);
      const option = element('option', (i + 1) + (held ? ' · ' + held.name : ' · Empty'));
      option.value = String(i);
      if (!held && free === '') free = option.value;
      if (held && held.type === entry.type && (entry.id ? held.id === entry.id : held.key === entry.key)) assigned = option.value;
      slots.append(option);
    }
    slots.value = preferred || assigned || free;
    assign.disabled = slots.value === '';
  }

  slots.addEventListener('change', () => { assign.disabled = slots.value === ''; });
  binding.addEventListener('change', () => refreshSlots());
  assign.addEventListener('click', () => {
    if (!selected || slots.value === '' || !learnedAbility(entity, selected.ability.id)) return;
    const index = Number(slots.value);
    const entry = selectedEntry();
    if (!setHotbarSlot(index, entry)) return;
    status.textContent = entry.name + ' assigned to slot ' + (index + 1);
    refreshSlots(String(index));
  });

  function addSection(label) {
    const section = element('section', null, 'sb-skill-section');
    const heading = element('h3', label);
    heading.tabIndex = -1;
    section.append(heading);
    roster.append(section);
    const jump = element('button', label, 'act');
    jump.type = 'button';
    jump.onclick = () => {
      heading.focus({ preventScroll: true });
      roster.scrollTop += section.getBoundingClientRect().top - roster.getBoundingClientRect().top - 8;
    };
    nav.append(jump);
    sections.push({ section, jump, label, ladders: [] });
    return section;
  }

  function addLadder(section, name, abilities, profileFor, kind = 'utility') {
    const ladder = element('div', null, 'sb-weapon-ladder');
    if (name) {
      const title = element('h4', name);
      ladder.append(title);
    }
    const list = element('ol', null, 'sb-milestones');
    const entries = abilities.map(ability => ({ ability, profile: profileFor(ability.id) }));
    const rows = [];
    sections.at(-1).ladders.push({ ladder, name, rows });
    const planned = entries.every(entry => !entry.profile);
    if (planned) ladder.append(element('p', 'Planned', 'sb-roster-note'));
    for (const { ability, profile } of entries) {
      const row = element('li');
      const learned = profile && learnedAbility(entity, ability.id);
      const control = element(profile ? 'button' : 'div', null, 'sb-milestone');
      const rank = kind === 'combination' ? ability.rank + '/' + ability.rank + (ability.rank === 100 ? ' · Capstone' : '')
        : kind === 'racial' ? 'Racial ability'
        : kind === 'weapon' && ability.rank === 100 ? 'Rank 100 · Capstone' : 'Rank ' + ability.rank;
      const icon = element('img', null, 'sb-ability-icon');
      icon.src = abilityIcon(ability.id);
      icon.alt = '';
      control.classList.toggle('sb-capstone', ability.rank === 100);
      control.append(icon, element('span', ability.name, 'sb-milestone-name'), element('span', rank, 'sb-milestone-rank'));
      if (!learned && !planned) control.append(element('span', profile ? 'Locked' : 'Planned', 'sb-roster-note'));
      if (profile) {
        control.type = 'button';
        control.setAttribute('aria-expanded', 'false');
        control.onclick = () => {
          selected?.button.setAttribute('aria-expanded', 'false');
          if (selected?.button === control) {
            assignment.remove();
            selected = null;
            return;
          }
          selected = { ability, button: control };
          control.setAttribute('aria-expanded', 'true');
          description.textContent = profile.description ?? '';
          if (ability.rank === 100 && (kind === 'weapon' || kind === 'combination')) {
            description.textContent += ' Other capstones recover for ' + CAPSTONE_RECOVERY_MS / 1000 + ' seconds.';
          }
          description.hidden = !description.textContent;
          status.textContent = '';
          controls.hidden = !learned;
          binding.replaceChildren();
          if (kind === 'weapon') {
            for (const hand of ['right', 'left']) {
              const entry = hotbarEntryForHandAbility(hand, ability.rank);
              const option = element('option', entry.name);
              option.value = hand;
              binding.append(option);
            }
          }
          if (kind !== 'weapon' || ability.rank === 100) {
            const manual = element('option', 'Specific ability');
            manual.value = 'manual';
            binding.append(manual);
            binding.value = 'manual';
          }
          binding.hidden = kind !== 'weapon';
          control.after(assignment);
          if (learned) refreshSlots();
        };
      }
      rows.push({ row, label: ability.name + ' ' + rank });
      row.append(control);
      list.append(row);
    }
    ladder.append(list);
    section.append(ladder);
  }

  const weaponsBySkill = new Map(PHYSICAL_SKILLS.map(skill => [skill, new Map()]));
  for (const ability of ABILITIES) {
    if (ability.category !== 'weapon') continue;
    const [, style] = ability.id.split('.');
    const weapons = weaponsBySkill.get(ability.skills[0]);
    if (!weapons.has(style)) weapons.set(style, []);
    weapons.get(style).push(ability);
  }
  for (const [skill, weapons] of weaponsBySkill) {
    const section = addSection(SKILL_NAMES[skill]);
    for (const [style, abilities] of weapons) {
      const name = styleNames[style] ?? templateByIndex(abilities[0].templates[0])?.name ?? style;
      addLadder(section, name, abilities, milestoneDelivery, 'weapon');
    }
  }

  const combinations = addSection('Combinations');
  const pairs = new Map();
  for (const ability of ABILITIES) {
    if (ability.category !== 'combination') continue;
    const key = ability.skills.map(id => SKILL_NAMES[id]).join(' + ');
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(ability);
  }
  for (const [key, abilities] of pairs) {
    addLadder(combinations, key, abilities, id => {
      const description = combinationDescription(id);
      return description ? { description } : null;
    }, 'combination');
  }

  const racial = addSection('Racial abilities');
  for (const ability of ABILITIES) {
    if (ability.category !== 'racial') continue;
    const favorites = RACIAL_FAVORITES[ability.race].map(id =>
      id === 'bare' ? styleNames['hand-to-hand'] : customStyleNames[id] ?? templateByIndex(id)?.name);
    const trait = RACIAL_TRAITS[ability.race];
    addLadder(racial, raceByKey(ability.race)?.name ?? ability.race, [ability], id => {
      const delivery = racialDelivery(id);
      return { description: [
        delivery.description,
        favorites.join(' and ') + ' gain 4 weapon accuracy at half health or higher.',
        trait.passive + (trait.passive.endsWith('.') ? '' : '.'),
        trait.movement,
      ].join(' ') };
    }, 'racial');
  }

  const utilities = addSection('Universal utilities');
  addLadder(utilities, null, ABILITIES.filter(ability => utilityProfile(ability.id)), utilityProfile);
  utilities.append(element('p', entity.wayfarerAnchor ? 'Wayfarer’s Anchor is set.' : 'Wayfarer’s Anchor is unset.', 'sb-roster-note'));
  search.addEventListener('input', () => {
    const terms = search.value.trim().toLowerCase().split(/\s+/);
    for (const { section, jump, label, ladders } of sections) {
      for (const { ladder, name, rows } of ladders) {
        for (const entry of rows) {
          const haystack = [label, name, entry.label].join(' ').toLowerCase();
          entry.row.hidden = !terms.every(term => haystack.includes(term));
        }
        ladder.hidden = rows.every(entry => entry.row.hidden);
      }
      jump.hidden = section.hidden = ladders.every(entry => entry.ladder.hidden);
    }
    empty.hidden = sections.some(entry => !entry.section.hidden);
    roster.scrollTop = 0;
  });
  panel.append(search, nav, roster);
  return panel;
}
