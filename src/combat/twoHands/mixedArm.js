export const blowWeaponOf = ({ hand = null, weapon = null, offWeapon = null } = {}) => (hand === 'L' && offWeapon ? offWeapon : weapon);
