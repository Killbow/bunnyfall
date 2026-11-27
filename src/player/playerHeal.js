// @ts-check

let _healOwed = 0;
export function healMine(entity, amount) {
  if (!entity || !(entity.health > 0) || !(amount > 0)) return 0;
  const exact = amount + _healOwed;
  const whole = Math.floor(exact + 1e-9);
  _healOwed = exact - whole;
  if (whole <= 0) return 0;
  const max = Number.isFinite(entity.maxHealth) ? entity.maxHealth : entity.health + whole;
  const before = entity.health;
  entity.health = Math.min(max, entity.health + whole);
  return entity.health - before;
}

let _manaOwed = 0;
export function manaMine(entity, amount) {
  if (!entity || !(amount > 0) || !Number.isFinite(entity.magicka)) return;
  const exact = amount + _manaOwed;
  const whole = Math.floor(exact + 1e-9);
  _manaOwed = exact - whole;
  if (whole > 0) entity.magicka = Math.min(Number.isFinite(entity.maxMagicka) ? entity.maxMagicka : entity.magicka + whole, entity.magicka + whole);
}

export function _resetPlayerHealForTests() { _healOwed = 0; _manaOwed = 0; }
