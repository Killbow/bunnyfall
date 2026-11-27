// @ts-check
import { isOnlinePage } from '../../platform/onlineLane.js';
import { accountQuestlines } from '../../net/accountClient.js';
import { appStorage } from '../../platform/appStorage.js';
import { refreshFestival, festivalDoors } from '../festival/festivalClient.js';
import { cakesFoundText } from '../festival/festivalWords.js';

/**
 * @param {any} answer
 * @param {{ say?: (line: string) => void, refresh?: () => Promise<any> }} [doors]
 */
export function hearPurse(answer, { say = (line) => festivalDoors().say(line), refresh = refreshFestival } = {}) {
  const n = answer?.ok ? answer.data?.purse : null;
  if (!Number.isSafeInteger(n) || n <= 0) return false;
  try { say(cakesFoundText(n)); } catch { }
  refresh().catch(() => {});
  return true;
}

/**
 * @param {{ search?: string, fetch?: any, storage?: any }} [opts]
 */
export function questlineService({ search, fetch, storage } = {}) {
  if (!isOnlinePage(search)) return null;
  const door = accountQuestlines({ fetch: fetch ?? ((u, i) => globalThis.fetch(u, i)), storage: storage ?? appStorage() });
  return { ...door, claim: async (body) => { const a = await door.claim(body); hearPurse(a); return a; } };
}

export const serviceReady = (service) => !!service && !!service.account?.();
