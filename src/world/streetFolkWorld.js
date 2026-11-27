// Street folk for the world: the walker and standing people lanes, and the standing horses with their frame.
// It also offers boat crews on the people lane and reads the look of a yard figure.
import { createPopulationLane } from '../characters/npcBodies.js';
import { createStandingHorses } from './standingHorses.js';
import { figureLook, personActor, personLook } from '../characters/peopleBodies.js';
import { REGION_RACES } from '../formats/mapsFile.js';
import { staticNpcData } from '../characters/staticNpc.js';

/** @param {any} shared */
export function createStreetFolkWorld(shared) {
  const { _questRegionIndex, pipeline, renderer } = shared;
  const folkStreet = createPopulationLane({ laneName: 'folk', renderer, collider: () => shared.collider });
  const streetPeople = createPopulationLane({ laneName: 'people', renderer, collider: () => shared.collider });
  const standingHorses = createStandingHorses({ renderer });
  function standingHorsesFrame(canvas, proj, view, eye, dt) {
    if (shared.merchantYards && shared._mode() === 'exterior') shared.merchantYards.offerHorses(standingHorses);
    if (standingHorses.end(dt, { proj, view })) standingHorses.draw(canvas, { eye, proj, view });
  }
  const offerStreetPerson = (a, b) => streetPeople.offer(a, b);
  const crewFlatDrawn = (f, b) => { b.castOnly = false; };

  const offerCrewPerson = (f, b) => {
    const look = b.conceal ? null : figureLook(f, yardFigureCtx);
    if (look) streetPeople.offer(personActor(f, look, b.origin, shared._crewEye, shared._crewDt), b);
    else b.castOnly = false;
  };
  function offerCrews(eye, dt, on) {
    if (!shared.csaOn() || shared._mode() !== 'exterior') return;
    shared._crewEye = eye; shared._crewDt = dt;
    shared.csa.people(on ? offerCrewPerson : crewFlatDrawn);
  }
  const yardFigureCtx = { get flats() { return pipeline.flatsFile?.() ?? null; }, get race() { return REGION_RACES[_questRegionIndex()] + 1; } };
  const streetLook = (pn) => {
    if (pn._mwLook !== undefined) return pn._mwLook;
    const dict = shared._questStore()?.dict ?? null;
    if (!dict) return null;
    return personLook(pn, staticNpcData(pn, { getFaction: (id) => dict.get(id) ?? null, raceOfCurrentRegion: () => REGION_RACES[_questRegionIndex()] + 1 }), dict.get(pn.factionID) ?? null);
  };
  return {
    crewFlatDrawn, folkStreet, offerCrews, offerStreetPerson, standingHorses, standingHorsesFrame, streetLook,
    streetPeople, yardFigureCtx,
  };
}
