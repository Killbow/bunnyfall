// @ts-check
import { t } from '../../ui/textManager.js';
import { TAVERN_ROOM_EVENTS, tavernRoomOf } from '../../net/tavernRoomLaw.js';
export const tavernRoomCue = (event) => t(`tavern.room.${event.id}.cue`, event.cue);
export const tavernRoomChoice = (event, choice) => t(`tavern.room.${event.id}.${choice.id}.label`, choice.label);
export const tavernRoomMood = (raw) => {
  const room = tavernRoomOf(raw);
  return t('tavern.room.mood', 'Warmth {warmth}/6 · Energy {energy}/6 · Tension {tension}/6', room);
};
export function tavernRoomResult(result) {
  if (result.backfire) return t('tavern.room.backfire', 'The room is too tense for that much excitement. Your attempt draws irritated replies.');
  const event = TAVERN_ROOM_EVENTS.find((e) => e.id === result.event);
  const choice = event?.choices.find((c) => c.id === result.choice);
  return choice ? t(`tavern.room.${event.id}.${choice.id}.result`, choice.result) : '';
}
