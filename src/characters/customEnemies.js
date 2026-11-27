// Registries for enemies past the classic MobileTypes: an id is an enemy exactly when a mod registered a career
// template for it. It imports nothing, so the enemy table and the entity builder both read it without a cycle.

/** @typedef {{ name: string, load: (fetchBytes: Function) => Promise<object|null> }} CustomCareerTemplate */

/** @type {Map<number, CustomCareerTemplate>} */
const _careers = new Map();

// A later registration for the same id overwrites an earlier one.
export function registerCustomCareerTemplate(enemyId, template) {
  if (!Number.isInteger(enemyId) || typeof template?.load !== 'function') throw new Error(`registerCustomCareerTemplate: ${enemyId} needs a template with load()`);
  _careers.set(enemyId, Object.freeze({ name: String(template.name ?? ''), load: template.load }));
}

export const customCareerTemplate = (enemyId) => _careers.get(Number(enemyId)) ?? null;

export const customEnemyIds = () => [..._careers.keys()].sort((a, b) => a - b);

/** @type {Array<(enemyId: number) => (string|null|undefined)>} */
const _names = [];
// The last registered provider is asked first and passes on ids it does not know.
export function registerCustomEnemyName(fn) {
  if (typeof fn !== 'function') throw new Error('registerCustomEnemyName: a function of the enemy id');
  _names.unshift(fn);
}

export function customEnemyName(enemyId) {
  for (const fn of _names) {
    const n = fn(Number(enemyId));
    if (typeof n === 'string' && n !== '') return n;
  }
  return null;
}

export function clearCustomEnemies() { _careers.clear(); _names.length = 0; }
