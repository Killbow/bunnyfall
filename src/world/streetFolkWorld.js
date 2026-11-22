// The world's street folk: the walker and standing people lanes, and the standing horses with
// their frame. It also offers a boat crew's people on the people lane and reads a yard figure's
// look. The line's family lanes for the street and a room stay in the world.
import { createPopulationLane } from '../characters/npcBodies.js';
import { createStandingHorses } from './standingHorses.js';
import { figureLook, personActor, personLook } from '../characters/peopleBodies.js';
import { REGION_RACES } from '../formats/mapsFile.js';
import { staticNpcData } from '../characters/staticNpc.js';

/** @param {any} shared */
export function createStreetFolkWorld(shared) {
  const { _questRegionIndex, pipeline, renderer } = shared;
  // MWNPC7 (bible/04-Characters/Morrowind-NPCs.md section 12): THE STREET'S WALKERS IN MORROWIND BODIES - every town's
  // population offered as the street walks it, on the 'folk' lane under the switch's tier (the line's own members keep
  // the family's bodies, above)
  const folkStreet = createPopulationLane({ laneName: 'folk', renderer, collider: () => shared.collider });
  // MWNPC8b (section 13b): AND THE STREET'S STANDING PEOPLE - each StaticNPC flat its own batch (standPixelNpcs), offered
  // from the near rings as the pixels are walked, read as the buildings' are (their data, their faction's row)
  const streetPeople = createPopulationLane({ laneName: 'people', renderer, collider: () => shared.collider });
  // STAND-HORSE (Morrowind-NPCs.md section 28): THE HORSES THAT STAND - the town's (TEXTURE.201's) of the near rings and
  // the Stables' three - each the 3D horse on the Morrowind lane, as the pool's and the road's horses already are
  const standingHorses = createStandingHorses({ renderer });
  /** The street's frame ends the standing horses after its people are drawn and before its flats: the Stables' offered
   *  (the town's were in the pixel walk), the cut made, the horses drawn in a bind of their own. A function of the host's,
   *  not a statement of the frame's (PERF-V8). */
  function standingHorsesFrame(canvas, proj, view, eye, dt) {
    if (shared.merchantYards && shared._mode() === 'exterior') shared.merchantYards.offerHorses(standingHorses);   // the Stables' horses (their flats ride livePersonBatches)
    if (standingHorses.end(dt, { proj, view })) standingHorses.draw(canvas, { eye, proj, view });
  }
  const offerStreetPerson = (a, b) => streetPeople.offer(a, b);   // AUDIT MW-NPC II P1: the yards' keepers offered on it
  // STAND-FLAT (Morrowind-NPCs.md section 28): a boat's crew (scenes/comeSailAway/comeSailAwayPool.js people) offered on it, read as a
  // placed figure is, at their flat's base - a concealed owner's crew keeps the owner's veiled flats; off the lane, or a
  // crew no body stands for, their flats drawn
  const crewFlatDrawn = (f, b) => { b.castOnly = false; };

  const offerCrewPerson = (f, b) => {
    const look = b.conceal ? null : figureLook(f, yardFigureCtx);
    if (look) streetPeople.offer(personActor(f, look, b.origin, shared._crewEye, shared._crewDt), b);
    else b.castOnly = false;
  };
  /** The street's frame offers the crews (`on` - the people lane's frame is up), before the lane draws. A function of the
   *  host's, not a statement of the frame's (PERF-V8: the frame's bytecode keeps its quarter under V8's ceiling). */
  function offerCrews(eye, dt, on) {
    if (!shared.csaOn() || shared._mode() !== 'exterior') return;
    shared._crewEye = eye; shared._crewDt = dt;
    shared.csa.people(on ? offerCrewPerson : crewFlatDrawn);
  }
  // MWNPC18: what a yard's figure is read by - FLATS.CFG and the region's race, asked only when a figure is first looked at
  const yardFigureCtx = { get flats() { return pipeline.flatsFile?.() ?? null; }, get race() { return REGION_RACES[_questRegionIndex()] + 1; } };
  const streetLook = (pn) => {
    if (pn._mwLook !== undefined) return pn._mwLook;
    const dict = shared._questStore()?.dict ?? null;
    if (!dict) return null;   // never before the faction table: asked again
    return personLook(pn, staticNpcData(pn, { getFaction: (id) => dict.get(id) ?? null, raceOfCurrentRegion: () => REGION_RACES[_questRegionIndex()] + 1 }), dict.get(pn.factionID) ?? null);
  };
  return {
    crewFlatDrawn, folkStreet, offerCrews, offerStreetPerson, standingHorses, standingHorsesFrame, streetLook,
    streetPeople, yardFigureCtx,
  };
}
