export const GRAVESTONE_PHRASES = Object.freeze([
  'Here lies one the plague did not ask twice.',
  'The stone is worn smooth. Only "beloved" still reads.',
  'Born in one age, buried in another.',
  'A merchant, honest by the end.',
  'Taken by the road, brought home by it too.',
  'No name. The moss took it first.',
  'They said the wolves would not come this far.',
  'Rest well. The vault beneath answers no knock.',
  'A soldier who never once drew steel in anger.',
  'The dates are close together. The winter, they say.',
  'Carved by a hand that loved them, and could not spell.',
  'Do not linger past dusk to read the rest.',
  'A debt is owed here, and no one living remembers whose.',
  'This one, they buried facing east. No one recalls why.',
  'Once a name here. Now only a shape in the stone.',
  'The ground is soft. Something was dug, and something was put back.',
]);

export function randomEpitaph(rolls = Math.random) {
  const i = Math.floor(rolls() * GRAVESTONE_PHRASES.length);
  return GRAVESTONE_PHRASES[Math.min(i, GRAVESTONE_PHRASES.length - 1)];
}
