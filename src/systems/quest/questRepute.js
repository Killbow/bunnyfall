// Faction reputation change when a quest ends, matching Daggerfall Unity's quest success and failure values.

export const QUEST_SUCCESS_REP = 5;
export const QUEST_FAILURE_REP = -2;

export function questorRegion(quest) {
  for (const resource of quest.resources.values()) {
    if (!resource.isPerson || !resource.isQuestor) continue;
    const region = resource.getHomePlace()?.siteDetails?.regionIndex ?? resource.homeRegionIndex;
    if (Number.isInteger(region) && region >= 0) return region;
  }
  return null;
}
