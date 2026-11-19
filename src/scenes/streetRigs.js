// @ts-check
// Indoors and underground, the street's rigs are released with the open world they stood in. That covers the road
// travellers, the family's street rigs, the walkers, the standing people, and the standing horses.

export function createStreetRigs(d) {
  return {
    indoorFrame() {
      d.livingRoads()?.clear();
      d.familyStreet()?.clear();
      d.folkStreet.destroy();
      d.streetPeople.destroy();
      d.standingHorses.destroy();
    },
  };
}
