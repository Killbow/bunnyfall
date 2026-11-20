// BUNNYFALL CHAT-REWORK (2026-11-20, the owner: "i would also like to make it detached in its own window with a small
// button"): THE CHAT IN ITS OWN WINDOW.
//
// A real second window: `window.open` of a small page of our own (public/chat-popout.html) on the game's own origin -
// in the browser a popup, in the desktop app a child window (app/main.cjs lets dagger:// pages open). Same origin, so
// the game reaches into that page's document and MOVES the chat's box into it: the very nodes, with their listeners,
// so the window is the chat itself, live on the game's state, sending and receiving through the same doors. Nothing
// is copied and nothing is mirrored.
//
// This file is the window's life only: opening it, noticing its page is up (asked each frame - the first document of a
// fresh window is an empty about:blank, the page comes after), noticing it went (closed by hand, reloaded, or the
// game's own page leaving, which closes it), and closing it. Moving the box in and out is the panel's
// (ui/chatPanel.js), told through `onReady` and `onGone`.
//
// If the game's page reloads or closes, the window is closed with it (`pagehide`); a window the game could not close
// (a browser that refuses) says so on its own page (the page's script watches its opener) and closes itself.

/** The window's name: one chat window per game page - a second press finds the first. */
export const CHAT_POPOUT_NAME = 'bunnyfall-chat';
/** A window whose page is not up by then is given up on (a blocked load, a refused child window). */
export const CHAT_POPOUT_WAIT_MS = 15000;

/** The page's address beside the game's: the game is `<site>/play/`, the page `<site>/chat-popout.html`. */
export function chatPopoutUrl(href) {
  try { return new URL('../chat-popout.html', new URL('.', href)).href; } catch { return 'chat-popout.html'; }
}

/**
 * @param {object} o
 * @param {any} o.win  the game's window
 * @param {(pop: any, wrap: any) => void} o.onReady  the page is up: `wrap` is where the chat goes
 * @param {() => void} o.onGone  the window went (or never came): the chat comes home
 * @param {() => number} [o.now]
 */
export function createChatPopout({ win, onReady, onGone, now = () => Date.now() }) {
  let pop = null;
  let state = null;   // null | 'opening' | 'open'
  let since = 0;
  let offHide = null;

  const gone = () => {
    if (!state) return;
    state = null;
    offHide?.(); offHide = null;
    onGone?.();
  };
  // the game's page leaving takes its window with it: its nodes' listeners belong to this page and die with it
  const onPageHide = () => { try { pop?.close?.(); } catch { /* already gone */ } };
  win.addEventListener?.('pagehide', onPageHide);

  return {
    /** Open the window (or bring back the one that stands). False when the browser refused a window. */
    open() {
      if (state) { try { pop?.focus?.(); } catch { /* gone */ } return true; }
      if (typeof win.open !== 'function') return false;
      let w = null;
      try { w = win.open(chatPopoutUrl(win.location?.href ?? ''), CHAT_POPOUT_NAME, 'popup=yes,width=560,height=640'); } catch { w = null; }
      if (!w) return false;
      pop = w;
      state = 'opening';
      since = now();
      return true;
    },
    /** Once a frame (the game's, and the window's own while it is up): its page come up, or the window gone. */
    frame() {
      if (!state) return;
      let closed = true;
      try { closed = !pop || pop.closed; } catch { closed = true; }
      if (closed) { gone(); return; }
      if (state !== 'opening') return;
      let wrap = null;
      try { const d = pop.document; wrap = d && d.readyState !== 'loading' ? d.getElementById('dfchat-pop') : null; } catch { wrap = null; }
      if (wrap) {
        state = 'open';
        // the window closed or reloaded: what it held comes home before its page goes, and a reloaded window (an empty
        // page now) is closed rather than left standing with no chat in it
        const w = pop;
        const hide = () => { gone(); try { w.close(); } catch { /* gone */ } };
        pop.addEventListener('pagehide', hide);
        offHide = () => { try { pop.removeEventListener('pagehide', hide); } catch { /* gone */ } };
        onReady?.(pop, wrap);
        return;
      }
      if (now() - since > CHAT_POPOUT_WAIT_MS) { try { pop.close(); } catch { /* gone */ } gone(); }
    },
    /** Close the window: the chat comes home first. */
    close() {
      const w = pop;
      gone();
      try { w?.close?.(); } catch { /* gone */ }
    },
    focus() { try { pop?.focus?.(); } catch { /* gone */ } },
    /** null, 'opening' or 'open'. */
    state: () => state,
    view: () => (state === 'open' ? pop : null),
    destroy() {
      win.removeEventListener?.('pagehide', onPageHide);
      const w = pop;
      gone();
      try { w?.close?.(); } catch { /* gone */ }
    },
  };
}
