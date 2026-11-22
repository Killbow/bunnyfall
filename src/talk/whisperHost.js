// @ts-check
// BUNNYFALL WHISPER (Phase 4, the chat): PRIVATE LINES - a line to one player by name, said on the hub link
// (net/wire.js CHAT_LINE_CHANNELS 'whisper'; server/src/index.js _whisperLine routes it to that player and the sender).
//
//   /w /whisper /tell /msg <name> <text>   to a player - the start of a name is enough when only one player online
//                                          has a name that starts so; "quotes" around a full name with a space in it
//   /reply /re <text>                      to whoever last whispered you (or you last whispered)
//   a plain line typed on the Whispers tab  the same as /reply
//
// The Whispers tab (net/chat.js) joins the bar with the first private line sent or heard. A line I sent is drawn
// "To <name>"; a name nobody online wears comes back as a note. Blocked players are dropped by the log, as anywhere.
// The world host wires this in two places: its onSend asks `onSend` first, and the hub link's lines with ch 'whisper'
// go to `heard`.

/** The whisper commands, and the reply's. */
export const WHISPER_NAMES = Object.freeze(['w', 'whisper', 'tell', 'msg']);
export const REPLY_NAMES = Object.freeze(['reply', 're']);

/** A typed line read as a private line: `{ to, text }`, `{ reply: text }`, `{ error }`, or null for any other line. Pure. */
export function parseWhisper(line) {
  const m = /^\/([A-Za-z]+)(?:\s+([\s\S]*))?$/.exec(String(line ?? '').trim());
  if (!m) return null;
  const name = m[1].toLowerCase(), rest = (m[2] ?? '').trim();
  if (REPLY_NAMES.includes(name)) return rest ? { reply: rest } : { error: 'Type what to say after /reply.' };
  if (!WHISPER_NAMES.includes(name)) return null;
  const q = /^"([^"]+)"\s*([\s\S]*)$/.exec(rest);
  const to = q ? q[1].trim() : rest.split(/\s+/)[0] ?? '';
  const text = (q ? q[2] : rest.slice(to.length)).trim();
  if (!to) return { error: `Who to? /${name} <name> <text>` };
  if (!text) return { error: `Type what to say to ${to}.` };
  return { to, text };
}

/**
 * @param {{ log: () => any, link: () => any }} deps  the chat log, and the hub's session (the social link)
 */
export function createWhisperHost({ log, link }) {
  let partner = '';   // the name last whispered with, either way
  const note = (tabId, text) => log()?.push(tabId, { text, system: true });
  const show = () => { log()?.setShown?.('whisper', true); };
  const send = (to, text, from) => {
    const s = link();
    if (!s || s.status !== 'open') { note(from, 'Private lines need the online server.'); return false; }
    if (!s.sendChat(text, { ch: 'whisper', to })) return false;
    partner = to;
    show();
    return true;
  };

  return {
    /** A typed line: true/false/'read' when it was a private line (the host returns it as is), undefined otherwise. */
    onSend(tabId, text) {
      const w = parseWhisper(text);
      if (w && 'error' in w) { note(tabId, w.error); return false; }
      if (w && 'reply' in w) return partner ? send(partner, w.reply, tabId) : (note(tabId, 'Nobody to reply to yet. /w <name> <text>'), false);
      if (w) return send(w.to, w.text, tabId);
      if (tabId === 'whisper' && !String(text ?? '').trim().startsWith('/')) {
        return partner ? send(partner, text, tabId) : (note(tabId, 'Start with /w <name> <text>.'), false);
      }
      return undefined;
    },
    /** A line the hub said with ch 'whisper': to the Whispers tab. Always true (the line is taken). */
    heard(line) {
      show();
      if (line.miss) { note('whisper', line.miss === 'many' ? `More than one player online is called "${line.to}". Type more of the name.` : `Nobody online is called "${line.to}".`); return true; }
      if (line.mine) { if (line.to) partner = line.to; log()?.push('whisper', { ...line, name: `To ${line.to ?? '?'}` }); return true; }
      partner = line.name || partner;
      log()?.push('whisper', line);
      return true;
    },
  };
}
