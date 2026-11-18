import { selfUpdaterUrl } from '../net/selfHost.js';

export function staffDiscord(card, { h, session }) {
  const guildId = h('input', { inputMode: 'numeric', required: true, maxLength: 20, pattern: '[0-9]{17,20}' });
  const token = h('input', { type: 'password', required: true, autocomplete: 'new-password', maxLength: 256 });
  const status = h('p', { role: 'status' }, 'Checking Discord bot status…');
  const save = h('button', { type: 'submit', class: 'primary' }, 'Save and start bot');
  const disable = h('button', { type: 'button' }, 'Remove token and stop bot');
  const refresh = h('button', { type: 'button' }, 'Refresh status');

  const send = async (body) => {
    save.disabled = disable.disabled = refresh.disabled = true;
    try {
      const response = await fetch(`${selfUpdaterUrl()}/discord`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-staff-session': session() },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (response.status === 403) throw new Error('Sign in with the owner staff account.');
      if (response.status === 400) throw new Error('Check the bot token and Discord server ID.');
      if (!response.ok) throw new Error('Discord setup is unavailable on this host.');
      guildId.value = result.guildId ?? '';
      status.textContent = {
        online: 'Bot online.',
        starting: 'Bot starting. Refresh status in a few seconds.',
        offline: 'Bot offline. Check the token, server installation, and Message Content Intent.',
        unconfigured: 'No bot configured.',
        'dependencies-missing': 'Install discord-bot dependencies on the game host.',
      }[result.status] ?? 'Status unavailable.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Discord setup is unavailable.';
    } finally {
      save.disabled = disable.disabled = refresh.disabled = false;
    }
  };

  const form = h('form', { onsubmit: (event) => {
    event.preventDefault();
    const value = token.value;
    token.value = '';
    void send({ action: 'save', guildId: guildId.value, token: value });
  } },
  h('label', null, 'Discord server ID ', guildId),
  h('label', null, 'Discord bot token ', token),
  h('div', { class: 'row' }, save, disable, refresh));
  disable.onclick = () => { token.value = ''; void send({ action: 'save', disable: true }); };
  refresh.onclick = () => { void send({ action: 'status' }); };
  card.append(h('p', { class: 'dim' }, 'Enable Message Content Intent and install the bot in your Discord server before saving.'), form, status);
  void send({ action: 'status' });
}
