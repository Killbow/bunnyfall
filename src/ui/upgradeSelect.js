/**
 * An in-window picker with an explicit empty choice before a purchase. It is not a native <select>: the desktop app
 * clips a native popup to its window and a size>1 listbox inside a scrolling pane swallows the wheel, so a long list
 * could not be scrolled to its end. This list scrolls on its own, always, and drops nothing.
 * It keeps the select's small surface: `.value` ('' or the choice's index), `.onchange`, `.disabled`, `.focus()`.
 * @param {string} label @param {any[]} choices @param {(choice: any) => string} describe
 */
export function upgradeSelect(label, choices, describe) {
  ensureStyle();
  const list = document.createElement('div');
  list.className = 'choice-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  list.tabIndex = 0;
  const rows = [];
  let value = '';
  const paint = () => {
    rows.forEach((row) => {
      const on = row.dataset.value === value;
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      row.classList.toggle('on', on);
    });
  };
  const pick = (next) => {
    if (next === value || list.disabled) return;
    value = next;
    paint();
    list.dispatchEvent(new window.Event('change'));
    list.onchange?.(new window.Event('change'));
  };
  const append = (text, key) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'choice-row';
    row.setAttribute('role', 'option');
    row.dataset.value = key;
    row.textContent = text;
    row.addEventListener('click', (e) => { e.stopPropagation(); pick(key === value ? '' : key); });
    rows.push(row);
    list.append(row);
  };
  append(label, '');
  rows[0].hidden = true;
  choices.forEach((choice, index) => append(describe(choice), String(index)));
  Object.defineProperties(list, {
    value: { get: () => value, set: (v) => { value = String(v ?? ''); paint(); } },
    disabled: {
      get: () => list.getAttribute('aria-disabled') === 'true',
      set: (v) => { list.setAttribute('aria-disabled', v ? 'true' : 'false'); rows.forEach((row) => { row.disabled = !!v; }); },
    },
  });
  paint();
  return list;
}

/** The list's look: its own scroll, a clear selected row. Injected once, for every window that builds one. */
const CHOICE_LIST_CSS = `
.choice-list { display: block; box-sizing: border-box; width: 100%; max-width: 100%; margin-top: 4px; max-height: 220px;
  overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--brass, #846b45); background: #171b20; }
.choice-list:focus-visible { outline: 1px solid var(--brass, #c08a3e); }
.choice-list .choice-row { display: block; width: 100%; padding: 3px 8px; text-align: left; font: inherit; font-size: 12px;
  color: var(--bone, #e9e4d9); background: transparent; border: 0; cursor: pointer; }
.choice-list .choice-row:hover { background: rgba(192,138,62,0.16); }
.choice-list .choice-row.on { background: rgba(192,138,62,0.32); color: #efe0b8; }
.choice-list .choice-row:disabled { opacity: 0.5; cursor: default; }
`;
function ensureStyle() {
  if (document.getElementById('choice-list-css')) return;
  const style = document.createElement('style');
  style.id = 'choice-list-css';
  style.textContent = CHOICE_LIST_CSS;
  document.head.append(style);
}
