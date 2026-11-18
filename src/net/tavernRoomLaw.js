// @ts-check
// Encounters belong to a moment in the room, so any existing patron can host one.
const choice = (id, label, result, warmth, energy, tension) => ({ id, label, result, delta: { warmth, energy, tension } });
export const TAVERN_ROOM_EVENTS = Object.freeze([
  { id: 'tallTales', cue: 'A table is trading increasingly ridiculous stories. They leave a pause for you to join in.', choices: [
    choice('joke', 'Add an even more ridiculous ending.', 'Laughter rolls across the table. Nearby customers turn to listen.', 1, 2, 0),
    choice('listen', 'Ask how the story began.', 'The storyteller settles into the tale, pleased to have an audience.', 2, 0, -1),
    choice('scold', 'Tell them to stop making things up.', 'The laughter dies. The table turns back to its drinks.', -1, -1, 1),
  ] },
  { id: 'argument', cue: 'Two customers are arguing over whose city brews better ale. Their companions look uncomfortable.', choices: [
    choice('mediate', 'Give each city a compliment and change the subject.', 'Both sides accept the truce. Their companions visibly relax.', 2, -1, -2),
    choice('toast', 'Propose a toast to every brewer in the province.', 'They find something they can agree to drink to.', 1, 1, -1),
    choice('sides', 'Loudly declare a winner.', 'The losing side demands a rematch, and the argument grows louder.', -1, 2, 2),
  ] },
  { id: 'quiet', cue: 'Conversation has faded in this corner. A few travellers sit staring into their cups.', choices: [
    choice('ask', 'Ask what brought them here tonight.', 'A hesitant answer becomes a conversation that draws the table together.', 2, 1, -1),
    choice('space', 'Offer a kind word and give them some quiet.', 'They thank you for understanding. The silence feels more comfortable.', 1, -1, -1),
    choice('shout', 'Demand a cheer from the whole table.', 'A few reluctant voices answer. The others retreat into their cups.', -1, 2, 1),
  ] },
  { id: 'toast', cue: 'A customer raises a cup to celebrate a safe return from the road. The table waits for a few words.', choices: [
    choice('welcome', 'Toast those who made it home.', 'Cups rise around the table, and other travellers join the welcome.', 2, 1, -1),
    choice('rouse', 'Lead a loud call for another adventure.', 'The table answers with cheers and a thump of cups on wood.', 0, 2, 0),
    choice('warning', 'Remind them how dangerous the roads still are.', 'The celebration falters as they remember those still travelling.', -1, -1, 1),
  ] },
  { id: 'heckler', cue: 'A customer keeps interrupting the room with shouted jokes. A few people laugh; others are losing patience.', choices: [
    choice('include', 'Invite them to deliver one good line, then yield the floor.', 'Given a proper turn, the heckler takes a bow and lets the room move on.', 1, 1, -2),
    choice('boundary', 'Quietly ask them to let everyone enjoy the evening.', 'They lower their voice. Nearby customers give you grateful nods.', 1, -1, -2),
    choice('mock', 'Try to humiliate them with a sharper joke.', 'The table takes sides, and the heckling becomes a contest.', -1, 2, 2),
  ] },
  { id: 'chorus', cue: 'A few customers tap out a familiar chorus on the table. Others seem ready to join.', choices: [
    choice('lead', 'Lead the chorus and invite the next table in.', 'Voices join across the room, finding the rhythm together.', 1, 2, -1),
    choice('rhythm', 'Keep a gentle rhythm while they sing.', 'The singers find their confidence without drowning out the room.', 2, 1, -1),
    choice('silence', 'Insist that only guild performers may sing.', 'The tapping stops. A few customers exchange annoyed looks.', -2, -2, 1),
  ] },
  { id: 'spill', cue: 'A spilled drink has soaked a neighbouring sleeve. The embarrassed customer and its owner are staring at each other.', choices: [
    choice('help', 'Bring a cloth and help them put things right.', 'With the mess dealt with, an apology is accepted.', 2, -1, -2),
    choice('distract', 'Make a gentle joke about the thirsty table.', 'The embarrassed customer laughs, and the neighbour lets it pass.', 1, 1, -1),
    choice('blame', 'Demand to know who started it.', 'Both customers begin defending themselves at once.', -1, 1, 2),
  ] },
  { id: 'debate', cue: 'A table is debating which old ballad tells the truth. They ask for the guild bard’s opinion.', choices: [
    choice('versions', 'Invite them to share the different versions.', 'Each version earns a hearing. The debate becomes a shared discovery.', 2, 1, -1),
    choice('mystery', 'Suggest that a little mystery makes a better song.', 'They enjoy the thought and return to comparing their favourite verses.', 1, 0, -1),
    choice('dismiss', 'Tell them none of their versions are worth hearing.', 'The table falls silent. Nobody asks for another opinion.', -2, -1, 2),
  ] },
]);
/** The order whose customer can be worked: the one just served (one-step service), or a legacy shift's cup round trip. */
const roomOrderIndex = (state) => ['served', 'dirty'].includes(state?.phase) ? state.index
  : Number.isInteger(state?.lastServed?.index) && state.phase !== 'done' ? state.lastServed.index : -1;
const roomOrder = (state) => state?.orders?.[roomOrderIndex(state)] ?? null;
export const tavernRoomPatron = (state) => roomOrder(state)?.patron ?? null;
export const tavernRoomEvent = (state) => TAVERN_ROOM_EVENTS.find((e) => e.id === roomOrder(state)?.encounter) ?? null;
export const tavernRoomAvailable = (state) => !!tavernRoomEvent(state) && !roomOrder(state).roomChoice;
export const tavernRoomOf = (raw) => ({ warmth: raw?.warmth ?? 2, energy: raw?.energy ?? 2, tension: raw?.tension ?? 1 });
export const tavernRoomTip = (room) => Math.max(0, Math.min(6, room.warmth + room.energy - room.tension - 3));
export const tavernRoomMusicShare = (raw) => { const room = tavernRoomOf(raw); return Math.max(.8, Math.min(1.25, 1 + (room.warmth - 2) * .03 + (room.energy - 2) * .02 - (room.tension - 1) * .03)); };
export const tavernPatienceSeconds = (raw) => { const room = tavernRoomOf(raw); return 90 + (room.warmth >= 4 ? 15 : 0) - (room.energy >= 5 ? 15 : 0); };
/** Apply an authored response once; energetic approaches backfire in an already tense room. */
export function resolveTavernRoom(state, id) {
  if (!tavernRoomAvailable(state)) return null;
  const event = tavernRoomEvent(state), picked = event.choices.find((c) => c.id === id);
  if (!picked) return null;
  const room = tavernRoomOf(state.room);
  const backfire = room.tension >= 4 && picked.delta.energy >= 2;
  const delta = backfire ? { warmth: -1, energy: 1, tension: 1 } : picked.delta;
  for (const k of ['warmth', 'energy', 'tension']) room[k] = Math.max(0, Math.min(6, room[k] + delta[k]));
  state.room = room;
  roomOrder(state).roomChoice = id;
  return { event: event.id, choice: id, backfire };
}
