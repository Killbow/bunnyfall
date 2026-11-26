import { CLIMATES } from '../formats/mapsFile.js';
import { isSnowFreeClimate } from '../world/weather.js';

export const FOOTSTEP = Object.freeze({
  Stone1: 309, Stone2: 330,
  Outside1: 310, Outside2: 331,
  Snow1: 311, Snow2: 332,
  Wood1: 313, Wood2: 333,
  Shallow: 334,
  Submerged: 346,
});
export const WALK_STEP_INTERVAL = 2.5;
export const FOOTSTEP_VOLUME = 0.7;

export function pickFootstepSet(ctx = {}) {
  const kind = pickFootstepKind(ctx);
  return FOOTSTEP_CLIP_SETS[kind];
}

// Peers send this kind and look the clips up locally, so its values and the FOOTSTEP_CLIP_SETS order are wire data.
export const FOOTSTEP_KIND = Object.freeze({ Outside: 0, Snow: 1, Wood: 2, Stone: 3, Submerged: 4, Shallow: 5 });
export function pickFootstepKind(ctx = {}) {
  let kind;
  if (!ctx.inside && !ctx.onStaticGeometry) {
    kind = (ctx.winter && !isSnowFreeClimate(ctx.climateIndex ?? CLIMATES.Woodlands)) ? FOOTSTEP_KIND.Snow : FOOTSTEP_KIND.Outside;
  } else if (ctx.inBuilding) kind = FOOTSTEP_KIND.Wood;
  else kind = FOOTSTEP_KIND.Stone;
  if (ctx.onExteriorWater) kind = FOOTSTEP_KIND.Submerged;
  if (ctx.onExteriorPath) kind = FOOTSTEP_KIND.Stone;
  if (ctx.dungeonSwimming) kind = FOOTSTEP_KIND.Submerged;
  else if (ctx.dungeonShallow) kind = FOOTSTEP_KIND.Shallow;
  return kind;
}
export const FOOTSTEP_CLIP_SETS = Object.freeze([
  [FOOTSTEP.Outside1, FOOTSTEP.Outside2],
  [FOOTSTEP.Snow1, FOOTSTEP.Snow2],
  [FOOTSTEP.Wood1, FOOTSTEP.Wood2],
  [FOOTSTEP.Stone1, FOOTSTEP.Stone2],
  [FOOTSTEP.Submerged, FOOTSTEP.Submerged],
  [FOOTSTEP.Shallow, FOOTSTEP.Shallow],
]);

export class FootstepMachine {
  constructor() {
    this.last = null;
    this.distance = 0;
    this.alternate = false;
    this.lostGrounding = false;
    this.ignoreLostGrounding = true;
    this.dungeonShallow = false;
  }

  // Shallow water is entered at centreY - 0.57 and left at centreY - 0.95, with the sound held between, as in
  // Daggerfall Unity. centreY is the capsule center.
  waterStep(centreY, surf, swimming) {
    if (swimming) return this.dungeonShallow;
    if (surf == null || (centreY - 0.95) >= surf) this.dungeonShallow = false;
    else if (!this.dungeonShallow && (centreY - 0.57) < surf) this.dungeonShallow = true;
    return this.dungeonShallow;
  }

  /** The floating origin moves the world, not the feet, so the anchor reseeds instead of counting a step. */
  rebase() { this.last = null; }

  update(pos, m, set) {
    const here = [pos[0], pos[2]];
    if (this.last === null) this.last = here;
    // While a sprite owns the stride, the anchor follows the feet, so no long step fires when it gives it back.
    if (m.spriteStep?.owns) {
      this.last = here;
      this.distance = 0;
      if (!m.spriteStep.fell) return null;
      const clip = this.alternate ? set[1] : set[0];
      this.alternate = !this.alternate;
      return { clip, volume: FOOTSTEP_VOLUME * (m.spriteStep.volumeScale ?? 1) };
    }
    // The early returns leave the anchor stale on purpose, so the distance covered under the gate fires one step
    // when it opens, as in Daggerfall Unity.
    if (m.levitating || (m.onFoot === false && !m.onExteriorWater)) {
      this.distance = 0;
      return null;
    }
    if (!m.swimming) {
      if (!m.grounded) {
        this.distance = 0;
        this.lostGrounding = true;
        return null;
      }
      if (this.lostGrounding) {
        this.distance = 0;
        this.last = here;
        this.lostGrounding = false;
        if (this.ignoreLostGrounding) { this.ignoreLostGrounding = false; return null; }
        const clip = this.alternate ? set[1] : set[0];
        this.alternate = !this.alternate;
        return { clip, volume: FOOTSTEP_VOLUME };
      }
    }
    if (m.standingStill) return null;
    this.distance += Math.hypot(here[0] - this.last[0], here[1] - this.last[1]);
    this.last = here;
    if (this.distance <= WALK_STEP_INTERVAL) return null;
    let volume = FOOTSTEP_VOLUME;
    if (m.halfSpeed) volume *= 0.5;
    const clip = this.alternate ? set[1] : set[0];
    this.alternate = !this.alternate;
    this.distance = 0;
    return { clip, volume };
  }
}
