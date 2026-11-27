// BUNNYFALL: how long an ability's own buffs last. A magic round is ROUND_SECONDS. Every self buff an ability grants
// (shield, Speed, Strength, concealment, Free Action, and the like) lasts at least BUFF_ROUNDS[25] rounds, and more at
// a higher rank, up to 20 for a capstone. Tune the table here and every ability follows it.
export const ROUND_SECONDS = 5;

// Weapon and combination abilities, by their unlock rank (a rank between two keys uses the lower one).
export const BUFF_ROUNDS = Object.freeze({ 25: 10, 50: 13, 75: 16, 100: 20 });
// Racial abilities have no rank. They sit between a rank 50 and a rank 75 weapon ability.
export const RACIAL_BUFF_ROUNDS = 15;
// Universal utilities (unlock ranks 10 to 50): ten rounds, and two more for every ten ranks above 20.
export const utilityBuffRounds = rank => 10 + 2 * Math.max(0, Math.floor((rank - 20) / 10));

/** The rounds a weapon or combination ability of this unlock rank grants its buffs for. */
export function buffRoundsForRank(rank) {
  let rounds = BUFF_ROUNDS[25];
  for (const [from, value] of Object.entries(BUFF_ROUNDS)) if (rank >= Number(from)) rounds = value;
  return rounds;
}

/** The rounds an ability's buffs last. */
export function buffRounds(ability) {
  if (!ability) return BUFF_ROUNDS[25];
  if (ability.race) return RACIAL_BUFF_ROUNDS;
  if (ability.category === 'utility') return utilityBuffRounds(ability.rank);
  return buffRoundsForRank(ability.rank);
}

export const buffSeconds = ability => buffRounds(ability) * ROUND_SECONDS;

const longer = (effect, rounds) => (effect && effect.rounds != null ? { ...effect, rounds: Math.max(effect.rounds, rounds) } : effect);

/** A delivery profile with its self buffs lengthened. Returns the same object when it has none. */
export function withBuffDuration(ability, profile) {
  if (!profile) return profile;
  const rounds = buffRounds(ability);
  const out = { ...profile };
  for (const key of ['selfEffect', 'crouchEffect']) {
    if (profile[key]) out[key] = Array.isArray(profile[key]) ? profile[key].map(effect => longer(effect, rounds)) : longer(profile[key], rounds);
  }
  if (profile.accuracy) out.accuracy = { ...profile.accuracy, seconds: Math.max(profile.accuracy.seconds, rounds * ROUND_SECONDS) };
  if (profile.edgeRitual) out.edgeRitualSeconds = rounds * ROUND_SECONDS;
  return out;
}
