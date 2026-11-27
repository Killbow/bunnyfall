// Classic DaggerfallCityGate: `isOpen` starts true whatever model the block placed. A gate laid closed (447) by day
// stays shut until the next night-to-day cycle, and the first tick must run the toggle. Online the gate always
// shows the open model, because the closed model's collider seals the city and nobody can advance the shared clock.
import { sharedClockOn } from './worldTick.js';
import { CITY_GATE_OPEN_MODEL_ID, CITY_GATE_CLOSED_MODEL_ID } from './rmbLayout.js';

/** @param {number} placedModelId */
export function makeCityGate(placedModelId) {
  return { isOpen: true, modelId: placedModelId };
}

/**
 * @param {{isOpen:boolean,modelId:number}} gate
 * @param {boolean} night
 */
export function updateCityGate(gate, night, { online = sharedClockOn() } = {}) {
  // Online checks the model, not `isOpen`: a gate laid closed starts with `isOpen` true on model 447, so only
  // forcing the model opens it.
  if (online) {
    if (gate.isOpen && gate.modelId === CITY_GATE_OPEN_MODEL_ID) return false;
    gate.isOpen = true;
    gate.modelId = CITY_GATE_OPEN_MODEL_ID;
    return true;
  }
  if (!((night && gate.isOpen) || (!night && !gate.isOpen))) return false;
  gate.isOpen = !gate.isOpen;
  gate.modelId = gate.isOpen ? CITY_GATE_OPEN_MODEL_ID : CITY_GATE_CLOSED_MODEL_ID;
  return true;
}
