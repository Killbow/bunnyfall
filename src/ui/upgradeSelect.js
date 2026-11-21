/** A native picker with an explicit empty choice before a purchase. */
export function upgradeSelect(label, choices, describe) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  const append = (text, value) => {
    const option = document.createElement('option');
    option.textContent = text;
    option.value = value;
    select.append(option);
  };
  append(label, '');
  choices.forEach((choice, index) => append(describe(choice), String(index)));
  return select;
}
