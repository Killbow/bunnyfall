// @ts-check
// Uploads pictures read at runtime for spell meshes into one shared texture archive, one record per picture. Records
// are numbered across all cast engines: they share one renderer, and it keeps the first picture uploaded under a key.

const SPELL_ART_ARCHIVE = 9921;
const ARTS = new Map();

export function spellArt(r, src, read, fallback = null) {
  const key = `${src.kind}:${src.archive}:${src.record}`;
  if (!ARTS.has(key)) ARTS.set(key, { record: ARTS.size, state: null });
  const a = ARTS.get(key), out = { key, art: { archive: SPELL_ART_ARCHIVE, record: a.record } };
  if (a.state === 'failed') return fallback && key !== `${fallback.kind}:${fallback.archive}:${fallback.record}` ? spellArt(r, fallback, read, fallback) : null;
  if (a.state === 'ready' && r.textures?.has(`${SPELL_ART_ARCHIVE}_${a.record}#opaque`)) return out;
  if (a.state === 'asking') return null;
  a.state = 'asking';
  read(src).then((picture) => {
    if (!picture) throw new Error(`Missing spell texture for ${key}`);
    r.uploadTexture(SPELL_ART_ARCHIVE, a.record, picture, { opaque: true });
    a.state = 'ready';
  }).catch((e) => { a.state = 'failed'; console.warn('[spells] Failed to load spell texture', e?.message ?? e); });
  return null;
}
