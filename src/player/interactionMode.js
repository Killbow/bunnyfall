// The global interaction mode (grab, steal, and so on) shared by every activation path.
import { localizedText, localizedTable } from '../ui/textManager.js';

export const MODES = ['steal', 'grab', 'info', 'dialogue'];

const MODE_WORDS = localizedTable({
  steal: ['steal', 'steal'], grab: ['grab', 'grab'], info: ['info', 'info'], dialogue: ['dialogue', 'dialogue'],
});
export const interactionModeText = (mode) =>
  localizedText('interactionIsNowInMode', 'Interaction is now in %s mode.').replaceAll('%s', Object.hasOwn(MODE_WORDS, mode) ? MODE_WORDS[mode] : mode);

export const MODE_ACTIONS = Object.freeze({
  StealMode: 'steal', GrabMode: 'grab', InfoMode: 'info', TalkMode: 'dialogue',
});

let _mode = 'grab';

export const getInteractionMode = () => _mode;
export function setInteractionMode(m) {
  if (!MODES.includes(m)) return false;
  _mode = m;
  return true;
}

const _asks = { steal: 0, grab: 0, info: 0, dialogue: 0 };
export function askInteractionMode(m) {
  if (!MODES.includes(m)) return false;
  _asks[m]++;
  return true;
}
export const interactionModeAsks = (m) => _asks[m] ?? 0;

export function nextInteractionMode(mode = _mode) {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}
