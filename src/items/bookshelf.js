import { getShelfBookID, bookTitle } from './books.js';
import { canAccessLibrary } from '../guilds/guildServices.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { localizedText } from '../ui/textManager.js';

export const BOOKSHELF_CAPACITY = 10;

export function populateBookshelf(rolls = Math.random) {
  const books = [];
  for (let i = 0; i < BOOKSHELF_CAPACITY; i++) {
    const id = getShelfBookID(rolls);
    if ((bookTitle(id) ?? '') !== '') books.push(id);
  }
  return books;
}

export const isBookshelfBuilding = (buildingType) => buildingType === BUILDING_TYPES.Library
  || buildingType === BUILDING_TYPES.GuildHall || buildingType === BUILDING_TYPES.Temple;

export function bookshelfAccess({ buildingType, guild = null, membership = null }) {
  if (buildingType === BUILDING_TYPES.GuildHall || buildingType === BUILDING_TYPES.Temple) {
    if (!guild || !canAccessLibrary(guild, membership)) {
      return { allowed: false, text: localizedText('accessMembersOnly', 'You need to be a member of sufficient rank to access this.') };
    }
  }
  return { allowed: true };
}

export const bookshelfTitles = (books) => books.map((id) => bookTitle(id) ?? '');
