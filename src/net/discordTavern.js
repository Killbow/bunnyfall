import { call } from './accountClient.js';
import { t } from '../ui/textManager.js';

const path = '/v1/integrations/discord/game';

export function discordTavern(log, io, character, active) {
  let after = 0;
  let next = 0;
  let polling = false;
  let enabled = false;
  let sending = false;
  const note = (tab, text) => log.push(tab, { text, system: true });
  const request = async (body) => {
    const session = io();
    return session?.secret ? call(session, path, { ...body, character }) : { ok: false };
  };
  return {
    frame(now) {
      if (!active() || polling || now < next) return;
      next = now + 5000;
      polling = true;
      void request({ action: 'read', after }).then((result) => {
        if (!active()) return;
        if (!result.ok) return;
        enabled = result.data.enabled;
        log.setShown('tavern', enabled);
        if (!enabled) return;
        after = result.data.cursor;
        for (const line of result.data.lines) {
          const name = line.source === 'discord' ? `${line.name} [Discord]` : line.name;
          log.push('tavern', { name, text: line.text, at: line.at * 1000, sub: line.sub });
        }
      }).catch(() => {}).finally(() => { polling = false; });
    },
    send(text, from) {
      if (!active() || !enabled || sending) return false;
      sending = true;
      const refused = () => note(from, t('chat.tavern.sendFailed', 'Tavern could not send your message. Please try again.'));
      void request({ action: 'say', text, event: globalThis.crypto.randomUUID() })
        .then((result) => { if (!result.ok) refused(); else next = 0; })
        .catch(refused).finally(() => { sending = false; });
      return true;
    },
    link(text, tab) {
      const match = /^\/discordlink\s+([0-9a-f]{16})\s*$/i.exec(text);
      if (!/^\/discordlink(?:\s|$)/i.test(text)) return false;
      if (!match || !active()) {
        note(tab, t('chat.tavern.linkUsage', 'While playing online, use /discordlink followed by your private Discord code.'));
        return true;
      }
      const refused = () => note(tab, t('chat.tavern.linkFailed', 'Could not link. Check the code or unlink the existing Discord account.'));
      void request({ action: 'link', code: match[1] }).then((result) => {
        if (!result.ok) refused();
        else note(tab, t('chat.tavern.linked', 'Discord linked to this character.'));
      }).catch(refused);
      return true;
    },
  };
}
