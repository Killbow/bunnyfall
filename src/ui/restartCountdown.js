// @ts-check
// BUNNYFALL: the server restart warning on the player's screen (net/restartLaw.js has the rules).
import { t } from '../systems/textManager.js';
import { RESTART_REMINDERS_S } from '../net/restartLaw.js';

const STYLE_ID = 'bf-restart-style';
const CSS = `
.bf-restart { position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); z-index: 2147483000; pointer-events: none;
  max-width: calc(100vw - 32px); padding: 6px 14px; background: rgba(10,12,17,0.85); border: 2px solid #d9b45a;
  color: #f0e6c8; font: 14px/1.4 monospace; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bf-restart[hidden] { display: none; }
`;
/** A countdown the hub says again within this much of the one shown is the same countdown. */
const SAME_MS = 5000;
/** How long the banner stays up after zero, saying the restart is under way. */
const AFTER_MS = 60_000;
/** The gap between the banner and the hotbar: room for the item name the bar shows above itself (.hb-caption). */
const ABOVE_BAR_PX = 34;

/** "5 minutes", "1 minute", "30 seconds" - for chat. @param {number} s */
function spoken(s) {
  if (s >= 60) {
    const m = Math.round(s / 60);
    return m === 1 ? t('restart.oneMinute', '1 minute') : t('restart.minutes', '{n} minutes', { n: m });
  }
  return s === 1 ? t('restart.oneSecond', '1 second') : t('restart.seconds', '{n} seconds', { n: s });
}
/** "4:05" - for the banner. @param {number} s */
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** @type {ReturnType<typeof create> | null} */
let page = null;

/**
 * The hub said a restart is `ms` away (0: none pending). `say` puts a line in chat on every tab.
 * @param {number} ms @param {(text: string) => void} say
 */
export function hearRestart(ms, say) {
  if (typeof document === 'undefined') return;
  page ??= create(document, () => Date.now());
  page.say = say;
  page.hear(ms);
}

/** @param {Document} doc @param {() => number} now */
function create(doc, now) {
  if (!doc.getElementById(STYLE_ID)) {
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    doc.head.append(s);
  }
  const box = doc.createElement('div');
  box.className = 'bf-restart';
  box.setAttribute('role', 'status');
  box.hidden = true;
  doc.body.append(box);

  let end = 0;                 // when the restart is due (this page's clock), 0 for none
  let marks = /** @type {number[]} */ ([]);   // reminders still to say, in seconds before the restart, largest first
  let timer = /** @type {any} */ (null);

  const self = {
    /** @type {(text: string) => void} */ say: () => {},
    /** @param {number} ms */
    hear(ms) {
      if (!ms) {
        if (end && end > now()) self.say(t('restart.cancelled', 'The server restart has been called off.'));
        stop();
        return;
      }
      const due = now() + ms;
      if (end && Math.abs(due - end) < SAME_MS) return;
      end = due;
      const left = Math.round(ms / 1000);
      marks = RESTART_REMINDERS_S.filter((s) => s < left - 2);
      self.say(t('restart.announce', 'The server will restart in {time}. Find a safe place to stop.', { time: spoken(left) }));
      clearInterval(timer);
      timer = setInterval(tick, 250);
      tick();
    },
  };

  function place() {
    const bar = doc.querySelector('.hb:not(.hb-quad)');
    const r = bar?.getBoundingClientRect();
    const view = doc.defaultView;
    if (!r || !view || r.width === 0 || r.height === 0) { box.style.bottom = ''; box.style.left = ''; return; }
    box.style.bottom = `${Math.max(0, view.innerHeight - r.top + ABOVE_BAR_PX)}px`;
    box.style.left = `${r.left + r.width / 2}px`;
  }

  function tick() {
    place();
    const left = Math.ceil((end - now()) / 1000);
    if (left > 0) {
      box.textContent = t('restart.banner', 'Server restart in {time}', { time: clock(left) });
      box.hidden = false;
      while (marks.length && left <= marks[0]) {
        const s = /** @type {number} */ (marks.shift());
        if (left >= s - 2) self.say(t('restart.reminder', 'Server restart in {time}.', { time: spoken(s) }));
      }
      return;
    }
    if (left > -AFTER_MS / 1000) {
      marks = [];
      if (box.textContent !== t('restart.now', 'Server restarting now...')) {
        box.textContent = t('restart.now', 'Server restarting now...');
        self.say(t('restart.nowChat', 'The server is restarting now. You will reconnect on your own.'));
      }
      box.hidden = false;
      return;
    }
    stop();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    end = 0;
    marks = [];
    box.hidden = true;
    box.textContent = '';
  }

  return self;
}
