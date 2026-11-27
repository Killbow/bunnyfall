// @ts-check
export const QL_FAMILY_NAMES = Object.freeze([
  'FightersGuild', 'KnightlyOrders', 'MagesGuild', 'ThievesGuild', 'DarkBrotherhood', 'HolyOrders',
  'Nobility', 'Merchants', 'Commoners', 'Witches', 'Vampires', 'Daedra', 'MainQuest', 'Mods',
  'Questlines',
]);

// The classic GeneralPopulace list group holds the Thieves Guild quests.
export const LIST_GROUP_FAMILY = Object.freeze({
  FightersGuild: 'FightersGuild', KnightlyOrder: 'KnightlyOrders', MagesGuild: 'MagesGuild', GeneralPopulace: 'ThievesGuild',
  DarkBrotherHood: 'DarkBrotherhood', HolyOrder: 'HolyOrders', Nobility: 'Nobility', Merchants: 'Merchants',
  Commoners: 'Commoners', Witches: 'Witches', Vampires: 'Vampires',
});

export const UNLISTED_FAMILY = Object.freeze({
  Daedra: Object.freeze(['10C00Y00', '20C00Y00', '30C00Y00', '40C00Y00', '50C00Y00', '60C00Y00', '70C00Y00', '80C0XY00', '90C00Y00',
    'T0C00Y00', 'U0C00Y00', 'V0C00Y00', 'W0C00Y00', 'X0C00Y00', 'Y0C00Y00', 'Z0C00Y00']),
  Vampires: Object.freeze(['$CUREVAM', '$CUREWER']),
});
