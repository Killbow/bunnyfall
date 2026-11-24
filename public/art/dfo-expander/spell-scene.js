// Artwork from https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/blob/495dd7e8c9dda7a2bb554306435654637cfa5b2a/src/mod/page/dfo_spellmaker_viz.js
const renderer = (function () {
  'use strict';

  const DEFAULT_WIDTH = 350;
  const DEFAULT_HEIGHT = 281;

  // Canonical magic school palette matching spellmaker-effects-catalog.js (IDs 22..27).
  const SCHOOLS = Object.freeze({
    22: {
      id: 22,
      key: 'destruction',
      ru: 'Разрушение',
      en: 'Destruction',
      primary: '#f87171',
      secondary: '#fb923c',
      core: '#fee2e2',
      deep: '#7f1d1d',
      glowRgb: '248, 113, 113',
      accentRgb: '251, 146, 60',
    },
    23: {
      id: 23,
      key: 'restoration',
      ru: 'Восстановление',
      en: 'Restoration',
      primary: '#fcd34d',
      secondary: '#f59e0b',
      core: '#fef9c3',
      deep: '#78350f',
      glowRgb: '252, 211, 77',
      accentRgb: '254, 243, 199',
    },
    24: {
      id: 24,
      key: 'illusion',
      ru: 'Иллюзия',
      en: 'Illusion',
      primary: '#10d998',
      secondary: '#0d9488',
      core: '#ccfbf1',
      deep: '#022c22',
      glowRgb: '16, 217, 152',
      accentRgb: '20, 184, 166',
    },
    25: {
      id: 25,
      key: 'alteration',
      ru: 'Изменение',
      en: 'Alteration',
      primary: '#68e422',
      secondary: '#c4da26',
      core: '#f6ffbc',
      deep: '#243c0c',
      glowRgb: '104, 228, 34',
      accentRgb: '196, 218, 38',
    },
    26: {
      id: 26,
      key: 'thaumaturgy',
      ru: 'Тауматургия',
      en: 'Thaumaturgy',
      primary: '#60a5fa',
      secondary: '#38bdf8',
      core: '#dbeafe',
      deep: '#1e3a8a',
      glowRgb: '96, 165, 250',
      accentRgb: '56, 189, 248',
    },
    27: {
      id: 27,
      key: 'mysticism',
      ru: 'Мистицизм',
      en: 'Mysticism',
      primary: '#9333ea',
      secondary: '#c084fc',
      core: '#f3e8ff',
      deep: '#2e1065',
      glowRgb: '147, 51, 234',
      accentRgb: '192, 132, 252',
    },
  });

  const SCHOOL_ORDER = Object.freeze([22, 23, 24, 25, 26, 27]);

  // Destruction elemental variants (canonical IDs matching spellmaker-data.js: 0 fire, 1 cold, 2 poison, 3 shock, 4 magic).
  const DESTRUCTION_ELEMENTS = Object.freeze({
    0: {
      id: 0,
      key: 'fire',
      ru: 'Огонь',
      en: 'Fire',
      primary: '#fb923c',
      secondary: '#f97316',
      core: '#fef9c3',
      deep: '#431407',
      glowRgb: '251, 146, 60',
      accentRgb: '234, 88, 12',
    },
    1: {
      id: 1,
      key: 'cold',
      ru: 'Холод',
      en: 'Cold',
      primary: '#38bdf8',
      secondary: '#7dd3fc',
      core: '#f0f9ff',
      deep: '#0c4a6e',
      glowRgb: '56, 189, 248',
      accentRgb: '125, 211, 252',
    },
    2: {
      id: 2,
      key: 'poison',
      ru: 'Яд',
      en: 'Poison',
      primary: '#4ade80',
      secondary: '#84cc16',
      core: '#ecfccb',
      deep: '#052e16',
      glowRgb: '74, 222, 128',
      accentRgb: '132, 204, 22',
    },
    3: {
      id: 3,
      key: 'shock',
      ru: 'Электричество',
      en: 'Shock',
      primary: '#e0f2fe',
      secondary: '#93c5fd',
      core: '#ffffff',
      deep: '#172554',
      glowRgb: '186, 224, 255',
      accentRgb: '105, 180, 255',
    },
    4: {
      id: 4,
      key: 'magic',
      ru: 'Магия',
      en: 'Magic',
      primary: '#38bdf8',
      secondary: '#2563eb',
      core: '#e0f2fe',
      deep: '#081b4b',
      glowRgb: '56, 165, 255',
      accentRgb: '37, 99, 235',
    },
  });

  // Requested showcase order for Destruction elements: Огонь, Холод, Электричество, Магия, Яд.
  const DESTRUCTION_ELEMENT_ORDER = Object.freeze([0, 1, 3, 4, 2]);

  // Tightly localized illumination & brightness progression by active effect count (0..3)
  const SPELL_POWER_PROFILE = Object.freeze({
    0: { power: 0.00, coreAlpha: 0.00, auraR: 0, auraAlpha: 0.00, roomRadius: 0, roomErase: 0.00, bookSpotR: 0, bookErase: 0.00, colorTint: 0.00, colorWash: 0.00, sparkle: 0.00 },
    1: { power: 0.38, coreAlpha: 0.72, auraR: 20, auraAlpha: 0.12, roomRadius: 48, roomErase: 0.36, bookSpotR: 40, bookErase: 0.34, colorTint: 0.55, colorWash: 0.16, sparkle: 0.16 },
    2: { power: 0.68, coreAlpha: 0.86, auraR: 31, auraAlpha: 0.21, roomRadius: 68, roomErase: 0.52, bookSpotR: 56, bookErase: 0.48, colorTint: 0.70, colorWash: 0.25, sparkle: 0.40 },
    3: { power: 1.00, coreAlpha: 1.00, auraR: 44, auraAlpha: 0.32, roomRadius: 90, roomErase: 0.68, bookSpotR: 72, bookErase: 0.64, colorTint: 0.84, colorWash: 0.35, sparkle: 0.65 },
  });

  // 6 used candles around the book: fresh -> slight -> half -> heavily burned -> short stub -> melted stub in wax pool.
  const CANDLE_LAYOUT = [
    { id: 3, x: 282, y: 179, h: 19.0, r: 3.9, wear: 'half', slant: -1.6, drips: [0.35, 0.72], hasDish: true, puddle: 0.20, phase: 2.1 },
    { id: 1, x: 68, y: 180, h: 33.5, r: 3.8, wear: 'fresh', slant: 0.2, drips: [0.18], hasDish: true, puddle: 0.00, phase: 0.4 },
    { id: 2, x: 42, y: 204, h: 25.0, r: 3.9, wear: 'slight', slant: -0.5, drips: [0.45], hasDish: true, puddle: 0.08, phase: 1.3 },
    { id: 5, x: 306, y: 204, h: 8.8, r: 4.3, wear: 'stump', slant: 1.4, drips: [0.65, 0.88, 0.50], hasDish: true, puddle: 0.45, phase: 3.8 },
    { id: 4, x: 84, y: 233, h: 13.0, r: 4.2, wear: 'heavy', slant: -1.1, drips: [0.75, 0.90], hasDish: true, puddle: 0.30, phase: 5.0 },
    { id: 6, x: 263, y: 234, h: 4.8, r: 4.6, wear: 'ogarek', slant: 0.9, drips: [0.95], hasDish: false, puddle: 1.00, phase: 4.2 },
  ];

  // Partition the 6 candles into 3 disjoint random pairs (1 pair per spell slot 0..2),
  // generated once per window/module session so candle pairs persist while the window lives.
  function createShuffledCandlePairs(rngFn) {
    const rnd = typeof rngFn === 'function' ? rngFn : Math.random;
    const pool = [0, 1, 2, 3, 4, 5];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return [
      [pool[0], pool[1]],
      [pool[2], pool[3]],
      [pool[4], pool[5]],
    ];
  }

  const SESSION_CANDLE_PAIR_BY_SLOT = createShuffledCandlePairs();

  // Book Page Template Registries (6 Mystical Occult Illustrations + 4 Grimoire Texts)
  // Structured cleanly so external image references can replace or extend draw() handlers later.
  const BOOK_OCCULT_TEMPLATES = Object.freeze([
    { id: 'occult_1', kind: 'occult', ru: 'Оккульт 1: Пентаграмма печати', desc: 'Двойной круг сдерживания с пятиконечной звездой и рунами по углам' },
    { id: 'occult_2', kind: 'occult', ru: 'Оккульт 2: Сфера солнца и луны', desc: 'Небесная сфера Этериуса с орбитами, полумесяцем и лучами' },
    { id: 'occult_3', kind: 'occult', ru: 'Оккульт 3: Всевидящее Око', desc: 'Герметическая пирамида, лучистое око и алхимические рога луны' },
    { id: 'occult_4', kind: 'occult', ru: 'Оккульт 4: Древо связей', desc: '7-узловая матрица сфер и пересекающихся силовых линий' },
    { id: 'occult_5', kind: 'occult', ru: 'Оккульт 5: Уроборос и Ключ', desc: 'Кольцо змея, гексаграмма и ритуальный ключ/кинжал по центру' },
    { id: 'occult_6', kind: 'occult', ru: 'Оккульт 6: Астральная фигура', desc: 'Круг-квадрат трансмутации и сигил вписанного астрального тела' },
  ]);

  const BOOK_TEXT_TEMPLATES = Object.freeze([
    { id: 'text_1', kind: 'text', ru: 'Текст 1: Манускрипт с инициалом', desc: 'Буквица в золотой рамке, волнистые абзацы заклинания и красные пометы' },
    { id: 'text_2', kind: 'text', ru: 'Текст 2: Двухколонный трактат', desc: 'Две плотные колонки с красным заголовком, знаками ¶ и делителем' },
    { id: 'text_3', kind: 'text', ru: 'Текст 3: Ритуал и маргиналии', desc: 'Строфы распева по центру и боковые глоссы в скобках на широких полях' },
    { id: 'text_4', kind: 'text', ru: 'Текст 4: Каталог рун', desc: 'Индекс оккультных значков-миниатюр с описаниями и разделителями' },
  ]);

  const ALL_PAGE_TEMPLATES = Object.freeze([...BOOK_OCCULT_TEMPLATES, ...BOOK_TEXT_TEMPLATES]);

  // Curated book spread pairings cycled naturally by pageSeed after sporadic page-flip bursts
  const BOOK_SPREAD_PRESETS = Object.freeze([
    { left: 'text_1', right: 'occult_1' },
    { left: 'occult_2', right: 'text_2' },
    { left: 'text_3', right: 'occult_3' },
    { left: 'occult_4', right: 'text_4' },
    { left: 'text_2', right: 'occult_5' },
    { left: 'occult_6', right: 'text_1' },
    { left: 'occult_1', right: 'occult_3' },
    { left: 'text_4', right: 'occult_2' },
    { left: 'occult_5', right: 'text_3' },
    { left: 'text_1', right: 'occult_6' },
  ]);

  function hash01(seed) {
    const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function quadVal(p0, p1, p2, t) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getSchoolMeta(entry) {
    if (entry == null) return null;
    const rawId = typeof entry === 'object' ? Number(entry.school ?? entry.schoolId ?? entry.id) : Number(entry);
    return SCHOOLS[rawId] || null;
  }

  function getElementMeta(entry) {
    const raw = (entry != null && typeof entry === 'object')
      ? (entry.element ?? entry.elementId ?? entry.elem)
      : entry;
    if (raw == null) return DESTRUCTION_ELEMENTS[0];
    if (typeof raw === 'string') {
      const low = raw.toLowerCase().trim();
      for (let i = 0; i < DESTRUCTION_ELEMENT_ORDER.length; i++) {
        const em = DESTRUCTION_ELEMENTS[DESTRUCTION_ELEMENT_ORDER[i]];
        if (em.key === low || em.ru.toLowerCase() === low || em.en.toLowerCase() === low || String(em.id) === low) {
          return em;
        }
      }
    }
    return DESTRUCTION_ELEMENTS[Number(raw)] || DESTRUCTION_ELEMENTS[0];
  }

  function getSlotResolvedMeta(entry) {
    const school = getSchoolMeta(entry);
    if (!school) return null;
    if (school.id !== 22) return school;
    const el = getElementMeta(entry);
    return {
      ...school,
      element: el,
      elementId: el.id,
      elementKey: el.key,
      primary: el.primary,
      secondary: el.secondary,
      core: el.core,
      deep: el.deep,
      glowRgb: el.glowRgb,
      accentRgb: el.accentRgb,
    };
  }

  function analyzeSlots(slots, candlePairs) {
    const arr = Array.isArray(slots) ? slots : [];
    const normalized = [getSlotResolvedMeta(arr[0]), getSlotResolvedMeta(arr[1]), getSlotResolvedMeta(arr[2])];
    const active = [];
    const seenIds = new Set();
    const uniqueSchools = [];
    for (let i = 0; i < 3; i++) {
      const m = normalized[i];
      if (!m) continue;
      active.push({ slotIndex: i, school: m });
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueSchools.push(m);
      }
    }

    const pairsSrc = Array.isArray(candlePairs) && candlePairs.length === 3
      ? candlePairs
      : SESSION_CANDLE_PAIR_BY_SLOT;
    const candleAssignments = new Array(CANDLE_LAYOUT.length);
    const slotPairs = [];
    let litCandleCount = 0;

    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const pair = Array.isArray(pairsSrc[sIdx]) ? pairsSrc[sIdx] : [];
      const slotSchool = normalized[sIdx];
      const indices = [];
      for (let p = 0; p < pair.length; p++) {
        const cIdx = pair[p];
        if (cIdx < 0 || cIdx >= CANDLE_LAYOUT.length) continue;
        indices.push(cIdx);
        candleAssignments[cIdx] = {
          candleIndex: cIdx,
          candleId: CANDLE_LAYOUT[cIdx].id,
          slotIndex: sIdx,
          school: slotSchool,
        };
        if (slotSchool) litCandleCount++;
      }
      slotPairs.push({
        slotIndex: sIdx,
        candleIndices: indices,
        candleIds: indices.map((ci) => CANDLE_LAYOUT[ci].id),
        school: slotSchool,
      });
    }

    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      if (!candleAssignments[i]) {
        candleAssignments[i] = { candleIndex: i, candleId: CANDLE_LAYOUT[i].id, slotIndex: -1, school: null };
      }
    }

    const powerProfile = SPELL_POWER_PROFILE[clamp(active.length, 0, 3)];
    return {
      slots: normalized,
      slot1School: normalized[0],
      active,
      uniqueSchools,
      activeCount: active.length,
      distinctCount: uniqueSchools.length,
      isSynthesis: uniqueSchools.length >= 2,
      powerProfile,
      candleAssignments,
      slotPairs,
      litCandleCount,
    };
  }

  function getSlot1LightProfile(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const s0 = analysis && analysis.slot1School;
    const restoCount = slots.filter((s) => s && s.id === 23).length;
    const hasRestoSlot1 = Boolean(s0 && s0.id === 23);

    let spellGlowMult = 1.0;
    let chamberRadiusMult = 1.0;
    let chamberEraseMult = 1.0;
    let washMult = 1.0;

    if (s0 && s0.id === 22) {
      if (s0.elementKey === 'shock') {
        spellGlowMult = 1.12; chamberRadiusMult = 1.10; chamberEraseMult = 1.10; washMult = 1.10;
      } else if (s0.elementKey === 'fire' || s0.elementKey === 'magic') {
        spellGlowMult = 0.72; chamberRadiusMult = 0.85; chamberEraseMult = 0.84; washMult = 0.82;
      }
    }

    // Restoration magic: +10% light intensity per Restoration effect row (+10% / +20% / +30%)
    if (restoCount > 0) {
      const restoBoost = 1.0 + 0.10 * restoCount;
      spellGlowMult *= restoBoost;
      chamberRadiusMult *= restoBoost;
      chamberEraseMult *= restoBoost;
      washMult *= restoBoost;
    }

    return { spellGlowMult, chamberRadiusMult, chamberEraseMult, washMult, hasRestoSlot1, restoCount };
  }

  // Exact geometry, thickness, surface patterns & dual-axis spin multipliers for Restoration Magic (id === 23) across Slots 1-3:
  // - Slot 2: thin translucent golden 3D hoop at +45 deg, diamonds+dots pattern, 1x spin & 2nd-axis tumble (thick + brighter + 3x when Slot 3 is also Restoration)
  // - Slot 3: thin translucent golden 3D hoop at -45 deg one layer higher, chevrons+pillars pattern, 1x (2x when Slot 2 is also Restoration)
  // - Triple Restoration (Slots 1+2+3): middle hoop at 0 deg midway between Slot 2 & 3, braided wave+pearls pattern, exact midpoint thickness & 2.5x speed!
  function computeRestorationConfig(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const r0 = Boolean(slots[0] && slots[0].id === 23);
    const r1 = Boolean(slots[1] && slots[1].id === 23);
    const r2 = Boolean(slots[2] && slots[2].id === 23);
    const has23Synergy = r1 && r2;
    const hasTriple = r0 && r1 && r2;
    const BASE_SPIN = 0.56;
    const BASE_ORBIT = 0.30;
    const THIN_HALF_H = 2.6;
    const THICK_HALF_H = 4.4;
    const MID_HALF_H = (THIN_HALF_H + THICK_HALF_H) * 0.5; // 3.5

    return {
      r0,
      r1,
      r2,
      has23Synergy,
      hasTriple,
      baseSpin: BASE_SPIN,
      baseOrbit: BASE_ORBIT,
      slot2: r1 ? {
        id: 'slot2',
        patternType: 'diamonds_dots',
        ringRMult: 1.44,
        tiltZDeg: 45,
        tiltZRad: Math.PI / 4,
        pitchXRad: 1.06,
        bandHalfH: has23Synergy ? THICK_HALF_H : THIN_HALF_H,
        speedMult: has23Synergy ? 3.0 : 1.0,
        spinDir: 1,
        orbitDir: 1,
        orbitPhase: 0.25,
        patternGain: has23Synergy ? 1.65 : 1.0,
        godrayGain: has23Synergy ? 1.85 : 1.0,
        cellCount: 16,
        baseSpin: BASE_SPIN,
        baseOrbit: BASE_ORBIT,
      } : null,
      middle: hasTriple ? {
        id: 'middle',
        patternType: 'wave_pearls',
        ringRMult: 1.74,
        tiltZDeg: 0,
        tiltZRad: 0,
        pitchXRad: 1.12,
        bandHalfH: MID_HALF_H,
        speedMult: 2.5,
        spinDir: 1,
        orbitDir: -1,
        orbitPhase: 1.15,
        patternGain: 1.35,
        godrayGain: 1.45,
        cellCount: 14,
        baseSpin: BASE_SPIN,
        baseOrbit: BASE_ORBIT,
      } : null,
      slot3: r2 ? {
        id: 'slot3',
        patternType: 'chevrons_bars',
        ringRMult: 2.04,
        tiltZDeg: -45,
        tiltZRad: -Math.PI / 4,
        pitchXRad: 1.06,
        bandHalfH: THIN_HALF_H,
        speedMult: has23Synergy ? 2.0 : 1.0,
        spinDir: -1,
        orbitDir: -1,
        orbitPhase: 0.45,
        patternGain: 1.0,
        godrayGain: 1.0,
        cellCount: 18,
        baseSpin: BASE_SPIN,
        baseOrbit: BASE_ORBIT,
      } : null,
    };
  }

  // --- ILLUSION MAGIC (id === 24): Cold Emerald Morphing Crystal, Icosahedron (12v/20f), 42-Face Icosphere & Layer-3 Dual Polygonal Hoops ---
  function computeIllusionConfig(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const i0 = Boolean(slots[0] && slots[0].id === 24);
    const i1 = Boolean(slots[1] && slots[1].id === 24);
    const i2 = Boolean(slots[2] && slots[2].id === 24);
    const isTriad = i0 && i1 && i2;
    // Slot 1 is NOT Illusion while BOTH Slot 2 and Slot 3 are Illusion:
    // Slot 2 KEEPS its original 12-vertex icosahedron, while Layer 3 (Slot 3) manifests 2 polygonal hoops outside it!
    const isDualHoops = !i0 && i1 && i2;

    const dualHoopsList = isDualHoops ? [
      {
        id: 'illusion_hoop_inner',
        kind: 'hoop',
        ringRMult: 1.84,       // Layer 3 inner hoop (outside Slot 2 icosahedron at 1.40); slower (1.0x) = slightly smaller
        bandHalfH: 3.6,
        segCount: 14,          // 14 quad facets
        maxLit: 9,             // 9/14 = 64.3% <= 70%
        speedMult: 1.0,
        seed: 211,
      },
      {
        id: 'illusion_hoop_outer',
        kind: 'hoop',
        ringRMult: 2.16,       // Layer 3 outer hoop; faster (1.5x) = slightly larger
        bandHalfH: 3.9,
        segCount: 16,          // 16 quad facets
        maxLit: 11,            // 11/16 = 68.75% <= 70%
        speedMult: 1.5,
        seed: 419,
      },
    ] : null;

    return {
      i0, i1, i2,
      mode: isTriad ? 'triad' : (isDualHoops ? 'dual_hoops' : 'standard'),
      isTriad,
      isDualHoops,
      hasTriadGodrays: isTriad,
      slot2: i1 ? {
        id: 'illusion_slot2_ico',
        kind: 'icosahedron',
        ringRMult: isDualHoops ? 1.40 : (isTriad ? 1.48 : 1.50),
        vertexCount: 12,
        faceCount: 20,
        // +20% simultaneous lit surfaces when all 3 effects are Illusion (5 -> 6)
        maxLit: isTriad ? Math.round(5 * 1.20) : 5,
        triadBoost: isTriad,
        speedMult: isTriad ? 2.0 : 1.0, // Speeds up to 2x in Triad Illusion; stays 1x otherwise
        seed: 137,
      } : null,
      slot3: i2 ? (isTriad ? {
        id: 'illusion_slot3_icosphere',
        kind: 'icosphere42',
        ringRMult: 2.12,
        vertexCount: 80,
        faceCount: 42,
        // +20% simultaneous lit surfaces in Triad Illusion (12 -> 14)
        maxLit: Math.round(12 * 1.20),
        triadBoost: true,
        speedMult: 1.0,                 // Outer 42-face icosphere rotates at Slot 2's normal 1x speed
        seed: 313,
      } : (isDualHoops ? {
        id: 'illusion_slot3_dual_hoops',
        kind: 'dual_hoops',
        hoops: dualHoopsList,
      } : {
        id: 'illusion_slot3_ico',
        kind: 'icosahedron',
        ringRMult: 2.02,
        vertexCount: 12,
        faceCount: 20,
        maxLit: 5,
        triadBoost: false,
        speedMult: 1.0,                 // No prior Illusion -> 12-vertex icosahedron with same rules as Slot 2
        seed: 313,
      })) : null,
      hoops: dualHoopsList,
    };
  }

  // Smooth, non-repeating random multi-axis 3D tumble angles around X, Y, Z scaled cleanly by speedMult
  function computeIllusionWanderAngles(tSec, speedMult, seed) {
    const s = tSec * (speedMult || 1.0);
    const p0 = (seed || 1) * 0.01732;
    const p1 = (seed || 1) * 0.02618;
    const p2 = (seed || 1) * 0.03141;
    return {
      rx: s * 0.30 + Math.sin(s * 0.23 + p0) * 1.15 + Math.cos(s * 0.13 + p2) * 0.65,
      ry: s * 0.38 + Math.cos(s * 0.19 + p1) * 1.25 + Math.sin(s * 0.11 + p0) * 0.70,
      rz: s * 0.26 + Math.sin(s * 0.17 + p2) * 1.10 + Math.cos(s * 0.29 + p1) * 0.55,
    };
  }

  // 3 distinct broken-lamp / neon-starter ENTRY flicker patterns (u in [0, 1] -> ends cleanly at 1.0)
  function evalIllusionEntryAnim(patternIdx, u) {
    const t = clamp(u, 0, 1);
    const p = ((patternIdx % 3) + 3) % 3;
    if (p === 0) {
      // Pattern 0: Broken fluorescent starter stutter (sharp flash -> dark -> rapid double buzz -> lock ON)
      if (t < 0.06) return 0;
      if (t < 0.14) return 0.72 * Math.sin(((t - 0.06) / 0.08) * Math.PI);
      if (t < 0.25) return 0.04;
      if (t < 0.35) return 0.88 * Math.sin(((t - 0.25) / 0.10) * Math.PI);
      if (t < 0.42) return 0.10;
      if (t < 0.54) return 0.94;
      if (t < 0.62) return 0.18;
      if (t < 0.74) return smoothstep(0.62, 0.74, t);
      return 1.0;
    }
    if (p === 1) {
      // Pattern 1: Trembling voltage surge ramp with irregular buzz + momentary sag -> full ON
      if (t > 0.84) return 1.0;
      if (t > 0.50 && t < 0.59) return 0.08;
      const buzz = 0.5 + 0.5 * Math.sin(t * 58.0) * Math.cos(t * 23.0 + 0.7);
      const base = smoothstep(0.0, 0.82, t);
      return clamp(base * (0.35 + 0.80 * buzz), 0, 1);
    }
    // Pattern 2: Three escalating broken-bulb strikes (dim spark -> medium pulse -> bright lock-in)
    if (t < 0.18) return 0.34 * Math.sin((t / 0.18) * Math.PI);
    if (t < 0.28) return 0.0;
    if (t < 0.50) return 0.70 * Math.sin(((t - 0.28) / 0.22) * Math.PI);
    if (t < 0.60) return 0.05;
    if (t < 0.72) return smoothstep(0.60, 0.72, t);
    return 1.0;
  }

  // 3 distinct broken-lamp EXIT flicker patterns (u in [0, 1] -> ends cleanly at 0.0 right before particle shatter!)
  function evalIllusionExitAnim(patternIdx, u) {
    const t = clamp(u, 0, 1);
    const p = ((patternIdx % 3) + 3) % 3;
    if (p === 0) {
      // Pattern 0: Failing bulb dropouts -> rapid double stutter -> one final dying blink -> dead OFF
      if (t < 0.12) return 1.0;
      if (t < 0.22) return 0.12;
      if (t < 0.36) return 0.88;
      if (t < 0.45) return 0.06;
      if (t < 0.55) return 0.72;
      if (t < 0.65) return 0.04;
      if (t < 0.74) return 0.48 * Math.sin(((t - 0.65) / 0.09) * Math.PI);
      if (t < 0.83) return 0.0;
      if (t < 0.92) return 0.34 * Math.sin(((t - 0.83) / 0.09) * Math.PI);
      return 0.0;
    }
    if (p === 1) {
      // Pattern 1: Voltage-starved erratic dimming with two sharp blackouts
      if (t > 0.95) return 0.0;
      if ((t > 0.32 && t < 0.42) || (t > 0.66 && t < 0.75)) return 0.04;
      const decay = Math.pow(1.0 - t, 1.15);
      const buzz = 0.42 + 0.58 * Math.abs(Math.sin(t * 49.0 + 0.4) * Math.cos(t * 19.0));
      return clamp(decay * (0.35 + 0.85 * buzz), 0, 1);
    }
    // Pattern 2: Sudden blackout -> brief recovery -> dying rapid sputter -> OFF
    if (t < 0.16) return 1.0 - t * 1.2;
    if (t < 0.34) return 0.10;
    if (t < 0.50) return 0.84;
    if (t < 0.58) return 0.05;
    if (t < 0.68) return 0.58;
    if (t < 0.76) return 0.03;
    if (t < 0.86) return 0.32 * Math.sin(((t - 0.76) / 0.10) * Math.PI);
    return 0.0;
  }

  // Deterministic hard-capped channel scheduler guaranteeing litCount <= maxLit at EVERY timestamp tSec.
  // Each channel cycles cleanly: OFF (frozen) -> ENTRY (1 of 3) -> HOLD ON (frozen) -> EXIT (1 of 3) -> SHATTER (OFF + falling particles).
  function computeIllusionChannelStates(faceCount, maxLit, tSec, seed, isHoop = false, triadBoost = false) {
    const cap = Math.min(maxLit, Math.max(0, faceCount - 1));
    const usedFaces = new Set();
    const activeFaces = new Map();
    const shatters = [];

    for (let c = 0; c < cap; c++) {
      const hT = hash01(seed * 13 + c * 37 + 5);
      const hPh = hash01(seed * 29 + c * 53 + 11);
      const period = isHoop ? (3.6 + hT * 2.4) : (4.8 + hT * 2.8);
      const raw = tSec / period + hPh;
      const epoch = Math.floor(raw);
      const u = raw - epoch;

      // Pick a unique collision-free face index for this channel's current epoch
      let fIdx = Math.floor(hash01(epoch * 97 + c * 41 + seed * 7) * faceCount) % faceCount;
      for (let probe = 0; probe < faceCount; probe++) {
        const cand = (fIdx + probe) % faceCount;
        if (!usedFaces.has(cand)) { fIdx = cand; break; }
      }
      usedFaces.add(fIdx);

      // Phase boundaries inside [0, 1):
      // Hoops stay lit slightly longer (~55-68% duty); Triad Illusion lifts simultaneous active occupancy by +20%!
      const uInStart = isHoop ? 0.06 : (triadBoost ? 0.08 : 0.14);
      const uHoldStart = uInStart + (isHoop ? 0.16 : 0.15);
      const uOutStart = isHoop ? 0.62 : (triadBoost ? 0.64 : 0.58);
      const uShatter = uOutStart + (isHoop ? 0.16 : 0.15);

      const inAnim = Math.floor(hash01(epoch * 31 + c * 17 + seed) * 3) % 3;
      const outAnim = Math.floor(hash01(epoch * 59 + c * 23 + seed + 3) * 3) % 3;

      let state = 'off';
      let intensity = 0;
      if (u < uInStart) {
        state = 'off';
        intensity = 0;
      } else if (u < uHoldStart) {
        state = 'entry';
        intensity = evalIllusionEntryAnim(inAnim, (u - uInStart) / (uHoldStart - uInStart));
      } else if (u < uOutStart) {
        state = 'on';
        intensity = 1.0;
      } else if (u < uShatter) {
        state = 'exit';
        intensity = evalIllusionExitAnim(outAnim, (u - uOutStart) / (uShatter - uOutStart));
      } else {
        state = 'shatter';
        intensity = 0;
        const shatterAge = (u - uShatter) * period;
        const shatterDur = (1.0 - uShatter) * period;
        shatters.push({
          faceIdx: fIdx,
          channel: c,
          epoch,
          ageSec: shatterAge,
          durSec: Math.max(0.25, shatterDur),
          frac: clamp(shatterAge / Math.max(0.25, shatterDur), 0, 1),
        });
      }

      if (intensity > 0.01) {
        activeFaces.set(fIdx, { faceIdx: fIdx, state, intensity, inAnim, outAnim, channel: c, epoch });
      }
    }

    return { activeFaces, shatters, litCount: activeFaces.size, maxLit: cap };
  }

  // Precomputed 3D polyhedra for Illusion Magic (built once & cached)
  let cachedIcoMesh = null;
  let cachedIcosphere42Mesh = null;
  const cachedHoopMeshes = Object.create(null);

  function getIllusionIcosahedronMesh() {
    if (cachedIcoMesh) return cachedIcoMesh;
    const phi = (1 + Math.sqrt(5)) * 0.5;
    const rawV = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ];
    const vertices = rawV.map(([x, y, z]) => {
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    });
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const edgeSet = new Set();
    const edges = [];
    for (let f = 0; f < faces.length; f++) {
      const tri = faces[f];
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([a, b]); }
      }
    }
    const faceCenters = faces.map((tri) => {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < tri.length; i++) {
        cx += vertices[tri[i]].x; cy += vertices[tri[i]].y; cz += vertices[tri[i]].z;
      }
      const l = Math.hypot(cx, cy, cz) || 1;
      return { x: cx / l, y: cy / l, z: cz / l };
    });
    cachedIcoMesh = { vertices, faces, edges, faceCenters };
    return cachedIcoMesh;
  }

  // Exact 42-face Goldberg geodesic sphere GP(2,0) — dual of 1-subdivided icosahedron (12 pentagons + 30 hexagons = 42 faces, 80 vertices, 120 edges)
  function getIllusionIcosphere42Mesh() {
    if (cachedIcosphere42Mesh) return cachedIcosphere42Mesh;
    const base = getIllusionIcosahedronMesh();
    const geoVerts = base.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    const midCache = new Map();
    function getMid(a, b) {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (midCache.has(k)) return midCache.get(k);
      const va = geoVerts[a];
      const vb = geoVerts[b];
      const mx = va.x + vb.x, my = va.y + vb.y, mz = va.z + vb.z;
      const l = Math.hypot(mx, my, mz) || 1;
      const idx = geoVerts.length;
      geoVerts.push({ x: mx / l, y: my / l, z: mz / l });
      midCache.set(k, idx);
      return idx;
    }
    const subTris = [];
    for (let f = 0; f < base.faces.length; f++) {
      const [a, b, c] = base.faces[f];
      const ab = getMid(a, b);
      const bc = getMid(b, c);
      const ca = getMid(c, a);
      subTris.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    // 80 dual vertices = normalized centroids of the 80 subdivided triangles
    const vertices = subTris.map(([i0, i1, i2]) => {
      const x = geoVerts[i0].x + geoVerts[i1].x + geoVerts[i2].x;
      const y = geoVerts[i0].y + geoVerts[i1].y + geoVerts[i2].y;
      const z = geoVerts[i0].z + geoVerts[i1].z + geoVerts[i2].z;
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    });
    // Build adjacency: each of the 42 geodesic points owns 5 or 6 adjacent sub-triangles -> 42 convex polygonal faces
    const adj = Array.from({ length: geoVerts.length }, () => []);
    for (let t = 0; t < subTris.length; t++) {
      const tri = subTris[t];
      adj[tri[0]].push(t);
      adj[tri[1]].push(t);
      adj[tri[2]].push(t);
    }
    const faces = [];
    const faceCenters = [];
    for (let k = 0; k < geoVerts.length; k++) {
      const n = geoVerts[k];
      // Orthonormal tangent plane perpendicular to outward normal n
      const rx = Math.abs(n.y) < 0.9 ? 0 : 1;
      const ry = Math.abs(n.y) < 0.9 ? 1 : 0;
      const rz = 0;
      let t1x = ry * n.z - rz * n.y;
      let t1y = rz * n.x - rx * n.z;
      let t1z = rx * n.y - ry * n.x;
      const t1L = Math.hypot(t1x, t1y, t1z) || 1;
      t1x /= t1L; t1y /= t1L; t1z /= t1L;
      const t2x = n.y * t1z - n.z * t1y;
      const t2y = n.z * t1x - n.x * t1z;
      const t2z = n.x * t1y - n.y * t1x;

      const ring = adj[k].slice().sort((a, b) => {
        const va = vertices[a], vb = vertices[b];
        const angA = Math.atan2(va.x * t2x + va.y * t2y + va.z * t2z, va.x * t1x + va.y * t1y + va.z * t1z);
        const angB = Math.atan2(vb.x * t2x + vb.y * t2y + vb.z * t2z, vb.x * t1x + vb.y * t1y + vb.z * t1z);
        return angA - angB;
      });
      faces.push(ring);
      faceCenters.push(n);
    }
    const edgeSet = new Set();
    const edges = [];
    for (let f = 0; f < faces.length; f++) {
      const poly = faces[f];
      for (let e = 0; e < poly.length; e++) {
        const a = poly[e];
        const b = poly[(e + 1) % poly.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([a, b]); }
      }
    }
    cachedIcosphere42Mesh = { vertices, faces, edges, faceCenters };
    return cachedIcosphere42Mesh;
  }

  // Crisp faceted polygonal prism hoop mesh (segCount quad facets around circumference)
  function getIllusionPolygonalHoopMesh(segCount, halfHRatio) {
    const key = `${segCount}_${halfHRatio.toFixed(3)}`;
    if (cachedHoopMeshes[key]) return cachedHoopMeshes[key];
    const vertices = [];
    const faces = [];
    const edges = [];
    const faceCenters = [];
    for (let i = 0; i < segCount; i++) {
      const a = (i / segCount) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      vertices.push({ x: cx, y: cy, z: halfHRatio });  // top index = i * 2
      vertices.push({ x: cx, y: cy, z: -halfHRatio }); // bot index = i * 2 + 1
    }
    for (let i = 0; i < segCount; i++) {
      const next = (i + 1) % segCount;
      const t0 = i * 2, b0 = i * 2 + 1;
      const t1 = next * 2, b1 = next * 2 + 1;
      faces.push([t0, t1, b1, b0]);
      edges.push([t0, t1], [b0, b1], [t0, b0]);
      const midA = ((i + 0.5) / segCount) * Math.PI * 2;
      faceCenters.push({ x: Math.cos(midA), y: Math.sin(midA), z: 0 });
    }
    const mesh = { vertices, faces, edges, faceCenters };
    cachedHoopMeshes[key] = mesh;
    return mesh;
  }

  // --- ALTERATION MAGIC (id === 25): Earth/Crystal Clod, 3-Arc Carapace-Crystal Ring(s), 5-Spine Triad Cage + Polar Warm-Green Godrays ---
  function computeAlterationConfig(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const a0 = Boolean(slots[0] && slots[0].id === 25);
    const a1 = Boolean(slots[1] && slots[1].id === 25);
    const a2 = Boolean(slots[2] && slots[2].id === 25);
    const isTriad = a0 && a1 && a2;

    const slot2Rings = isTriad ? [
      {
        id: 'alt_ring_inner',
        kind: 'carapace_ring',
        ringRMult: 1.38,
        bandHalfH: 4.5,
        arcCount: 3,
        arcFillFrac: 0.64,  // 3 distinct sculpted chunks with clear empty gaps
        speedMult: 2.0,     // Inner ring speeds up to 2x in Triad
        seed: 173,
      },
      {
        id: 'alt_ring_mid',
        kind: 'carapace_ring',
        ringRMult: 1.68,    // Slightly wider second inner ring added for Slot 2 in Triad
        bandHalfH: 5.0,
        arcCount: 3,
        arcFillFrac: 0.64,
        speedMult: 1.5,     // Slightly wider ring rotates at 1.5x
        seed: 317,
      },
    ] : (a1 ? [{
      id: 'alt_slot2_ring',
      kind: 'carapace_ring',
      ringRMult: 1.52,
      bandHalfH: 5.6,       // Larger, chunkier sculpted 3D crystal-carapace pieces!
      arcCount: 3,
      arcFillFrac: 0.64,
      speedMult: 1.0,
      seed: 173,
    }] : null);

    const slot3Layer = a2 ? (isTriad ? {
      id: 'alt_slot3_cage',
      kind: 'spine_cage',
      spineCount: 8,        // 8 arched jagged crystal spines!
      bellyRMult: 2.24,
      poleRMult: 0.72,      // Converges to open polar chimneys at top & bottom where godrays stream strongly
      halfHeightMult: 2.68,
      speedMult: 1.0,
      seed: 521,
    } : {
      id: 'alt_slot3_ring',
      kind: 'carapace_ring',
      ringRMult: 2.02,      // Wider outer carapace-crystal ring when not all 3 are Alteration
      bandHalfH: 5.9,
      arcCount: 3,
      arcFillFrac: 0.64,
      speedMult: 1.0,
      seed: 439,
    }) : null;

    return {
      a0, a1, a2,
      isTriad,
      hasTriadGodrays: isTriad,
      slot2Rings,
      slot3Layer,
    };
  }

  // Smooth slow multi-axis random tumbling angles for Alteration rings & 8-spine cage
  function computeAlterationWanderAngles(tSec, speedMult, seed) {
    const s = tSec * (speedMult || 1.0);
    const p0 = (seed || 1) * 0.0191;
    const p1 = (seed || 1) * 0.0277;
    const p2 = (seed || 1) * 0.0331;
    return {
      rx: s * 0.27 + Math.sin(s * 0.21 + p0) * 1.18 + Math.cos(s * 0.14 + p2) * 0.62,
      ry: s * 0.35 + Math.cos(s * 0.18 + p1) * 1.24 + Math.sin(s * 0.12 + p0) * 0.66,
      rz: s * 0.24 + Math.sin(s * 0.16 + p2) * 1.08 + Math.cos(s * 0.26 + p1) * 0.54,
      spin: s * 0.52 * ((seed % 2 === 0) ? -1 : 1),
    };
  }

  // Precomputed 8-spine bowed jagged crystal cage skeleton (built once & cached)
  // Each of the 8 spines arches outward with belly around equator & converges toward open polar crowns,
  // with true-3D matte dark-purple bulbous "onion" joints on chaotic kinks & cross-broken crystal filler wedges on all other kinks!
  let cachedAlterationCage = null;
  function getAlterationCageGeometry() {
    if (cachedAlterationCage) return cachedAlterationCage;
    const SPINES = 8;
    const NODES = 8; // 7 seamless 3D broken crystal prism segments per spine from south (-1) to north (+1)
    const spines = [];
    for (let k = 0; k < SPINES; k++) {
      const baseAz = (k / SPINES) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j < NODES; j++) {
        const u = j / (NODES - 1); // 0 (bottom end) -> 1 (top end)
        const s = u * 2 - 1;       // -1 -> +1
        const belly = Math.pow(Math.max(0, 1 - s * s), 0.72);
        const kinkWeight = Math.sin(u * Math.PI);
        const h1 = hash01(k * 41 + j * 17 + 3) - 0.5;
        const h2 = hash01(k * 59 + j * 23 + 7) - 0.5;
        const h3 = hash01(k * 73 + j * 29 + 11) - 0.5;
        const az = baseAz + h1 * 0.22 * kinkWeight;
        const rFrac = 0.34 + 0.66 * belly + h2 * 0.15 * kinkWeight;
        const yFrac = s + h3 * 0.08 * kinkWeight;
        pts.push({
          u,
          s,
          az,
          rFrac,
          yFrac,
          thickness: 1.32 + 0.78 * belly + Math.abs(h1) * 0.36,
        });
      }
      // Partition every interior joint (1..NODES-2) cleanly into EITHER a 3D matte purple onion bulb OR a cross-broken crystal wedge joint!
      const bulbNodes = [];
      const crystalJointNodes = [];
      for (let j = 1; j < NODES - 1; j++) {
        const pick = hash01(k * 97 + j * 31 + 19);
        const isBulb = (pick > 0.44 || j === 2 + (k % 3) || j === 5 - (k % 2));
        if (isBulb) {
          bulbNodes.push({
            nodeIdx: j,
            scale: 0.84 + hash01(k * 37 + j * 13 + 5) * 0.42,
            seed: k * 53 + j * 19 + 11,
          });
        } else {
          crystalJointNodes.push({
            nodeIdx: j,
            seed: k * 67 + j * 23 + 7,
          });
        }
      }
      spines.push({ index: k, baseAz, pts, bulbNodes, crystalJointNodes });
    }
    cachedAlterationCage = { spines };
    return cachedAlterationCage;
  }

  // 8 distinct Thaumaturgy framed magi-tech hoop blueprint themes (drawn directly from the 6 reference sheets!)
  const THAUM_HOOP_PATTERNS = Object.freeze([
    'conduit_medallions',     // 0: Twin dashed conduit pipes linking double-rimmed medallions + hexagrams (ref b84c7ff0)
    'astrolabe_solar_lunar',  // 1: Graduated Vernier astrolabe rails + pentagrams, crescent moons & radiant suns (ref 9b69fbc2)
    'nonagram_weave',         // 2: Continuous interlocking triple-triangle zigzag truss + degree-cell strips (ref f929326b)
    'eye_triad_runes',        // 3: Double-bordered seal panels with Eyes, triple micro-circles & rune tallies (ref ffaed23a)
    'alchemy_star_badges',    // 4: Line-alchemy badges — diamond octagrams, triple-Venn triangles, bipyramids (ref avif 1)
    'vector_meridians',       // 5: Architectural circles pierced by vertical meridian needles & offset triangles (ref avif 2)
    'hex_compass_gears',      // 6: Interlocking hexagonal blueprint cells, 6-spoke compasses & crenellated brackets
    'celestial_calipers',     // 7: Opposing curved arc-calipers, twin diagonal measurement axes & diamond verniers
  ]);

  // --- THAUMATURGY (ID = 26) CONFIGURATION, ROMAN DODECAHEDRON MESH & SPHERICAL PROJECTION LIFECYCLE ---
  function computeThaumaturgyConfig(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const t0 = Boolean(slots[0] && slots[0].id === 26);
    const t1 = Boolean(slots[1] && slots[1].id === 26);
    const t2 = Boolean(slots[2] && slots[2].id === 26);
    const isTriad = t0 && t1 && t2;

    // Deterministic combination hash across all 3 slots (including Destruction element IDs)
    // so every combination & every ring invariant renders a distinct schematic pattern!
    function slotTok(sl) {
      if (!sl) return 0;
      return (sl.id - 21) * 9 + (sl.elementId != null ? (sl.elementId + 1) : 0);
    }
    const c0 = slotTok(slots[0]);
    const c1 = slotTok(slots[1]);
    const c2 = slotTok(slots[2]);
    const comboHash = Math.abs((c0 * 131 + c1 * 43 + c2 * 17 + c0 * c2 * 7) | 0);
    const patCount = THAUM_HOOP_PATTERNS.length;
    const pSlot2 = comboHash % patCount;
    let pSlot3 = (comboHash * 3 + 5 + (t0 ? 2 : 0)) % patCount;
    if (t1 && !t0 && pSlot3 === pSlot2) {
      pSlot3 = (pSlot3 + 3) % patCount; // Strictly guarantee Slot 2 & Slot 3 hoops NEVER share a pattern!
    }
    const pTriadSmall = 1; // astrolabe_solar_lunar
    const pTriadLarge = 2; // nonagram_weave

    // Slot 2:
    // - If Slot 1 == Thaumaturgy -> Particles shoot perpendicularly out of Roman dodecahedron holes,
    //   hover 0.5s with light glint, unfold onto curved sphere for 2s, collapse & return! (<= 3, or <= 6 in Triad!)
    // - If Slot 1 != Thaumaturgy -> Dense intricate framed magi-tech schematic hoop slowly rotating around center
    const slot2Layer = t1 ? (t0 ? {
      id: 'thaum_slot2_projections',
      kind: 'sphere_projections',
      maxSimultaneous: isTriad ? 6 : 3,
      sphereRMult: 1.66,
    } : {
      id: 'thaum_slot2_hoop',
      kind: 'schematic_hoop',
      ringRMult: 1.56,
      bandHalfH: 4.8,
      panelCount: 10,
      speedMult: 1.0,
      seed: 211 + pSlot2 * 17,
      patternId: pSlot2,
      patternKey: THAUM_HOOP_PATTERNS[pSlot2],
    }) : null;

    // Slot 3:
    // - If Triad (all 3 == Thaumaturgy) -> 2 different-sized framed schematic hoops around the whole construction:
    //   smaller hoop rotates at 1.5x, larger hoop rotates at 2.0x — each with its own distinct schematic pattern!
    // - Else (all other combos with Slot 3 == Thaumaturgy) -> 1 slowly rotating outer framed schematic hoop (1.0x)
    const slot3Layers = t2 ? (isTriad ? [
      {
        id: 'thaum_triad_hoop_small',
        kind: 'schematic_hoop',
        ringRMult: 2.04,
        bandHalfH: 4.3,
        panelCount: 10,
        speedMult: 1.5, // Smaller hoop: 1.5x speed!
        seed: 389,
        patternId: pTriadSmall,
        patternKey: THAUM_HOOP_PATTERNS[pTriadSmall],
      },
      {
        id: 'thaum_triad_hoop_large',
        kind: 'schematic_hoop',
        ringRMult: 2.46,
        bandHalfH: 4.7,
        panelCount: 12,
        speedMult: 2.0, // Larger hoop: 2.0x speed!
        seed: 547,
        patternId: pTriadLarge,
        patternKey: THAUM_HOOP_PATTERNS[pTriadLarge],
      },
    ] : [{
      id: 'thaum_slot3_hoop',
      kind: 'schematic_hoop',
      ringRMult: 2.06,
      bandHalfH: 4.9,
      panelCount: 12,
      speedMult: 1.0,
      seed: 463 + pSlot3 * 19,
      patternId: pSlot3,
      patternKey: THAUM_HOOP_PATTERNS[pSlot3],
    }]) : null;

    return {
      t0, t1, t2,
      isTriad,
      hasTriadGodrays: isTriad,
      slot2Layer,
      slot3Layers,
    };
  }

  // Slow arbitrary 3D tumbling orientation for Slot 1 Roman Dodecahedron (shared with Slot 2 hole emission!)
  function computeThaumaturgyDodecaAngles(tSec) {
    return {
      rx: 0.34 + tSec * 0.24 + Math.sin(tSec * 0.19) * 0.62,
      ry: 0.22 + tSec * 0.33 + Math.cos(tSec * 0.16) * 0.70,
      rz: 0.14 + tSec * 0.17 + Math.sin(tSec * 0.23 + 1.1) * 0.48,
    };
  }

  // Smooth multi-axis 3D orbital tumble & spin for Thaumaturgy magi-tech schematic hoops
  function computeThaumaturgyHoopAngles(tSec, speedMult, seed) {
    const s = tSec * (speedMult || 1.0);
    const p0 = (seed || 1) * 0.0173;
    const p1 = (seed || 1) * 0.0241;
    const p2 = (seed || 1) * 0.0317;
    // Distinct base tilts per seed so paired hoops in Triad orbit in cleanly separated 3D planes!
    const baseRx = (seed === 547) ? 1.18 : ((seed === 389) ? 0.36 : 0.52);
    const baseRy = (seed === 547) ? -0.62 : ((seed === 389) ? 0.74 : 0.24);
    return {
      rx: baseRx + s * 0.22 + Math.sin(s * 0.18 + p0) * 0.86 + Math.cos(s * 0.13 + p2) * 0.40,
      ry: baseRy + s * 0.28 + Math.cos(s * 0.16 + p1) * 0.88 + Math.sin(s * 0.11 + p0) * 0.44,
      rz: -0.25 + s * 0.18 + Math.sin(s * 0.14 + p2) * 0.72,
      spin: s * 0.46 * ((seed % 2 === 0) ? -1 : 1),
    };
  }

  // Cached mathematically exact Regular Roman Dodecahedron mesh:
  // 20 vertices (with 20 iconic corner knobs), 12 regular pentagonal faces each with a circular central aperture hole!
  let cachedThaumDodecaMesh = null;
  function getThaumaturgyRomanDodecahedronMesh() {
    if (cachedThaumDodecaMesh) return cachedThaumDodecaMesh;
    const phi = (1 + Math.sqrt(5)) / 2;
    const invPhi = 1 / phi;
    const invSqrt3 = 1 / Math.sqrt(3);

    // 20 exact unit vertices of the regular dodecahedron
    const vertices = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          vertices.push({ x: sx * invSqrt3, y: sy * invSqrt3, z: sz * invSqrt3 });
        }
      }
    }
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        vertices.push({ x: 0, y: s1 * invPhi * invSqrt3, z: s2 * phi * invSqrt3 });
        vertices.push({ x: s1 * invPhi * invSqrt3, y: s2 * phi * invSqrt3, z: 0 });
        vertices.push({ x: s1 * phi * invSqrt3, y: 0, z: s2 * invPhi * invSqrt3 });
      }
    }

    // 12 exact unit pentagonal face normals (exact dual icosahedron vertices aligned with (0, ±1/phi, ±phi)!)
    const icoLen = Math.hypot(1, phi);
    const rawNormals = [];
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        rawNormals.push({ x: 0, y: (s1 * phi) / icoLen, z: s2 / icoLen });
        rawNormals.push({ x: (s1 * phi) / icoLen, y: s2 / icoLen, z: 0 });
        rawNormals.push({ x: s1 / icoLen, y: 0, z: (s2 * phi) / icoLen });
      }
    }

    const HOLE_SEGS = 12;
    const faces = rawNormals.map((n, fIdx) => {
      // Build orthonormal tangent basis (u, v) on face plane with u x v = n
      const refX = Math.abs(n.y) < 0.85 ? 0 : 1;
      const refY = Math.abs(n.y) < 0.85 ? 1 : 0;
      let ux = refY * n.z;
      let uy = -refX * n.z;
      let uz = refX * n.y - refY * n.x;
      const uL = Math.hypot(ux, uy, uz) || 1;
      ux /= uL; uy /= uL; uz /= uL;
      const vx = n.y * uz - n.z * uy;
      const vy = n.z * ux - n.x * uz;
      const vz = n.x * uy - n.y * ux;

      // Collect the exact 5 dodecahedron vertices belonging to this pentagon (dot ~ 0.79465)
      const cornerIdx = [];
      for (let vi = 0; vi < vertices.length; vi++) {
        const v = vertices[vi];
        const d = v.x * n.x + v.y * n.y + v.z * n.z;
        if (d > 0.72) {
          const ang = Math.atan2(v.x * vx + v.y * vy + v.z * vz, v.x * ux + v.y * uy + v.z * uz);
          cornerIdx.push({ vi, ang, d });
        }
      }
      cornerIdx.sort((a, b) => a.ang - b.ang);
      const inDist = cornerIdx[0] ? cornerIdx[0].d : 0.79465;
      const faceCircumR = Math.sqrt(Math.max(0.01, 1 - inDist * inDist));
      const faceInR = faceCircumR * Math.cos(Math.PI / 5);
      // Authentic Roman dodecahedron circular aperture hole (~54%..64% of pentagonal inradius)
      const holeR = faceInR * (0.54 + (fIdx % 3) * 0.048);
      const holeLoop = [];
      for (let k = 0; k < HOLE_SEGS; k++) {
        // Reverse winding relative to outer pentagon for crisp Canvas evenodd hole cutting
        const a = -(k / HOLE_SEGS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        holeLoop.push({
          x: n.x * inDist + (ux * ca + vx * sa) * holeR,
          y: n.y * inDist + (uy * ca + vy * sa) * holeR,
          z: n.z * inDist + (uz * ca + vz * sa) * holeR,
        });
      }
      return {
        index: fIdx,
        n,
        u: { x: ux, y: uy, z: uz },
        v: { x: vx, y: vy, z: vz },
        inDist,
        holeR,
        corners: cornerIdx.map((c) => c.vi),
        holeLoop,
      };
    });

    cachedThaumDodecaMesh = { vertices, faces };
    return cachedThaumDodecaMesh;
  }

  // Deterministic lifecycle scheduler for Slot 2 spherical magi-tech projections from Roman dodecahedron holes:
  // Strict hard cap: at most maxSimultaneous (3 in Slot 1+2, 6 in Triad!) active simultaneously.
  // Exact timing per cycle (~4.90s):
  //   [0.00..0.48s] eject perpendicularly from hole -> sphere
  //   [0.48..0.98s] hover 0.50s flickering with light glint
  //   [0.98..1.38s] unfold onto curved sphere surface
  //   [1.38..3.38s] hold projected magi-tech blueprint for 2.00s
  //   [3.38..3.76s] collapse back into condensed spark
  //   [3.76..4.24s] return perpendicularly back into dodecahedron hole
  //   [4.24..4.90s] rest before next random hole launches
  function computeThaumaturgyProjectionStates(tSec, maxSimultaneous = 3) {
    const cap = clamp(Math.round(maxSimultaneous || 3), 1, 6);
    const PERIOD = 4.90;
    const T_EJECT = 0.48;
    const T_HOVER = 0.98;    // +0.50s exact hover glint!
    const T_UNFOLD = 1.38;   // +0.40s smooth geometric unfold
    const T_HOLD = 3.38;     // +2.00s exact blueprint hold!
    const T_COLLAPSE = 3.76; // +0.38s collapse to spark
    const T_RETURN = 4.24;   // +0.48s return into dodecahedron hole

    const usedFaces = new Set();
    const list = [];
    for (let ch = 0; ch < cap; ch++) {
      const chOffset = (ch / cap) * PERIOD + hash01(ch * 37 + 11) * 0.28;
      const raw = (tSec + chOffset) / PERIOD;
      const gen = Math.floor(raw);
      const localT = (raw - gen) * PERIOD;
      if (localT >= T_RETURN) continue; // Resting between launches

      // Pick a distinct face hole [0..11] for this generation & channel
      let faceIdx = Math.floor(hash01(gen * 97 + ch * 31 + 7) * 12) % 12;
      for (let probe = 0; probe < 12; probe++) {
        const cand = (faceIdx + probe * 5) % 12;
        if (!usedFaces.has(cand)) {
          faceIdx = cand;
          break;
        }
      }
      usedFaces.add(faceIdx);

      const patternIdx = Math.floor(hash01(gen * 61 + ch * 19 + 13) * 6) % 6;
      const spinDir = hash01(gen * 43 + ch * 29 + 5) > 0.5 ? 1 : -1;
      const spinBase = hash01(gen * 53 + ch * 17 + 3) * Math.PI * 2;

      let phase = 'eject';
      let radialFrac = 0; // 0 = dodecahedron hole, 1 = projection sphere surface
      let unfoldFrac = 0; // 0 = point particle, 1 = full spherical schematic
      let glintAmp = 0;
      let alpha = 1;

      if (localT < T_EJECT) {
        phase = 'eject';
        const u = localT / T_EJECT;
        radialFrac = 1 - Math.pow(1 - u, 2.4); // Crisp ease-out launch perpendicular from hole
        glintAmp = 0.45 + 0.55 * u;
        alpha = smoothstep(0.0, 0.14, u);
      } else if (localT < T_HOVER) {
        phase = 'hover';
        const u = (localT - T_EJECT) / (T_HOVER - T_EJECT);
        radialFrac = 1.0;
        // Shimmering/flickering light glint for 0.50 seconds before unfolding!
        glintAmp = 0.60 + 0.40 * Math.abs(Math.sin(u * Math.PI * 5.5 + ch));
        alpha = 1.0;
      } else if (localT < T_UNFOLD) {
        phase = 'unfold';
        const u = (localT - T_HOVER) / (T_UNFOLD - T_HOVER);
        radialFrac = 1.0;
        unfoldFrac = 1 - Math.pow(1 - u, 2.8);
        glintAmp = (1 - u) * 0.95;
        alpha = 1.0;
      } else if (localT < T_HOLD) {
        phase = 'hold';
        radialFrac = 1.0;
        unfoldFrac = 1.0;
        glintAmp = 0.12 + 0.08 * Math.sin(localT * 6.0 + ch);
        alpha = 1.0;
      } else if (localT < T_COLLAPSE) {
        phase = 'collapse';
        const u = (localT - T_HOLD) / (T_COLLAPSE - T_HOLD);
        radialFrac = 1.0;
        unfoldFrac = Math.pow(1 - u, 2.2);
        glintAmp = u * 0.95;
        alpha = 1.0;
      } else {
        phase = 'return';
        const u = (localT - T_COLLAPSE) / (T_RETURN - T_COLLAPSE);
        radialFrac = 1 - u * u; // Accelerates smoothly back into the dodecahedron hole!
        glintAmp = 0.65 * (1 - u * 0.5);
        alpha = smoothstep(1.0, 0.84, u);
      }

      list.push({
        channel: ch,
        gen,
        faceIdx,
        patternIdx,
        phase,
        localT,
        radialFrac,
        unfoldFrac,
        glintAmp,
        alpha,
        spinAngle: spinBase + localT * 0.22 * spinDir,
      });
    }
    return list;
  }

  // --- MYSTICISM (ID = 27): AUTHENTIC FILLED DAEDRIC ALPHABET (24 GLYPHS), CONFIG & PROJECTION LIFECYCLE ---
  // Each glyph is an array of closed calligraphic polygons in normalized [-1..+1] x [-1..+1] space
  // directly modeled on the Elder Scrolls Daedric alphabet (AYEM..ZYR), supporting both 2D particles & curved 3D cylinder wrapping!
  // Using fill('evenodd') allows optional inner cutout holes (e.g., OHT, KOHT, WEB, YOODT, QUAM).
  const DAEDRIC_GLYPHS = Object.freeze([
    // 0: AYEM (A) — curved claw-hook descending to sharp forked spur
    { name: 'AYEM', polys: [[[-0.42,-0.92],[0.54,-0.92],[0.36,-0.62],[0.18,-0.25],[0.02,-0.74],[-0.22,-0.74],[-0.24,-0.16],[0.12,0.52],[0.26,0.22],[0.24,0.92],[-0.08,0.68],[-0.46,0.02],[-0.44,-0.62]]] },
    // 1: BEDT (B) — sinuous double-fang S-scroll
    { name: 'BEDT', polys: [[[-0.36,-0.92],[0.56,-0.92],[0.56,-0.46],[0.26,-0.28],[0.36,-0.66],[-0.06,-0.68],[0.32,-0.02],[0.18,0.54],[-0.46,0.94],[-0.46,0.06],[-0.22,0.44],[0.02,0.16],[-0.34,-0.42]]] },
    // 2: CESS (C) — twin arched gate pillars under flat crown bar
    { name: 'CESS', polys: [[[-0.56,-0.92],[0.56,-0.92],[0.56,0.92],[0.38,0.92],[0.34,-0.22],[0.12,-0.56],[0.32,-0.74],[-0.32,-0.74],[-0.12,-0.56],[-0.34,-0.22],[-0.38,0.92],[-0.56,0.92]]] },
    // 3: DOHT (D) — crescent-arched blade facing vertical right spire
    { name: 'DOHT', polys: [[[-0.12,-0.92],[0.52,-0.92],[0.52,0.92],[0.34,0.92],[0.32,-0.58],[0.02,-0.74],[-0.16,-0.44],[0.04,-0.32],[-0.14,0.02],[0.18,0.56],[0.14,0.88],[-0.38,0.34],[-0.50,-0.22],[-0.34,-0.70]]] },
    // 4: EKEM (E) — boxy S-hook bracket with central crossbar
    { name: 'EKEM', polys: [[[-0.18,-0.92],[0.56,-0.92],[0.56,0.28],[0.34,0.28],[0.34,-0.02],[-0.30,-0.02],[-0.30,0.68],[0.48,0.74],[0.34,0.92],[-0.54,0.92],[-0.54,-0.40],[-0.32,-0.20],[0.34,-0.20],[0.34,-0.72],[-0.24,-0.74]]] },
    // 5: HEFHED (F) — top roof slashing diagonally down with hooked horizontal barb
    { name: 'HEFHED', polys: [[[-0.56,-0.92],[0.56,-0.92],[0.14,-0.24],[0.58,-0.24],[0.58,0.30],[0.38,0.04],[-0.04,0.04],[-0.44,0.92],[-0.50,0.62],[-0.16,-0.24],[0.16,-0.72],[-0.36,-0.72],[-0.56,-0.32]]] },
    // 6: GETH (G) — top bar sweeping into graceful curved scythe
    { name: 'GETH', polys: [[[-0.56,-0.92],[0.46,-0.92],[0.46,-0.52],[0.30,0.32],[-0.22,0.94],[-0.02,0.28],[0.18,-0.46],[0.06,-0.72],[-0.36,-0.72],[-0.56,-0.42]]] },
    // 7: HEKEM (H) — hooked crest with notched spine curving into fang
    { name: 'HEKEM', polys: [[[-0.52,-0.76],[0.18,-0.76],[0.48,-0.94],[0.54,-0.52],[0.18,-0.38],[0.38,-0.12],[0.14,0.44],[-0.30,0.92],[-0.12,0.32],[0.02,-0.18],[-0.24,-0.58]]] },
    // 8: JEB (J) — hooded vertical hook pillar
    { name: 'JEB', polys: [[[-0.54,-0.92],[0.46,-0.92],[0.52,0.92],[0.16,0.92],[0.30,0.58],[0.26,-0.52],[0.02,-0.72],[-0.30,-0.68],[-0.46,-0.02],[-0.54,-0.46]]] },
    // 9: KOHT (K) — hollow arched flame-ring with bottom spike notch (evenodd cutout!)
    { name: 'KOHT', polys: [
      [[-0.36,-0.92],[0.42,-0.92],[0.58,-0.16],[0.48,0.56],[0.14,0.90],[0.04,0.36],[-0.08,0.92],[-0.46,0.46],[-0.58,-0.18]],
      [[-0.16,-0.70],[0.18,-0.70],[0.32,-0.12],[0.22,0.44],[0.04,0.16],[-0.16,0.48],[-0.30,-0.12]],
    ] },
    // 10: LYR (L) — flared triangular capital above bent leg & foot
    { name: 'LYR', polys: [[[-0.56,-0.92],[0.56,-0.92],[0.38,-0.34],[0.20,-0.68],[-0.10,-0.68],[0.12,-0.22],[0.14,0.68],[0.46,0.92],[-0.08,0.92],[-0.06,-0.26],[-0.34,-0.66]]] },
    // 11: MEHT (M) — horned double-arch crown with twin descending talons
    { name: 'MEHT', polys: [[[-0.56,-0.92],[-0.14,-0.92],[-0.26,-0.62],[0.0,-0.16],[0.26,-0.62],[0.14,-0.92],[0.56,-0.92],[0.54,0.38],[0.24,0.92],[0.30,0.12],[0.26,-0.38],[0.0,0.08],[-0.26,-0.38],[-0.30,0.12],[-0.24,0.92],[-0.54,0.38]]] },
    // 12: NEHT (N) — sweeping main blade with right crescent antler
    { name: 'NEHT', polys: [[[-0.48,-0.92],[0.12,-0.92],[0.02,-0.40],[0.28,-0.20],[0.36,-0.68],[0.48,-0.88],[0.52,-0.16],[0.24,0.14],[0.04,0.02],[-0.16,0.52],[-0.46,0.94],[-0.26,0.16],[-0.32,-0.52]]] },
    // 13: OHT (O) — iconic Oblivion Gate Daedric O with inner almond eyelet (evenodd!)
    { name: 'OHT', polys: [
      [[-0.46,-0.92],[0.46,-0.92],[0.32,-0.68],[0.56,-0.16],[0.52,0.50],[0.16,0.94],[0.26,0.56],[0.30,-0.16],[0.12,-0.68],[-0.12,-0.68],[-0.30,-0.16],[-0.26,0.56],[-0.16,0.94],[-0.52,0.50],[-0.56,-0.16],[-0.32,-0.68]],
      [[0.0,-0.34],[0.16,0.02],[0.0,0.36],[-0.16,0.02]],
    ] },
    // 14: PAYEM (P) — inverted triangular bowl atop sharp right spear
    { name: 'PAYEM', polys: [
      [[-0.56,-0.92],[0.56,-0.92],[0.28,0.10],[0.26,0.92],[0.06,0.44],[0.04,-0.02],[-0.34,0.06],[-0.42,-0.46]],
      [[-0.24,-0.70],[0.24,-0.70],[0.08,-0.20],[-0.16,-0.22]],
    ] },
    // 15: QUAM (Q) — chalice triangle balanced over bold cross-anchor
    { name: 'QUAM', polys: [
      [[-0.48,-0.92],[0.48,-0.92],[0.12,0.08],[0.48,0.08],[0.48,0.44],[0.32,0.28],[0.10,0.28],[0.10,0.92],[-0.10,0.92],[-0.10,0.28],[-0.32,0.28],[-0.48,0.44],[-0.48,0.08],[-0.12,0.08]],
      [[-0.22,-0.72],[0.22,-0.72],[0.0,-0.20]],
    ] },
    // 16: ROHT (R) — domed visor curling down into left dagger
    { name: 'ROHT', polys: [[[-0.56,-0.64],[-0.14,-0.92],[0.42,-0.86],[0.56,-0.46],[0.22,-0.24],[0.04,0.26],[-0.02,0.92],[-0.28,0.16],[-0.34,-0.36],[0.18,-0.56],[0.06,-0.70],[-0.32,-0.56]]] },
    // 17: SEHT (S) — serrated lightning-fang descending curve
    { name: 'SEHT', polys: [[[-0.36,-0.92],[0.42,-0.92],[0.46,-0.50],[0.20,-0.66],[0.02,-0.48],[0.30,-0.32],[0.10,-0.12],[0.36,0.34],[0.10,0.92],[-0.04,0.84],[0.12,0.38],[-0.20,-0.08],[-0.50,-0.48],[-0.14,-0.58]]] },
    // 18: TAYEM (T) — bold serifed column ending in horned anchor fluke
    { name: 'TAYEM', polys: [[[-0.48,-0.92],[0.36,-0.92],[0.06,-0.66],[0.12,0.42],[0.48,0.18],[0.46,0.52],[0.04,0.94],[-0.40,0.52],[-0.44,0.18],[-0.10,0.42],[-0.16,-0.58],[-0.48,-0.72]]] },
    // 19: YOODT (U) — curled crescent chalice embracing an inner spiral dot
    { name: 'YOODT', polys: [
      [[-0.18,-0.92],[0.50,-0.92],[0.50,0.24],[0.24,0.82],[-0.26,0.88],[-0.56,0.34],[-0.56,-0.30],[-0.34,-0.76],[-0.02,-0.30],[-0.30,0.16],[-0.18,0.62],[0.14,0.58],[0.28,0.14],[0.26,-0.68],[-0.08,-0.70]],
      [[0.02,-0.06],[0.14,0.08],[0.02,0.24],[-0.12,0.08]],
    ] },
    // 20: VEHK (V) — arched dual-horn horseshoe with pointed lower tips
    { name: 'VEHK', polys: [[[-0.40,-0.92],[0.40,-0.92],[0.56,0.18],[0.32,0.92],[0.20,0.66],[0.34,0.12],[0.18,-0.68],[-0.18,-0.68],[-0.34,0.12],[-0.20,0.66],[-0.32,0.92],[-0.56,0.18]]] },
    // 21: WEB (W) — winged chalice-loop with sharp right horn & inner cutout
    { name: 'WEB', polys: [
      [[-0.50,-0.78],[0.30,-0.78],[0.58,-0.96],[0.48,-0.46],[0.26,-0.56],[0.40,0.08],[0.06,0.92],[-0.16,0.92],[-0.52,0.04],[-0.34,-0.56]],
      [[-0.16,-0.54],[0.10,-0.54],[0.18,0.06],[-0.04,0.54],[-0.24,0.04]],
    ] },
    // 22: XAYAH (X) — horned crescent bowl resting on crossed spur base
    { name: 'XAYAH', polys: [[[-0.24,-0.92],[-0.42,-0.16],[-0.26,0.52],[0.16,0.52],[0.36,-0.18],[0.26,-0.92],[0.56,-0.22],[0.46,0.54],[0.10,0.82],[-0.30,0.82],[-0.56,0.94],[-0.36,0.58],[-0.56,-0.16]]] },
    // 23: YAHKEM (Y) — tall jagged ritual spire planted in curved crescent foot
    { name: 'YAHKEM', polys: [[[-0.18,-0.92],[0.02,-0.66],[0.26,-0.88],[0.16,-0.32],[0.14,0.66],[0.44,0.82],[-0.44,0.86],[-0.54,0.46],[-0.28,0.28],[-0.32,0.58],[-0.06,0.64],[-0.08,-0.34]]] },
  ]);

  function computeMysticismConfig(analysis) {
    const slots = (analysis && analysis.slots) || [];
    const m0 = Boolean(slots[0] && slots[0].id === 27);
    const m1 = Boolean(slots[1] && slots[1].id === 27);
    const m2 = Boolean(slots[2] && slots[2].id === 27);
    const isTriad = m0 && m1 && m2;

    function slotTok(sl) {
      if (!sl) return 0;
      return (sl.id - 21) * 9 + (sl.elementId != null ? (sl.elementId + 1) : 0);
    }
    const comboHash = Math.abs((slotTok(slots[0]) * 137 + slotTok(slots[1]) * 47 + slotTok(slots[2]) * 19) | 0);

    // Deterministic unique glyph sequences for each hoop (no adjacent duplicates; no two Triad hoops share a sequence!)
    function makeGlyphSeq(count, seed) {
      const seq = [];
      for (let i = 0; i < count; i++) {
        let g = Math.floor(hash01(seed * 53 + i * 31 + 7) * DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length;
        if (seq.length > 0 && g === seq[seq.length - 1]) {
          g = (g + 1 + (i % 3)) % DAEDRIC_GLYPHS.length;
        }
        seq.push(g);
      }
      if (seq.length > 2 && seq[seq.length - 1] === seq[0]) {
        seq[seq.length - 1] = (seq[seq.length - 1] + 2) % DAEDRIC_GLYPHS.length;
      }
      return seq;
    }

    // Slot 2:
    // - If Slot 1 == Mysticism -> Viscous droplet ejects, freezes, unfolds into spherical occult projection (3s hold!)
    //   + vertical Matrix-style Daedric glyph garlands raining from both droplets & projections!
    // - If Slot 1 != Mysticism -> Recolored deep-purple/lilac orbiting droplet cloud + appearing/disappearing Daedric runes inside!
    const slot2Layer = m1 ? (m0 ? {
      id: 'myst_slot2_projections',
      kind: 'occult_projections',
      maxSimultaneous: isTriad ? 4 : 3,
      sphereRMult: 1.84,
      holdDurationSec: 3.0,
    } : {
      id: 'myst_slot2_drop_cloud',
      kind: 'purple_drop_cloud',
      ringSlotIdx: 1,
      speedMult: 1.0,
    }) : null;

    // Slot 3:
    // - If Triad (all 3 == Mysticism) -> 3 frameless pure-letter Daedric 3D hoops (different radii, speeds, LARGE glyph sizes, unique sequences!)
    // - Else (other schools present / non-Triad) -> 1 standard bordered 3D hoop inscribed with random Daedric letters!
    const slot3Layers = m2 ? (isTriad ? [
      {
        id: 'myst_triad_letters_1',
        kind: 'daedric_hoop',
        frameless: true,
        ringRMult: 1.92,
        bandHalfH: 5.8,       // Large filled Daedric glyphs!
        glyphCount: 12,
        speedMult: 1.90,
        seed: 241,
        glyphSeq: makeGlyphSeq(12, 241),
      },
      {
        id: 'myst_triad_letters_2',
        kind: 'daedric_hoop',
        frameless: true,
        ringRMult: 2.34,
        bandHalfH: 6.8,       // Larger filled Daedric glyphs!
        glyphCount: 13,
        speedMult: 1.40,
        seed: 419,
        glyphSeq: makeGlyphSeq(13, 419),
      },
      {
        id: 'myst_triad_letters_3',
        kind: 'daedric_hoop',
        frameless: true,
        ringRMult: 2.76,
        bandHalfH: 7.9,       // Largest filled Daedric glyphs!
        glyphCount: 14,
        speedMult: 1.00,
        seed: 677,
        glyphSeq: makeGlyphSeq(14, 677),
      },
    ] : [{
      id: 'myst_slot3_bordered_hoop',
      kind: 'daedric_hoop',
      frameless: false,       // Standard bordered hoop with top/bottom edges & random Daedric letters!
      ringRMult: 2.04,
      bandHalfH: 4.9,
      glyphCount: 14,
      speedMult: 1.0,
      seed: 503 + (comboHash % 23) * 7,
      glyphSeq: makeGlyphSeq(14, 503 + comboHash),
    }]) : null;

    return {
      m0, m1, m2,
      isTriad,
      hasAntiLightGodrays: isTriad,
      mistGain: isTriad ? 2.15 : 1.0,
      slot2Layer,
      slot3Layers,
    };
  }

  // Smooth multi-axis 3D orbital angles for Mysticism Daedric hoops:
  // Keeps the cylinder pitch near an oblique 3D belt angle (~64 deg) while precessing & tumbling smoothly,
  // so every curved 3D Daedric letter stands tall and readable along the hoop wall instead of flattening into radial spokes!
  function computeMysticismHoopAngles(tSec, speedMult, seed) {
    const s = tSec * (speedMult || 1.0);
    const p0 = (seed || 1) * 0.0167;
    const p1 = (seed || 1) * 0.0253;
    const p2 = (seed || 1) * 0.0311;
    const baseRx = (seed === 241) ? 1.12 : ((seed === 419) ? 1.22 : ((seed === 677) ? 1.06 : 1.15));
    const baseRz = (seed === 241) ? -0.68 : ((seed === 419) ? 0.62 : ((seed === 677) ? 1.48 : -0.52));
    const dir = (seed % 2 === 0) ? -1 : 1;
    return {
      rx: baseRx + Math.sin(s * 0.24 + p0) * 0.22 + Math.cos(s * 0.15 + p2) * 0.10,
      ry: Math.sin(s * 0.28 + p1) * 0.44 + Math.cos(s * 0.17 + p0) * 0.18,
      rz: baseRz + s * 0.18 * dir + Math.sin(s * 0.21 + p2) * 0.34,
      spin: s * 0.48 * dir,
    };
  }

  // Deterministic lifecycle scheduler for Mysticism Slot 2 (when Slot 1 == Mysticism):
  // Sticky purple drop ejects -> freezes -> unfolds into spherical occult symbol -> holds 3.00s -> collapses -> returns into glob!
  function computeMysticismProjectionStates(tSec, maxSimultaneous = 3) {
    const cap = clamp(Math.round(maxSimultaneous || 3), 1, 5);
    const PERIOD = 5.90;
    const T_EJECT = 0.55;
    const T_FREEZE = 0.90;   // +0.35s paused droplet before unfolding
    const T_UNFOLD = 1.30;   // +0.40s smooth unfold into spherical occult symbol
    const T_HOLD = 4.30;     // +3.00s EXACT occult symbol hold!
    const T_COLLAPSE = 4.70; // +0.40s collapse back to droplet
    const T_RETURN = 5.25;   // +0.55s droplet flies back into central sticky glob

    const list = [];
    for (let ch = 0; ch < cap; ch++) {
      const chOff = (ch / cap) * PERIOD + hash01(ch * 41 + 9) * 0.35;
      const raw = (tSec + chOff) / PERIOD;
      const gen = Math.floor(raw);
      const localT = (raw - gen) * PERIOD;
      if (localT >= T_RETURN) continue;

      const seed = gen * 113 + ch * 37 + 19;
      // Distinct 3D launch direction spread around the outer ring so projections frame the central glob clearly
      const az = (ch / cap) * Math.PI * 2 + gen * 1.15 + hash01(seed + 1) * 0.85;
      const uZ = (hash01(seed + 2) * 1.16 - 0.58);
      const rXY = Math.sqrt(Math.max(0.25, 1 - uZ * uZ));
      const nx = Math.cos(az) * rXY;
      const ny = Math.sin(az) * rXY;
      const nz = uZ;

      // Orthonormal tangent basis (U, V) on sphere around normal N
      const refX = Math.abs(ny) < 0.85 ? 0 : 1;
      const refY = Math.abs(ny) < 0.85 ? 1 : 0;
      let ux = refY * nz, uy = -refX * nz, uz = refX * ny - refY * nx;
      const uL = Math.hypot(ux, uy, uz) || 1;
      ux /= uL; uy /= uL; uz /= uL;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;

      const symbolIdx = Math.floor(hash01(seed + 3) * 5) % 5;
      const spinBase = hash01(seed + 4) * Math.PI * 2;
      const spinDir = hash01(seed + 5) > 0.5 ? 1 : -1;

      let phase = 'eject';
      let radialFrac = 0;
      let unfoldFrac = 0;
      let dropScale = 1;
      let bridgeStrength = 0;

      if (localT < T_EJECT) {
        phase = 'eject';
        const u = localT / T_EJECT;
        radialFrac = 1 - Math.pow(1 - u, 2.4);
        dropScale = 0.72 + 0.32 * u;
        bridgeStrength = clamp(1 - u * 1.35, 0, 1);
      } else if (localT < T_FREEZE) {
        phase = 'freeze';
        radialFrac = 1.0;
        dropScale = 1.04 + 0.08 * Math.sin((localT - T_EJECT) * 16.0);
      } else if (localT < T_UNFOLD) {
        phase = 'unfold';
        const u = (localT - T_FREEZE) / (T_UNFOLD - T_FREEZE);
        radialFrac = 1.0;
        unfoldFrac = 1 - Math.pow(1 - u, 2.6);
        dropScale = 1 - u;
      } else if (localT < T_HOLD) {
        phase = 'hold';
        radialFrac = 1.0;
        unfoldFrac = 1.0;
        dropScale = 0;
      } else if (localT < T_COLLAPSE) {
        phase = 'collapse';
        const u = (localT - T_HOLD) / (T_COLLAPSE - T_HOLD);
        radialFrac = 1.0;
        unfoldFrac = Math.pow(1 - u, 2.2);
        dropScale = u;
      } else {
        phase = 'return';
        const u = (localT - T_COLLAPSE) / (T_RETURN - T_COLLAPSE);
        radialFrac = 1 - u * u;
        dropScale = 1.0 - 0.28 * u;
        bridgeStrength = clamp((u - 0.35) * 1.55, 0, 1);
      }

      list.push({
        channel: ch,
        gen,
        seed,
        phase,
        localT,
        radialFrac,
        unfoldFrac,
        dropScale,
        bridgeStrength,
        symbolIdx,
        spinAngle: spinBase + localT * 0.16 * spinDir,
        n: { x: nx, y: ny, z: nz },
        u: { x: ux, y: uy, z: uz },
        v: { x: vx, y: vy, z: vz },
      });
    }
    return list;
  }

  const SHOCK_CHANNEL_PERIODS = Object.freeze([
    0.17, 0.21, 0.25, 0.29, 0.34, 0.39, 0.44, 0.50,
    0.57, 0.64, 0.72, 0.81, 0.36, 0.47, 0.53, 0.68,
  ]);

  // Global rotation boost for every Destruction rotation: 1 effect = 1x, 2 effects = 2x, 3 effects = 3x.
  function getGlobalRotMult(activeCount) {
    const n = activeCount || 0;
    return n >= 3 ? 3.0 : (n === 2 ? 2.0 : 1.0);
  }

  // Shared 3D tumbling orbital frame used across Destruction Slots 2 & 3 + cross-slot synergies.
  // Global boost (2x with 2 effects, 3x with 3 effects) is multiplied by the per-ring triple overdrive:
  // Ring 2 accelerates 3x (own axis) / 2x (axes 2 & 3); Ring 3 accelerates 2x / 1.5x.
  function computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx = 1, activeCount = 1) {
    const isOuter = ringSlotIdx === 2;
    const isTriple = (activeCount || 0) >= 3;
    const globalMult = getGlobalRotMult(activeCount);
    const spinMult = globalMult * (isTriple ? (isOuter ? 2.0 : 3.0) : 1.0);
    const otherMult = globalMult * (isTriple ? (isOuter ? 1.5 : 2.0) : 1.0);

    const ringR = baseR * (isOuter ? 2.02 : 1.48) * clamp(0.90 + (power || 0) * 0.14, 0.90, 1.06);
    const rx0 = isOuter ? 1.73 : 0.68;
    const ry0 = isOuter ? 1.92 : 0.0;
    const rz0 = isOuter ? -0.94 : -0.22;

    // Speed multipliers scale rotation TIME (not wobble amplitude) so fast rings stay smooth, never jerky
    const tO = tSec * otherMult;
    const tS = tSec * spinMult;
    const rx = rx0 + tO * 0.17 + Math.sin(tO * 0.23) * 0.26;
    const ry = ry0 + tO * 0.21 + Math.cos(tO * 0.17) * 0.30;
    const rz = rz0 + tS * 0.13 + Math.sin(tS * 0.29) * 0.18;
    const cxX = Math.cos(rx), sxX = Math.sin(rx);
    const cyY = Math.cos(ry), syY = Math.sin(ry);
    const czZ = Math.cos(rz), szZ = Math.sin(rz);

    function rotateLocal(lx, ly, lz) {
      const y1 = ly * cxX - lz * sxX;
      const z1 = ly * sxX + lz * cxX;
      const x2 = lx * cyY + z1 * syY;
      const z2 = -lx * syY + z1 * cyY;
      const x3 = x2 * czZ - y1 * szZ;
      const y3 = x2 * szZ + y1 * czZ;
      return { x: x3, y: y3, z: z2 };
    }

    function invRotateLocal(wx, wy, wz) {
      // Exact orthogonal inverse (Rx^T * Ry^T * Rz^T) mapping 3D world space back into the ring's current plane
      const x2 = wx * czZ + wy * szZ;
      const y1 = -wx * szZ + wy * czZ;
      const lx = x2 * cyY - wz * syY;
      const z1 = x2 * syY + wz * cyY;
      const ly = y1 * cxX + z1 * sxX;
      const lz = -y1 * sxX + z1 * cxX;
      return { lx, ly, lz };
    }

    function projectOffset(rad, theta, radialOff = 0, axialOff = 0) {
      const r = rad + radialOff;
      const lx = Math.cos(theta) * r;
      const ly = Math.sin(theta) * r;
      const w = rotateLocal(lx, ly, axialOff);
      const persp = 115 / (115 - w.z);
      return {
        dx: w.x * persp,
        dy: w.y * persp,
        x: w.x,
        y: w.y,
        z: w.z,
        persp,
        theta,
      };
    }

    const u = rotateLocal(1, 0, 0);
    const v = rotateLocal(0, 1, 0);
    const n = rotateLocal(0, 0, 1);

    return { ringR, rx, ry, rz, spinMult, otherMult, globalMult, ringSlotIdx, u, v, n, rotateLocal, invRotateLocal, projectOffset };
  }

  // Persistent 3D Newtonian steering & inertia cache for Slot 2 & Slot 3 ring fragments (all elements except Shock).
  // Keyed per fragment; advances smoothly in real time (dt <= 0.35s) and auto-warms deterministically on init or time jumps.
  const _inertialPieceStates = new Map();
  function resetInertialRingCache() {
    _inertialPieceStates.clear();
  }

  // Pure 3D Newtonian momentum & steering physics (NO synthetic springing or periodic bounce):
  // - Small pieces have high acceleration & drag -> nimble & maneuverable, turning quickly to hug the 3D ring line.
  // - Large pieces have low acceleration (slowly bend their velocity vector) & low drag -> they lag smoothly behind
  //   the turning 3D ring, build up speed chasing the ring line, and sail smoothly PAST it by inertia while shedding speed.
  function computeInertialRingPiece(opts) {
    const {
      baseR,
      tSec,
      power,
      ringSlotIdx = 1,
      activeCount = 1,
      baseAngle = 0,
      angRate = 0.28,
      radOff = 0,
      axOff = 0,
      sizeNorm = 0.5,
      pieceSeed = 1,
      pieceKey,
      swingGain = 1.0,
      basisNow: basisNowArg,
    } = opts;

    const basisNow = basisNowArg || computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
    const sNorm = clamp(sizeNorm, 0, 1);
    const effSize = clamp(sNorm * swingGain, 0, 1);
    const mass = 0.35 + Math.pow(effSize, 1.35) * 1.65;

    // Gentle home offset inside the ring tube so small pieces don't collapse onto a 1px wire
    const radHome = radOff * 0.42;
    const axHome = axOff * 0.42;

    const key = pieceKey || `r${ringSlotIdx}_s${pieceSeed}_${Math.round(effSize * 1000)}`;

    function stepBody(st, tAt, dtStep, bAt) {
      const b = bAt || computeSlot2OrbitBasis(baseR, tAt, power, ringSlotIdx, activeCount);
      const wOrbit = b.spinMult * angRate;
      const wTilt = Math.max(0.28, b.otherMult * 0.26 + b.spinMult * 0.13);
      const wScale = Math.hypot(wOrbit, wTilt);
      const vOrbit = wOrbit * (b.ringR + radHome);

      // Geometric interpolation gives smooth progression from agile small pieces -> heavy sweeping big chunks:
      // Small (effSize=0): high steering accel (14.5) & brisk drag (3.4) -> crisp maneuverability
      // Large (effSize=1): low steering accel (2.05) & low drag (0.58) -> slow vector turning + smooth inertial coast past ring line
      const sPow = Math.pow(effSize, 1.05);
      const accelLine = (wScale * wScale * b.ringR) * (14.5 * Math.pow(2.05 / 14.5, sPow));
      const drag = wScale * (3.4 * Math.pow(0.58 / 3.4, sPow));
      const softRad = b.ringR * (0.14 + sPow * 0.24);

      // Map current 3D position into the ring's current plane to find the exact nearest point on the current ring line
      const loc = b.invRotateLocal(st.x, st.y, st.z);
      const curR = Math.hypot(loc.lx, loc.ly) || 1e-4;
      const ux = loc.lx / curR;
      const uy = loc.ly / curR;
      const nearW = b.rotateLocal(ux * (b.ringR + radHome), uy * (b.ringR + radHome), axHome);
      const tangW = b.rotateLocal(-uy * vOrbit, ux * vOrbit, 0);

      // Mild angular slot anchor keeps fragments distributed evenly around the ring without forcing rigid lockstep
      const slotTh = baseAngle + (tAt * b.spinMult) * angRate;
      const slotW = b.rotateLocal(Math.cos(slotTh) * (b.ringR + radHome), Math.sin(slotTh) * (b.ringR + radHome), axHome);

      const tx = nearW.x * 0.72 + slotW.x * 0.28;
      const ty = nearW.y * 0.72 + slotW.y * 0.28;
      const tz = nearW.z * 0.72 + slotW.z * 0.28;
      const dx = tx - st.x;
      const dy = ty - st.y;
      const dz = tz - st.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;

      // Smooth thrust-limited acceleration toward the current ring line (NO sharp snap or springy reverse bounce)
      const pull = accelLine * Math.tanh(dist / softRad);
      // Viscous drag sheds excess velocity relative to the local orbital current -> smooth inertial coasting & deceleration
      const relVx = st.vx - tangW.x;
      const relVy = st.vy - tangW.y;
      const relVz = st.vz - tangW.z;

      const ax = (dx / dist) * pull - drag * relVx;
      const ay = (dy / dist) * pull - drag * relVy;
      const az = (dz / dist) * pull - drag * relVz;

      st.vx += ax * dtStep;
      st.vy += ay * dtStep;
      st.vz += az * dtStep;
      st.x += st.vx * dtStep;
      st.y += st.vy * dtStep;
      st.z += st.vz * dtStep;
    }

    let st = _inertialPieceStates.get(key);
    const needWarm = !st
      || Math.abs(st.baseR - baseR) > 0.5
      || (tSec < st.lastT - 1e-5)
      || (tSec - st.lastT > 0.35);

    if (needWarm) {
      // Deterministic warm-start over a short lookback window so playback starts mid-glide & test jumps are reproducible
      const warmSec = 3.2;
      const tStart = tSec - warmSec;
      const bStart = computeSlot2OrbitBasis(baseR, tStart, power, ringSlotIdx, activeCount);
      const thStart = baseAngle + (tStart * bStart.spinMult) * angRate;
      const rStart = bStart.ringR + radHome;
      const pStart = bStart.rotateLocal(Math.cos(thStart) * rStart, Math.sin(thStart) * rStart, axHome);
      const vOrbitStart = bStart.spinMult * angRate * rStart;
      const vStart = bStart.rotateLocal(-Math.sin(thStart) * vOrbitStart, Math.cos(thStart) * vOrbitStart, 0);
      st = {
        x: pStart.x, y: pStart.y, z: pStart.z,
        vx: vStart.x, vy: vStart.y, vz: vStart.z,
        lastT: tStart,
        baseR,
      };
      const steps = 96;
      const h = warmSec / steps;
      for (let k = 1; k <= steps; k++) {
        const tk = tStart + k * h;
        stepBody(st, tk, h, k === steps ? basisNow : null);
      }
      st.lastT = tSec;
      _inertialPieceStates.set(key, st);
    } else {
      const dt = tSec - st.lastT;
      if (dt > 1e-6) {
        // Substep cleanly (<= 16ms) so real-time playback and 50ms test steps share identical smooth physics
        const subSteps = Math.max(1, Math.min(24, Math.ceil(dt / 0.016)));
        const h = dt / subSteps;
        for (let k = 1; k <= subSteps; k++) {
          const tk = st.lastT + k * h;
          stepBody(st, tk, h, k === subSteps ? basisNow : null);
        }
        st.lastT = tSec;
      }
    }

    // Project 3D world position & compute exact offset relative to the current 3D ring line
    const persp = 115 / (115 - st.z);
    const dxScreen = st.x * persp;
    const dyScreen = st.y * persp;
    const locNow = basisNow.invRotateLocal(st.x, st.y, st.z);
    const curR = Math.hypot(locNow.lx, locNow.ly) || 1e-4;
    const ux = locNow.lx / curR;
    const uy = locNow.ly / curR;
    const nearW = basisNow.rotateLocal(ux * (basisNow.ringR + radHome), uy * (basisNow.ringR + radHome), axHome);
    const vOrbitNow = basisNow.spinMult * angRate * (basisNow.ringR + radHome);
    const tangW = basisNow.rotateLocal(-uy * vOrbitNow, ux * vOrbitNow, 0);
    const relVx = st.vx - tangW.x;
    const relVy = st.vy - tangW.y;
    const relVz = st.vz - tangW.z;

    // 2D screen velocity (scaled to ~0.025s step for flame tilt & droplet alignment)
    const vx2d = st.vx * persp * 0.025;
    const vy2d = st.vy * persp * 0.025;
    const spd3d = Math.hypot(st.vx, st.vy, st.vz);
    const relSpd = Math.hypot(relVx, relVy, relVz);
    const speedRatio = vOrbitNow > 1e-3 ? clamp(spd3d / vOrbitNow, 0.2, 3.0) : 1.0;
    const radErr = curR - (basisNow.ringR + radHome);
    const axErr = locNow.lz - axHome;
    const distToRingLine = Math.hypot(st.x - nearW.x, st.y - nearW.y, st.z - nearW.z);
    const movingAwayFromLine = (relVx * (st.x - nearW.x) + relVy * (st.y - nearW.y) + relVz * (st.z - nearW.z)) > 0;

    return {
      dx: dxScreen,
      dy: dyScreen,
      x: st.x,
      y: st.y,
      z: st.z,
      persp,
      theta: Math.atan2(locNow.ly, locNow.lx),
      mass,
      sizeNorm: sNorm,
      speedRatio,
      vx: vx2d,
      vy: vy2d,
      velAng: Math.atan2(vy2d, vx2d),
      spd3d,
      relSpd,
      radErr,
      axErr,
      distToRingLine,
      movingAwayFromLine,
      ringLineTarget: nearW,
    };
  }

  function computeSlot2ShockOrbitalNodes(baseR, tSec, power, ringSlotIdx = 1, activeCount = 1) {
    const basis = computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
    const spinT = tSec * basis.spinMult;
    const phaseShift = ringSlotIdx === 2 ? 0.52 : 0.0;
    const scaleN = (baseR / 17.5) * clamp(0.90 + (power || 0) * 0.12, 0.90, 1.05);
    const nodes = [];
    let dirX = 0, dirY = 0;
    let sparkEnergy = 0;
    let maxNodeSpark = 0;

    for (let i = 0; i < 6; i++) {
      const theta = (i * Math.PI * 2) / 6 + spinT * 0.42 + phaseShift;
      const radWob = Math.sin(tSec * 1.9 + i * 2.15 + phaseShift) * 1.2 * scaleN;
      const axWob = Math.cos(tSec * 1.5 + i * 1.7 + phaseShift) * 0.9 * scaleN;
      const proj = basis.projectOffset(basis.ringR, theta, radWob, axWob);

      // Independent minor outward arc bursts on each of the 6 orbital clusters
      const nPeriod = 0.24 + (i % 3) * 0.09;
      const nuT = tSec + i * 0.317 + phaseShift * 1.3;
      const nK = Math.floor(nuT / nPeriod);
      const nFrac = (nuT - nK * nPeriod) / nPeriod;
      const nStrength = Math.pow(hash01(nK * 29 + i * 53 + ringSlotIdx * 17), 1.25);
      const nDuty = 0.26 + nStrength * 0.28;
      const hasSpark = nFrac <= nDuty;
      const sparkAlpha = hasSpark ? clamp((1 - Math.pow(nFrac / nDuty, 1.9) * 0.78) * (0.72 + 0.28 * hash01(Math.floor(tSec * 36) + i + ringSlotIdx * 7)), 0, 1) : 0;
      const sparkWeight = hasSpark ? sparkAlpha * (0.35 + nStrength * 0.75) : 0;

      if (sparkWeight > 0.05) {
        sparkEnergy += sparkWeight;
        if (sparkWeight > maxNodeSpark) maxNodeSpark = sparkWeight;
        const dLen = Math.hypot(proj.dx, proj.dy) || 1;
        dirX += (proj.dx / dLen) * sparkWeight;
        dirY += (proj.dy / dLen) * sparkWeight;
      }

      nodes.push({
        idx: i,
        ringSlotIdx,
        dx: proj.dx,
        dy: proj.dy,
        x: proj.x,
        y: proj.y,
        z: proj.z,
        persp: proj.persp,
        theta: proj.theta,
        isBack: proj.z < 0,
        nK,
        nStrength,
        hasSpark,
        sparkAlpha,
        amplifyFlash: 0,
      });
    }

    const sLen = Math.hypot(dirX, dirY);
    const slot2Flash = clamp(Math.pow(clamp(sparkEnergy * 0.28 + maxNodeSpark * 0.42, 0, 1.0), 0.95) * (0.85 + 0.15 * Math.sin(tSec * 22.0)), 0, 0.72);
    return {
      basis,
      nodes,
      slot2Flash,
      dirX: sLen > 0.05 ? dirX / sLen : 0,
      dirY: sLen > 0.05 ? dirY / sLen : -0.25,
    };
  }

  // Single source of truth for outward stepped-leader lightning channels & synchronized chamber strobe.
  // Supports relay amplification through Slot 2 / Slot 3 orbital clusters (and chained Ring 2 -> Ring 3 when all 3 are Shock!).
  function computeShockStrikeFrame(tSec, relayNodes2, relayNodes3) {
    const strikes = [];
    let longEnergySum = 0;
    let maxLongBolt = 0;
    let dirX = 0;
    let dirY = 0;
    const hasR2 = Array.isArray(relayNodes2) && relayNodes2.length === 6;
    const hasR3 = Array.isArray(relayNodes3) && relayNodes3.length === 6;
    const hasRelays = hasR2 || hasR3;

    for (let ch = 0; ch < SHOCK_CHANNEL_PERIODS.length; ch++) {
      const p = SHOCK_CHANNEL_PERIODS[ch];
      const uT = tSec + ch * 0.243;
      const k = Math.floor(uT / p);
      const frac = (uT - k * p) / p;
      const strength = Math.pow(hash01(k * 23 + ch * 41), 1.35);
      // Staccato dielectric breakdown bursts so flashes alternate cleanly between quiet lulls & multi-bolt surges
      const duty = 0.24 + strength * 0.26;
      if (frac > duty) continue;

      const lenRoll = clamp(strength * 0.52 + hash01(k * 37 + ch * 19) * 0.52, 0.04, 1.0);
      const widthRoll = clamp(strength * 0.62 + hash01(k * 67 + ch * 29) * 0.42, 0.04, 1.0);
      const baseAng = hash01(k * 19 + ch * 31) * Math.PI * 2;
      const f = frac / duty;
      const restrike = 0.50 + 0.50 * hash01(Math.floor(tSec * 68) + ch * 17);
      const boltAlpha = clamp((1.0 - Math.pow(f, 2.0) * 0.80) * restrike, 0, 1);

      let relayIdx = -1;
      let relayNode = null;
      let relayNode2 = null;
      let effectiveAng = baseAng;
      if (hasRelays) {
        if (hasR2 && hasR3) {
          relayIdx = Math.floor(hash01(k * 91 + ch * 17) * 6) % 6;
          relayNode = relayNodes2[relayIdx];
          relayNode.amplifyFlash = Math.max(relayNode.amplifyFlash, clamp(boltAlpha * (0.58 + widthRoll * 0.55), 0, 1.25));
          // Pick closest outer Ring 3 node in directional cone for chained double-relay jump on strong bolts
          if (widthRoll > 0.35 || ch % 2 === 0) {
            let bestN3 = relayNodes3[0];
            let bestD = Infinity;
            for (let m = 0; m < 6; m++) {
              const cand = relayNodes3[m];
              const d = Math.hypot(cand.dx - relayNode.dx, cand.dy - relayNode.dy);
              if (d < bestD) { bestD = d; bestN3 = cand; }
            }
            relayNode2 = bestN3;
            relayNode2.amplifyFlash = Math.max(relayNode2.amplifyFlash, clamp(boltAlpha * (0.65 + widthRoll * 0.55), 0, 1.35));
            effectiveAng = Math.atan2(relayNode2.dy, relayNode2.dx) + (hash01(k * 43 + ch) - 0.5) * 0.55;
          } else {
            effectiveAng = Math.atan2(relayNode.dy, relayNode.dx) + (hash01(k * 43 + ch) - 0.5) * 0.62;
          }
        } else {
          const pool = hasR2 ? relayNodes2 : relayNodes3;
          relayIdx = Math.floor(hash01(k * 91 + ch * 17) * 6) % 6;
          relayNode = pool[relayIdx];
          relayNode.amplifyFlash = Math.max(relayNode.amplifyFlash, clamp(boltAlpha * (0.58 + widthRoll * 0.55), 0, 1.25));
          effectiveAng = Math.atan2(relayNode.dy, relayNode.dx) + (hash01(k * 43 + ch) - 0.5) * 0.62;
        }
      }

      // Chamber strobe & shadow jump react when bolts burst outward (>= ~28px) and build long branches (or via amplified relays)
      const isLong = hasRelays ? (lenRoll > 0.30) : (lenRoll > 0.46);
      const hasMainSplit = widthRoll > 0.62 && hash01(k * 47 + ch) > 0.45;
      const hasLongBranches = (lenRoll > 0.46 || hasRelays) && (hasMainSplit || lenRoll > 0.52);
      const branchMult = isLong ? (hasMainSplit ? 1.65 : (hasLongBranches ? 1.32 : 0.78)) : 0;
      const ampMult = hasRelays ? (relayNode2 ? 1.35 : 1.22) : 1.0;
      const longWeight = isLong
        ? clamp((lenRoll - (hasRelays ? 0.24 : 0.40)) / 0.60, 0, 1.35) * (0.45 + widthRoll * 0.80) * branchMult * ampMult * boltAlpha
        : 0;

      if (longWeight > 0.01) {
        longEnergySum += longWeight;
        if (longWeight > maxLongBolt) maxLongBolt = longWeight;
        dirX += Math.cos(effectiveAng) * longWeight;
        dirY += Math.sin(effectiveAng) * longWeight;
      }

      strikes.push({
        ch,
        k,
        strength,
        lenRoll,
        widthRoll,
        baseAng,
        effectiveAng,
        boltAlpha,
        hasMainSplit,
        longWeight,
        relayIdx,
        relayNode,
        relayNode2,
        isAmplified: hasRelays,
      });
    }

    const dirLen = Math.hypot(dirX, dirY);
    const centroidX = dirLen > 0.05 ? dirX / dirLen : 0;
    const centroidY = dirLen > 0.05 ? dirY / dirLen : -0.30;

    // Smooth, eye-safe lightning surge envelope synced to long outward forked bolts
    const rawLongFlash = longEnergySum * 0.38 + maxLongBolt * 0.52;
    const arcFlutter = 0.85 + 0.15 * Math.sin(tSec * 24.0 + Math.cos(tSec * 13.7));
    const baseStrobe = Math.pow(clamp(rawLongFlash, 0, 1.35), 0.92);
    const strikeFlash = clamp(baseStrobe * (rawLongFlash > 0.16 ? arcFlutter : 0.48), 0, 0.95);

    const jitWaveX = Math.sin(tSec * 27.3) * 4.5 + Math.cos(tSec * 19.1) * 3.0;
    const jitWaveY = Math.cos(tSec * 23.7) * 3.5 + Math.sin(tSec * 16.3) * 2.5;
    const jitterX = (centroidX * 11.0 + jitWaveX) * strikeFlash;
    const jitterY = (centroidY * 9.0 + jitWaveY) * strikeFlash;

    return {
      strikes,
      strikeFlash,
      centroidX,
      centroidY,
      jitterX,
      jitterY,
      hasLongStrike: rawLongFlash > 0.16,
    };
  }

  function resolveShockFrame(analysis, tSec) {
    const slots = analysis && analysis.slots;
    const s0 = slots ? slots[0] : (analysis && analysis.slot1School);
    const s1 = slots ? slots[1] : null;
    const s2 = slots ? slots[2] : null;
    const s1IsShock = Boolean(s0 && s0.id === 22 && s0.elementKey === 'shock');
    const s2IsShock = Boolean(s1 && s1.id === 22 && s1.elementKey === 'shock');
    const s3IsShock = Boolean(s2 && s2.id === 22 && s2.elementKey === 'shock');
    if (!s1IsShock && !s2IsShock && !s3IsShock) return null;

    const baseR = 17.5;
    const power = (analysis && analysis.powerProfile && analysis.powerProfile.power) || 0.38;
    const activeCount = (analysis && analysis.activeCount) || 1;
    const slot2Data = s2IsShock ? computeSlot2ShockOrbitalNodes(baseR, tSec, power, 1, activeCount) : null;
    const slot3Data = s3IsShock ? computeSlot2ShockOrbitalNodes(baseR, tSec, power, 2, activeCount) : null;

    if (s1IsShock) {
      const f1 = computeShockStrikeFrame(tSec, slot2Data ? slot2Data.nodes : null, slot3Data ? slot3Data.nodes : null);
      const extraFlash = (slot2Data ? slot2Data.slot2Flash * 0.22 : 0) + (slot3Data ? slot3Data.slot2Flash * 0.22 : 0);
      const combFlash = clamp(f1.strikeFlash * ((s2IsShock || s3IsShock) ? 1.10 : 1.0) + extraFlash, 0, 1.02);
      const combJitScale = f1.strikeFlash > 0.05 ? combFlash / f1.strikeFlash : 1.0;
      const exX = (slot2Data ? slot2Data.dirX * slot2Data.slot2Flash * 2.6 : 0) + (slot3Data ? slot3Data.dirX * slot3Data.slot2Flash * 2.6 : 0);
      const exY = (slot2Data ? slot2Data.dirY * slot2Data.slot2Flash * 2.6 : 0) + (slot3Data ? slot3Data.dirY * slot3Data.slot2Flash * 2.6 : 0);
      return {
        ...f1,
        strikeFlash: combFlash,
        jitterX: f1.jitterX * combJitScale + exX,
        jitterY: f1.jitterY * combJitScale + exY,
        hasLongStrike: f1.hasLongStrike || extraFlash > 0.14,
        nodes2: slot2Data ? slot2Data.nodes : null,
        nodes3: slot3Data ? slot3Data.nodes : null,
        orbitBasis2: slot2Data ? slot2Data.basis : null,
        orbitBasis3: slot3Data ? slot3Data.basis : null,
        slot2Flash: slot2Data ? slot2Data.slot2Flash : 0,
        slot3Flash: slot3Data ? slot3Data.slot2Flash : 0,
        s1IsShock: true,
        s2IsShock,
        s3IsShock,
        isDoubleShock: s2IsShock || s3IsShock,
      };
    }

    // Slot 2 / Slot 3 Shock without Shock in Slot 1: orbital nodes still drive independent chamber strobe
    const rawS23Flash = (slot2Data ? slot2Data.slot2Flash * 0.90 : 0) + (slot3Data ? slot3Data.slot2Flash * 0.90 : 0);
    const combOrbFlash = clamp(rawS23Flash, 0, 0.86);
    const dX = (slot2Data ? slot2Data.dirX * slot2Data.slot2Flash : 0) + (slot3Data ? slot3Data.dirX * slot3Data.slot2Flash : 0);
    const dY = (slot2Data ? slot2Data.dirY * slot2Data.slot2Flash : 0) + (slot3Data ? slot3Data.dirY * slot3Data.slot2Flash : 0);
    const dLen = Math.hypot(dX, dY);
    const cX = dLen > 0.05 ? dX / dLen : 0;
    const cY = dLen > 0.05 ? dY / dLen : -0.25;
    const jitWaveX = Math.sin(tSec * 25.1) * 3.2 + Math.cos(tSec * 17.3) * 2.2;
    const jitWaveY = Math.cos(tSec * 21.7) * 2.6 + Math.sin(tSec * 14.9) * 1.8;
    return {
      strikes: [],
      strikeFlash: combOrbFlash,
      centroidX: cX,
      centroidY: cY,
      jitterX: (cX * 8.0 + jitWaveX) * combOrbFlash,
      jitterY: (cY * 6.5 + jitWaveY) * combOrbFlash,
      hasLongStrike: combOrbFlash > 0.14,
      nodes2: slot2Data ? slot2Data.nodes : null,
      nodes3: slot3Data ? slot3Data.nodes : null,
      orbitBasis2: slot2Data ? slot2Data.basis : null,
      orbitBasis3: slot3Data ? slot3Data.basis : null,
      slot2Flash: slot2Data ? slot2Data.slot2Flash : 0,
      slot3Flash: slot3Data ? slot3Data.slot2Flash : 0,
      s1IsShock: false,
      s2IsShock,
      s3IsShock,
      isDoubleShock: false,
    };
  }

  function getSpreadTemplateByIndex(seedIdx, side, state) {
    const idx = Math.abs(Math.floor(seedIdx || 0));
    const preset = BOOK_SPREAD_PRESETS[idx % BOOK_SPREAD_PRESETS.length];
    if (side === 'left') {
      return (state && state.leftTemplate && state.leftTemplate !== 'auto') ? state.leftTemplate : preset.left;
    }
    return (state && state.rightTemplate && state.rightTemplate !== 'auto') ? state.rightTemplate : preset.right;
  }

  function resolveBookSpread(flipSnapshot, state) {
    const leftSeed = (flipSnapshot && Number.isFinite(flipSnapshot.leftSeed))
      ? flipSnapshot.leftSeed
      : ((flipSnapshot && Number.isFinite(flipSnapshot.pageSeed)) ? flipSnapshot.pageSeed : 0);
    const rightSeed = (flipSnapshot && Number.isFinite(flipSnapshot.rightSeed))
      ? flipSnapshot.rightSeed
      : ((flipSnapshot && Number.isFinite(flipSnapshot.pageSeed)) ? flipSnapshot.pageSeed : 0);
    return {
      leftId: getSpreadTemplateByIndex(leftSeed, 'left', state),
      rightId: getSpreadTemplateByIndex(rightSeed, 'right', state),
      leftSeed,
      rightSeed,
      pageSeed: rightSeed,
    };
  }

  // Deterministic sporadic page-flip burst state machine.
  // Book rests calmly open most of the time, then turns N continuous sheets (L_{K+m} -> L_{K+m+1})
  // so left & right halves match turning leaves seamlessly with zero snap at burst end.
  function createController(opts = {}) {
    let simTime = Number.isFinite(opts.initialTime) ? opts.initialTime : 0;
    let paused = Boolean(opts.paused);
    let speed = Number.isFinite(opts.speed) ? opts.speed : 1.0;
    let rngSeed = 1337;
    let pageSeed = 0;
    let activeBurst = null;
    let nextBurstAt = Number.isFinite(opts.firstBurstAt) ? opts.firstBurstAt : 3.2;
    let bookOpenRaw = Number.isFinite(opts.initialOpen) ? clamp(opts.initialOpen, 0, 1) : 1.0;
    let targetHasEffects = bookOpenRaw > 0.5;

    function nextRand() {
      rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
      return rngSeed / 4294967296;
    }

    function scheduleNextBurst(fromTime) {
      return fromTime + 4.8 + nextRand() * 6.6;
    }

    function startBurst(atTime, forcedLeaves) {
      const leafCount = forcedLeaves || (3 + Math.floor(nextRand() * 4)); // 3..6 consecutive sheets
      const leaves = [];
      let cursor = 0;
      for (let i = 0; i < leafCount; i++) {
        const dur = 0.34 + nextRand() * 0.10;
        const gap = 0.16 + nextRand() * 0.08;
        leaves.push({
          index: i,
          startOffset: cursor,
          duration: dur,
          curlAmp: 0.80 + nextRand() * 0.36,
          skewLead: (nextRand() - 0.35) * 0.16,
          dir: 1,
          frontSeed: pageSeed + i,
          backSeed: pageSeed + i + 1,
        });
        cursor += gap;
      }
      const totalDur = leaves[leaves.length - 1].startOffset + leaves[leaves.length - 1].duration;
      activeBurst = {
        startTime: atTime,
        endTime: atTime + totalDur,
        baseSeed: pageSeed,
        leaves,
      };
    }

    function update(dtSec, hasEffects) {
      if (hasEffects !== undefined) {
        targetHasEffects = Boolean(hasEffects);
      }
      if (paused) return getFlipSnapshot();
      const dt = clamp(Number(dtSec) || 0, 0, 0.12) * speed;
      simTime += dt;

      // Smooth physical hinged opening/closing transition (~0.75s full swing)
      const openRate = 1.35 * dt;
      if (targetHasEffects) {
        if (bookOpenRaw < 1) {
          bookOpenRaw = Math.min(1, bookOpenRaw + openRate);
          nextBurstAt = Math.max(nextBurstAt, simTime + 1.8);
        }
      } else {
        if (activeBurst) {
          pageSeed = activeBurst.baseSeed + activeBurst.leaves.length;
          activeBurst = null;
        }
        if (bookOpenRaw > 0) {
          bookOpenRaw = Math.max(0, bookOpenRaw - openRate);
        }
      }

      if (targetHasEffects && bookOpenRaw >= 0.995) {
        if (activeBurst && simTime >= activeBurst.endTime) {
          // Exact continuity: after leafCount pages settle onto left, spread equals baseSeed + leaves.length
          pageSeed = activeBurst.baseSeed + activeBurst.leaves.length;
          activeBurst = null;
          nextBurstAt = scheduleNextBurst(simTime);
        } else if (!activeBurst && simTime >= nextBurstAt) {
          startBurst(simTime);
        }
      }
      return getFlipSnapshot();
    }

    function triggerBurst(forcedLeaves) {
      if (!targetHasEffects || bookOpenRaw < 0.99) {
        targetHasEffects = true;
        bookOpenRaw = 1.0;
      }
      if (activeBurst) {
        pageSeed = activeBurst.baseSeed + activeBurst.leaves.length;
      }
      startBurst(simTime, forcedLeaves);
      nextBurstAt = scheduleNextBurst(simTime + 2.0);
    }

    function getFlipSnapshot() {
      if (!activeBurst || simTime < activeBurst.startTime || simTime >= activeBurst.endTime) {
        return {
          inBurst: false,
          pageSeed,
          leftSeed: pageSeed,
          rightSeed: pageSeed,
          leaves: [],
          burstProgress: 0,
        };
      }
      const elapsed = simTime - activeBurst.startTime;
      const total = Math.max(0.001, activeBurst.endTime - activeBurst.startTime);
      const turning = [];
      let settledCount = 0;
      let startedCount = 0;

      for (let i = 0; i < activeBurst.leaves.length; i++) {
        const lf = activeBurst.leaves[i];
        const rawP = (elapsed - lf.startOffset) / lf.duration;
        if (rawP >= 1) {
          settledCount++;
          startedCount++;
        } else if (rawP > 0) {
          startedCount++;
          turning.push({
            index: lf.index,
            progress: rawP,
            curlAmp: lf.curlAmp,
            skewLead: lf.skewLead,
            dir: lf.dir,
            frontSeed: lf.frontSeed,
            backSeed: lf.backSeed,
          });
        }
      }

      return {
        inBurst: true,
        pageSeed: activeBurst.baseSeed + settledCount,
        leftSeed: activeBurst.baseSeed + settledCount,
        rightSeed: activeBurst.baseSeed + startedCount,
        leaves: turning,
        burstProgress: clamp(elapsed / total, 0, 1),
      };
    }

    return {
      update,
      triggerBurst,
      getFlipSnapshot,
      getOpenAmount: () => easeInOutCubic(clamp(bookOpenRaw, 0, 1)),
      getRawOpen: () => bookOpenRaw,
      setOpenAmount: (v, snapTarget) => {
        bookOpenRaw = clamp(Number(v) || 0, 0, 1);
        if (snapTarget !== undefined) targetHasEffects = Boolean(snapTarget);
        if (bookOpenRaw < 0.99) activeBurst = null;
      },
      setHasEffects: (v) => { targetHasEffects = Boolean(v); },
      getTime: () => simTime,
      setTime: (t) => { simTime = Math.max(0, Number(t) || 0); },
      isPaused: () => paused,
      setPaused: (v) => { paused = Boolean(v); },
      setSpeed: (s) => { speed = clamp(Number(s) || 1, 0.15, 4); },
      getPageSeed: () => pageSeed,
      getNextBurstIn: () => activeBurst ? 0 : Math.max(0, nextBurstAt - simTime),
    };
  }

  const backdropCache = new Map();
  const lightmapCache = new Map();
  const tapestryCache = new Map();
  const pedestalCache = new Map();
  let _bookBaseCache = { key: '', canvas: null };

  function createOffscreenCanvas(w, h) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    return null;
  }

  const candleBodyCache = new Map();
  const vizRadialSpriteCache = new Map();

  function getLightmap(W, H) {
    const lw = Math.max(1, Math.ceil(W * 0.5));
    const lh = Math.max(1, Math.ceil(H * 0.5));
    const key = `${lw}x${lh}`;
    if (!lightmapCache.has(key)) {
      lightmapCache.set(key, createOffscreenCanvas(lw, lh));
    }
    return lightmapCache.get(key);
  }

  function getVizRadialSprite(key, size, buildFn) {
    if (vizRadialSpriteCache.has(key)) return vizRadialSpriteCache.get(key);
    const cv = createOffscreenCanvas(size, size);
    if (!cv) return null;
    const c = cv.getContext('2d');
    buildFn(c, size);
    vizRadialSpriteCache.set(key, cv);
    return cv;
  }

  function getCandleCarveSprite() {
    return getVizRadialSprite('candle_carve_mask', 64, (c, sz) => {
      const h = sz * 0.5;
      const g = c.createRadialGradient(h, h, 1.2, h, h, h - 0.5);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.64)');
      g.addColorStop(0.45, 'rgba(0, 0, 0, 0.30)');
      g.addColorStop(0.78, 'rgba(0, 0, 0, 0.08)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(h, h, h - 0.5, 0, Math.PI * 2);
      c.fill();
    });
  }

  function getSchoolFlameHaloSprite(school) {
    const key = `candle_halo_${school.glowRgb}_${school.accentRgb}`;
    return getVizRadialSprite(key, 32, (c, sz) => {
      const h = sz * 0.5;
      const g = c.createRadialGradient(h, h, 0.5, h, h, h - 0.5);
      g.addColorStop(0, `rgba(${school.glowRgb}, 1)`);
      g.addColorStop(0.50, `rgba(${school.accentRgb}, 0.34)`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(h, h, h - 0.5, 0, Math.PI * 2);
      c.fill();
    });
  }

  function getPuffRadialSprite(kind) {
    return getVizRadialSprite(`puff_${kind}`, 48, (c, sz) => {
      const h = sz * 0.5;
      const g = c.createRadialGradient(h, h, 0.5, h, h, h - 1);
      if (kind === 'cold') {
        g.addColorStop(0, 'rgba(224, 245, 255, 1)');
        g.addColorStop(0.55, 'rgba(125, 211, 252, 0.55)');
        g.addColorStop(1, 'rgba(56, 189, 248, 0)');
      } else if (kind === 'poison') {
        g.addColorStop(0, 'rgba(132, 224, 72, 1)');
        g.addColorStop(0.50, 'rgba(34, 197, 94, 0.60)');
        g.addColorStop(1, 'rgba(20, 83, 45, 0)');
      } else if (kind === 'poison_wisp') {
        g.addColorStop(0, 'rgba(163, 230, 53, 1)');
        g.addColorStop(1, 'rgba(34, 197, 94, 0)');
      } else if (kind === 'myst_puff') {
        g.addColorStop(0.0, 'rgba(216, 180, 254, 0.88)');
        g.addColorStop(0.48, 'rgba(147, 51, 234, 0.65)');
        g.addColorStop(1.0, 'rgba(46, 16, 101, 0)');
      } else if (kind === 'myst_hoop_bloom') {
        g.addColorStop(0.0, 'rgba(192, 132, 252, 1)');
        g.addColorStop(0.55, 'rgba(147, 51, 234, 0.46)');
        g.addColorStop(1.0, 'rgba(88, 28, 135, 0)');
      } else if (kind === 'resto_catch') {
        g.addColorStop(0, 'rgba(255, 250, 224, 1)');
        g.addColorStop(0.55, 'rgba(255, 214, 84, 0.45)');
        g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else if (kind === 'resto_flare') {
        g.addColorStop(0, 'rgba(255, 252, 232, 1)');
        g.addColorStop(0.32, 'rgba(255, 232, 140, 0.68)');
        g.addColorStop(0.68, 'rgba(248, 186, 46, 0.24)');
        g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(h, h, h - 1, 0, Math.PI * 2);
      c.fill();
    });
  }

  function getEnvelopeRadialSprite(elKey, isSmoke) {
    const key = `env_${elKey}_${isSmoke ? 's' : 'b'}`;
    return getVizRadialSprite(key, 48, (c, sz) => {
      const h = sz * 0.5;
      const st = getEnvelopeCloudStyle(elKey);
      const g = c.createRadialGradient(h, h, 0.5, h, h, h - 1);
      if (isSmoke && st.smoke) {
        g.addColorStop(0, `rgba(${st.smoke}, 1)`);
        g.addColorStop(0.6, `rgba(${st.smoke}, 0.5)`);
        g.addColorStop(1, `rgba(${st.smoke}, 0)`);
      } else {
        g.addColorStop(0, `rgba(${st.inner}, 0.70)`);
        g.addColorStop(0.35, `rgba(${st.mid}, 1)`);
        g.addColorStop(0.75, `rgba(${st.outer}, 0.45)`);
        g.addColorStop(1, `rgba(${st.outer}, 0)`);
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(h, h, h - 1, 0, Math.PI * 2);
      c.fill();
    });
  }

  function getToxicDropletSprite(isBack) {
    return getVizRadialSprite(isBack ? 'toxic_drop_b' : 'toxic_drop_f', 32, (c, sz) => {
      const h = sz * 0.5;
      const r = h - 1.5;
      const g = c.createRadialGradient(h - r * 0.28, h - r * 0.28, 0.5, h, h, r * 1.12);
      if (isBack) {
        g.addColorStop(0, '#86efac');
        g.addColorStop(0.45, '#15803d');
        g.addColorStop(1, '#022c22');
      } else {
        g.addColorStop(0, '#ecfccb');
        g.addColorStop(0.45, '#4ade80');
        g.addColorStop(1, '#064e3b');
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(h, h, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(255, 255, 255, ${isBack ? 0.38 : 0.85})`;
      c.beginPath();
      c.arc(h - r * 0.30, h - r * 0.26, r * 0.25, 0, Math.PI * 2);
      c.fill();
    });
  }

  function getOblivionDropletSprite(isBack) {
    return getVizRadialSprite(isBack ? 'obliv_drop_b' : 'obliv_drop_f', 48, (c, sz) => {
      const h = sz * 0.5;
      const r = 13.0;
      const haloR = r * 1.65;
      const hg = c.createRadialGradient(h, h, r * 0.42, h, h, haloR);
      hg.addColorStop(0, 'rgba(192, 132, 252, 0.34)');
      hg.addColorStop(0.55, 'rgba(147, 51, 234, 0.14)');
      hg.addColorStop(1, 'rgba(88, 28, 135, 0)');
      c.fillStyle = hg;
      c.beginPath();
      c.arc(h, h, haloR, 0, Math.PI * 2);
      c.fill();

      const dg = c.createRadialGradient(h - r * 0.16, h - r * 0.16, r * 0.08, h, h, r * 1.06);
      dg.addColorStop(0.0, '#130526');
      dg.addColorStop(0.52, '#270b4d');
      dg.addColorStop(0.84, '#6b21a8');
      dg.addColorStop(1.0, '#d8b4fe');
      c.fillStyle = dg;
      c.beginPath();
      c.arc(h, h, r, 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = isBack ? 'rgba(192, 132, 252, 0.72)' : 'rgba(233, 213, 255, 0.94)';
      c.lineWidth = r * 0.24;
      c.stroke();

      c.fillStyle = 'rgba(245, 232, 255, 0.78)';
      c.beginPath();
      c.arc(h - r * 0.30, h - r * 0.28, r * 0.24, 0, Math.PI * 2);
      c.fill();
    });
  }

  function buildStaticStoneWallLayer(W, H) {
    const off = createOffscreenCanvas(W, H);
    if (!off) return null;
    const ctx = off.getContext('2d');

    // Stone masonry diffuse tone (subdued dark slate, lit accurately by the dynamic darkness pass)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, H * 0.78);
    wallGrad.addColorStop(0, '#0c0e14');
    wallGrad.addColorStop(0.55, '#151822');
    wallGrad.addColorStop(1, '#1d222f');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, W, H);

    const brickH = 13;
    const brickW = 28;
    const rows = Math.ceil((H * 0.74) / brickH);
    for (let r = 0; r < rows; r++) {
      const y = r * brickH;
      const offset = (r % 2) * (brickW * 0.5);
      const cols = Math.ceil((W + brickW) / brickW);
      for (let c = -1; c < cols; c++) {
        const x = c * brickW + offset;
        const seed = r * 71 + c * 19 + 5;
        const v1 = hash01(seed);
        const v2 = hash01(seed + 97);
        const depthFade = clamp(1 - (y / (H * 0.75)) * 0.20, 0.62, 1);

        const baseL = Math.round((20 + v1 * 12) * depthFade);
        const baseB = Math.round(baseL + 5 + v2 * 4);
        ctx.fillStyle = `rgb(${baseL}, ${baseL + 2}, ${baseB})`;
        ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);

        // Chiseled upper edge & mortar bevel
        ctx.fillStyle = `rgba(185, 200, 224, ${(0.045 + v2 * 0.035).toFixed(4)})`;
        ctx.fillRect(x + 1.5, y + 1, brickW - 3, 1);
        ctx.fillStyle = 'rgba(2, 3, 5, 0.65)';
        ctx.fillRect(x + 1, y + brickH - 2, brickW - 2, 1.2);

        if (v1 > 0.64) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(x + 4 + v2 * 14, y + 4 + v1 * 4, 4 + v2 * 5, 1);
        }
      }
      ctx.fillStyle = 'rgba(3, 4, 7, 0.90)';
      ctx.fillRect(0, y, W, 1.3);
    }

    return off;
  }

  function getStaticWall(W, H) {
    const key = `${W}x${H}`;
    if (!backdropCache.has(key)) {
      backdropCache.set(key, buildStaticStoneWallLayer(W, H));
    }
    return backdropCache.get(key);
  }

  // Blue tapestry with white margins & golden Aetherius halo sun in center.
  // Kept gently weathered so the chamber lighting pass sets true contrast.
  function getStaticTapestryCanvas(W, H) {
    const key = `${W}x${H}`;
    if (tapestryCache.has(key)) return tapestryCache.get(key);
    const off = createOffscreenCanvas(W, H);
    if (!off) return null;
    const ctx = off.getContext('2d');
    const cx = W * 0.5;
    const tapL = cx - 68;
    const tapR = cx + 68;
    const tapW = tapR - tapL;
    const topY = 8;
    const hemY = 171;
    const marginW = 13;

    // Cast shadow onto brick wall behind banner
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.beginPath();
    ctx.moveTo(tapL + 2, topY + 2);
    ctx.lineTo(tapR + 3, topY + 2);
    ctx.lineTo(tapR + 4, hemY - 2);
    ctx.lineTo(cx, hemY + 5);
    ctx.lineTo(tapL + 1, hemY - 2);
    ctx.closePath();
    ctx.fill();

    // Dark wrought-iron mounting rod + finials
    ctx.strokeStyle = '#242933';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(tapL - 8, topY - 1);
    ctx.lineTo(tapR + 8, topY - 1);
    ctx.stroke();
    [tapL - 9, tapR + 9].forEach((fx) => {
      ctx.fillStyle = '#333a47';
      ctx.beginPath();
      ctx.arc(fx, topY - 1, 2.3, 0, Math.PI * 2);
      ctx.fill();
    });

    function traceBannerOuter() {
      ctx.beginPath();
      ctx.moveTo(tapL, topY);
      ctx.lineTo(tapR, topY);
      ctx.lineTo(tapR, hemY - 3);
      ctx.quadraticCurveTo(cx + 34, hemY + 2, cx, hemY + 3);
      ctx.quadraticCurveTo(cx - 34, hemY + 2, tapL, hemY - 3);
      ctx.closePath();
    }

    const whiteBorderGrad = ctx.createLinearGradient(0, topY, 0, hemY);
    whiteBorderGrad.addColorStop(0, '#727c8c');
    whiteBorderGrad.addColorStop(0.28, '#aab4c2');
    whiteBorderGrad.addColorStop(0.75, '#8f99a8');
    whiteBorderGrad.addColorStop(1, '#586170');
    traceBannerOuter();
    ctx.fillStyle = whiteBorderGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(235, 240, 248, 0.16)';
    ctx.lineWidth = 1;
    for (let x = tapL + 3; x <= tapR - 3; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, topY + 2);
      ctx.lineTo(x + (x < cx ? 1 : -1), hemY - 5);
      ctx.stroke();
    }

    const inL = tapL + marginW;
    const inR = tapR - marginW;
    const inTop = topY + 8;
    const inBot = hemY - 11;

    function traceBlueField() {
      ctx.beginPath();
      ctx.moveTo(inL, inTop);
      ctx.lineTo(inR, inTop);
      ctx.lineTo(inR, inBot - 2);
      ctx.quadraticCurveTo(cx + 26, inBot + 3, cx, inBot + 4);
      ctx.quadraticCurveTo(cx - 26, inBot + 3, inL, inBot - 2);
      ctx.closePath();
    }

    const blueGrad = ctx.createLinearGradient(0, inTop, 0, inBot);
    blueGrad.addColorStop(0, '#102145');
    blueGrad.addColorStop(0.35, '#1b3b75');
    blueGrad.addColorStop(0.72, '#162f5e');
    blueGrad.addColorStop(1, '#0c1a36');
    traceBlueField();
    ctx.fillStyle = blueGrad;
    ctx.fill();

    traceBlueField();
    ctx.strokeStyle = 'rgba(208, 168, 86, 0.45)';
    ctx.lineWidth = 0.95;
    ctx.stroke();

    ctx.save();
    traceBannerOuter();
    ctx.clip();
    const foldPositions = [tapL + tapW * 0.20, tapL + tapW * 0.42, tapL + tapW * 0.60, tapL + tapW * 0.80];
    for (let i = 0; i < foldPositions.length; i++) {
      const fx = foldPositions[i];
      const fg = ctx.createLinearGradient(fx - 7, 0, fx + 7, 0);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(0.45, 'rgba(0,0,0,0.28)');
      fg.addColorStop(0.7, 'rgba(180, 200, 235, 0.05)');
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(fx - 7, topY, 14, hemY - topY + 6);
    }

    // Bake static sun emblem at full alpha=1.0 into separate sprite? Even faster: bake edge shade here and draw sun live with globalAlpha!
    const edgeShade = ctx.createLinearGradient(tapL, 0, tapR, 0);
    edgeShade.addColorStop(0, 'rgba(2, 3, 6, 0.42)');
    edgeShade.addColorStop(0.18, 'rgba(2, 3, 6, 0.05)');
    edgeShade.addColorStop(0.82, 'rgba(2, 3, 6, 0.05)');
    edgeShade.addColorStop(1, 'rgba(2, 3, 6, 0.42)');
    ctx.fillStyle = edgeShade;
    ctx.fillRect(tapL - 2, topY - 2, tapW + 4, hemY - topY + 10);
    ctx.restore();

    tapestryCache.set(key, off);
    return off;
  }

  let _aetherSunSprite = null;
  function getAetherSunSprite() {
    if (_aetherSunSprite) return _aetherSunSprite;
    const off = createOffscreenCanvas(68, 68);
    if (!off) return null;
    const ctx = off.getContext('2d');
    ctx.translate(34, 34);
    ctx.strokeStyle = 'rgba(224, 184, 96, 1)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.arc(0, 0, 24.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 168, 82, 0.68)';
    ctx.lineWidth = 0.7;
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([2.2, 2.2]);
    ctx.beginPath();
    ctx.arc(0, 0, 27.5, 0, Math.PI * 2);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(242, 206, 126, 0.9)';
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI / 2);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 26, Math.sin(a) * 26, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 16; i++) {
      const ang = (i * Math.PI * 2) / 16 - Math.PI / 2;
      const isMajor = i % 2 === 0;
      const rIn = 8.4;
      const rOut = isMajor ? 21.5 : 14.2;
      const spread = isMajor ? 0.14 : 0.10;
      ctx.fillStyle = isMajor ? 'rgba(232, 190, 102, 0.92)' : 'rgba(198, 154, 72, 0.74)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang - spread) * rIn, Math.sin(ang - spread) * rIn);
      ctx.lineTo(Math.cos(ang) * rOut, Math.sin(ang) * rOut);
      ctx.lineTo(Math.cos(ang + spread) * rIn, Math.sin(ang + spread) * rIn);
      ctx.closePath();
      ctx.fill();
    }

    const discGrad = ctx.createRadialGradient(-1.5, -1.5, 1, 0, 0, 8.2);
    discGrad.addColorStop(0, 'rgba(250, 224, 152, 1)');
    discGrad.addColorStop(0.65, 'rgba(210, 165, 76, 1)');
    discGrad.addColorStop(1, 'rgba(135, 96, 36, 0.85)');
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 8.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(92, 58, 18, 0.72)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, 5.1, 0, Math.PI * 2);
    ctx.stroke();

    _aetherSunSprite = off;
    return off;
  }

  function drawAetheriusTapestry(ctx, W, H, tSec) {
    const baseCv = getStaticTapestryCanvas(W, H);
    const sunCv = getAetherSunSprite();
    if (baseCv && sunCv) {
      ctx.drawImage(baseCv, 0, 0);
      const breath = Math.sin(tSec * 1.1) * 0.025;
      ctx.save();
      ctx.globalAlpha = 0.56 + breath;
      ctx.drawImage(sunCv, W * 0.5 - 34, 60 - 34);
      ctx.restore();
      return;
    }
  }

  // Carved stone pedestal draped with crimson velvet cloth & gold patterns (cached offscreen per WxH)
  function drawStonePedestalAndCloth(ctx, W, H) {
    const key = `${W}x${H}`;
    let off = pedestalCache.get(key);
    if (!off) {
      off = createOffscreenCanvas(W, H);
      if (off) {
        drawStonePedestalAndClothRaw(off.getContext('2d'), W, H);
        pedestalCache.set(key, off);
      }
    }
    if (off) {
      ctx.drawImage(off, 0, 0);
      return;
    }
    drawStonePedestalAndClothRaw(ctx, W, H);
  }

  function drawStonePedestalAndClothRaw(ctx, W, H) {
    const cx = W * 0.5;
    const backY = 168;
    const frontY = 248;
    const pedBackL = 40;
    const pedBackR = W - 40;
    const pedFrontL = 12;
    const pedFrontR = W - 12;

    ctx.save();

    const wallSeam = ctx.createLinearGradient(0, backY - 10, 0, backY + 4);
    wallSeam.addColorStop(0, 'rgba(0, 0, 0, 0)');
    wallSeam.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = wallSeam;
    ctx.fillRect(0, backY - 10, W, 14);

    // Pedestal stone tabletop
    const slabGrad = ctx.createLinearGradient(0, backY, 0, frontY);
    slabGrad.addColorStop(0, '#1e222c');
    slabGrad.addColorStop(0.55, '#2b313e');
    slabGrad.addColorStop(1, '#343a49');
    ctx.fillStyle = slabGrad;
    ctx.beginPath();
    ctx.moveTo(pedBackL, backY);
    ctx.lineTo(pedBackR, backY);
    ctx.lineTo(pedFrontR, frontY);
    ctx.lineTo(pedFrontL, frontY);
    ctx.closePath();
    ctx.fill();

    // Stone slab bevel joints & chiseled mineral marks
    ctx.strokeStyle = 'rgba(6, 7, 10, 0.58)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(74, backY);
    ctx.lineTo(52, frontY);
    ctx.moveTo(W - 74, backY);
    ctx.lineTo(W - 52, frontY);
    ctx.moveTo(31, 194);
    ctx.lineTo(W - 31, 194);
    ctx.moveTo(21, 222);
    ctx.lineTo(W - 21, 222);
    ctx.stroke();

    ctx.fillStyle = 'rgba(185, 198, 220, 0.06)';
    for (let i = 0; i < 26; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sx = side < 0 ? 20 + hash01(i * 17) * 50 : W - 72 + hash01(i * 23) * 50;
      const sy = backY + 5 + hash01(i * 31) * 70;
      ctx.fillRect(sx, sy, 2 + hash01(i * 11) * 4, 1);
    }

    // Carved stone cornice & plinth
    ctx.fillStyle = '#3c4352';
    ctx.fillRect(pedFrontL, frontY, pedFrontR - pedFrontL, 3);
    ctx.fillStyle = '#212530';
    ctx.fillRect(pedFrontL + 3, frontY + 3, pedFrontR - pedFrontL - 6, 7);
    ctx.fillStyle = '#0e1015';
    ctx.fillRect(pedFrontL + 10, frontY + 10, pedFrontR - pedFrontL - 20, 4);
    ctx.fillStyle = '#181b24';
    ctx.fillRect(pedFrontL + 14, frontY + 14, pedFrontR - pedFrontL - 28, H - (frontY + 14));

    [28, 50, W - 56, W - 34].forEach((px) => {
      ctx.fillStyle = '#232833';
      ctx.fillRect(px, frontY + 14, 6, H - (frontY + 14));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(px + 5, frontY + 14, 1.5, H - (frontY + 14));
    });

    // Crimson Velvet Altar Cloth with Gold Embroidery
    const cBackL = cx - 94;
    const cBackR = cx + 94;
    const cFrontL = cx - 110;
    const cFrontR = cx + 110;
    const drapeBotY = 274;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.beginPath();
    ctx.moveTo(cBackL - 2, backY + 1);
    ctx.lineTo(cBackR + 2, backY + 1);
    ctx.lineTo(cFrontR + 3, frontY + 1);
    ctx.lineTo(cFrontR + 3, drapeBotY + 3);
    ctx.lineTo(cFrontL - 3, drapeBotY + 3);
    ctx.lineTo(cFrontL - 3, frontY + 1);
    ctx.closePath();
    ctx.fill();

    const clothTopGrad = ctx.createLinearGradient(0, backY, 0, frontY);
    clothTopGrad.addColorStop(0, '#4a0d10');
    clothTopGrad.addColorStop(0.5, '#78161a');
    clothTopGrad.addColorStop(1, '#8d1b20');
    ctx.fillStyle = clothTopGrad;
    ctx.beginPath();
    ctx.moveTo(cBackL, backY);
    ctx.lineTo(cBackR, backY);
    ctx.lineTo(cFrontR, frontY);
    ctx.lineTo(cFrontL, frontY);
    ctx.closePath();
    ctx.fill();

    const apronGrad = ctx.createLinearGradient(0, frontY, 0, drapeBotY);
    apronGrad.addColorStop(0, '#6a1216');
    apronGrad.addColorStop(0.55, '#4b0c10');
    apronGrad.addColorStop(1, '#310609');
    ctx.fillStyle = apronGrad;
    ctx.beginPath();
    ctx.moveTo(cFrontL, frontY);
    ctx.lineTo(cFrontR, frontY);
    ctx.lineTo(cFrontR + 1, drapeBotY - 1);
    const pleats = 8;
    for (let i = pleats; i >= 0; i--) {
      const px = lerp(cFrontL - 1, cFrontR + 1, i / pleats);
      const midPx = lerp(cFrontL - 1, cFrontR + 1, (i - 0.5) / pleats);
      if (i < pleats) {
        ctx.quadraticCurveTo(midPx, drapeBotY + 3.2, px, drapeBotY - 0.5);
      }
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 2, 4, 0.35)';
    for (let i = 1; i < pleats; i++) {
      const fx = lerp(cFrontL, cFrontR, i / pleats);
      ctx.beginPath();
      ctx.moveTo(fx - 3, frontY);
      ctx.lineTo(fx + 3, frontY);
      ctx.lineTo(fx + 1.5, drapeBotY + 1);
      ctx.lineTo(fx - 1.5, drapeBotY + 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = '#cda34b';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(cBackL + 3.5, backY + 1);
    ctx.lineTo(cFrontL + 4, frontY - 2.5);
    ctx.lineTo(cFrontR - 4, frontY - 2.5);
    ctx.lineTo(cBackR - 3.5, backY + 1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(248, 224, 152, 0.45)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(cBackL + 6.5, backY + 1.5);
    ctx.lineTo(cFrontL + 7.5, frontY - 5);
    ctx.lineTo(cFrontR - 7.5, frontY - 5);
    ctx.lineTo(cBackR - 6.5, backY + 1.5);
    ctx.stroke();

    // Gold damask scroll motifs upper corners clear of front candles
    [-1, 1].forEach((side) => {
      const mx = cx + side * 84;
      const my = 196;
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(side, 1);
      ctx.strokeStyle = 'rgba(222, 182, 88, 0.65)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.quadraticCurveTo(4, -9, 1, -2);
      ctx.quadraticCurveTo(-4, 5, 3, 12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(236, 198, 106, 0.60)';
      ctx.beginPath();
      ctx.moveTo(0, -4.2);
      ctx.lineTo(3.0, 0);
      ctx.lineTo(0, 4.2);
      ctx.lineTo(-3.0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-4, -12, 1.15, 0, Math.PI * 2);
      ctx.arc(3, 12, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.strokeStyle = '#a72a2e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cFrontL + 1, frontY);
    ctx.lineTo(cFrontR - 1, frontY);
    ctx.stroke();

    ctx.strokeStyle = '#d3a94c';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    for (let i = 0; i < pleats; i++) {
      const x1 = lerp(cFrontL, cFrontR, i / pleats);
      const xm = lerp(cFrontL, cFrontR, (i + 0.5) / pleats);
      const x2 = lerp(cFrontL, cFrontR, (i + 1) / pleats);
      if (i === 0) ctx.moveTo(x1, drapeBotY - 2.5);
      ctx.quadraticCurveTo(xm, drapeBotY + 1.2, x2, drapeBotY - 2.5);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(226, 186, 94, 0.72)';
    ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
      const fx = cx + i * 26;
      const fy = frontY + 12.5;
      const isCenter = i === 0;
      const rx = isCenter ? 9.5 : 6.0;
      const ry = isCenter ? 6.5 : 4.2;
      ctx.beginPath();
      ctx.moveTo(fx, fy - ry);
      ctx.lineTo(fx + rx, fy);
      ctx.lineTo(fx, fy + ry);
      ctx.lineTo(fx - rx, fy);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = isCenter ? '#f3cf86' : 'rgba(226, 186, 94, 0.78)';
      ctx.beginPath();
      ctx.arc(fx, fy, isCenter ? 2.0 : 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx - rx - 3, fy, 1.0, 0, Math.PI * 2);
      ctx.arc(fx + rx + 3, fy, 1.0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(218, 178, 86, 0.65)';
    ctx.lineWidth = 0.65;
    for (let x = cFrontL + 4; x <= cFrontR - 4; x += 5) {
      const wave = Math.sin(((x - cFrontL) / (cFrontR - cFrontL)) * Math.PI * pleats) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, drapeBotY - 1 + Math.max(0, wave));
      ctx.lineTo(x, drapeBotY + 3 + Math.max(0, wave));
      ctx.stroke();
    }

    ctx.restore();
  }

  // Curved page-surface template renderer (6 occult images + 4 grimoire text templates)
  function renderPageTemplateOnSurface(ctx, surf, templateId, accentGold, accentCrimson) {
    const INK_DARK = 'rgba(42, 26, 12, 0.86)';
    const INK_MED = 'rgba(54, 35, 18, 0.72)';
    const INK_LIGHT = 'rgba(72, 48, 24, 0.42)';

    function sLine(u1, v1, u2, v2, steps = 4) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = surf(lerp(u1, u2, t), lerp(v1, v2, t));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    function sQuad(u1, u2, v1, v2, fillCol, strokeCol) {
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const p = surf(lerp(u1, u2, i / 3), v1);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      for (let i = 3; i >= 0; i--) {
        const p = surf(lerp(u1, u2, i / 3), v2);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      if (fillCol) { ctx.fillStyle = fillCol; ctx.fill(); }
      if (strokeCol) { ctx.strokeStyle = strokeCol; ctx.stroke(); }
    }

    function sEllipse(cu, cv, ru, rv, segs = 22, startA = 0, endA = Math.PI * 2, close = true) {
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const a = lerp(startA, endA, i / segs);
        const p = surf(cu + Math.cos(a) * ru, cv + Math.sin(a) * rv);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      if (close) ctx.closePath();
    }

    function sWordRow(uStart, uEnd, v, hV, seedSeed, isCrimson) {
      let cur = uStart;
      let idx = 0;
      ctx.fillStyle = isCrimson ? accentCrimson : INK_MED;
      while (cur < uEnd - 0.04) {
        const segW = Math.min(uEnd - cur, 0.08 + hash01(seedSeed * 19 + idx * 7) * 0.14);
        if (segW < 0.035) break;
        sQuad(cur, cur + segW, v, v + hV, ctx.fillStyle);
        cur += segW + 0.032;
        idx++;
      }
    }

    // Subdued corner page rule frame on all occult/grimoire pages
    ctx.strokeStyle = 'rgba(102, 72, 36, 0.28)';
    ctx.lineWidth = 0.42;
    sLine(0.10, 0.08, 0.90, 0.08, 6);
    sLine(0.10, 0.92, 0.90, 0.92, 6);

    switch (templateId) {
      // === 6 MYSTICAL OCCULT SYMBOL TEMPLATES ===
      case 'occult_1': {
        // Seal Pentagram: double ward ring, inverted/upright five-point star, corner runes & crimson caption
        sWordRow(0.24, 0.76, 0.12, 0.030, 11, true);
        const cu = 0.50, cv = 0.47, ru = 0.31, rv = 0.255;

        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.65;
        sEllipse(cu, cv, ru, rv, 24);
        ctx.stroke();

        ctx.strokeStyle = accentCrimson;
        ctx.lineWidth = 0.50;
        sEllipse(cu, cv, ru * 0.84, rv * 0.84, 22);
        ctx.stroke();

        // Five-pointed pentagram star
        const order = [0, 2, 4, 1, 3];
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        order.forEach((idx, step) => {
          const a = -Math.PI / 2 + (idx * Math.PI * 2) / 5;
          const p = surf(cu + Math.cos(a) * ru * 0.80, cv + Math.sin(a) * rv * 0.80);
          if (step === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();

        // Center scarlet-gold dot seal
        sEllipse(cu, cv, 0.055, 0.045, 12);
        ctx.fillStyle = accentCrimson;
        ctx.fill();
        ctx.strokeStyle = accentGold;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        // Corner sigil pips
        [[0.17, 0.19], [0.83, 0.19], [0.17, 0.74], [0.83, 0.74]].forEach(([pu, pv]) => {
          ctx.strokeStyle = INK_MED;
          ctx.lineWidth = 0.45;
          sEllipse(pu, pv, 0.032, 0.026, 8);
          ctx.stroke();
        });
        sWordRow(0.16, 0.82, 0.81, 0.025, 17, false);
        break;
      }

      case 'occult_2': {
        // Astral Solar & Lunar Wheel (Aetherius Orrery)
        const cu = 0.50, cv = 0.46;
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.6;
        sEllipse(cu, cv, 0.30, 0.25, 24);
        ctx.stroke();
        ctx.strokeStyle = INK_LIGHT;
        sLine(cu - 0.33, cv, cu + 0.33, cv, 6);
        sLine(cu, cv - 0.28, cu, cv + 0.28, 6);

        // 8 celestial sunburst rays
        ctx.strokeStyle = accentGold;
        ctx.lineWidth = 0.65;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const len = i % 2 === 0 ? 0.23 : 0.15;
          sLine(cu + Math.cos(a) * 0.07, cv + Math.sin(a) * 0.06, cu + Math.cos(a) * len, cv + Math.sin(a) * len * 0.84, 2);
        }

        // Solar gold core & waxing lunar crescent on rim
        sEllipse(cu, cv, 0.075, 0.062, 14);
        ctx.fillStyle = accentGold;
        ctx.fill();
        ctx.strokeStyle = accentCrimson;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.6;
        sEllipse(0.75, 0.27, 0.06, 0.05, 10, 0.3, Math.PI * 1.4, false);
        ctx.stroke();

        sWordRow(0.16, 0.84, 0.78, 0.024, 23, false);
        sWordRow(0.24, 0.72, 0.84, 0.022, 29, true);
        break;
      }

      case 'occult_3': {
        // Hermetic Pyramid & All-Seeing Eye + Triple Moon Crest
        sWordRow(0.20, 0.80, 0.11, 0.028, 31, true);
        const cu = 0.50;
        // Upper moon crescent & horn arcs above apex
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.55;
        sEllipse(cu, 0.22, 0.09, 0.04, 10, 0.15, Math.PI - 0.15, false);
        ctx.stroke();

        // Stepped pyramid triangle
        const top = surf(cu, 0.25);
        const bl = surf(0.19, 0.67);
        const br = surf(0.81, 0.67);
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.72;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
        ctx.stroke();

        // Inner eye almond
        const eL = surf(0.36, 0.49);
        const eR = surf(0.64, 0.49);
        const eT = surf(cu, 0.42);
        const eB = surf(cu, 0.56);
        ctx.strokeStyle = accentCrimson;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(eL.x, eL.y);
        ctx.quadraticCurveTo(eT.x, eT.y, eR.x, eR.y);
        ctx.quadraticCurveTo(eB.x, eB.y, eL.x, eL.y);
        ctx.stroke();

        sEllipse(cu, 0.49, 0.048, 0.038, 12);
        ctx.fillStyle = INK_DARK;
        ctx.fill();
        sEllipse(cu, 0.49, 0.018, 0.014, 8);
        ctx.fillStyle = accentGold;
        ctx.fill();

        // Base ink inscriptions
        sWordRow(0.16, 0.84, 0.73, 0.024, 37, false);
        sWordRow(0.22, 0.76, 0.80, 0.024, 41, false);
        break;
      }

      case 'occult_4': {
        // Cabalistic 7-Node Sefirot Tree / Arcane Conduit Lattice
        sWordRow(0.18, 0.65, 0.12, 0.028, 43, true);
        const nodes = [
          [0.50, 0.23, false],
          [0.25, 0.36, false], [0.75, 0.36, false],
          [0.50, 0.48, true],
          [0.25, 0.61, false], [0.75, 0.61, false],
          [0.50, 0.74, false],
        ];
        const edges = [
          [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
          [1, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 5], [4, 6], [5, 6],
        ];
        ctx.strokeStyle = INK_LIGHT;
        ctx.lineWidth = 0.5;
        edges.forEach(([a, b]) => sLine(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], 2));

        nodes.forEach(([nu, nv, isCenter]) => {
          sEllipse(nu, nv, isCenter ? 0.068 : 0.048, isCenter ? 0.056 : 0.040, 12);
          ctx.fillStyle = isCenter ? accentCrimson : '#ead7b3';
          ctx.fill();
          ctx.strokeStyle = isCenter ? accentGold : INK_DARK;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        });
        sWordRow(0.16, 0.84, 0.84, 0.024, 47, false);
        break;
      }

      case 'occult_5': {
        // Ouroboros Ring, Seal of Solomon Hexagram & Ceremonial Key / Blade
        const cu = 0.50, cv = 0.47;
        // Segmented outer Ouroboros circle
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 1.1;
        sEllipse(cu, cv, 0.31, 0.26, 24);
        ctx.stroke();
        ctx.strokeStyle = accentGold;
        ctx.lineWidth = 0.45;
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([1.5, 1.5]);
        sEllipse(cu, cv, 0.31, 0.26, 24);
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

        // Upward + Downward equilateral triangles (Hexagram)
        ctx.strokeStyle = INK_MED;
        ctx.lineWidth = 0.55;
        for (let dir = -1; dir <= 1; dir += 2) {
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const a = (dir > 0 ? -Math.PI / 2 : Math.PI / 2) + (k * Math.PI * 2) / 3;
            const p = surf(cu + Math.cos(a) * 0.22, cv + Math.sin(a) * 0.19);
            if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.stroke();
        }

        // Central vertical ceremonial key / athame blade in crimson & dark iron
        ctx.strokeStyle = accentCrimson;
        ctx.lineWidth = 0.85;
        sLine(cu, 0.24, cu, 0.69, 4);
        sLine(cu - 0.07, 0.37, cu + 0.07, 0.37, 2);
        sEllipse(cu, 0.25, 0.04, 0.032, 10);
        ctx.stroke();

        sWordRow(0.18, 0.82, 0.81, 0.025, 53, false);
        break;
      }

      case 'occult_6': {
        // Hermetic Astral Silhouette inside Sacred Circle & Square
        const cu = 0.50, cv = 0.47;
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.55;
        sEllipse(cu, cv, 0.30, 0.25, 24);
        ctx.stroke();
        ctx.strokeStyle = INK_LIGHT;
        sLine(0.25, 0.26, 0.75, 0.26, 4);
        sLine(0.75, 0.26, 0.75, 0.68, 4);
        sLine(0.75, 0.68, 0.25, 0.68, 4);
        sLine(0.25, 0.68, 0.25, 0.26, 4);

        // Geometric astral figure arms/legs/spine inscribed within circle
        ctx.strokeStyle = INK_DARK;
        ctx.lineWidth = 0.62;
        sLine(cu, 0.31, cu, 0.54, 3); // spine
        sLine(0.26, 0.36, 0.74, 0.36, 4); // outstretched arms
        sLine(cu, 0.54, 0.34, 0.68, 2); // left leg
        sLine(cu, 0.54, 0.66, 0.68, 2); // right leg
        sEllipse(cu, 0.28, 0.042, 0.035, 10);
        ctx.stroke();

        // Glowing center chakra nodes along axis
        [0.36, 0.45, 0.54].forEach((nv, idx) => {
          sEllipse(cu, nv, 0.026, 0.022, 8);
          ctx.fillStyle = idx === 1 ? accentCrimson : accentGold;
          ctx.fill();
        });
        sWordRow(0.18, 0.82, 0.80, 0.025, 59, true);
        break;
      }

      // === 4 GRIMOIRE TEXT TEMPLATES (Zero Accounting Tables!) ===
      case 'text_1': {
        // Illuminated Drop-Cap Box & Organic Stanza Paragraphs
        sQuad(0.13, 0.29, 0.11, 0.26, '#6e1d16', accentGold);
        sQuad(0.17, 0.25, 0.145, 0.225, accentGold);
        sWordRow(0.33, 0.84, 0.13, 0.032, 61, true);
        sWordRow(0.33, 0.76, 0.20, 0.024, 67, false);

        for (let r = 0; r < 5; r++) {
          const vv = 0.29 + r * 0.062;
          const endU = r === 4 ? 0.62 : 0.85;
          sWordRow(0.13, endU, vv, 0.024, 71 + r * 3, false);
        }
        // Stanza 2 with slight crimson rubric accent & marginal flourish
        sWordRow(0.19, 0.84, 0.63, 0.025, 91, true);
        for (let r = 0; r < 3; r++) {
          const vv = 0.695 + r * 0.062;
          sWordRow(0.13, r === 2 ? 0.58 : 0.85, vv, 0.024, 101 + r, false);
        }
        break;
      }

      case 'text_2': {
        // Two-Column Codex Treatise with Chapter Title & Pilcrows
        sWordRow(0.22, 0.78, 0.11, 0.034, 113, true);
        ctx.strokeStyle = INK_LIGHT;
        ctx.lineWidth = 0.45;
        sLine(0.13, 0.175, 0.87, 0.175, 6);
        sLine(0.50, 0.20, 0.50, 0.88, 6);

        for (let r = 0; r < 9; r++) {
          const vv = 0.215 + r * 0.072;
          const isSubL = r === 4;
          const isSubR = r === 6;
          sWordRow(0.13, r === 3 ? 0.39 : 0.46, vv, 0.022, 127 + r, isSubL);
          sWordRow(0.54, r === 8 ? 0.78 : 0.87, vv, 0.022, 149 + r, isSubR);
        }
        break;
      }

      case 'text_3': {
        // Poetic Ritual Incantation Stanzas + Wide Marginal Gloss Annotations
        ctx.strokeStyle = 'rgba(110, 29, 22, 0.42)';
        ctx.lineWidth = 0.4;
        sLine(0.32, 0.12, 0.32, 0.88, 6);

        // Marginalia gloss notes & brace marks on left margin
        [0.24, 0.49, 0.74].forEach((gv, gIdx) => {
          sWordRow(0.12, 0.28, gv, 0.018, 163 + gIdx, true);
          sWordRow(0.14, 0.27, gv + 0.034, 0.016, 173 + gIdx, false);
        });

        // Centered invocation chant stanzas on main column (0.37..0.86)
        [0.14, 0.40, 0.65].forEach((sv, stIdx) => {
          for (let l = 0; l < 3; l++) {
            const pad = (l % 2) * 0.06;
            sWordRow(0.37 + pad, 0.86 - pad * 0.7, sv + l * 0.056, 0.024, 181 + stIdx * 7 + l, l === 0 && stIdx === 0);
          }
          if (stIdx < 2) {
            sEllipse(0.61, sv + 0.20, 0.018, 0.015, 6);
            ctx.fillStyle = accentGold;
            ctx.fill();
          }
        });
        break;
      }

      case 'text_4': {
        // Runic Compendium / Glossary of Arcane Glyphs (miniature square sigil thumbnails + lines)
        sWordRow(0.14, 0.68, 0.11, 0.030, 199, true);
        for (let e = 0; e < 4; e++) {
          const topV = 0.19 + e * 0.18;
          // Miniature illuminated rune thumbnail box on left margin
          sQuad(0.13, 0.27, topV, topV + 0.11, '#ebd7b1', INK_DARK);
          ctx.strokeStyle = e % 2 === 0 ? accentCrimson : INK_DARK;
          ctx.lineWidth = 0.55;
          if (e === 0) {
            sEllipse(0.20, topV + 0.055, 0.042, 0.034, 10);
            ctx.stroke();
          } else if (e === 1) {
            sLine(0.16, topV + 0.09, 0.20, topV + 0.02, 2);
            sLine(0.20, topV + 0.02, 0.24, topV + 0.09, 2);
            sLine(0.16, topV + 0.09, 0.24, topV + 0.09, 2);
          } else if (e === 2) {
            sLine(0.20, topV + 0.018, 0.245, topV + 0.055, 2);
            sLine(0.245, topV + 0.055, 0.20, topV + 0.092, 2);
            sLine(0.20, topV + 0.092, 0.155, topV + 0.055, 2);
            sLine(0.155, topV + 0.055, 0.20, topV + 0.018, 2);
          } else {
            sLine(0.16, topV + 0.055, 0.24, topV + 0.055, 2);
            sLine(0.20, topV + 0.02, 0.20, topV + 0.09, 2);
          }
          // Paired description ink rows on right
          sWordRow(0.32, 0.72, topV + 0.008, 0.024, 211 + e, e === 0);
          sWordRow(0.32, 0.86, topV + 0.048, 0.022, 223 + e, false);
          sWordRow(0.32, 0.79, topV + 0.088, 0.020, 233 + e, false);
          if (e < 3) {
            ctx.strokeStyle = INK_LIGHT;
            ctx.lineWidth = 0.35;
            sLine(0.13, topV + 0.145, 0.87, topV + 0.145, 6);
          }
        }
        break;
      }
    }
  }

  // Dark Daedric "Oht" glyph fitted from measured reference bitmap contour & projected via 1-point perspective.
  function drawDaedricOhtOnCover(ctx, coverSurf, alpha = 1) {
    if (alpha <= 0.04) return;
    const SCALE_FAR_RATIO = 40.0 / 54.8;
    function perspZ(vPlane) {
      const vc = clamp(vPlane, 0, 1);
      const sc = 1 / lerp(1 / SCALE_FAR_RATIO, 1.0, vc);
      return (sc - SCALE_FAR_RATIO) / (1.0 - SCALE_FAR_RATIO);
    }
    // Centered inside the blind-tooled frame (0.11..0.90) with balanced perspective margins & vertical Oht aspect
    function pt(ou, ov) {
      return coverSurf(0.255 + 0.50 * ou, perspZ(0.18 + 0.68 * ov));
    }

    // Subdivide smoothly across dense measured contour vertices [ou, ov] from reference image
    const rawOuterUV = [
      // Top crossbar cap with sharp flaring horns
      [0.000, 0.006], [0.200, 0.004], [0.500, 0.004], [0.800, 0.004], [1.000, 0.006],
      // Right under-serif concave curve into right blade outer rim
      [0.916, 0.031], [0.849, 0.056], [0.815, 0.086], [0.807, 0.105],
      [0.840, 0.148], [0.866, 0.198], [0.882, 0.250], [0.899, 0.321],
      [0.899, 0.420], [0.899, 0.506], [0.882, 0.625], [0.849, 0.719],
      [0.790, 0.813], [0.714, 0.875], [0.597, 0.938], [0.521, 0.969], [0.445, 1.000],
      // Inner right blade edge rising back up to portal arch
      [0.496, 0.969], [0.538, 0.938], [0.588, 0.906], [0.655, 0.844],
      [0.706, 0.781], [0.739, 0.719], [0.756, 0.625], [0.748, 0.506],
      [0.723, 0.375], [0.681, 0.250], [0.622, 0.156], [0.571, 0.099], [0.513, 0.068],
      // Asymmetric upper portal arch & left calligraphic notch
      [0.445, 0.066], [0.412, 0.068], [0.437, 0.080], [0.471, 0.105], [0.445, 0.123],
      // Inner left blade edge down to blunt inner apex above right tail
      [0.412, 0.148], [0.370, 0.198], [0.328, 0.281], [0.294, 0.375],
      [0.277, 0.457], [0.277, 0.563], [0.303, 0.625], [0.353, 0.719],
      [0.412, 0.781], [0.445, 0.818], [0.480, 0.856],
      // Outer left blade rim rising cleanly back to left wing tip
      [0.403, 0.844], [0.345, 0.813], [0.277, 0.750], [0.227, 0.688],
      [0.160, 0.563], [0.134, 0.457], [0.126, 0.375], [0.134, 0.281],
      [0.151, 0.198], [0.176, 0.125], [0.185, 0.093], [0.168, 0.062], [0.092, 0.031],
    ];
    const outerPts = rawOuterUV.map(([ou, ov]) => pt(ou, ov));

    // Central floating oval pip inside upper-center aperture
    const dotPts = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      dotPts.push(pt(0.521 + Math.cos(a) * 0.092, 0.382 + Math.sin(a) * 0.095));
    }

    function tracePoly(pts) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Subtle embossed catchlight edge underneath dark carved glyph so it separates cleanly from wine leather
    ctx.save();
    ctx.translate(0.30, 0.35);
    tracePoly(outerPts);
    ctx.strokeStyle = 'rgba(175, 112, 68, 0.38)';
    ctx.lineWidth = 0.45;
    ctx.stroke();
    tracePoly(dotPts);
    ctx.stroke();
    ctx.restore();

    // Deep charred obsidian-black Oht glyph body ("тёмный символ охт")
    tracePoly(outerPts);
    ctx.fillStyle = '#080304';
    ctx.fill();
    ctx.strokeStyle = 'rgba(35, 10, 12, 0.85)';
    ctx.lineWidth = 0.25;
    ctx.stroke();

    tracePoly(dotPts);
    ctx.fillStyle = '#080304';
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Faithfully ported Bank Letters of Credit Open Book (drawNotesOpenAccountingBook)
  // with smooth 3D hinged closing/opening animation toward dark Daedric Oht front cover.
  function drawPedestalLedgerBook(ctx, W, H, tSec, flipSnapshot, spellTint, spreadPair, templateState, openAmount = 1.0) {
    const cx = W * 0.5;
    const S = 1.28;
    const origMidX = 104;
    const origBotY = 143;
    const targetBotY = 237;
    const midX = 104;
    const creaseTopY = 98.2;
    const creaseBotY = 134.0;
    const coverBotY = 143.0;
    const openT = clamp(openAmount, 0, 1);

    const SCALE_FAR = 40.0 / 54.8;
    const MAX_R = 54.8;
    const ELEV_K = 0.72;
    const scaleZ = (z) => lerp(SCALE_FAR, 1.0, z);
    const groundY = (z) => lerp(101.5, coverBotY, z);

    // Rigid 1-point perspective kinematic rotation around fixed spine midX = 104
    const phi = openT * Math.PI;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const COVER_THICK = 2.3;          // leather board thickness (~1.66 screen u) matching bottom cover bevel
    const LEFT_STACK_THICK = 7.0;     // upper half-book page stack (~5.04 screen u) carried by lid
    const HINGE_LIFT_CLOSED = 18.2;   // closed spine-to-top-cover height (~13.1 screen u = ~17px closed thickness!)
    const hingeLift = HINGE_LIFT_CLOSED * 0.5 * (1 + cosP);
    const R_PAGE_OUT = 0.94;          // recessed page stack inside outer board rim (51.5 / 54.8)
    const RIGHT_CLOSED_TOP = HINGE_LIFT_CLOSED - COVER_THICK - LEFT_STACK_THICK; // = 8.9 -> meets left stack flush!
    const spinePinch = smoothstep(0.04, 0.48, openT);
    const leftBlockN = (u) => lerp(COVER_THICK + LEFT_STACK_THICK, lerp(COVER_THICK + LEFT_STACK_THICK, 0.50, spinePinch), u);

    function projLeftWingPoint(rFrac, zFrac, nInward) {
      const r = rFrac * MAX_R;
      const sc = scaleZ(zFrac);
      const x3d = r * cosP + nInward * sinP;
      const y3d = hingeLift + r * sinP - nInward * cosP;
      return {
        x: midX + x3d * sc,
        y: groundY(zFrac) - y3d * ELEV_K * sc,
      };
    }

    const lpFarL = 68.0;
    const lpTopY = 95.0;
    const lpNearL = 56.5;
    const lpBotY = 128.5;
    const lpDepth = lpBotY - lpTopY;

    const rpFarR = 140.0;
    const rpTopY = 94.5;
    const rpNearR = 151.5;
    const rpBotY = 127.5;
    const rpDepth = rpBotY - rpTopY;

    const lpFarR = midX - 0.5;
    const lpNearR = midX - 0.5;
    const rpFarL = midX + 0.5;
    const rpNearL = midX + 0.5;

    function leftSurf(u, v) {
      const topX = lpFarL + (lpFarR - lpFarL) * u;
      const botX = lpNearL + (lpNearR - lpNearL) * u;
      const topY = quadVal(lpTopY, 91.5, creaseTopY, u);
      const botY = quadVal(lpBotY, 128.8, creaseBotY, u);
      return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
    }

    function rightSurfOpen(u, v) {
      const topX = rpFarL + (rpFarR - rpFarL) * u;
      const botX = rpNearL + (rpNearR - rpNearL) * u;
      const topY = quadVal(creaseTopY, 90.8, rpTopY, u);
      const botY = quadVal(creaseBotY, 126.2, rpBotY, u);
      return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
    }

    // Closed flat position for Right lower half-book stack (matches bottom of upper half-book flush at openT = 0)
    function rightSurfClosed(u, v) {
      const topX = lerp(rpFarL, midX + MAX_R * R_PAGE_OUT * scaleZ(0), u);
      const botX = lerp(rpNearL, midX + MAX_R * R_PAGE_OUT, u);
      const farY = groundY(0) - RIGHT_CLOSED_TOP * ELEV_K * scaleZ(0);
      const nearY = groundY(1) - RIGHT_CLOSED_TOP * ELEV_K * scaleZ(1);
      return { x: lerp(topX, botX, v), y: lerp(farY, nearY, v) };
    }

    const archAmt = smoothstep(0.06, 0.72, openT);
    function rightSurf(u, v) {
      if (archAmt >= 0.9999) return rightSurfOpen(u, v);
      if (archAmt <= 0.0001) return rightSurfClosed(u, v);
      const c = rightSurfClosed(u, v);
      const o = rightSurfOpen(u, v);
      return { x: lerp(c.x, o.x, archAmt), y: lerp(c.y, o.y, archAmt) };
    }

    // Dynamic Left page surface rigidly carried by moving Left cover past phi=90deg, blooming smoothly to exact leftSurf
    const pageRestAmt = smoothstep(0.50, 0.96, openT);
    function dynLeftSurf(u, v) {
      if (openT >= 0.9999) return leftSurf(u, v);
      const target = leftSurf(u, v);
      const sc = scaleZ(v);
      const gY = groundY(v);
      const rExact = (midX - target.x) / (MAX_R * sc);
      const hExact = (gY - target.y) / (ELEV_K * sc);
      const rSlim = lerp(R_PAGE_OUT, 0.015, u);
      const nSlim = lerp(COVER_THICK + LEFT_STACK_THICK, 0.50, u);
      const rUse = lerp(rSlim, rExact, pageRestAmt);
      const nInwardUse = lerp(nSlim, hExact, pageRestAmt);
      return projLeftWingPoint(rUse, v, nInwardUse);
    }

    const coverRed = '#7c1919';
    const coverEdge = '#520d0d';
    const coverDark = '#2d0606';
    const accentGold = spellTint ? spellTint.secondary : '#b88a3b';
    const accentCrimson = '#7a2218';

    const isSteadyBook = openT <= 0.0001 || openT >= 0.9999;
    const bookCacheKey = isSteadyBook
      ? `${W}x${H}|${openT >= 0.9999 ? 1 : 0}|${spreadPair.leftId}|${spreadPair.rightId}|${accentGold}`
      : '';
    let bookHit = false;
    let mainCtx = ctx;
    if (isSteadyBook && _bookBaseCache.canvas && _bookBaseCache.key === bookCacheKey) {
      bookHit = true;
      ctx.drawImage(_bookBaseCache.canvas, 0, 0);
    } else if (isSteadyBook) {
      if (!_bookBaseCache.canvas || _bookBaseCache.canvas.width !== W || _bookBaseCache.canvas.height !== H) {
        _bookBaseCache.canvas = createOffscreenCanvas(W, H);
      }
      if (_bookBaseCache.canvas) {
        const bCtx = _bookBaseCache.canvas.getContext('2d');
        bCtx.setTransform(1, 0, 0, 1, 0, 0);
        bCtx.clearRect(0, 0, W, H);
        ctx = bCtx;
      }
    }

    ctx.save();
    ctx.translate(cx - origMidX * S, targetBotY - origBotY * S);
    ctx.scale(S, S);

    if (!bookHit) {
    // 1. Cast shadow under book on crimson cloth (Right stays anchored; Left shadow emerges smoothly as cover descends left)
    const wingOutFar = projLeftWingPoint(1, 0, 0);
    const wingOutNear = projLeftWingPoint(1, 1, 0);
    const leftShadowBlend = smoothstep(0.42, 0.98, openT);
    const shFarL = lerp(midX - 3.6, Math.min(wingOutFar.x - 2.0, 62.0), leftShadowBlend);
    const shNearL = lerp(midX - 4.0, Math.min(wingOutNear.x - 2.4, 46.8), leftShadowBlend);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.beginPath();
    ctx.moveTo(shFarL, 100.5);
    ctx.lineTo(146.0, 100.5);
    ctx.lineTo(161.2, coverBotY + 2.4);
    ctx.lineTo(shNearL, coverBotY + 2.4);
    ctx.closePath();
    ctx.fill();

    // 2. Stationary Right Back Cover Board (0.00 px translation across ALL openT in [0..1])
    ctx.fillStyle = coverRed;
    ctx.beginPath();
    ctx.moveTo(midX, 101.5);
    ctx.lineTo(144.0, 101.5);
    ctx.lineTo(158.8, coverBotY);
    ctx.lineTo(midX + 4.8, coverBotY + 0.3);
    ctx.lineTo(midX, coverBotY + 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = coverDark;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Right cover bottom rim bevel & gold brass bottom-right corner
    ctx.fillStyle = coverEdge;
    ctx.beginPath();
    ctx.moveTo(midX + 4.8, coverBotY - 1.2);
    ctx.lineTo(158.5, coverBotY - 1.4);
    ctx.lineTo(158.8, coverBotY);
    ctx.lineTo(midX + 4.8, coverBotY + 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#c99c42';
    ctx.beginPath();
    ctx.moveTo(158.6, coverBotY - 0.1);
    ctx.lineTo(153.8, coverBotY);
    ctx.lineTo(157.2, coverBotY - 4.2);
    ctx.closePath();
    ctx.fill();

    // 3. Left Resting Back Cover (grows behind resting left wing ONLY as cover descends toward left cloth >= 90deg)
    const lbFarOut = projLeftWingPoint(1, 0, 0);
    const lbNearOut = projLeftWingPoint(1, 1, 0);
    const lbFarIn = projLeftWingPoint(0, 0, 0);
    const lbNearIn = projLeftWingPoint(0, 1, 0);

    if (cosP <= 0.0001) {
      const spLeftFootX = midX - 4.8 * pageRestAmt;
      const spLeftFootY = lerp(lbNearIn.y, coverBotY + 0.3, pageRestAmt);
      ctx.fillStyle = coverRed;
      ctx.beginPath();
      ctx.moveTo(lbFarOut.x, lbFarOut.y);
      ctx.lineTo(lbFarIn.x, lbFarIn.y);
      ctx.lineTo(midX, spLeftFootY);
      ctx.lineTo(spLeftFootX, spLeftFootY);
      ctx.lineTo(lbNearOut.x, lbNearOut.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = coverDark;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Left cover rim thickness (under-bevel)
      const lbNearRim = projLeftWingPoint(1, 1, COVER_THICK);
      ctx.fillStyle = coverEdge;
      ctx.beginPath();
      ctx.moveTo(lbNearRim.x, lbNearRim.y);
      ctx.lineTo(spLeftFootX, spLeftFootY - 1.5);
      ctx.lineTo(spLeftFootX, spLeftFootY);
      ctx.lineTo(lbNearOut.x, lbNearOut.y);
      ctx.closePath();
      ctx.fill();

      // Gold brass bottom-left cover guard riding identically with outer corner
      const brC1 = projLeftWingPoint(1 - 4.8 / MAX_R, 1, 0);
      const brC2 = projLeftWingPoint(1 - 1.6 / MAX_R, 1 - 4.2 / (coverBotY - 101.5), 0);
      ctx.fillStyle = '#c99c42';
      ctx.beginPath();
      ctx.moveTo(lbNearOut.x + 0.2, lbNearOut.y - 0.1);
      ctx.lineTo(brC1.x, brC1.y);
      ctx.lineTo(brC2.x, brC2.y);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Right Parchment Block Fore-Edge, Bottom Fan Layers & Tabs (unified across 0..1!)
    const rsFarOut = rightSurf(1, 0);
    const rsNearOut = rightSurf(1, 1);
    const rsNearMid = rightSurf(0.5, 1);
    const rsNearIn = rightSurf(0, 1);

    const rSideEdgeX_far = lerp(midX + MAX_R * R_PAGE_OUT * scaleZ(0) + 1.0, 143.0, archAmt);
    const rSideEdgeX_near = lerp(midX + MAX_R * R_PAGE_OUT + 1.1, 156.0, archAmt);
    const rBotEdgeY = lerp(coverBotY - 1.4, 141.0, archAmt);

    ctx.fillStyle = '#c5ae84';
    ctx.beginPath();
    ctx.moveTo(rsFarOut.x - 0.5, rsFarOut.y + lerp(0.1, 1.0, archAmt));
    ctx.lineTo(rSideEdgeX_far, lerp(groundY(0) - 1.0, 101.2, archAmt));
    ctx.lineTo(rSideEdgeX_near, rBotEdgeY);
    ctx.lineTo(rsNearOut.x - 0.5, rsNearOut.y + lerp(0.1, 2.5, archAmt));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#755834';
    ctx.lineWidth = 0.4;
    for (let i = 1; i <= 2; i++) {
      const k = i * 1.1;
      ctx.beginPath();
      ctx.moveTo(rSideEdgeX_far - 0.5 - k * 0.6, lerp(rsFarOut.y + (groundY(0) - 1.0 - rsFarOut.y) * (i / 3), 100.5 - k * 0.8, archAmt));
      ctx.lineTo(rSideEdgeX_near - 0.8 - k * 1.0, lerp(rsNearOut.y + (rBotEdgeY - rsNearOut.y) * (i / 3), rBotEdgeY - 0.8 - k * 2.0, archAmt));
      ctx.stroke();
    }

    // Right Bottom Parchment Stack Slice
    const rbGrad = ctx.createLinearGradient(midX, 134, 156, 141);
    rbGrad.addColorStop(0, archAmt > 0.35 ? '#6e502f' : '#9c835c');
    rbGrad.addColorStop(0.25, '#bea376');
    rbGrad.addColorStop(0.7, '#dfca9f');
    rbGrad.addColorStop(1, '#c3aa7d');
    ctx.fillStyle = rbGrad;
    ctx.beginPath();
    ctx.moveTo(rsNearIn.x, rsNearIn.y);
    ctx.quadraticCurveTo(rsNearMid.x, rsNearMid.y, rsNearOut.x, rsNearOut.y);
    ctx.lineTo(rSideEdgeX_near, rBotEdgeY);
    ctx.lineTo(midX + 3.6, rBotEdgeY);
    ctx.closePath();
    ctx.fill();

    // Right dark page underside & 3 curved fanned waves scaled smoothly by archAmt
    if (archAmt > 0.08) {
      ctx.save();
      ctx.globalAlpha = smoothstep(0.08, 0.35, archAmt);
      ctx.fillStyle = '#331a0b';
      ctx.beginPath();
      ctx.moveTo(rsNearIn.x + 0.5, rsNearIn.y + 0.8);
      ctx.quadraticCurveTo(rsNearMid.x, lerp(rsNearMid.y + 0.3, 127.0, archAmt), rsNearOut.x + 1.5, rsNearOut.y + 1.5);
      ctx.lineTo(154.6, lerp(rBotEdgeY - 0.4, 138.8, archAmt));
      ctx.quadraticCurveTo(126.0, lerp(rBotEdgeY - 1.2, 135.5, archAmt), midX + 3.0, lerp(rBotEdgeY - 0.5, 139.2, archAmt));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const rightFannedWaves = [
      { sY: 138.2, ctrlX: 129.0, ctrlY: 134.8, eX: 154.2, eY: 136.6, thick: 1.5, col: '#cfb68b', fClosed: 0.72 },
      { sY: 136.7, ctrlX: 130.5, ctrlY: 132.4, eX: 154.5, eY: 133.7, thick: 1.4, col: '#dec89f', fClosed: 0.48 },
      { sY: 135.2, ctrlX: 130.0, ctrlY: 129.9, eX: 152.6, eY: 130.3, thick: 1.35, col: '#ebd7b1', fClosed: 0.24 },
    ];
    rightFannedWaves.forEach((wave) => {
      const closedY = lerp(rsNearIn.y + 0.5, rBotEdgeY - 0.4, wave.fClosed);
      const sY = lerp(closedY, wave.sY, archAmt);
      const ctrlY = lerp(closedY, wave.ctrlY, archAmt);
      const eY = lerp(closedY, wave.eY, archAmt);
      const eX = lerp(rSideEdgeX_near - 0.6, wave.eX, archAmt);
      if (archAmt > 0.1) {
        ctx.strokeStyle = `rgba(32, 14, 5, ${(0.88 * smoothstep(0.1, 0.45, archAmt)).toFixed(3)})`;
        ctx.lineWidth = lerp(0.55, wave.thick + 0.7, archAmt);
        ctx.beginPath();
        ctx.moveTo(midX + 1.2, sY + 0.6 * archAmt);
        ctx.quadraticCurveTo(wave.ctrlX, ctrlY + 0.6 * archAmt, eX, eY + 0.6 * archAmt);
        ctx.stroke();
      }
      ctx.strokeStyle = archAmt > 0.25 ? wave.col : 'rgba(72, 46, 22, 0.52)';
      ctx.lineWidth = lerp(0.45, wave.thick, archAmt);
      ctx.beginPath();
      ctx.moveTo(midX + 1.0, sY);
      ctx.quadraticCurveTo(wave.ctrlX, ctrlY, eX, eY);
      ctx.stroke();
    });

    // Right page edge tabs (anchored to rightSurf(1, tb.v))
    const rightTabs = [
      { v: 0.25, reach: 3.9, base: '#315175', border: '#101d2b' },
      { v: 0.72, reach: 4.1, base: '#dbc79e', border: '#543e1f' },
    ];
    rightTabs.forEach((tb) => {
      const dv = 1.7 / rpDepth;
      const pT = rightSurf(1, tb.v - dv);
      const pB = rightSurf(1, tb.v + dv);
      const rch = lerp(2.0, tb.reach, archAmt);
      const dropY = lerp(0.6, 2.0, archAmt);
      ctx.fillStyle = tb.base;
      ctx.beginPath();
      ctx.moveTo(pT.x - 0.8, pT.y + dropY * 0.6);
      ctx.lineTo(pT.x + rch, pT.y + dropY);
      ctx.lineTo(pB.x + rch, pB.y + dropY);
      ctx.lineTo(pB.x - 0.8, pB.y + dropY * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = tb.border;
      ctx.lineWidth = 0.4;
      ctx.stroke();
    });

    // 5. Right Interior Page Surface (rendered cleanly whenever crack opens > 0.004)
    if (openT > 0.004) {
      function traceRightPagePath() {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const p = rightSurf(i / 8, 0);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        for (let i = 8; i >= 0; i--) {
          const p = rightSurf(i / 8, 1);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }

      traceRightPagePath();
      const rGrad = ctx.createLinearGradient(rpFarL, lpTopY, rpNearR, rpBotY);
      rGrad.addColorStop(0, '#bfa378');
      rGrad.addColorStop(0.16, '#f3e2c0');
      rGrad.addColorStop(0.76, '#fbf2de');
      rGrad.addColorStop(1, '#e5cc9f');
      ctx.fillStyle = rGrad;
      ctx.fill();
      ctx.strokeStyle = '#755832';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.save();
      traceRightPagePath();
      ctx.clip();
      renderPageTemplateOnSurface(ctx, rightSurf, spreadPair.rightId, accentGold, accentCrimson);

      // Soft cast shadow from raised lid onto newly exposed right page while cover < 90deg
      if (cosP > 0.02) {
        const shCover = clamp(cosP, 0, 1);
        const sAlpha = 0.62 * shCover;
        ctx.fillStyle = `rgba(16, 6, 3, ${sAlpha.toFixed(3)})`;
        const cutU = lerp(0.05, 1.0, Math.pow(shCover, 0.72));
        const rT0 = rightSurf(0, 0), rT1 = rightSurf(cutU, 0);
        const rB0 = rightSurf(0, 1), rB1 = rightSurf(cutU, 1);
        ctx.beginPath();
        ctx.moveTo(rT0.x, rT0.y);
        ctx.lineTo(rT1.x, rT1.y);
        ctx.lineTo(rB1.x, rB1.y);
        ctx.lineTo(rB0.x, rB0.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Sewn Spine Arch & Hinged Crimson Spine Binding Wall (continuous across 0..1!)
    ctx.fillStyle = '#180505';
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.3, 3.8, 2.3, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#99342c';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.3, 4.1, 2.6, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#e4cfa5';
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([0.9, 0.9]);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.2, 4.0, 2.5, 0, Math.PI + 0.15, Math.PI * 2 - 0.15);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

    // Vertical spine bridge connecting stationary table spine to lifted lid hinge while lid is elevated
    if (hingeLift > 0.12) {
      const liftRatio = hingeLift / HINGE_LIFT_CLOSED;
      const spBotFarY = groundY(0), spBotNearY = groundY(1);
      const spTopFar = projLeftWingPoint(0, 0, 0), spTopNear = projLeftWingPoint(0, 1, 0);
      const bulgeFar = 3.3 * scaleZ(0) * liftRatio;
      const bulgeNear = 4.2 * scaleZ(1) * liftRatio;

      const spGrad = ctx.createLinearGradient(midX - bulgeNear, spBotNearY, midX + 1, spTopNear.y);
      spGrad.addColorStop(0, '#3e0909');
      spGrad.addColorStop(0.55, '#6a1515');
      spGrad.addColorStop(1, '#4c0b0b');
      ctx.fillStyle = spGrad;
      ctx.beginPath();
      ctx.moveTo(midX - bulgeFar * 0.35, spTopFar.y + 0.5);
      ctx.lineTo(spTopFar.x + 0.4, spTopFar.y);
      ctx.lineTo(spTopNear.x + 0.4, spTopNear.y);
      ctx.lineTo(midX, spBotNearY);
      ctx.quadraticCurveTo(midX - bulgeNear, spBotNearY - 0.8, midX - bulgeNear, (spBotNearY + spTopNear.y) * 0.5);
      ctx.quadraticCurveTo(midX - bulgeNear * 0.7, spTopNear.y + 0.4, spTopNear.x - 0.2, spTopNear.y + 0.2);
      ctx.lineTo(spTopFar.x - 0.2, spTopFar.y + 0.2);
      ctx.quadraticCurveTo(midX - bulgeFar, (spBotFarY + spTopFar.y) * 0.5, midX - bulgeFar * 0.35, spTopFar.y + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = coverDark;
      ctx.lineWidth = 0.55;
      ctx.stroke();

      // Solid leather vertical spine rounded side profile when closed
      ctx.fillStyle = '#5a1010';
      ctx.beginPath();
      ctx.moveTo(midX, spBotFarY);
      ctx.quadraticCurveTo(midX - bulgeFar, (spBotFarY + spTopFar.y) * 0.5, spTopFar.x + 0.3, spTopFar.y);
      ctx.lineTo(spTopNear.x + 0.3, spTopNear.y);
      ctx.quadraticCurveTo(midX - bulgeNear, (spBotNearY + spTopNear.y) * 0.5, midX, spBotNearY);
      ctx.closePath();
      ctx.fill();

      // Raised horizontal spine binding ribs along the closed crimson leather back
      const bandVis = clamp(liftRatio * 1.4, 0, 1);
      ctx.strokeStyle = `rgba(34, 5, 5, ${(0.88 * bandVis).toFixed(3)})`;
      ctx.lineWidth = 0.85;
      for (let b = 1; b <= 4; b++) {
        const f = b / 5;
        const pTop = projLeftWingPoint(0, f, 0);
        const bulgeF = lerp(bulgeFar, bulgeNear, f);
        const yBotF = groundY(f);
        ctx.beginPath();
        ctx.moveTo(midX - bulgeF * 0.72, (pTop.y + yBotF) * 0.5 + 1.2);
        ctx.lineTo(midX + 0.3, pTop.y + 0.7);
        ctx.stroke();
      }
    }

    // 7. Moving Front Cover (0..90deg) OR Left Interior Stack + Left Page (<90..180deg)
    if (cosP > 0) {
      // Attached thick Left-wing Page Stack (LEFT_STACK_THICK = 7.0u -> unites seamlessly with right stack at openT=0, lifts cleanly with lid!)
      const innerFarOut = projLeftWingPoint(1, 0, COVER_THICK);
      const innerNearOut = projLeftWingPoint(1, 1, COVER_THICK);
      const innerFarIn = projLeftWingPoint(0, 0, COVER_THICK);
      const innerNearIn = projLeftWingPoint(0, 1, COVER_THICK);

      const stkTopFarOut = projLeftWingPoint(R_PAGE_OUT, 0, COVER_THICK);
      const stkTopNearOut = projLeftWingPoint(R_PAGE_OUT, 1, COVER_THICK);
      const stkTopNearIn = projLeftWingPoint(0.015, 1, lerp(COVER_THICK, 0.25, spinePinch));
      const stkBotFarOut = projLeftWingPoint(R_PAGE_OUT, 0, leftBlockN(0));
      const stkBotNearOut = projLeftWingPoint(R_PAGE_OUT, 1, leftBlockN(0));
      const stkBotNearIn = projLeftWingPoint(0.015, 1, leftBlockN(1));

      // Side fore-edge parchment stack face of the upper half-book
      ctx.fillStyle = '#c2aa7e';
      ctx.beginPath();
      ctx.moveTo(stkTopFarOut.x, stkTopFarOut.y);
      ctx.lineTo(innerFarOut.x - 0.4, innerFarOut.y + 0.6);
      ctx.lineTo(innerNearOut.x - 0.4, innerNearOut.y + 0.6);
      ctx.lineTo(stkTopNearOut.x, stkTopNearOut.y);
      ctx.lineTo(stkBotNearOut.x, stkBotNearOut.y);
      ctx.lineTo(stkBotFarOut.x, stkBotFarOut.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(117, 88, 52, 0.55)';
      ctx.lineWidth = 0.4;
      for (let i = 1; i <= 2; i++) {
        const f = i / 3;
        const pF = projLeftWingPoint(lerp(R_PAGE_OUT, 0.96, f * 0.4), 0, lerp(COVER_THICK, leftBlockN(0), f));
        const pN = projLeftWingPoint(lerp(R_PAGE_OUT, 0.96, f * 0.4), 1, lerp(COVER_THICK, leftBlockN(0), f));
        ctx.beginPath();
        ctx.moveTo(pF.x, pF.y);
        ctx.lineTo(pN.x, pN.y);
        ctx.stroke();
      }

      // Front bottom cut page block face of upper half-book
      const topFrontGrad = ctx.createLinearGradient(stkTopNearIn.x, stkTopNearIn.y, stkBotNearOut.x, stkBotNearOut.y);
      topFrontGrad.addColorStop(0, '#9c835c');
      topFrontGrad.addColorStop(0.35, '#dfca9f');
      topFrontGrad.addColorStop(1, '#c3aa7d');
      ctx.fillStyle = topFrontGrad;
      ctx.beginPath();
      ctx.moveTo(stkTopNearIn.x, stkTopNearIn.y);
      ctx.lineTo(stkTopNearOut.x, stkTopNearOut.y);
      ctx.lineTo(stkBotNearOut.x, stkBotNearOut.y);
      ctx.lineTo(stkBotNearIn.x, stkBotNearIn.y);
      ctx.closePath();
      ctx.fill();

      // Matching crisp page striations across upper half-book front slice
      ctx.strokeStyle = 'rgba(72, 46, 22, 0.52)';
      ctx.lineWidth = 0.45;
      for (let s = 1; s <= 3; s++) {
        const f = s / 4;
        const nL = lerp(lerp(COVER_THICK, 0.25, spinePinch), leftBlockN(1), f);
        const nR = lerp(COVER_THICK, leftBlockN(0), f);
        const pL = projLeftWingPoint(0.03, 1, nL);
        const pR = projLeftWingPoint(R_PAGE_OUT - 0.01, 1, nR);
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.stroke();
      }

      // Subtle under-cover overhang shadow along very top paper edge
      ctx.strokeStyle = 'rgba(32, 12, 6, 0.65)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(stkTopNearIn.x, stkTopNearIn.y);
      ctx.lineTo(stkTopNearOut.x, stkTopNearOut.y);
      ctx.lineTo(stkTopFarOut.x, stkTopFarOut.y);
      ctx.stroke();

      // Solid crimson leather front board thickness faces along bottom & fore-edge (always visible at openT=0 too!)
      ctx.fillStyle = coverEdge;
      ctx.beginPath();
      ctx.moveTo(lbNearIn.x, lbNearIn.y);
      ctx.lineTo(lbNearOut.x, lbNearOut.y);
      ctx.lineTo(innerNearOut.x, innerNearOut.y);
      ctx.lineTo(innerNearIn.x, innerNearIn.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#470a0a';
      ctx.beginPath();
      ctx.moveTo(lbFarOut.x, lbFarOut.y);
      ctx.lineTo(lbNearOut.x, lbNearOut.y);
      ctx.lineTo(innerNearOut.x, innerNearOut.y);
      ctx.lineTo(innerFarOut.x, innerFarOut.y);
      ctx.closePath();
      ctx.fill();

      function frontCoverSurf(u, v) {
        return projLeftWingPoint(u, v, 0);
      }

      // Crimson Leather Front Board exterior
      const cGrad = ctx.createLinearGradient(lbNearIn.x, lbNearIn.y, lbFarOut.x, lbFarOut.y);
      cGrad.addColorStop(0, '#5a1010');
      cGrad.addColorStop(0.45, '#861d1d');
      cGrad.addColorStop(1, '#681414');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.moveTo(lbFarIn.x, lbFarIn.y);
      ctx.lineTo(lbFarOut.x, lbFarOut.y);
      ctx.lineTo(lbNearOut.x, lbNearOut.y);
      ctx.lineTo(lbNearIn.x, lbNearIn.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = coverDark;
      ctx.lineWidth = 0.65;
      ctx.stroke();

      // Blind-tooled rectangular border rule + spine groove
      const b1 = frontCoverSurf(0.11, 0.09);
      const b2 = frontCoverSurf(0.90, 0.09);
      const b3 = frontCoverSurf(0.90, 0.91);
      const b4 = frontCoverSurf(0.11, 0.91);
      ctx.strokeStyle = 'rgba(42, 8, 8, 0.85)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(b3.x, b3.y);
      ctx.lineTo(b4.x, b4.y);
      ctx.closePath();
      ctx.stroke();

      const g1 = frontCoverSurf(0.06, 0.02);
      const g2 = frontCoverSurf(0.06, 0.98);
      ctx.strokeStyle = '#380909';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(g1.x, g1.y);
      ctx.lineTo(g2.x, g2.y);
      ctx.stroke();

      // Gold brass fore-edge corners on Front Cover
      ctx.fillStyle = '#c99c42';
      const tr0 = frontCoverSurf(1, 0), tr1 = frontCoverSurf(0.89, 0), tr2 = frontCoverSurf(1, 0.12);
      ctx.beginPath(); ctx.moveTo(tr0.x, tr0.y); ctx.lineTo(tr1.x, tr1.y); ctx.lineTo(tr2.x, tr2.y); ctx.closePath(); ctx.fill();
      const br0 = frontCoverSurf(1, 1), br1 = frontCoverSurf(0.89, 1), br2 = frontCoverSurf(1, 0.88);
      ctx.beginPath(); ctx.moveTo(br0.x, br0.y); ctx.lineTo(br1.x, br1.y); ctx.lineTo(br2.x, br2.y); ctx.closePath(); ctx.fill();

      // Dark Daedric "Oht" glyph engraved cleanly onto the front leather cover!
      drawDaedricOhtOnCover(ctx, frontCoverSurf, clamp(cosP * 1.35, 0, 1));
    } else {
      // Past 90deg opening left: Side & Bottom Left Page Stack Thickness + Left Tab + Left Interior Page!
      const lsFarOut = dynLeftSurf(0, 0);
      const lsNearOut = dynLeftSurf(0, 1);
      const lsNearMid = dynLeftSurf(0.5, 1);
      const lsNearIn = dynLeftSurf(1, 1);

      // Side Left Fore-Edge Parchment Stack Wedge (connects leather cover rim directly to outer page edge)
      const boardEdgeFar = projLeftWingPoint(1 - 1.0 / MAX_R, 0, lerp(COVER_THICK, COVER_THICK * 0.4, pageRestAmt));
      const boardEdgeNear = projLeftWingPoint(1 - lerp(1.0, 2.8, pageRestAmt) / MAX_R, 1, lerp(COVER_THICK, COVER_THICK * 1.4, pageRestAmt));
      ctx.fillStyle = '#c5ae84';
      ctx.beginPath();
      ctx.moveTo(boardEdgeFar.x, boardEdgeFar.y);
      ctx.lineTo(lsFarOut.x + 0.5, lsFarOut.y + 0.8 * pageRestAmt);
      ctx.lineTo(lsNearOut.x + 0.5, lsNearOut.y + 2.0 * pageRestAmt);
      ctx.lineTo(boardEdgeNear.x, boardEdgeNear.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#755834';
      ctx.lineWidth = 0.4;
      for (let i = 1; i <= 2; i++) {
        const f = i * 0.35;
        ctx.beginPath();
        ctx.moveTo(lerp(boardEdgeFar.x, lsFarOut.x + 0.5, f), lerp(boardEdgeFar.y, lsFarOut.y, f));
        ctx.lineTo(lerp(boardEdgeNear.x, lsNearOut.x + 0.5, f), lerp(boardEdgeNear.y, lsNearOut.y + 1.0, f));
        ctx.stroke();
      }

      // Left Leather Index Tab (anchored to dynLeftSurf(0, 0.36))
      const dvL = 1.7 / lpDepth;
      const ltT = dynLeftSurf(0, 0.36 - dvL);
      const ltB = dynLeftSurf(0, 0.36 + dvL);
      const ltReach = 3.8 * smoothstep(0.54, 0.90, openT);
      if (ltReach > 0.2) {
        ctx.fillStyle = '#7d4b24';
        ctx.beginPath();
        ctx.moveTo(ltT.x + 0.8, ltT.y + 1.2 * pageRestAmt);
        ctx.lineTo(ltT.x - ltReach, ltT.y + 2.0 * pageRestAmt);
        ctx.lineTo(ltB.x - ltReach, ltB.y + 2.0 * pageRestAmt);
        ctx.lineTo(ltB.x + 0.8, ltB.y + 1.2 * pageRestAmt);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2e1809';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }

      // Left Bottom Parchment Stack Slice connecting dynLeftSurf bottom edge cleanly down to board rim
      const leftSpineBotX = lerp(midX - 0.5, midX - 3.6, pageRestAmt);
      const leftSpineBotY = lerp(lbNearIn.y - 1.6, coverBotY - 2.0, pageRestAmt);
      const lbGrad = ctx.createLinearGradient(boardEdgeNear.x, boardEdgeNear.y, midX - 1, coverBotY);
      lbGrad.addColorStop(0, '#c8b083');
      lbGrad.addColorStop(0.45, '#dfca9f');
      lbGrad.addColorStop(0.85, '#b89b6e');
      lbGrad.addColorStop(1, '#6f5130');
      ctx.fillStyle = lbGrad;
      ctx.beginPath();
      ctx.moveTo(lsNearOut.x, lsNearOut.y);
      ctx.quadraticCurveTo(lsNearMid.x, lsNearMid.y, lsNearIn.x, lsNearIn.y);
      ctx.lineTo(leftSpineBotX, leftSpineBotY);
      ctx.lineTo(boardEdgeNear.x, boardEdgeNear.y);
      ctx.closePath();
      ctx.fill();

      // Subtle under-arch lift shadow + 4 horizontal bottom page lines along Left stack
      if (pageRestAmt > 0.2) {
        ctx.save();
        ctx.globalAlpha = pageRestAmt;
        const leftLiftShadow = ctx.createLinearGradient(lsNearOut.x, lsNearOut.y, lsNearOut.x, lsNearOut.y + 6);
        leftLiftShadow.addColorStop(0, 'rgba(30, 14, 5, 0.88)');
        leftLiftShadow.addColorStop(1, 'rgba(30, 14, 5, 0)');
        ctx.fillStyle = leftLiftShadow;
        ctx.beginPath();
        ctx.moveTo(lsNearOut.x - 0.5, lsNearOut.y);
        ctx.quadraticCurveTo(lsNearMid.x, lsNearMid.y, lsNearIn.x - 7.5, lsNearIn.y - 1.2);
        ctx.quadraticCurveTo(lsNearMid.x - 4.0, lsNearMid.y + 2.8, lsNearOut.x - 1.7, lsNearOut.y + 6.0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(72, 46, 22, 0.58)';
        ctx.lineWidth = 0.45;
        for (let i = 0; i < 4; i++) {
          const frac = (i + 1) / 5;
          ctx.beginPath();
          ctx.moveTo(lerp(lsNearOut.x, boardEdgeNear.x, frac * 0.72), lerp(lsNearOut.y + 2.5, boardEdgeNear.y - 1.0, frac));
          ctx.quadraticCurveTo(
            lsNearMid.x,
            lerp(lsNearMid.y + 2.2, coverBotY - 3.0, frac),
            midX - 1.2 - i * 0.55,
            lerp(lsNearIn.y + 1.4, coverBotY - 1.8, frac)
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // Left Curved Interior Page Surface
      function traceLeftPagePath() {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const p = dynLeftSurf(i / 8, 0);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        for (let i = 8; i >= 0; i--) {
          const p = dynLeftSurf(i / 8, 1);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }

      traceLeftPagePath();
      const lGrad = ctx.createLinearGradient(lsNearOut.x, lsNearOut.y, lpFarR, lpTopY);
      lGrad.addColorStop(0, '#e3ca9e');
      lGrad.addColorStop(0.22, '#faf0da');
      lGrad.addColorStop(0.84, '#f3e2c0');
      lGrad.addColorStop(1, '#bfa378');
      ctx.fillStyle = lGrad;
      ctx.fill();
      ctx.strokeStyle = '#755832';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      const inkFade = clamp((Math.abs(cosP) - 0.06) / 0.24, 0, 1);
      if (inkFade > 0.03) {
        ctx.save();
        traceLeftPagePath();
        ctx.clip();
        ctx.globalAlpha = inkFade;
        renderPageTemplateOnSurface(ctx, dynLeftSurf, spreadPair.leftId, accentGold, accentCrimson);
        ctx.restore();
      }
    }

    // 8. Spine Gutter Crease Shadow (fades in naturally once open past 50%)
    if (openT > 0.52) {
      const gutFade = smoothstep(0.52, 0.90, openT);
      ctx.save();
      ctx.globalAlpha = gutFade;
      ctx.strokeStyle = 'rgba(35, 16, 5, 0.78)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(midX, creaseTopY);
      ctx.lineTo(midX, creaseBotY);
      ctx.stroke();

      const gutGrad = ctx.createLinearGradient(midX - 4, 0, midX + 4, 0);
      gutGrad.addColorStop(0, 'rgba(0,0,0,0)');
      gutGrad.addColorStop(0.5, 'rgba(50, 25, 8, 0.28)');
      gutGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gutGrad;
      ctx.fillRect(midX - 4, creaseTopY, 8, creaseBotY - creaseTopY);
      ctx.restore();
    }

    } // end !bookHit
    if (isSteadyBook && !bookHit && _bookBaseCache.canvas) {
      ctx.restore();
      _bookBaseCache.key = bookCacheKey;
      ctx = mainCtx;
      ctx.drawImage(_bookBaseCache.canvas, 0, 0);
      ctx.save();
      ctx.translate(cx - origMidX * S, targetBotY - origBotY * S);
      ctx.scale(S, S);
    }

    // 9. Continuous Silk & Cord Ribbon Bookmarks protruding along bottom page seam (no threshold pop!)
    const ribbonFlutter = (flipSnapshot && flipSnapshot.inBurst)
      ? Math.sin(tSec * 24) * 0.9
      : Math.sin(tSec * 2.1) * 0.2;

    // Gold tassel cord always emerges cleanly out of the book seam near spine
    const gStartY = lerp(coverBotY - 5.6, creaseBotY + 0.5, smoothstep(0.08, 0.85, openT));
    const gEndX = lerp(midX + 4.5, 110.5, smoothstep(0.15, 0.95, openT)) + ribbonFlutter;
    ctx.strokeStyle = '#cfa04a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(midX + 1.0, gStartY);
    ctx.quadraticCurveTo(midX + 1.8, 142.8, midX + 2.4, 144.2);
    ctx.quadraticCurveTo(109.5, 146.5, gEndX, 150.2);
    ctx.stroke();
    ctx.fillStyle = '#7d1616';
    ctx.beginPath();
    ctx.arc(gEndX, 150.2, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6b84c';
    ctx.beginPath();
    ctx.arc(gEndX - 0.2, 150.0, 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Plum right bookmark emerging along bottom Right stack seam (present in both closed & open states!)
    const plumTop = rightSurf(0.39, 1);
    const plumTopY = Math.max(plumTop.y, coverBotY - 6.6);
    ctx.fillStyle = '#542648';
    ctx.beginPath();
    ctx.moveTo(plumTop.x, plumTopY);
    ctx.lineTo(125.4, 142.4);
    ctx.quadraticCurveTo(128.0, 146.0, 131.0 + ribbonFlutter * 0.6, 149.2);
    ctx.lineTo(132.2 + ribbonFlutter * 0.6, 148.6);
    ctx.quadraticCurveTo(129.4, 145.6, 126.6, 142.4);
    ctx.lineTo(plumTop.x + 1.0, plumTopY);
    ctx.closePath();
    ctx.fill();

    // Forest green left bookmark rises into view continuously as Left spread unfurls past 55%
    const greenVis = smoothstep(0.55, 0.94, openT);
    if (greenVis > 0.02) {
      const greenAnchor = dynLeftSurf(0.11, 1);
      ctx.save();
      ctx.globalAlpha = greenVis;
      ctx.strokeStyle = '#2c6648';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(greenAnchor.x, greenAnchor.y + 4.5 * (1 - pageRestAmt));
      ctx.lineTo(lerp(greenAnchor.x, 60.4, greenVis), 142.3);
      ctx.quadraticCurveTo(lerp(greenAnchor.x - 1, 57.2, greenVis), 146.0, lerp(greenAnchor.x - 2, 54.5, greenVis) - ribbonFlutter * 0.7, 149.2);
      ctx.stroke();
      ctx.restore();
    }

    // 10. Rapid Turning Page Leaves during sporadic bursts (only when fully opened >= 0.94, smoothly weighted by openT)
    const leafAlpha = smoothstep(0.92, 0.99, openT);
    const rawLeaves = (leafAlpha > 0.02 && flipSnapshot && Array.isArray(flipSnapshot.leaves)) ? flipSnapshot.leaves.slice() : [];
    rawLeaves.sort((a, b) => Math.abs(b.progress - 0.5) - Math.abs(a.progress - 0.5));

    for (let i = 0; i < rawLeaves.length; i++) {
      const lf = rawLeaves[i];
      const rawP = clamp(lf.progress, 0, 1);
      const travel = lf.dir >= 0 ? rawP : 1 - rawP;
      const p = easeInOutCubic(travel);
      const angle = p * Math.PI;
      const liftSin = Math.sin(angle);
      const arcH = 16 * (lf.curlAmp || 1) * liftSin;

      const spineTop = { x: lerp(rpFarL, lpFarR, p), y: creaseTopY };
      const spineBot = { x: lerp(rpNearL, lpNearR, p), y: creaseBotY };
      const flatRTop = rightSurf(1, 0);
      const flatRBot = rightSurf(1, 1);
      const flatLTop = dynLeftSurf(0, 0);
      const flatLBot = dynLeftSurf(0, 1);

      const flutter = Math.sin(travel * Math.PI) * (lf.skewLead || 0.07);
      const lagTop = clamp(travel + flutter, 0, 1);
      const lagBot = clamp(travel - flutter, 0, 1);
      const angT = easeInOutCubic(lagTop) * Math.PI;
      const angB = easeInOutCubic(lagBot) * Math.PI;

      const outTopX = lerp(flatRTop.x, flatLTop.x, 0.5 - 0.5 * Math.cos(angT));
      const outTopY = lerp(flatRTop.y, flatLTop.y, 0.5 - 0.5 * Math.cos(angT)) - 13 * (lf.curlAmp || 1) * Math.sin(angT);
      const outBotX = lerp(flatRBot.x, flatLBot.x, 0.5 - 0.5 * Math.cos(angB));
      const outBotY = lerp(flatRBot.y, flatLBot.y, 0.5 - 0.5 * Math.cos(angB)) - 17 * (lf.curlAmp || 1) * Math.sin(angB);

      ctx.save();
      ctx.globalAlpha = leafAlpha;
      ctx.fillStyle = `rgba(22, 10, 4, ${(0.24 * liftSin).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(spineTop.x, spineTop.y);
      ctx.lineTo(lerp(spineTop.x, outTopX, 0.85), lerp(flatRTop.y, flatLTop.y, p));
      ctx.lineTo(lerp(spineBot.x, outBotX, 0.85), lerp(flatRBot.y, flatLBot.y, p));
      ctx.lineTo(spineBot.x, spineBot.y);
      ctx.closePath();
      ctx.fill();

      const ctrlMidTopX = lerp(122.5, 85.5, p) + Math.cos(angle) * 4.5 * liftSin;
      const ctrlMidTopY = lerp(90.8, 91.5, p) - arcH * 0.46;
      const ctrlMidBotX = lerp(128.0, 80.0, p) + Math.cos(angle) * 4.5 * liftSin;
      const ctrlMidBotY = lerp(126.2, 128.8, p) - arcH * 0.46;

      let sheetGrad;
      if (p < 0.5) {
        sheetGrad = ctx.createLinearGradient(rpFarL, lpTopY, outBotX, outBotY);
        sheetGrad.addColorStop(0, '#bfa378');
        sheetGrad.addColorStop(0.16, '#f3e2c0');
        sheetGrad.addColorStop(0.76, '#fbf2de');
        sheetGrad.addColorStop(1, '#e5cc9f');
      } else {
        sheetGrad = ctx.createLinearGradient(outBotX, outBotY, lpFarR, lpTopY);
        sheetGrad.addColorStop(0, '#e3ca9e');
        sheetGrad.addColorStop(0.22, '#faf0da');
        sheetGrad.addColorStop(0.84, '#f3e2c0');
        sheetGrad.addColorStop(1, '#bfa378');
      }

      function traceTurningSheetPath() {
        ctx.beginPath();
        ctx.moveTo(spineTop.x, spineTop.y);
        ctx.quadraticCurveTo(ctrlMidTopX, ctrlMidTopY, outTopX, outTopY);
        ctx.quadraticCurveTo((outTopX + outBotX) * 0.5 + liftSin * 3.0, (outTopY + outBotY) * 0.5, outBotX, outBotY);
        ctx.quadraticCurveTo(ctrlMidBotX, ctrlMidBotY, spineBot.x, spineBot.y);
        ctx.closePath();
      }

      traceTurningSheetPath();
      ctx.fillStyle = sheetGrad;
      ctx.fill();

      if (liftSin > 0.05) {
        ctx.fillStyle = `rgba(38, 22, 8, ${(0.08 * liftSin).toFixed(3)})`;
        ctx.fill();
      }

      const faceVis = Math.abs(Math.cos(angle));
      if (faceVis > 0.08) {
        const isFront = p < 0.5;
        const tplId = isFront
          ? getSpreadTemplateByIndex(lf.frontSeed, 'right', templateState)
          : getSpreadTemplateByIndex(lf.backSeed, 'left', templateState);

        const turningSurf = isFront
          ? function (u, v) {
            const pTopX = quadVal(spineTop.x, ctrlMidTopX, outTopX, u);
            const pTopY = quadVal(spineTop.y, ctrlMidTopY, outTopY, u);
            const pBotX = quadVal(spineBot.x, ctrlMidBotX, outBotX, u);
            const pBotY = quadVal(spineBot.y, ctrlMidBotY, outBotY, u);
            return { x: lerp(pTopX, pBotX, v), y: lerp(pTopY, pBotY, v) };
          }
          : function (u, v) {
            const pTopX = quadVal(outTopX, ctrlMidTopX, spineTop.x, u);
            const pTopY = quadVal(outTopY, ctrlMidTopY, spineTop.y, u);
            const pBotX = quadVal(outBotX, ctrlMidBotX, spineBot.x, u);
            const pBotY = quadVal(outBotY, ctrlMidBotY, spineBot.y, u);
            return { x: lerp(pTopX, pBotX, v), y: lerp(pTopY, pBotY, v) };
          };

        ctx.save();
        traceTurningSheetPath();
        ctx.clip();
        ctx.globalAlpha = leafAlpha * clamp((faceVis - 0.08) / 0.20, 0.25, 1.0);
        renderPageTemplateOnSurface(ctx, turningSurf, tplId, accentGold, accentCrimson);
        ctx.restore();
      }

      traceTurningSheetPath();
      ctx.strokeStyle = 'rgba(117, 88, 50, 0.50)';
      ctx.lineWidth = 0.50;
      ctx.stroke();
      ctx.restore();
    }

    if (rawLeaves.length > 0 && openT > 0.52) {
      const gutFade = smoothstep(0.52, 0.90, openT) * leafAlpha;
      const gutGrad2 = ctx.createLinearGradient(midX - 4, 0, midX + 4, 0);
      gutGrad2.addColorStop(0, 'rgba(0,0,0,0)');
      gutGrad2.addColorStop(0.5, 'rgba(50, 25, 8, 0.28)');
      gutGrad2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = gutFade;
      ctx.fillStyle = gutGrad2;
      ctx.fillRect(midX - 4, creaseTopY, 8, creaseBotY - creaseTopY);
      ctx.strokeStyle = 'rgba(35, 16, 5, 0.78)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(midX, creaseTopY);
      ctx.lineTo(midX, creaseBotY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Shared wick & height coordinates so candle wax bodies, minor lightmask carving, and post-darkness flames align identically
  function computeCandleGeometry(spec, tSec) {
    const baseLift = spec.hasDish ? 2.2 : 0;
    const yBot = -baseLift;
    const yTopL = yBot - spec.h + (spec.slant < 0 ? Math.abs(spec.slant) : 0);
    const yTopR = yBot - spec.h + (spec.slant > 0 ? spec.slant : 0);
    const yTopMid = (yTopL + yTopR) * 0.5;
    const sway = Math.sin(tSec * 8.2 + spec.phase) * 0.42 + Math.cos(tSec * 13.5 + spec.phase * 1.4) * 0.16;
    const stretch = Math.cos(tSec * 11.4 + spec.phase) * 0.45;
    const alphaJitter = Math.sin(tSec * 6.8 + spec.phase) * 0.025;
    const wickBaseY = yTopMid + 0.1;
    const wickTopY = wickBaseY - 2.3;
    const fH = 6.6 + stretch * 1.05;
    return {
      baseLift,
      yBot,
      yTopL,
      yTopR,
      yTopMid,
      sway,
      stretch,
      alphaJitter,
      wickBaseY,
      wickTopY,
      fH,
      worldFlameX: spec.x + sway * 0.35,
      worldFlameY: spec.y + wickTopY - fH * 0.45,
    };
  }

  // Pass 1 (lit/shaded by room lightmask): candle holder, melted wax body, puddle, charred wick
  function drawSingleCandleBody(ctx, spec, geom) {
    const { x, y, h, r, slant, drips, hasDish, puddle } = spec;
    const isOgarek = spec.wear === 'ogarek';

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
    ctx.beginPath();
    ctx.ellipse(0, 2.2, isOgarek ? 12.0 : 8.5, isOgarek ? 4.4 : 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (puddle > 0.15) {
      const pRx = 6.2 + puddle * 6.2;
      const pRy = 2.6 + puddle * 2.2;
      const pudGrad = ctx.createRadialGradient(-1, 0, 1, 0, 0.8, pRx);
      pudGrad.addColorStop(0, '#ebe0bf');
      pudGrad.addColorStop(0.55, '#cbb990');
      pudGrad.addColorStop(0.88, '#8d7b58');
      pudGrad.addColorStop(1, '#584a31');
      ctx.fillStyle = pudGrad;
      ctx.beginPath();
      ctx.moveTo(-pRx, 0.6);
      ctx.bezierCurveTo(-pRx * 0.9, -pRy * 1.1, -pRx * 0.1, -pRy * 0.9, pRx * 0.45, -pRy * 0.7);
      ctx.bezierCurveTo(pRx * 1.05, -pRy * 0.4, pRx * 1.12, pRy * 0.9, pRx * 0.35, pRy * 1.15);
      ctx.bezierCurveTo(-pRx * 0.25, pRy * 1.3, -pRx * 1.05, pRy * 0.9, -pRx, 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 248, 224, 0.32)';
      ctx.lineWidth = 0.65;
      ctx.stroke();

      if (isOgarek) {
        ctx.fillStyle = '#bfb088';
        ctx.beginPath();
        ctx.ellipse(-pRx * 0.65, 2.5, 3.6, 1.4, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ddd0ac';
        ctx.beginPath();
        ctx.ellipse(pRx * 0.72, 1.8, 2.8, 1.1, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (hasDish) {
      const hSide = x < 175 ? -1 : 1;
      ctx.strokeStyle = '#7b4914';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.arc(hSide * 6.0, 0.1, 1.8, 0, Math.PI * 2);
      ctx.stroke();

      const dishG = ctx.createLinearGradient(-7.2, 0, 7.2, 0);
      dishG.addColorStop(0, '#3a1a06');
      dishG.addColorStop(0.32, '#b06a22');
      dishG.addColorStop(0.55, '#dfc06c');
      dishG.addColorStop(1, '#361705');
      ctx.fillStyle = dishG;
      ctx.beginPath();
      ctx.ellipse(0, 0.6, 7.2, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6c3c11';
      ctx.fillRect(-r - 0.6, -2.0, (r + 0.6) * 2, 2.4);
    }

    const { yBot, yTopL, yTopR, yTopMid, wickBaseY, wickTopY, sway } = geom;
    const waxG = ctx.createLinearGradient(-r, 0, r, 0);
    waxG.addColorStop(0, '#7c6f54');
    waxG.addColorStop(0.28, '#e3d5b2');
    waxG.addColorStop(0.62, '#d1c29e');
    waxG.addColorStop(1, '#685b42');
    ctx.fillStyle = waxG;
    ctx.beginPath();
    ctx.moveTo(-r, yBot);
    ctx.lineTo(-r, yTopL);
    ctx.quadraticCurveTo(0, yTopMid + 1.2, r, yTopR);
    ctx.lineTo(r, yBot);
    ctx.ellipse(0, yBot, r, 1.35, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isOgarek ? '#c6b58c' : '#ece0bf';
    ctx.beginPath();
    ctx.ellipse(0, yTopMid, r, 1.25, slant * 0.14, 0, Math.PI * 2);
    ctx.fill();

    if (h < 28) {
      ctx.fillStyle = 'rgba(72, 54, 30, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, yTopMid + 0.2, r * 0.62, 0.72, slant * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#e7dac0';
    drips.forEach((dFrac, idx) => {
      const dx = (idx - (drips.length - 1) * 0.5) * (r * 0.75) + (idx % 2 === 0 ? -0.4 : 0.4);
      const startY = lerp(yTopL, yTopR, clamp((dx + r) / (r * 2), 0, 1)) + 0.3;
      const dropLen = Math.min(h - 0.5, Math.max(2.2, h * dFrac));
      ctx.fillRect(dx - 0.65, startY, 1.3, dropLen);
      ctx.beginPath();
      ctx.arc(dx, startY + dropLen, 0.85, 0, Math.PI * 2);
      ctx.fill();
    });

    if (!geom._skipWick) {
      ctx.strokeStyle = '#141210';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, wickBaseY);
      ctx.lineTo(sway * 0.25, wickTopY);
      ctx.stroke();
    }

    ctx.restore();
  }

  function getStaticCandleBodiesCanvas(W, H) {
    const key = `${W}x${H}`;
    if (candleBodyCache.has(key)) return candleBodyCache.get(key);
    const off = createOffscreenCanvas(W, H);
    if (!off) return null;
    const c = off.getContext('2d');
    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      const g = computeCandleGeometry(CANDLE_LAYOUT[i], 0);
      g._skipWick = true;
      drawSingleCandleBody(c, CANDLE_LAYOUT[i], g);
    }
    candleBodyCache.set(key, off);
    return off;
  }

  function parseRgb(rgbStr) {
    const m = String(rgbStr || '255,255,255').split(',');
    return [Number(m[0]) || 255, Number(m[1]) || 255, Number(m[2]) || 255];
  }

  // Pass 2 (drawn AFTER chamber lighting pass): larger, clearer school-colored candle flames per assigned slot
  function drawSingleCandleFlame(ctx, spec, geom, tSec, candleSchool) {
    const { x, y, phase } = spec;
    const { wickTopY, sway, fH, alphaJitter } = geom;

    ctx.save();
    ctx.translate(x, y);
    const flameY = wickTopY;
    if (candleSchool) {
      const haloR = 11.5;
      const haloSp = getSchoolFlameHaloSprite(candleSchool);
      if (haloSp) {
        ctx.globalAlpha = clamp(0.32 + alphaJitter, 0.2, 0.45);
        ctx.drawImage(haloSp, sway * 0.35 - haloR, flameY - fH * 0.45 - haloR, haloR * 2, haloR * 2);
        ctx.globalAlpha = 1;
      } else {
        const haloGrad = ctx.createRadialGradient(sway * 0.35, flameY - fH * 0.45, 0.5, sway * 0.35, flameY - fH * 0.45, haloR);
        haloGrad.addColorStop(0, `rgba(${candleSchool.glowRgb}, ${(0.32 + alphaJitter).toFixed(3)})`);
        haloGrad.addColorStop(0.50, `rgba(${candleSchool.accentRgb}, 0.11)`);
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(sway * 0.35, flameY - fH * 0.45, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Fuller taller colored candle flame tongue
      ctx.fillStyle = `rgba(${candleSchool.glowRgb}, 0.92)`;
      ctx.beginPath();
      ctx.moveTo(-1.75, flameY + 0.3);
      ctx.quadraticCurveTo(-2.25, flameY - fH * 0.48, sway * 0.80, flameY - fH);
      ctx.quadraticCurveTo(2.25, flameY - fH * 0.48, 1.75, flameY + 0.3);
      ctx.closePath();
      ctx.fill();

      // Luminous inner tear flame core
      ctx.fillStyle = candleSchool.core;
      ctx.globalAlpha = 0.84;
      ctx.beginPath();
      ctx.moveTo(-0.82, flameY + 0.1);
      ctx.quadraticCurveTo(-1.05, flameY - fH * 0.38, sway * 0.42, flameY - fH * 0.72);
      ctx.quadraticCurveTo(1.05, flameY - fH * 0.38, 0.82, flameY + 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Extinguished wick in dark room: tiny faint ember/soot tip + subtle drifting smoke wisp
      ctx.fillStyle = 'rgba(110, 58, 34, 0.28)';
      ctx.beginPath();
      ctx.arc(sway * 0.15, flameY + 0.25, 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, flameY);
      ctx.bezierCurveTo(
        Math.sin(tSec * 2 + phase) * 2.0,
        flameY - 4,
        -Math.cos(tSec * 1.7 + phase) * 2.2,
        flameY - 8,
        Math.sin(tSec * 1.4 + phase) * 1.6,
        flameY - 12,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pre-tapestry stone brick relief highlights + cast banner shadow when outward long lightning bolts burst
  function drawShockBrickRelief(ctx, W, H, tSec, shockFrame) {
    if (!shockFrame || shockFrame.strikeFlash <= 0.05) return;
    const sFlash = shockFrame.strikeFlash;
    const cx = W * 0.5;
    const lx = cx + shockFrame.jitterX * 1.45;
    const ly = 125 + Math.sin(tSec * 1.8) * 2.2 + shockFrame.jitterY * 1.45;

    ctx.save();
    // 1. Directional hard shadow thrown by the hanging tapestry across the stone bricks opposite the lightning flash
    const tapL = cx - 68;
    const tapR = cx + 68;
    const topY = 8;
    const hemY = 171;
    const shOffX = -shockFrame.centroidX * (3.5 + sFlash * 8.0);
    const shOffY = -shockFrame.centroidY * (2.5 + sFlash * 5.5);

    ctx.fillStyle = `rgba(1, 2, 6, ${clamp(0.55 * sFlash, 0, 0.80).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tapL + shOffX, topY + shOffY);
    ctx.lineTo(tapR + shOffX, topY + shOffY);
    ctx.lineTo(tapR + shOffX + 3, hemY + shOffY);
    ctx.lineTo(cx + shOffX, hemY + 6 + shOffY);
    ctx.lineTo(tapL + shOffX - 3, hemY + shOffY);
    ctx.closePath();
    ctx.fill();

    // 2. Crisp brick bevel highlights facing lightning center & deepened dark mortar crevices (batched in 4 alpha bands)
    const flashR = 130 + sFlash * 105;
    const flashR2 = flashR * flashR;
    const invFlashR = 1 / flashR;
    const sClamp = clamp(sFlash, 0, 1.35);
    const brickH = 13;
    const brickW = 28;
    const rows = Math.ceil((H * 0.70) / brickH);
    const cols = Math.ceil((W + brickW) / brickW);
    const litB = [[], [], [], []];
    const drkB = [[], [], [], []];
    for (let r = 0; r < rows; r++) {
      const y = r * brickH;
      const byC = y + brickH * 0.5;
      const dy = byC - ly;
      const dy2 = dy * dy;
      if (dy2 > flashR2) continue;
      const rowOff = (r % 2) * (brickW * 0.5);
      const hitBottom = ly > byC;
      const litEdgeY = hitBottom ? (y + brickH - 2) : (y + 1.2);
      const darkEdgeY = hitBottom ? (y + 1.2) : (y + brickH - 2);
      for (let c = -1; c < cols; c++) {
        const x = c * brickW + rowOff;
        const bxC = x + brickW * 0.5;
        const dx = bxC - lx;
        const d2 = dx * dx + dy2;
        if (d2 > flashR2) continue;
        const u = 1 - Math.sqrt(d2) * invFlashR;
        const atten = u * Math.sqrt(u) * sClamp;
        if (atten < 0.04) continue;
        const b = atten < 0.22 ? 0 : (atten < 0.48 ? 1 : (atten < 0.82 ? 2 : 3));
        const litEdgeX = lx > bxC ? (x + brickW - 2) : (x + 1.2);
        litB[b].push(x + 1.8, litEdgeY, litEdgeX, y + 1.8);
        drkB[b].push(x + 1.0, darkEdgeY);
      }
    }
    const bandAtten = [0.13, 0.34, 0.64, 1.04];
    for (let b = 0; b < 4; b++) {
      const lb = litB[b];
      if (!lb.length) continue;
      ctx.fillStyle = `rgba(218, 238, 255, ${clamp(bandAtten[b] * 0.14, 0, 0.19).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < lb.length; i += 4) {
        ctx.rect(lb[i], lb[i + 1], brickW - 3.6, 1.0);
        ctx.rect(lb[i + 2], lb[i + 3], 0.9, brickH - 3.6);
      }
      ctx.fill();
      const db = drkB[b];
      ctx.fillStyle = `rgba(1, 2, 7, ${clamp(bandAtten[b] * 0.42, 0, 0.54).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < db.length; i += 2) {
        ctx.rect(db[i], db[i + 1], brickW - 2, 1.4);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // Soft clipped tapestry glare + deep fold relief driven by outward lightning discharges (no hard stripes/arcs)
  function drawShockTapestryFlash(ctx, W, H, tSec, shockFrame) {
    if (!shockFrame || shockFrame.strikeFlash <= 0.05) return;
    const sFlash = shockFrame.strikeFlash;
    const cx = W * 0.5;
    const tapL = cx - 68;
    const tapR = cx + 68;
    const tapW = tapR - tapL;
    const topY = 8;
    const hemY = 171;
    const lx = cx + shockFrame.jitterX * 1.45;
    const ly = 125 + Math.sin(tSec * 1.8) * 2.2 + shockFrame.jitterY * 1.45;

    ctx.save();
    // Clip cleanly to the exact curved tapestry banner silhouette so nothing bleeds outside margins or hem
    ctx.beginPath();
    ctx.moveTo(tapL, topY);
    ctx.lineTo(tapR, topY);
    ctx.lineTo(tapR, hemY - 3);
    ctx.quadraticCurveTo(cx + 34, hemY + 2, cx, hemY + 3);
    ctx.quadraticCurveTo(cx - 34, hemY + 2, tapL, hemY - 3);
    ctx.closePath();
    ctx.clip();

    // Directional shadow-side sweep across cloth opposite the lightning flash for high contrast
    const awayX = cx - shockFrame.centroidX * 56;
    const awayY = 88 - shockFrame.centroidY * 45;
    const darkSweep = ctx.createRadialGradient(awayX, awayY, 8, awayX, awayY, 130);
    darkSweep.addColorStop(0, `rgba(1, 2, 8, ${clamp(0.42 * sFlash, 0, 0.54).toFixed(3)})`);
    darkSweep.addColorStop(1, 'rgba(1, 2, 8, 0)');
    ctx.fillStyle = darkSweep;
    ctx.fillRect(tapL, topY, tapW, hemY - topY + 6);

    // Subtle soft velvet pleat modulation without harsh vertical bars
    const foldPositions = [tapL + tapW * 0.20, tapL + tapW * 0.42, tapL + tapW * 0.60, tapL + tapW * 0.80];
    const lightSideSign = lx >= cx ? 1 : -1;
    for (let i = 0; i < foldPositions.length; i++) {
      const fx = foldPositions[i];
      const fDist = Math.hypot(fx - lx, 100 - ly);
      const fAtten = Math.pow(clamp(1 - fDist / 165, 0, 1), 1.35) * clamp(sFlash, 0, 1.3);
      if (fAtten <= 0.03) continue;
      const fg = ctx.createLinearGradient(fx - 9, 0, fx + 9, 0);
      fg.addColorStop(0, 'rgba(0, 0, 0, 0)');
      fg.addColorStop(lightSideSign > 0 ? 0.35 : 0.65, `rgba(1, 3, 12, ${(0.20 * fAtten).toFixed(3)})`);
      fg.addColorStop(lightSideSign > 0 ? 0.66 : 0.34, `rgba(205, 232, 255, ${(0.09 * fAtten).toFixed(3)})`);
      fg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(fx - 9, topY, 18, hemY - topY + 6);
    }
    ctx.restore();
  }

  // --- RESTORATION SLOT 1: Deep Black Interior Cast Shadows + Gentle Warm-Gold Screen Overexposure ---
  function drawRestorationWallShadows(ctx, W, H, tSec, analysis) {
    const s0 = analysis && analysis.slot1School;
    if (!s0 || s0.id !== 23) return;
    const cx = W * 0.5;
    const tapW = 142;
    const tapL = cx - tapW * 0.5;
    const tapR = cx + tapW * 0.5;
    const hemY = 172;
    const str = clamp(0.75 + (analysis.powerProfile ? analysis.powerProfile.power : 0.4) * 0.25, 0.75, 1.0);

    ctx.save();
    // Deep black relief drop shadow cast by the hanging tapestry edges onto the stone wall behind it
    const shL = ctx.createLinearGradient(tapL - 15, 0, tapL + 2, 0);
    shL.addColorStop(0, 'rgba(1, 1, 3, 0)');
    shL.addColorStop(0.65, `rgba(1, 1, 3, ${(0.88 * str).toFixed(3)})`);
    shL.addColorStop(1, `rgba(1, 1, 3, ${(0.96 * str).toFixed(3)})`);
    ctx.fillStyle = shL;
    ctx.fillRect(tapL - 15, 0, 17, hemY + 6);

    const shR = ctx.createLinearGradient(tapR - 2, 0, tapR + 15, 0);
    shR.addColorStop(0, `rgba(1, 1, 3, ${(0.96 * str).toFixed(3)})`);
    shR.addColorStop(0.35, `rgba(1, 1, 3, ${(0.88 * str).toFixed(3)})`);
    shR.addColorStop(1, 'rgba(1, 1, 3, 0)');
    ctx.fillStyle = shR;
    ctx.fillRect(tapR - 2, 0, 17, hemY + 6);

    // Deep black drop shadow beneath the tapestry bottom hem
    const shBot = ctx.createLinearGradient(0, hemY - 2, 0, hemY + 14);
    shBot.addColorStop(0, `rgba(1, 1, 3, ${(0.92 * str).toFixed(3)})`);
    shBot.addColorStop(0.55, `rgba(1, 1, 3, ${(0.60 * str).toFixed(3)})`);
    shBot.addColorStop(1, 'rgba(1, 1, 3, 0)');
    ctx.fillStyle = shBot;
    ctx.fillRect(tapL - 6, hemY - 2, tapW + 12, 16);
    ctx.restore();
  }

  function drawRestorationAltarShadows(ctx, W, H, tSec, analysis, candleGeoms, openAmount) {
    const s0 = analysis && analysis.slot1School;
    if (!s0 || s0.id !== 23) return;
    const cx = W * 0.5;
    const spellCy = 125 + Math.sin(tSec * 1.8) * 2.2;
    const str = clamp(0.78 + (analysis.powerProfile ? analysis.powerProfile.power : 0.4) * 0.22, 0.78, 1.0);

    ctx.save();
    // Clip altar cast shadows cleanly to the stone pedestal / red cloth top surface
    ctx.beginPath();
    ctx.rect(0, 166, W, H - 166);
    ctx.clip();

    // 1. Deep black grounded umbra shadow cast outward/forward by the grimoire book's actual cover corners onto the altar cloth
    const openT = clamp(openAmount, 0, 1);
    const farL = lerp(cx - 4, cx - 54, openT);
    const farR = cx + 54;
    const nearL = lerp(cx - 5, cx - 73, openT);
    const nearR = cx + 73;
    const farY = 183;
    const nearY = 237;
    const projCorner = (bx, by, len) => {
      const dx = bx - cx;
      const dy = by - spellCy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: bx + (dx / d) * len, y: by + (dy / d) * len };
    };
    const softFL = projCorner(farL, farY, 10);
    const softFR = projCorner(farR, farY, 10);
    const softNL = projCorner(nearL, nearY, 18);
    const softNR = projCorner(nearR, nearY, 18);

    // Tight soft outer penumbra following the exact trapezoidal book silhouette
    const penGrad = ctx.createLinearGradient(cx, farY - 2, cx, nearY + 20);
    penGrad.addColorStop(0, `rgba(1, 1, 3, ${(0.76 * str).toFixed(3)})`);
    penGrad.addColorStop(0.74, `rgba(1, 1, 3, ${(0.88 * str).toFixed(3)})`);
    penGrad.addColorStop(1, 'rgba(1, 1, 3, 0)');
    ctx.fillStyle = penGrad;
    ctx.beginPath();
    ctx.moveTo(softFL.x, softFL.y);
    ctx.lineTo(softFR.x, softFR.y);
    ctx.lineTo(softNR.x, softNR.y);
    ctx.lineTo(softNL.x, softNL.y);
    ctx.closePath();
    ctx.fill();

    // Crisp deep-black umbra hugging the book base & casting cleanly forward below the lower cover edge
    const coreFL = projCorner(farL, farY, 5.5);
    const coreFR = projCorner(farR, farY, 5.5);
    const coreNL = projCorner(nearL, nearY, 11.5);
    const coreNR = projCorner(nearR, nearY, 11.5);
    ctx.fillStyle = `rgba(1, 1, 3, ${(0.95 * str).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(coreFL.x, coreFL.y);
    ctx.lineTo(coreFR.x, coreFR.y);
    ctx.lineTo(coreNR.x, coreNR.y);
    ctx.lineTo(coreNL.x, coreNL.y);
    ctx.closePath();
    ctx.fill();

    // 2. Crisp radial deep-black shadows cast away from the radiant golden core by all 6 candles on the altar
    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      const sp = CANDLE_LAYOUT[i];
      const dx = sp.x - cx;
      const dy = sp.y - spellCy;
      const dLen = Math.hypot(dx, dy) || 1;
      const ux = dx / dLen;
      const uy = dy / dLen;
      const px = -uy * (sp.r * 1.20);
      const py = ux * (sp.r * 1.20);
      const sLen = clamp(sp.h * 1.35 + 11, 16, 56);
      const ex = sp.x + ux * sLen;
      const ey = sp.y + uy * sLen;

      const cSh = ctx.createLinearGradient(sp.x, sp.y, ex, ey);
      cSh.addColorStop(0, `rgba(1, 1, 3, ${(0.95 * str).toFixed(3)})`);
      cSh.addColorStop(0.58, `rgba(1, 1, 3, ${(0.76 * str).toFixed(3)})`);
      cSh.addColorStop(1, 'rgba(1, 1, 3, 0)');
      ctx.fillStyle = cSh;
      ctx.beginPath();
      ctx.moveTo(sp.x + px, sp.y + py);
      ctx.lineTo(ex + px * 1.55, ey + py * 1.55);
      ctx.lineTo(ex - px * 1.55, ey - py * 1.55);
      ctx.lineTo(sp.x - px, sp.y - py);
      ctx.closePath();
      ctx.fill();

      // Ground contact occlusion right under candle dish / wax base
      ctx.fillStyle = `rgba(1, 1, 3, ${(0.92 * str).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(sp.x + ux * 2.5, sp.y + 1.5, sp.r * 1.65, sp.r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRestorationCandleRimShadows(ctx, W, H, tSec, analysis, candleGeoms) {
    const s0 = analysis && analysis.slot1School;
    if (!s0 || s0.id !== 23) return;
    const cx = W * 0.5;
    // Deep black back-side shadow on the far half of each candle body facing away from the golden light
    ctx.save();
    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      const sp = CANDLE_LAYOUT[i];
      const g = candleGeoms[i];
      if (!g) continue;
      const awaySign = sp.x < cx ? -1 : 1;
      const xStart = sp.x - awaySign * sp.r * 0.25;
      const xEnd = sp.x + awaySign * (sp.r * 1.05);
      const grad = ctx.createLinearGradient(xStart, sp.y, xEnd, sp.y);
      grad.addColorStop(0, 'rgba(1, 1, 3, 0)');
      grad.addColorStop(0.45, 'rgba(1, 1, 3, 0.62)');
      grad.addColorStop(1, 'rgba(1, 1, 3, 0.90)');
      ctx.fillStyle = grad;
      const bx0 = Math.min(xStart, xEnd);
      const bw = Math.abs(xEnd - xStart);
      ctx.fillRect(bx0, sp.y - sp.h - 1, bw, sp.h + 3);
    }
    ctx.restore();
  }

  function drawRestorationScreenVeil(ctx, W, H, tSec, analysis) {
    const slots = (analysis && analysis.slots) || [];
    const restoCount = slots.filter((s) => s && s.id === 23).length;
    if (restoCount <= 0) return;
    const cx = W * 0.5;
    const spellCy = 125 + Math.sin(tSec * 1.8) * 2.2;
    const pulse = 0.94 + 0.06 * Math.sin(tSec * 2.1);
    const pwr = analysis.powerProfile ? analysis.powerProfile.power : 0.4;
    // Ultra-subtle golden screen veil: 10% of original per Restoration row (10% / 20% / 30% for 1 / 2 / 3 rows)
    const veilScale = 0.10 * restoCount * (0.76 + pwr * 0.24) * pulse;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 241, 196, ${(0.042 * veilScale).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);

    const bloomR = 192;
    const bg = ctx.createRadialGradient(cx, spellCy, 8, cx, spellCy, bloomR);
    bg.addColorStop(0, `rgba(255, 248, 218, ${(0.115 * veilScale).toFixed(4)})`);
    bg.addColorStop(0.38, `rgba(252, 216, 98, ${(0.056 * veilScale).toFixed(4)})`);
    bg.addColorStop(0.75, `rgba(245, 178, 42, ${(0.020 * veilScale).toFixed(4)})`);
    bg.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Dark room lightmap compositor:
  //   1) Candles act as visible warm/school-tinted minor light pools around the altar
  //   2) Spell visualization acts as localized colored primary light scaled by active effect count (0..3)
  function applyChamberLightingPass(ctx, W, H, tSec, analysis, candleGeoms, shockFrameArg) {
    const off = getLightmap(W, H);
    const spellProf = analysis.powerProfile;
    const lightMod = getSlot1LightProfile(analysis);
    const shockFrame = shockFrameArg !== undefined ? shockFrameArg : resolveShockFrame(analysis, tSec);
    const sFlash = shockFrame ? shockFrame.strikeFlash : 0;
    const jitX = shockFrame ? shockFrame.jitterX : 0;
    const jitY = shockFrame ? shockFrame.jitterY : 0;
    const cx = W * 0.5;
    const spellCy = 125 + Math.sin(tSec * 1.8) * 2.2;

    if (off) {
      const lw = off.width;
      const lh = off.height;
      const lCtx = off.getContext('2d');
      lCtx.setTransform(1, 0, 0, 1, 0, 0);
      lCtx.globalCompositeOperation = 'source-over';
      lCtx.clearRect(0, 0, lw, lh);
      lCtx.setTransform(lw / W, 0, 0, lh / H, 0, 0);
      // Keep shadows deep and chamber mood restrained uniformly so Restoration veil scales cleanly +10%/+20%/+30% per row
      const roomDarkAlpha = shockFrame
        ? clamp(0.905 - sFlash * 0.08, 0.81, 0.905)
        : 0.87;
      lCtx.fillStyle = `rgba(2, 3, 7, ${roomDarkAlpha.toFixed(3)})`;
      lCtx.fillRect(0, 0, W, H);

      lCtx.globalCompositeOperation = 'destination-out';
      const carveSp = getCandleCarveSprite();

      // Minor light sources: carve dim pools ONLY around candles whose assigned effect slot is active
      for (let i = 0; i < candleGeoms.length; i++) {
        const cAssign = analysis.candleAssignments && analysis.candleAssignments[i];
        const cSchool = cAssign ? cAssign.school : null;
        if (!cSchool) continue;
        const g = candleGeoms[i];
        const minR = 39;
        if (carveSp) {
          lCtx.drawImage(carveSp, g.worldFlameX - minR, g.worldFlameY + 4 - minR, minR * 2, minR * 2);
        } else {
          const cg = lCtx.createRadialGradient(g.worldFlameX, g.worldFlameY + 4, 1.5, g.worldFlameX, g.worldFlameY + 4, minR);
          cg.addColorStop(0, 'rgba(0, 0, 0, 0.64)');
          cg.addColorStop(0.45, 'rgba(0, 0, 0, 0.30)');
          cg.addColorStop(0.78, 'rgba(0, 0, 0, 0.08)');
          cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          lCtx.fillStyle = cg;
          lCtx.beginPath();
          lCtx.arc(g.worldFlameX, g.worldFlameY + 4, minR, 0, Math.PI * 2);
          lCtx.fill();
        }
      }

      // Primary light source (localized strictly around floating spell orb & center book pages, pulsing gently with long bolts)
      if (spellProf.power > 0.01) {
        const baseLightR = spellProf.roomRadius * lightMod.chamberRadiusMult;
        const lightR = shockFrame ? baseLightR * (0.84 + sFlash * 1.18) : baseLightR;
        const baseErase = clamp(spellProf.roomErase * lightMod.chamberEraseMult, 0, 0.96);
        const roomErase = shockFrame ? clamp(baseErase * (0.76 + sFlash * 0.72), 0.24, 0.78) : baseErase;
        const lx = cx + jitX;
        const ly = spellCy + 10 + jitY;

        const sg = lCtx.createRadialGradient(lx, ly, 3, lx, ly, lightR);
        sg.addColorStop(0, `rgba(0, 0, 0, ${roomErase.toFixed(3)})`);
        sg.addColorStop(0.44, `rgba(0, 0, 0, ${(roomErase * 0.50).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lCtx.fillStyle = sg;
        lCtx.beginPath();
        lCtx.arc(lx, ly, lightR, 0, Math.PI * 2);
        lCtx.fill();

        if (shockFrame && sFlash > 0.14) {
          const lobeX = cx + shockFrame.centroidX * 36 + jitX * 1.2;
          const lobeY = spellCy + shockFrame.centroidY * 28 + jitY * 1.2 - 8;
          const lobeR = 58 + sFlash * 78;
          const lobeAlpha = clamp(sFlash * 0.44, 0, 0.56);
          const lg = lCtx.createRadialGradient(lobeX, lobeY, 4, lobeX, lobeY, lobeR);
          lg.addColorStop(0, `rgba(0, 0, 0, ${lobeAlpha.toFixed(3)})`);
          lg.addColorStop(0.50, `rgba(0, 0, 0, ${(lobeAlpha * 0.42).toFixed(3)})`);
          lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          lCtx.fillStyle = lg;
          lCtx.beginPath();
          lCtx.arc(lobeX, lobeY, lobeR, 0, Math.PI * 2);
          lCtx.fill();
        }

        const bookSpotR = shockFrame
          ? spellProf.bookSpotR * lightMod.chamberRadiusMult * (0.86 + sFlash * 0.48)
          : spellProf.bookSpotR * lightMod.chamberRadiusMult;
        const bookErase = shockFrame
          ? clamp(spellProf.bookErase * lightMod.chamberEraseMult * (0.82 + sFlash * 0.48), 0.24, 0.74)
          : clamp(spellProf.bookErase * lightMod.chamberEraseMult, 0, 0.96);
        const bg = lCtx.createRadialGradient(cx + jitX * 0.45, 198 + jitY * 0.25, 4, cx + jitX * 0.45, 198 + jitY * 0.25, bookSpotR);
        bg.addColorStop(0, `rgba(0, 0, 0, ${bookErase.toFixed(3)})`);
        bg.addColorStop(0.55, `rgba(0, 0, 0, ${(bookErase * 0.42).toFixed(3)})`);
        bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lCtx.fillStyle = bg;
        lCtx.beginPath();
        lCtx.arc(cx + jitX * 0.45, 198 + jitY * 0.25, bookSpotR, 0, Math.PI * 2);
        lCtx.fill();
      } else {
        // Faint nocturnal dusk reveal strictly around the stationary closed Oht cover so its silhouette remains discernable
        const idleCx = cx + 24;
        const idleCy = 200;
        const idleR = 76;
        const ig = lCtx.createRadialGradient(idleCx, idleCy, 4, idleCx, idleCy, idleR);
        ig.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
        ig.addColorStop(0.60, 'rgba(0, 0, 0, 0.13)');
        ig.addColorStop(1, 'rgba(0, 0, 0, 0)');
        lCtx.fillStyle = ig;
        lCtx.beginPath();
        lCtx.arc(idleCx, idleCy, idleR, 0, Math.PI * 2);
        lCtx.fill();
      }

      lCtx.globalCompositeOperation = 'source-over';
      lCtx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(2, 3, 7, 0.78)';
      ctx.fillRect(0, 0, W, H);
    }

    // === True Colored Light Filter ('multiply') + Additive Multi-School Specular Cast ('lighter') ===
    if (analysis.activeCount > 0 && spellProf.power > 0.01) {
      // Blend RGB of active effects, preserving saturation cleanly
      let sumR = 0, sumG = 0, sumB = 0;
      analysis.active.forEach((item) => {
        const [r, g, b] = parseRgb(item.school.glowRgb);
        sumR += r;
        sumG += g;
        sumB += b;
      });
      const cnt = analysis.active.length;
      const avgR = Math.round(sumR / cnt);
      const avgG = Math.round(sumG / cnt);
      const avgB = Math.round(sumB / cnt);

      // Tint cream parchment, cloth & tapestry inside the spell cone directly via 'multiply'
      // so white paper radiates the actual school color rather than neutral beige daylight.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const mulR = Math.max(spellProf.roomRadius, spellProf.bookSpotR) * lightMod.chamberRadiusMult * (shockFrame ? (1.08 + sFlash * 0.70) : 1.12);
      const colorTint = clamp(spellProf.colorTint * (lightMod.washMult < 1 ? 0.92 : (lightMod.washMult > 1 ? 1.06 : 1.0)), 0, 0.96);
      const mg = ctx.createRadialGradient(cx + jitX * 0.6, 174 + jitY * 0.4, 6, cx + jitX * 0.6, 174 + jitY * 0.4, mulR);
      mg.addColorStop(0, `rgba(${avgR}, ${avgG}, ${avgB}, ${colorTint.toFixed(3)})`);
      mg.addColorStop(0.62, `rgba(${avgR}, ${avgG}, ${avgB}, ${(colorTint * 0.55).toFixed(3)})`);
      mg.addColorStop(1, `rgba(${avgR}, ${avgG}, ${avgB}, 0)`);
      ctx.fillStyle = mg;
      ctx.fillRect(cx + jitX * 0.6 - mulR, 174 + jitY * 0.4 - mulR, mulR * 2, mulR * 2);

      // Additional shifted multi-school chromatic gel lobes when 2 or 3 effects combine
      if (analysis.distinctCount >= 2) {
        analysis.active.forEach((item, idx) => {
          const [sr, sg, sb] = parseRgb(item.school.glowRgb);
          const offX = item.slotIndex === 1 ? -26 : (item.slotIndex === 2 ? 26 : 0);
          const lobeR = mulR * 0.62;
          const lg = ctx.createRadialGradient(cx + offX, 192, 2, cx + offX, 192, lobeR);
          lg.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.42)`);
          lg.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
          ctx.fillStyle = lg;
          ctx.fillRect(cx + offX - lobeR, 192 - lobeR, lobeR * 2, lobeR * 2);
        });
      }
      ctx.restore();
    }

    // Additive bounced light highlights from each active candle (in its own effect's school color) + per-slot spell washes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      const cAssign = analysis.candleAssignments && analysis.candleAssignments[i];
      const cSchool = cAssign ? cAssign.school : null;
      if (!cSchool) continue;
      const sp = CANDLE_LAYOUT[i];
      const g = candleGeoms[i];
      const minGlowR = 26;
      const cg = ctx.createRadialGradient(g.worldFlameX, sp.y - sp.h * 0.35, 1, sp.x, sp.y - 4, minGlowR);
      cg.addColorStop(0, `rgba(${cSchool.glowRgb}, 0.14)`);
      cg.addColorStop(0.55, `rgba(${cSchool.accentRgb}, 0.055)`);
      cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - 4, minGlowR, 0, Math.PI * 2);
      ctx.fill();
    }
    if (analysis.activeCount > 0 && spellProf.colorWash > 0.01) {
      const nAct = analysis.active.length;
      const perWash = (spellProf.colorWash * lightMod.washMult) / Math.max(1, nAct * 0.72);
      const bWashR = (spellProf.bookSpotR * lightMod.chamberRadiusMult) * (shockFrame ? (0.95 + sFlash * 0.55) : 0.95);
      const wAmp = shockFrame ? (0.65 + sFlash * 0.95) : 1.0;
      analysis.active.forEach((item) => {
        const offX = item.slotIndex === 1 ? -18 : (item.slotIndex === 2 ? 18 : 0);
        const targetY = 194;
        const wx = cx + offX + jitX * 0.35;
        const wy = targetY + jitY * 0.25;
        const wg = ctx.createRadialGradient(wx, wy, 3, wx, wy, bWashR);
        wg.addColorStop(0, `rgba(${item.school.glowRgb}, ${clamp(perWash * wAmp, 0, 0.75).toFixed(3)})`);
        wg.addColorStop(0.55, `rgba(${item.school.accentRgb}, ${clamp(perWash * 0.35 * wAmp, 0, 0.45).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = wg;
        ctx.fillRect(wx - bWashR, wy - bWashR, bWashR * 2, bWashR * 2);
      });
    }
    if (shockFrame && sFlash > 0.14) {
      const wallFlashX = cx + shockFrame.centroidX * 24 + jitX * 1.2;
      const wallFlashY = 104 + shockFrame.centroidY * 18 + jitY * 1.1;
      const wallFlashR = 66 + sFlash * 72;
      const wfGrad = ctx.createRadialGradient(wallFlashX, wallFlashY, 4, wallFlashX, wallFlashY, wallFlashR);
      wfGrad.addColorStop(0, `rgba(218, 238, 255, ${clamp(sFlash * 0.11, 0, 0.14).toFixed(3)})`);
      wfGrad.addColorStop(0.44, `rgba(140, 198, 255, ${clamp(sFlash * 0.055, 0, 0.08).toFixed(3)})`);
      wfGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = wfGrad;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // === Modular Spell Manifestation ("Тушка спелла") Floating Above the Book ===
  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  function easeOutCubic(t) {
    const u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
  }

  // Dedicated 2D + zero-filter pyramid Bloom SFX offscreen buffers.
  // 240x240 gives generous transparent margin so outer lightning bolts, frost mist, and toxic plumes never hit a square border.
  // Using bilinear mip-pyramid downsampling (240 -> 120 -> 60 -> 240) instead of ctx.filter='blur(...)' eliminates
  // Chromium/Electron Skia Graphite GPU stalls, blur-rect clipping, and stale-buffer tracer artifacts completely.
  const SFX_BUF_SIZE = 240;
  let _sfxCanvas = null;
  let _sfxBloomCanvas = null;
  let _sfxBloomQuarter = null;
  let _magmaCanvas = null;
  let _magmaLut = null;
  let _miniMagmaCanvas = null;
  let _miniMagmaLut = null;
  let _miasmaCanvas = null;
  let _miasmaBuf = null;
  let _miasmaCacheKey = '';

  function getSfxBuffers() {
    if (typeof document === 'undefined') return null;
    if (!_sfxCanvas) {
      _sfxCanvas = document.createElement('canvas');
      _sfxCanvas.width = SFX_BUF_SIZE;
      _sfxCanvas.height = SFX_BUF_SIZE;
    }
    if (!_sfxBloomCanvas) {
      _sfxBloomCanvas = document.createElement('canvas');
      _sfxBloomCanvas.width = SFX_BUF_SIZE >> 1;
      _sfxBloomCanvas.height = SFX_BUF_SIZE >> 1;
    }
    if (!_sfxBloomQuarter) {
      _sfxBloomQuarter = document.createElement('canvas');
      _sfxBloomQuarter.width = SFX_BUF_SIZE >> 2;
      _sfxBloomQuarter.height = SFX_BUF_SIZE >> 2;
    }
    return { main: _sfxCanvas, bloom: _sfxBloomCanvas, quarter: _sfxBloomQuarter };
  }

  function renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, bloomBoost, drawLocalFn) {
    const bufs = getSfxBuffers();
    if (!bufs) {
      drawLocalFn(ctx, cx, cy);
      return;
    }
    const half = SFX_BUF_SIZE * 0.5;
    const sCtx = bufs.main.getContext('2d');
    const bCtx = bufs.bloom.getContext('2d');
    const qCtx = bufs.quarter.getContext('2d');

    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.globalCompositeOperation = 'source-over';
    sCtx.globalAlpha = 1;
    if ('filter' in sCtx && sCtx.filter !== 'none') sCtx.filter = 'none';
    sCtx.clearRect(0, 0, SFX_BUF_SIZE, SFX_BUF_SIZE);
    drawLocalFn(sCtx, half, half);

    // 2-stage bilinear pyramid downsample (240 -> 120 -> 60): true ~4.4px soft Gaussian halo with ZERO ctx.filter!
    const bw = bufs.bloom.width;
    const bh = bufs.bloom.height;
    bCtx.setTransform(1, 0, 0, 1, 0, 0);
    bCtx.globalCompositeOperation = 'source-over';
    bCtx.globalAlpha = 1;
    bCtx.imageSmoothingEnabled = true;
    bCtx.clearRect(0, 0, bw, bh);
    bCtx.drawImage(bufs.main, 0, 0, bw, bh);

    const qw = bufs.quarter.width;
    const qh = bufs.quarter.height;
    qCtx.setTransform(1, 0, 0, 1, 0, 0);
    qCtx.globalCompositeOperation = 'source-over';
    qCtx.globalAlpha = 1;
    qCtx.imageSmoothingEnabled = true;
    qCtx.clearRect(0, 0, qw, qh);
    qCtx.drawImage(bufs.bloom, 0, 0, qw, qh);

    const ox = cx - half;
    const oy = cy - half;
    const baseA = clamp((0.36 + power * 0.24) * bloomBoost, 0.22, 0.85);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(baseA * 0.78, 0.14, 0.76);
    ctx.drawImage(bufs.quarter, ox, oy, SFX_BUF_SIZE, SFX_BUF_SIZE);
    ctx.globalAlpha = clamp(baseA * 0.42, 0.08, 0.46);
    ctx.drawImage(bufs.bloom, ox, oy, SFX_BUF_SIZE, SFX_BUF_SIZE);
    ctx.restore();

    ctx.drawImage(bufs.main, ox, oy);
  }

  // --- DESTRUCTION SLOT 1 (0 & 4): Shared 3D Procedural Magma Droplet + Flame Plumes ---
  // Uses a fast 44x44 pixel LUT for rotating 3D lava crust & incandescent cracks + layered tongues of fire.
  function getMagmaPalette(isMagic) {
    return isMagic
      ? {
        // High-contrast deep abyssal volcanic crust & searing cyan-white arcane magma veins
        crust: [2, 5, 22],
        rim: [14, 34, 112],
        warm: [32, 130, 248],
        hot: [108, 222, 255],
        white: [244, 253, 255],
        flameOut: '23, 37, 132',
        flameMid: '42, 156, 255',
        flameIn: '224, 248, 255',
        spark: '165, 228, 255',
      }
      : {
        // High-contrast dark basalt magma crust & intense golden-white molten fissures
        crust: [12, 2, 1],
        rim: [92, 14, 4],
        warm: [234, 68, 8],
        hot: [253, 186, 62],
        white: [255, 254, 232],
        flameOut: '153, 20, 16',
        flameMid: '249, 115, 22',
        flameIn: '254, 249, 195',
        spark: '254, 215, 140',
      };
  }

  function buildMagmaLutForSize(size, rad) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const mCtx = c.getContext('2d');
    const img = mCtx.createImageData(size, size);
    const half = size * 0.5;
    const pts = [];
    for (let py = 0; py < size; py++) {
      const dy = (py - half + 0.5) / rad;
      for (let px = 0; px < size; px++) {
        const dx = (px - half + 0.5) / rad;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 1.25) {
          pts.push({
            off: (py * size + px) * 4,
            dx,
            dy,
            r: Math.sqrt(r2),
            ang: Math.atan2(dy, dx),
          });
        }
      }
    }
    return { canvas: c, ctx: mCtx, lut: { size, half, rad, img, buf32: new Uint32Array(img.data.buffer), pts } };
  }

  function ensureMagmaResources() {
    if (typeof document === 'undefined') return null;
    if (!_magmaCanvas || !_magmaLut) {
      const res = buildMagmaLutForSize(44, 18.5);
      _magmaCanvas = res.canvas;
      _magmaLut = res.lut;
    }
    return { canvas: _magmaCanvas, ctx: _magmaCanvas.getContext('2d'), lut: _magmaLut };
  }

  const _fireGasSpriteCache = new Map();
  function getFireRadialSprite(kind, isMagic) {
    const key = `${kind}_${isMagic ? 1 : 0}`;
    if (_fireGasSpriteCache.has(key)) return _fireGasSpriteCache.get(key);
    const cv = createOffscreenCanvas(48, 48);
    if (!cv) return null;
    const c = cv.getContext('2d');
    const pal = getMagmaPalette(isMagic);
    const g = c.createRadialGradient(24, 24, 0.5, 24, 24, 23.5);
    if (kind === 'gas') {
      g.addColorStop(0, `rgba(${pal.flameIn}, 0.72)`);
      g.addColorStop(0.38, `rgba(${pal.flameMid}, 1)`);
      g.addColorStop(0.75, `rgba(${pal.flameOut}, 0.55)`);
      g.addColorStop(1, `rgba(${pal.flameOut}, 0)`);
    } else if (kind === 'dropGlow') {
      g.addColorStop(0, `rgba(${pal.flameMid}, 0.42)`);
      g.addColorStop(0.5, `rgba(${pal.flameOut}, 0.18)`);
      g.addColorStop(1, `rgba(${pal.flameOut}, 0)`);
    } else {
      g.addColorStop(0, `rgba(${pal.flameIn}, 1)`);
      g.addColorStop(0.45, `rgba(${pal.spark}, 0.55)`);
      g.addColorStop(1, `rgba(${pal.flameOut}, 0)`);
    }
    c.fillStyle = g;
    c.beginPath();
    c.arc(24, 24, 23.5, 0, Math.PI * 2);
    c.fill();
    _fireGasSpriteCache.set(key, cv);
    return cv;
  }

  let _miniMagmaPool = null;
  let _miniMagmaPoolKey = '';
  function ensureMiniMagmaPool(tSec, globalMult, pal, isMagic) {
    if (typeof document === 'undefined') return null;
    if (!_miniMagmaPool) {
      _miniMagmaPool = [];
      for (let v = 0; v < 6; v++) _miniMagmaPool.push(buildMagmaLutForSize(20, 7.6));
    }
    const qTick = Math.floor(tSec * 24);
    const frameKey = `${isMagic ? 1 : 0}|${qTick}|${globalMult.toFixed(2)}`;
    if (_miniMagmaPoolKey !== frameKey) {
      _miniMagmaPoolKey = frameKey;
      const qT = qTick / 24;
      for (let v = 0; v < 6; v++) {
        const entry = _miniMagmaPool[v];
        fillMagmaSphereLut(
          entry.lut,
          qT * 0.55 * globalMult + v * 1.67,
          0.3 * Math.sin(qT * 0.4 * globalMult + v) + v * 0.5,
          qT * 0.34 * globalMult + v * 0.9,
          pal,
          qT + v * 0.4,
          false,
        );
        entry.ctx.putImageData(entry.lut.img, 0, 0);
      }
    }
    return _miniMagmaPool;
  }

  function ensureMiniMagmaResources() {
    if (typeof document === 'undefined') return null;
    if (!_miniMagmaCanvas || !_miniMagmaLut) {
      const res = buildMagmaLutForSize(20, 7.6);
      _miniMagmaCanvas = res.canvas;
      _miniMagmaLut = res.lut;
    }
    return { canvas: _miniMagmaCanvas, ctx: _miniMagmaCanvas.getContext('2d'), lut: _miniMagmaLut };
  }

  function packAbgrColor(r, g, b, a) {
    return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }

  function fillMagmaSphereLut(lut, yaw, pitch, drift, pal, tSec, dropletTaper) {
    lut.buf32.fill(0);
    const cyY = Math.cos(yaw), syY = Math.sin(yaw);
    const cpP = Math.cos(pitch), spP = Math.sin(pitch);

    for (let i = 0; i < lut.pts.length; i++) {
      const pt = lut.pts[i];
      const ang = pt.ang;
      const rEdge = 0.78 + (dropletTaper ? 0.085 * pt.dy : 0.03 * pt.dy)
        + 0.045 * Math.sin(3 * ang - tSec * 2.4)
        + 0.032 * Math.cos(2 * ang + tSec * 3.6);
      const normR = pt.r / rEdge;
      if (normR > 1.0) continue;

      const nz = Math.sqrt(Math.max(0, 1.0 - normR * normR));
      const sx = pt.dx / rEdge;
      const sy = pt.dy / rEdge;

      const rx = sx * cyY + nz * syY;
      const rz0 = -sx * syY + nz * cyY;
      const ry = sy * cpP - rz0 * spP;
      const rz = sy * spP + rz0 * cpP;

      const n1 = Math.sin(rx * 4.6 + Math.cos(ry * 4.1 - drift + rz * 3.2))
        + Math.cos((ry - drift * 0.4) * 5.0 - rz * 4.4);
      const n2 = Math.sin(rz * 8.2 - rx * 7.1 + Math.cos(ry * 7.5 + drift));
      const r1Base = clamp(1.0 - Math.abs(n1) * 0.56, 0, 1);
      const ridge1 = r1Base * r1Base * (0.86 + 0.14 * r1Base);
      const r2Base = clamp(1.0 - Math.abs(n2) * 0.86, 0, 1);
      const r2Sq = r2Base * r2Base;
      const ridge2 = r2Sq * (0.35 + 0.65 * r2Base);

      const fissure = clamp(ridge1 * 1.06 + ridge2 * 0.62, 0, 1);
      const centerGlow = 0.08 * nz + 0.06 * Math.max(0, pt.dy);
      const eBase = clamp(1.0 - nz, 0, 1);
      const edgeRim = eBase * eBase * eBase * 0.36;
      const heat = clamp(fissure * (0.90 + 0.32 * nz) + centerGlow + edgeRim * 0.52 - 0.08, 0, 1);

      let cr, cg, cb;
      if (heat < 0.35) {
        const u = heat / 0.35;
        cr = lerp(pal.crust[0], pal.rim[0], u);
        cg = lerp(pal.crust[1], pal.rim[1], u);
        cb = lerp(pal.crust[2], pal.rim[2], u);
      } else if (heat < 0.65) {
        const u = (heat - 0.35) / 0.30;
        cr = lerp(pal.rim[0], pal.warm[0], u);
        cg = lerp(pal.rim[1], pal.warm[1], u);
        cb = lerp(pal.rim[2], pal.warm[2], u);
      } else if (heat < 0.88) {
        const u = (heat - 0.65) / 0.23;
        cr = lerp(pal.warm[0], pal.hot[0], u);
        cg = lerp(pal.warm[1], pal.hot[1], u);
        cb = lerp(pal.warm[2], pal.hot[2], u);
      } else {
        const u = (heat - 0.88) / 0.12;
        cr = lerp(pal.hot[0], pal.white[0], u);
        cg = lerp(pal.hot[1], pal.white[1], u);
        cb = lerp(pal.hot[2], pal.white[2], u);
      }
      const alpha = normR > 0.88 ? clamp((1.0 - normR) / 0.12, 0, 1) * 255 : 255;
      lut.buf32[pt.off >> 2] = packAbgrColor(cr, cg, cb, alpha);
    }
  }

  function drawMagmaDropCore(ctx, scx, scy, baseR, tSec, power, isMagic, rotMult = 1) {
    const pal = getMagmaPalette(isMagic);
    const mRes = ensureMagmaResources();
    const dropScale = (baseR * 0.68) / 14.5 * clamp(0.84 + power * 0.18, 0.84, 1.05);

    // 1. Back roaring wavy flame plumes rising gracefully with stronger internal tonal contrast
    const flameRise = 1.0 + power * 0.24;
    for (let layer = 0; layer < 2; layer++) {
      const isOuter = layer === 0;
      const tongues = isOuter ? 8 : 6;
      for (let i = 0; i < tongues; i++) {
        const frac = i / tongues;
        const spread = (frac - 0.5) * 2.0 + 0.12 * Math.sin(tSec * 4.4 + i * 2.1);
        const bx = scx + spread * (isOuter ? 9.0 : 6.2) * dropScale;
        const by = scy + (Math.abs(spread) * 4.2 - 1.5) * dropScale;
        const h = ((isOuter ? 20.5 : 15.8) + (1 - Math.abs(spread)) * 8.5 + Math.sin(tSec * 8.2 + i * 2.4) * 3.6) * flameRise * dropScale;
        const waveMid = Math.sin(tSec * 6.8 + i * 2.2 + layer) * 3.6 * dropScale;
        const tipX = bx + (Math.sin(tSec * 5.9 + i * 1.7 + layer) * 4.2 - spread * 2.3) * dropScale;
        const tipY = by - h;
        const w = (isOuter ? 4.5 : 3.3) * (1 - Math.abs(spread) * 0.30) * dropScale;

        const fGrad = ctx.createLinearGradient(bx, by + 2 * dropScale, tipX, tipY);
        if (isOuter) {
          fGrad.addColorStop(0, `rgba(${pal.flameOut}, 0.82)`);
          fGrad.addColorStop(0.50, `rgba(${pal.flameMid}, 0.44)`);
          fGrad.addColorStop(1, `rgba(${pal.flameOut}, 0)`);
        } else {
          fGrad.addColorStop(0, `rgba(${pal.flameMid}, 0.96)`);
          fGrad.addColorStop(0.42, `rgba(${pal.flameIn}, 0.82)`);
          fGrad.addColorStop(1, `rgba(${pal.flameMid}, 0)`);
        }
        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.moveTo(bx - w, by + 2.5 * dropScale);
        ctx.bezierCurveTo(
          bx - w * 1.1 + waveMid * 0.5, by - h * 0.38,
          tipX - w * 0.38 - waveMid * 0.35, tipY + h * 0.32,
          tipX, tipY
        );
        ctx.bezierCurveTo(
          tipX + w * 0.38 - waveMid * 0.35, tipY + h * 0.34,
          bx + w * 1.1 + waveMid * 0.5, by - h * 0.34,
          bx + w, by + 2.5 * dropScale
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Real-time 3D procedural magma sphere LUT (rotating crust plates & incandescent veins)
    if (mRes) {
      const { lut, ctx: mCtx, canvas: mCanvas } = mRes;
      const rotT = tSec * rotMult;
      const yaw = rotT * 0.58;
      const pitch = 0.28 + Math.sin(rotT * 0.41) * 0.22;
      fillMagmaSphereLut(lut, yaw, pitch, rotT * 0.38, pal, tSec, true);
      mCtx.putImageData(lut.img, 0, 0);
      const drawW = lut.size * dropScale;
      ctx.drawImage(mCanvas, scx - drawW * 0.5, scy + 2.5 * dropScale - drawW * 0.5, drawW, drawW);
    }

    // 3. Thin curling side flame ribbons hugging left/right magma shoulders without obscuring central lava fissures
    for (let i = 0; i < 4; i++) {
      const sideSign = i < 2 ? -1 : 1;
      const tier = i % 2;
      const sx0 = scx + sideSign * (7.2 - tier * 1.4) * dropScale;
      const sy0 = scy + (4.8 - tier * 3.2) * dropScale;
      const fh = (10.5 + tier * 3.5 + Math.sin(tSec * 8.4 + i * 2.3) * 2.8) * dropScale;
      const tipX = sx0 + (Math.sin(tSec * 7.1 + i * 1.7) * 2.6 - sideSign * 2.4) * dropScale;
      const gWisp = ctx.createLinearGradient(sx0, sy0, tipX, sy0 - fh);
      gWisp.addColorStop(0, `rgba(${pal.flameMid}, 0.72)`);
      gWisp.addColorStop(0.55, `rgba(${pal.flameIn}, 0.55)`);
      gWisp.addColorStop(1, `rgba(${pal.flameIn}, 0)`);
      ctx.fillStyle = gWisp;
      ctx.beginPath();
      ctx.moveTo(sx0 - 1.5 * dropScale, sy0);
      ctx.quadraticCurveTo(sx0 + sideSign * 2.2 * dropScale, sy0 - fh * 0.55, tipX, sy0 - fh);
      ctx.quadraticCurveTo(sx0 + 0.6 * dropScale, sy0 - fh * 0.45, sx0 + 1.5 * dropScale, sy0);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Rising incandescent embers / sparks escaping upwards from the flame
    for (let k = 0; k < 9; k++) {
      const spd = 0.72 + (k % 3) * 0.21;
      const life = (tSec * spd + k * 0.31) % 1;
      const seed = Math.floor(tSec * spd + k * 0.31);
      const xDrift = (hash01(seed * 13 + k) - 0.5) * 18 + Math.sin(tSec * 5.2 + k) * 2.5;
      const ex = scx + xDrift * (0.4 + life * 0.7) * dropScale;
      const ey = scy + 2.0 * dropScale - life * 32 * dropScale;
      const al = Math.sin(life * Math.PI) * 0.92;
      ctx.fillStyle = `rgba(${pal.spark}, ${al.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ex, ey, (1.35 - life * 0.85) * dropScale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- DESTRUCTION SLOT 2/3 (0 & 4): Tumbling 3D Magma Ring + Superheated Gas + Calm Embers or 3-Effect Grinder Spark Spray ---
  function drawDestructionSlot2MagmaOrbit(ctx, cx, cy, baseR, tSec, power, isMagic, passPhase, ringSlotIdx = 1, activeCount = 1) {
    const pal = getMagmaPalette(isMagic);
    const mRes = ensureMiniMagmaResources();
    const basis = computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
    const spinT = tSec * basis.spinMult;
    const isOuter = ringSlotIdx === 2;
    const isOverdrive = (activeCount || 0) >= 3;
    const scaleM = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04) * (isOuter ? 0.96 : 1.0);
    const thetaShift = isOuter ? 0.42 : 0.0;
    const items = [];

    // 1. Shimmering ring cloud of superheated gas surrounding the magma droplets (nimble gaseous inertia hugs ring line)
    const elTag = isMagic ? 'mm' : 'mf';
    const NUM_GAS = isOuter ? 26 : 22;
    for (let g = 0; g < NUM_GAS; g++) {
      const baseAngle = (g / NUM_GAS) * Math.PI * 2 + thetaShift + (hash01(g * 17 + 9) - 0.5) * 0.28;
      const radOff = (hash01(g * 23 + 5) - 0.5) * 7.8 * scaleM;
      const axOff = (hash01(g * 31 + 13) - 0.5) * 3.0 * scaleM + Math.sin(tSec * 1.35 + g * 1.7) * 1.1 * scaleM;
      const gasSizeNorm = hash01(g * 43) * 0.55;
      const proj = computeInertialRingPiece({
        baseR, tSec, power, ringSlotIdx, activeCount,
        baseAngle, angRate: 0.24, radOff, axOff,
        sizeNorm: gasSizeNorm, pieceSeed: g * 17 + 101,
        pieceKey: `${elTag}_gas_${ringSlotIdx}_${g}`,
        swingGain: 0.35, basisNow: basis,
      });
      const isBack = proj.z < 0;
      if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;
      items.push({ kind: 'gas', g, sx: cx + proj.dx, sy: cy + proj.dy, z: proj.z, persp: proj.persp, isBack });
    }

    // 2. Varied-size procedural 3D magma droplets moving with size-dependent 3D momentum & steering inertia
    const NUM_DROPS = isOuter ? 13 : 11;
    for (let i = 0; i < NUM_DROPS; i++) {
      const dropSizeNorm = Math.pow(hash01(i * 41 + 3), 1.10);
      const sizeMult = (isOuter ? 0.88 : 1.0) * (0.38 + dropSizeNorm * 0.72);
      const baseAngle = (i / NUM_DROPS) * Math.PI * 2 + thetaShift + (hash01(i * 19 + 7) - 0.5) * 0.34;
      const radOff = (hash01(i * 31 + 11) - 0.5) * 5.2 * scaleM;
      const axOff = Math.sin(tSec * 1.45 + i * 2.1) * 2.2 * scaleM;
      const proj = computeInertialRingPiece({
        baseR, tSec, power, ringSlotIdx, activeCount,
        baseAngle, angRate: 0.28, radOff, axOff,
        sizeNorm: dropSizeNorm, pieceSeed: i * 19 + 7,
        pieceKey: `${elTag}_drp_${ringSlotIdx}_${i}`,
        swingGain: 1.0, basisNow: basis,
      });
      const isBack = proj.z < 0;
      if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;

      items.push({
        kind: 'drop',
        i,
        sx: cx + proj.dx,
        sy: cy + proj.dy,
        z: proj.z,
        persp: proj.persp,
        sizeMult,
        speedRatio: proj.speedRatio,
        vx: proj.vx,
        vy: proj.vy,
        isBack,
      });
    }

    // 3. Embers/sparks: calm floating embers (<3 effects) OR dense high-velocity angle-grinder spark fan ("как из болгарки", >=3 effects).
    // Sparks fly in the trailing (-theta) tangential direction opposite to the droplets' (+theta) motion around the ring.
    const NUM_SPARKS = isOverdrive ? (isOuter ? 48 : 42) : 14;
    for (let s = 0; s < NUM_SPARKS; s++) {
      if (isOverdrive) {
        const period = (isOuter ? 0.36 : 0.30) + (s % 5) * 0.055;
        const phase = ((tSec / period) + s * 0.173) % 1;
        const seed = Math.floor(tSec / period + s * 0.173);
        const spawnTheta = ((s / NUM_SPARKS) * Math.PI * 2) + (seed * 0.61) + spinT * 0.28 + thetaShift;
        const flyDist = (13.0 + hash01(seed * 19 + s * 7) * 19.5) * scaleM;
        const tangSweep = (0.48 + hash01(seed * 31 + s * 11) * 0.38) * (isOuter ? 0.92 : 1.0);
        const axSlope = (hash01(seed * 41 + s * 3) - 0.5) * 9.0 * scaleM;
        const radJitter = (hash01(seed * 29 + s) - 0.5) * 3.8 * scaleM;

        const tailPhase = Math.max(0, phase - 0.14);
        const flyNow = Math.pow(phase, 0.84);
        const flyPrev = Math.pow(tailPhase, 0.84);

        const projNow = basis.projectOffset(
          basis.ringR,
          spawnTheta - flyNow * tangSweep,
          radJitter + flyNow * flyDist,
          axSlope * flyNow
        );
        const projPrev = basis.projectOffset(
          basis.ringR,
          spawnTheta - flyPrev * tangSweep,
          radJitter + flyPrev * flyDist,
          axSlope * flyPrev
        );
        const isBack = projNow.z < 0;
        if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;

        const sparkAlpha = clamp((phase < 0.12 ? phase / 0.12 : 1.0 - Math.pow((phase - 0.12) / 0.88, 1.35)) * 1.05, 0, 1);
        if (sparkAlpha < 0.06) continue;

        items.push({
          kind: 'grinderSpark',
          s,
          sx: cx + projNow.dx,
          sy: cy + projNow.dy,
          px: cx + projPrev.dx,
          py: cy + projPrev.dy,
          z: projNow.z,
          persp: projNow.persp,
          isBack,
          alpha: sparkAlpha,
          r: (0.72 + hash01(s * 53 + seed) * 0.55) * (1.0 - phase * 0.28),
        });
      } else {
        const period = 3.2 + (s % 5) * 0.65;
        const phase = ((tSec / period) + s * 0.213) % 1;
        const seed = Math.floor(tSec / period + s * 0.213);
        const willEscape = hash01(seed * 37 + s * 13) > 0.44;
        const sparkSizeNorm = hash01(s * 53 + seed) * 0.42;

        const baseAngle = (s / NUM_SPARKS) * Math.PI * 2 + thetaShift;
        const radJitter = (hash01(seed * 29 + s) - 0.5) * 5.0 * scaleM;
        const axJitter = Math.sin(tSec * 1.6 + s * 2.3) * 2.1 * scaleM;

        let escFrac = 0;
        if (willEscape && phase > 0.62) {
          escFrac = (phase - 0.62) / 0.38;
        }
        const radTotal = radJitter + escFrac * (7.5 + hash01(seed * 19 + s) * 6.5) * scaleM;
        // Orbiting embers move with light spark inertia toward the ring line; escaping embers trail backward (-escFrac * 0.34)
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle: baseAngle - escFrac * 0.34,
          angRate: 0.26 - (s % 3) * 0.03,
          radOff: radTotal,
          axOff: axJitter,
          sizeNorm: sparkSizeNorm,
          pieceSeed: s * 53 + 17,
          pieceKey: `${elTag}_sp_${ringSlotIdx}_${s}`,
          swingGain: 0.55,
          basisNow: basis,
        });
        const driftSy = proj.dy - escFrac * (6.5 + hash01(seed * 11 + s) * 5.0) * scaleM;
        const isBack = proj.z < 0;
        if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;

        const sparkAlpha = willEscape && phase > 0.62
          ? clamp(1.0 - Math.pow(escFrac, 1.4), 0, 1) * 0.90
          : (0.62 + 0.32 * Math.sin(phase * Math.PI * 2 + s));
        if (sparkAlpha < 0.05) continue;

        items.push({
          kind: 'spark',
          s,
          sx: cx + proj.dx,
          sy: cy + driftSy,
          z: proj.z,
          persp: proj.persp,
          isBack,
          alpha: sparkAlpha,
          r: (0.68 + sparkSizeNorm * 1.30) * (1.0 - escFrac * 0.35),
        });
      }
    }

    if (items.length === 0) return;
    items.sort((a, b) => a.z - b.z);

    const gasSprite = getFireRadialSprite('gas', isMagic);
    const dropGlowSprite = getFireRadialSprite('dropGlow', isMagic);
    const sparkSprite = getFireRadialSprite('spark', isMagic);
    const miniPool = ensureMiniMagmaPool(tSec, basis.globalMult, pal, isMagic);

    ctx.save();
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (it.kind === 'gas') {
        const vr = (5.6 + 2.4 * hash01(it.g * 43)) * it.persp * scaleM;
        const pulseA = 0.14 + 0.06 * Math.sin(tSec * 2.2 + it.g * 1.8);
        const a = clamp(pulseA * (it.isBack ? 0.64 : 1.0), 0.06, 0.24);
        if (gasSprite) {
          ctx.globalAlpha = a;
          ctx.drawImage(gasSprite, it.sx - vr, it.sy - vr, vr * 2, vr * 2);
          ctx.globalAlpha = 1.0;
        }
      } else if (it.kind === 'grinderSpark') {
        const sr = it.r * it.persp * scaleM;
        const depthDim = it.isBack ? 0.66 : 1.0;
        const al = clamp(it.alpha * depthDim, 0, 1);

        // Velocity streak trail ("как из болгарки") — crisp 2-stage streak without per-spark gradient allocation
        const midX = (it.px + it.sx) * 0.5;
        const midY = (it.py + it.sy) * 0.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${pal.spark}, ${(al * 0.42).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.75, sr * 1.15);
        ctx.beginPath();
        ctx.moveTo(it.px, it.py);
        ctx.lineTo(it.sx, it.sy);
        ctx.stroke();

        ctx.strokeStyle = `rgba(${pal.flameIn}, ${(al * 0.90).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.55, sr * 0.85);
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(it.sx, it.sy);
        ctx.stroke();

        // White-hot / bright leading spark core
        ctx.fillStyle = `rgba(${pal.flameIn}, ${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(it.sx, it.sy, Math.max(0.55, sr * 0.85), 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === 'spark') {
        const sr = it.r * it.persp * scaleM;
        const depthDim = it.isBack ? 0.65 : 1.0;
        const al = clamp(it.alpha * depthDim, 0, 1);
        const haloR = sr * 2.8;
        if (sparkSprite) {
          ctx.globalAlpha = al;
          ctx.drawImage(sparkSprite, it.sx - haloR, it.sy - haloR, haloR * 2, haloR * 2);
          ctx.globalAlpha = 1.0;
        }
        ctx.fillStyle = `rgba(${pal.flameIn}, ${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(it.sx, it.sy, Math.max(0.45, sr * 0.82), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const dr = it;
        const depthAlpha = dr.isBack ? clamp(0.70 + (dr.persp - 0.78) * 0.65, 0.62, 0.88) : 1.0;
        const sc = dr.sizeMult * dr.persp * 0.46;

        // Soft localized ember glow behind mini magma drop (pre-baked radial sprite)
        const glowR = 9.5 * sc * 1.65;
        if (dropGlowSprite) {
          ctx.globalAlpha = depthAlpha;
          ctx.drawImage(dropGlowSprite, dr.sx - glowR, dr.sy - glowR, glowR * 2, glowR * 2);
          ctx.globalAlpha = 1.0;
        }

        // Tiny upward wavy flame tongue off each mini magma droplet
        const surgeBoost = clamp(0.92 + Math.abs(dr.speedRatio || 1) * 0.14, 0.90, 1.38);
        const fh = (5.8 + 2.2 * Math.sin(tSec * 6.5 + dr.i * 2.1)) * dr.sizeMult * dr.persp * surgeBoost;
        const inertiaTiltX = -clamp((dr.vx || 0) * 1.05, -3.6, 3.6) * dr.sizeMult;
        const inertiaTiltY = -clamp((dr.vy || 0) * 0.45, -2.0, 2.0) * dr.sizeMult;
        const tipX = dr.sx + inertiaTiltX + Math.sin(tSec * 5.2 + dr.i * 1.9) * 1.6 * dr.sizeMult * dr.persp;
        const tipY = dr.sy - fh + inertiaTiltY;
        const tw = 2.0 * dr.sizeMult * dr.persp;
        ctx.fillStyle = `rgba(${pal.flameMid}, ${(0.72 * depthAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(dr.sx - tw, dr.sy + 0.6 * dr.persp);
        ctx.quadraticCurveTo(dr.sx - tw * 0.8 + inertiaTiltX * 0.35, dr.sy - fh * 0.55 + inertiaTiltY * 0.35, tipX, tipY);
        ctx.quadraticCurveTo(dr.sx + tw * 0.8 + inertiaTiltX * 0.35, dr.sy - fh * 0.50 + inertiaTiltY * 0.35, dr.sx + tw, dr.sy + 0.6 * dr.persp);
        ctx.closePath();
        ctx.fill();

        // Procedural 3D magma droplet core from 6-phase per-frame pool (4x fewer putImageData uploads)
        if (miniPool) {
          const entry = miniPool[dr.i % miniPool.length];
          const drawW = entry.lut.size * sc;
          ctx.globalAlpha = depthAlpha;
          ctx.drawImage(entry.canvas, dr.sx - drawW * 0.5, dr.sy - drawW * 0.5, drawW, drawW);
          ctx.globalAlpha = 1.0;
        } else if (mRes) {
          const { lut, ctx: mCtx, canvas: mCanvas } = mRes;
          fillMagmaSphereLut(
            lut,
            tSec * 0.55 * basis.globalMult + dr.i * 1.67,
            0.3 * Math.sin(tSec * 0.4 * basis.globalMult + dr.i) + dr.i * 0.5,
            tSec * 0.34 * basis.globalMult + dr.i * 0.9,
            pal,
            tSec + dr.i * 0.4,
            false
          );
          mCtx.putImageData(lut.img, 0, 0);
          const drawW = lut.size * sc;
          ctx.globalAlpha = depthAlpha;
          ctx.drawImage(mCanvas, dr.sx - drawW * 0.5, dr.sy - drawW * 0.5, drawW, drawW);
          ctx.globalAlpha = 1.0;
        }
      }
    }
    ctx.restore();
  }

  // --- DESTRUCTION SLOT 1 (1): Complex Asymmetric 3D Glacier Ice Cluster (Non-wireframe) + Cold Vapor ---
  function buildJaggedIcePrism(radius, lenTop, lenBot, sides, rotEuler, offset, seed) {
    const [rx, ry, rz] = rotEuler;
    const cxX = Math.cos(rx), sxX = Math.sin(rx);
    const cyY = Math.cos(ry), syY = Math.sin(ry);
    const czZ = Math.cos(rz), szZ = Math.sin(rz);
    function xf(x, y, z) {
      let y1 = y * cxX - z * sxX, z1 = y * sxX + z * cxX;
      let x2 = x * cyY + z1 * syY, z2 = -x * syY + z1 * cyY;
      let x3 = x2 * czZ - y1 * szZ, y3 = x2 * szZ + y1 * czZ;
      return [x3 + offset[0], y3 + offset[1], z2 + offset[2]];
    }

    const verts = [];
    const faces = [];
    // Chiseled off-center ice peak (angled glacier fracture, NOT a symmetrical diamond apex)
    const tipDx = (hash01(seed * 7 + 1) - 0.5) * radius * 0.55;
    const tipDz = (hash01(seed * 7 + 2) - 0.5) * radius * 0.55;
    verts.push(xf(tipDx, -lenTop, tipDz)); // 0: fractured tip

    // Irregular upper fractured collar
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + (hash01(seed * 13 + i) - 0.5) * 0.34;
      const rVar = radius * (0.64 + 0.36 * hash01(seed * 19 + i));
      const yStep = -lenTop * (0.34 + 0.24 * hash01(seed * 23 + i));
      verts.push(xf(Math.cos(a) * rVar, yStep, Math.sin(a) * rVar));
    }
    // Broader asymmetric base/mid shoulder
    const twist = (hash01(seed * 29) - 0.5) * 0.35;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + twist;
      const rVar = radius * (0.82 + 0.34 * hash01(seed * 31 + i));
      const yStep = lenBot * (0.28 + 0.22 * hash01(seed * 37 + i));
      verts.push(xf(Math.cos(a) * rVar, yStep, Math.sin(a) * rVar));
    }
    const botDx = (hash01(seed * 11 + 3) - 0.5) * radius * 0.45;
    const botDz = (hash01(seed * 11 + 4) - 0.5) * radius * 0.45;
    verts.push(xf(botDx, lenBot, botDz)); // bottom fracture apex
    const botIdx = 1 + 2 * sides;

    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      const u0 = 1 + i, u1 = 1 + ni;
      const b0 = 1 + sides + i, b1 = 1 + sides + ni;
      faces.push([0, u1, u0]);
      faces.push([u0, u1, b1]);
      faces.push([u0, b1, b0]);
      faces.push([botIdx, b0, b1]);
    }
    return { verts, faces };
  }

  function mergeIceMeshes(parts) {
    const verts = [];
    const faces = [];
    parts.forEach((m) => {
      const vBase = verts.length;
      for (let i = 0; i < m.verts.length; i++) verts.push(m.verts[i]);
      for (let i = 0; i < m.faces.length; i++) {
        faces.push([vBase + m.faces[i][0], vBase + m.faces[i][1], vBase + m.faces[i][2]]);
      }
    });
    return { verts, faces };
  }

  // Complex 5-spire irregular glacier ice mass (no symmetrical jewel diamond shape!)
  const MAIN_ICE_CLUSTER = mergeIceMeshes([
    buildJaggedIcePrism(6.8, 14.5, 13.5, 5, [0.12, 0.20, -0.08], [0, 0, 0], 11),
    buildJaggedIcePrism(4.6, 11.2, 6.2, 5, [-0.52, 0.40, 0.58], [-3.2, -1.8, 1.4], 27),
    buildJaggedIcePrism(4.2, 10.6, 6.5, 5, [0.46, -0.35, -0.62], [3.5, -1.2, -1.6], 43),
    buildJaggedIcePrism(5.2, 9.4, 9.2, 5, [0.35, 0.72, 0.30], [1.4, 2.2, 3.2], 61),
    buildJaggedIcePrism(4.4, 8.8, 10.2, 5, [-0.42, -0.65, -0.24], [-1.8, 2.5, -2.9], 79),
  ]);
  const SHARD_ICE_MESH = buildJaggedIcePrism(2.6, 6.2, 4.4, 5, [0.22, 0.15, -0.18], [0, 0, 0], 97);

  function drawSortedIceFacetTris(ctx, triQueue, strokeSeams = true) {
    triQueue.sort((a, b) => a.avgZ - b.avgZ);
    if (strokeSeams) ctx.lineWidth = 0.55;
    for (let i = 0; i < triQueue.length; i++) {
      const tr = triQueue[i];
      const al = clamp((0.88 + tr.rimF * 0.12) * tr.alphaScale, 0, 1);
      const rr = Math.round(clamp(12 + tr.diff * 115 + tr.bounce * 35 + tr.spec * 195 + tr.rimF * 85, 0, 255));
      const gg = Math.round(clamp(78 + tr.diff * 130 + tr.bounce * 95 + tr.spec * 175 + tr.rimF * 110, 0, 255));
      const bb = Math.round(clamp(145 + tr.diff * 98 + tr.bounce * 110 + tr.spec * 115 + tr.rimF * 88, 0, 255));
      const colStr = `rgba(${rr}, ${gg}, ${bb}, ${al.toFixed(3)})`;

      ctx.beginPath();
      ctx.moveTo(tr.p0.sx, tr.p0.sy);
      ctx.lineTo(tr.p1.sx, tr.p1.sy);
      ctx.lineTo(tr.p2.sx, tr.p2.sy);
      ctx.closePath();
      ctx.fillStyle = colStr;
      ctx.fill();
      if (strokeSeams) {
        const span = Math.abs(tr.p1.sx - tr.p0.sx) + Math.abs(tr.p2.sx - tr.p0.sx) + Math.abs(tr.p1.sy - tr.p0.sy);
        if (span > 5.0) {
          ctx.strokeStyle = colStr;
          ctx.stroke();
        }
      }
    }
  }

  function appendRotatedIceMeshTris(verts, faces, cx, cy, scale3d, rotateFn, txOff, tyOff, tzOff, localScale, alphaScale, triQueue, edgeHighlights, camDist = 95) {
    const proj = new Array(verts.length);
    for (let i = 0; i < verts.length; i++) {
      const r = rotateFn([verts[i][0] * localScale, verts[i][1] * localScale, verts[i][2] * localScale]);
      const wx = r[0] + txOff;
      const wy = r[1] + tyOff;
      const wz = r[2] + tzOff;
      const pK = camDist / (camDist - wz * scale3d);
      proj[i] = {
        sx: cx + wx * scale3d * pK,
        sy: cy + wy * scale3d * pK,
        x: wx,
        y: wy,
        z: wz,
      };
    }

    if (edgeHighlights) {
      for (let i = 0; i < proj.length; i++) {
        const dCenter = Math.hypot(proj[i].sx - cx, proj[i].sy - cy);
        if (dCenter > 7.5 * scale3d && proj[i].z > -2.5) {
          edgeHighlights.push({ sx: proj[i].sx, sy: proj[i].sy, z: proj[i].z, idx: i });
        }
      }
    }

    for (let f = 0; f < faces.length; f++) {
      const p0 = proj[faces[f][0]];
      const p1 = proj[faces[f][1]];
      const p2 = proj[faces[f][2]];
      const ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
      const bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.z - p0.z;
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;
      if (nz < 0) continue;

      const diff = Math.max(0, nx * -0.52 + ny * -0.66 + nz * 0.54);
      const bounce = Math.max(0, nx * 0.58 + ny * 0.52 + nz * 0.25) * 0.45;
      const rimF = Math.pow(1 - nz, 2.4) * 0.65;
      const spec = Math.pow(Math.max(0, nx * -0.30 + ny * -0.45 + nz * 0.84), 10);

      triQueue.push({
        avgZ: (p0.z + p1.z + p2.z) / 3,
        p0, p1, p2,
        diff, bounce, rimF, spec, alphaScale,
      });
    }
  }

  function drawFrostCrystalCore(ctx, scx, scy, baseR, tSec, power, rotMult = 1) {
    const scale3d = (baseR / 17.5) * clamp(0.86 + power * 0.16, 0.86, 1.04);

    // 1. Cold descending frost vapor billowing gently downward toward the grimoire
    const coldSp = getPuffRadialSprite('cold');
    for (let i = 0; i < 8; i++) {
      const cyc = (tSec * 0.32 + i * 0.125) % 1;
      const seed = Math.floor(tSec * 0.32 + i * 0.125);
      const dir = (hash01(seed * 19 + i) - 0.5) * 2.1;
      const vx = scx + dir * (5 + cyc * 18) * scale3d + Math.sin(tSec * 1.8 + i) * 3.0;
      const vy = scy + (-2 + cyc * 29) * scale3d;
      const vr = (5.5 + cyc * 10.5) * scale3d;
      const va = Math.sin(cyc * Math.PI) * 0.23;
      if (va < 0.01) continue;
      if (coldSp) {
        ctx.globalAlpha = va;
        ctx.drawImage(coldSp, vx - vr, vy - vr, vr * 2, vr * 2);
      } else {
        const vg = ctx.createRadialGradient(vx, vy, 0.5, vx, vy, vr);
        vg.addColorStop(0, `rgba(224, 242, 254, ${va.toFixed(3)})`);
        vg.addColorStop(0.55, `rgba(125, 211, 252, ${(va * 0.45).toFixed(3)})`);
        vg.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = vg;
        ctx.beginPath();
        ctx.arc(vx, vy, vr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (coldSp) ctx.globalAlpha = 1;

    // Chaotic slow Euler tumble across 3 incommensurate axes (sped up 2x/3x with 2/3 active effects)
    const rotT = tSec * rotMult;
    const rx = rotT * 0.38 + 0.48 * Math.sin(rotT * 0.73);
    const ry = rotT * 0.59 + 0.42 * Math.cos(rotT * 0.51);
    const rz = rotT * 0.25 + 0.52 * Math.sin(rotT * 0.34);
    const cxX = Math.cos(rx), sxX = Math.sin(rx);
    const cyY = Math.cos(ry), syY = Math.sin(ry);
    const czZ = Math.cos(rz), szZ = Math.sin(rz);

    function rotateMain(v) {
      let x = v[0], y = v[1], z = v[2];
      let y1 = y * cxX - z * sxX, z1 = y * sxX + z * cxX;
      let x2 = x * cyY + z1 * syY, z2 = -x * syY + z1 * cyY;
      let x3 = x2 * czZ - y1 * szZ, y3 = x2 * szZ + y1 * czZ;
      return [x3, y3, z2];
    }

    const triQueue = [];
    const edgeHighlights = [];

    function pushMeshTris(verts, faces, txOff, tyOff, tzOff, localScale, alphaScale, recordGlints) {
      const rT = rotateMain([txOff, tyOff, tzOff]);
      appendRotatedIceMeshTris(
        verts, faces, scx, scy, scale3d, rotateMain,
        rT[0], rT[1], rT[2], localScale, alphaScale, triQueue, recordGlints ? edgeHighlights : null
      );
    }

    pushMeshTris(MAIN_ICE_CLUSTER.verts, MAIN_ICE_CLUSTER.faces, 0, 0, 0, 1.0, 1.0, true);

    // 7 irregular ice fragments waxing out of the cluster & slowly sublimating away
    for (let s = 0; s < 7; s++) {
      const period = 4.6 + (s % 4) * 0.85;
      const phase = ((tSec / period) + s * 0.173) % 1;
      const seed = Math.floor(tSec / period + s * 0.173);
      let gScale = 0;
      let gAlpha = 1;
      if (phase < 0.38) {
        gScale = easeOutCubic(phase / 0.38);
      } else if (phase < 0.62) {
        gScale = 1.0;
      } else {
        const melt = (phase - 0.62) / 0.38;
        gScale = 1.0 - melt * 0.68;
        gAlpha = 1.0 - Math.pow(melt, 1.55);
      }
      if (gScale <= 0.04 || gAlpha <= 0.04) continue;

      const isAttached = s < 5;
      const aAz = hash01(seed * 17 + s * 23) * Math.PI * 2;
      const aEl = (hash01(seed * 31 + s * 7) - 0.5) * 1.9;
      const dist = isAttached ? lerp(6.0, 9.6, gScale) : lerp(12.8, 16.5, phase);
      const ox = Math.cos(aAz) * Math.cos(aEl) * dist;
      const oy = Math.sin(aEl) * dist;
      const oz = Math.sin(aAz) * Math.cos(aEl) * dist;
      const fragScale = (isAttached ? 0.92 : 0.68) * gScale;
      pushMeshTris(SHARD_ICE_MESH.verts, SHARD_ICE_MESH.faces, ox, oy, oz, fragScale, gAlpha * 0.95, gScale > 0.68);
    }

    drawSortedIceFacetTris(ctx, triQueue);

    // Inner glacial subsurface core glow
    const heart = ctx.createRadialGradient(scx, scy, 0.5, scx, scy, 9 * scale3d);
    heart.addColorStop(0, 'rgba(186, 230, 253, 0.26)');
    heart.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(scx, scy, 9 * scale3d, 0, Math.PI * 2);
    ctx.fill();

    // Subtle shimmering edge glints along sharp fracture tips of the ice cluster
    for (let g = 0; g < edgeHighlights.length; g += 6) {
      const rc = edgeHighlights[g];
      const glintPulse = Math.max(0, Math.sin(tSec * 4.1 + rc.idx * 2.3 + g * 1.3));
      if (glintPulse < 0.68) continue;
      const intensity = (glintPulse - 0.68) / 0.32;
      const gLen = (1.6 + intensity * 2.1) * scale3d;
      ctx.save();
      ctx.translate(rc.sx, rc.sy);
      ctx.rotate(rotT * 0.35 + g);
      ctx.fillStyle = `rgba(240, 249, 255, ${(0.45 + intensity * 0.45).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, -gLen);
      ctx.quadraticCurveTo(0.15, -0.15, gLen, 0);
      ctx.quadraticCurveTo(0.15, 0.15, 0, gLen);
      ctx.quadraticCurveTo(-0.15, 0.15, -gLen, 0);
      ctx.quadraticCurveTo(-0.15, -0.15, 0, -gLen);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // --- DESTRUCTION SLOT 2/3 (1): Dense 3D Disk of Frost Vapor + Small Ice Shards + Slow Blizzard Snowflakes ---
  const _coldOrbitCache = new Map();

  function drawDestructionSlot2ColdOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, ringSlotIdx = 1, activeCount = 1) {
    const isOuter = ringSlotIdx === 2;
    const scaleS = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04) * (isOuter ? 0.96 : 1.0);
    const frameKey = `${tSec}|${cx}|${cy}|${baseR}|${power}|${activeCount}`;
    let cached = _coldOrbitCache.get(ringSlotIdx);
    if (!cached || cached.key !== frameKey) {
      const basis = computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
      const turbT = tSec * Math.sqrt(basis.spinMult);
      const thetaShift = isOuter ? 0.45 : 0.0;
      const back = [];
      const front = [];

      const NUM_PUFFS = isOuter ? 32 : 28;
      for (let p = 0; p < NUM_PUFFS; p++) {
        const baseAngle = (p / NUM_PUFFS) * Math.PI * 2 + thetaShift + (hash01(p * 17 + 5) - 0.5) * 0.25;
        const rOff = (hash01(p * 23 + 3) - 0.5) * 8.6 * scaleS;
        const aOff = (hash01(p * 29 + 11) - 0.5) * 3.4 * scaleS + Math.sin(turbT * 1.5 + p * 1.3) * 0.8 * scaleS;
        const puffSizeNorm = hash01(p * 41) * 0.55;
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle, angRate: 0.26, radOff: rOff, axOff: aOff,
          sizeNorm: puffSizeNorm, pieceSeed: p * 17 + 211,
          pieceKey: `cld_pf_${ringSlotIdx}_${p}`,
          swingGain: 0.35, basisNow: basis,
        });
        const isBack = proj.z < 0;
        const rec = { kind: 'puff', z: proj.z, p, sx: cx + proj.dx, sy: cy + proj.dy, persp: proj.persp, isBack };
        if (isBack) back.push(rec); else front.push(rec);
      }

      const NUM_SHARDS = isOuter ? 12 : 10;
      for (let s = 0; s < NUM_SHARDS; s++) {
        const shardSizeNorm = Math.pow(hash01(s * 53 + 1), 1.10);
        const shardScale = (isOuter ? 0.90 : 1.0) * (0.38 + shardSizeNorm * 0.58);
        const baseAngle = (s / NUM_SHARDS) * Math.PI * 2 + thetaShift + (hash01(s * 31 + 2) - 0.5) * 0.30;
        const rOff = (hash01(s * 37 + 9) - 0.5) * 5.6 * scaleS;
        const aOff = (hash01(s * 43 + 7) - 0.5) * 2.4 * scaleS + Math.cos(turbT * 1.3 + s * 1.9) * 0.9 * scaleS;
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle, angRate: 0.28, radOff: rOff, axOff: aOff,
          sizeNorm: shardSizeNorm, pieceSeed: s * 31 + 307,
          pieceKey: `cld_sh_${ringSlotIdx}_${s}`,
          swingGain: 1.0, basisNow: basis,
        });
        const isBack = proj.z < 0;
        const rec = {
          kind: 'shard', z: proj.z, s,
          wx: proj.x, wy: proj.y, wz: proj.z,
          sx: cx + proj.dx, sy: cy + proj.dy,
          persp: proj.persp, isBack, scale: shardScale, speedRatio: proj.speedRatio,
        };
        if (isBack) back.push(rec); else front.push(rec);
      }

      const NUM_SNOW = isOuter ? 24 : 20;
      for (let f = 0; f < NUM_SNOW; f++) {
        const isStarFlake = (f % 3 === 0);
        const flakeSize = (isStarFlake ? (2.1 + hash01(f * 61) * 1.0) : (0.72 + hash01(f * 59) * 0.65)) * (isOuter ? 0.92 : 1.0);
        const flakeSizeNorm = isStarFlake ? (0.45 + 0.38 * hash01(f * 61)) : (0.08 + 0.22 * hash01(f * 59));
        const baseAngle = (f / NUM_SNOW) * Math.PI * 2 + thetaShift + Math.sin(turbT * 0.9 + f) * 0.14;
        const rOff = (hash01(f * 41 + 19) - 0.5) * 12.6 * scaleS + Math.sin(turbT * 1.4 + f * 2.1) * 1.8 * scaleS;
        const aOff = (hash01(f * 47 + 7) - 0.5) * 6.4 * scaleS + Math.cos(turbT * 1.15 + f * 1.7) * 1.5 * scaleS;
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle, angRate: 0.31 + (f % 3) * 0.04, radOff: rOff, axOff: aOff,
          sizeNorm: flakeSizeNorm, pieceSeed: f * 41 + 409,
          pieceKey: `cld_sn_${ringSlotIdx}_${f}`,
          swingGain: 0.85, basisNow: basis,
        });
        const isBack = proj.z < 0;
        const rec = {
          kind: 'snow', f, z: proj.z,
          sx: cx + proj.dx, sy: cy + proj.dy,
          persp: proj.persp, isBack, isStarFlake, size: flakeSize,
          spin: tSec * basis.globalMult * (f % 2 === 0 ? 0.65 : -0.55) + f * 1.1,
          alpha: 0.58 + 0.34 * Math.sin(tSec * 1.8 + f * 2.3),
        };
        if (isBack) back.push(rec); else front.push(rec);
      }

      back.sort((a, b) => a.z - b.z);
      front.sort((a, b) => a.z - b.z);
      cached = { key: frameKey, basis, back, front };
      _coldOrbitCache.set(ringSlotIdx, cached);
    }

    const basis = cached.basis;
    const items = passPhase === 'back' ? cached.back : (passPhase === 'front' ? cached.front : cached.back.concat(cached.front));
    if (items.length === 0) return;

    let shardTris = [];
    function flushShards() {
      if (shardTris.length === 0) return;
      drawSortedIceFacetTris(ctx, shardTris, false);
      shardTris = [];
    }

    const coldPuffSp = getPuffRadialSprite('cold');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'puff') {
        flushShards();
        const vr = (5.8 + 2.6 * hash01(it.p * 41)) * it.persp * scaleS;
        const pulseA = 0.20 + 0.08 * Math.sin(tSec * 2.1 + it.p * 1.7);
        const a = clamp(pulseA * (it.isBack ? 0.68 : 1.0), 0.08, 0.34);
        if (coldPuffSp) {
          const prevA = ctx.globalAlpha;
          ctx.globalAlpha = prevA * a;
          ctx.drawImage(coldPuffSp, it.sx - vr, it.sy - vr, vr * 2, vr * 2);
          ctx.globalAlpha = prevA;
        } else {
          const pg = ctx.createRadialGradient(it.sx, it.sy, 0.4, it.sx, it.sy, vr);
          pg.addColorStop(0, `rgba(224, 245, 255, ${a.toFixed(3)})`);
          pg.addColorStop(0.55, `rgba(125, 211, 252, ${(a * 0.56).toFixed(3)})`);
          pg.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(it.sx, it.sy, vr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (it.kind === 'snow') {
        flushShards();
        const depthDim = it.isBack ? 0.64 : 1.0;
        const al = clamp(it.alpha * depthDim, 0.25, 0.94);
        const rSn = it.size * it.persp * scaleS;
        if (it.isStarFlake) {
          ctx.save();
          ctx.translate(it.sx, it.sy);
          ctx.rotate(it.spin);
          ctx.strokeStyle = `rgba(240, 249, 255, ${al.toFixed(3)})`;
          ctx.lineWidth = Math.max(0.45, 0.52 * it.persp * scaleS);
          for (let arm = 0; arm < 3; arm++) {
            const a = (arm * Math.PI) / 3;
            const ca = Math.cos(a) * rSn;
            const sa = Math.sin(a) * rSn;
            ctx.beginPath();
            ctx.moveTo(-ca, -sa);
            ctx.lineTo(ca, sa);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(255, 255, 255, ${clamp(al * 1.05, 0, 1).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0.4, rSn * 0.26), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = `rgba(235, 248, 255, ${al.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(it.sx, it.sy, rSn, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const shardRotT = tSec * basis.globalMult;
        const lrx = shardRotT * 0.42 + it.s * 1.4;
        const lry = shardRotT * 0.58 + it.s * 2.1;
        const lrz = shardRotT * 0.31 + it.s * 0.8;
        const c1 = Math.cos(lrx), s1 = Math.sin(lrx);
        const c2 = Math.cos(lry), s2 = Math.sin(lry);
        const c3 = Math.cos(lrz), s3 = Math.sin(lrz);
        const rotShard = (v) => {
          const y1 = v[1] * c1 - v[2] * s1, z1 = v[1] * s1 + v[2] * c1;
          const x2 = v[0] * c2 + z1 * s2, z2 = -v[0] * s2 + z1 * c2;
          return [x2 * c3 - y1 * s3, x2 * s3 + y1 * c3, z2];
        };
        const al = it.isBack ? clamp(0.68 + (it.persp - 0.78) * 0.8, 0.58, 0.90) : 0.96;
        appendRotatedIceMeshTris(
          SHARD_ICE_MESH.verts,
          SHARD_ICE_MESH.faces,
          cx, cy,
          scaleS,
          rotShard,
          it.wx / scaleS,
          it.wy / scaleS,
          it.wz / scaleS,
          it.scale,
          al,
          shardTris,
          null,
          115
        );
      }
    }
    flushShards();
  }

  // --- DESTRUCTION SLOT 1 (3): Natural White-Hot Stepped-Leader Ball Lightning ("Комок молний") ---
  function buildOpenLeaderPath(x0, y0, initAng, totalLen, segCount, kinkGain, seed) {
    const pts = [{ x: x0, y: y0, ang: initAng }];
    let px = x0, py = y0;
    let ang = initAng;
    const avgStep = totalLen / Math.max(1, segCount);
    for (let i = 0; i < segCount; i++) {
      // Mix sharp long darts with short tight micro-jogs like real dielectric breakdown
      const stepScale = 0.35 + Math.pow(hash01(seed * 31 + i * 17), 1.25) * 1.45;
      let turn = (hash01(seed * 19 + i * 23) - 0.5) * 0.70 * kinkGain;
      // Abrupt IRL stepped-leader dogleg (~32% chance of sharp 35-70 deg corner)
      if (hash01(seed * 41 + i * 13) > 0.68) {
        const dir = hash01(seed * 53 + i * 7) > 0.5 ? 1 : -1;
        turn += dir * (0.58 + 0.64 * hash01(seed * 61 + i * 3)) * kinkGain;
      }
      ang += turn + (initAng - ang) * 0.14;
      const stepLen = avgStep * stepScale;
      px += Math.cos(ang) * stepLen;
      py += Math.sin(ang) * stepLen;
      pts.push({ x: px, y: py, ang });
    }
    return pts;
  }

  function buildBridgeLeaderPath(x0, y0, x1, y1, wanderAmp, segCount, seed) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const walk = [0];
    let acc = 0;
    for (let i = 1; i <= segCount; i++) {
      let step = (hash01(seed * 37 + i * 19) - 0.5) * 2.0 * wanderAmp;
      if (hash01(seed * 29 + i * 11) > 0.72) step *= 1.75;
      acc += step;
      walk.push(acc);
    }
    const pts = [];
    for (let i = 0; i <= segCount; i++) {
      const t = i / segCount;
      const bridgeOff = walk[i] - t * walk[segCount];
      const tWarp = (i === 0 || i === segCount) ? t : clamp(t + (hash01(seed * 47 + i) - 0.5) * (0.50 / segCount), 0.02, 0.98);
      pts.push({
        x: x0 + dx * tWarp + nx * bridgeOff,
        y: y0 + dy * tWarp + ny * bridgeOff,
      });
    }
    return pts;
  }

  function strokeLightningChunks(ctx, pts, glowW, coreW, glowAlpha, coreAlpha, useCyanRim) {
    if (pts.length < 2) return;
    const spans = pts.length >= 4
      ? [
        [0, Math.floor((pts.length - 1) * 0.34), 1.00],
        [Math.floor((pts.length - 1) * 0.34), Math.floor((pts.length - 1) * 0.70), 0.58],
        [Math.floor((pts.length - 1) * 0.70), pts.length - 1, 0.24],
      ]
      : [[0, pts.length - 1, 1.00]];

    const glowCol = useCyanRim
      ? `rgba(115, 195, 255, ${clamp(glowAlpha * 0.78, 0, 0.85).toFixed(3)})`
      : `rgba(155, 204, 255, ${clamp(glowAlpha * 0.82, 0, 0.88).toFixed(3)})`;
    const sheathCol = `rgba(228, 246, 255, ${clamp(coreAlpha * 0.85, 0, 0.95).toFixed(3)})`;
    const coreCol = `rgba(255, 255, 255, ${clamp(coreAlpha, 0, 1).toFixed(3)})`;

    for (let s = 0; s < spans.length; s++) {
      const [i0, i1, wMult] = spans[s];
      if (i1 <= i0) continue;
      ctx.beginPath();
      ctx.moveTo(pts[i0].x, pts[i0].y);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);

      ctx.strokeStyle = glowCol;
      ctx.lineWidth = Math.max(0.55, glowW * wMult);
      ctx.stroke();

      ctx.strokeStyle = sheathCol;
      ctx.lineWidth = Math.max(0.38, glowW * 0.45 * wMult);
      ctx.stroke();

      ctx.strokeStyle = coreCol;
      ctx.lineWidth = Math.max(0.30, coreW * wMult);
      ctx.stroke();
    }
  }

  function drawBallLightningCore(ctx, scx, scy, baseR, tSec, power, shockFrameArg) {
    const scaleS = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.05);
    const strikeFrame = shockFrameArg || computeShockStrikeFrame(tSec);
    const sFlash = strikeFrame.strikeFlash;

    // 1. Ionized plasma core glow pulsed cleanly by outward long lightning surges
    const coreFlash = 0.68 + sFlash * 0.62;
    const plasmaGlow = ctx.createRadialGradient(scx, scy, 0.4, scx, scy, (14 + sFlash * 6) * scaleS);
    plasmaGlow.addColorStop(0, `rgba(245, 250, 255, ${clamp(0.24 * coreFlash, 0.16, 0.48).toFixed(3)})`);
    plasmaGlow.addColorStop(0.38, `rgba(175, 218, 255, ${clamp(0.14 * coreFlash, 0.08, 0.32).toFixed(3)})`);
    plasmaGlow.addColorStop(0.75, `rgba(110, 180, 255, ${clamp(0.05 * coreFlash, 0.02, 0.16).toFixed(3)})`);
    plasmaGlow.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = plasmaGlow;
    ctx.beginPath();
    ctx.arc(scx, scy, (14 + sFlash * 6) * scaleS, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3.6;

    // 2. Crisp tangled lightning knot ("комок молний") — visible crisscrossing pure white stepped filaments
    const KNOT_ARCS = 16;
    for (let aIdx = 0; aIdx < KNOT_ARCS; aIdx++) {
      const lifeDur = 0.06 + (aIdx % 5) * 0.021;
      const uT = tSec + aIdx * 0.073;
      const cyc = Math.floor(uT / lifeDur);
      const frac = (uT - cyc * lifeDur) / lifeDur;
      if (frac > 0.78) continue;
      const flicker = 0.68 + 0.32 * hash01(Math.floor(tSec * 68) + aIdx * 13);
      const arcAlpha = Math.sin((frac / 0.78) * Math.PI) * flicker;

      const rA = (1.5 + hash01(cyc * 17 + aIdx * 7) * 11.2) * scaleS;
      const angA = hash01(cyc * 29 + aIdx * 19) * Math.PI * 2;
      const rB = (4.2 + hash01(cyc * 23 + aIdx * 31) * 9.8) * scaleS;
      const angB = angA + (hash01(cyc * 41 + aIdx * 11) > 0.5 ? 1 : -1) * (1.35 + hash01(cyc * 43 + aIdx) * 1.9);

      const x0 = scx + Math.cos(angA) * rA;
      const y0 = scy + Math.sin(angA) * rA;
      const x1 = scx + Math.cos(angB) * rB;
      const y1 = scy + Math.sin(angB) * rB;

      const knotSeed = cyc * 61 + aIdx * 17 + Math.floor(tSec * 44);
      const pts = buildBridgeLeaderPath(x0, y0, x1, y1, 2.5 * scaleS, 4 + (aIdx % 3), knotSeed);
      const isHotChord = (aIdx % 4 === 0);
      const coreW = (isHotChord ? 1.15 : 0.48) * scaleS;
      const glowW = (isHotChord ? 2.35 : 1.15) * scaleS;
      strokeLightningChunks(ctx, pts, glowW, coreW, arcAlpha * 0.52, arcAlpha, aIdx % 3 === 0);
    }

    // 3. Natural stepped-leader discharges sourced directly from shared computeShockStrikeFrame(tSec, relays)
    for (let idx = 0; idx < strikeFrame.strikes.length; idx++) {
      const st = strikeFrame.strikes[idx];
      const { ch, k, lenRoll, widthRoll, baseAng, effectiveAng, boltAlpha, hasMainSplit, relayNode, relayNode2, isAmplified } = st;

      const rStart = (1.0 + hash01(k * 5 + ch) * 6.0) * scaleS;
      const startAng = baseAng + (hash01(k * 11 + ch) - 0.5) * 0.85;
      const x0 = scx + Math.cos(startAng) * rStart;
      const y0 = scy + Math.sin(startAng) * rStart;

      // Huge width contrast: fine hairline sparks (0.32px) vs bold thick white trunks (boosted when relayed through Slot 2/3!)
      const rawCoreW = (0.32 + Math.pow(widthRoll, 1.48) * 3.22) * scaleS;
      const coreRootW = isAmplified ? Math.max(0.75 * scaleS, rawCoreW * (relayNode2 ? 1.58 : 1.45)) : rawCoreW;
      const glowRootW = coreRootW * (isAmplified ? 1.95 : 1.85) + (isAmplified ? 1.1 : 0.65) * scaleS;
      const kinkGain = 0.74 + hash01(k * 73 + ch) * 0.48;
      const jitterSeed = k * 53 + ch * 11 + Math.floor(tSec * 38);

      let pts;
      let boltLen;
      let forkAnchorAng = effectiveAng;

      if (isAmplified && relayNode) {
        // Mandatory relay path: center core -> orbital Slot 2 (or 3) cluster -> optional chained Slot 3 cluster -> intensified outward surge
        const rlx = scx + relayNode.dx;
        const rly = scy + relayNode.dy;
        const feedPts = buildBridgeLeaderPath(x0, y0, rlx, rly, (2.2 + widthRoll * 1.6) * scaleS, 5, jitterSeed + 313);
        strokeLightningChunks(
          ctx,
          feedPts,
          glowRootW * 0.86,
          coreRootW * 0.84,
          clamp(boltAlpha * (0.58 + widthRoll * 0.30), 0, 0.95),
          clamp(boltAlpha * 0.98, 0, 1),
          (ch % 2 === 0)
        );

        let launchX = rlx;
        let launchY = rly;
        if (relayNode2) {
          const rl2x = scx + relayNode2.dx;
          const rl2y = scy + relayNode2.dy;
          const chainPts = buildBridgeLeaderPath(rlx, rly, rl2x, rl2y, (2.6 + widthRoll * 1.8) * scaleS, 5, jitterSeed + 619);
          strokeLightningChunks(
            ctx,
            chainPts,
            glowRootW * 0.96,
            coreRootW * 0.94,
            clamp(boltAlpha * (0.62 + widthRoll * 0.32), 0, 0.98),
            clamp(boltAlpha * 1.02, 0, 1),
            (ch % 2 === 1)
          );
          launchX = rl2x;
          launchY = rl2y;
        }

        boltLen = relayNode2
          ? (17.5 + Math.pow(lenRoll, 0.90) * 26.5) * scaleS
          : (22.0 + Math.pow(lenRoll, 0.90) * 34.0) * scaleS;
        const segs = Math.max(5, Math.min(12, Math.round(4 + (boltLen / scaleS) * 0.16)));
        pts = buildOpenLeaderPath(launchX, launchY, effectiveAng, boltLen, segs, kinkGain * 1.05, jitterSeed);
        strokeLightningChunks(
          ctx,
          pts,
          glowRootW,
          coreRootW,
          clamp(boltAlpha * (0.64 + widthRoll * 0.32), 0, 0.98),
          clamp(boltAlpha * 1.06, 0, 1),
          (ch % 3 === 0)
        );
      } else {
        boltLen = (7.5 + Math.pow(lenRoll, 1.10) * 46.5) * scaleS;
        const segs = Math.max(4, Math.min(11, Math.round(3 + (boltLen / scaleS) * 0.15)));
        pts = buildOpenLeaderPath(x0, y0, baseAng, boltLen, segs, kinkGain, jitterSeed);
        strokeLightningChunks(
          ctx,
          pts,
          glowRootW,
          coreRootW,
          boltAlpha * (0.48 + widthRoll * 0.32),
          clamp(boltAlpha * (0.90 + widthRoll * 0.10), 0, 1),
          (ch % 3 === 0)
        );
      }

      // Natural asymmetric elbow splits + occasional heavy 50/50 trunk bifurcation
      if (boltLen > 13.5 * scaleS && pts.length >= 4) {
        const branchCount = isAmplified ? (widthRoll > 0.48 ? 4 : 3) : (hasMainSplit ? 3 : (lenRoll > 0.36 ? 2 : 1));
        for (let b = 0; b < branchCount; b++) {
          const anchorFrac = (b === 0 && hasMainSplit)
            ? 0.26 + hash01(k * 83 + ch) * 0.22
            : 0.18 + hash01(k * 83 + b * 17 + ch) * 0.58;
          const anchorIdx = Math.max(1, Math.min(pts.length - 2, Math.floor(pts.length * anchorFrac)));
          const anchor = pts[anchorIdx];
          const sideSign = hash01(k * 97 + b * 13 + ch) > 0.5 ? 1 : -1;
          const spreadAngle = (b === 0 && hasMainSplit) ? (0.34 + 0.36 * hash01(k + ch)) : (0.40 + 0.58 * hash01(k * 43 + b * 29));
          const bAng = (anchor.ang ?? forkAnchorAng) + sideSign * spreadAngle;
          const bLen = boltLen * ((b === 0 && hasMainSplit) ? (0.50 + hash01(k * 71) * 0.34) : (0.24 + hash01(k * 71 + b * 7) * 0.38));
          const bSegs = Math.max(3, Math.round(pts.length * 0.55));
          const bPts = buildOpenLeaderPath(anchor.x, anchor.y, bAng, bLen, bSegs, kinkGain * 1.12, jitterSeed + 101 + b * 19);

          const trunkFrac = 1.0 - anchorFrac * 0.48;
          const scaleB = (b === 0 && hasMainSplit) ? 0.76 : (0.38 + hash01(k * 31 + b) * 0.22);
          strokeLightningChunks(
            ctx,
            bPts,
            Math.max(0.75, glowRootW * trunkFrac * scaleB),
            Math.max(0.32, coreRootW * trunkFrac * scaleB),
            boltAlpha * (isAmplified ? 0.58 : 0.44),
            clamp(boltAlpha * (isAmplified ? 0.96 : 0.88), 0, 1),
            true
          );

          if (widthRoll > 0.52 && bPts.length >= 3 && b <= 1) {
            const subAnchor = bPts[1];
            const sAng = (subAnchor.ang ?? bAng) - sideSign * (0.45 + 0.48 * hash01(k + b * 7));
            const sPts = buildOpenLeaderPath(subAnchor.x, subAnchor.y, sAng, bLen * 0.48, 3, kinkGain * 1.2, jitterSeed + 233 + b * 29);
            strokeLightningChunks(ctx, sPts, 0.72 * scaleS, 0.28 * scaleS, boltAlpha * 0.38, clamp(boltAlpha * 0.80, 0, 1), true);
          }
        }
      }
    }
    ctx.restore();
  }

  // --- DESTRUCTION SLOT 2/3 (3): 3D Ring of 6 Crackling Ball-Lightning Nodes + Core Relay Synergy ---
  function drawDestructionSlot2ShockOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, shockFrame, ringSlotIdx = 1, activeCount = 1) {
    const isOuter = ringSlotIdx === 2;
    const nodes = (shockFrame && (isOuter ? shockFrame.nodes3 : shockFrame.nodes2)) || computeSlot2ShockOrbitalNodes(baseR, tSec, power, ringSlotIdx, activeCount).nodes;
    const isRelayActive = Boolean(shockFrame && (shockFrame.isDoubleShock || (nodes && nodes.some((n) => n && n.amplifyFlash > 0))));
    const scaleN = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04) * (isOuter ? 0.94 : 1.0);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 3.0;

    // Subtle intermittent arc links hopping between adjacent orbital lightning nodes
    for (let i = 0; i < 6; i++) {
      const nA = nodes[i];
      const nB = nodes[(i + 1) % 6];
      const avgZ = (nA.z + nB.z) * 0.5;
      const isBackLink = avgZ < 0;
      if ((passPhase === 'back' && !isBackLink) || (passPhase === 'front' && isBackLink)) continue;

      const arcPhase = ((tSec * 2.8 + i * 0.41) % 1);
      if (arcPhase > 0.55) continue;
      const cycL = Math.floor(tSec * 2.8 + i * 0.41);
      const lAlpha = Math.sin((arcPhase / 0.55) * Math.PI) * (isBackLink ? 0.32 : 0.48);
      const pts = buildBridgeLeaderPath(
        cx + nA.dx, cy + nA.dy,
        cx + nB.dx, cy + nB.dy,
        1.8 * scaleN, 4, cycL * 37 + i * 19 + Math.floor(tSec * 36)
      );
      strokeLightningChunks(ctx, pts, 1.15 * scaleN, 0.36 * scaleN, lAlpha * 0.65, lAlpha, i % 2 === 0);
    }

    // Draw each orbital mini-cluster belonging to the active z-hemisphere pass
    const depthFiltered = nodes.filter((n) => (passPhase === 'back' ? n.isBack : !n.isBack)).sort((a, b) => a.z - b.z);
    for (let d = 0; d < depthFiltered.length; d++) {
      const nd = depthFiltered[d];
      const nx = cx + nd.dx;
      const ny = cy + nd.dy;
      const ampBoost = isRelayActive ? (nd.amplifyFlash || 0) : 0;
      const pSc = nd.persp * scaleN * (1 + ampBoost * 0.25);
      const depthDim = nd.isBack ? clamp(0.65 + (nd.persp - 0.78) * 0.85, 0.58, 0.88) : 1.0;

      // Localized pale ionized corona around mini-cluster (flares crisp white when amplifying Slot 1 bolt!)
      const gRad = (6.8 + ampBoost * 6.5) * pSc;
      const ng = ctx.createRadialGradient(nx, ny, 0.3, nx, ny, gRad);
      ng.addColorStop(0, `rgba(255, 255, 255, ${clamp((0.36 + ampBoost * 0.45) * depthDim, 0.15, 0.85).toFixed(3)})`);
      ng.addColorStop(0.45, `rgba(175, 220, 255, ${clamp((0.20 + ampBoost * 0.25) * depthDim, 0.08, 0.45).toFixed(3)})`);
      ng.addColorStop(1, 'rgba(96, 165, 250, 0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, gRad, 0, Math.PI * 2);
      ctx.fill();

      // 5 crackling internal crossed arcs inside each orbital node
      for (let aIdx = 0; aIdx < 5; aIdx++) {
        const lDur = 0.07 + (aIdx % 3) * 0.025;
        const cycA = Math.floor((tSec + nd.idx * 0.17 + aIdx * 0.09) / lDur);
        const aA = hash01(cycA * 19 + aIdx * 7 + nd.idx) * Math.PI * 2;
        const aB = aA + Math.PI * (0.65 + hash01(cycA * 29 + aIdx) * 0.75);
        const rNode = (3.4 + hash01(cycA * 11 + aIdx) * 1.6) * pSc;
        const pts = buildBridgeLeaderPath(
          nx + Math.cos(aA) * rNode, ny + Math.sin(aA) * rNode,
          nx + Math.cos(aB) * rNode, ny + Math.sin(aB) * rNode,
          1.2 * pSc, 3, cycA * 41 + nd.idx * 13 + aIdx
        );
        const coreAl = clamp((0.72 + ampBoost * 0.28) * depthDim, 0.3, 1.0);
        strokeLightningChunks(ctx, pts, (1.1 + ampBoost * 0.65) * pSc, (0.42 + ampBoost * 0.26) * pSc, coreAl * 0.55, coreAl, aIdx % 2 === 0);
      }

      // Independent minor outward sparks breaking from each orbital node
      if (nd.hasSpark) {
        const spOutAng = Math.atan2(nd.dy, nd.dx) + (hash01(nd.nK * 17 + nd.idx) - 0.5) * 1.35;
        const spLen = (7.5 + nd.nStrength * 14.5) * pSc;
        const spPts = buildOpenLeaderPath(nx, ny, spOutAng, spLen, 4, 0.85, nd.nK * 59 + nd.idx * 23 + Math.floor(tSec * 36));
        strokeLightningChunks(
          ctx, spPts,
          (1.2 + nd.nStrength * 1.3) * pSc,
          (0.38 + nd.nStrength * 0.52) * pSc,
          nd.sparkAlpha * 0.52 * depthDim,
          nd.sparkAlpha * 0.92 * depthDim,
          nd.idx % 2 === 0
        );
      }
    }
    ctx.restore();
  }

  // --- DESTRUCTION SLOT 1 (2): Volumetric Miasma FBM Vapor + Wobbling Liquid Glob + Satellite Droplets ---
  function ensureMiasmaResources() {
    if (typeof document === 'undefined') return null;
    const MW = 36, MH = 40;
    if (!_miasmaCanvas) {
      _miasmaCanvas = document.createElement('canvas');
      _miasmaCanvas.width = MW;
      _miasmaCanvas.height = MH;
    }
    if (!_miasmaBuf) {
      const mCtx = _miasmaCanvas.getContext('2d');
      const img = mCtx.createImageData(MW, MH);
      _miasmaBuf = {
        w: MW,
        h: MH,
        img,
        data: img.data,
        scratch: new Uint8ClampedArray(MW * MH * 4),
        buf32: new Uint32Array(img.data.buffer),
      };
    }
    return { canvas: _miasmaCanvas, ctx: _miasmaCanvas.getContext('2d'), buf: _miasmaBuf };
  }

  // Fast separable 3-tap binomial [1, 2, 1] / 4 blur in CPU memory with strictly zeroed outer 1px perimeter.
  // Replaces ctx.filter='blur(...)' completely: zero Skia GPU stall, zero ghost trails, zero square clip border!
  function smoothMiasmaAndUpload(mCtx, buf) {
    const mw = buf.w;
    const mh = buf.h;
    const d = buf.data;
    const sc = buf.scratch;
    sc.fill(0);
    // Horizontal pass (rows 1..mh-2, cols 1..mw-2)
    for (let py = 1; py < mh - 1; py++) {
      const rowOff = py * mw * 4;
      for (let px = 1; px < mw - 1; px++) {
        const i = rowOff + px * 4;
        const aL = d[i - 1], aC = d[i + 3], aR = d[i + 7];
        const aSum = aL + (aC << 1) + aR;
        if (aSum === 0) continue;
        // Premultiply-weighted RGB average prevents dark-edge fringing around soft smoke
        const inv = 1 / aSum;
        sc[i] = (d[i - 4] * aL + d[i] * (aC << 1) + d[i + 4] * aR) * inv;
        sc[i + 1] = (d[i - 3] * aL + d[i + 1] * (aC << 1) + d[i + 5] * aR) * inv;
        sc[i + 2] = (d[i - 2] * aL + d[i + 2] * (aC << 1) + d[i + 6] * aR) * inv;
        sc[i + 3] = aSum >> 2;
      }
    }
    buf.buf32.fill(0);
    // Vertical pass (rows 1..mh-2, cols 1..mw-2) — outer border rows/cols remain strictly 0!
    const stride = mw * 4;
    for (let py = 1; py < mh - 1; py++) {
      const rowOff = py * stride;
      for (let px = 1; px < mw - 1; px++) {
        const i = rowOff + px * 4;
        const aU = sc[i - stride + 3], aC = sc[i + 3], aD = sc[i + stride + 3];
        const aSum = aU + (aC << 1) + aD;
        if (aSum === 0) continue;
        const inv = 1 / aSum;
        d[i] = (sc[i - stride] * aU + sc[i] * (aC << 1) + sc[i + stride] * aD) * inv;
        d[i + 1] = (sc[i - stride + 1] * aU + sc[i + 1] * (aC << 1) + sc[i + stride + 1] * aD) * inv;
        d[i + 2] = (sc[i - stride + 2] * aU + sc[i + 2] * (aC << 1) + sc[i + stride + 2] * aD) * inv;
        d[i + 3] = aSum >> 2;
      }
    }
    mCtx.putImageData(buf.img, 0, 0);
  }

  function drawWetToxicDroplet(ctx, sx, sy, rxD, ryD, rotAng, highlightR, isBack) {
    const sp = getToxicDropletSprite(isBack);
    if (sp) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rotAng);
      ctx.drawImage(sp, -rxD, -ryD, rxD * 2, ryD * 2);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rotAng);
    const dGrad = ctx.createRadialGradient(-rxD * 0.28, -ryD * 0.28, 0.2, 0, 0, Math.max(rxD, ryD) * 1.12);
    if (isBack) {
      dGrad.addColorStop(0, '#86efac');
      dGrad.addColorStop(0.45, '#15803d');
      dGrad.addColorStop(1, '#022c22');
    } else {
      dGrad.addColorStop(0, '#ecfccb');
      dGrad.addColorStop(0.45, '#4ade80');
      dGrad.addColorStop(1, '#064e3b');
    }
    ctx.fillStyle = dGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rxD, ryD, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${isBack ? 0.38 : 0.85})`;
    ctx.beginPath();
    ctx.arc(-rxD * 0.30, -ryD * 0.26, highlightR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPoisonDropCore(ctx, scx, scy, baseR, tSec, power, poisonCapture, rotMult = 1) {
    const scaleP = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04);
    const baseRad = 11.4 * scaleP;
    const hasRing2Cap = Boolean(poisonCapture && (poisonCapture === true || poisonCapture.ring2));
    const hasRing3Cap = Boolean(poisonCapture && poisonCapture.ring3);
    const hasOrbitCap = hasRing2Cap || hasRing3Cap;
    const capActiveCnt = (poisonCapture && poisonCapture.activeCount) || (hasRing3Cap && hasRing2Cap ? 3 : 2);
    const capBasis2 = hasRing2Cap ? computeSlot2OrbitBasis(baseR, tSec, power, 1, capActiveCnt) : null;
    const capBasis3 = hasRing3Cap ? computeSlot2OrbitBasis(baseR, tSec, power, 2, capActiveCnt) : null;

    function randSphereDir(azSeed, zSeed) {
      const az = hash01(azSeed) * Math.PI * 2;
      const z = hash01(zSeed) * 1.88 - 0.94; // Full front (+z) & back (-z) 3D hemisphere coverage
      const rXY = Math.sqrt(Math.max(0.06, 1 - z * z));
      return { x: Math.cos(az) * rXY, y: Math.sin(az) * rXY, z, az };
    }

    function drawSingleSatelliteAndBridge(ds) {
      // Viscous tearing/re-absorption neck connecting droplet to its specific surface anchor (pOut or pIn)
      if (ds.bridgeStrength > 0.05) {
        const ax = ds.anchorPx, ay = ds.anchorPy;
        const bx = ds.sx, by = ds.sy;
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const wA = (1.6 + ds.r * 0.42) * ds.bridgeStrength * ds.persp;
        const wB = (0.7 + ds.r * 0.25) * ds.bridgeStrength * ds.persp;
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        ctx.fillStyle = ds.isBack ? '#0f5e2e' : '#15803d';
        ctx.beginPath();
        ctx.moveTo(ax + nx * wA, ay + ny * wA);
        ctx.quadraticCurveTo(mx + nx * wB * 0.35, my + ny * wB * 0.35, bx + nx * wB, by + ny * wB);
        ctx.lineTo(bx - nx * wB, by - ny * wB);
        ctx.quadraticCurveTo(mx - nx * wB * 0.35, my - ny * wB * 0.35, ax - nx * wA, ay - ny * wA);
        ctx.closePath();
        ctx.fill();
      }

      const appR = ds.r * ds.persp;
      const stretch = ds.isFrozen ? 1.0 : (ds.isInOrbit ? 1.12 : 1.18);
      const squash = ds.isFrozen ? 1.0 : (ds.isInOrbit ? 0.90 : 0.86);
      const rxD = appR * (ds.isFrozen ? (1 + 0.07 * Math.sin(tSec * 9.5 + ds.seed)) : stretch);
      const ryD = appR * (ds.isFrozen ? (1 - 0.07 * Math.sin(tSec * 9.5 + ds.seed)) : squash);
      drawWetToxicDroplet(ctx, ds.sx, ds.sy, rxD, ryD, ds.velAng, Math.max(0.4, appR * 0.25), ds.isBack);
    }

    // Asynchronous 3D droplet channels with incommensurable periods (NO clockwise ring pattern, NO single center anchor!)
    const NUM_CHANNELS = 7;
    const DURATIONS = [1.85, 2.27, 1.63, 2.51, 1.97, 2.39, 1.74];
    const PHASE_SEEDS = [0.13, 0.71, 0.39, 0.87, 0.24, 0.58, 0.04];
    const dropSpecs = [];
    for (let d = 0; d < NUM_CHANNELS; d++) {
      const dur = DURATIONS[d] * (hasOrbitCap ? 1.52 : 1.0);
      const uT = tSec + PHASE_SEEDS[d] * dur;
      const cyc = Math.floor(uT / dur);
      const ph = (uT - cyc * dur) / dur;

      // Random start delay & duty per cycle so emission timing order looks erratic and natural
      const phStart = 0.03 + hash01(cyc * 43 + d * 17) * (hasOrbitCap ? 0.11 : 0.14);
      const phLen = (hasOrbitCap ? 0.74 : 0.68) + hash01(cyc * 59 + d * 23) * 0.14;
      if (ph < phStart || ph >= phStart + phLen) continue;
      const aPh = (ph - phStart) / phLen;

      // Distinct 3D exit anchor (pOut) != re-entry anchor (pIn)
      const dirOut = randSphereDir(cyc * 61 + d * 83, cyc * 97 + d * 41);
      const outR = baseRad * (0.68 + hash01(cyc * 19 + d * 37) * 0.26);
      const outX = dirOut.x * outR;
      const outY = dirOut.y * outR;
      const outZ = dirOut.z * outR;

      // Re-entry hits a completely separate random point on the 3D surface of the glob
      const inAz = dirOut.az + (hash01(cyc * 79 + d * 7) > 0.5 ? 1 : -1) * (0.75 + hash01(cyc * 89 + d * 29) * 1.55);
      const inZ = clamp(-dirOut.z * 0.35 + (hash01(cyc * 101 + d * 47) - 0.5) * 1.15, -0.92, 0.92);
      const inRxy = Math.sqrt(Math.max(0.06, 1 - inZ * inZ));
      const inR = baseRad * (0.68 + hash01(cyc * 67 + d * 3) * 0.26);
      const inX = Math.cos(inAz) * inRxy * inR;
      const inY = Math.sin(inAz) * inRxy * inR;
      const inZ3 = inZ * inR;

      const arcOutBendX = (hash01(cyc * 103 + d * 5) - 0.5) * 8.0 * scaleP;
      const arcOutBendY = (hash01(cyc * 107 + d * 9) - 0.5) * 8.0 * scaleP;
      const arcInBendX = (hash01(cyc * 109 + d * 15) - 0.5) * 9.5 * scaleP;
      const arcInBendY = (hash01(cyc * 113 + d * 21) - 0.5) * 9.5 * scaleP;
      const dropR = (1.35 + Math.pow(hash01(cyc * 13 + d * 71), 1.45) * 3.15) * scaleP;

      let x3 = 0, y3 = 0, z3 = 0;
      let vx = 0, vy = 0;
      let isFrozen = false;
      let isInOrbit = false;
      let bridgeStrength = 0;
      let anchorPx = scx + outX, anchorPy = scy + outY;
      let anchorAng = Math.atan2(dirOut.y, dirOut.x);
      let silhouetteWeight = 1 - Math.abs(dirOut.z) * 0.72;
      let persp = 1.0;

      const targetRingIdx = (hasRing2Cap && hasRing3Cap) ? (((d + cyc) % 2 === 0) ? 1 : 2) : (hasRing2Cap ? 1 : 2);
      const curBasis = hasOrbitCap ? (targetRingIdx === 2 ? capBasis3 : capBasis2) : null;
      if (curBasis) {
        // Synergy: Ejected drops adhere to Poison ring 2 (and/or outer ring 3), move with it, then pull back into core
        const ejectEnd = 0.16;
        const orbitFrac = 0.28 + hash01(cyc * 71 + d * 19) * 0.38;
        const detachStart = ejectEnd + orbitFrac;
        const tCycleBase = (cyc - PHASE_SEEDS[d]) * dur;
        const tSpawn = tCycleBase + phStart * dur;
        const tAttach = tSpawn + ejectEnd * phLen * dur;
        const tDetach = tSpawn + detachStart * phLen * dur;

        const attachBasis = computeSlot2OrbitBasis(baseR, tAttach, power, targetRingIdx, capActiveCnt);
        const detachBasis = computeSlot2OrbitBasis(baseR, tDetach, power, targetRingIdx, capActiveCnt);
        const thetaAtAttach = Math.atan2(dirOut.y, dirOut.x) + (hash01(cyc * 61 + d) - 0.5) * 0.75;
        const orbitOmega = (hash01(cyc * 83 + d * 37) > 0.2 ? 1 : -1) * (0.30 + hash01(cyc * 97 + d * 13) * 0.16) * curBasis.spinMult;
        const radOffCap = (hash01(cyc * 101 + d * 29) - 0.5) * 4.2 * scaleP;
        const axOffCap = (hash01(cyc * 107 + d * 43) - 0.5) * 2.0 * scaleP;

        const pAtt = attachBasis.projectOffset(attachBasis.ringR, thetaAtAttach, radOffCap, axOffCap);
        const thetaDetach = thetaAtAttach + orbitOmega * (tDetach - tAttach);
        // Final orbital stop before re-entry settles tightly onto the ring line itself (0.22 spread)
        const pDet = detachBasis.projectOffset(detachBasis.ringR, thetaDetach, radOffCap * 0.22, axOffCap * 0.22);

        if (aPh < ejectEnd) {
          const u = easeOutCubic(aPh / ejectEnd);
          const mx = (outX + pAtt.x) * 0.5 + arcOutBendX;
          const my = (outY + pAtt.y) * 0.5 + arcOutBendY;
          const mz = (outZ + pAtt.z) * 0.5;
          x3 = quadVal(outX, mx, pAtt.x, u);
          y3 = quadVal(outY, my, pAtt.y, u);
          z3 = quadVal(outZ, mz, pAtt.z, u);
          vx = pAtt.x - outX;
          vy = pAtt.y - outY;
          bridgeStrength = clamp(1.0 - u * 1.25, 0, 1);
        } else if (aPh < detachStart) {
          // Smooth single-arc inertial arrival glide past the ring contour (NO bouncy springing) before settling onto the ring line
          const wOrb = clamp((aPh - ejectEnd) / Math.max(1e-4, detachStart - ejectEnd), 0, 1);
          const capSizeNorm = Math.pow(hash01(cyc * 13 + d * 71), 1.45);
          // Unimodal glide past the ring line that smoothly sheds radial momentum and settles back to 0
          const capGlideOut = wOrb * Math.exp(-wOrb * 3.8) * (4.0 + capSizeNorm * 12.0) * scaleP;
          const spreadNow = lerp(1.0, 0.25, easeOutCubic(wOrb));
          const thetaNow = thetaAtAttach + orbitOmega * (tSec - tAttach);
          const pNow = curBasis.projectOffset(curBasis.ringR, thetaNow, radOffCap * spreadNow + capGlideOut, axOffCap * spreadNow);
          const pPrev = curBasis.projectOffset(curBasis.ringR, thetaNow - orbitOmega * 0.04, radOffCap * spreadNow + capGlideOut * 0.92, axOffCap * spreadNow);
          x3 = pNow.x;
          y3 = pNow.y;
          z3 = pNow.z;
          vx = pNow.dx - pPrev.dx;
          vy = pNow.dy - pPrev.dy;
          isInOrbit = true;
        } else {
          const u = (aPh - detachStart) / (1.0 - detachStart);
          const easeBack = u * u;
          const mx = (pDet.x + inX) * 0.5 + arcInBendX;
          const my = (pDet.y + inY) * 0.5 + arcInBendY;
          const mz = (pDet.z + inZ3) * 0.5;
          x3 = quadVal(pDet.x, mx, inX, easeBack);
          y3 = quadVal(pDet.y, my, inY, easeBack);
          z3 = quadVal(pDet.z, mz, inZ3, easeBack);
          vx = inX - pDet.x;
          vy = inY - pDet.y;
          anchorPx = scx + inX;
          anchorPy = scy + inY;
          anchorAng = Math.atan2(inY, inX);
          silhouetteWeight = 1 - Math.abs(inZ) * 0.72;
          bridgeStrength = clamp((easeBack - 0.32) * 1.48, 0, 1);
        }
        persp = 115 / (115 - z3);
      } else {
        const hoverAz = dirOut.az + (hash01(cyc * 29 + d * 53) - 0.5) * 1.45;
        const hoverZ = clamp(dirOut.z + (hash01(cyc * 73 + d * 11) - 0.5) * 1.05, -0.94, 0.94);
        const hoverRxy = Math.sqrt(Math.max(0.06, 1 - hoverZ * hoverZ));
        const flightDist = (13.5 + Math.pow(hash01(cyc * 31 + d * 13), 0.85) * 19.0) * scaleP;
        const hovX = Math.cos(hoverAz) * hoverRxy * flightDist;
        const hovY = Math.sin(hoverAz) * hoverRxy * flightDist;
        const hovZ = hoverZ * flightDist;

        if (aPh < 0.24) {
          const u = easeOutCubic(aPh / 0.24);
          const mx = (outX + hovX) * 0.5 + arcOutBendX;
          const my = (outY + hovY) * 0.5 + arcOutBendY;
          const mz = (outZ + hovZ) * 0.5;
          x3 = quadVal(outX, mx, hovX, u);
          y3 = quadVal(outY, my, hovY, u);
          z3 = quadVal(outZ, mz, hovZ, u);
          vx = hovX - outX;
          vy = hovY - outY;
          bridgeStrength = clamp(1.0 - u * 1.25, 0, 1);
        } else if (aPh < 0.64) {
          x3 = hovX;
          y3 = hovY;
          z3 = hovZ;
          isFrozen = true;
        } else {
          const u = (aPh - 0.64) / 0.36;
          const easeBack = u * u;
          const mx = (hovX + inX) * 0.5 + arcInBendX;
          const my = (hovY + inY) * 0.5 + arcInBendY;
          const mz = (hovZ + inZ3) * 0.5;
          x3 = quadVal(hovX, mx, inX, easeBack);
          y3 = quadVal(hovY, my, inY, easeBack);
          z3 = quadVal(hovZ, mz, inZ3, easeBack);
          vx = inX - hovX;
          vy = inY - hovY;
          anchorPx = scx + inX;
          anchorPy = scy + inY;
          anchorAng = Math.atan2(inY, inX);
          silhouetteWeight = 1 - Math.abs(inZ) * 0.72;
          bridgeStrength = clamp((easeBack - 0.32) * 1.48, 0, 1);
        }
        persp = 1.0 / (1.0 - clamp(z3 / (46 * scaleP), -0.34, 0.36));
      }

      dropSpecs.push({
        sx: scx + x3 * persp,
        sy: scy + y3 * persp,
        z3,
        persp,
        isBack: z3 < -1.8 * scaleP,
        r: dropR,
        isFrozen,
        isInOrbit,
        bridgeStrength,
        anchorPx,
        anchorPy,
        anchorAng,
        silhouetteWeight,
        velAng: Math.atan2(vy, vx),
        seed: d * 13 + cyc,
      });
    }

    // 1. Volumetric swirling FBM miasmatic green vapor (zero ctx.filter + strict zero-alpha border + 24Hz update!)
    const miRes = ensureMiasmaResources();
    if (miRes) {
      const { buf, ctx: mCtx, canvas: mCanvas } = miRes;
      const qTick = Math.floor(tSec * 24);
      const mKey = `psn|${qTick}`;
      if (_miasmaCacheKey !== mKey) {
        _miasmaCacheKey = mKey;
        const qT = qTick / 24;
        const { w: mw, h: mh, buf32 } = buf;
        buf32.fill(0);
        const rise = qT * 1.65;
        const turb = qT * 0.85;
        for (let py = 2; py < mh - 2; py++) {
          const yFromBot = (mh - 1 - py) / (mh - 1);
          const dropCenterY = 0.29;
          const yEdgeFade = smoothstep(0.06, 0.22, yFromBot) * smoothstep(0.06, 0.26, 1.0 - yFromBot);
          const vertEnv = (yFromBot < dropCenterY
            ? Math.pow(clamp(yFromBot / dropCenterY, 0, 1), 1.45)
            : Math.pow(clamp(1.0 - (yFromBot - dropCenterY) / (1.0 - dropCenterY), 0, 1), 1.20)) * yEdgeFade;
          if (vertEnv < 0.015) continue;

          const wy = (py / mh) * 3.8 + rise;
          const spreadMax = lerp(0.45, 0.78, clamp((yFromBot - dropCenterY) * 1.35, 0, 1));
          const bendShift = 0.12 * Math.sin(wy * 0.8 + turb * 0.5);
          for (let px = 2; px < mw - 2; px++) {
            const xSigned = (px / (mw - 1) - 0.5) * 2.0;
            const xEdgeFade = smoothstep(0.08, 0.34, 1.0 - Math.abs(xSigned));
            if (xEdgeFade <= 0.01) continue;
            const xBend = xSigned - bendShift;
            const radialEnv = Math.max(0, 1.0 - (xBend * xBend) / (spreadMax * spreadMax)) * xEdgeFade;
            if (radialEnv <= 0.01) continue;

            const wx = xSigned * 2.8 + Math.sin(wy * 0.95 - turb) * 0.48;
            const f1 = Math.sin(wx * 2.7 + Math.cos(wy * 1.9 + turb * 0.7)) * Math.cos(wy * 2.1 - wx * 1.4);
            const f2 = Math.sin(wx * 5.2 - wy * 3.9 + turb * 1.3) * 0.52;
            const density = clamp((0.46 + (f1 + f2) * 0.36) * vertEnv * radialEnv, 0, 1);
            if (density < 0.035) continue;

            const al = clamp(Math.pow(density, 1.22) * 212, 0, 228);
            const tint = clamp(f1 * 0.5 + 0.5, 0, 1);
            const r = lerp(28, 134, tint * density);
            const g = lerp(138, 226, density);
            const b = lerp(42, 74, tint * 0.6);
            buf32[py * mw + px] = packAbgrColor(r, g, b, al);
          }
        }
        smoothMiasmaAndUpload(mCtx, buf);
      }
      const drawW = 76 * scaleP;
      const drawH = 84 * scaleP;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mCanvas, scx - drawW * 0.5, scy - drawH * 0.71, drawW, drawH);
    }

    // Extra subtle miasma wisps drifting off paused satellite droplets
    const wispSp = getPuffRadialSprite('poison_wisp');
    for (let d = 0; d < dropSpecs.length; d++) {
      const ds = dropSpecs[d];
      if (!ds.isFrozen) continue;
      const mR = ds.r * ds.persp * 2.6;
      const wy = ds.sy - 3 * scaleP;
      if (wispSp) {
        ctx.globalAlpha = ds.isBack ? 0.16 : 0.28;
        ctx.drawImage(wispSp, ds.sx - mR, wy - mR, mR * 2, mR * 2);
      } else {
        const wG = ctx.createRadialGradient(ds.sx, wy, 0.4, ds.sx, wy, mR);
        wG.addColorStop(0, `rgba(163, 230, 53, ${ds.isBack ? 0.16 : 0.28})`);
        wG.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = wG;
        ctx.beginPath();
        ctx.arc(ds.sx, wy, mR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (wispSp) ctx.globalAlpha = 1;

    // Back-hemisphere droplets rendered BEHIND mother glob (ordered back-to-front by z3)
    const backDrops = dropSpecs.filter((ds) => ds.isBack).sort((a, b) => a.z3 - b.z3);
    for (let i = 0; i < backDrops.length; i++) drawSingleSatelliteAndBridge(backDrops[i]);

    // 2. Wobbling mother toxic droplet contour + asymmetric metaball pulls toward active eject/return anchors
    const N_PTS = 36;
    const globPts = [];
    for (let i = 0; i < N_PTS; i++) {
      const a = (i / N_PTS) * Math.PI * 2;
      let wob = 1.0
        + 0.085 * Math.sin(2 * a + tSec * 3.8)
        + 0.060 * Math.cos(3 * a - tSec * 2.9)
        + 0.032 * Math.sin(5 * a + tSec * 5.2);
      for (let d = 0; d < dropSpecs.length; d++) {
        const ds = dropSpecs[d];
        const pull = ds.bridgeStrength * 0.28 * ds.silhouetteWeight;
        if (pull <= 0.01) continue;
        let diffA = a - ds.anchorAng;
        while (diffA > Math.PI) diffA -= Math.PI * 2;
        while (diffA < -Math.PI) diffA += Math.PI * 2;
        wob += pull * Math.exp(-(diffA * diffA) / 0.22);
      }
      globPts.push({
        x: scx + Math.cos(a) * baseRad * wob,
        y: scy + Math.sin(a) * baseRad * wob,
      });
    }

    // Smooth closed spline fill & volumetric 3D liquid shading for main poison glob
    ctx.beginPath();
    for (let i = 0; i < N_PTS; i++) {
      const p0 = globPts[i];
      const p1 = globPts[(i + 1) % N_PTS];
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      if (i === 0) {
        const pPrev = globPts[N_PTS - 1];
        ctx.moveTo((pPrev.x + p0.x) * 0.5, (pPrev.y + p0.y) * 0.5);
      }
      ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
    }
    ctx.closePath();

    const pGrad = ctx.createRadialGradient(
      scx - 3.2 * scaleP, scy - 3.4 * scaleP, 1.0,
      scx + 1.5 * scaleP, scy + 2.0 * scaleP, baseRad * 1.25
    );
    pGrad.addColorStop(0, '#d9f99d');
    pGrad.addColorStop(0.28, '#4ade80');
    pGrad.addColorStop(0.72, '#15803d');
    pGrad.addColorStop(1, '#052e16');
    ctx.fillStyle = pGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(132, 204, 22, 0.72)';
    ctx.lineWidth = 0.75 * scaleP;
    ctx.stroke();

    // Inner churning toxin bubbles inside liquid body
    for (let b = 0; b < 3; b++) {
      const ba = tSec * 2.2 * rotMult + b * 2.09;
      const bx = scx + Math.cos(ba) * 3.8 * scaleP;
      const by = scy + Math.sin(ba * 1.3) * 3.4 * scaleP;
      ctx.fillStyle = 'rgba(217, 249, 157, 0.55)';
      ctx.beginPath();
      ctx.arc(bx, by, (1.4 + 0.4 * Math.sin(tSec * 4 + b)) * scaleP, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp liquid specular wet crescent on upper-left shoulder
    ctx.fillStyle = 'rgba(247, 254, 231, 0.85)';
    ctx.beginPath();
    ctx.ellipse(scx - 4.0 * scaleP, scy - 4.2 * scaleP, 3.0 * scaleP, 1.3 * scaleP, -0.58, 0, Math.PI * 2);
    ctx.fill();

    // 3. Front-hemisphere droplets rendered OVER mother glob so they visibly pop out of & dive back into the front face
    const frontDrops = dropSpecs.filter((ds) => !ds.isBack).sort((a, b) => a.z3 - b.z3);
    for (let i = 0; i < frontDrops.length; i++) drawSingleSatelliteAndBridge(frontDrops[i]);
  }

  // --- DESTRUCTION SLOT 2/3 (2): 3D Toxic Miasma Cloud Ring + Embedded Small Emerald Drops ---
  const _poisonOrbitCache = new Map();

  function drawDestructionSlot2PoisonOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, ringSlotIdx = 1, activeCount = 1) {
    const isOuter = ringSlotIdx === 2;
    const scaleP = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04) * (isOuter ? 0.96 : 1.0);
    const frameKey = `${tSec}|${cx}|${cy}|${baseR}|${power}|${activeCount}`;
    let cached = _poisonOrbitCache.get(ringSlotIdx);
    if (!cached || cached.key !== frameKey) {
      const basis = computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
      const thetaShift = isOuter ? 0.50 : 0.0;
      const back = [];
      const front = [];

      const NUM_PUFFS = isOuter ? 30 : 26;
      for (let p = 0; p < NUM_PUFFS; p++) {
        const baseAngle = (p / NUM_PUFFS) * Math.PI * 2 + thetaShift + (hash01(p * 19 + 3) - 0.5) * 0.28;
        const rOff = (hash01(p * 29 + 7) - 0.5) * 8.2 * scaleP;
        const aOff = (hash01(p * 37 + 11) - 0.5) * 3.0 * scaleP + Math.sin(tSec * Math.sqrt(basis.spinMult) * 1.8 + p * 1.4) * 0.9 * scaleP;
        const puffSizeNorm = hash01(p * 43) * 0.55;
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle, angRate: 0.32, radOff: rOff, axOff: aOff,
          sizeNorm: puffSizeNorm, pieceSeed: p * 19 + 503,
          pieceKey: `psn_pf_${ringSlotIdx}_${p}`,
          swingGain: 0.35, basisNow: basis,
        });
        const isBack = proj.z < 0;
        const rec = { kind: 'puff', z: proj.z, p, sx: cx + proj.dx, sy: cy + proj.dy, persp: proj.persp, isBack };
        if (isBack) back.push(rec); else front.push(rec);
      }

      const NUM_RING_DROPS = isOuter ? 15 : 12;
      for (let i = 0; i < NUM_RING_DROPS; i++) {
        const dropSizeNorm = Math.pow(hash01(i * 61 + 17), 1.15);
        const dropR = (isOuter ? 0.90 : 1.0) * (1.15 + dropSizeNorm * 1.85) * scaleP;
        const baseAngle = (i / NUM_RING_DROPS) * Math.PI * 2 + thetaShift + (hash01(i * 41 + 9) - 0.5) * 0.30;
        const rOff = (hash01(i * 47 + 5) - 0.5) * 5.8 * scaleP;
        const aOff = (hash01(i * 53 + 13) - 0.5) * 2.4 * scaleP + Math.cos(tSec * Math.sqrt(basis.spinMult) * 1.6 + i * 2.1) * 0.8 * scaleP;
        const proj = computeInertialRingPiece({
          baseR, tSec, power, ringSlotIdx, activeCount,
          baseAngle, angRate: 0.38, radOff: rOff, axOff: aOff,
          sizeNorm: dropSizeNorm, pieceSeed: i * 41 + 607,
          pieceKey: `psn_drp_${ringSlotIdx}_${i}`,
          swingGain: 1.0, basisNow: basis,
        });
        const isBack = proj.z < 0;
        const rec = {
          kind: 'drop', z: proj.z, i,
          sx: cx + proj.dx, sy: cy + proj.dy,
          persp: proj.persp, isBack, r: dropR, velAng: proj.velAng, speedRatio: proj.speedRatio,
        };
        if (isBack) back.push(rec); else front.push(rec);
      }
      back.sort((a, b) => a.z - b.z);
      front.sort((a, b) => a.z - b.z);
      cached = { key: frameKey, back, front };
      _poisonOrbitCache.set(ringSlotIdx, cached);
    }

    const items = passPhase === 'back' ? cached.back : (passPhase === 'front' ? cached.front : cached.back.concat(cached.front));
    if (items.length === 0) return;

    ctx.save();
    const psnPuffSp = getPuffRadialSprite('poison');
    const baseOrbA = ctx.globalAlpha;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'puff') {
        const vr = (5.4 + 2.5 * hash01(it.p * 43)) * it.persp * scaleP;
        const waveA = 0.21 + 0.07 * Math.sin(tSec * 2.3 + it.p * 1.9);
        const a = clamp(waveA * (it.isBack ? 0.68 : 1.0), 0.08, 0.32);
        if (psnPuffSp) {
          ctx.globalAlpha = baseOrbA * a;
          ctx.drawImage(psnPuffSp, it.sx - vr, it.sy - vr, vr * 2, vr * 2);
          ctx.globalAlpha = baseOrbA;
        } else {
          const pg = ctx.createRadialGradient(it.sx, it.sy, 0.3, it.sx, it.sy, vr);
          pg.addColorStop(0, `rgba(132, 224, 72, ${a.toFixed(3)})`);
          pg.addColorStop(0.50, `rgba(34, 197, 94, ${(a * 0.60).toFixed(3)})`);
          pg.addColorStop(1, 'rgba(20, 83, 45, 0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(it.sx, it.sy, vr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const appR = it.r * it.persp;
        const stretch = clamp(1.04 + ((it.speedRatio || 1) - 0.85) * 0.14, 1.02, 1.30);
        const squash = clamp(1.0 / Math.sqrt(stretch), 0.82, 0.98);
        drawWetToxicDroplet(ctx, it.sx, it.sy, appR * stretch, appR * squash, it.velAng, Math.max(0.35, appR * 0.25), it.isBack);
      }
    }
    ctx.restore();
  }

  // --- DESTRUCTION SLOT 1 (3 active effects): Volumetric element cloud enveloping the central core (all except Shock) ---
  // Fire: superheated rising gas + dark smoke; Magic: azure arcane vapor + indigo smoke;
  // Cold: sinking frost fog + glittering ice motes; Poison: swirling toxic miasma + murky fumes.
  function getEnvelopeCloudStyle(elKey) {
    if (elKey === 'fire' || elKey === 'magic') {
      const pal = getMagmaPalette(elKey === 'magic');
      return {
        inner: pal.flameIn,
        mid: pal.flameMid,
        outer: pal.flameOut,
        smoke: elKey === 'magic' ? '12, 22, 74' : '46, 22, 14',
        smokeA: elKey === 'magic' ? 0.26 : 0.30,
        rise: elKey === 'magic' ? 9.0 : 13.0,
        bodyA: 0.29,
        glints: false,
      };
    }
    if (elKey === 'cold') {
      return {
        inner: '236, 249, 255',
        mid: '150, 216, 250',
        outer: '56, 140, 220',
        smoke: null,
        smokeA: 0,
        rise: -8.5,
        bodyA: 0.32,
        glints: true,
      };
    }
    return {
      inner: '196, 244, 110',
      mid: '74, 200, 80',
      outer: '22, 101, 52',
      smoke: '18, 52, 24',
      smokeA: 0.28,
      rise: 4.5,
      bodyA: 0.31,
      glints: false,
    };
  }

  function drawSlot1EnvelopeCloud(ctx, cx, cy, baseR, tSec, power, elKey, passPhase, rotMult) {
    const st = getEnvelopeCloudStyle(elKey);
    const scaleC = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04);
    const rotT = tSec * (rotMult || 1);
    const isFront = passPhase === 'front';
    const NUM = 38;
    const puffs = [];

    for (let i = 0; i < NUM; i++) {
      const h1 = hash01(i * 17 + 3);
      const h2 = hash01(i * 29 + 7);
      const h3 = hash01(i * 41 + 11);
      // Each puff lives a slow cycle: billows out, drifts (rises for heat / sinks for frost), dissolves, respawns
      const cyc = 2.6 + h3 * 1.6;
      const uT = tSec / cyc + h1;
      const ph = uT - Math.floor(uT);
      const env = Math.sin(ph * Math.PI);
      if (env < 0.04) continue;

      const az = h1 * Math.PI * 2 + rotT * (0.32 + h2 * 0.18) * (i % 4 === 0 ? -0.6 : 1.0);
      const el = (h2 - 0.5) * 1.9 + Math.sin(tSec * 0.7 + i * 1.3) * 0.18;
      const shell = (10.5 + h3 * 10.0 + env * 3.2) * scaleC;
      const x = Math.cos(el) * Math.cos(az) * shell;
      const z = Math.cos(el) * Math.sin(az) * shell;
      const y = Math.sin(el) * shell * 0.82 - (ph - 0.5) * st.rise * 2.2 * scaleC;
      if (isFront ? z < 0 : z >= 0) continue;

      const persp = 115 / (115 - z);
      const isSmoke = Boolean(st.smoke) && (i % 4 === 1) && (z < 0 || shell > 16 * scaleC);
      puffs.push({
        i,
        sx: cx + x * persp,
        sy: cy + y * persp,
        z,
        r: (6.2 + h2 * 5.6) * (0.74 + env * 0.48) * persp * scaleC,
        a: env,
        isSmoke,
      });
    }
    puffs.sort((a, b) => a.z - b.z);

    ctx.save();
    // Soft dense volumetric haze body behind the core
    if (!isFront) {
      const hazeR = 25 * scaleC;
      const pulse = 1 + 0.05 * Math.sin(tSec * 1.6);
      const hg = ctx.createRadialGradient(cx, cy, 1, cx, cy, hazeR * pulse);
      hg.addColorStop(0, `rgba(${st.mid}, ${(st.bodyA * 0.95).toFixed(3)})`);
      hg.addColorStop(0.55, `rgba(${st.outer}, ${(st.bodyA * 0.55).toFixed(3)})`);
      hg.addColorStop(1, `rgba(${st.outer}, 0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy, hazeR * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    const frontDim = isFront ? 0.52 : 1.0;
    const bodySp = getEnvelopeRadialSprite(elKey, false);
    const smokeSp = st.smoke ? getEnvelopeRadialSprite(elKey, true) : null;
    for (let k = 0; k < puffs.length; k++) {
      const p = puffs[k];
      if (p.isSmoke) {
        const sa = clamp(st.smokeA * p.a * frontDim, 0, 0.3);
        const sr = p.r * 1.15;
        if (smokeSp) {
          ctx.globalAlpha = sa;
          ctx.drawImage(smokeSp, p.sx - sr, p.sy - sr, sr * 2, sr * 2);
        } else {
          const sg = ctx.createRadialGradient(p.sx, p.sy, 0.4, p.sx, p.sy, sr);
          sg.addColorStop(0, `rgba(${st.smoke}, ${sa.toFixed(3)})`);
          sg.addColorStop(0.6, `rgba(${st.smoke}, ${(sa * 0.5).toFixed(3)})`);
          sg.addColorStop(1, `rgba(${st.smoke}, 0)`);
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      const a = clamp(st.bodyA * (0.55 + p.a * 0.75) * frontDim, 0, 0.38);
      if (bodySp) {
        ctx.globalAlpha = a;
        ctx.drawImage(bodySp, p.sx - p.r, p.sy - p.r, p.r * 2, p.r * 2);
      } else {
        const g = ctx.createRadialGradient(p.sx, p.sy, 0.4, p.sx, p.sy, p.r);
        g.addColorStop(0, `rgba(${st.inner}, ${(a * 0.70).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(${st.mid}, ${a.toFixed(3)})`);
        g.addColorStop(0.75, `rgba(${st.outer}, ${(a * 0.45).toFixed(3)})`);
        g.addColorStop(1, `rgba(${st.outer}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Cold: tiny twinkling ice motes suspended inside the frost fog
    if (st.glints) {
      for (let m = 0; m < 14; m++) {
        const az = hash01(m * 13 + 1) * Math.PI * 2 + rotT * 0.28;
        const el = (hash01(m * 19 + 5) - 0.5) * 1.8;
        const rr = (9 + hash01(m * 23 + 9) * 12) * scaleC;
        const z = Math.cos(el) * Math.sin(az) * rr;
        if (isFront ? z < 0 : z >= 0) continue;
        const tw = Math.max(0, Math.sin(tSec * 3.4 + m * 2.7));
        if (tw < 0.35) continue;
        const persp = 115 / (115 - z);
        const gx = cx + Math.cos(el) * Math.cos(az) * rr * persp;
        const gy = cy + Math.sin(el) * rr * 0.82 * persp;
        ctx.fillStyle = `rgba(245, 252, 255, ${(0.35 + tw * 0.55).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(gx, gy, Math.max(0.4, 0.55 * persp * scaleC), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawDestructionSlot1Core(ctx, school, cx, cy, baseR, tSec, power, shockFrameArg, poisonCapture, activeCount = 1) {
    ctx.save();
    ctx.globalAlpha = 1.0;
    const elKey = school.elementKey || 'fire';
    const rotMult = getGlobalRotMult(activeCount);
    const hasCloud = (activeCount || 0) >= 3 && elKey !== 'shock';
    if (hasCloud) drawSlot1EnvelopeCloud(ctx, cx, cy, baseR, tSec, power, elKey, 'back', rotMult);
    if (elKey === 'cold') {
      renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, 0.65, (lCtx, lx, ly) => {
        drawFrostCrystalCore(lCtx, lx, ly, baseR, tSec, power, rotMult);
      });
    } else if (elKey === 'shock') {
      const shockFrame = shockFrameArg || computeShockStrikeFrame(tSec);
      const relayBoost = (shockFrame.nodes2 && shockFrame.nodes3) ? 0.56 : (shockFrame.isDoubleShock ? 0.50 : 0.38);
      const bloomBoost = clamp(0.76 + shockFrame.strikeFlash * relayBoost, 0.74, 1.42);
      renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, bloomBoost, (lCtx, lx, ly) => {
        drawBallLightningCore(lCtx, lx, ly, baseR, tSec, power, shockFrame);
      });
    } else if (elKey === 'poison') {
      renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, 0.88, (lCtx, lx, ly) => {
        drawPoisonDropCore(lCtx, lx, ly, baseR, tSec, power, poisonCapture || null, rotMult);
      });
    } else {
      // 'fire' and 'magic' use the exact same 3D magma droplet + fire renderer, recolored deep azure-blue for Magic
      const isMagic = elKey === 'magic';
      renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, 0.78, (lCtx, lx, ly) => {
        drawMagmaDropCore(lCtx, lx, ly, baseR, tSec, power, isMagic, rotMult);
      });
    }
    if (hasCloud) drawSlot1EnvelopeCloud(ctx, cx, cy, baseR, tSec, power, elKey, 'front', rotMult);
    ctx.restore();
  }

  function drawDestructionSlot2Orbit(ctx, school, cx, cy, baseR, tSec, power, passPhase, shockFrameArg, ringSlotIdx = 1, activeCount = 1) {
    ctx.save();
    ctx.globalAlpha = clamp(0.76 + power * 0.24, 0.76, 1.0);
    const elKey = school.elementKey || 'fire';
    if (elKey === 'cold') {
      drawDestructionSlot2ColdOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, ringSlotIdx, activeCount);
    } else if (elKey === 'shock') {
      drawDestructionSlot2ShockOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, shockFrameArg, ringSlotIdx, activeCount);
    } else if (elKey === 'poison') {
      drawDestructionSlot2PoisonOrbit(ctx, cx, cy, baseR, tSec, power, passPhase, ringSlotIdx, activeCount);
    } else {
      drawDestructionSlot2MagmaOrbit(ctx, cx, cy, baseR, tSec, power, elKey === 'magic', passPhase, ringSlotIdx, activeCount);
    }
    ctx.restore();
  }

  // --- VOLUMETRIC 3D GODRAY ENGINE & ANALYTICAL 3D RING-OCCLUSION (Restoration id === 23) ---
  let cachedVolumetricBeamTex = null;
  function getVolumetricBeamTexture() {
    if (cachedVolumetricBeamTex) return cachedVolumetricBeamTex;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const w = 128;
    const h = 96;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const halfH = (h - 1) * 0.5;
    for (let py = 0; py < h; py++) {
      const yNorm = (py - halfH) / halfH; // -1..+1
      for (let px = 0; px < w; px++) {
        const u = px / (w - 1); // 0 (root) -> 1 (far tip)
        // Smoothly diverging volumetric cone with true Gaussian lateral feathering (zero hard triangle edges)
        const coneHalfW = 0.14 + 0.82 * Math.pow(u, 0.90);
        const lat = yNorm / coneHalfW;
        const latGauss = Math.exp(-lat * lat * 3.3);
        const coreSpine = 0.62 + 0.38 * Math.exp(-lat * lat * 11.5);
        const rootSoft = smoothstep(0.0, 0.04, u);
        const axDecay = rootSoft * Math.pow(1.0 - u, 1.38);
        const a = clamp(latGauss * coreSpine * axDecay, 0, 1);
        // Spectral shift: incandescent pale gold near origin -> sunlit gold -> warm amber tail
        const r = Math.round(lerp(255, 240, u));
        const g = Math.round(lerp(249, 158, Math.pow(u, 0.80)));
        const b = Math.round(lerp(212, 22, Math.pow(u, 0.62)));
        const idx = (py * w + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    cachedVolumetricBeamTex = cv;
    return cv;
  }

  // Unified 3D world-space orthonormal basis (U, V, N) for a Restoration hoop — shared by rendering & exact 3D occlusion
  function computeRestorationHoopTransform(hoopSpec, baseR, tSec, power) {
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const R = baseR * hoopSpec.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const hH = hoopSpec.bandHalfH * scaleH;
    const cosX = Math.cos(hoopSpec.pitchXRad);
    const sinX = Math.sin(hoopSpec.pitchXRad);
    const orbit = (hoopSpec.orbitPhase || 0) + tSec * (hoopSpec.baseOrbit || 0.30) * hoopSpec.speedMult * (hoopSpec.orbitDir || 1);
    const cosY = Math.cos(orbit);
    const sinY = Math.sin(orbit);
    const cosZ = Math.cos(hoopSpec.tiltZRad);
    const sinZ = Math.sin(hoopSpec.tiltZRad);
    const spin = tSec * hoopSpec.baseSpin * hoopSpec.speedMult * (hoopSpec.spinDir || 1);

    // Orthonormal columns of M = R_z(tiltZ) * R_y(orbit) * R_x(pitchX)
    const ux = cosY * cosZ;
    const uy = cosY * sinZ;
    const uz = -sinY;

    const vx = sinX * sinY * cosZ - cosX * sinZ;
    const vy = sinX * sinY * sinZ + cosX * cosZ;
    const vz = sinX * cosY;

    const nx = cosX * sinY * cosZ + sinX * sinZ;
    const ny = cosX * sinY * sinZ - sinX * cosZ;
    const nz = cosX * cosY;

    return {
      id: hoopSpec.id,
      scaleH, R, hH, orbit, spin,
      cosX, sinX, cosY, sinY, cosZ, sinZ,
      ux, uy, uz, vx, vy, vz, nx, ny, nz,
    };
  }

  // Build sorted list of active 3D outer-ring cylindrical occluders (all Restoration hoops + any Destruction 3D orbital rings)
  function buildSpellGodrayOccluders(analysis, restoCfg, baseR, tSec, power) {
    const list = [];
    if (restoCfg) {
      if (restoCfg.slot2) list.push(computeRestorationHoopTransform(restoCfg.slot2, baseR, tSec, power));
      if (restoCfg.middle) list.push(computeRestorationHoopTransform(restoCfg.middle, baseR, tSec, power));
      if (restoCfg.slot3) list.push(computeRestorationHoopTransform(restoCfg.slot3, baseR, tSec, power));
    }
    const slots = (analysis && analysis.slots) || [];
    const activeCount = (analysis && analysis.activeCount) || 1;
    const scaleH = baseR / 17.5;
    for (let sIdx = 1; sIdx <= 2; sIdx++) {
      const sl = slots[sIdx];
      if (sl && sl.id === 22) {
        const b = computeSlot2OrbitBasis(baseR, tSec, power, sIdx, activeCount);
        const bu = b.u || b.rotateLocal(1, 0, 0);
        const bv = b.v || b.rotateLocal(0, 1, 0);
        const bn = b.n || b.rotateLocal(0, 0, 1);
        list.push({
          id: 'destr_slot' + (sIdx + 1),
          R: b.ringR,
          hH: 3.6 * scaleH,
          ux: bu.x, uy: bu.y, uz: bu.z,
          vx: bv.x, vy: bv.y, vz: bv.z,
          nx: bn.x, ny: bn.y, nz: bn.z,
        });
      }
    }
    // Also include Alteration carapace rings (e.g. Restoration Slot 1 + Alteration Slot 2/3!)
    const altCfg = computeAlterationConfig(analysis);
    if (altCfg) {
      const aScale = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
      const altRings = (altCfg.slot2Rings || []).slice();
      if (altCfg.slot3Layer && altCfg.slot3Layer.kind === 'carapace_ring') {
        altRings.push(altCfg.slot3Layer);
      }
      for (let i = 0; i < altRings.length; i++) {
        const ar = altRings[i];
        const ang = computeAlterationWanderAngles(tSec, ar.speedMult, ar.seed);
        const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
        const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
        const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
        list.push({
          id: ar.id,
          R: baseR * ar.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
          hH: ar.bandHalfH * aScale,
          ux: u.x, uy: u.y, uz: u.z,
          vx: v.x, vy: v.y, vz: v.z,
          nx: n.x, ny: n.y, nz: n.z,
        });
      }
    }
    // Also include Illusion polygonal dual hoops (e.g. Restoration Slot 1 + Illusion Slot 2 & 3!)
    const illCfg = computeIllusionConfig(analysis);
    if (illCfg && illCfg.isDualHoops && illCfg.hoops) {
      const hScale = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
      for (let i = 0; i < illCfg.hoops.length; i++) {
        const hp = illCfg.hoops[i];
        const ang = computeIllusionWanderAngles(tSec, hp.speedMult, hp.seed);
        const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
        const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
        const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
        list.push({
          id: hp.id,
          R: baseR * hp.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
          hH: hp.bandHalfH * hScale,
          ux: u.x, uy: u.y, uz: u.z,
          vx: v.x, vy: v.y, vz: v.z,
          nx: n.x, ny: n.y, nz: n.z,
        });
      }
    }
    // Also include Thaumaturgy framed magi-tech schematic hoops (e.g. Restoration Slot 1 + Thaumaturgy Slot 2/3!)
    const thaumCfg = computeThaumaturgyConfig(analysis);
    if (thaumCfg) {
      const thScale = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
      const thHoops = [];
      if (thaumCfg.slot2Layer && thaumCfg.slot2Layer.kind === 'schematic_hoop') thHoops.push(thaumCfg.slot2Layer);
      if (thaumCfg.slot3Layers) {
        for (let i = 0; i < thaumCfg.slot3Layers.length; i++) thHoops.push(thaumCfg.slot3Layers[i]);
      }
      for (let i = 0; i < thHoops.length; i++) {
        const th = thHoops[i];
        const ang = computeThaumaturgyHoopAngles(tSec, th.speedMult, th.seed);
        const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
        const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
        const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
        list.push({
          id: th.id,
          R: baseR * th.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
          hH: th.bandHalfH * thScale,
          ux: u.x, uy: u.y, uz: u.z,
          vx: v.x, vy: v.y, vz: v.z,
          nx: n.x, ny: n.y, nz: n.z,
        });
      }
    }
    // Also include Mysticism Daedric hoops (e.g. Restoration Slot 1 + Mysticism Slot 3!)
    const mystCfg = computeMysticismConfig(analysis);
    if (mystCfg && mystCfg.slot3Layers) {
      const mScale = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
      for (let i = 0; i < mystCfg.slot3Layers.length; i++) {
        const mh = mystCfg.slot3Layers[i];
        const ang = computeMysticismHoopAngles(tSec, mh.speedMult, mh.seed);
        const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
        const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
        const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
        list.push({
          id: mh.id,
          R: baseR * mh.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
          hH: mh.bandHalfH * mScale,
          ux: u.x, uy: u.y, uz: u.z,
          vx: v.x, vy: v.y, vz: v.z,
          nx: n.x, ny: n.y, nz: n.z,
        });
      }
    }
    list.sort((a, b) => a.R - b.R);
    return list;
  }

  // Exact analytical 3D ray-cylinder intersection against all outer rings with R > minR.
  // Returns { hitS, trans, occluded, hitRingId } where hitS is world distance along ray & trans is smooth penumbra transmission.
  function computeRayRingOcclusion(ox, oy, oz, dx, dy, dz, maxLen, occluders, minR = 0) {
    if (!occluders || occluders.length === 0) {
      return { hitS: maxLen, trans: 1.0, occluded: false, hitRingId: null };
    }
    let bestHitS = maxLen;
    let totalTrans = 1.0;
    let hitRingId = null;

    for (let i = 0; i < occluders.length; i++) {
      const H = occluders[i];
      if (H.R <= minR + 0.6) continue;
      // Project origin & unit ray direction into hoop's local orthonormal frame (U, V, N)
      const olx = ox * H.ux + oy * H.uy + oz * H.uz;
      const oly = ox * H.vx + oy * H.vy + oz * H.vz;
      const olz = ox * H.nx + oy * H.ny + oz * H.nz;
      const dlx = dx * H.ux + dy * H.uy + dz * H.uz;
      const dly = dx * H.vx + dy * H.vy + dz * H.vz;
      const dlz = dx * H.nx + dy * H.ny + dz * H.nz;

      const a = dlx * dlx + dly * dly;
      if (a < 1e-6) continue;
      const b = 2 * (olx * dlx + oly * dly);
      const c = olx * olx + oly * oly - H.R * H.R;
      const disc = b * b - 4 * a * c;
      if (disc <= 0) continue;
      const sqrtD = Math.sqrt(disc);
      // Pick smallest positive intersection with the cylinder surface
      let sHit = (-b - sqrtD) / (2 * a);
      if (sHit <= 0.5) sHit = (-b + sqrtD) / (2 * a);
      if (sHit <= 0.5 || sHit >= maxLen) continue;

      const zHit = Math.abs(olz + sHit * dlz);
      const halfBand = H.hH * 1.18;
      if (zHit < halfBand * 1.42) {
        // Inside the physical band: blocks ~94% of inner light; smooth penumbra across outer rim edge
        const tEdge = smoothstep(halfBand * 0.72, halfBand * 1.42, zHit);
        const localTrans = 0.06 + 0.94 * tEdge;
        if (localTrans < 0.98 && sHit < bestHitS) {
          bestHitS = sHit;
          hitRingId = H.id;
        }
        totalTrans *= localTrans;
      }
    }

    return {
      hitS: bestHitS,
      trans: clamp(totalTrans, 0.04, 1.0),
      occluded: totalTrans < 0.96,
      hitRingId,
    };
  }

  function projWorldPoint(wx, wy, wz, cx, cy) {
    const persp = 128 / Math.max(24, 128 - wz);
    return { sx: cx + wx * persp, sy: cy + wy * persp, persp, wx, wy, wz };
  }

  // Render a single Gaussian-feathered volumetric shaft with optional smooth 3D occlusion truncation at clipFrac
  function drawVolumetricGodrayBeam(ctx, beamTex, x0, y0, ang, screenLen, halfW, alpha, clipFrac, trans) {
    if (alpha < 0.004 || screenLen < 2.5 || halfW < 0.8) return;
    if (beamTex) {
      const prevA = ctx.globalAlpha;
      const tw = beamTex.width;
      const th = beamTex.height;
      ctx.translate(x0, y0);
      ctx.rotate(ang);
      if (clipFrac >= 0.985 || trans >= 0.96) {
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(beamTex, 0, 0, tw, th, 0, -halfW, screenLen, halfW * 2);
      } else {
        // 1. Faint attenuated remainder leaking beyond the translucent energy hoop
        if (trans > 0.03) {
          ctx.globalAlpha = clamp(alpha * trans, 0, 1);
          ctx.drawImage(beamTex, 0, 0, tw, th, 0, -halfW, screenLen, halfW * 2);
        }
        // 2. Unobstructed bright inner portion cleanly truncated with a 2-step soft penumbra right at the outer ring!
        const blockedA = alpha * (1.0 - trans);
        const f1 = clamp(clipFrac * 0.93, 0.03, 0.99);
        const f2 = clamp(clipFrac * 1.03, 0.04, 1.0);
        ctx.globalAlpha = clamp(blockedA * 0.62, 0, 1);
        ctx.drawImage(beamTex, 0, 0, tw * f1, th, 0, -halfW, screenLen * f1, halfW * 2);
        ctx.globalAlpha = clamp(blockedA * 0.38, 0, 1);
        ctx.drawImage(beamTex, 0, 0, tw * f2, th, 0, -halfW, screenLen * f2, halfW * 2);
      }
      ctx.rotate(-ang);
      ctx.translate(-x0, -y0);
      ctx.globalAlpha = prevA;
      return;
    }
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    const useLen = clipFrac < 0.985 ? screenLen * clipFrac : screenLen;
    const g = ctx.createLinearGradient(0, 0, useLen, 0);
    g.addColorStop(0, `rgba(255, 248, 206, ${clamp(alpha, 0, 1).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(253, 206, 62, ${clamp(alpha * 0.45, 0, 1).toFixed(3)})`);
    g.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -halfW * 0.15);
    ctx.lineTo(useLen, -halfW * 0.7);
    ctx.lineTo(useLen, halfW * 0.7);
    ctx.lineTo(0, halfW * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --- RESTORATION SLOT 1 3D VOLUMETRIC GODRAYS (Split into 'back' dz<0 & 'front' dz>=0 + camera-facing flares!) ---
  function drawRestorationSlot1Godrays(ctx, cx, cy, baseR, tSec, power, passPhase, occluders) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const beamTex = getVolumetricBeamTexture();
    const isBackPass = passPhase === 'back';
    const isFrontPass = passPhase === 'front';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Helper: cast & draw one living 3D spherical volumetric shaft with 3-sliver penumbra slicing against outer hoops
    function emit3dShaft(dx0, dy0, dz0, worldLen, spreadHalfW, baseAlpha, env, isCameraForward) {
      if (env < 0.015) return;
      const isBack = dz0 < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;

      const camAlign = clamp(dz0, 0, 1);
      const camFactor = smoothstep(0.46, 0.94, camAlign);

      // Build tangent vectors perpendicular to ray direction for 3-sliver volumetric shadow slicing
      let tx = -dy0;
      let ty = dx0;
      let tz = 0;
      const tLen = Math.hypot(tx, ty);
      if (tLen > 1e-3) { tx /= tLen; ty /= tLen; } else { tx = 1; ty = 0; }
      // Second perpendicular vector (cross product d x t)
      const bx = dy0 * tz - dz0 * ty;
      const by = dz0 * tx - dx0 * tz;
      const bz = dx0 * ty - dy0 * tx;

      // Test center ray first: only split into 3 penumbra slivers when outer rings actually intercept this shaft!
      const hasOcc = occluders && occluders.length > 0;
      const occCenter = hasOcc ? computeRayRingOcclusion(0, 0, 0, dx0, dy0, dz0, worldLen, occluders, 0) : { hitS: worldLen, trans: 1.0, occluded: false };
      const useSlivers = hasOcc && occCenter.occluded;
      const sliverCount = useSlivers ? 2 : 1;
      const sliverWidthScale = useSlivers ? 0.78 : 1.0;

      let centerTrans = occCenter.trans;
      let centerHitP = null;

      for (let s = 0; s < sliverCount; s++) {
        let sdx = dx0, sdy = dy0, sdz = dz0;
        let occ = occCenter;
        let wgt = 1.0;
        if (useSlivers) {
          const sgn = s === 0 ? -1 : 1;
          sdx = dx0 + sgn * (tx * 0.036 + bx * 0.015);
          sdy = dy0 + sgn * (ty * 0.036 + by * 0.015);
          sdz = dz0 + sgn * (bz * 0.015);
          const invL = 1 / (Math.hypot(sdx, sdy, sdz) || 1);
          sdx *= invL; sdy *= invL; sdz *= invL;
          occ = computeRayRingOcclusion(0, 0, 0, sdx, sdy, sdz, worldLen, occluders, 0);
          wgt = 0.56;
        }

        const p0 = projWorldPoint(sdx * 1.8 * scaleR, sdy * 1.8 * scaleR, sdz * 1.8 * scaleR, cx, cy);
        const p1 = projWorldPoint(sdx * worldLen, sdy * worldLen, sdz * worldLen, cx, cy);
        const screenLen = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);

        if (screenLen > 5.0) {
          const ang = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
          let clipFrac = 1.0;
          if (occ.occluded) {
            const pHit = projWorldPoint(sdx * occ.hitS, sdy * occ.hitS, sdz * occ.hitS, cx, cy);
            const hitScreenLen = Math.hypot(pHit.sx - p0.sx, pHit.sy - p0.sy);
            clipFrac = clamp(hitScreenLen / screenLen, 0.04, 0.99);
            if (!centerHitP) centerHitP = pHit;
          }
          const perspGain = isBack ? (0.64 + 0.36 * (1 + sdz)) : (0.94 + 0.28 * sdz);
          const halfW = spreadHalfW * sliverWidthScale * (0.78 + 0.36 * p1.persp);
          const aUse = baseAlpha * env * wgt * perspGain;
          drawVolumetricGodrayBeam(ctx, beamTex, p0.sx, p0.sy, ang, screenLen, halfW, aUse, clipFrac, occ.trans);
        }
      }

      // Subtle warm edge-scatter catch-glow right where a strong inner beam strikes an outer hoop!
      if (centerHitP && centerTrans < 0.55) {
        const catchA = clamp(baseAlpha * env * (1.0 - centerTrans) * 0.52, 0, 0.22);
        const catchR = (3.6 + spreadHalfW * 0.18) * centerHitP.persp;
        const catchSp = getPuffRadialSprite('resto_catch');
        if (catchSp) {
          const prevA = ctx.globalAlpha;
          ctx.globalAlpha = catchA;
          ctx.drawImage(catchSp, centerHitP.sx - catchR, centerHitP.sy - catchR, catchR * 2, catchR * 2);
          ctx.globalAlpha = prevA;
        } else {
          const cg = ctx.createRadialGradient(centerHitP.sx, centerHitP.sy, 0.3, centerHitP.sx, centerHitP.sy, catchR);
          cg.addColorStop(0, `rgba(255, 250, 224, ${catchA.toFixed(3)})`);
          cg.addColorStop(0.55, `rgba(255, 214, 84, ${(catchA * 0.45).toFixed(3)})`);
          cg.addColorStop(1, 'rgba(245, 158, 11, 0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(centerHitP.sx, centerHitP.sy, catchR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Camera-facing volumetric forward flare (reuses occCenter when worldLen >= 60*scaleR!)
      if (!isBack && camFactor > 0.04) {
        const occCam = hasOcc ? (occCenter.occluded && occCenter.hitS <= 60 * scaleR ? occCenter : computeRayRingOcclusion(0, 0, 0, dx0, dy0, dz0, 60 * scaleR, occluders, 0)) : occCenter;
        const flareTrans = occCam.occluded ? Math.max(0.14, occCam.trans) : 1.0;
        const flareShift = (isCameraForward ? 9.5 : 13.5) * (1.0 - camFactor * 0.55) * scaleR;
        const fx = cx + dx0 * flareShift;
        const fy = cy + dy0 * flareShift;
        const fR = ((isCameraForward ? 15.5 : 11.5) + camFactor * 16.0) * scaleR;
        const flareA = clamp(baseAlpha * env * camFactor * flareTrans * (isCameraForward ? 0.92 : 0.62), 0, 0.34);
        if (flareA > 0.008) {
          const flareSp = getPuffRadialSprite('resto_flare');
          if (flareSp) {
            const prevA = ctx.globalAlpha;
            ctx.globalAlpha = flareA;
            ctx.drawImage(flareSp, fx - fR, fy - fR, fR * 2, fR * 2);
            ctx.globalAlpha = prevA;
          } else {
            const fg = ctx.createRadialGradient(fx, fy, 0.6, fx, fy, fR);
            fg.addColorStop(0, `rgba(255, 252, 232, ${flareA.toFixed(3)})`);
            fg.addColorStop(0.32, `rgba(255, 232, 140, ${(flareA * 0.68).toFixed(3)})`);
            fg.addColorStop(0.68, `rgba(248, 186, 46, ${(flareA * 0.24).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.arc(fx, fy, fR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 1. 34 Wide Atmospheric Volumetric 3D Shafts distributed across the full 3D sphere,
    //    each smoothly fading in & out on an independent lifecycle and gently drifting in 3D space
    const WIDE_SHAFTS = 26;
    for (let i = 0; i < WIDE_SHAFTS; i++) {
      const hPeriod = hash01(i * 17 + 3);
      const hPhase = hash01(i * 29 + 11);
      const period = 3.0 + hPeriod * 3.4;
      const cyc = tSec / period + hPhase;
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.65);
      if (env < 0.015) continue;

      // Fresh smooth 3D unit vector on the sphere per lifecycle generation + gentle continuous 3D drift
      const seed = gen * 97 + i * 31 + 7;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.92;
      const driftAz = (life - 0.5) * 0.26 * (i % 2 === 0 ? 1 : -1);
      const az = hash01(seed + 2) * Math.PI * 2 + driftAz + tSec * 0.025;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const dx = Math.cos(az) * rXY;
      const dy = Math.sin(az) * rXY;
      const dz = clamp(uZ + Math.sin(life * Math.PI * 2) * 0.06, -0.98, 0.98);
      const inv = 1 / (Math.hypot(dx, dy, dz) || 1);

      const hLen = hash01(seed + 3);
      const hWid = hash01(seed + 4);
      const worldLen = (58 + hLen * 54) * scaleR * (0.88 + power * 0.22);
      const spreadHalfW = (7.2 + hWid * 7.8) * scaleR;
      const baseAlpha = (0.14 + hLen * 0.11) * (0.86 + power * 0.22);
      emit3dShaft(dx * inv, dy * inv, dz * inv, worldLen, spreadHalfW, baseAlpha, env, false);
    }

    // 2. 22 Finer Layered Celestial Filaments (faster breathing cycles, overlapping & compounding smoothly)
    const FINE_SHAFTS = 16;
    for (let i = 0; i < FINE_SHAFTS; i++) {
      const hPeriod = hash01(i * 41 + 19);
      const hPhase = hash01(i * 53 + 23);
      const period = 2.0 + hPeriod * 2.4;
      const cyc = tSec / period + hPhase;
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.50);
      if (env < 0.015) continue;

      const seed = gen * 131 + i * 47 + 13;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.88;
      const az = hash01(seed + 2) * Math.PI * 2 - (life - 0.5) * 0.32 - tSec * 0.035;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const dx = Math.cos(az) * rXY;
      const dy = Math.sin(az) * rXY;
      const dz = uZ;

      const hLen = hash01(seed + 3);
      const worldLen = (36 + hLen * 44) * scaleR * (0.86 + power * 0.22);
      const spreadHalfW = (3.4 + hash01(seed + 4) * 3.8) * scaleR;
      const baseAlpha = (0.16 + hLen * 0.12) * (0.86 + power * 0.22);
      emit3dShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env, false);
    }

    // 3. 10 Dedicated Forward / Camera-Directed Volumetric Shafts (dz in +0.58..+0.97)
    //    Beaming obliquely and straight toward the camera so the central clot is softly veiled behind layered golden rays!
    if (isFrontPass || passPhase === 'all') {
      const CAM_SHAFTS = 8;
      for (let i = 0; i < CAM_SHAFTS; i++) {
        const hPeriod = hash01(i * 67 + 5);
        const hPhase = hash01(i * 79 + 17);
        const period = 2.4 + hPeriod * 2.8;
        const cyc = tSec / period + hPhase;
        const gen = Math.floor(cyc);
        const life = cyc - gen;
        const env = Math.pow(Math.sin(life * Math.PI), 1.55);
        if (env < 0.015) continue;

        const seed = gen * 157 + i * 61 + 29;
        const dz = 0.56 + hash01(seed + 1) * 0.41; // Strongly camera-facing!
        const az = hash01(seed + 2) * Math.PI * 2 + (life - 0.5) * 0.36;
        const rXY = Math.sqrt(Math.max(0.001, 1 - dz * dz));
        const dx = Math.cos(az) * rXY;
        const dy = Math.sin(az) * rXY;
        const worldLen = (48 + hash01(seed + 3) * 44) * scaleR * (0.88 + power * 0.22);
        const spreadHalfW = (8.8 + hash01(seed + 4) * 7.6) * scaleR;
        const baseAlpha = (0.20 + hash01(seed + 5) * 0.12) * (0.86 + power * 0.22);
        emit3dShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env, true);
      }
    }

    ctx.restore();
  }

  // --- RESTORATION SLOT 1 (id === 23): Veiled Golden Clot of Light Nested Inside Layered 3D Volumetric Godrays ---
  function drawRestorationSlot1Core(ctx, cx, cy, baseR, tSec, power, rotMult = 1, occluders = null) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const pulse = 0.95 + 0.05 * Math.sin(tSec * 2.4);

    // 1. Back-hemisphere 3D volumetric godrays (dz < 0, pointing away behind the clot, occluded by outer hoops)
    drawRestorationSlot1Godrays(ctx, cx, cy, baseR, tSec, power, 'back', occluders);

    // 2. Softly recessed golden clot of light (deliberately muted/veiled so the layered & camera-facing godrays lead the silhouette!)
    renderSpellCoreWithBloom(ctx, cx, cy, tSec, power, 0.48, (lCtx, lx, ly) => {
      const rotT = tSec * (rotMult || 1);

      // Soft warm amber-gold atmospheric clot body
      const outerR = 13.6 * scaleR * pulse;
      const og = lCtx.createRadialGradient(lx, ly, 0.5, lx, ly, outerR);
      og.addColorStop(0, 'rgba(255, 242, 188, 0.56)');
      og.addColorStop(0.32, 'rgba(252, 204, 78, 0.42)');
      og.addColorStop(0.68, 'rgba(235, 152, 22, 0.18)');
      og.addColorStop(1, 'rgba(180, 83, 9, 0)');
      lCtx.fillStyle = og;
      lCtx.beginPath();
      lCtx.arc(lx, ly, outerR, 0, Math.PI * 2);
      lCtx.fill();

      // Gentle internal swirling golden wisps
      lCtx.save();
      lCtx.globalCompositeOperation = 'lighter';
      for (let w = 0; w < 5; w++) {
        const a0 = rotT * (0.55 + (w % 2) * 0.28) * (w % 2 === 0 ? 1 : -1) + (w * Math.PI * 2) / 5;
        const rOrbit = (2.8 + (w % 3) * 1.7) * scaleR;
        const wx = lx + Math.cos(a0) * rOrbit;
        const wy = ly + Math.sin(a0 * 1.15) * rOrbit * 0.85;
        const wr = (3.8 + Math.sin(tSec * 2.8 + w * 1.7) * 0.9) * scaleR;
        const wg = lCtx.createRadialGradient(wx, wy, 0.2, wx, wy, wr);
        wg.addColorStop(0, 'rgba(255, 244, 196, 0.30)');
        wg.addColorStop(0.55, 'rgba(252, 206, 68, 0.14)');
        wg.addColorStop(1, 'rgba(245, 158, 11, 0)');
        lCtx.fillStyle = wg;
        lCtx.beginPath();
        lCtx.arc(wx, wy, wr, 0, Math.PI * 2);
        lCtx.fill();
      }

      // Subdued sunlit heart (visible as a soft golden core glimpsed through the foreground volumetric shafts)
      const heartR = 5.4 * scaleR * pulse;
      const hg = lCtx.createRadialGradient(lx, ly, 0.3, lx, ly, heartR);
      hg.addColorStop(0, 'rgba(255, 250, 224, 0.62)');
      hg.addColorStop(0.48, 'rgba(254, 228, 134, 0.42)');
      hg.addColorStop(1, 'rgba(245, 158, 11, 0)');
      lCtx.fillStyle = hg;
      lCtx.beginPath();
      lCtx.arc(lx, ly, heartR, 0, Math.PI * 2);
      lCtx.fill();

      // Tiny radiant golden motes drifting lazily outward from the clot
      for (let m = 0; m < 10; m++) {
        const cyc = (tSec * 0.28 + m * 0.137) % 1;
        const seed = Math.floor(tSec * 0.28 + m * 0.137);
        const ma = hash01(seed * 29 + m * 13) * Math.PI * 2 + rotT * 0.15;
        const md = (6.5 + cyc * 17.5) * scaleR;
        const mx = lx + Math.cos(ma) * md;
        const my = ly + Math.sin(ma) * md;
        const maA = Math.sin(cyc * Math.PI) * 0.62;
        lCtx.fillStyle = `rgba(255, 248, 212, ${maA.toFixed(3)})`;
        lCtx.beginPath();
        lCtx.arc(mx, my, (0.50 + (1 - cyc) * 0.50) * scaleR, 0, Math.PI * 2);
        lCtx.fill();
      }
      lCtx.restore();
    });

    // 3. Front-hemisphere & camera-facing 3D volumetric godrays (dz >= 0) drawn OVER the central clot,
    //    veiling the clot behind layered sunlit shafts and dynamically interrupted by any outer hoops!
    drawRestorationSlot1Godrays(ctx, cx, cy, baseR, tSec, power, 'front', occluders);
  }

  // --- RESTORATION SLOT 2 / MIDDLE / SLOT 3 (id === 23): Dual-Axis 3D Translucent Golden Hoop + Distinct Per-Hoop Patterns + Occluded 3D Rim Godrays ---
  function drawRestorationHoopBand(ctx, cx, cy, baseR, tSec, power, hoopSpec, passPhase, occluders = null) {
    if (!hoopSpec) return;
    const xf = computeRestorationHoopTransform(hoopSpec, baseR, tSec, power);
    const { scaleH, R, hH, spin, ux, uy, uz, vx, vy, vz, nx, ny, nz } = xf;
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    function projCyl(phi, v) {
      const lx = R * Math.cos(phi);
      const ly = R * Math.sin(phi);
      const lz = v * hH;
      const wx = ux * lx + vx * ly + nx * lz;
      const wy = uy * lx + vy * ly + ny * lz;
      const wz = uz * lx + vz * ly + nz * lz;
      const persp = 128 / Math.max(24, 128 - wz);
      return { sx: cx + wx * persp, sy: cy + wy * persp, wx, wy, wz, persp };
    }

    // Exact world-space Z component of cylinder outward radial normal at azimuth phi
    function cylFacing(phi) {
      return Math.abs(uz * Math.cos(phi) + vz * Math.sin(phi));
    }

    // 1. Living 3D volumetric golden rim godrays with smooth fade-in/out lifecycles & exact 3D outer-hoop occlusion!
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beamTex = getVolumetricBeamTexture();
    const NUM_RAYS = 18;
    const gGain = hoopSpec.godrayGain || 1.0;
    const hoopSeedOff = hoopSpec.id === 'slot3' ? 73 : (hoopSpec.id === 'middle' ? 37 : 11);

    for (let r = 0; r < NUM_RAYS; r++) {
      const hPeriod = hash01(r * 23 + hoopSeedOff);
      const hPhase = hash01(r * 37 + hoopSeedOff + 5);
      const period = 2.1 + hPeriod * 2.5;
      const cyc = tSec / period + hPhase;
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.55);
      if (env < 0.02) continue;

      const jitterPhi = (hash01(gen * 83 + r * 19 + hoopSeedOff) - 0.5) * 0.24;
      const phi = (r / NUM_RAYS) * Math.PI * 2 + spin * 0.42 + jitterPhi;
      const vEdge = (hash01(gen * 59 + r * 13 + hoopSeedOff) > 0.5 ? 0.85 : -0.85);
      const pEdge = projCyl(phi, vEdge);
      const isBack = pEdge.wz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;

      // True 3D outward unit ray vector from hoop edge (radially outward + gentle axial fan)
      const cP = Math.cos(phi);
      const sP = Math.sin(phi);
      const fanAxial = vEdge * 0.24;
      let rdx = ux * cP + vx * sP + nx * fanAxial;
      let rdy = uy * cP + vy * sP + ny * fanAxial;
      let rdz = uz * cP + vz * sP + nz * fanAxial;
      const rInv = 1 / (Math.hypot(rdx, rdy, rdz) || 1);
      rdx *= rInv; rdy *= rInv; rdz *= rInv;

      const worldLen = (12.5 + hash01(gen * 43 + r * 29 + hoopSeedOff) * 14.0) * (0.76 + 0.34 * gGain) * scaleH;
      // Dynamically interrupt inner hoop's rim godrays whenever an outer hoop (R_outer > R) crosses in front of them!
      const occ = computeRayRingOcclusion(pEdge.wx, pEdge.wy, pEdge.wz, rdx, rdy, rdz, worldLen, occluders, R);

      const pTip = projWorldPoint(pEdge.wx + rdx * worldLen, pEdge.wy + rdy * worldLen, pEdge.wz + rdz * worldLen, cx, cy);
      const screenLen = Math.hypot(pTip.sx - pEdge.sx, pTip.sy - pEdge.sy);
      if (screenLen < 2.2) continue;

      let clipFrac = 1.0;
      if (occ.occluded) {
        const pHit = projWorldPoint(pEdge.wx + rdx * occ.hitS, pEdge.wy + rdy * occ.hitS, pEdge.wz + rdz * occ.hitS, cx, cy);
        const hitLen = Math.hypot(pHit.sx - pEdge.sx, pHit.sy - pEdge.sy);
        clipFrac = clamp(hitLen / screenLen, 0.05, 0.99);
      }

      const depthDim = isBack ? 0.50 : 1.0;
      const ang = Math.atan2(pTip.sy - pEdge.sy, pTip.sx - pEdge.sx);
      const halfW = (3.4 + hH * 0.72) * (0.78 + 0.30 * gGain) * pEdge.persp;
      const rayA = clamp((0.14 + 0.14 * gGain) * env * depthDim, 0.01, 0.42);
      drawVolumetricGodrayBeam(ctx, beamTex, pEdge.sx, pEdge.sy, ang, screenLen, halfW, rayA, clipFrac, occ.trans);
    }
    ctx.restore();

    // 2. Translucent luminous golden cylindrical band (40 smooth 3D quads sorted back-to-front + batched rim strokes!)
    const SEGS = 40;
    const dSeg = (Math.PI * 2) / SEGS;
    const quads = [];
    for (let k = 0; k < SEGS; k++) {
      const phi0 = k * dSeg;
      const phi1 = (k + 1) * dSeg;
      const phiMid = phi0 + dSeg * 0.5;
      const pMid = projCyl(phiMid, 0);
      const isBack = pMid.wz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      quads.push({
        wz: pMid.wz,
        isBack,
        facing: cylFacing(phiMid),
        pT0: projCyl(phi0, 1),
        pT1: projCyl(phi1, 1),
        pB1: projCyl(phi1, -1),
        pB0: projCyl(phi0, -1),
      });
    }
    quads.sort((a, b) => a.wz - b.wz);

    const pGain = hoopSpec.patternGain || 1.0;
    const thickBoost = clamp((hoopSpec.bandHalfH - 2.6) / 1.8, 0, 1);

    ctx.save();
    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      const fresnel = 1.0 - q.facing * 0.55;
      const depthDim = q.isBack ? 0.58 : 1.0;
      const fillA = clamp((0.21 + fresnel * 0.24 + thickBoost * 0.08) * depthDim, 0.12, 0.56);

      ctx.fillStyle = q.isBack
        ? `rgba(222, 152, 22, ${fillA.toFixed(3)})`
        : `rgba(255, 202, 50, ${fillA.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(q.pT0.sx, q.pT0.sy);
      ctx.lineTo(q.pT1.sx, q.pT1.sy);
      ctx.lineTo(q.pB1.sx, q.pB1.sy);
      ctx.lineTo(q.pB0.sx, q.pB0.sy);
      ctx.closePath();
      ctx.fill();
    }
    // Single batched stroke for luminous golden top & bottom hoop rims (40x fewer stroke calls!)
    if (quads.length > 0) {
      const avgBack = quads[0].isBack;
      const rimA = clamp((0.68 + thickBoost * 0.14) * (avgBack ? 0.58 : 1.0) * Math.min(1.25, 0.86 + pGain * 0.22), 0.28, 0.94);
      ctx.strokeStyle = `rgba(255, 234, 148, ${rimA.toFixed(3)})`;
      ctx.lineWidth = (0.72 + thickBoost * 0.32) * (avgBack ? 0.92 : 1.08);
      ctx.beginPath();
      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        ctx.moveTo(q.pT0.sx, q.pT0.sy);
        ctx.lineTo(q.pT1.sx, q.pT1.sy);
        ctx.moveTo(q.pB0.sx, q.pB0.sy);
        ctx.lineTo(q.pB1.sx, q.pB1.sy);
      }
      ctx.stroke();
    }

    // 3. Distinct per-hoop 3D surface ornament wrapped onto the cylinder surface:
    //    - 'diamonds_dots' (Slot 2): line of glowing diamonds separated by dots
    //    - 'wave_pearls'   (Middle): intertwining golden double-sine vesica braid with luminous pearls inside each eye
    //    - 'chevrons_bars' (Slot 3): sacred directional chevrons separated by vertical golden pillar bars
    const patternType = hoopSpec.patternType || 'diamonds_dots';
    const CELLS = hoopSpec.cellCount || 16;
    const dCell = (Math.PI * 2) / CELLS;
    ctx.globalCompositeOperation = 'lighter';

    if (patternType === 'wave_pearls') {
      const SUB = 4;
      const TOTAL = CELLS * SUB;
      const dStep = (Math.PI * 2) / TOTAL;
      const segs = [];
      for (let k = 0; k < TOTAL; k++) {
        const phi0 = k * dStep + spin;
        const phi1 = (k + 1) * dStep + spin;
        const phiMid = phi0 + dStep * 0.5;
        const pMid = projCyl(phiMid, 0);
        const isBack = pMid.wz < 0;
        if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
        const v0 = 0.62 * Math.sin((k / SUB) * Math.PI);
        const v1 = 0.62 * Math.sin(((k + 1) / SUB) * Math.PI);
        segs.push({
          wz: pMid.wz,
          isBack,
          phi: phiMid,
          persp: pMid.persp,
          a0: projCyl(phi0, v0),
          a1: projCyl(phi1, v1),
          b0: projCyl(phi0, -v0),
          b1: projCyl(phi1, -v1),
        });
      }
      segs.sort((a, b) => a.wz - b.wz);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const facing = clamp(cylFacing(s.phi), 0.16, 1.0);
        const depthDim = s.isBack ? 0.46 : 1.0;
        const patA = clamp((0.40 + 0.46 * facing) * depthDim * pGain, 0.14, 0.98);
        ctx.strokeStyle = `rgba(255, 245, 192, ${patA.toFixed(3)})`;
        ctx.lineWidth = (0.76 + thickBoost * 0.30) * s.persp;
        ctx.beginPath();
        ctx.moveTo(s.a0.sx, s.a0.sy);
        ctx.lineTo(s.a1.sx, s.a1.sy);
        ctx.moveTo(s.b0.sx, s.b0.sy);
        ctx.lineTo(s.b1.sx, s.b1.sy);
        ctx.stroke();
      }
      // Luminous pearl bead centered in each braided vesica loop
      const pearls = [];
      for (let m = 0; m < CELLS; m++) {
        const phiEye = (m + 0.5) * dCell + spin;
        const pEye = projCyl(phiEye, 0);
        const isBack = pEye.wz < 0;
        if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
        pearls.push({ phi: phiEye, wz: pEye.wz, isBack, sx: pEye.sx, sy: pEye.sy, persp: pEye.persp });
      }
      pearls.sort((a, b) => a.wz - b.wz);
      for (let i = 0; i < pearls.length; i++) {
        const o = pearls[i];
        const facing = clamp(cylFacing(o.phi), 0.16, 1.0);
        const depthDim = o.isBack ? 0.46 : 1.0;
        const patA = clamp((0.42 + 0.46 * facing) * depthDim * pGain, 0.16, 1.0);
        const beadR = Math.max(0.65, (1.02 + thickBoost * 0.34) * o.persp * (0.55 + 0.45 * facing));
        ctx.fillStyle = `rgba(255, 232, 128, ${(patA * 0.40).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(o.sx, o.sy, beadR * 1.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 252, 224, ${patA.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(o.sx, o.sy, beadR, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (patternType === 'chevrons_bars') {
      const dir = hoopSpec.spinDir || -1;
      const items = [];
      for (let m = 0; m < CELLS; m++) {
        const phiC = m * dCell + spin;
        const pC = projCyl(phiC, 0);
        const isBackC = pC.wz < 0;
        if (!((isBackPass && !isBackC) || (isFrontPass && isBackC))) {
          items.push({ kind: 'chevron', phi: phiC, wz: pC.wz, isBack: isBackC, persp: pC.persp });
        }
        const phiB = phiC + dCell * 0.50;
        const pB = projCyl(phiB, 0);
        const isBackB = pB.wz < 0;
        if (!((isBackPass && !isBackB) || (isFrontPass && isBackB))) {
          items.push({ kind: 'bar', phi: phiB, wz: pB.wz, isBack: isBackB, persp: pB.persp });
        }
      }
      items.sort((a, b) => a.wz - b.wz);
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        const facing = clamp(cylFacing(o.phi), 0.14, 1.0);
        const depthDim = o.isBack ? 0.46 : 1.0;
        const patA = clamp((0.40 + 0.48 * facing) * depthDim * pGain, 0.15, 0.98);
        if (o.kind === 'chevron') {
          const tailPhi = o.phi - dir * dCell * 0.22;
          const tipPhi = o.phi + dir * dCell * 0.18;
          const pT = projCyl(tailPhi, 0.66);
          const pM = projCyl(tipPhi, 0);
          const pB = projCyl(tailPhi, -0.66);
          // Subtle inner wedge fill for crisp silhouette contrast
          const pIn = projCyl(o.phi - dir * dCell * 0.06, 0);
          ctx.fillStyle = `rgba(255, 228, 120, ${(patA * 0.34).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pT.sx, pT.sy);
          ctx.lineTo(pM.sx, pM.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.lineTo(pIn.sx, pIn.sy);
          ctx.closePath();
          ctx.fill();
          // Crisp bright sacred chevron stroke
          ctx.strokeStyle = `rgba(255, 248, 204, ${patA.toFixed(3)})`;
          ctx.lineWidth = (0.86 + thickBoost * 0.32) * o.persp;
          ctx.beginPath();
          ctx.moveTo(pT.sx, pT.sy);
          ctx.lineTo(pM.sx, pM.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        } else {
          // Vertical golden pillar bar separating chevrons
          const pTop = projCyl(o.phi, 0.64);
          const pBot = projCyl(o.phi, -0.64);
          ctx.strokeStyle = `rgba(255, 244, 186, ${(patA * 0.92).toFixed(3)})`;
          ctx.lineWidth = (0.82 + thickBoost * 0.28) * o.persp;
          ctx.beginPath();
          ctx.moveTo(pTop.sx, pTop.sy);
          ctx.lineTo(pBot.sx, pBot.sy);
          ctx.stroke();
        }
      }
    } else {
      // 'diamonds_dots' (Slot 2): rotating line of diamonds separated by dots
      const ornaments = [];
      for (let m = 0; m < CELLS; m++) {
        const phiC = m * dCell + spin;
        const pC = projCyl(phiC, 0);
        const isBackC = pC.wz < 0;
        if (!((isBackPass && !isBackC) || (isFrontPass && isBackC))) {
          ornaments.push({ kind: 'diamond', phi: phiC, wz: pC.wz, isBack: isBackC, persp: pC.persp });
        }
        const phiD = phiC + dCell * 0.50;
        const pD = projCyl(phiD, 0);
        const isBackD = pD.wz < 0;
        if (!((isBackPass && !isBackD) || (isFrontPass && isBackD))) {
          ornaments.push({ kind: 'dot', phi: phiD, wz: pD.wz, isBack: isBackD, sx: pD.sx, sy: pD.sy, persp: pD.persp });
        }
      }
      ornaments.sort((a, b) => a.wz - b.wz);

      for (let i = 0; i < ornaments.length; i++) {
        const o = ornaments[i];
        const facing = clamp(cylFacing(o.phi), 0.14, 1.0);
        const depthDim = o.isBack ? 0.46 : 1.0;
        const patA = clamp((0.36 + 0.44 * facing) * depthDim * pGain, 0.14, 0.98);

        if (o.kind === 'diamond') {
          const pL = projCyl(o.phi - dCell * 0.27, 0);
          const pT = projCyl(o.phi, 0.62);
          const pR = projCyl(o.phi + dCell * 0.27, 0);
          const pB = projCyl(o.phi, -0.62);

          ctx.fillStyle = `rgba(255, 230, 126, ${(patA * 0.38).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(pL.sx, pL.sy);
          ctx.lineTo(pT.sx, pT.sy);
          ctx.lineTo(pR.sx, pR.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = `rgba(255, 246, 198, ${patA.toFixed(3)})`;
          ctx.lineWidth = (0.68 + thickBoost * 0.38) * o.persp;
          ctx.stroke();

          if (pGain >= 1.30 && !o.isBack) {
            const pCen = projCyl(o.phi, 0);
            ctx.fillStyle = `rgba(255, 250, 218, ${(patA * 0.80).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(pCen.sx, pCen.sy, Math.max(0.45, (0.55 + thickBoost * 0.32) * o.persp), 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const dotR = Math.max(0.48, (0.72 + thickBoost * 0.34) * o.persp * (0.55 + 0.45 * facing));
          ctx.fillStyle = `rgba(255, 244, 190, ${clamp(patA * 1.08, 0.16, 1.0).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(o.sx, o.sy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // --- ILLUSION MAGIC (id === 24): Cold Emerald Morphing Crystal, 3D Icosahedron, 42-Face Icosphere & Dual Polygonal Hoops ---
  function rotateIllusionVec(x, y, z, rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    return {
      x: x2 * cz - y1 * sz,
      y: x2 * sz + y1 * cz,
      z: z2,
    };
  }

  // Reusable slowly-spinning green smoky spiral particle (used by Slot 1 crystal sparks & Slot 2/3 shattering polygons)
  function drawEmeraldSmokySpiral(ctx, x, y, radius, spinAngle, alpha) {
    if (alpha < 0.015 || radius < 0.8) return;
    ctx.save();
    ctx.translate(x, y);

    // Subtle smoky cold-emerald mist puff behind the spiral
    const mistR = radius * 1.65;
    const mg = ctx.createRadialGradient(0, 0, 0.2, 0, 0, mistR);
    mg.addColorStop(0, `rgba(20, 215, 156, ${(alpha * 0.28).toFixed(3)})`);
    mg.addColorStop(0.55, `rgba(13, 148, 136, ${(alpha * 0.12).toFixed(3)})`);
    mg.addColorStop(1, 'rgba(2, 44, 34, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(0, 0, mistR, 0, Math.PI * 2);
    ctx.fill();

    // Two-pass smoky Archimedean spiral (outer translucent smoke trail + crisp inner luminous cold-emerald filament)
    const STEPS = 15;
    const TURNS = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const f = i / STEPS;
        const a = spinAngle + f * TURNS * Math.PI * 2;
        const rr = radius * Math.pow(f, 0.88);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      if (pass === 0) {
        ctx.strokeStyle = `rgba(16, 205, 148, ${(alpha * 0.40).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.2, radius * 0.42);
      } else {
        ctx.strokeStyle = `rgba(176, 254, 230, ${(alpha * 0.86).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.55, radius * 0.17);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Miniature geometric emerald crystal particle rendered at icosahedron / lattice vertices
  function drawEmeraldCrystalNode(ctx, x, y, size, tiltRad, alpha, isBack) {
    if (alpha < 0.02 || size < 0.4) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tiltRad);
    const h = size * 1.48;
    const w = size * 0.72;

    if (!isBack && size >= 1.5) {
      const gg = ctx.createRadialGradient(0, 0, 0.2, 0, 0, h * 1.8);
      gg.addColorStop(0, `rgba(52, 238, 182, ${(alpha * 0.34).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(13, 148, 136, 0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, 0, h * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Left sunlit facet
    ctx.fillStyle = isBack
      ? `rgba(14, 152, 124, ${(alpha * 0.65).toFixed(3)})`
      : `rgba(148, 252, 224, ${(alpha * 0.88).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(-w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Right deeper cold-emerald facet
    ctx.fillStyle = isBack
      ? `rgba(6, 98, 82, ${(alpha * 0.62).toFixed(3)})`
      : `rgba(14, 198, 146, ${(alpha * 0.82).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Crisp crystalline edge outline
    ctx.strokeStyle = `rgba(204, 254, 240, ${(alpha * (isBack ? 0.38 : 0.84)).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.42, size * 0.22);
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.lineTo(-w, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Cached cold-emerald volumetric Gaussian beam texture for Triad Illusion faint godrays
  let cachedEmeraldBeamTex = null;
  function getEmeraldVolumetricBeamTexture() {
    if (cachedEmeraldBeamTex) return cachedEmeraldBeamTex;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const w = 128;
    const h = 96;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const halfH = (h - 1) * 0.5;
    for (let py = 0; py < h; py++) {
      const yNorm = (py - halfH) / halfH;
      for (let px = 0; px < w; px++) {
        const u = px / (w - 1);
        const coneHalfW = 0.14 + 0.82 * Math.pow(u, 0.90);
        const lat = yNorm / coneHalfW;
        const latGauss = Math.exp(-lat * lat * 3.4);
        const coreSpine = 0.62 + 0.38 * Math.exp(-lat * lat * 11.5);
        const rootSoft = smoothstep(0.0, 0.04, u);
        const axDecay = rootSoft * Math.pow(1.0 - u, 1.42);
        const a = clamp(latGauss * coreSpine * axDecay, 0, 1);
        // Cold luminous emerald spectral ramp: frosty mint -> pure cold emerald -> deep glacial teal
        const r = Math.round(lerp(186, 8, Math.pow(u, 0.62)));
        const g = Math.round(lerp(255, 168, Math.pow(u, 0.82)));
        const b = Math.round(lerp(236, 134, Math.pow(u, 0.78)));
        const idx = (py * w + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    cachedEmeraldBeamTex = cv;
    return cv;
  }

  // Collect world-space lit polygon occluders for Triad Illusion shells so faint emerald godrays dynamically dim/clip behind lit facets
  function buildIllusionLitPolyOccluders(illusionCfg, baseR, tSec, power) {
    if (!illusionCfg || !illusionCfg.isTriad) return null;
    const shells = [illusionCfg.slot2, illusionCfg.slot3].filter(Boolean);
    const out = [];
    for (let s = 0; s < shells.length; s++) {
      const sp = shells[s];
      const R = baseR * sp.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      const isIco42 = sp.kind === 'icosphere42';
      const mesh = isIco42 ? getIllusionIcosphere42Mesh() : getIllusionIcosahedronMesh();
      const ang = computeIllusionWanderAngles(tSec, sp.speedMult, sp.seed);
      const chan = computeIllusionChannelStates(mesh.faces.length, sp.maxLit, tSec, sp.seed, false, Boolean(sp.triadBoost));
      // Angular radius of a single face on the unit sphere (cos threshold for fast dot-product hit test)
      const cosLim = isIco42 ? 0.92 : 0.82;
      const litCenters = [];
      chan.activeFaces.forEach((info, fIdx) => {
        if (info.intensity < 0.20) return;
        const fc = mesh.faceCenters[fIdx];
        const rw = rotateIllusionVec(fc.x, fc.y, fc.z, ang.rx, ang.ry, ang.rz);
        litCenters.push({ x: rw.x, y: rw.y, z: rw.z, inten: info.intensity });
      });
      if (litCenters.length > 0) out.push({ R, cosLim, litCenters });
    }
    return out;
  }

  function evalIllusionPolyOcclusion(dx, dy, dz, maxLen, polyOccs) {
    if (!polyOccs || polyOccs.length === 0) return { hitS: maxLen, trans: 1.0, occluded: false };
    let bestHitS = maxLen;
    let totalTrans = 1.0;
    for (let s = 0; s < polyOccs.length; s++) {
      const sh = polyOccs[s];
      if (sh.R >= maxLen) continue;
      for (let i = 0; i < sh.litCenters.length; i++) {
        const c = sh.litCenters[i];
        const dot = dx * c.x + dy * c.y + dz * c.z;
        if (dot > sh.cosLim) {
          const tHit = smoothstep(sh.cosLim, Math.min(0.995, sh.cosLim + 0.06), dot);
          const localTrans = 1.0 - tHit * c.inten * 0.62; // Semi-translucent emerald pane blocks ~62% of inner emerald beam
          if (localTrans < 0.96 && sh.R < bestHitS) bestHitS = sh.R;
          totalTrans *= localTrans;
          break;
        }
      }
    }
    return { hitS: bestHitS, trans: clamp(totalTrans, 0.24, 1.0), occluded: totalTrans < 0.95 };
  }

  // Faint volumetric 3D cold-emerald godrays radiating from the central crystal in Triad Illusion (on the manner of Restoration, softly emerald)
  function drawIllusionTriadGodrays(ctx, cx, cy, baseR, tSec, power, passPhase, polyOccs) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const beamTex = getEmeraldVolumetricBeamTexture();
    const isBackPass = passPhase === 'back';
    const isFrontPass = passPhase === 'front';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    function emitEmeraldShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env) {
      if (env < 0.02) return;
      const isBack = dz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;

      const occ = evalIllusionPolyOcclusion(dx, dy, dz, worldLen, polyOccs);
      const p0 = projWorldPoint(dx * 2.2 * scaleR, dy * 2.2 * scaleR, dz * 2.2 * scaleR, cx, cy);
      const p1 = projWorldPoint(dx * worldLen, dy * worldLen, dz * worldLen, cx, cy);
      const screenLen = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);

      if (screenLen > 5.0) {
        const ang = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
        let clipFrac = 1.0;
        if (occ.occluded) {
          const pHit = projWorldPoint(dx * occ.hitS, dy * occ.hitS, dz * occ.hitS, cx, cy);
          clipFrac = clamp(Math.hypot(pHit.sx - p0.sx, pHit.sy - p0.sy) / screenLen, 0.06, 0.99);
        }
        const perspGain = isBack ? (0.64 + 0.36 * (1 + dz)) : (0.94 + 0.22 * dz);
        const halfW = spreadHalfW * (0.78 + 0.34 * p1.persp);
        drawVolumetricGodrayBeam(ctx, beamTex, p0.sx, p0.sy, ang, screenLen, halfW, baseAlpha * env * perspGain, clipFrac, occ.trans);
      }

      // Gentle forward camera-facing emerald bloom (much softer than Restoration so crystal stays clearly readable!)
      const camFactor = smoothstep(0.54, 0.94, clamp(dz, 0, 1));
      if (!isBack && camFactor > 0.06) {
        const fx = cx + dx * 10.0 * (1.0 - camFactor * 0.5) * scaleR;
        const fy = cy + dy * 10.0 * (1.0 - camFactor * 0.5) * scaleR;
        const fR = (10.5 + camFactor * 11.0) * scaleR;
        const flareA = clamp(baseAlpha * env * camFactor * occ.trans * 0.52, 0, 0.14);
        if (flareA > 0.008) {
          const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, fR);
          fg.addColorStop(0, `rgba(186, 255, 236, ${flareA.toFixed(3)})`);
          fg.addColorStop(0.45, `rgba(16, 217, 152, ${(flareA * 0.55).toFixed(3)})`);
          fg.addColorStop(1, 'rgba(6, 78, 59, 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx, fy, fR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 26 soft layered wide cold-emerald shafts + 14 delicate filaments (smooth fade-in/out lifecycles)
    for (let i = 0; i < 26; i++) {
      const period = 3.2 + hash01(i * 19 + 7) * 3.4;
      const cyc = tSec / period + hash01(i * 31 + 13);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.65);
      if (env < 0.02) continue;
      const seed = gen * 101 + i * 37 + 19;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.90;
      const az = hash01(seed + 2) * Math.PI * 2 + (life - 0.5) * 0.24 * (i % 2 === 0 ? 1 : -1) + tSec * 0.02;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (62 + hash01(seed + 3) * 54) * scaleR * (0.88 + power * 0.18);
      const spreadHalfW = (7.2 + hash01(seed + 4) * 7.2) * scaleR;
      const baseAlpha = (0.095 + hash01(seed + 5) * 0.072) * (0.86 + power * 0.18); // Gentle & clearly legible emerald shafts (~55% of Restoration)
      emitEmeraldShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env);
    }

    for (let i = 0; i < 14; i++) {
      const period = 2.2 + hash01(i * 43 + 11) * 2.4;
      const cyc = tSec / period + hash01(i * 59 + 17);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.55);
      if (env < 0.02) continue;
      const seed = gen * 137 + i * 53 + 29;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.86;
      const az = hash01(seed + 2) * Math.PI * 2 - (life - 0.5) * 0.28;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (42 + hash01(seed + 3) * 44) * scaleR * (0.88 + power * 0.18);
      const spreadHalfW = (3.4 + hash01(seed + 4) * 3.6) * scaleR;
      const baseAlpha = (0.105 + hash01(seed + 5) * 0.078) * (0.86 + power * 0.18);
      emitEmeraldShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env);
    }

    ctx.restore();
  }

  // --- ILLUSION SLOT 1: Semi-Translucent Cold-Emerald Morphing 3D Crystal + Faint Mist + Spinning Emerald Smoke Spirals ---
  function drawIllusionSlot1Crystal(ctx, cx, cy, baseR, tSec, power, triadGodrays = false, polyOccs = null) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const R = 15.2 * scaleR;

    // 0. In Triad Illusion (all 3 effects Illusion): faint cold-emerald 3D volumetric godrays (back pass behind crystal)
    if (triadGodrays) {
      drawIllusionTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'back', polyOccs);
    }

    // 1. Very faint cold-emerald mist hugging the crystal ("совсем слабая дымка")
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let m = 0; m < 4; m++) {
      const a = tSec * (0.28 + m * 0.08) * (m % 2 === 0 ? 1 : -1) + m * 1.57;
      const dist = (4.2 + Math.sin(tSec * 0.9 + m * 1.9) * 2.2) * scaleR;
      const mx = cx + Math.cos(a) * dist;
      const my = cy + Math.sin(a) * dist * 0.86;
      const mr = (15.5 + (m % 2) * 5.0) * scaleR;
      const mistA = (0.044 + 0.016 * Math.sin(tSec * 1.3 + m * 2.1)) * (0.85 + power * 0.25);
      const mg = ctx.createRadialGradient(mx, my, 1, mx, my, mr);
      mg.addColorStop(0, `rgba(20, 212, 158, ${mistA.toFixed(3)})`);
      mg.addColorStop(0.55, `rgba(13, 148, 136, ${(mistA * 0.45).toFixed(3)})`);
      mg.addColorStop(1, 'rgba(2, 44, 34, 0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. Crisp 14-vertex / 24-triangle 3D geometric crystal that continuously morphs & deforms smoothly across geometric archetypes
    const mCycle = (tSec * 0.34) % 3;
    const mSeg = Math.floor(mCycle);
    const mFrac = smoothstep(0.0, 1.0, mCycle - mSeg);

    // 3 crisp geometric crystal silhouettes: [topY, botY, upperY, lowerY, upperR, lowerR, twistOff, asymTilt]
    const SHAPES = [
      { topY: -1.30, botY: 1.24, upY: -0.34, loY: 0.38, upR: 0.56, loR: 0.52, twist: 0.52, shear: 0.06 }, // Tall obelisk spire
      { topY: -0.92, botY: 0.92, upY: -0.26, loY: 0.26, upR: 0.88, loR: 0.84, twist: 0.30, shear: -0.05 }, // Wide cut emerald gem
      { topY: -1.16, botY: 1.02, upY: -0.44, loY: 0.30, upR: 0.84, loR: 0.50, twist: 0.78, shear: 0.22 }, // Asymmetric beveled shard
    ];
    const sA = SHAPES[mSeg % 3];
    const sB = SHAPES[(mSeg + 1) % 3];
    const topY = lerp(sA.topY, sB.topY, mFrac);
    const botY = lerp(sA.botY, sB.botY, mFrac);
    const upY = lerp(sA.upY, sB.upY, mFrac);
    const loY = lerp(sA.loY, sB.loY, mFrac);
    const upR = lerp(sA.upR, sB.upR, mFrac);
    const loR = lerp(sA.loR, sB.loR, mFrac);
    const twist = lerp(sA.twist, sB.twist, mFrac);
    const shear = lerp(sA.shear, sB.shear, mFrac);

    const rotX = 0.22 + Math.sin(tSec * 0.31) * 0.34;
    const rotY = tSec * 0.44 + Math.cos(tSec * 0.21) * 0.25;
    const rotZ = Math.sin(tSec * 0.24) * 0.26;

    const rawVerts = [];
    // 0: top apex
    rawVerts.push({ x: Math.sin(tSec * 0.7) * 0.08 * shear, y: topY, z: Math.cos(tSec * 0.6) * 0.08 * shear });
    // 1..6: upper faceted crown ring (each vertex smoothly shifts its bevel radius & height -> living crisp geometry)
    for (let k = 0; k < 6; k++) {
      const baseA = (k / 6) * Math.PI * 2;
      const facetStretch = 1.0 + 0.16 * Math.sin(tSec * 0.78 + k * 1.95) + ((k % 2 === 0 ? 1 : -1) * 0.10 * Math.cos(tSec * 0.52));
      const rr = upR * facetStretch;
      const yy = upY + 0.14 * Math.sin(tSec * 0.68 + k * 2.15) + shear * Math.cos(baseA) * 0.35;
      rawVerts.push({ x: Math.cos(baseA) * rr, y: yy, z: Math.sin(baseA) * rr });
    }
    // 7..12: lower faceted girdle ring (staggered by twist angle)
    for (let k = 0; k < 6; k++) {
      const baseA = (k / 6) * Math.PI * 2 + twist;
      const facetStretch = 1.0 + 0.16 * Math.cos(tSec * 0.72 + k * 2.05) + ((k % 2 === 1 ? 1 : -1) * 0.10 * Math.sin(tSec * 0.58));
      const rr = loR * facetStretch;
      const yy = loY + 0.14 * Math.cos(tSec * 0.64 + k * 1.85) - shear * Math.sin(baseA) * 0.30;
      rawVerts.push({ x: Math.cos(baseA) * rr, y: yy, z: Math.sin(baseA) * rr });
    }
    // 13: bottom apex
    rawVerts.push({ x: -Math.sin(tSec * 0.65) * 0.08 * shear, y: botY, z: -Math.cos(tSec * 0.55) * 0.08 * shear });

    const projVerts = rawVerts.map((v) => {
      const r = rotateIllusionVec(v.x * R, v.y * R, v.z * R, rotX, rotY, rotZ);
      const persp = 128 / Math.max(24, 128 - r.z);
      return { wx: r.x, wy: r.y, wz: r.z, sx: cx + r.x * persp, sy: cy + r.y * persp, persp };
    });

    // 24 triangular crystal facets
    const tris = [];
    for (let k = 0; k < 6; k++) {
      const kn = (k + 1) % 6;
      const u0 = 1 + k, u1 = 1 + kn;
      const l0 = 7 + k, l1 = 7 + kn;
      tris.push([0, u1, u0]);     // top crown pyramid
      tris.push([u0, u1, l0]);    // upper side bevel
      tris.push([u1, l1, l0]);    // lower side bevel
      tris.push([13, l0, l1]);    // bottom spire pyramid
    }

    // Light vector from top-left-front for crisp icy-emerald gem facets
    const lx = -0.42, ly = -0.60, lz = 0.68;
    const scoredFaces = tris.map((idx) => {
      const a = projVerts[idx[0]], b = projVerts[idx[1]], c = projVerts[idx[2]];
      const e1x = b.wx - a.wx, e1y = b.wy - a.wy, e1z = b.wz - a.wz;
      const e2x = c.wx - a.wx, e2y = c.wy - a.wy, e2z = c.wz - a.wz;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nL = Math.hypot(nx, ny, nz) || 1;
      nx /= nL; ny /= nL; nz /= nL;
      const cz = (a.wz + b.wz + c.wz) / 3;
      // Ensure outward normal points away from crystal center
      const mx = (a.wx + b.wx + c.wx) / 3;
      const my = (a.wy + b.wy + c.wy) / 3;
      if (nx * mx + ny * my + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ndotl = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
      return { idx, a, b, c, cz, isFront: nz >= 0, ndotl, nz };
    });
    scoredFaces.sort((f1, f2) => f1.cz - f2.cz);

    ctx.save();
    // Draw back facets first (semi-translucent interior, ~15% less transparent than initial pass)
    for (let i = 0; i < scoredFaces.length; i++) {
      const f = scoredFaces[i];
      if (f.isFront) continue;
      const ba = 0.21 + f.ndotl * 0.16;
      ctx.fillStyle = `rgba(4, 92, 74, ${ba.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(f.a.sx, f.a.sy);
      ctx.lineTo(f.b.sx, f.b.sy);
      ctx.lineTo(f.c.sx, f.c.sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(45, 218, 174, 0.28)';
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }

    // Subtle internal cold-emerald crystal refraction heart visible through the translucent faces
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const coreR = 7.4 * scaleR;
    const cg = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, coreR);
    cg.addColorStop(0, 'rgba(186, 255, 236, 0.44)');
    cg.addColorStop(0.48, 'rgba(16, 217, 152, 0.24)');
    cg.addColorStop(1, 'rgba(6, 78, 59, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw front facets with sharp flat crystalline shading & frosty specular edges (~15% less transparent)
    for (let i = 0; i < scoredFaces.length; i++) {
      const f = scoredFaces[i];
      if (!f.isFront) continue;
      const spec = Math.pow(f.ndotl, 3.2);
      const rCol = Math.round(lerp(8, 178, f.ndotl * 0.55 + spec * 0.45));
      const gCol = Math.round(lerp(132, 255, f.ndotl * 0.72 + spec * 0.28));
      const bCol = Math.round(lerp(108, 236, f.ndotl * 0.65 + spec * 0.35));
      const fa = clamp(0.32 + f.ndotl * 0.26 + spec * 0.22, 0.28, 0.78);
      ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${fa.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(f.a.sx, f.a.sy);
      ctx.lineTo(f.b.sx, f.b.sy);
      ctx.lineTo(f.c.sx, f.c.sy);
      ctx.closePath();
      ctx.fill();

      // Crisp geometric crystal facet borders
      const edgeA = clamp(0.40 + f.ndotl * 0.34 + spec * 0.26, 0.34, 0.94);
      ctx.strokeStyle = `rgba(176, 254, 230, ${edgeA.toFixed(3)})`;
      ctx.lineWidth = 0.74 * f.a.persp;
      ctx.stroke();
    }
    ctx.restore();

    // 2b. In Triad Illusion: faint front-hemisphere cold-emerald 3D volumetric godrays
    if (triadGodrays) {
      drawIllusionTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'front', polyOccs);
    }

    // 3. Occasional spark-like particles falling/drifting out as slowly rotating green smoky spirals
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const SPARK_SLOTS = 7;
    for (let s = 0; s < SPARK_SLOTS; s++) {
      const hP = hash01(s * 31 + 11);
      const hPh = hash01(s * 47 + 23);
      const period = 2.8 + hP * 2.2;
      const raw = tSec / period + hPh;
      const gen = Math.floor(raw);
      const u = raw - gen;
      // Sparse spark window: visible only 58% of each cycle so spirals emit occasionally like sparks!
      if (u < 0.14 || u > 0.72) continue;
      const frac = (u - 0.14) / 0.58;
      const env = Math.sin(frac * Math.PI);
      const seed = gen * 89 + s * 43 + 7;
      const ang0 = hash01(seed + 1) * Math.PI * 2;
      const speed = (14 + hash01(seed + 2) * 14) * scaleR;
      const startR = (6.5 + hash01(seed + 3) * 5.0) * scaleR;
      const curl = (hash01(seed + 4) - 0.5) * 9.0 * scaleR;
      const sx = cx + Math.cos(ang0) * (startR + frac * speed) + Math.sin(frac * 3.1 + s) * curl * 0.35;
      const sy = cy + Math.sin(ang0) * (startR + frac * speed * 0.85) + frac * frac * 6.5 * scaleR;
      const spR = (2.4 + hash01(seed + 5) * 1.8) * scaleR * (0.72 + 0.38 * env);
      const spinDir = s % 2 === 0 ? 1 : -1;
      const spinA = hash01(seed + 6) * Math.PI * 2 + frac * period * 1.45 * spinDir;
      drawEmeraldSmokySpiral(ctx, sx, sy, spR, spinA, env * 0.78);
    }
    ctx.restore();
  }

  // --- ILLUSION SLOT 2 / SLOT 3 / DUAL POLYGONAL HOOPS: 3D Lattice + Broken-Lamp Gradient Panes + Downward Shatter Particles ---
  function drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, shellSpec, passPhase) {
    if (!shellSpec) return;
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const R = baseR * shellSpec.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const isHoop = shellSpec.kind === 'hoop';
    const isIco42 = shellSpec.kind === 'icosphere42';
    const mesh = isHoop
      ? getIllusionPolygonalHoopMesh(shellSpec.segCount, (shellSpec.bandHalfH * scaleH) / R)
      : (isIco42 ? getIllusionIcosphere42Mesh() : getIllusionIcosahedronMesh());

    const angles = computeIllusionWanderAngles(tSec, shellSpec.speedMult, shellSpec.seed);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    const projV = mesh.vertices.map((v) => {
      const r = rotateIllusionVec(v.x * R, v.y * R, v.z * R, angles.rx, angles.ry, angles.rz);
      const persp = 128 / Math.max(24, 128 - r.z);
      return { wx: r.x, wy: r.y, wz: r.z, sx: cx + r.x * persp, sy: cy + r.y * persp, persp };
    });

    const chan = computeIllusionChannelStates(mesh.faces.length, shellSpec.maxLit, tSec, shellSpec.seed, isHoop, Boolean(shellSpec.triadBoost));

    // Track which edges belong to currently lit faces so lit rims catch extra luminescence
    const litEdgeIntensity = new Map();
    chan.activeFaces.forEach((info, fIdx) => {
      const poly = mesh.faces[fIdx];
      for (let e = 0; e < poly.length; e++) {
        const a = poly[e], b = poly[(e + 1) % poly.length];
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        const prev = litEdgeIntensity.get(k) || 0;
        if (info.intensity > prev) litEdgeIntensity.set(k, info.intensity);
      }
    });

    ctx.save();
    // 1. Translucent polygonal wireframe lattice edges (split cleanly by depth hemisphere)
    for (let i = 0; i < mesh.edges.length; i++) {
      const [ia, ib] = mesh.edges[i];
      const pa = projV[ia], pb = projV[ib];
      const midZ = (pa.wz + pb.wz) * 0.5;
      const isBack = midZ < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      const k = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
      const litE = litEdgeIntensity.get(k) || 0;
      const baseE = isIco42 ? (isBack ? 0.085 : 0.21) : (isBack ? 0.13 : 0.30);
      const alphaE = clamp(baseE + litE * (isBack ? 0.22 : 0.48), 0.05, 0.88);
      ctx.strokeStyle = litE > 0.15
        ? `rgba(148, 252, 222, ${alphaE.toFixed(3)})`
        : `rgba(28, 214, 166, ${alphaE.toFixed(3)})`;
      ctx.lineWidth = ((isIco42 ? 0.52 : 0.66) + litE * 0.42) * ((pa.persp + pb.persp) * 0.5);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // 2. Active lit polygonal surfaces with transparent-center -> edge-bright emerald radial gradient!
    const litList = [];
    chan.activeFaces.forEach((info, fIdx) => {
      const poly = mesh.faces[fIdx];
      let sumZ = 0, mx = 0, my = 0;
      const pts = [];
      for (let j = 0; j < poly.length; j++) {
        const p = projV[poly[j]];
        pts.push(p);
        sumZ += p.wz;
        mx += p.sx;
        my += p.sy;
      }
      const n = poly.length;
      const avgZ = sumZ / n;
      const isBack = avgZ < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;
      mx /= n;
      my /= n;
      let rMax = 0;
      for (let j = 0; j < n; j++) {
        const d = Math.hypot(pts[j].sx - mx, pts[j].sy - my);
        if (d > rMax) rMax = d;
      }
      litList.push({ fIdx, info, pts, mx, my, rMax, avgZ, isBack });
    });
    litList.sort((a, b) => a.avgZ - b.avgZ);

    for (let i = 0; i < litList.length; i++) {
      const f = litList[i];
      const depthDim = f.isBack ? 0.52 : 1.0;
      const inten = f.info.intensity;
      // ~15% less transparent than initial pass while preserving center-transparent -> edge-bright gradient
      const fillA = clamp(inten * depthDim * (isHoop ? 0.74 : 0.68), 0.03, 0.86);

      // Center-transparent -> edge-bright cold-emerald gradient fill ("к центру более прозрачными чем по краям")
      const gradR = Math.max(2.6, f.rMax * 1.06);
      const fg = ctx.createRadialGradient(f.mx, f.my, 0, f.mx, f.my, gradR);
      fg.addColorStop(0.00, `rgba(14, 212, 152, ${(fillA * 0.24).toFixed(3)})`);
      fg.addColorStop(0.50, `rgba(16, 217, 152, ${(fillA * 0.54).toFixed(3)})`);
      fg.addColorStop(0.84, `rgba(45, 232, 182, ${(fillA * 0.88).toFixed(3)})`);
      fg.addColorStop(1.00, `rgba(176, 254, 230, ${(fillA * 1.00).toFixed(3)})`);

      ctx.fillStyle = fg;
      ctx.beginPath();
      for (let j = 0; j < f.pts.length; j++) {
        if (j === 0) ctx.moveTo(f.pts[j].sx, f.pts[j].sy);
        else ctx.lineTo(f.pts[j].sx, f.pts[j].sy);
      }
      ctx.closePath();
      ctx.fill();

      // Luminous broken-lamp rim outline (flares crisply on entry/exit voltage spikes!)
      const isFlickering = f.info.state === 'entry' || f.info.state === 'exit';
      const rimA = clamp(inten * depthDim * (isFlickering ? 0.96 : 0.76), 0.05, 0.98);
      ctx.strokeStyle = isFlickering && inten > 0.65
        ? `rgba(218, 255, 244, ${rimA.toFixed(3)})`
        : `rgba(134, 248, 214, ${rimA.toFixed(3)})`;
      ctx.lineWidth = (isIco42 ? 0.78 : 0.95) * f.pts[0].persp;
      ctx.stroke();
    }

    // 3. Geometric emerald crystal vertex particles (12 vivid crystals on icosahedron; delicate crystalline nodes on 42-face sphere & hoops)
    const vOrder = [];
    for (let i = 0; i < projV.length; i++) {
      const pv = projV[i];
      const isBack = pv.wz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      vOrder.push({ idx: i, pv, isBack });
    }
    vOrder.sort((a, b) => a.pv.wz - b.pv.wz);

    for (let i = 0; i < vOrder.length; i++) {
      const { idx, pv, isBack } = vOrder[i];
      const radialTilt = Math.atan2(pv.sy - cy, pv.sx - cx) + Math.PI * 0.5;
      if (shellSpec.kind === 'icosahedron') {
        // 12 crisp geometric emerald crystal particles forming the icosahedron lattice!
        const cSize = (2.45 + 0.35 * Math.sin(tSec * 2.2 + idx)) * pv.persp * scaleH;
        drawEmeraldCrystalNode(ctx, pv.sx, pv.sy, cSize, radialTilt, isBack ? 0.52 : 0.94, isBack);
      } else if (isIco42) {
        // Delicate crystalline vertex gems on the 80 corners of the 42-face geodesic sphere
        const cSize = (1.15 + (idx % 5 === 0 ? 0.38 : 0)) * pv.persp * scaleH;
        drawEmeraldCrystalNode(ctx, pv.sx, pv.sy, cSize, radialTilt, isBack ? 0.32 : 0.74, isBack);
      } else {
        // Polygonal hoop rim crystal vertices
        const cSize = 1.45 * pv.persp * scaleH;
        drawEmeraldCrystalNode(ctx, pv.sx, pv.sy, cSize, radialTilt, isBack ? 0.40 : 0.82, isBack);
      }
    }

    // 4. Downward shattering particles + slowly spinning smoky spirals when a face finishes turning OFF!
    if (chan.shatters.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < chan.shatters.length; s++) {
        const sh = chan.shatters[s];
        const poly = mesh.faces[sh.faceIdx];
        // Project the shattering polygon at the exact moment t_shatter when it switched off so particles peel cleanly off it and fall straight DOWN!
        const tShatter = tSec - sh.ageSec;
        const shAng = computeIllusionWanderAngles(tShatter, shellSpec.speedMult, shellSpec.seed);
        let sumZ = 0;
        const shPts = [];
        for (let j = 0; j < poly.length; j++) {
          const mv = mesh.vertices[poly[j]];
          const rv = rotateIllusionVec(mv.x * R, mv.y * R, mv.z * R, shAng.rx, shAng.ry, shAng.rz);
          const persp = 128 / Math.max(24, 128 - rv.z);
          shPts.push({ sx: cx + rv.x * persp, sy: cy + rv.y * persp, wz: rv.z, persp });
          sumZ += rv.z;
        }
        const avgZ = sumZ / poly.length;
        const isBack = avgZ < 0;
        if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;

        const dt = sh.ageSec;
        const fade = Math.pow(1.0 - sh.frac, 1.25) * (isBack ? 0.54 : 0.96);
        if (fade < 0.02) continue;

        const P_COUNT = isIco42 ? 7 : 9;
        for (let p = 0; p < P_COUNT; p++) {
          const pSeed = sh.epoch * 131 + sh.channel * 47 + p * 19 + shellSpec.seed;
          // Sample random interior point inside polygon by blending centroid with a random vertex pair
          const vA = shPts[p % shPts.length];
          const vB = shPts[(p + 1) % shPts.length];
          let cx0 = 0, cy0 = 0;
          for (let j = 0; j < shPts.length; j++) { cx0 += shPts[j].sx; cy0 += shPts[j].sy; }
          cx0 /= shPts.length; cy0 /= shPts.length;
          const b1 = hash01(pSeed + 1) * 0.72;
          const b2 = hash01(pSeed + 2) * (1.0 - b1);
          const ox = cx0 * (1 - b1 - b2) + vA.sx * b1 + vB.sx * b2;
          const oy = cy0 * (1 - b1 - b2) + vA.sy * b1 + vB.sy * b2;

          // Downward gravitational shower with subtle horizontal flutter
          const vx = (hash01(pSeed + 3) - 0.5) * 9.5 * scaleH;
          const vy0 = (4.0 + hash01(pSeed + 4) * 10.0) * scaleH;
          const grav = (24.0 + hash01(pSeed + 5) * 16.0) * scaleH;
          const px = ox + vx * dt + Math.sin(dt * 4.2 + p) * 1.2 * scaleH;
          const py = oy + vy0 * dt + 0.5 * grav * dt * dt;

          const isSpiral = (p % 3 === 0); // ~1/3 of falling particles are slowly rotating green smoky spirals!
          if (isSpiral) {
            const spR = (2.1 + hash01(pSeed + 6) * 1.4) * scaleH * (0.75 + 0.35 * (1 - sh.frac));
            const spinA = hash01(pSeed + 7) * Math.PI * 2 + dt * 2.2 * (p % 2 === 0 ? 1 : -1);
            drawEmeraldSmokySpiral(ctx, px, py, spR, spinA, fade * 0.88);
          } else {
            // Crisp falling emerald shard / mote
            const sz = (0.95 + hash01(pSeed + 8) * 1.15) * scaleH * (0.65 + 0.45 * (1 - sh.frac));
            const rotP = hash01(pSeed + 9) * Math.PI * 2 + dt * 4.5 * (p % 2 === 0 ? 1 : -1);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rotP);
            ctx.fillStyle = p % 2 === 0
              ? `rgba(148, 254, 224, ${(fade * 0.92).toFixed(3)})`
              : `rgba(16, 217, 152, ${(fade * 0.85).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(0, -sz * 1.3);
            ctx.lineTo(sz * 0.85, 0);
            ctx.lineTo(0, sz * 1.3);
            ctx.lineTo(-sz * 0.85, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // --- ALTERATION MAGIC (id === 25): Earth/Crystal Clod, 3-Arc Carapace-Crystal Rings, 5-Spine Triad Cage & Polar Warm-Green Godrays ---
  let cachedWarmGreenBeamTex = null;
  function getWarmGreenVolumetricBeamTexture() {
    if (cachedWarmGreenBeamTex) return cachedWarmGreenBeamTex;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const w = 128;
    const h = 96;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const halfH = (h - 1) * 0.5;
    for (let py = 0; py < h; py++) {
      const yNorm = (py - halfH) / halfH;
      for (let px = 0; px < w; px++) {
        const u = px / (w - 1);
        const coneHalfW = 0.14 + 0.82 * Math.pow(u, 0.90);
        const lat = yNorm / coneHalfW;
        const latGauss = Math.exp(-lat * lat * 3.3);
        const coreSpine = 0.62 + 0.38 * Math.exp(-lat * lat * 11.5);
        const rootSoft = smoothstep(0.0, 0.04, u);
        const axDecay = rootSoft * Math.pow(1.0 - u, 1.38);
        const a = clamp(latGauss * coreSpine * axDecay, 0, 1);
        // Bright warm golden-green spectral ramp: pale gold-lime core -> vibrant peridot green -> golden-olive tip
        const r = Math.round(lerp(244, 152, Math.pow(u, 0.78)));
        const g = Math.round(lerp(255, 206, Math.pow(u, 0.85)));
        const b = Math.round(lerp(180, 18, Math.pow(u, 0.52)));
        const idx = (py * w + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    cachedWarmGreenBeamTex = cv;
    return cv;
  }

  // Build exact 3D occlusion & refraction geometry for Alteration Triad (both inner 3-arc rings + 5 outer spines/bulbs + rotating polar axis)
  function buildAlterationTriadOccluders(altCfg, baseR, tSec, power) {
    if (!altCfg || !altCfg.isTriad) return null;
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const rings = [];
    if (altCfg.slot2Rings) {
      for (let i = 0; i < altCfg.slot2Rings.length; i++) {
        const rs = altCfg.slot2Rings[i];
        const ang = computeAlterationWanderAngles(tSec, rs.speedMult, rs.seed);
        const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
        const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
        const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
        rings.push({
          id: rs.id,
          R: baseR * rs.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
          hH: rs.bandHalfH * scaleH,
          arcCount: rs.arcCount || 3,
          arcFillFrac: rs.arcFillFrac || 0.66,
          spin: ang.spin,
          ux: u.x, uy: u.y, uz: u.z,
          vx: v.x, vy: v.y, vz: v.z,
          nx: n.x, ny: n.y, nz: n.z,
        });
      }
    }
    const cageSpec = altCfg.slot3Layer;
    let poleAxis = { x: 0, y: -1, z: 0 };
    const spineDirs = [];
    if (cageSpec && cageSpec.kind === 'spine_cage') {
      const cAng = computeAlterationWanderAngles(tSec, cageSpec.speedMult, cageSpec.seed);
      poleAxis = rotateIllusionVec(0, 1, 0, cAng.rx, cAng.ry, cAng.rz);
      const pL = Math.hypot(poleAxis.x, poleAxis.y, poleAxis.z) || 1;
      poleAxis.x /= pL; poleAxis.y /= pL; poleAxis.z /= pL;
      const cage = getAlterationCageGeometry();
      const bellyR = baseR * cageSpec.bellyRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      const halfH = baseR * cageSpec.halfHeightMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      for (let k = 0; k < cage.spines.length; k++) {
        const sp = cage.spines[k];
        for (let j = 1; j < sp.pts.length - 1; j++) {
          const pt = sp.pts[j];
          const lx = Math.cos(pt.az) * pt.rFrac * bellyR;
          const ly = pt.yFrac * halfH;
          const lz = Math.sin(pt.az) * pt.rFrac * bellyR;
          const rw = rotateIllusionVec(lx, ly, lz, cAng.rx, cAng.ry, cAng.rz);
          const dist = Math.hypot(rw.x, rw.y, rw.z) || 1;
          spineDirs.push({ dx: rw.x / dist, dy: rw.y / dist, dz: rw.z / dist, dist });
        }
      }
    }
    return { rings, poleAxis, spineDirs };
  }

  // Exact 3D occlusion/refraction test for Alteration Triad godrays against 3-arc segmented rings & 5 arched crystal spines
  function evalAlterationGodrayOcclusion(dx, dy, dz, maxLen, altOccs) {
    if (!altOccs) return { hitS: maxLen, trans: 1.0, occluded: false, refracted: false };
    let bestHitS = maxLen;
    let totalTrans = 1.0;
    let refracted = false;

    // 1. Check both inner 3-arc carapace rings (respecting exact arc vs empty gap windows!)
    for (let i = 0; i < altOccs.rings.length; i++) {
      const H = altOccs.rings[i];
      const dlx = dx * H.ux + dy * H.uy + dz * H.uz;
      const dly = dx * H.vx + dy * H.vy + dz * H.vz;
      const dlz = dx * H.nx + dy * H.ny + dz * H.nz;
      const rXY = Math.hypot(dlx, dly);
      if (rXY < 1e-4) continue;
      const sHit = H.R / rXY;
      if (sHit <= 0.5 || sHit >= maxLen) continue;
      const zHit = Math.abs(sHit * dlz);
      const halfBand = H.hH * 1.15;
      if (zHit < halfBand * 1.38) {
        // Check if azimuth lands on one of the 3 solid carapace-crystal arcs or passes cleanly through an empty gap!
        let phi = Math.atan2(dly, dlx) - H.spin;
        phi = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const secSpan = (Math.PI * 2) / H.arcCount;
        const inSec = (phi % secSpan) / secSpan; // 0..1 inside sector
        const halfGap = (1.0 - H.arcFillFrac) * 0.5;
        if (inSec > halfGap && inSec < 1.0 - halfGap) {
          const edgeZ = smoothstep(halfBand * 0.72, halfBand * 1.38, zHit);
          const localTrans = 0.14 + 0.86 * edgeZ;
          if (localTrans < 0.94 && sHit < bestHitS) bestHitS = sHit;
          totalTrans *= localTrans;
          refracted = true;
        }
      }
    }

    // 2. Check outer 5 arched crystal spines & bulbous purple joints
    for (let i = 0; i < altOccs.spineDirs.length; i++) {
      const nd = altOccs.spineDirs[i];
      if (nd.dist >= maxLen) continue;
      const dot = dx * nd.dx + dy * nd.dy + dz * nd.dz;
      if (dot > 0.968) {
        const edge = smoothstep(0.968, 0.994, dot);
        const localTrans = 1.0 - edge * 0.74;
        if (localTrans < 0.94 && nd.dist < bestHitS) bestHitS = nd.dist;
        totalTrans *= localTrans;
        refracted = true;
      }
    }

    return { hitS: bestHitS, trans: clamp(totalTrans, 0.10, 1.0), occluded: totalTrans < 0.94, refracted };
  }

  // Bright warm golden-green volumetric godrays in Alteration Triad, refracted by Slot 2/3 rings & cage,
  // streaming extra-strongly out through BOTH open poles of the 5-spine cage!
  function drawAlterationTriadGodrays(ctx, cx, cy, baseR, tSec, power, passPhase, altOccs) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const beamTex = getWarmGreenVolumetricBeamTexture();
    const isBackPass = passPhase === 'back';
    const isFrontPass = passPhase === 'front';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    function emitWarmGreenShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env, isPolar) {
      if (env < 0.018) return;
      const isBack = dz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;

      const occ = isPolar
        ? { hitS: worldLen, trans: 1.0, occluded: false, refracted: false }
        : evalAlterationGodrayOcclusion(dx, dy, dz, worldLen, altOccs);

      const p0 = projWorldPoint(dx * 2.0 * scaleR, dy * 2.0 * scaleR, dz * 2.0 * scaleR, cx, cy);
      const p1 = projWorldPoint(dx * worldLen, dy * worldLen, dz * worldLen, cx, cy);
      const screenLen = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);

      if (screenLen > 4.5) {
        const ang = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
        let clipFrac = 1.0;
        if (occ.occluded) {
          const pHit = projWorldPoint(dx * occ.hitS, dy * occ.hitS, dz * occ.hitS, cx, cy);
          clipFrac = clamp(Math.hypot(pHit.sx - p0.sx, pHit.sy - p0.sy) / screenLen, 0.05, 0.99);
          // Prismatic golden-green refraction glint where beam breaks against crystal ring or spine!
          if (occ.refracted && occ.trans < 0.65) {
            const gR = (3.4 + spreadHalfW * 0.16) * pHit.persp;
            const gA = clamp(baseAlpha * env * (1.0 - occ.trans) * 0.65, 0, 0.28);
            const gg = ctx.createRadialGradient(pHit.sx, pHit.sy, 0.2, pHit.sx, pHit.sy, gR);
            gg.addColorStop(0, `rgba(246, 255, 194, ${gA.toFixed(3)})`);
            gg.addColorStop(0.55, `rgba(120, 238, 42, ${(gA * 0.45).toFixed(3)})`);
            gg.addColorStop(1, 'rgba(60, 140, 18, 0)');
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(pHit.sx, pHit.sy, gR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        const perspGain = isBack ? (0.66 + 0.34 * (1 + dz)) : (0.94 + 0.24 * dz);
        const halfW = spreadHalfW * (0.78 + 0.34 * p1.persp);
        drawVolumetricGodrayBeam(ctx, beamTex, p0.sx, p0.sy, ang, screenLen, halfW, baseAlpha * env * perspGain, clipFrac, occ.trans);
      }
    }

    // 1. 28 omnidirectional warm-green volumetric rays refracted by inner 3-arc rings & outer 5-spine cage
    for (let i = 0; i < 28; i++) {
      const period = 3.0 + hash01(i * 19 + 5) * 3.2;
      const cyc = tSec / period + hash01(i * 31 + 17);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.60);
      if (env < 0.02) continue;
      const seed = gen * 103 + i * 37 + 11;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.90;
      const az = hash01(seed + 2) * Math.PI * 2 + (life - 0.5) * 0.22 * (i % 2 === 0 ? 1 : -1) + tSec * 0.02;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (54 + hash01(seed + 3) * 48) * scaleR * (0.88 + power * 0.20);
      const spreadHalfW = (6.4 + hash01(seed + 4) * 6.4) * scaleR;
      const baseAlpha = (0.125 + hash01(seed + 5) * 0.095) * (0.86 + power * 0.22);
      emitWarmGreenShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env, false);
    }

    // 2. Concentrated, extra-bright warm golden-green plumes bursting strongly through BOTH open poles of the 5-spine cage!
    if (altOccs && altOccs.poleAxis) {
      const pA = altOccs.poleAxis;
      // Build orthonormal tangent pair (T1, T2) perpendicular to the rotating cage polar axis
      const rx = Math.abs(pA.y) < 0.9 ? 0 : 1;
      const ry = Math.abs(pA.y) < 0.9 ? 1 : 0;
      let t1x = ry * pA.z;
      let t1y = -rx * pA.z;
      let t1z = rx * pA.y - ry * pA.x;
      const t1L = Math.hypot(t1x, t1y, t1z) || 1;
      t1x /= t1L; t1y /= t1L; t1z /= t1L;
      const t2x = pA.y * t1z - pA.z * t1y;
      const t2y = pA.z * t1x - pA.x * t1z;
      const t2z = pA.x * t1y - pA.y * t1x;

      for (let poleSign = -1; poleSign <= 1; poleSign += 2) {
        const POLAR_RAYS = 7;
        for (let r = 0; r < POLAR_RAYS; r++) {
          const period = 2.1 + hash01(r * 29 + (poleSign > 0 ? 7 : 41)) * 2.2;
          const cyc = tSec / period + hash01(r * 47 + (poleSign > 0 ? 13 : 53));
          const gen = Math.floor(cyc);
          const life = cyc - gen;
          const env = 0.28 + 0.72 * Math.pow(Math.sin(life * Math.PI), 1.35);
          const seed = gen * 89 + r * 31 + (poleSign > 0 ? 17 : 71);
          const coneAng = hash01(seed + 1) * Math.PI * 2 + tSec * 0.18 * poleSign;
          const coneTilt = 0.03 + hash01(seed + 2) * 0.23; // Focused beam plume streaming straight out the polar opening!
          const sinC = Math.sin(coneTilt);
          const cosC = Math.cos(coneTilt);
          let dx = pA.x * poleSign * cosC + (t1x * Math.cos(coneAng) + t2x * Math.sin(coneAng)) * sinC;
          let dy = pA.y * poleSign * cosC + (t1y * Math.cos(coneAng) + t2y * Math.sin(coneAng)) * sinC;
          let dz = pA.z * poleSign * cosC + (t1z * Math.cos(coneAng) + t2z * Math.sin(coneAng)) * sinC;
          const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
          dx *= inv; dy *= inv; dz *= inv;

          const worldLen = (72 + hash01(seed + 3) * 46) * scaleR * (0.90 + power * 0.20);
          const spreadHalfW = (5.8 + hash01(seed + 4) * 6.8) * scaleR;
          const baseAlpha = (0.20 + hash01(seed + 5) * 0.14) * (0.88 + power * 0.20);
          emitWarmGreenShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env, true);
        }
      }
    }
    ctx.restore();
  }

  // Helper: Draw geometric-chaotic crystal crack/fracture lines & branches with directional pale white-green -> crystal green cleavage bevel!
  // Zero per-facet createLinearGradient allocations; clips only on large hero facets (span >= 14px) while tiny facets keep geometry strictly interior.
  function drawCrystalCrackGradient(ctx, polyPts, seed, dim = 1.0) {
    if (!polyPts || polyPts.length < 3 || dim < 0.14) return;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    let cenX = 0, cenY = 0;
    const n = polyPts.length;
    for (let i = 0; i < n; i++) {
      const p = polyPts[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      cenX += p.x;
      cenY += p.y;
    }
    const span = Math.hypot(maxX - minX, maxY - minY);
    if (span < 7.2) return;
    cenX /= n;
    cenY /= n;

    // Strictly interior cleavage geometry avoids 50+ per-frame GPU stencil ctx.clip() flushes in Alteration Triad!
    const useClip = false;

    const crackCount = span > 12.0 ? 2 : 1;
    const segs = [];

    function pushCleavageSeg(x0, y0, x1, y1, sSeed, widthScale) {
      const dx = x1 - x0, dy = y1 - y0;
      const segL = Math.hypot(dx, dy);
      if (segL < 1.8) return;
      const nx = -dy / segL, ny = dx / segL;
      const sideSign = useClip
        ? (hash01(sSeed * 41 + 13) > 0.5 ? 1 : -1)
        : (((cenX - (x0 + x1) * 0.5) * nx + (cenY - (y0 + y1) * 0.5) * ny) >= 0 ? 1 : -1);
      const gradThick = clamp(segL * (0.20 + hash01(sSeed * 47 + 17) * 0.18) * widthScale, 1.2, useClip ? 4.6 : 2.6);
      segs.push(x0, y0, x1, y1, nx * sideSign, ny * sideSign, gradThick, gradThick * 0.46);
    }

    for (let c = 0; c < crackCount; c++) {
      const cSeed = seed + c * 71;
      const iA = Math.floor(hash01(cSeed * 17 + 3) * n) % n;
      const iB = (iA + Math.max(1, Math.floor(n * (0.45 + c * 0.15)))) % n;
      const fA = 0.22 + hash01(cSeed * 23 + 7) * 0.56;
      const fB = 0.22 + hash01(cSeed * 29 + 11) * 0.56;
      const a0 = polyPts[iA], a1 = polyPts[(iA + 1) % n];
      const b0 = polyPts[iB], b1 = polyPts[(iB + 1) % n];
      const sxRaw = lerp(a0.x, a1.x, fA), syRaw = lerp(a0.y, a1.y, fA);
      const exRaw = lerp(b0.x, b1.x, fB), eyRaw = lerp(b0.y, b1.y, fB);
      const sx = useClip ? sxRaw : lerp(sxRaw, cenX, 0.12);
      const sy = useClip ? syRaw : lerp(syRaw, cenY, 0.12);
      const ex = useClip ? exRaw : lerp(exRaw, cenX, 0.12);
      const ey = useClip ? eyRaw : lerp(eyRaw, cenY, 0.12);
      const dx = ex - sx, dy = ey - sy;
      const segL = Math.hypot(dx, dy);
      if (segL < 2.4) continue;
      const nx = -dy / segL, ny = dx / segL;
      const tBend = 0.34 + hash01(cSeed * 31 + 9) * 0.34;
      const kink = (hash01(cSeed * 37 + 5) - 0.5) * segL * (useClip ? 0.42 : 0.28);
      const mx = lerp(sx, ex, tBend) + nx * kink;
      const my = lerp(sy, ey, tBend) + ny * kink;

      pushCleavageSeg(sx, sy, mx, my, cSeed + 1, 1.0);
      pushCleavageSeg(mx, my, ex, ey, cSeed + 2, 0.92);

      let brX, brY;
      if (useClip) {
        const brSide = hash01(cSeed * 59 + 19) > 0.5 ? 1 : -1;
        const brLen = segL * (0.36 + hash01(cSeed * 61 + 23) * 0.28);
        brX = mx + (dx / segL) * brLen * 0.42 + nx * brSide * brLen * 0.88;
        brY = my + (dy / segL) * brLen * 0.42 + ny * brSide * brLen * 0.88;
      } else {
        const iC = (iA + 1 + (Math.floor(hash01(cSeed * 59 + 19) * (n - 1)) % Math.max(1, n - 1))) % n;
        const tBr = 0.46 + hash01(cSeed * 61 + 23) * 0.24;
        brX = lerp(mx, polyPts[iC].x, tBr);
        brY = lerp(my, polyPts[iC].y, tBr);
      }
      pushCleavageSeg(mx, my, brX, brY, cSeed + 3, 0.72);
    }

    if (segs.length > 0) {
      // Batched 2-pass fracture cleavage bevel + crisp ridge (eliminates 220+ extra micro-draws in Alteration Triad)
      ctx.fillStyle = `rgba(232, 255, 198, ${(0.52 * dim).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 8) {
        const x0 = segs[i], y0 = segs[i + 1], x1 = segs[i + 2], y1 = segs[i + 3];
        const ox = segs[i + 4] * (segs[i + 6] * 0.72), oy = segs[i + 5] * (segs[i + 6] * 0.72);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + ox, y1 + oy); ctx.lineTo(x0 + ox, y0 + oy); ctx.closePath();
      }
      ctx.fill();

      ctx.strokeStyle = `rgba(250, 255, 232, ${(0.82 * dim).toFixed(3)})`;
      ctx.lineWidth = 0.56;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 8) {
        ctx.moveTo(segs[i], segs[i + 1]);
        ctx.lineTo(segs[i + 2], segs[i + 3]);
      }
      ctx.stroke();
    }
    if (useClip) ctx.restore();
  }

  // Helper: Draw a chaotic glossy warm-green crystal (can flare/widen toward tip, skew asymmetrically, with pale white-green crack gradients!)
  function drawWarmGreenGlossyCrystal(ctx, x0, y0, x1, y1, baseW, lightScore, persp, isBack, sparklePhase, shapeSeed = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1.6) return;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const hw = baseW * persp;

    // Chaotic silhouette parameters: many crystals FLARE wider toward their crown tip!
    const hFlare = hash01(shapeSeed * 19 + 5);
    const hSkew = (hash01(shapeSeed * 31 + 11) - 0.5) * 0.55;
    const hShPos = 0.62 + hash01(shapeSeed * 43 + 7) * 0.20;
    // Flare multiplier: ~65% of crystals widen toward the tip (1.15x..1.72x base width!)
    const flareMult = hFlare > 0.32 ? (1.12 + hFlare * 0.62) : (0.72 + hFlare * 0.9);
    const shWL = hw * flareMult * (0.88 + hash01(shapeSeed * 53 + 3) * 0.28);
    const shWR = hw * flareMult * (0.86 + hash01(shapeSeed * 67 + 9) * 0.28);
    const shXL = x0 + dx * clamp(hShPos - hSkew * 0.16, 0.45, 0.88);
    const shYL = y0 + dy * clamp(hShPos - hSkew * 0.16, 0.45, 0.88);
    const shXR = x0 + dx * clamp(hShPos + hSkew * 0.16, 0.45, 0.88);
    const shYR = y0 + dy * clamp(hShPos + hSkew * 0.16, 0.45, 0.88);
    // Slight ridge offset for asymmetric faceted crystal geometry
    const ridgeX = x0 + dx * (hShPos * 0.92) + px * hw * hSkew * 0.55;
    const ridgeY = y0 + dy * (hShPos * 0.92) + py * hw * hSkew * 0.55;
    const dim = isBack ? 0.56 : 1.0;

    // Shaded right facet (rich deep peridot green)
    const rightPoly = [
      { x: x0, y: y0 },
      { x: x0 + px * hw * 0.88, y: y0 + py * hw * 0.88 },
      { x: shXR + px * shWR, y: shYR + py * shWR },
      { x: x1, y: y1 },
      { x: ridgeX, y: ridgeY },
    ];
    ctx.fillStyle = isBack
      ? 'rgba(32, 86, 14, 0.80)'
      : `rgba(${Math.round(lerp(34, 78, lightScore))}, ${Math.round(lerp(114, 186, lightScore))}, ${Math.round(lerp(14, 24, lightScore))}, 0.95)`;
    ctx.beginPath();
    for (let i = 0; i < rightPoly.length; i++) {
      if (i === 0) ctx.moveTo(rightPoly[i].x, rightPoly[i].y); else ctx.lineTo(rightPoly[i].x, rightPoly[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Sunlit left glossy facet (bright saturated warm golden-green)
    const spec = Math.pow(clamp(lightScore, 0, 1), 2.7);
    const lR = Math.round(lerp(110, 248, lightScore * 0.52 + spec * 0.48) * dim);
    const lG = Math.round(lerp(222, 255, lightScore * 0.65 + spec * 0.35) * dim);
    const lB = Math.round(lerp(30, 196, spec * 0.85) * dim);
    const leftPoly = [
      { x: x0, y: y0 },
      { x: x0 - px * hw * 0.88, y: y0 - py * hw * 0.88 },
      { x: shXL - px * shWL, y: shYL - py * shWL },
      { x: x1, y: y1 },
      { x: ridgeX, y: ridgeY },
    ];
    ctx.fillStyle = `rgba(${lR}, ${lG}, ${lB}, 0.96)`;
    ctx.beginPath();
    for (let i = 0; i < leftPoly.length; i++) {
      if (i === 0) ctx.moveTo(leftPoly[i].x, leftPoly[i].y); else ctx.lineTo(leftPoly[i].x, leftPoly[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Beveled crown facet on flared wide tips for extra geometric richness
    if (flareMult > 1.15 && !isBack) {
      ctx.fillStyle = `rgba(226, 255, 148, ${(0.34 + spec * 0.42).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(shXL - px * shWL, shYL - py * shWL);
      ctx.lineTo(x1, y1);
      ctx.lineTo(ridgeX, ridgeY);
      ctx.closePath();
      ctx.fill();
    }

    // Geometric-chaotic crystal cracks/fractures with pale white-green cleavage gradient along random sides!
    if (!isBack && len >= 6.8) {
      const fullPoly = [
        { x: x0 - px * hw * 0.88, y: y0 - py * hw * 0.88 },
        { x: shXL - px * shWL, y: shYL - py * shWL },
        { x: x1, y: y1 },
        { x: shXR + px * shWR, y: shYR + py * shWR },
        { x: x0 + px * hw * 0.88, y: y0 + py * hw * 0.88 },
      ];
      drawCrystalCrackGradient(ctx, fullPoly, shapeSeed * 13 + 7, 0.85);
    }

    // Crisp glossy ridge highlight & twinkling specular star-glint
    if (!isBack) {
      ctx.strokeStyle = `rgba(248, 255, 206, ${(0.45 + spec * 0.50).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.50, 0.72 * persp);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(ridgeX, ridgeY);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      const gl = Math.max(0, Math.sin(sparklePhase));
      if (gl > 0.78 && lightScore > 0.45 && len > 4.5) {
        const gStr = ((gl - 0.78) / 0.22);
        const gx = lerp(ridgeX, x1, 0.45);
        const gy = lerp(ridgeY, y1, 0.45);
        const sr = (2.1 + gStr * 2.5) * persp;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 255, 226, ${(gStr * 0.92).toFixed(3)})`;
        ctx.lineWidth = 0.72;
        ctx.beginPath();
        ctx.moveTo(gx - sr, gy); ctx.lineTo(gx + sr, gy);
        ctx.moveTo(gx, gy - sr); ctx.lineTo(gx, gy + sr);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Cached irregular craggy 42-vertex earth clod mesh with embedded dark-grey stones!
  let cachedAlterationClodMesh = null;
  function getAlterationClodMesh() {
    if (cachedAlterationClodMesh) return cachedAlterationClodMesh;
    const base = getIllusionIcosahedronMesh();
    const verts = base.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    const midCache = new Map();
    function getMid(a, b) {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (midCache.has(k)) return midCache.get(k);
      const va = verts[a], vb = verts[b];
      const mx = va.x + vb.x, my = va.y + vb.y, mz = va.z + vb.z;
      const l = Math.hypot(mx, my, mz) || 1;
      const idx = verts.length;
      verts.push({ x: mx / l, y: my / l, z: mz / l });
      midCache.set(k, idx);
      return idx;
    }
    const faces = [];
    for (let f = 0; f < base.faces.length; f++) {
      const [a, b, c] = base.faces[f];
      const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
      faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    // Strong irregular craggy soil displacement (0.64..1.40) + ~28% dark-grey stone inclusions!
    const craggyVerts = verts.map((v, idx) => {
      const h1 = hash01(idx * 41 + 9);
      const h2 = hash01(idx * 73 + 17);
      const rScale = 0.66 + h1 * 0.56 + (h2 > 0.72 ? 0.18 : 0);
      return { x: v.x * rScale, y: v.y * rScale * 0.96, z: v.z * rScale };
    });
    const faceMeta = faces.map((tri, fIdx) => {
      // Cluster dark-grey stone faces into natural rocky patches (~26% of surface)
      const isStone = hash01(tri[0] * 31 + 5) > 0.72 || hash01(fIdx * 53 + 11) > 0.84;
      const tintVar = (hash01(fIdx * 19 + 3) - 0.5) * 16;
      return { tri, isStone, tintVar };
    });
    // Also 9 distinct chunky dark-grey pebbles protruding slightly from the brown soil clod
    const stones = [];
    for (let s = 0; s < 9; s++) {
      const uZ = 1 - ((s + 0.5) / 9) * 2;
      const rXY = Math.sqrt(Math.max(0.01, 1 - uZ * uZ));
      const az = s * 2.39996 + 0.85;
      stones.push({
        x: Math.cos(az) * rXY * 0.96,
        y: uZ * 0.94,
        z: Math.sin(az) * rXY * 0.96,
        r: 0.20 + hash01(s * 29 + 7) * 0.14,
        seed: s * 37 + 13,
      });
    }
    cachedAlterationClodMesh = { verts: craggyVerts, faceMeta, stones };
    return cachedAlterationClodMesh;
  }

  // --- ALTERATION SLOT 1: Craggy Irregular Brown Earth Clod + Dark-Grey Stones + Dense Slow-Breathing Flaring Crystal Clusters + Falling Soil ---
  function drawAlterationSlot1EarthCrystal(ctx, cx, cy, baseR, tSec, power, triadGodrays = false, altOccs = null) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const clodR = 11.4 * scaleR;

    if (triadGodrays) {
      drawAlterationTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'back', altOccs);
    }

    const rotX = 0.24 + Math.sin(tSec * 0.25) * 0.34;
    const rotY = tSec * 0.36;
    const rotZ = Math.cos(tSec * 0.19) * 0.24;

    const clodMesh = getAlterationClodMesh();
    const clodVerts = clodMesh.verts.map((v) => {
      const rw = rotateIllusionVec(v.x * clodR, v.y * clodR, v.z * clodR, rotX, rotY, rotZ);
      const persp = 128 / Math.max(24, 128 - rw.z);
      return { wx: rw.x, wy: rw.y, wz: rw.z, sx: cx + rw.x * persp, sy: cy + rw.y * persp, persp };
    });

    // 6 dense crystal clusters (4-5 tightly packed chaotic flaring crystals per cluster = 26 crystals!)
    // Appearance/disappearance period is ~3x slower (8.4..15.8s) so clusters emerge & fade gradually!
    const CLUSTERS = 6;
    const backCrystals = [];
    const frontCrystals = [];
    const lx = -0.45, ly = -0.62, lz = 0.64;

    for (let cl = 0; cl < CLUSTERS; cl++) {
      const uZ = 1 - ((cl + 0.5) / CLUSTERS) * 1.85;
      const rXY = Math.sqrt(Math.max(0.01, 1 - uZ * uZ));
      const az = cl * 2.39996 + hash01(cl * 23 + 3) * 0.55;
      const cDirX = Math.cos(az) * rXY;
      const cDirY = uZ;
      const cDirZ = Math.sin(az) * rXY;

      // 3x slower cluster emergence/recession cycle (9.0..15.6 seconds!) with staggered phases so 3-4 dense clusters stay lush at all times
      const period = 9.0 + hash01(cl * 37 + 7) * 6.6;
      const cyc = tSec / period + (cl / CLUSTERS) + hash01(cl * 53 + 11) * 0.14;
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const clusterBell = Math.pow(Math.sin(life * Math.PI), 0.56);
      if (clusterBell < 0.04) continue;

      // Tangent frame around cluster pocket to pack 4-5 crystals densely together
      const refX = Math.abs(cDirY) < 0.85 ? 0 : 1;
      const refY = Math.abs(cDirY) < 0.85 ? 1 : 0;
      let t1x = refY * cDirZ, t1y = -refX * cDirZ, t1z = refX * cDirY - refY * cDirX;
      const t1L = Math.hypot(t1x, t1y, t1z) || 1;
      t1x /= t1L; t1y /= t1L; t1z /= t1L;
      const t2x = cDirY * t1z - cDirZ * t1y;
      const t2y = cDirZ * t1x - cDirX * t1z;
      const t2z = cDirX * t1y - cDirY * t1x;

      const countInCluster = 4 + (cl % 2); // 4 or 5 tightly clustered crystals!
      for (let m = 0; m < countInCluster; m++) {
        const cSeed = gen * 131 + cl * 37 + m * 17 + 5;
        // Slight per-crystal stagger inside cluster so inner crystals lead & side crystals follow smoothly
        const mPhase = clamp(clusterBell * (1.15 - m * 0.08), 0, 1);
        if (mPhase < 0.06) continue;
        const ringA = (m / countInCluster) * Math.PI * 2 + hash01(cSeed + 1) * 0.65;
        const spread = (m === 0) ? 0.06 : (0.18 + hash01(cSeed + 2) * 0.24);
        const offsetR = (m === 0) ? 0.05 : (0.14 + hash01(cSeed + 3) * 0.14);

        const rx0 = cDirX + (t1x * Math.cos(ringA) + t2x * Math.sin(ringA)) * offsetR;
        const ry0 = cDirY + (t1y * Math.cos(ringA) + t2y * Math.sin(ringA)) * offsetR;
        const rz0 = cDirZ + (t1z * Math.cos(ringA) + t2z * Math.sin(ringA)) * offsetR;
        const rNorm = 1 / (Math.hypot(rx0, ry0, rz0) || 1);

        let dxL = cDirX + (t1x * Math.cos(ringA) + t2x * Math.sin(ringA)) * spread;
        let dyL = cDirY + (t1y * Math.cos(ringA) + t2y * Math.sin(ringA)) * spread;
        let dzL = cDirZ + (t1z * Math.cos(ringA) + t2z * Math.sin(ringA)) * spread;
        const dInv = 1 / (Math.hypot(dxL, dyL, dzL) || 1);
        dxL *= dInv; dyL *= dInv; dzL *= dInv;

        const maxLen = ((m === 0 ? 10.5 : 6.2) + hash01(cSeed + 4) * 7.2) * scaleR;
        const cLen = maxLen * mPhase;
        if (cLen < 1.5) continue;

        const rootDist = clodR * (0.72 + hash01(cSeed + 5) * 0.22);
        const rRoot = rotateIllusionVec(rx0 * rNorm * rootDist, ry0 * rNorm * rootDist, rz0 * rNorm * rootDist, rotX, rotY, rotZ);
        const rDir = rotateIllusionVec(dxL, dyL, dzL, rotX, rotY, rotZ);
        const rTip = { x: rRoot.x + rDir.x * cLen, y: rRoot.y + rDir.y * cLen, z: rRoot.z + rDir.z * cLen };
        const pRoot = projWorldPoint(rRoot.x, rRoot.y, rRoot.z, cx, cy);
        const pTip = projWorldPoint(rTip.x, rTip.y, rTip.z, cx, cy);
        const midZ = (rRoot.z + rTip.z) * 0.5;
        const lightScore = clamp(rDir.x * lx + rDir.y * ly + rDir.z * lz + 0.25, 0.08, 1.0);
        const baseW = (1.35 + hash01(cSeed + 6) * 1.25) * (0.48 + 0.52 * mPhase) * scaleR;
        const item = {
          x0: pRoot.sx, y0: pRoot.sy, x1: pTip.sx, y1: pTip.sy,
          baseW, lightScore, persp: pTip.persp, midZ,
          sparklePhase: tSec * (2.6 + (m % 4) * 0.5) + cl * 2.1 + m,
          shapeSeed: cSeed,
        };
        if (midZ < 0) backCrystals.push(item); else frontCrystals.push(item);
      }
    }
    backCrystals.sort((a, b) => a.midZ - b.midZ);
    frontCrystals.sort((a, b) => a.midZ - b.midZ);

    // 1. Back cluster crystals behind the craggy earth clod
    ctx.save();
    for (let i = 0; i < backCrystals.length; i++) {
      const c = backCrystals[i];
      drawWarmGreenGlossyCrystal(ctx, c.x0, c.y0, c.x1, c.y1, c.baseW, c.lightScore, c.persp, true, c.sparklePhase, c.shapeSeed);
    }

    // 2. Craggy irregular matte brown earth clod with dark-grey stone inclusions (80 faces sorted back-to-front)
    const clodFaces = clodMesh.faceMeta.map((fm) => {
      const a = clodVerts[fm.tri[0]], b = clodVerts[fm.tri[1]], c = clodVerts[fm.tri[2]];
      const e1x = b.wx - a.wx, e1y = b.wy - a.wy, e1z = b.wz - a.wz;
      const e2x = c.wx - a.wx, e2y = c.wy - a.wy, e2z = c.wz - a.wz;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nL = Math.hypot(nx, ny, nz) || 1;
      nx /= nL; ny /= nL; nz /= nL;
      const mx = (a.wx + b.wx + c.wx) / 3;
      const my = (a.wy + b.wy + c.wy) / 3;
      const mz = (a.wz + b.wz + c.wz) / 3;
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ndotl = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
      return { a, b, c, mz, isFront: nz >= -0.10, ndotl, isStone: fm.isStone, tintVar: fm.tintVar };
    });
    clodFaces.sort((a, b) => a.mz - b.mz);

    for (let i = 0; i < clodFaces.length; i++) {
      const f = clodFaces[i];
      if (!f.isFront) continue;
      if (f.isStone) {
        // Embedded matte dark-grey stone facets!
        const gBase = clamp(44 + f.ndotl * 56 + f.tintVar * 0.7, 28, 116);
        ctx.fillStyle = `rgb(${Math.round(gBase * 0.94)}, ${Math.round(gBase * 0.98)}, ${Math.round(gBase * 1.06)})`;
        ctx.strokeStyle = 'rgba(18, 20, 24, 0.56)';
      } else {
        // Rough matte earthy brown soil facets (softer internal seams so clod reads organically craggy, not wireframe!)
        const rC = Math.round(clamp(46 + f.ndotl * 62 + f.tintVar, 24, 122));
        const gC = Math.round(clamp(27 + f.ndotl * 38 + f.tintVar * 0.6, 14, 82));
        const bC = Math.round(clamp(16 + f.ndotl * 22 + f.tintVar * 0.4, 8, 50));
        ctx.fillStyle = `rgb(${rC}, ${gC}, ${bC})`;
        ctx.strokeStyle = 'rgba(24, 14, 7, 0.24)';
      }
      ctx.beginPath();
      ctx.moveTo(f.a.sx, f.a.sy);
      ctx.lineTo(f.b.sx, f.b.sy);
      ctx.lineTo(f.c.sx, f.c.sy);
      ctx.closePath();
      ctx.fill();
      if (f.isStone) {
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
    }

    // Protruding matte dark-grey stone pebbles embedded in the front of the brown clod
    for (let s = 0; s < clodMesh.stones.length; s++) {
      const st = clodMesh.stones[s];
      const rw = rotateIllusionVec(st.x * clodR, st.y * clodR, st.z * clodR, rotX, rotY, rotZ);
      if (rw.z < 0.5) continue;
      const p = projWorldPoint(rw.x, rw.y, rw.z, cx, cy);
      const pr = st.r * clodR * p.persp;
      const nd = clamp((rw.x / clodR) * lx + (rw.y / clodR) * ly + (rw.z / clodR) * lz + 0.25, 0.15, 1.0);
      const gv = Math.round(clamp(44 + nd * 54, 30, 108));
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(hash01(st.seed) * Math.PI * 2);
      ctx.fillStyle = `rgb(${Math.round(gv * 0.94)}, ${Math.round(gv * 0.98)}, ${Math.round(gv * 1.06)})`;
      ctx.beginPath();
      ctx.moveTo(-pr, -pr * 0.35);
      ctx.lineTo(-pr * 0.25, -pr * 0.85);
      ctx.lineTo(pr * 0.85, -pr * 0.45);
      ctx.lineTo(pr * 0.95, pr * 0.40);
      ctx.lineTo(pr * 0.15, pr * 0.82);
      ctx.lineTo(-pr * 0.78, pr * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(18, 20, 24, 0.78)';
      ctx.lineWidth = 0.55;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Front dense cluster crystals sprouting out of the front of the clod
    for (let i = 0; i < frontCrystals.length; i++) {
      const c = frontCrystals[i];
      drawWarmGreenGlossyCrystal(ctx, c.x0, c.y0, c.x1, c.y1, c.baseW, c.lightScore, c.persp, false, c.sparklePhase, c.shapeSeed);
    }

    // 4. Falling earthy brown soil crumbs & occasional dark-grey stone gravel flaking downward
    const CRUMBS = 20;
    for (let i = 0; i < CRUMBS; i++) {
      const period = 1.6 + hash01(i * 23 + 7) * 1.9;
      const raw = tSec / period + hash01(i * 41 + 13);
      const gen = Math.floor(raw);
      const u = raw - gen;
      const seed = gen * 97 + i * 31 + 5;
      const ang = (hash01(seed + 1) - 0.5) * Math.PI * 1.35 + Math.PI * 0.5;
      const sx0 = cx + Math.cos(ang) * (clodR * (0.55 + hash01(seed + 2) * 0.55));
      const sy0 = cy + Math.sin(ang) * (clodR * (0.45 + hash01(seed + 3) * 0.55));
      const dt = u * period;
      const vx = (hash01(seed + 4) - 0.5) * 7.5 * scaleR;
      const vy0 = (3.0 + hash01(seed + 5) * 6.0) * scaleR;
      const grav = (28.0 + hash01(seed + 6) * 18.0) * scaleR;
      const px = sx0 + vx * dt;
      const py = sy0 + vy0 * dt + 0.5 * grav * dt * dt;
      const fade = smoothstep(0.0, 0.08, u) * Math.pow(1.0 - u, 1.35);
      if (fade < 0.03) continue;

      const sz = (0.85 + hash01(seed + 7) * 1.55) * scaleR;
      const rotC = hash01(seed + 8) * Math.PI * 2 + dt * 3.8 * (i % 2 === 0 ? 1 : -1);
      const isGravel = (i % 5 === 0);
      const shade = hash01(seed + 9);
      const cr = isGravel ? Math.round(lerp(56, 98, shade)) : Math.round(lerp(56, 118, shade));
      const cg = isGravel ? Math.round(lerp(60, 102, shade)) : Math.round(lerp(33, 74, shade));
      const cb = isGravel ? Math.round(lerp(66, 110, shade)) : Math.round(lerp(20, 44, shade));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotC);
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${(fade * 0.92).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(-sz, -sz * 0.45);
      ctx.lineTo(sz * 0.35, -sz * 0.85);
      ctx.lineTo(sz, sz * 0.25);
      ctx.lineTo(0.1 * sz, sz * 0.85);
      ctx.lineTo(-sz * 0.8, sz * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    if (triadGodrays) {
      drawAlterationTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'front', altOccs);
    }
  }

  // --- ALTERATION SLOT 2 / NON-TRIAD SLOT 3: 3 DISTINCT Asymmetric Crystalline Beds + Wide Rounded Biological Purple Carapace Plates ---
  // Thinner faceted warm-green crystal substrate (backface-culled, zero flicker) overlaid by wide, smoothly rounded,
  // matte dark-purple organic chitin/nail growths that overhang freely past the crystal width in monotonic shingled order!
  const ALTERATION_CHUNK_PROFILES = Object.freeze([
    {
      spanMult: 1.05,
      plateCount: 4,
      plateVShift: -0.18,
      plateVHalf: 1.12,
      overhangLead: 0.24,
      uKnots: [0.0, 0.25, 0.56, 0.84, 1.0],
      crysTopJut: [0.30, 0.78, 0.96, 0.80, 0.36],
      crysBotJut: [0.24, 0.58, 0.70, 0.56, 0.26],
      crysThickProfile: [0.46, 0.92, 1.10, 0.94, 0.50],
      plateSpread: [0.88, 1.08, 1.16, 0.96],
      seed: 101,
    },
    {
      spanMult: 1.10,
      plateCount: 3,
      plateVShift: 0.14,
      plateVHalf: 1.24,
      overhangLead: 0.18,
      uKnots: [0.0, 0.30, 0.62, 0.88, 1.0],
      crysTopJut: [0.24, 0.62, 0.74, 0.56, 0.26],
      crysBotJut: [0.32, 0.82, 0.96, 0.80, 0.34],
      crysThickProfile: [0.42, 0.96, 1.12, 0.92, 0.46],
      plateSpread: [0.96, 1.18, 1.02],
      seed: 223,
    },
    {
      spanMult: 0.94,
      plateCount: 5,
      plateVShift: -0.04,
      plateVHalf: 1.04,
      overhangLead: 0.15,
      uKnots: [0.0, 0.22, 0.50, 0.78, 1.0],
      crysTopJut: [0.34, 0.88, 0.70, 0.92, 0.32],
      crysBotJut: [0.32, 0.72, 0.90, 0.68, 0.30],
      crysThickProfile: [0.50, 1.04, 0.92, 1.08, 0.48],
      plateSpread: [0.86, 1.04, 1.16, 1.08, 0.92],
      seed: 347,
    },
  ]);

  const ALTERATION_PLATE_UNIT_LOOP = (() => {
    const N = 14;
    const out = [];
    for (let s = 0; s < N; s++) {
      const th = (s / N) * Math.PI * 2;
      const cT = Math.cos(th);
      const sT = Math.sin(th);
      const sU = Math.sign(cT) * Math.pow(Math.abs(cT), 0.70);
      const sVBase = Math.sign(sT) * Math.pow(Math.abs(sT), 0.66);
      const lobeBase = 0.94 + 0.12 * sU - 0.06 * sU * sU;
      out.push({ sU, sVBase, lobeBase, sin2: Math.sin(th * 2), cos3: Math.cos(th * 3) });
    }
    return Object.freeze(out);
  })();

  const _altRingFacesCache = new Map();

  function drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, ringSpec, passPhase) {
    if (!ringSpec) return;
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';
    const cacheId = ringSpec.seed;
    const frameKey = `${tSec}|${cx}|${cy}|${baseR}|${power}|${ringSpec.ringRMult}`;
    let cached = _altRingFacesCache.get(cacheId);
    if (!cached || cached.key !== frameKey) {
      const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
      const R = baseR * ringSpec.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      const hH = ringSpec.bandHalfH * scaleH;
      const radialThick = Math.max(1.9, hH * 0.44);
      const ang = computeAlterationWanderAngles(tSec, ringSpec.speedMult, ringSpec.seed);

      const uAx = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
      const vAx = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
      const nAx = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);

      function toWorld(phi, zVal, rOff) {
        const rr = R + rOff;
        const lx = rr * Math.cos(phi);
        const ly = rr * Math.sin(phi);
        const wx = uAx.x * lx + vAx.x * ly + nAx.x * zVal;
        const wy = uAx.y * lx + vAx.y * ly + nAx.y * zVal;
        const wz = uAx.z * lx + vAx.z * ly + nAx.z * zVal;
        const persp = 128 / Math.max(24, 128 - wz);
        return { wx, wy, wz, sx: cx + wx * persp, sy: cy + wy * persp, persp };
      }

      const CHUNK_PROFILES = ALTERATION_CHUNK_PROFILES;
      const ARCS = 3;
      const secSpan = (Math.PI * 2) / ARCS;
      const baseArcSpan = secSpan * (ringSpec.arcFillFrac || 0.64);
      const lx = -0.45, ly = -0.60, lz = 0.66;
      const backFaces = [];
      const frontFaces = [];

      function pushCrystalFace(pts3d, slabRef, anchorZ, meta) {
        const isBack = anchorZ < 0;
        let mx = 0, my = 0, mz = 0;
        for (let i = 0; i < pts3d.length; i++) {
          mx += pts3d[i].wx;
          my += pts3d[i].wy;
          mz += pts3d[i].wz;
        }
        mx /= pts3d.length; my /= pts3d.length; mz /= pts3d.length;

        const a = pts3d[0], b = pts3d[1], c = pts3d[2];
        let nx = (b.wy - a.wy) * (c.wz - a.wz) - (b.wz - a.wz) * (c.wy - a.wy);
        let ny = (b.wz - a.wz) * (c.wx - a.wx) - (b.wx - a.wx) * (c.wz - a.wz);
        let nz = (b.wx - a.wx) * (c.wy - a.wy) - (b.wy - a.wy) * (c.wx - a.wx);
        const nL = Math.hypot(nx, ny, nz) || 1;
        nx /= nL; ny /= nL; nz /= nL;

        const ox = mx - slabRef.wx, oy = my - slabRef.wy, oz = mz - slabRef.wz;
        if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (nz < 0.04) return;

        const ndotl = clamp(nx * lx + ny * ly + nz * lz + 0.22, 0.14, 1.0);
        const pts2d = new Array(pts3d.length);
        for (let i = 0; i < pts3d.length; i++) pts2d[i] = { x: pts3d[i].sx, y: pts3d[i].sy };
        const rec = { kind: 'crystal', pts3d, pts2d, sortZ: mz, isBack, ndotl, meta };
        if (isBack) backFaces.push(rec); else frontFaces.push(rec);
      }

    for (let aIdx = 0; aIdx < ARCS; aIdx++) {
      const prof = CHUNK_PROFILES[aIdx % 3];
      const arcSpan = baseArcSpan * prof.spanMult;
      const phiStart = aIdx * secSpan + ang.spin + (aIdx === 1 ? 0.05 : (aIdx === 2 ? -0.04 : 0));
      const N = prof.uKnots.length - 1;

      function sampleOuterR(uFrac) {
        const uC = clamp(uFrac, 0, 1);
        for (let k = 0; k < N; k++) {
          if (uC <= prof.uKnots[k + 1] || k === N - 1) {
            const denom = Math.max(0.001, prof.uKnots[k + 1] - prof.uKnots[k]);
            const t = clamp((uC - prof.uKnots[k]) / denom, 0, 1);
            return lerp(prof.crysThickProfile[k], prof.crysThickProfile[k + 1], t) * radialThick * 0.46;
          }
        }
        return radialThick * 0.46;
      }

      // Build 3D vertex rings for this chunk's slimmer sculpted warm-green crystalline substrate
      const stations = [];
      for (let s = 0; s <= N; s++) {
        const f = prof.uKnots[s];
        const phi = phiStart + f * arcSpan;
        const tJut = prof.crysTopJut[s] * hH;
        const bJut = prof.crysBotJut[s] * hH;
        const th = prof.crysThickProfile[s] * radialThick;
        const asymSkew = (hash01(prof.seed + s * 17) - 0.5) * 0.20 * hH;
        stations.push({
          f, phi, tJut, bJut, th,
          inTop: toWorld(phi, tJut * 0.90 + asymSkew, -th * 0.54),
          inBot: toWorld(phi, -bJut * 0.90 + asymSkew, -th * 0.54),
          outTop: toWorld(phi, tJut + asymSkew * 0.5, th * 0.44),
          outBot: toWorld(phi, -bJut + asymSkew * 0.5, th * 0.44),
        });
      }

      // Emit strictly backface-culled irregular 3D crystal substrate facets!
      for (let s = 0; s < N; s++) {
        const st0 = stations[s], st1 = stations[s + 1];
        const fSeed = prof.seed + s * 37;
        const phiCenter = (st0.phi + st1.phi) * 0.5;
        const phiMid = lerp(st0.phi, st1.phi, 0.38 + hash01(fSeed + 1) * 0.24);
        const midThick = (st0.th + st1.th) * 0.5;
        const midTop = (st0.tJut + st1.tJut) * 0.5;
        const midBot = (st0.bJut + st1.bJut) * 0.5;
        const slabRef = toWorld(phiCenter, (midTop - midBot) * 0.12, -midThick * 0.05);
        const anchorZ = slabRef.wz;

        const peakVIn = (hash01(fSeed + 2) - 0.5) * (midTop + midBot) * 0.38;
        const peakVOut = -prof.plateVShift * hH * 0.45 + (hash01(fSeed + 3) - 0.5) * 0.24 * hH;
        const inPeak = toWorld(phiMid, peakVIn, -midThick * (0.70 + hash01(fSeed + 4) * 0.20));
        pushCrystalFace([st0.inTop, st1.inTop, inPeak], slabRef, anchorZ, { seed: fSeed + 10 });
        pushCrystalFace([st1.inTop, st1.inBot, inPeak], slabRef, anchorZ, { seed: fSeed + 11 });
        pushCrystalFace([st1.inBot, st0.inBot, inPeak], slabRef, anchorZ, { seed: fSeed + 12 });
        pushCrystalFace([st0.inBot, st0.inTop, inPeak], slabRef, anchorZ, { seed: fSeed + 13 });

        const outPeak = toWorld(phiMid, peakVOut, midThick * 0.46);
        pushCrystalFace([st0.outTop, st1.outTop, outPeak], slabRef, anchorZ, { seed: fSeed + 20 });
        pushCrystalFace([st1.outTop, st1.outBot, outPeak], slabRef, anchorZ, { seed: fSeed + 21 });
        pushCrystalFace([st1.outBot, st0.outBot, outPeak], slabRef, anchorZ, { seed: fSeed + 22 });
        pushCrystalFace([st0.outBot, st0.outTop, outPeak], slabRef, anchorZ, { seed: fSeed + 23 });

        const topJutPeak = toWorld(phiMid, midTop * (1.06 + hash01(fSeed + 5) * 0.16), (hash01(fSeed + 6) - 0.5) * midThick * 0.28);
        pushCrystalFace([st0.inTop, st0.outTop, topJutPeak], slabRef, anchorZ, { seed: fSeed + 30 });
        pushCrystalFace([st0.outTop, st1.outTop, topJutPeak], slabRef, anchorZ, { seed: fSeed + 31 });
        pushCrystalFace([st1.outTop, st1.inTop, topJutPeak], slabRef, anchorZ, { seed: fSeed + 32 });
        pushCrystalFace([st1.inTop, st0.inTop, topJutPeak], slabRef, anchorZ, { seed: fSeed + 33 });

        const botJutPeak = toWorld(phiMid, -midBot * (1.06 + hash01(fSeed + 7) * 0.16), (hash01(fSeed + 8) - 0.5) * midThick * 0.28);
        pushCrystalFace([st0.inBot, st1.inBot, botJutPeak], slabRef, anchorZ, { seed: fSeed + 40 });
        pushCrystalFace([st1.inBot, st1.outBot, botJutPeak], slabRef, anchorZ, { seed: fSeed + 41 });
        pushCrystalFace([st1.outBot, st0.outBot, botJutPeak], slabRef, anchorZ, { seed: fSeed + 42 });
        pushCrystalFace([st0.outBot, st0.inBot, botJutPeak], slabRef, anchorZ, { seed: fSeed + 43 });
      }

      // Faceted crystalline end-caps at rear & leading tips of the chunk
      const stS = stations[0], stE = stations[N];
      const refS = toWorld(phiStart + arcSpan * 0.06, 0, 0);
      const refE = toWorld(phiStart + arcSpan * 0.94, 0, 0);
      const rearTip = toWorld(phiStart - arcSpan * 0.12, (stS.tJut - stS.bJut) * 0.30, -stS.th * 0.12);
      const leadTip = toWorld(phiStart + arcSpan * 1.11, (stE.tJut - stE.bJut) * 0.28, 0.04 * stE.th);
      pushCrystalFace([stS.inTop, stS.outTop, rearTip], refS, refS.wz, { seed: prof.seed + 71 });
      pushCrystalFace([stS.outTop, stS.outBot, rearTip], refS, refS.wz, { seed: prof.seed + 72 });
      pushCrystalFace([stS.outBot, stS.inBot, rearTip], refS, refS.wz, { seed: prof.seed + 73 });
      pushCrystalFace([stS.inBot, stS.inTop, rearTip], refS, refS.wz, { seed: prof.seed + 74 });
      pushCrystalFace([stE.inTop, stE.outTop, leadTip], refE, refE.wz, { seed: prof.seed + 75 });
      pushCrystalFace([stE.outTop, stE.outBot, leadTip], refE, refE.wz, { seed: prof.seed + 76 });
      pushCrystalFace([stE.outBot, stE.inBot, leadTip], refE, refE.wz, { seed: prof.seed + 77 });
      pushCrystalFace([stE.inBot, stE.inTop, leadTip], refE, refE.wz, { seed: prof.seed + 78 });

      // Build WIDE, SMOOTHLY ROUNDED, ORGANIC BIOLOGICAL DARK-PURPLE CARAPACE PLATES (single unified curved shell per plate -> ZERO self-flicker!)
      // Each plate overhangs freely wider than the crystal substrate and sorts monotonically in shingled order so plates never fight each other or the crystal!
      const pCnt = prof.plateCount;
      const PERIM_PTS = 14;
      for (let p = 0; p < pCnt; p++) {
        const totalSpan = 0.90 + prof.overhangLead;
        const u0 = 0.05 + (p / pCnt) * totalSpan;
        const u1 = u0 + (totalSpan / pCnt) * 1.24; // Smooth 24% organic biological shingling overlap!
        const uMid = (u0 + u1) * 0.5;
        const phiM = phiStart + uMid * arcSpan;

        const anchorPt = toWorld(phiM, 0, 0);
        const isBack = anchorPt.wz < 0;

        const pSeed = prof.seed + p * 53 + 17;
        const spread = prof.plateSpread[p % prof.plateSpread.length];
        const vCenter = prof.plateVShift * hH + (hash01(pSeed + 1) - 0.5) * 0.18 * hH;
        const vHalf = prof.plateVHalf * spread * hH; // Broad organic lobes freely extending wider than the green crystal bed!

        // Strictly clear the slimmer crystal outer surface + step gently outward with p for clean shingled overlap
        const baseClear = Math.max(sampleOuterR(u0), sampleOuterR(uMid), sampleOuterR(u1)) + radialThick * (0.28 + p * 0.09);
        const domeAmp = radialThick * (0.68 + hash01(pSeed + 2) * 0.22);

        // Helper mapping local organic coords (sU, sV) in [-1, 1] onto the curved domed 3D plate shell
        function platePt(sU, sV, extraDome = 0) {
          const u = lerp(u0, u1, (sU + 1) * 0.5);
          const phi = phiStart + u * arcSpan;
          const v = vCenter + sV * vHalf;
          // Curved domed biological shell: bulges plumply in the center, rolls down smoothly toward the rounded lip
          const domeFrac = Math.max(0, 1.0 - (sU * sU * 0.44 + sV * sV * 0.56));
          const rOff = baseClear + domeAmp * Math.pow(domeFrac, 0.72) + extraDome;
          return toWorld(phi, v, rOff);
        }

        // Smooth 14-point rounded biological nail/carapace contour from precomputed unit LUT!
        const perim3d = [];
        const wobbleA = (hash01(pSeed + 3) - 0.5) * 0.14;
        const wobbleB = (hash01(pSeed + 4) - 0.5) * 0.12;
        for (let k = 0; k < PERIM_PTS; k++) {
          const uPt = ALTERATION_PLATE_UNIT_LOOP[k];
          const lobeWidth = uPt.lobeBase + wobbleA * uPt.sin2 + wobbleB * uPt.cos3;
          perim3d.push(platePt(uPt.sU, uPt.sVBase * lobeWidth, 0));
        }

        // Dome crown point & surface normal for matte Lambertian shading + curved organic growth-ring wrinkles
        const crownPt = platePt(0.05, 0.0, radialThick * 0.12);
        const rimFront = platePt(0.88, 0.0, 0);
        const rimRear = platePt(-0.88, 0.0, 0);
        // Outward radial unit vector at plate center
        const radX = uAx.x * Math.cos(phiM) + vAx.x * Math.sin(phiM);
        const radY = uAx.y * Math.cos(phiM) + vAx.y * Math.sin(phiM);
        const radZ = uAx.z * Math.cos(phiM) + vAx.z * Math.sin(phiM);
        const facingSign = radZ >= 0 ? 1 : -1;
        const ndotl = clamp((radX * lx + radY * ly + radZ * lz) * facingSign + 0.28, 0.16, 0.96);

        // Two smooth curved concentric biological wrinkle arcs following the rounded outer lip + 3 matte chitin pores!
        const wr1L = platePt(0.06, -0.78, radialThick * 0.04);
        const wr1M = platePt(0.46, 0.0, radialThick * 0.10);
        const wr1R = platePt(0.06, 0.78, radialThick * 0.04);
        const wr2L = platePt(-0.34, -0.72, radialThick * 0.03);
        const wr2M = platePt(0.02, 0.0, radialThick * 0.12);
        const wr2R = platePt(-0.34, 0.72, radialThick * 0.03);
        const pores = [
          platePt(-0.18, -0.34, radialThick * 0.08),
          platePt(0.24, 0.28, radialThick * 0.08),
          platePt(0.42, -0.22, radialThick * 0.06),
          platePt(-0.36, 0.24, radialThick * 0.06),
        ];

        // Monotonic flicker-free sort key:
        // Outer view (radZ > 0): strictly IN FRONT of crystal substrate, ordered monotonically p = 0 -> pCnt-1!
        // Inner view (radZ < 0): strictly BEHIND crystal substrate (while wide rounded wings peek out cleanly around it!), ordered monotonically in reverse!
        // Edge-on (|radZ| <= 0.18): smooth transition while radial offset separates crystal & plates sideways in screen X/Y!
        const sideRamp = clamp(radZ / 0.18, -1, 1);
        const shingleOrder = (radZ >= 0 ? 1 : -1) * (p * 0.42);
        const plateSortZ = anchorPt.wz + sideRamp * (radialThick * 2.8 + 2.0) + shingleOrder;

        const perim2d = new Array(perim3d.length);
        for (let k = 0; k < perim3d.length; k++) perim2d[k] = { x: perim3d[k].sx, y: perim3d[k].sy };
        const pRec = {
          kind: 'plate',
          pts3d: perim3d,
          pts2d: perim2d,
          sortZ: plateSortZ,
          isBack,
          ndotl,
          meta: {
            seed: pSeed,
            plateIdx: p,
            crownPt,
            rimFront,
            rimRear,
            wr1L, wr1M, wr1R,
            wr2L, wr2M, wr2R,
            pores,
            isOuterFacing: radZ >= 0,
          },
        };
        if (isBack) backFaces.push(pRec); else frontFaces.push(pRec);
      }
    }

      backFaces.sort((a, b) => a.sortZ - b.sortZ);
      frontFaces.sort((a, b) => a.sortZ - b.sortZ);
      cached = { key: frameKey, back: backFaces, front: frontFaces };
      _altRingFacesCache.set(cacheId, cached);
    }

    const faces = isBackPass ? cached.back : (isFrontPass ? cached.front : cached.back.concat(cached.front));
    if (faces.length === 0) return;

    ctx.save();
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const depthDim = f.isBack ? 0.66 : 1.0;
      const pts2d = f.pts2d;

      if (f.kind === 'crystal') {
        const spec = Math.pow(f.ndotl, 2.8);
        const gR = Math.round(lerp(56, 224, f.ndotl * 0.56 + spec * 0.44) * depthDim);
        const gG = Math.round(lerp(156, 255, f.ndotl * 0.68 + spec * 0.32) * depthDim);
        const gB = Math.round(lerp(16, 134, spec * 0.85) * depthDim);
        ctx.fillStyle = `rgba(${gR}, ${gG}, ${gB}, 0.96)`;
        ctx.beginPath();
        for (let j = 0; j < pts2d.length; j++) {
          if (j === 0) ctx.moveTo(pts2d[j].x, pts2d[j].y); else ctx.lineTo(pts2d[j].x, pts2d[j].y);
        }
        ctx.closePath();
        ctx.fill();

        // Geometric crystal cleavage crack & pale-white-green gradient along random side!
        if (!f.isBack) {
          drawCrystalCrackGradient(ctx, pts2d, f.meta.seed, 0.72);
        }

        // Subtle crisp glossy crystalline facet borders (front pass only)
        if (!f.isBack) {
          ctx.strokeStyle = `rgba(224, 255, 138, ${(0.20 + spec * 0.34).toFixed(3)})`;
          ctx.lineWidth = 0.46 * f.pts3d[0].persp;
          ctx.stroke();
        }
      } else {
        const m = f.meta;
        const nP = pts2d.length;
        ctx.beginPath();
        const mid0x = (pts2d[nP - 1].x + pts2d[0].x) * 0.5;
        const mid0y = (pts2d[nP - 1].y + pts2d[0].y) * 0.5;
        ctx.moveTo(mid0x, mid0y);
        for (let j = 0; j < nP; j++) {
          const next = pts2d[(j + 1) % nP];
          const mx = (pts2d[j].x + next.x) * 0.5;
          const my = (pts2d[j].y + next.y) * 0.5;
          ctx.quadraticCurveTo(pts2d[j].x, pts2d[j].y, mx, my);
        }
        ctx.closePath();

        const pVar = (m.plateIdx % 2 === 0 ? 1 : -1) * 4;
        const hiR = Math.round(clamp((48 + f.ndotl * 52 + pVar) * depthDim, 20, 108));
        const hiG = Math.round(clamp((24 + f.ndotl * 28 + pVar * 0.5) * depthDim, 10, 62));
        const hiB = Math.round(clamp((68 + f.ndotl * 64 + pVar) * depthDim, 28, 138));
        const loR = Math.round(clamp((22 + f.ndotl * 24) * depthDim, 12, 56));
        const loG = Math.round(clamp((10 + f.ndotl * 12) * depthDim, 6, 32));
        const loB = Math.round(clamp((34 + f.ndotl * 32) * depthDim, 16, 76));

        if (f.isBack) {
          ctx.fillStyle = `rgb(${Math.round((hiR + loR) * 0.48)}, ${Math.round((hiG + loG) * 0.48)}, ${Math.round((hiB + loB) * 0.48)})`;
        } else {
          const gSpan = Math.max(3.5, Math.hypot(m.rimFront.sx - m.rimRear.sx, m.rimFront.sy - m.rimRear.sy) * 0.72);
          const pg = ctx.createRadialGradient(m.crownPt.sx, m.crownPt.sy, gSpan * 0.08, m.crownPt.sx, m.crownPt.sy, gSpan);
          pg.addColorStop(0.0, `rgb(${hiR}, ${hiG}, ${hiB})`);
          pg.addColorStop(0.68, `rgb(${Math.round(lerp(hiR, loR, 0.55))}, ${Math.round(lerp(hiG, loG, 0.55))}, ${Math.round(lerp(hiB, loB, 0.55))})`);
          pg.addColorStop(1.0, `rgb(${loR}, ${loG}, ${loB})`);
          ctx.fillStyle = pg;
        }
        ctx.fill();

        // Deep matte recessed biological overlap border separating shingled organic plates
        ctx.strokeStyle = 'rgba(13, 4, 22, 0.90)';
        ctx.lineWidth = 0.78 * m.crownPt.persp;
        ctx.stroke();

        // Curved organic biological growth-ring wrinkles & matte stipple pores (strictly interior at ±0.78 < 1.0 -> zero clip needed!)
        if (!f.isBack && m.isOuterFacing) {
          ctx.strokeStyle = `rgba(${Math.max(10, loR - 6)}, ${Math.max(4, loG - 3)}, ${Math.max(16, loB - 8)}, 0.72)`;
          ctx.lineWidth = 0.56 * m.crownPt.persp;
          ctx.beginPath();
          ctx.moveTo(m.wr1L.sx, m.wr1L.sy);
          ctx.quadraticCurveTo(m.wr1M.sx, m.wr1M.sy, m.wr1R.sx, m.wr1R.sy);
          ctx.moveTo(m.wr2L.sx, m.wr2L.sy);
          ctx.quadraticCurveTo(m.wr2M.sx, m.wr2M.sy, m.wr2R.sx, m.wr2R.sy);
          ctx.stroke();

          // Soft raised matte ridge lip alongside wrinkle for organic carapace relief
          ctx.strokeStyle = `rgba(${Math.min(122, hiR + 14)}, ${Math.min(76, hiG + 10)}, ${Math.min(156, hiB + 16)}, 0.34)`;
          ctx.lineWidth = 0.44 * m.crownPt.persp;
          ctx.beginPath();
          ctx.moveTo(m.wr1L.sx, m.wr1L.sy - 0.6);
          ctx.quadraticCurveTo(m.wr1M.sx, m.wr1M.sy - 0.6, m.wr1R.sx, m.wr1R.sy - 0.6);
          ctx.stroke();

          // Subtle organic dark-matte chitin pores scattered on the dome (batched in single path!)
          ctx.fillStyle = `rgba(${Math.max(8, loR - 8)}, ${Math.max(3, loG - 4)}, ${Math.max(14, loB - 10)}, 0.66)`;
          ctx.beginPath();
          for (let dp = 0; dp < m.pores.length; dp++) {
            const pr = m.pores[dp];
            const prR = 0.52 * pr.persp;
            ctx.moveTo(pr.sx + prR, pr.sy);
            ctx.arc(pr.sx, pr.sy, prR, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Helper: Emit TRUE 3D CLOSED Volumetric Matte Dark-Purple Bulbous "Onion" Overlapping-Plate Polyhedron (NO 2D sprite, NO hollow end-on gaps!)
  // Builds 3 staggered closed tiers of shingled curved 3D petals (4 bottom collar + 5 plump belly + 4 top crown = 13 3D scale faces) wrapping tightly around the spine from pole to pole!
  function append3dAlterationPurpleBulbFaces(drawables, centerW, frameT, frameR, frameB, radius, seed, cx, cy, isBackPass, isFrontPass) {
    const lx = -0.45, ly = -0.60, lz = 0.66;
    const rotOff = hash01(seed + 1) * Math.PI * 2;

    function bulbPt(latAng, lonAng, rMul) {
      const cLat = Math.cos(latAng);
      const sLat = Math.sin(latAng);
      const cLon = Math.cos(lonAng);
      const sLon = Math.sin(lonAng);
      // Plump sculpted 3D onion bud elongated slightly along spine axis T, closing smoothly onto the spine at both poles!
      const tComp = sLat * radius * 1.18 * rMul;
      const rComp = cLat * cLon * radius * 0.96 * rMul;
      const bComp = cLat * sLon * radius * 0.96 * rMul;
      const wx = centerW.x + frameT.x * tComp + frameR.x * rComp + frameB.x * bComp;
      const wy = centerW.y + frameT.y * tComp + frameR.y * rComp + frameB.y * bComp;
      const wz = centerW.z + frameT.z * tComp + frameR.z * rComp + frameB.z * bComp;
      const p = projWorldPoint(wx, wy, wz, cx, cy);
      return { wx, wy, wz, sx: p.sx, sy: p.sy, persp: p.persp };
    }

    const TIER_SPECS = [
      { count: 3, latBase: -1.42, latMid: -0.68, latTip: 0.16, lift: 1.00, shift: 0.0 },
      { count: 4, latBase: -0.58, latMid: 0.04, latTip: 0.74, lift: 1.08, shift: 0.42 },
      { count: 3, latBase: 0.12, latMid: 0.78, latTip: 1.44, lift: 1.02, shift: 0.85 },
    ];

    for (let tier = 0; tier < TIER_SPECS.length; tier++) {
      const ts = TIER_SPECS[tier];
      const lonShift = rotOff + ts.shift;
      const stepLon = (Math.PI * 2) / ts.count;

      for (let m = 0; m < ts.count; m++) {
        const lon0 = lonShift + m * stepLon;
        const lon1 = lon0 + stepLon * 1.28; // 28% shingled onion-skin petal overlap!
        const lonM = (lon0 + lon1) * 0.5;
        const lift = ts.lift + (m % 2) * 0.04;

        const p0 = bulbPt(ts.latBase, lon0, lift * 0.92);
        const p1 = bulbPt(ts.latBase, lon1, lift * 0.92);
        const p2 = bulbPt(ts.latMid, lon1 + 0.06, lift * 1.06);
        const p3 = bulbPt(ts.latTip, lonM, lift * 0.96);
        const p4 = bulbPt(ts.latMid, lon0 - 0.06, lift * 1.06);
        const pts = [p0, p1, p2, p3, p4];

        const mx = (p0.wx + p1.wx + p2.wx + p3.wx + p4.wx) * 0.2;
        const my = (p0.wy + p1.wy + p2.wy + p3.wy + p4.wy) * 0.2;
        const mz = (p0.wz + p1.wz + p2.wz + p3.wz + p4.wz) * 0.2;
        let nx = mx - centerW.x, ny = my - centerW.y, nz = mz - centerW.z;
        const nL = Math.hypot(nx, ny, nz) || 1;
        nx /= nL; ny /= nL; nz /= nL;
        if (nz < -0.04) continue; // Solid hemisphere silhouette without invisible rear-face overdraw!

        const isBack = mz < 0;
        if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
        const ndotl = clamp(nx * lx + ny * ly + nz * lz + 0.24, 0.16, 0.96);
        drawables.push({
          kind: 'bulb3d',
          wz: mz + 0.22 + (tier === 1 ? 0.14 : 0),
          isBack,
          pts,
          ndotl,
          tier,
          m,
          wrA: p4,
          wrB: p2,
        });
      }
    }
  }

  // --- ALTERATION SLOT 3 TRIAD: 8 Seamless 3D Jagged Crystal Spines + Cross-Broken Crystal Joints + TRUE 3D Purple Onion Bulbs + 3D Perpendicular Centered Triangle Clusters ---
  let _altSpineCacheKey = '';
  let _altSpineCacheVal = null;

  function drawAlterationSpineCage(ctx, cx, cy, baseR, tSec, power, cageSpec, passPhase) {
    if (!cageSpec) return;
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const bellyR = baseR * cageSpec.bellyRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const halfH = baseR * cageSpec.halfHeightMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';
    const lx = -0.45, ly = -0.60, lz = 0.66;

    // 1. Project all 8 spines' nodes & build seamless 3D orthonormal frames (shared across back & front passes of same frame!)
    const spineKey = `${cageSpec.seed}|${tSec}|${cx}|${cy}|${baseR}|${power}`;
    let projSpines = (_altSpineCacheKey === spineKey) ? _altSpineCacheVal : null;
    if (!projSpines) {
      const cAng = computeAlterationWanderAngles(tSec, cageSpec.speedMult, cageSpec.seed);
      const cage = getAlterationCageGeometry();
      projSpines = cage.spines.map((sp) => {
      const worldPts = sp.pts.map((pt) => {
        const rx0 = Math.cos(pt.az) * pt.rFrac * bellyR;
        const ry0 = pt.yFrac * halfH;
        const rz0 = Math.sin(pt.az) * pt.rFrac * bellyR;
        const rw = rotateIllusionVec(rx0, ry0, rz0, cAng.rx, cAng.ry, cAng.rz);
        return { u: pt.u, thickness: pt.thickness * scaleH, x: rw.x, y: rw.y, z: rw.z };
      });

      const N = worldPts.length;
      const frames = [];
      const rings = [];
      for (let j = 0; j < N; j++) {
        const p = worldPts[j];
        const prev = worldPts[Math.max(0, j - 1)];
        const next = worldPts[Math.min(N - 1, j + 1)];
        // Averaged tangent bisector at node j guarantees SEAMLESS mitered crystal prism joints with zero sticking-out gaps!
        let tx = next.x - prev.x, ty = next.y - prev.y, tz = next.z - prev.z;
        const tL = Math.hypot(tx, ty, tz) || 1;
        tx /= tL; ty /= tL; tz /= tL;

        const rL = Math.hypot(p.x, p.y, p.z) || 1;
        let rx = p.x / rL, ry = p.y / rL, rz = p.z / rL;
        let bx = ty * rz - tz * ry, by = tz * rx - tx * rz, bz = tx * ry - ty * rx;
        const bL = Math.hypot(bx, by, bz) || 1;
        bx /= bL; by /= bL; bz /= bL;
        rx = by * tz - bz * ty;
        ry = bz * tx - bx * tz;
        rz = bx * ty - by * tx;

        frames.push({ T: { x: tx, y: ty, z: tz }, R: { x: rx, y: ry, z: rz }, B: { x: bx, y: by, z: bz } });

        // Shared 4-sided crystal prism cross-section ring at node j (tapers sharply to pointed crystal tips at ends j=0 and j=N-1!)
        const tipScale = (j === 0 || j === N - 1) ? 0.22 : 1.0;
        const rad = p.thickness * tipScale;
        const dirs = [
          { x: rx, y: ry, z: rz },
          { x: bx, y: by, z: bz },
          { x: -rx, y: -ry, z: -rz },
          { x: -bx, y: -by, z: -bz },
        ];
        const ring = dirs.map((d) => {
          const wx = p.x + d.x * rad;
          const wy = p.y + d.y * rad;
          const wz = p.z + d.z * rad;
          const pr = projWorldPoint(wx, wy, wz, cx, cy);
          return { wx, wy, wz, sx: pr.sx, sy: pr.sy, persp: pr.persp };
        });
        rings.push(ring);
      }
      return { index: sp.index, worldPts, frames, rings, bulbNodes: sp.bulbNodes, crystalJointNodes: sp.crystalJointNodes };
      });
      _altSpineCacheKey = spineKey;
      _altSpineCacheVal = projSpines;
    }

    function sampleSpineAt(projSp, u) {
      const n = projSp.worldPts.length - 1;
      const f = clamp(u, 0, 1) * n;
      const i0 = Math.min(n - 1, Math.floor(f));
      const t = f - i0;
      const a = projSp.worldPts[i0];
      const b = projSp.worldPts[i0 + 1];
      const wx = lerp(a.x, b.x, t);
      const wy = lerp(a.y, b.y, t);
      const wz = lerp(a.z, b.z, t);
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
      const tL = Math.hypot(tx, ty, tz) || 1;
      tx /= tL; ty /= tL; tz /= tL;
      const rL = Math.hypot(wx, wy, wz) || 1;
      let rx = wx / rL, ry = wy / rL, rz = wz / rL;
      let bx = ty * rz - tz * ry, by = tz * rx - tx * rz, bz = tx * ry - ty * rx;
      const bL = Math.hypot(bx, by, bz) || 1;
      bx /= bL; by /= bL; bz /= bL;
      rx = by * tz - bz * ty;
      ry = bz * tx - bx * tz;
      rz = bx * ty - by * tx;
      return { wx, wy, wz, tx, ty, tz, rx, ry, rz, bx, by, bz };
    }

    const drawables = [];

    for (let k = 0; k < projSpines.length; k++) {
      const sp = projSpines[k];

      // A. Seamless 3D 4-sided crystal prism faces along all 7 segments of spine k (ZERO sticking-out corner gaps!)
      for (let j = 0; j < sp.rings.length - 1; j++) {
        const rA = sp.rings[j];
        const rB = sp.rings[j + 1];
        for (let f = 0; f < 4; f++) {
          const fn = (f + 1) % 4;
          const p0 = rA[f], p1 = rA[fn], p2 = rB[fn], p3 = rB[f];
          const midZ = (p0.wz + p1.wz + p2.wz + p3.wz) * 0.25;
          const isBack = midZ < 0;
          if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
          // Outward face normal from cross product
          let nx = (p1.wy - p0.wy) * (p3.wz - p0.wz) - (p1.wz - p0.wz) * (p3.wy - p0.wy);
          let ny = (p1.wz - p0.wz) * (p3.wx - p0.wx) - (p1.wx - p0.wx) * (p3.wz - p0.wz);
          let nz = (p1.wx - p0.wx) * (p3.wy - p0.wy) - (p1.wy - p0.wy) * (p3.wx - p0.wx);
          const nL = Math.hypot(nx, ny, nz) || 1;
          nx /= nL; ny /= nL; nz /= nL;
          // Check outward vs spine centerline
          const cMidX = (sp.worldPts[j].x + sp.worldPts[j + 1].x) * 0.5;
          const cMidY = (sp.worldPts[j].y + sp.worldPts[j + 1].y) * 0.5;
          const cMidZ = (sp.worldPts[j].z + sp.worldPts[j + 1].z) * 0.5;
          const fMidX = (p0.wx + p1.wx + p2.wx + p3.wx) * 0.25;
          const fMidY = (p0.wy + p1.wy + p2.wy + p3.wy) * 0.25;
          if (nx * (fMidX - cMidX) + ny * (fMidY - cMidY) + nz * (midZ - cMidZ) < 0) { nx = -nx; ny = -ny; nz = -nz; }
          if (nz < 0.02) continue; // Backface-cull rear faces of the 3D crystal prism
          const ndotl = clamp(nx * lx + ny * ly + nz * lz + 0.22, 0.12, 1.0);
          drawables.push({
            kind: 'prismFace',
            wz: midZ,
            isBack,
            pts: [p0, p1, p2, p3],
            ndotl,
            seed: k * 79 + j * 19 + f * 7 + 3,
          });
        }
      }

      // B. Cross-broken transverse crystals wedged cleanly across every non-bulb kink joint!
      for (let cIdx = 0; cIdx < sp.crystalJointNodes.length; cIdx++) {
        const cj = sp.crystalJointNodes[cIdx];
        const p = sp.worldPts[cj.nodeIdx];
        const fr = sp.frames[cj.nodeIdx];
        const isBack = p.z < 0;
        if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
        // 2 sharp cross-broken transverse crystal wedges gripping the bend perpendicular/obliquely across the rod!
        for (let sh = 0; sh < 2; sh++) {
          const shSeed = cj.seed + sh * 31;
          const cAng2 = hash01(shSeed + 1) * Math.PI * 2 + sh * 2.1;
          const dirX = fr.R.x * Math.cos(cAng2) + fr.B.x * Math.sin(cAng2) + fr.T.x * (sh === 0 ? 0.28 : -0.28);
          const dirY = fr.R.y * Math.cos(cAng2) + fr.B.y * Math.sin(cAng2) + fr.T.y * (sh === 0 ? 0.28 : -0.28);
          const dirZ = fr.R.z * Math.cos(cAng2) + fr.B.z * Math.sin(cAng2) + fr.T.z * (sh === 0 ? 0.28 : -0.28);
          const dInv = 1 / (Math.hypot(dirX, dirY, dirZ) || 1);
          const ux = dirX * dInv, uy = dirY * dInv, uz = dirZ * dInv;
          const halfSpan = (3.0 + hash01(shSeed + 2) * 1.8) * scaleH;
          const pStart = projWorldPoint(p.x - ux * halfSpan * 0.55, p.y - uy * halfSpan * 0.55, p.z - uz * halfSpan * 0.55, cx, cy);
          const pEnd = projWorldPoint(p.x + ux * halfSpan, p.y + uy * halfSpan, p.z + uz * halfSpan, cx, cy);
          const lightScore = clamp(ux * lx + uy * ly + uz * lz + 0.28, 0.14, 1.0);
          drawables.push({
            kind: 'jointCrystal',
            wz: p.z + 0.22,
            isBack,
            x0: pStart.sx, y0: pStart.sy, x1: pEnd.sx, y1: pEnd.sy,
            baseW: (1.25 + hash01(shSeed + 3) * 0.55) * scaleH,
            lightScore,
            persp: pEnd.persp,
            seed: shSeed,
          });
        }
      }

      // C. TRUE 3D Volumetric Matte Dark-Purple Bulbous "Onion" Overlapping-Plate Polyhedra at bulb joints!
      for (let bIdx = 0; bIdx < sp.bulbNodes.length; bIdx++) {
        const bn = sp.bulbNodes[bIdx];
        const p = sp.worldPts[bn.nodeIdx];
        const fr = sp.frames[bn.nodeIdx];
        const bulbR = (2.65 + bn.scale * 1.25) * scaleH;
        append3dAlterationPurpleBulbFaces(drawables, p, fr.T, fr.R, fr.B, bulbR, bn.seed, cx, cy, isBackPass, isFrontPass);
      }

      // D. TRUE 3D PERPENDICULAR CENTERED TRIANGLE CLUSTERS (1 clean cluster of 3-5 evenly-spaced per spine, pierced straight through their center by the spine!)
      //    Each triangle is split into 3 radial edge-strips so its far side passes BEHIND the spine & its near side passes IN FRONT!
      {
        const hP = hash01(k * 43 + 11);
        const hPh = (k / projSpines.length) + hash01(k * 61 + 19) * 0.12;
        const period = 3.2 + hP * 2.2;
        const raw = tSec / period + hPh;
        const gen = Math.floor(raw);
        const uCycle = raw - gen;
        if (uCycle >= 0.08 && uCycle <= 0.92) {
          const waveFrac = (uCycle - 0.08) / 0.84;
          const wSeed = gen * 83 + k * 23 + 13;
          const dir = (hash01(wSeed + 1) > 0.5) ? 1 : -1;
          // Distinct equally-spaced cluster of 3, 4, or 5 3D perpendicular triangles!
          const clusterSize = 3 + (Math.floor(hash01(wSeed + 2) * 3) % 3);
          const spacingU = 0.068; // Strictly equal spacing between triangles in the cluster!
          const baseSpin = hash01(wSeed + 3) * Math.PI * 2 + tSec * 0.42 * dir;

          for (let m = 0; m < clusterSize; m++) {
            const headProgress = waveFrac * 1.30 - m * spacingU;
            if (headProgress <= 0.015 || headProgress >= 0.985) continue;
            const uPos = dir > 0 ? headProgress : (1.0 - headProgress);
            const samp = sampleSpineAt(sp, uPos);

            // Wider in the middle of the spine & cluster, fading smoothly toward both ends!
            const bellyBell = Math.pow(Math.sin(uPos * Math.PI), 0.85);
            const clusterMid = clusterSize > 1 ? Math.sin(((m + 0.5) / clusterSize) * Math.PI) : 1.0;
            const endFade = smoothstep(0.0, 0.16, uPos) * smoothstep(1.0, 0.84, uPos);
            const faceAlign = Math.abs(samp.tz); // 1 = triangle plane facing camera, 0 = viewed edge-on!
            const edgeDamp = 0.48 + 0.52 * faceAlign; // Prevents edge-on additive stacking from blowing out into solid white bars!
            const waveAlpha = endFade * 0.86 * edgeDamp;
            if (waveAlpha < 0.03) continue;

            // 3D equilateral triangle STRICTLY PERPENDICULAR to spine tangent T, centered ON the spine!
            const triR = (2.5 + (6.0 * bellyBell) * (0.78 + 0.26 * clusterMid)) * scaleH;
            const innerR = triR * 0.66; // Sleek luminous 3D geometric triangle collar around the spine core
            const theta0 = baseSpin + m * 0.10;
            const outerV = [];
            const innerV = [];
            for (let v = 0; v < 3; v++) {
              const a = theta0 + (v * Math.PI * 2) / 3;
              const ca = Math.cos(a), sa = Math.sin(a);
              const dx = samp.rx * ca + samp.bx * sa;
              const dy = samp.ry * ca + samp.by * sa;
              const dz = samp.rz * ca + samp.bz * sa;
              const owx = samp.wx + dx * triR, owy = samp.wy + dy * triR, owz = samp.wz + dz * triR;
              const iwx = samp.wx + dx * innerR, iwy = samp.wy + dy * innerR, iwz = samp.wz + dz * innerR;
              const op = projWorldPoint(owx, owy, owz, cx, cy);
              const ip = projWorldPoint(iwx, iwy, iwz, cx, cy);
              outerV.push({ wx: owx, wy: owy, wz: owz, sx: op.sx, sy: op.sy, persp: op.persp });
              innerV.push({ wx: iwx, wy: iwy, wz: iwz, sx: ip.sx, sy: ip.sy, persp: ip.persp });
            }

            // Split into 3 collar edge-strips so the far side sorts BEHIND the spine & the near side sorts IN FRONT!
            for (let e = 0; e < 3; e++) {
              const en = (e + 1) % 3;
              const o0 = outerV[e], o1 = outerV[en], i1 = innerV[en], i0 = innerV[e];
              const midZ = (o0.wz + o1.wz + i1.wz + i0.wz) * 0.25;
              const isBack = midZ < 0;
              if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
              drawables.push({
                kind: 'tri3dEdge',
                wz: midZ,
                isBack,
                o0, o1, i1, i0,
                waveAlpha: waveAlpha * (isBack ? 0.56 : 1.0),
                bellyBell,
                faceAlign,
              });
            }
          }
        }
      }
    }

    drawables.sort((a, b) => a.wz - b.wz);

    ctx.save();
    let inLighter = false;
    const pBuf = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      const wantLighter = d.kind === 'tri3dEdge';
      if (wantLighter !== inLighter) {
        ctx.globalCompositeOperation = wantLighter ? 'lighter' : 'source-over';
        inLighter = wantLighter;
      }
      if (d.kind === 'prismFace') {
        const dim = d.isBack ? 0.58 : 1.0;
        const spec = Math.pow(d.ndotl, 2.7);
        const gR = Math.round(lerp(52, 236, d.ndotl * 0.55 + spec * 0.45) * dim);
        const gG = Math.round(lerp(148, 255, d.ndotl * 0.68 + spec * 0.32) * dim);
        const gB = Math.round(lerp(18, 162, spec * 0.84) * dim);
        pBuf[0].x = d.pts[0].sx; pBuf[0].y = d.pts[0].sy;
        pBuf[1].x = d.pts[1].sx; pBuf[1].y = d.pts[1].sy;
        pBuf[2].x = d.pts[2].sx; pBuf[2].y = d.pts[2].sy;
        pBuf[3].x = d.pts[3].sx; pBuf[3].y = d.pts[3].sy;
        ctx.fillStyle = `rgba(${gR}, ${gG}, ${gB}, 0.96)`;
        ctx.beginPath();
        ctx.moveTo(pBuf[0].x, pBuf[0].y);
        ctx.lineTo(pBuf[1].x, pBuf[1].y);
        ctx.lineTo(pBuf[2].x, pBuf[2].y);
        ctx.lineTo(pBuf[3].x, pBuf[3].y);
        ctx.closePath();
        ctx.fill();

        if (!d.isBack) {
          drawCrystalCrackGradient(ctx, pBuf, d.seed, 0.70);
          ctx.strokeStyle = `rgba(234, 255, 162, ${(0.34 + spec * 0.44).toFixed(3)})`;
          ctx.lineWidth = 0.52 * d.pts[0].persp;
          ctx.stroke();
        }
      } else if (d.kind === 'jointCrystal') {
        drawWarmGreenGlossyCrystal(ctx, d.x0, d.y0, d.x1, d.y1, d.baseW, d.lightScore, d.persp, d.isBack, 0, d.seed);
      } else if (d.kind === 'bulb3d') {
        const dim = d.isBack ? 0.64 : 1.0;
        const shadeVar = (d.tier === 1 ? 6 : -3) + (d.m % 2 === 0 ? 4 : -4);
        const pR = Math.round(clamp((34 + d.ndotl * 48 + shadeVar) * dim, 16, 96));
        const pG = Math.round(clamp((16 + d.ndotl * 24 + shadeVar * 0.5) * dim, 8, 54));
        const pB = Math.round(clamp((48 + d.ndotl * 60 + shadeVar) * dim, 22, 124));
        ctx.fillStyle = `rgb(${pR}, ${pG}, ${pB})`;
        ctx.beginPath();
        for (let j = 0; j < d.pts.length; j++) {
          if (j === 0) ctx.moveTo(d.pts[j].sx, d.pts[j].sy); else ctx.lineTo(d.pts[j].sx, d.pts[j].sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(13, 4, 20, 0.90)';
        ctx.lineWidth = 0.68 * d.pts[0].persp;
        ctx.stroke();
      } else if (wantLighter) {
        const fillAlpha = d.waveAlpha * (0.18 + 0.16 * (d.faceAlign || 0.5));
        ctx.fillStyle = `rgba(116, 238, 40, ${fillAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(d.o0.sx, d.o0.sy);
        ctx.lineTo(d.o1.sx, d.o1.sy);
        ctx.lineTo(d.i1.sx, d.i1.sy);
        ctx.lineTo(d.i0.sx, d.i0.sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(216, 255, 118, ${(d.waveAlpha * 0.90).toFixed(3)})`;
        ctx.lineWidth = (0.62 + d.bellyBell * 0.34) * d.o0.persp;
        ctx.beginPath();
        ctx.moveTo(d.o0.sx, d.o0.sy);
        ctx.lineTo(d.o1.sx, d.o1.sy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // =================================================================================================
  // THAUMATURGY (ID = 26): OPAQUE GLASSY SKY-BLUE ROMAN DODECAHEDRON + SPHERICAL BLUEPRINT PROJECTIONS
  //                        + DENSE FRAMED MAGI-TECH SCHEMATIC HOOPS + REFRACTED TRIAD GODRAYS
  // =================================================================================================

  // Build 3D occluders for Triad Thaumaturgy godrays: active unfolded spherical projections + both outer schematic hoops!
  function buildThaumaturgyTriadOccluders(thaumCfg, baseR, tSec, power) {
    const hoops = [];
    const patches = [];
    if (!thaumCfg) return { hoops, patches };
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);

    // 1. Active unfolded spherical schematic projections from Slot 2
    if (thaumCfg.slot2Layer && thaumCfg.slot2Layer.kind === 'sphere_projections') {
      const mesh = getThaumaturgyRomanDodecahedronMesh();
      const dAng = computeThaumaturgyDodecaAngles(tSec);
      const states = computeThaumaturgyProjectionStates(tSec, thaumCfg.slot2Layer.maxSimultaneous);
      const sphereR = baseR * thaumCfg.slot2Layer.sphereRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      for (let i = 0; i < states.length; i++) {
        const st = states[i];
        if (st.unfoldFrac < 0.18) continue;
        const face = mesh.faces[st.faceIdx % mesh.faces.length];
        const wn = rotateIllusionVec(face.n.x, face.n.y, face.n.z, dAng.rx, dAng.ry, dAng.rz);
        const angRad = 0.46 * st.unfoldFrac;
        patches.push({
          nx: wn.x, ny: wn.y, nz: wn.z,
          sphereR,
          cosLim: Math.cos(angRad),
          unfoldFrac: st.unfoldFrac,
        });
      }
    }

    // 2. Both outer Triad magi-tech schematic hoops from Slot 3 (smaller 1.5x, larger 2.0x)
    const layers = thaumCfg.slot3Layers || [];
    for (let i = 0; i < layers.length; i++) {
      const hp = layers[i];
      const ang = computeThaumaturgyHoopAngles(tSec, hp.speedMult, hp.seed);
      const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
      const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
      const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
      hoops.push({
        id: hp.id,
        R: baseR * hp.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
        hH: hp.bandHalfH * scaleH,
        ux: u.x, uy: u.y, uz: u.z,
        vx: v.x, vy: v.y, vz: v.z,
        nx: n.x, ny: n.y, nz: n.z,
      });
    }
    hoops.sort((a, b) => a.R - b.R);
    return { hoops, patches };
  }

  // Analytical 3D refraction & occlusion of Thaumaturgy godrays against spherical projections & outer framed hoops
  function evalThaumaturgyGodrayOcclusion(dx, dy, dz, maxLen, occs) {
    if (!occs) return { hitS: maxLen, trans: 1.0, occluded: false, refracted: false };
    let hitS = maxLen;
    let trans = 1.0;
    let refracted = false;

    // 1. Check active spherical schematic projection patches on Slot 2 sphere
    const patches = occs.patches || [];
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const d = dx * p.nx + dy * p.ny + dz * p.nz;
      if (d > p.cosLim) {
        const edge = clamp((d - p.cosLim) / Math.max(0.02, 1 - p.cosLim), 0, 1);
        const att = 1 - edge * 0.52 * p.unfoldFrac;
        trans *= att;
        refracted = true;
        if (p.sphereR < hitS) hitS = p.sphereR;
      }
    }

    // 2. Check outer Slot 3 framed schematic hoops via exact 3D ray-cylinder intersection
    if (occs.hoops && occs.hoops.length > 0) {
      const ringHit = computeRayRingOcclusion(0, 0, 0, dx, dy, dz, maxLen, occs.hoops, 0);
      if (ringHit.occluded) {
        trans *= (0.34 + 0.66 * ringHit.trans);
        refracted = true;
        if (ringHit.hitS < hitS) hitS = ringHit.hitS;
      }
    }

    return { hitS, trans: clamp(trans, 0.16, 1.0), occluded: trans < 0.92, refracted };
  }

  // Cached sky-blue volumetric 2D Gaussian beam sprite for Triad Thaumaturgy godrays (matching Restoration's silky volumetric beam optics!)
  let cachedSkyBlueBeamTex = null;
  function getSkyBlueVolumetricBeamTexture() {
    if (cachedSkyBlueBeamTex) return cachedSkyBlueBeamTex;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const w = 128;
    const h = 96;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const halfH = (h - 1) * 0.5;
    for (let py = 0; py < h; py++) {
      const yNorm = (py - halfH) / halfH;
      for (let px = 0; px < w; px++) {
        const u = px / (w - 1);
        const coneHalfW = 0.14 + 0.82 * Math.pow(u, 0.90);
        const lat = yNorm / coneHalfW;
        const latGauss = Math.exp(-lat * lat * 3.4);
        const coreSpine = 0.62 + 0.38 * Math.exp(-lat * lat * 11.5);
        const rootSoft = smoothstep(0.0, 0.04, u);
        const axDecay = rootSoft * Math.pow(1.0 - u, 1.40);
        const a = clamp(latGauss * coreSpine * axDecay, 0, 1);
        // Luminous sky-blue spectral ramp: frosty ice-cyan core -> pure sky-blue -> deep azure atmospheric tail
        const r = Math.round(lerp(218, 22, Math.pow(u, 0.58)));
        const g = Math.round(lerp(246, 138, Math.pow(u, 0.80)));
        const b = Math.round(lerp(255, 242, Math.pow(u, 0.90)));
        const idx = (py * w + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    cachedSkyBlueBeamTex = cv;
    return cv;
  }

  // Restoration-style layered 3D volumetric Gaussian sky-blue godrays for Triad Thaumaturgy:
  // Smooth birth/fade lifecycles, layered atmospheric shafts + inner filaments + hole-aligned beams,
  // dynamic analytical interruption & volumetric refraction across active spherical blueprints & outer framed hoops!
  function drawThaumaturgyTriadGodrays(ctx, cx, cy, baseR, tSec, power, passPhase, occs) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const beamTex = getSkyBlueVolumetricBeamTexture();
    const isBackPass = passPhase === 'back';
    const isFrontPass = passPhase === 'front';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    function emitSkyShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env, deflSign = 1) {
      if (env < 0.02) return;
      const isBack = dz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;

      const occ = evalThaumaturgyGodrayOcclusion(dx, dy, dz, worldLen, occs);
      const p0 = projWorldPoint(dx * 2.8 * scaleR, dy * 2.8 * scaleR, dz * 2.8 * scaleR, cx, cy);
      const p1 = projWorldPoint(dx * worldLen, dy * worldLen, dz * worldLen, cx, cy);
      const screenLen = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);

      if (screenLen > 5.0) {
        const ang = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
        let clipFrac = 1.0;
        let pHit = null;
        if (occ.occluded) {
          pHit = projWorldPoint(dx * occ.hitS, dy * occ.hitS, dz * occ.hitS, cx, cy);
          clipFrac = clamp(Math.hypot(pHit.sx - p0.sx, pHit.sy - p0.sy) / screenLen, 0.06, 0.99);
        }
        const perspGain = isBack ? (0.64 + 0.36 * (1 + dz)) : (0.94 + 0.22 * dz);
        const halfW = spreadHalfW * (0.78 + 0.34 * p1.persp);
        drawVolumetricGodrayBeam(ctx, beamTex, p0.sx, p0.sy, ang, screenLen, halfW, baseAlpha * env * perspGain, clipFrac, occ.trans);

        // Volumetric Gaussian refracted deflection ray continuing softly after hitting a blueprint or framed hoop!
        if (occ.refracted && pHit && clipFrac < 0.88) {
          const remScreenLen = screenLen * (1 - clipFrac) * 0.82;
          if (remScreenLen > 8.0) {
            const deflAng = ang + deflSign * 0.14;
            const refrA = baseAlpha * env * perspGain * occ.trans * 0.72;
            drawVolumetricGodrayBeam(ctx, beamTex, pHit.sx, pHit.sy, deflAng, remScreenLen, halfW * 0.76, refrA, 1.0, 1.0);
          }
        }
      }

      // Soft camera-facing sky-blue radial bloom on forward-angled beams (delicate so Roman dodecahedron remains crystal-sharp!)
      const camFactor = smoothstep(0.56, 0.95, clamp(dz, 0, 1));
      if (!isBack && camFactor > 0.06) {
        const fx = cx + dx * 10.5 * (1.0 - camFactor * 0.48) * scaleR;
        const fy = cy + dy * 10.5 * (1.0 - camFactor * 0.48) * scaleR;
        const fR = (10.0 + camFactor * 10.5) * scaleR;
        const flareA = clamp(baseAlpha * env * camFactor * occ.trans * 0.46, 0, 0.13);
        if (flareA > 0.008) {
          const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, fR);
          fg.addColorStop(0, `rgba(218, 246, 255, ${flareA.toFixed(3)})`);
          fg.addColorStop(0.45, `rgba(76, 184, 255, ${(flareA * 0.55).toFixed(3)})`);
          fg.addColorStop(1, 'rgba(24, 98, 224, 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx, fy, fR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 1. 24 wide layered atmospheric sky-blue volumetric shafts with smooth asynchronous fade-in / fade-out lifecycles
    for (let i = 0; i < 24; i++) {
      const period = 3.2 + hash01(i * 19 + 11) * 3.4;
      const cyc = tSec / period + hash01(i * 31 + 17);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.65);
      if (env < 0.02) continue;
      const seed = gen * 103 + i * 37 + 23;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.90;
      const az = hash01(seed + 2) * Math.PI * 2 + (life - 0.5) * 0.22 * (i % 2 === 0 ? 1 : -1) + tSec * 0.02;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (64 + hash01(seed + 3) * 56) * scaleR * (0.88 + power * 0.18);
      const spreadHalfW = (7.4 + hash01(seed + 4) * 7.2) * scaleR;
      const baseAlpha = (0.095 + hash01(seed + 5) * 0.072) * (0.86 + power * 0.18);
      emitSkyShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env, i % 2 === 0 ? 1 : -1);
    }

    // 2. 14 slender crisp sky-blue volumetric filaments for rich layered Restoration-style optical depth
    for (let i = 0; i < 14; i++) {
      const period = 2.2 + hash01(i * 43 + 13) * 2.4;
      const cyc = tSec / period + hash01(i * 59 + 19);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.55);
      if (env < 0.02) continue;
      const seed = gen * 139 + i * 53 + 31;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.86;
      const az = hash01(seed + 2) * Math.PI * 2 - (life - 0.5) * 0.26;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (44 + hash01(seed + 3) * 46) * scaleR * (0.88 + power * 0.18);
      const spreadHalfW = (3.4 + hash01(seed + 4) * 3.6) * scaleR;
      const baseAlpha = (0.105 + hash01(seed + 5) * 0.078) * (0.86 + power * 0.18);
      emitSkyShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env, i % 2 === 0 ? -1 : 1);
    }

    // 3. 12 gentle volumetric shafts anchored directly through the rotating Roman dodecahedron's 12 circular holes!
    const mesh = getThaumaturgyRomanDodecahedronMesh();
    const dAng = computeThaumaturgyDodecaAngles(tSec);
    for (let f = 0; f < mesh.faces.length; f++) {
      const period = 2.8 + hash01(f * 29 + 7) * 2.6;
      const cyc = tSec / period + hash01(f * 41 + 5);
      const life = cyc - Math.floor(cyc);
      const env = Math.pow(Math.sin(life * Math.PI), 1.5);
      if (env < 0.04) continue;
      const fn = mesh.faces[f].n;
      const wn = rotateIllusionVec(fn.x, fn.y, fn.z, dAng.rx, dAng.ry, dAng.rz);
      const worldLen = (58 + (f % 3) * 16) * scaleR * (0.88 + power * 0.18);
      const spreadHalfW = (4.8 + (f % 3) * 1.4) * scaleR;
      emitSkyShaft(wn.x, wn.y, wn.z, worldLen, spreadHalfW, 0.105 * (0.86 + power * 0.18), env, f % 2 === 0 ? 1 : -1);
    }

    ctx.restore();
  }

  // --- THAUMATURGY SLOT 1: Opaque Glassy Sky-Blue Roman Dodecahedron + Bursting Sparkling Blue Particles ---
  function drawThaumaturgySlot1Dodecahedron(ctx, cx, cy, baseR, tSec, power, triadGodrays = false, thaumOccs = null) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const dodecaR = 12.6 * scaleR;
    const dAng = computeThaumaturgyDodecaAngles(tSec);
    const mesh = getThaumaturgyRomanDodecahedronMesh();
    const lx = -0.45, ly = -0.62, lz = 0.64;

    if (triadGodrays) {
      drawThaumaturgyTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'back', thaumOccs);
    }

    // Rotate & project all 20 dodecahedron vertices + 20 protruding Roman corner knobs
    const projVerts = mesh.vertices.map((v) => {
      const rw = rotateIllusionVec(v.x * dodecaR, v.y * dodecaR, v.z * dodecaR, dAng.rx, dAng.ry, dAng.rz);
      const p = projWorldPoint(rw.x, rw.y, rw.z, cx, cy);
      return { wx: rw.x, wy: rw.y, wz: rw.z, sx: p.sx, sy: p.sy, persp: p.persp };
    });

    const drawables = [];

    // Collect all 12 pierced pentagonal faces
    for (let fIdx = 0; fIdx < mesh.faces.length; fIdx++) {
      const face = mesh.faces[fIdx];
      const wn = rotateIllusionVec(face.n.x, face.n.y, face.n.z, dAng.rx, dAng.ry, dAng.rz);
      const outerPts = face.corners.map((vi) => projVerts[vi]);
      const holePts = face.holeLoop.map((hp) => {
        const rw = rotateIllusionVec(hp.x * dodecaR, hp.y * dodecaR, hp.z * dodecaR, dAng.rx, dAng.ry, dAng.rz);
        const p = projWorldPoint(rw.x, rw.y, rw.z, cx, cy);
        return { wx: rw.x, wy: rw.y, wz: rw.z, sx: p.sx, sy: p.sy, persp: p.persp };
      });
      // Slightly recessed inner hole bevel rim along -wn for real physical glassy wall thickness!
      const wallThick = 1.45 * scaleR;
      const innerRimPts = holePts.map((hp) => {
        const ix = hp.wx - wn.x * wallThick;
        const iy = hp.wy - wn.y * wallThick;
        const iz = hp.wz - wn.z * wallThick;
        const p = projWorldPoint(ix, iy, iz, cx, cy);
        return { sx: p.sx, sy: p.sy };
      });
      const cWorld = rotateIllusionVec(face.n.x * face.inDist * dodecaR, face.n.y * face.inDist * dodecaR, face.n.z * face.inDist * dodecaR, dAng.rx, dAng.ry, dAng.rz);
      const isFront = wn.z >= -0.02;
      const ndotl = clamp(wn.x * lx + wn.y * ly + wn.z * lz, -0.2, 1.0);

      drawables.push({
        kind: isFront ? 'frontFace' : 'backFace',
        wz: cWorld.z + (isFront ? 0.15 : -0.35),
        wn,
        outerPts,
        holePts,
        innerRimPts,
        ndotl,
        fIdx,
      });
    }

    // Collect all 20 iconic Roman dodecahedron glassy corner knobs ("шишечки") seated snugly onto every vertex!
    for (let vi = 0; vi < mesh.vertices.length; vi++) {
      const v = mesh.vertices[vi];
      const knobDist = dodecaR * 1.03;
      const rw = rotateIllusionVec(v.x * knobDist, v.y * knobDist, v.z * knobDist, dAng.rx, dAng.ry, dAng.rz);
      const p = projWorldPoint(rw.x, rw.y, rw.z, cx, cy);
      const wn = rotateIllusionVec(v.x, v.y, v.z, dAng.rx, dAng.ry, dAng.rz);
      const ndotl = clamp(wn.x * lx + wn.y * ly + wn.z * lz + 0.28, 0.12, 1.0);
      drawables.push({
        kind: 'knob',
        wz: rw.z + (rw.z >= 0 ? 0.45 : -0.45),
        sx: p.sx,
        sy: p.sy,
        persp: p.persp,
        r: 1.48 * scaleR * p.persp,
        isFront: rw.z >= -1.2,
        ndotl,
      });
    }

    drawables.sort((a, b) => a.wz - b.wz);

    ctx.save();
    // Draw subtle deep hollow sapphire core shadow inside the dodecahedron so apertures show dark inner depth
    const coreHollow = ctx.createRadialGradient(cx, cy, 1, cx, cy, dodecaR * 0.72);
    coreHollow.addColorStop(0.0, 'rgba(18, 62, 134, 0.42)');
    coreHollow.addColorStop(0.65, 'rgba(7, 20, 48, 0.78)');
    coreHollow.addColorStop(1.0, 'rgba(4, 12, 30, 0)');
    ctx.fillStyle = coreHollow;
    ctx.beginPath();
    ctx.arc(cx, cy, dodecaR * 0.72, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.kind === 'backFace') {
        // Dark hollow interior walls visible through front circular apertures (solid opaque sapphire interior)
        const shade = clamp(0.25 + (-d.ndotl) * 0.35, 0.10, 0.55);
        const rC = Math.round(lerp(8, 22, shade));
        const gC = Math.round(lerp(24, 62, shade));
        const bC = Math.round(lerp(56, 124, shade));
        ctx.fillStyle = `rgb(${rC}, ${gC}, ${bC})`;
        ctx.beginPath();
        for (let j = 0; j < d.outerPts.length; j++) {
          if (j === 0) ctx.moveTo(d.outerPts[j].sx, d.outerPts[j].sy); else ctx.lineTo(d.outerPts[j].sx, d.outerPts[j].sy);
        }
        ctx.closePath();
        for (let j = 0; j < d.holePts.length; j++) {
          if (j === 0) ctx.moveTo(d.holePts[j].sx, d.holePts[j].sy); else ctx.lineTo(d.holePts[j].sx, d.holePts[j].sy);
        }
        ctx.closePath();
        ctx.fill('evenodd');
      } else if (d.kind === 'frontFace') {
        // 1. Physical glassy aperture inner wall thickness around the circular hole
        ctx.strokeStyle = 'rgba(14, 48, 108, 0.92)';
        ctx.lineWidth = 1.15 * d.holePts[0].persp;
        ctx.beginPath();
        for (let j = 0; j < d.innerRimPts.length; j++) {
          if (j === 0) ctx.moveTo(d.innerRimPts[j].sx, d.innerRimPts[j].sy); else ctx.lineTo(d.innerRimPts[j].sx, d.innerRimPts[j].sy);
        }
        ctx.closePath();
        ctx.stroke();

        // 2. SOLID OPAQUE GLASSY SKY-BLUE pierced pentagon (fill('evenodd') cuts the exact circular hole cleanly!)
        const lit = clamp(d.ndotl + 0.26, 0.14, 1.0);
        const spec = Math.pow(clamp(d.ndotl, 0, 1), 2.8);
        const fresnel = Math.pow(clamp(1 - Math.abs(d.wn.z), 0, 1), 2.1);

        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (let j = 0; j < d.outerPts.length; j++) {
          const p = d.outerPts[j];
          if (p.sx < minX) minX = p.sx;
          if (p.sx > maxX) maxX = p.sx;
          if (p.sy < minY) minY = p.sy;
          if (p.sy > maxY) maxY = p.sy;
        }
        const fg = ctx.createLinearGradient(minX, minY, maxX, maxY);
        const hiR = Math.round(clamp(lerp(82, 232, lit * 0.56 + spec * 0.44 + fresnel * 0.20), 40, 248));
        const hiG = Math.round(clamp(lerp(172, 250, lit * 0.68 + spec * 0.32 + fresnel * 0.15), 110, 255));
        const hiB = Math.round(clamp(lerp(232, 255, lit * 0.78 + spec * 0.22), 185, 255));
        const loR = Math.round(clamp(lerp(18, 68, lit), 14, 108));
        const loG = Math.round(clamp(lerp(66, 154, lit), 44, 198));
        const loB = Math.round(clamp(lerp(136, 224, lit), 102, 245));
        fg.addColorStop(0.0, `rgb(${hiR}, ${hiG}, ${hiB})`);
        fg.addColorStop(0.55, `rgb(${Math.round(lerp(hiR, loR, 0.48))}, ${Math.round(lerp(hiG, loG, 0.48))}, ${Math.round(lerp(hiB, loB, 0.48))})`);
        fg.addColorStop(1.0, `rgb(${loR}, ${loG}, ${loB})`);

        ctx.save();
        ctx.beginPath();
        for (let j = 0; j < d.outerPts.length; j++) {
          if (j === 0) ctx.moveTo(d.outerPts[j].sx, d.outerPts[j].sy); else ctx.lineTo(d.outerPts[j].sx, d.outerPts[j].sy);
        }
        ctx.closePath();
        for (let j = 0; j < d.holePts.length; j++) {
          if (j === 0) ctx.moveTo(d.holePts[j].sx, d.holePts[j].sy); else ctx.lineTo(d.holePts[j].sx, d.holePts[j].sy);
        }
        ctx.closePath();
        ctx.fillStyle = fg;
        ctx.fill('evenodd');

        // Crisp diagonal glassy specular reflection sheen clipped cleanly inside the opaque pierced pentagon!
        if (lit > 0.34) {
          ctx.clip('evenodd');
          const midX = (minX + maxX) * 0.5;
          const midY = (minY + maxY) * 0.5;
          const span = Math.max(4, Math.hypot(maxX - minX, maxY - minY));
          const sg = ctx.createLinearGradient(midX - span * 0.35, midY - span * 0.35, midX + span * 0.25, midY + span * 0.25);
          sg.addColorStop(0.0, 'rgba(235, 250, 255, 0)');
          sg.addColorStop(0.42, `rgba(235, 250, 255, ${(0.18 + spec * 0.42).toFixed(3)})`);
          sg.addColorStop(0.58, 'rgba(235, 250, 255, 0)');
          ctx.fillStyle = sg;
          ctx.fillRect(minX - 2, minY - 2, (maxX - minX) + 4, (maxY - minY) + 4);
        }
        ctx.restore();

        // Crisp glassy outer pentagon bevel stroke
        ctx.strokeStyle = `rgba(218, 245, 255, ${(0.55 + spec * 0.42).toFixed(3)})`;
        ctx.lineWidth = 0.72 * d.outerPts[0].persp;
        ctx.beginPath();
        for (let j = 0; j < d.outerPts.length; j++) {
          if (j === 0) ctx.moveTo(d.outerPts[j].sx, d.outerPts[j].sy); else ctx.lineTo(d.outerPts[j].sx, d.outerPts[j].sy);
        }
        ctx.closePath();
        ctx.stroke();

        // Crisp gleaming bevel rim around the circular aperture hole
        ctx.strokeStyle = `rgba(196, 240, 255, ${(0.52 + fresnel * 0.42).toFixed(3)})`;
        ctx.lineWidth = 0.62 * d.holePts[0].persp;
        ctx.beginPath();
        for (let j = 0; j < d.holePts.length; j++) {
          if (j === 0) ctx.moveTo(d.holePts[j].sx, d.holePts[j].sy); else ctx.lineTo(d.holePts[j].sx, d.holePts[j].sy);
        }
        ctx.closePath();
        ctx.stroke();
      } else if (d.kind === 'knob') {
        // Iconic Roman dodecahedron protruding glassy sky-blue spherical corner knob!
        const dim = d.isFront ? 1.0 : 0.56;
        const kr = Math.max(0.95, d.r);
        const kg = ctx.createRadialGradient(d.sx - kr * 0.34, d.sy - kr * 0.34, kr * 0.08, d.sx, d.sy, kr);
        kg.addColorStop(0.0, `rgb(${Math.round(244 * dim)}, ${Math.round(252 * dim)}, ${Math.round(255 * dim)})`);
        kg.addColorStop(0.42, `rgb(${Math.round(lerp(72, 134, d.ndotl) * dim)}, ${Math.round(lerp(174, 224, d.ndotl) * dim)}, ${Math.round(252 * dim)})`);
        kg.addColorStop(1.0, `rgb(${Math.round(16 * dim)}, ${Math.round(52 * dim)}, ${Math.round(118 * dim)})`);
        ctx.fillStyle = kg;
        ctx.beginPath();
        ctx.arc(d.sx, d.sy, kr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(14, 38, 86, ${(0.72 * dim).toFixed(3)})`;
        ctx.lineWidth = 0.42;
        ctx.stroke();
      }
    }

    // Sparkling bursting sky-blue particles ("голубые частицы, которые взрываются блеском")!
    const SPARKS = 18;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < SPARKS; i++) {
      const period = 1.9 + hash01(i * 31 + 7) * 1.8;
      const raw = tSec / period + hash01(i * 47 + 13);
      const gen = Math.floor(raw);
      const u = raw - gen;
      const seed = gen * 97 + i * 29 + 5;
      const az = hash01(seed + 1) * Math.PI * 2 + tSec * 0.25 * (i % 2 === 0 ? 1 : -1);
      const el = (hash01(seed + 2) - 0.5) * 2.1;
      const rStart = dodecaR * 0.92;
      const rEnd = dodecaR * (1.58 + hash01(seed + 3) * 0.55);
      const rCur = lerp(rStart, rEnd, Math.pow(u, 0.72));
      const wx = Math.cos(az) * Math.cos(el) * rCur;
      const wy = Math.sin(el) * rCur;
      const wz = Math.sin(az) * Math.cos(el) * rCur;
      const p = projWorldPoint(wx, wy, wz, cx, cy);

      if (u < 0.62) {
        // Gliding luminous sky-blue mote building up to a sparkle flash
        const driftAl = smoothstep(0.0, 0.14, u) * (0.55 + 0.45 * (u / 0.62));
        const mr = (0.95 + hash01(seed + 4) * 0.65) * p.persp;
        ctx.fillStyle = `rgba(148, 224, 255, ${(driftAl * 0.92).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, mr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Sudden crisp starburst flash & scattering micro-glints!
        const bu = (u - 0.62) / 0.38; // 0 -> 1 burst envelope
        const flash = Math.pow(1 - bu, 1.45) * smoothstep(0.0, 0.12, bu);
        const starR = (2.8 + bu * 4.4) * scaleR * p.persp;
        const diagR = starR * 0.54;

        // Bright center diamond flash
        ctx.fillStyle = `rgba(240, 252, 255, ${(flash * 0.96).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(0.6, (1.4 - bu * 0.9) * p.persp), 0, Math.PI * 2);
        ctx.fill();

        // Crisp 4-point primary + 4-point diagonal starburst rays
        ctx.strokeStyle = `rgba(218, 246, 255, ${(flash * 0.94).toFixed(3)})`;
        ctx.lineWidth = 0.78 * p.persp;
        ctx.beginPath();
        ctx.moveTo(p.sx - starR, p.sy); ctx.lineTo(p.sx + starR, p.sy);
        ctx.moveTo(p.sx, p.sy - starR); ctx.lineTo(p.sx, p.sy + starR);
        ctx.stroke();

        ctx.strokeStyle = `rgba(96, 198, 255, ${(flash * 0.72).toFixed(3)})`;
        ctx.lineWidth = 0.52 * p.persp;
        ctx.beginPath();
        ctx.moveTo(p.sx - diagR, p.sy - diagR); ctx.lineTo(p.sx + diagR, p.sy + diagR);
        ctx.moveTo(p.sx - diagR, p.sy + diagR); ctx.lineTo(p.sx + diagR, p.sy - diagR);
        ctx.stroke();

        // Delicate expanding sparkle halo ring + 4 micro-shimmer motes
        ctx.strokeStyle = `rgba(125, 211, 252, ${(flash * 0.44).toFixed(3)})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, starR * 0.65, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (triadGodrays) {
      drawThaumaturgyTriadGodrays(ctx, cx, cy, baseR, tSec, power, 'front', thaumOccs);
    }
  }

  // Helper: Draw one of 6 intricate magi-tech blueprint schematics projected onto the CURVED 3D sphere via exact spherical exponential map!
  // Patterns directly inspired by the user's 6 uploaded reference sheets (conduit tri-seal, solar-lunar astrolabe pentagram,
  // double-graduated nonagram, double-ring eye/tri-circle seal, line-alchemy star badge, geometric architectural crosshair sigil).
  function drawSphericalSchematicPattern(ctx, sphPt, patternIdx, unfoldFrac, alpha, persp) {
    if (unfoldFrac < 0.04 || alpha < 0.03) return;
    const lwMain = Math.max(0.45, 0.74 * persp);
    const lwFine = Math.max(0.35, 0.50 * persp);
    const colMain = `rgba(168, 232, 255, ${(alpha * 0.94).toFixed(3)})`;
    const colBright = `rgba(232, 250, 255, ${(alpha * 0.98).toFixed(3)})`;
    const colSub = `rgba(74, 186, 252, ${(alpha * 0.78).toFixed(3)})`;

    function traceLine(x0, y0, x1, y1, steps = 3) {
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const p = sphPt(lerp(x0, x1, f), lerp(y0, y1, f));
        if (s === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
    }
    function traceCircle(cx0, cy0, r, segs = 22) {
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const p = sphPt(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r);
        if (s === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
    }
    function traceArc(cx0, cy0, r, a0, a1, segs = 12) {
      for (let s = 0; s <= segs; s++) {
        const a = lerp(a0, a1, s / segs);
        const p = sphPt(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r);
        if (s === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
    }
    function drawDot(x0, y0, rad, style) {
      const p = sphPt(x0, y0);
      ctx.fillStyle = style || colBright;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, Math.max(0.55, rad * p.persp), 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle translucent holographic blueprint projection tint disc on the curved sphere
    ctx.fillStyle = `rgba(56, 178, 252, ${(alpha * 0.13 * unfoldFrac).toFixed(3)})`;
    ctx.beginPath();
    traceCircle(0, 0, 1.02, 20);
    ctx.closePath();
    ctx.fill();

    const pat = ((patternIdx || 0) % 6 + 6) % 6;

    if (pat === 0) {
      // Pattern 0: Triple-Medallion Conduit Hexagram (ref: b84c7ff0)
      ctx.strokeStyle = colSub;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      traceCircle(0, 0, 0.84, 24);
      ctx.stroke();

      // 3 satellite medallions at 120 deg connected by twin parallel technical conduits
      const nodes = [];
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI * 0.5 + (k * Math.PI * 2) / 3 + Math.PI / 3;
        nodes.push({ x: Math.cos(a) * 0.74, y: Math.sin(a) * 0.74 });
      }
      ctx.strokeStyle = colMain;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = nodes[k], b = nodes[(k + 1) % 3];
        const dx = b.x - a.x, dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * 0.065, ny = dx / l * 0.065;
        traceLine(a.x + nx, a.y + ny, b.x + nx, b.y + ny, 3);
        traceLine(a.x - nx, a.y - ny, b.x - nx, b.y - ny, 3);
      }
      ctx.stroke();

      // 3 double-rimmed satellite medallions with mini interior stars
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        traceCircle(nodes[k].x, nodes[k].y, 0.25, 14);
        traceCircle(nodes[k].x, nodes[k].y, 0.18, 12);
      }
      // Central hexagram (2 opposite triangles)
      for (let t = 0; t < 2; t++) {
        const off = t * Math.PI;
        for (let s = 0; s < 3; s++) {
          const a0 = off - Math.PI * 0.5 + (s * Math.PI * 2) / 3;
          const a1 = off - Math.PI * 0.5 + ((s + 1) * Math.PI * 2) / 3;
          traceLine(Math.cos(a0) * 0.36, Math.sin(a0) * 0.36, Math.cos(a1) * 0.36, Math.sin(a1) * 0.36, 2);
        }
      }
      ctx.stroke();
      drawDot(0, -0.78, 1.35, colBright);
      drawDot(0, 0, 1.05, colBright);
    } else if (pat === 1) {
      // Pattern 1: Graduated Astrolabe Pentagram + Crescent Moon & Radiant Sun (ref: 9b69fbc2)
      ctx.strokeStyle = colMain;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      traceCircle(0, 0, 1.0, 26);
      traceCircle(0, 0, 0.87, 24);
      traceCircle(0, 0, 0.56, 20);
      ctx.stroke();

      // Graduated astrolabe degree ticks between outer twin rings
      ctx.strokeStyle = colSub;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      for (let t = 0; t < 20; t++) {
        const a = (t / 20) * Math.PI * 2;
        traceLine(Math.cos(a) * 0.87, Math.sin(a) * 0.87, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 1);
      }
      ctx.stroke();

      // Bold central 5-point star + outer octagon chords
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a0 = -Math.PI * 0.5 + (k * Math.PI * 2) / 5;
        const a1 = -Math.PI * 0.5 + (((k + 2) % 5) * Math.PI * 2) / 5;
        traceLine(Math.cos(a0) * 0.56, Math.sin(a0) * 0.56, Math.cos(a1) * 0.56, Math.sin(a1) * 0.56, 3);
      }
      // Left crescent moon arcs + right radiant sun disc
      traceArc(-0.62, 0, 0.28, -Math.PI * 0.65, Math.PI * 0.65, 10);
      traceArc(-0.50, 0, 0.22, -Math.PI * 0.55, Math.PI * 0.55, 8);
      traceCircle(0.66, 0, 0.16, 12);
      for (let r = 0; r < 8; r++) {
        const a = (r / 8) * Math.PI * 2;
        traceLine(0.66 + Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.66 + Math.cos(a) * 0.30, Math.sin(a) * 0.30, 1);
      }
      ctx.stroke();
      for (let c = 0; c < 4; c++) {
        const a = (c * Math.PI) / 2;
        drawDot(Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.95, colBright);
      }
    } else if (pat === 2) {
      // Pattern 2: Double-Graduated Nonagram Star Blueprint (ref: f929326b)
      ctx.strokeStyle = colMain;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      traceCircle(0, 0, 1.0, 26);
      traceCircle(0, 0, 0.86, 24);
      traceCircle(0, 0, 0.58, 20);
      traceCircle(0, 0, 0.26, 14);
      ctx.stroke();

      // Radial calibration degree cells around outer ring
      ctx.strokeStyle = colSub;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      for (let t = 0; t < 24; t++) {
        const a = (t / 24) * Math.PI * 2;
        traceLine(Math.cos(a) * 0.86, Math.sin(a) * 0.86, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 1);
      }
      ctx.stroke();

      // Triple rotated equilateral triangles (9-point nonagram!) + inner 9-point star spokes
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      for (let t = 0; t < 3; t++) {
        const off = -Math.PI * 0.5 + (t * Math.PI * 2) / 9;
        for (let s = 0; s < 3; s++) {
          const a0 = off + (s * Math.PI * 2) / 3;
          const a1 = off + ((s + 1) * Math.PI * 2) / 3;
          traceLine(Math.cos(a0) * 0.85, Math.sin(a0) * 0.85, Math.cos(a1) * 0.85, Math.sin(a1) * 0.85, 3);
        }
      }
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI * 0.5 + (k * Math.PI * 2) / 9;
        const aNext = -Math.PI * 0.5 + (((k + 2) % 9) * Math.PI * 2) / 9;
        traceLine(Math.cos(a) * 0.57, Math.sin(a) * 0.57, Math.cos(aNext) * 0.26, Math.sin(aNext) * 0.26, 2);
      }
      ctx.stroke();
    } else if (pat === 3) {
      // Pattern 3: Double-Ring Eye & Triple-Circle Arcane Seal (ref: ffaed23a)
      ctx.strokeStyle = colMain;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      traceCircle(0, 0, 1.0, 26);
      traceCircle(0, 0, 0.72, 22);
      ctx.stroke();

      // 3 interior nested double-rimmed rings in triad
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI * 0.5 + (k * Math.PI * 2) / 3;
        const rx = Math.cos(a) * 0.36, ry = Math.sin(a) * 0.36;
        traceCircle(rx, ry, 0.22, 14);
        traceCircle(rx, ry, 0.16, 12);
      }
      // Geometric almond Eye emblem at top between outer & inner rings
      traceArc(0, -0.74, 0.26, Math.PI * 1.18, Math.PI * 1.82, 8);
      traceArc(0, -0.98, 0.26, Math.PI * 0.18, Math.PI * 0.82, 8);
      ctx.stroke();

      // Radial glyph ticks between rings
      ctx.strokeStyle = colSub;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      for (let g = 0; g < 16; g++) {
        const a = (g / 16) * Math.PI * 2;
        if (Math.abs(a - Math.PI * 1.5) < 0.35) continue;
        traceLine(Math.cos(a) * 0.78, Math.sin(a) * 0.78, Math.cos(a) * 0.94, Math.sin(a) * 0.94, 1);
      }
      ctx.stroke();
      drawDot(0, -0.86, 1.15, colBright);
      drawDot(0, 0, 0.90, colBright);
    } else if (pat === 4) {
      // Pattern 4: Line-Alchemy Geometric Star & Inscribed Lattice Badge (ref: ref_avif_1)
      ctx.strokeStyle = colSub;
      ctx.lineWidth = lwFine;
      ctx.beginPath();
      traceCircle(0, 0, 0.94, 24);
      traceCircle(0, 0, 0.52, 18);
      // Orthogonal & diagonal drafting axes
      traceLine(-0.96, 0, 0.96, 0, 4);
      traceLine(0, -0.96, 0, 0.96, 4);
      traceLine(-0.68, -0.68, 0.68, 0.68, 3);
      traceLine(-0.68, 0.68, 0.68, -0.68, 3);
      ctx.stroke();

      // Outer diamond + rotated inscribed square (octagram) + nested inner triangle
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      for (let r = 0; r < 2; r++) {
        const off = r * (Math.PI / 4);
        for (let s = 0; s < 4; s++) {
          const a0 = off + (s * Math.PI) / 2;
          const a1 = off + ((s + 1) * Math.PI) / 2;
          traceLine(Math.cos(a0) * 0.92, Math.sin(a0) * 0.92, Math.cos(a1) * 0.92, Math.sin(a1) * 0.92, 3);
        }
      }
      for (let s = 0; s < 3; s++) {
        const a0 = -Math.PI * 0.5 + (s * Math.PI * 2) / 3;
        const a1 = -Math.PI * 0.5 + ((s + 1) * Math.PI * 2) / 3;
        traceLine(Math.cos(a0) * 0.52, Math.sin(a0) * 0.52, Math.cos(a1) * 0.52, Math.sin(a1) * 0.52, 2);
      }
      ctx.stroke();
      drawDot(0, 0, 1.0, colBright);
    } else {
      // Pattern 5: Minimalist Architectural Crosshair & Offset Triangles Sigil (ref: ref_avif_2)
      ctx.strokeStyle = colMain;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      traceCircle(0, -0.08, 0.56, 20);
      traceCircle(0, -0.08, 0.48, 18);
      // Twin parallel vertical construction meridians piercing the circle
      traceLine(-0.24, -0.92, -0.24, 0.88, 4);
      traceLine(0.24, -0.84, 0.24, 0.94, 4);
      traceLine(0, -1.0, 0, 1.0, 4);
      ctx.stroke();

      // Intersecting opposing triangles & offset parallel drafting chord
      ctx.strokeStyle = colBright;
      ctx.lineWidth = lwMain;
      ctx.beginPath();
      traceLine(0, -0.82, 0.66, 0.36, 3);
      traceLine(0.66, 0.36, -0.66, 0.36, 3);
      traceLine(-0.66, 0.36, 0, -0.82, 3);
      traceLine(-0.56, -0.26, 0.56, -0.26, 3);
      traceLine(0.56, -0.26, 0, 0.86, 3);
      traceLine(0, 0.86, -0.56, -0.26, 3);
      ctx.stroke();

      // Terminal calibration dots & micro-rings
      drawDot(-0.24, -0.92, 1.05, colBright);
      drawDot(0.24, 0.94, 1.05, colBright);
      drawDot(0, -1.0, 0.95, colSub);
      drawDot(0, 1.0, 0.95, colSub);
    }
  }

  // --- THAUMATURGY SLOT 2 (WHEN SLOT 1 == THAUMATURGY): Spherical Magi-Tech Projections from Dodecahedron Holes ---
  function drawThaumaturgySphereProjections(ctx, cx, cy, baseR, tSec, power, projSpec, passPhase) {
    if (!projSpec) return;
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const dodecaR = 12.6 * scaleR;
    const sphereR = baseR * projSpec.sphereRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const dAng = computeThaumaturgyDodecaAngles(tSec);
    const mesh = getThaumaturgyRomanDodecahedronMesh();
    const states = computeThaumaturgyProjectionStates(tSec, projSpec.maxSimultaneous);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    const items = [];
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      const face = mesh.faces[st.faceIdx % mesh.faces.length];
      const wn = rotateIllusionVec(face.n.x, face.n.y, face.n.z, dAng.rx, dAng.ry, dAng.rz);
      const wu = rotateIllusionVec(face.u.x, face.u.y, face.u.z, dAng.rx, dAng.ry, dAng.rz);
      const wv = rotateIllusionVec(face.v.x, face.v.y, face.v.z, dAng.rx, dAng.ry, dAng.rz);
      const isBack = wn.z < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      items.push({ st, face, wn, wu, wv, isBack });
    }
    items.sort((a, b) => a.wn.z - b.wn.z);

    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const { st, face, wn, wu, wv, isBack } = items[i];
      const holeStartR = dodecaR * face.inDist;
      const curR = lerp(holeStartR, sphereR, st.radialFrac);
      const depthDim = isBack ? 0.48 : 1.0;

      // 1. Ejection / return perpendicular laser-dotted trajectory ray from the dodecahedron hole to particle
      if (st.phase === 'eject' || st.phase === 'return' || st.phase === 'hover') {
        const pHole = projWorldPoint(wn.x * holeStartR, wn.y * holeStartR, wn.z * holeStartR, cx, cy);
        const pCur = projWorldPoint(wn.x * curR, wn.y * curR, wn.z * curR, cx, cy);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const beamAl = st.alpha * depthDim * (st.phase === 'hover' ? 0.34 : 0.62);
        const lg = ctx.createLinearGradient(pHole.sx, pHole.sy, pCur.sx, pCur.sy);
        lg.addColorStop(0.0, `rgba(96, 180, 255, ${(beamAl * 0.25).toFixed(3)})`);
        lg.addColorStop(1.0, `rgba(218, 246, 255, ${beamAl.toFixed(3)})`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = 0.75 * pCur.persp;
        ctx.beginPath();
        ctx.moveTo(pHole.sx, pHole.sy);
        ctx.lineTo(pCur.sx, pCur.sy);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Curved Spherical Magi-Tech Blueprint Projection (unfold -> 2s hold -> collapse!)
      if (st.unfoldFrac > 0.04) {
        const alphaMax = 0.53 * st.unfoldFrac; // ~30 deg angular radius curved smoothly onto the sphere!
        const cS = Math.cos(st.spinAngle), sS = Math.sin(st.spinAngle);
        const pCenter = projWorldPoint(wn.x * sphereR, wn.y * sphereR, wn.z * sphereR, cx, cy);

        // Exact spherical exponential map projecting 2D blueprint coords (px, py) onto sphere of radius sphereR!
        function sphPt(px, py) {
          const rx = px * cS - py * sS;
          const ry = px * sS + py * cS;
          const r = Math.hypot(rx, ry);
          const ang = r * alphaMax;
          const sinA = Math.sin(ang);
          const cosA = Math.cos(ang);
          const dirU = r > 1e-5 ? rx / r : 0;
          const dirV = r > 1e-5 ? ry / r : 0;
          const wx = sphereR * (wn.x * cosA + (wu.x * dirU + wv.x * dirV) * sinA);
          const wy = sphereR * (wn.y * cosA + (wu.y * dirU + wv.y * dirV) * sinA);
          const wz = sphereR * (wn.z * cosA + (wu.z * dirU + wv.z * dirV) * sinA);
          return projWorldPoint(wx, wy, wz, cx, cy);
        }

        // Crisp source-over holographic blueprint rendering (attenuates gently at grazing limb so edge-on discs never blow out to solid white!)
        const limbSoft = 0.46 + 0.54 * Math.abs(wn.z);
        ctx.save();
        const projAlpha = st.alpha * depthDim * limbSoft * clamp(0.45 + 0.55 * st.unfoldFrac, 0, 1);
        drawSphericalSchematicPattern(ctx, sphPt, st.patternIdx, st.unfoldFrac, projAlpha, pCenter.persp);
        ctx.restore();
      }

      // 3. Bright shimmering / flickering blue particle spark (prominent during eject, 0.5s hover glint, collapse & return!)
      if (st.glintAmp > 0.08) {
        const pCur = projWorldPoint(wn.x * curR, wn.y * curR, wn.z * curR, cx, cy);
        const gAl = st.alpha * st.glintAmp * depthDim;
        const rOrb = (1.35 + st.glintAmp * 1.15) * scaleR * pCur.persp;
        const flareR = (3.4 + st.glintAmp * 4.8) * scaleR * pCur.persp;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const og = ctx.createRadialGradient(pCur.sx, pCur.sy, 0.2, pCur.sx, pCur.sy, rOrb * 2.4);
        og.addColorStop(0.0, `rgba(244, 252, 255, ${gAl.toFixed(3)})`);
        og.addColorStop(0.45, `rgba(96, 196, 255, ${(gAl * 0.72).toFixed(3)})`);
        og.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(pCur.sx, pCur.sy, rOrb * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Crisp flickering 4-point lens glint during 0.5s hover before unfolding!
        ctx.strokeStyle = `rgba(232, 250, 255, ${(gAl * 0.96).toFixed(3)})`;
        ctx.lineWidth = 0.80 * pCur.persp;
        ctx.beginPath();
        ctx.moveTo(pCur.sx - flareR, pCur.sy); ctx.lineTo(pCur.sx + flareR, pCur.sy);
        ctx.moveTo(pCur.sx, pCur.sy - flareR); ctx.lineTo(pCur.sx, pCur.sy + flareR);
        ctx.stroke();

        if (st.phase === 'hover') {
          ctx.strokeStyle = `rgba(125, 211, 252, ${(gAl * 0.65).toFixed(3)})`;
          ctx.lineWidth = 0.55;
          ctx.beginPath();
          ctx.arc(pCur.sx, pCur.sy, flareR * 0.48, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // --- THAUMATURGY MAGI-TECH SCHEMATIC HOOP: Dense Intricate Blueprints with Structural Wireframe Frames ---
  // Used for Slot 2 (when Slot 1 != Thaumaturgy), Slot 3 (non-Triad), and BOTH outer hoops in Triad (1.5x smaller, 2.0x larger)!
  function drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, hoopSpec, passPhase) {
    if (!hoopSpec) return;
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const R = baseR * hoopSpec.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const hH = hoopSpec.bandHalfH * scaleH;
    const PANELS = hoopSpec.panelCount || 12;
    const ang = computeThaumaturgyHoopAngles(tSec, hoopSpec.speedMult, hoopSpec.seed);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    const uAx = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
    const vAx = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
    const nAx = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);

    function toWorld(phi, zVal, rOff = 0) {
      const rr = R + rOff;
      const lx = rr * Math.cos(phi);
      const ly = rr * Math.sin(phi);
      const wx = uAx.x * lx + vAx.x * ly + nAx.x * zVal;
      const wy = uAx.y * lx + vAx.y * ly + nAx.y * zVal;
      const wz = uAx.z * lx + vAx.z * ly + nAx.z * zVal;
      return projWorldPoint(wx, wy, wz, cx, cy);
    }

    const panelList = [];
    const dPhi = (Math.PI * 2) / PANELS;
    for (let k = 0; k < PANELS; k++) {
      const phi0 = ang.spin + k * dPhi;
      const phi1 = phi0 + dPhi;
      const phiM = (phi0 + phi1) * 0.5;
      const midPt = toWorld(phiM, 0, 0);
      const isBack = midPt.wz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      // Tangent-to-camera facing factor so face-on blueprint panels shine crisp while edge-on limbs stay sleek
      const radZ = Math.abs(uAx.z * Math.cos(phiM) + vAx.z * Math.sin(phiM));
      panelList.push({ k, phi0, phi1, phiM, wz: midPt.wz, persp: midPt.persp, isBack, radZ });
    }
    panelList.sort((a, b) => a.wz - b.wz);

    const patternId = Number.isInteger(hoopSpec.patternId) ? ((hoopSpec.patternId % 8) + 8) % 8 : 0;
    const frameStyle = patternId % 4;

    ctx.save();
    for (let i = 0; i < panelList.length; i++) {
      const p = panelList[i];
      const dim = p.isBack ? 0.46 : 1.0;
      const al = dim * (0.48 + 0.52 * p.radZ);
      const lwFrame = Math.max(0.45, 0.78 * p.persp);
      const lwInner = Math.max(0.32, 0.48 * p.persp);

      // Local curved-panel mapper: (u in [0..1] along arc, v in [-1..+1] across band height)
      function cellPt(u, v, rOff = 0) {
        return toWorld(lerp(p.phi0, p.phi1, u), v * hH, rOff);
      }
      function traceCellLine(u0, v0, u1, v1, steps = 2) {
        for (let s = 0; s <= steps; s++) {
          const f = s / steps;
          const pt = cellPt(lerp(u0, u1, f), lerp(v0, v1, f));
          if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
        }
      }
      function traceCellCircle(cu, cv, ru, rv, segs = 12) {
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          const pt = cellPt(cu + Math.cos(a) * ru, cv + Math.sin(a) * rv);
          if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
        }
      }
      function traceCellArc(cu, cv, ru, rv, a0, a1, segs = 8) {
        for (let s = 0; s <= segs; s++) {
          const a = lerp(a0, a1, s / segs);
          const pt = cellPt(cu + Math.cos(a) * ru, cv + Math.sin(a) * rv);
          if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
        }
      }

      // 1. Deep-sapphire translucent blueprint glass pane backing
      const cTL = cellPt(0, 1), cTM = cellPt(0.5, 1), cTR = cellPt(1, 1);
      const cBL = cellPt(0, -1), cBM = cellPt(0.5, -1), cBR = cellPt(1, -1);
      ctx.fillStyle = `rgba(14, 58, 134, ${(0.34 * al).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cTL.sx, cTL.sy);
      ctx.lineTo(cTM.sx, cTM.sy);
      ctx.lineTo(cTR.sx, cTR.sy);
      ctx.lineTo(cBR.sx, cBR.sy);
      ctx.lineTo(cBM.sx, cBM.sy);
      ctx.lineTo(cBL.sx, cBL.sy);
      ctx.closePath();
      ctx.fill();

      // 2. Structural Wireframe Frames ("каркасные рамки") — 4 distinct architectural frame styles!
      ctx.strokeStyle = `rgba(186, 236, 255, ${(0.92 * al).toFixed(3)})`;
      ctx.lineWidth = lwFrame;
      ctx.beginPath();
      traceCellLine(0, 1.0, 1, 1.0, 3);
      traceCellLine(0, -1.0, 1, -1.0, 3);
      traceCellLine(0, -1.08, 0, 1.08, 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(74, 184, 252, ${(0.82 * al).toFixed(3)})`;
      ctx.lineWidth = lwInner;
      ctx.beginPath();
      if (frameStyle === 0) {
        // Double inner rail + 3D protruding L-corner brackets + Vernier ticks
        traceCellLine(0, 0.78, 1, 0.78, 2);
        traceCellLine(0, -0.78, 1, -0.78, 2);
        traceCellLine(0.08, -0.78, 0.08, 0.78, 1);
        traceCellLine(0.92, -0.78, 0.92, 0.78, 1);
        const brT0 = cellPt(0, 1.20, 0.72 * scaleH), brT1 = cellPt(0.20, 1.20, 0.72 * scaleH);
        const brB0 = cellPt(0, -1.20, 0.72 * scaleH), brB1 = cellPt(0.20, -1.20, 0.72 * scaleH);
        ctx.moveTo(cTL.sx, cTL.sy); ctx.lineTo(brT0.sx, brT0.sy); ctx.lineTo(brT1.sx, brT1.sy);
        ctx.moveTo(cBL.sx, cBL.sy); ctx.lineTo(brB0.sx, brB0.sy); ctx.lineTo(brB1.sx, brB1.sy);
        for (let tk = 1; tk <= 3; tk++) {
          const tu = tk / 4;
          traceCellLine(tu, 0.78, tu, 1.0, 1);
          traceCellLine(tu, -1.0, tu, -0.78, 1);
        }
      } else if (frameStyle === 1) {
        // Heavy graduated astrolabe degree-cell border strips (6 cells per panel!)
        traceCellLine(0, 0.72, 1, 0.72, 2);
        traceCellLine(0, -0.72, 1, -0.72, 2);
        for (let tk = 1; tk <= 5; tk++) {
          const tu = tk / 6;
          traceCellLine(tu, 0.72, tu, 1.0, 1);
          traceCellLine(tu, -1.0, tu, -0.72, 1);
        }
        traceCellLine(0.5, 1.0, 0.5, 1.18, 1);
        traceCellLine(0.5, -1.0, 0.5, -1.18, 1);
      } else if (frameStyle === 2) {
        // Stepped architectural truss rails + 45-degree chamfered corner gussets
        traceCellLine(0, 0.80, 1, 0.80, 2);
        traceCellLine(0, -0.80, 1, -0.80, 2);
        traceCellLine(0.0, 0.45, 0.18, 0.80, 1);
        traceCellLine(1.0, 0.45, 0.82, 0.80, 1);
        traceCellLine(0.0, -0.45, 0.18, -0.80, 1);
        traceCellLine(1.0, -0.45, 0.82, -0.80, 1);
        const crT0 = cellPt(0.32, 1.16, 0.55 * scaleH), crT1 = cellPt(0.68, 1.16, 0.55 * scaleH);
        const crB0 = cellPt(0.32, -1.16, 0.55 * scaleH), crB1 = cellPt(0.68, -1.16, 0.55 * scaleH);
        const aT0 = cellPt(0.32, 1.0), aT1 = cellPt(0.68, 1.0);
        const aB0 = cellPt(0.32, -1.0), aB1 = cellPt(0.68, -1.0);
        ctx.moveTo(aT0.sx, aT0.sy); ctx.lineTo(crT0.sx, crT0.sy); ctx.lineTo(crT1.sx, crT1.sy); ctx.lineTo(aT1.sx, aT1.sy);
        ctx.moveTo(aB0.sx, aB0.sy); ctx.lineTo(crB0.sx, crB0.sy); ctx.lineTo(crB1.sx, crB1.sy); ctx.lineTo(aB1.sx, aB1.sy);
      } else {
        // Extended vertical drafting needle-pins + floating double micro-rail flange
        traceCellLine(0, 0.84, 1, 0.84, 2);
        traceCellLine(0, -0.84, 1, -0.84, 2);
        traceCellLine(0.0, -1.26, 0.0, 1.26, 2);
        traceCellLine(0.5, 0.84, 0.5, 1.24, 1);
        traceCellLine(0.5, -0.84, 0.5, -1.24, 1);
        traceCellLine(0.25, 0.84, 0.25, 1.0, 1);
        traceCellLine(0.75, 0.84, 0.75, 1.0, 1);
        traceCellLine(0.25, -0.84, 0.25, -1.0, 1);
        traceCellLine(0.75, -0.84, 0.75, -1.0, 1);
      }
      ctx.stroke();

      // 3. Distinct Reference-Driven Magi-Tech Blueprint Interior per patternId (0..7)!
      ctx.strokeStyle = `rgba(154, 228, 255, ${(0.92 * al).toFixed(3)})`;
      ctx.lineWidth = lwInner;
      ctx.beginPath();
      if (patternId === 0) {
        // 0: conduit_medallions (ref b84c7ff0) — double-rimmed medallions linked by twin dashed conduit pipes + alternating hexagram/4-star!
        traceCellLine(0.0, 0.14, 0.22, 0.14, 1);
        traceCellLine(0.0, -0.14, 0.22, -0.14, 1);
        traceCellLine(0.78, 0.14, 1.0, 0.14, 1);
        traceCellLine(0.78, -0.14, 1.0, -0.14, 1);
        traceCellCircle(0.5, 0, 0.28, 0.62, 14);
        traceCellCircle(0.5, 0, 0.21, 0.46, 12);
        if (p.k % 2 === 0) {
          // Mini hexagram inside medallion
          traceCellLine(0.5, 0.46, 0.69, -0.26, 1);
          traceCellLine(0.69, -0.26, 0.31, -0.26, 1);
          traceCellLine(0.31, -0.26, 0.5, 0.46, 1);
          traceCellLine(0.5, -0.46, 0.69, 0.26, 1);
          traceCellLine(0.69, 0.26, 0.31, 0.26, 1);
          traceCellLine(0.31, 0.26, 0.5, -0.46, 1);
        } else {
          // 6-spoke star rosette inside medallion
          for (let r = 0; r < 3; r++) {
            const a = (r * Math.PI) / 3;
            traceCellLine(0.5 - Math.cos(a) * 0.20, -Math.sin(a) * 0.44, 0.5 + Math.cos(a) * 0.20, Math.sin(a) * 0.44, 1);
          }
        }
      } else if (patternId === 1) {
        // 1: astrolabe_solar_lunar (ref 9b69fbc2) — alternating 5-point pentagrams, curved crescent moons & radiant sun discs!
        const sub = p.k % 3;
        if (sub === 0) {
          traceCellCircle(0.5, 0, 0.30, 0.64, 14);
          for (let s = 0; s < 5; s++) {
            const a0 = -Math.PI * 0.5 + (s * Math.PI * 2) / 5;
            const a1 = -Math.PI * 0.5 + (((s + 2) % 5) * Math.PI * 2) / 5;
            traceCellLine(0.5 + Math.cos(a0) * 0.29, Math.sin(a0) * 0.62, 0.5 + Math.cos(a1) * 0.29, Math.sin(a1) * 0.62, 1);
          }
        } else if (sub === 1) {
          // Crescent moon + dual astrolabe orbit chords
          traceCellArc(0.46, 0, 0.28, 0.60, -Math.PI * 0.68, Math.PI * 0.68, 10);
          traceCellArc(0.56, 0, 0.22, 0.48, -Math.PI * 0.58, Math.PI * 0.58, 8);
          traceCellLine(0.10, 0.48, 0.90, -0.48, 2);
          traceCellLine(0.10, -0.48, 0.90, 0.48, 2);
        } else {
          // Radiant 8-rayed sun disc inside compass circle
          traceCellCircle(0.5, 0, 0.16, 0.36, 10);
          for (let r = 0; r < 8; r++) {
            const a = (r * Math.PI) / 4;
            traceCellLine(0.5 + Math.cos(a) * 0.18, Math.sin(a) * 0.38, 0.5 + Math.cos(a) * 0.34, Math.sin(a) * 0.68, 1);
          }
        }
      } else if (patternId === 2) {
        // 2: nonagram_weave (ref f929326b) — continuous interlocking double-lined zigzag triangle truss spanning across panels!
        traceCellLine(0.0, -0.68, 0.5, 0.68, 2);
        traceCellLine(0.5, 0.68, 1.0, -0.68, 2);
        traceCellLine(0.0, 0.68, 0.5, -0.68, 2);
        traceCellLine(0.5, -0.68, 1.0, 0.68, 2);
        traceCellLine(0.0, -0.48, 0.5, 0.48, 2);
        traceCellLine(0.5, 0.48, 1.0, -0.48, 2);
        traceCellLine(0.0, 0.48, 0.5, -0.48, 2);
        traceCellLine(0.5, -0.48, 1.0, 0.48, 2);
        traceCellCircle(0.5, 0, 0.15, 0.34, 10);
      } else if (patternId === 3) {
        // 3: eye_triad_runes (ref ffaed23a) — alternating geometric almond Eye emblems & triads of 3 nested circles + runic tallies!
        if (p.k % 2 === 0) {
          // Almond Eye emblem with iris circle & vertical framing runes
          traceCellArc(0.5, -0.30, 0.38, 0.68, Math.PI * 0.18, Math.PI * 0.82, 8);
          traceCellArc(0.5, 0.30, 0.38, 0.68, Math.PI * 1.18, Math.PI * 1.82, 8);
          traceCellCircle(0.5, 0, 0.12, 0.28, 10);
          traceCellLine(0.14, -0.58, 0.14, 0.58, 1);
          traceCellLine(0.86, -0.58, 0.86, 0.58, 1);
          traceCellLine(0.14, 0.20, 0.22, 0.36, 1);
          traceCellLine(0.86, -0.20, 0.78, -0.36, 1);
        } else {
          // 3 nested circles in triad formation + flanking zigzag rune glyph
          traceCellCircle(0.5, 0.32, 0.13, 0.28, 10);
          traceCellCircle(0.32, -0.26, 0.13, 0.28, 10);
          traceCellCircle(0.68, -0.26, 0.13, 0.28, 10);
          traceCellLine(0.14, -0.45, 0.20, -0.15, 1);
          traceCellLine(0.20, -0.15, 0.14, 0.15, 1);
          traceCellLine(0.14, 0.15, 0.20, 0.45, 1);
          traceCellLine(0.86, -0.45, 0.80, -0.15, 1);
          traceCellLine(0.80, -0.15, 0.86, 0.15, 1);
          traceCellLine(0.86, 0.15, 0.80, 0.45, 1);
        }
      } else if (patternId === 4) {
        // 4: alchemy_star_badges (ref avif 1) — Line Alchemy badges: diamond-in-circle, triple-Venn triangle, bipyramid!
        const sub = p.k % 3;
        if (sub === 0) {
          // Diamond + inscribed square + circle + orthogonal crosshair
          traceCellLine(0.5, 0.72, 0.88, 0, 1);
          traceCellLine(0.88, 0, 0.5, -0.72, 1);
          traceCellLine(0.5, -0.72, 0.12, 0, 1);
          traceCellLine(0.12, 0, 0.5, 0.72, 1);
          traceCellCircle(0.5, 0, 0.20, 0.44, 12);
          traceCellLine(0.12, 0, 0.88, 0, 2);
          traceCellLine(0.5, -0.72, 0.5, 0.72, 1);
        } else if (sub === 1) {
          // Triangle containing 3 overlapping Venn circles
          traceCellLine(0.5, 0.72, 0.86, -0.64, 1);
          traceCellLine(0.86, -0.64, 0.14, -0.64, 2);
          traceCellLine(0.14, -0.64, 0.5, 0.72, 1);
          traceCellCircle(0.5, 0.12, 0.14, 0.30, 10);
          traceCellCircle(0.38, -0.24, 0.14, 0.30, 10);
          traceCellCircle(0.62, -0.24, 0.14, 0.30, 10);
        } else {
          // Faceted hourglass bipyramid crystal prism with equatorial twin bands
          traceCellLine(0.5, 0.74, 0.82, 0.10, 1);
          traceCellLine(0.82, 0.10, 0.5, -0.74, 1);
          traceCellLine(0.5, -0.74, 0.18, 0.10, 1);
          traceCellLine(0.18, 0.10, 0.5, 0.74, 1);
          traceCellLine(0.18, 0.10, 0.82, 0.10, 1);
          traceCellLine(0.22, -0.12, 0.78, -0.12, 1);
          traceCellLine(0.5, -0.74, 0.5, 0.74, 1);
        }
      } else if (patternId === 5) {
        // 5: vector_meridians (ref avif 2) — Minimalistic geometric circles pierced by parallel vertical meridian needles & offset triangles!
        if (p.k % 2 === 0) {
          traceCellCircle(0.5, 0, 0.24, 0.54, 12);
          traceCellCircle(0.5, 0, 0.18, 0.40, 10);
          traceCellLine(0.38, -0.82, 0.38, 0.82, 1);
          traceCellLine(0.62, -0.82, 0.62, 0.82, 1);
          traceCellLine(0.50, -0.96, 0.50, 0.96, 1);
        } else {
          // Offset overlapping drafting triangles + parallel tangent stroke
          traceCellLine(0.46, 0.68, 0.80, -0.54, 1);
          traceCellLine(0.80, -0.54, 0.14, -0.54, 2);
          traceCellLine(0.14, -0.54, 0.46, 0.68, 1);
          traceCellLine(0.54, 0.68, 0.86, -0.44, 1);
          traceCellLine(0.22, 0.38, 0.78, 0.38, 1);
          traceCellLine(0.50, -0.72, 0.50, 0.72, 1);
        }
      } else if (patternId === 6) {
        // 6: hex_compass_gears — Interlocking hexagonal cells + 6-spoke compass roses & opposing chevron gates!
        for (let s = 0; s < 6; s++) {
          const a0 = (s * Math.PI) / 3;
          const a1 = ((s + 1) * Math.PI) / 3;
          traceCellLine(0.5 + Math.cos(a0) * 0.34, Math.sin(a0) * 0.68, 0.5 + Math.cos(a1) * 0.34, Math.sin(a1) * 0.68, 1);
        }
        for (let r = 0; r < 3; r++) {
          const a = (r * Math.PI) / 3;
          traceCellLine(0.5 - Math.cos(a) * 0.32, -Math.sin(a) * 0.64, 0.5 + Math.cos(a) * 0.32, Math.sin(a) * 0.64, 1);
        }
        traceCellCircle(0.5, 0, 0.14, 0.30, 8);
        traceCellLine(0.08, 0.54, 0.22, 0, 1);
        traceCellLine(0.22, 0, 0.08, -0.54, 1);
        traceCellLine(0.92, 0.54, 0.78, 0, 1);
        traceCellLine(0.78, 0, 0.92, -0.54, 1);
      } else {
        // 7: celestial_calipers — Opposing sweeping concave arc-calipers, twin diagonal measurement axes & concentric inner core!
        traceCellArc(0.0, 0, 0.38, 0.72, -Math.PI * 0.44, Math.PI * 0.44, 8);
        traceCellArc(1.0, 0, 0.38, 0.72, Math.PI * 0.56, Math.PI * 1.44, 8);
        traceCellArc(0.0, 0, 0.26, 0.52, -Math.PI * 0.42, Math.PI * 0.42, 6);
        traceCellArc(1.0, 0, 0.26, 0.52, Math.PI * 0.58, Math.PI * 1.42, 6);
        traceCellLine(0.14, 0.70, 0.86, -0.70, 2);
        traceCellLine(0.14, -0.70, 0.86, 0.70, 2);
        traceCellCircle(0.5, 0, 0.14, 0.32, 10);
      }
      ctx.stroke();

      // Bright precision node rivets at panel center & structural pillar joints (separate subpaths so arcs never bridge into triangles!)
      ctx.fillStyle = `rgba(224, 248, 255, ${(0.92 * al).toFixed(3)})`;
      const pCen = cellPt(0.5, 0);
      const rDot = Math.max(0.50, 0.76 * p.persp);
      const rCorner = rDot * 0.80;
      ctx.beginPath();
      ctx.arc(pCen.sx, pCen.sy, rDot, 0, Math.PI * 2);
      ctx.moveTo(cTL.sx + rCorner, cTL.sy);
      ctx.arc(cTL.sx, cTL.sy, rCorner, 0, Math.PI * 2);
      ctx.moveTo(cBL.sx + rCorner, cBL.sy);
      ctx.arc(cBL.sx, cBL.sy, rCorner, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===========================================================================================================
  // --- MYSTICISM (ID = 27): "STICKY" OBLIVION KNOWLEDGE — DEEP PURPLE-LILAC DROPLET, GOAT EYE, DAEDRIC MATRIX,
  //     SPHERICAL OCCULT PROJECTIONS, ANTI-LIGHT VOLUMETRIC GODRAYS & FRAMELESS / BORDERED DAEDRIC 3D HOOPS ---
  // ===========================================================================================================

  // Glossy dark-purple viscous Oblivion droplet lit along the outer rim with luminous lilac
  function drawWetOblivionDroplet(ctx, x, y, rxD, ryD, angle, rimWidth, isBack, alphaMult = 1) {
    const rMax = Math.max(0.6, Math.max(rxD, ryD));
    if (rMax < 0.5 || alphaMult <= 0.02) return;
    const sp = getOblivionDropletSprite(isBack);
    if (sp) {
      // Sprite body radius is 13.0 inside 48x48 (ratio 24 / 13 = 1.846)
      const sw = rxD * (24 / 13.0);
      const sh = ryD * (24 / 13.0);
      ctx.save();
      ctx.translate(x, y);
      if (angle) ctx.rotate(angle);
      ctx.globalAlpha = clamp(alphaMult * (isBack ? 0.66 : 1.0), 0, 1);
      ctx.drawImage(sp, -sw, -sh, sw * 2, sh * 2);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.globalAlpha = clamp(alphaMult * (isBack ? 0.66 : 1.0), 0, 1);

    // Subtle backlit lilac aura along the droplet's perimeter
    const haloR = rMax * 1.65;
    const hg = ctx.createRadialGradient(0, 0, rMax * 0.42, 0, 0, haloR);
    hg.addColorStop(0, 'rgba(192, 132, 252, 0.34)');
    hg.addColorStop(0.55, 'rgba(147, 51, 234, 0.14)');
    hg.addColorStop(1, 'rgba(88, 28, 135, 0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Dark-purple ink-oil core darkening in the center and glowing lilac toward the rim
    const dg = ctx.createRadialGradient(-rxD * 0.16, -ryD * 0.16, rMax * 0.08, 0, 0, rMax * 1.06);
    dg.addColorStop(0.0, '#130526');
    dg.addColorStop(0.52, '#270b4d');
    dg.addColorStop(0.84, '#6b21a8');
    dg.addColorStop(1.0, '#d8b4fe');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rxD, ryD, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp luminous lilac Fresnel edge highlight
    ctx.strokeStyle = isBack ? 'rgba(192, 132, 252, 0.72)' : 'rgba(233, 213, 255, 0.94)';
    ctx.lineWidth = Math.max(0.45, rimWidth || (rMax * 0.24));
    ctx.stroke();

    // Small glossy pale-lilac wet shoulder reflection
    const hlR = Math.max(0.32, Math.min(rxD, ryD) * 0.24);
    ctx.fillStyle = 'rgba(245, 232, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(-rxD * 0.30, -ryD * 0.28, hlR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Render an authentic filled Elder Scrolls Daedric alphabet glyph in 2D space (supports evenodd inner cutouts + muted bloom!)
  function drawDaedricGlyph2D(ctx, glyphIdx, x, y, halfH, rot, fillStyle, bloomStyle, alpha = 1) {
    if (alpha <= 0.02 || halfH < 0.7) return;
    const g = DAEDRIC_GLYPHS[((glyphIdx % DAEDRIC_GLYPHS.length) + DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length];
    const halfW = halfH * 0.68;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);

    // Optional soft muted bloom halo behind the filled letter (pre-baked sprite, zero per-glyph gradient!)
    if (bloomStyle && alpha >= 0.24) {
      const br = halfH * 1.55;
      const blSp = getPuffRadialSprite('myst_hoop_bloom');
      if (blSp) {
        ctx.globalAlpha = clamp(alpha * 0.30, 0, 1);
        ctx.drawImage(blSp, -br, -br, br * 2, br * 2);
      } else {
        ctx.globalAlpha = clamp(alpha * 0.36, 0, 1);
        const bg = ctx.createRadialGradient(0, 0, halfH * 0.12, 0, 0, br);
        bg.addColorStop(0, bloomStyle);
        bg.addColorStop(1, 'rgba(126, 34, 206, 0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(0, 0, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.beginPath();
    for (let p = 0; p < g.polys.length; p++) {
      const poly = g.polys[p];
      for (let i = 0; i < poly.length; i++) {
        const px = poly[i][0] * halfW;
        const py = poly[i][1] * halfH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    if (bloomStyle) {
      ctx.globalAlpha = clamp(alpha * 0.34, 0, 1);
      ctx.strokeStyle = bloomStyle;
      ctx.lineWidth = Math.max(0.9, halfH * 0.36);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = fillStyle || '#e9d5ff';
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Deterministic Matrix-style vertical falling Daedric alphabet garland:
  // Each step down changes the leading Daedric symbol while the previous glyph stays at the step above and gradually fades!
  function drawDaedricMatrixGarland(ctx, x0, y0, elapsedSec, seed, persp, alpha, opts = null) {
    if (elapsedSec <= 0 || alpha <= 0.02) return;
    const stepRate = (opts && opts.stepRate) || 6.4;
    const stepDy = ((opts && opts.stepDy) || 4.7) * persp;
    const maxSteps = (opts && opts.maxSteps) || 7;
    const trailLife = (opts && opts.trailLife) || 4.4;
    const glyphHalfH = ((opts && opts.glyphHalfH) || 2.15) * persp;
    const swayAmp = (opts && opts.swayAmp) || 0.35;

    const headFloat = elapsedSec * stepRate;
    const headStep = Math.floor(headFloat);
    if (headStep < 0) return;

    const minStep = Math.max(0, Math.floor(headFloat - trailLife));
    const topStep = Math.min(maxSteps - 1, headStep);
    if (minStep > topStep) return;

    // Pick a distinct non-repeating Daedric glyph for every vertical step index k!
    let prevGlyph = -1;
    const glyphAtStep = [];
    for (let k = 0; k <= topStep; k++) {
      let gIdx = Math.floor(hash01(seed * 73 + k * 29 + 11) * DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length;
      if (gIdx === prevGlyph) gIdx = (gIdx + 1 + (k % 5)) % DAEDRIC_GLYPHS.length;
      prevGlyph = gIdx;
      glyphAtStep[k] = gIdx;
    }

    ctx.save();
    for (let k = minStep; k <= topStep; k++) {
      const age = headFloat - k;
      if (age < 0 || age > trailLife) continue;
      const isHead = (k === headStep && headStep < maxSteps);
      const fade = isHead
        ? clamp(1.0 - age * 0.25, 0.72, 1.0)
        : Math.pow(clamp(1.0 - age / trailLife, 0, 1), 1.45);
      const a = alpha * fade;
      if (a <= 0.025) continue;

      const gx = x0 + Math.sin(k * 1.7 + seed * 0.9) * swayAmp * persp;
      const gy = y0 + (k + 0.5) * stepDy;
      const fillCol = isHead
        ? '#faf5ff'
        : (fade > 0.55 ? '#d8b4fe' : (fade > 0.25 ? '#a855f7' : '#6b21a8'));
      const bloomCol = isHead ? 'rgba(216, 180, 254, 0.90)' : 'rgba(147, 51, 234, 0.65)';
      const sz = glyphHalfH * (isHead ? 1.12 : (0.86 + 0.14 * fade));
      drawDaedricGlyph2D(ctx, glyphAtStep[k], gx, gy, sz, 0, fillCol, bloomCol, a);
    }
    ctx.restore();
  }

  // Build 3D occluders for Mysticism Triad black Anti-Light godrays:
  // active unfolded spherical occult projections + all 3 outer frameless Daedric letter hoops!
  function buildMysticismTriadOccluders(mystCfg, baseR, tSec, power) {
    const hoops = [];
    const patches = [];
    if (!mystCfg) return { hoops, patches };
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);

    if (mystCfg.slot2Layer && mystCfg.slot2Layer.kind === 'occult_projections') {
      const states = computeMysticismProjectionStates(tSec, mystCfg.slot2Layer.maxSimultaneous);
      const sphereR = baseR * mystCfg.slot2Layer.sphereRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
      for (let i = 0; i < states.length; i++) {
        const st = states[i];
        if (st.unfoldFrac < 0.18) continue;
        const angRad = 0.44 * st.unfoldFrac;
        patches.push({
          nx: st.n.x, ny: st.n.y, nz: st.n.z,
          sphereR,
          cosLim: Math.cos(angRad),
          unfoldFrac: st.unfoldFrac,
        });
      }
    }

    const layers = mystCfg.slot3Layers || [];
    for (let i = 0; i < layers.length; i++) {
      const hp = layers[i];
      const ang = computeMysticismHoopAngles(tSec, hp.speedMult, hp.seed);
      const u = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
      const v = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
      const n = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);
      hoops.push({
        id: hp.id,
        R: baseR * hp.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04),
        hH: hp.bandHalfH * scaleH,
        ux: u.x, uy: u.y, uz: u.z,
        vx: v.x, vy: v.y, vz: v.z,
        nx: n.x, ny: n.y, nz: n.z,
      });
    }
    hoops.sort((a, b) => a.R - b.R);
    return { hoops, patches };
  }

  // Analytical 3D occlusion of Mysticism Triad Anti-Light godrays against spherical occult seals & 3 Daedric letter hoops
  function evalMysticismAntiLightOcclusion(dx, dy, dz, maxLen, occs) {
    if (!occs) return { hitS: maxLen, trans: 1.0, occluded: false };
    let hitS = maxLen;
    let trans = 1.0;

    const patches = occs.patches || [];
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const d = dx * p.nx + dy * p.ny + dz * p.nz;
      if (d > p.cosLim) {
        const edge = clamp((d - p.cosLim) / Math.max(0.02, 1 - p.cosLim), 0, 1);
        trans *= (1 - edge * 0.45 * p.unfoldFrac);
        if (p.sphereR < hitS) hitS = p.sphereR;
      }
    }

    if (occs.hoops && occs.hoops.length > 0) {
      const ringHit = computeRayRingOcclusion(0, 0, 0, dx, dy, dz, maxLen, occs.hoops, 0);
      if (ringHit.occluded) {
        trans *= (0.42 + 0.58 * ringHit.trans);
        if (ringHit.hitS < hitS) hitS = ringHit.hitS;
      }
    }

    return { hitS, trans: clamp(trans, 0.22, 1.0), occluded: trans < 0.94 };
  }

  // Cached pitch-black volumetric 2D Gaussian beam sprite for Triad Mysticism "Anti-Light" godrays
  // (exact optical cone profile of Restoration's volumetric shafts, rendered with source-over darkness carving!)
  let cachedAntiLightBeamTex = null;
  function getAntiLightVolumetricBeamTexture() {
    if (cachedAntiLightBeamTex) return cachedAntiLightBeamTex;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const w = 128;
    const h = 96;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    const img = c.createImageData(w, h);
    const d = img.data;
    const halfH = (h - 1) * 0.5;
    for (let py = 0; py < h; py++) {
      const yNorm = (py - halfH) / halfH;
      for (let px = 0; px < w; px++) {
        const u = px / (w - 1);
        const coneHalfW = 0.14 + 0.84 * Math.pow(u, 0.90);
        const lat = yNorm / coneHalfW;
        const latGauss = Math.exp(-lat * lat * 3.2);
        const coreSpine = 0.65 + 0.35 * Math.exp(-lat * lat * 11.0);
        const rootSoft = smoothstep(0.0, 0.05, u);
        const axDecay = rootSoft * Math.pow(1.0 - u, 1.32);
        const a = clamp(latGauss * coreSpine * axDecay, 0, 1);
        // Pitch-black abyssal core with an ultra-faint dark-indigo eclipse edge on the outer Gaussian skirt
        const skirt = smoothstep(0.55, 1.15, Math.abs(lat));
        const r = Math.round(lerp(3, 28, skirt));
        const g = Math.round(lerp(1, 8, skirt));
        const b = Math.round(lerp(7, 48, skirt));
        const idx = (py * w + px) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    cachedAntiLightBeamTex = cv;
    return cv;
  }

  // Restoration-style layered 3D volumetric black "Anti-Light" godrays for Triad Mysticism:
  // Faint pitch-black shafts carving dark shadows through the intensified pale-lilac mist & chamber glow,
  // dynamically sliced by the 3 outer frameless Daedric hoops!
  function drawMysticismTriadAntiLightGodrays(ctx, cx, cy, baseR, tSec, power, passPhase, occs) {
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const beamTex = getAntiLightVolumetricBeamTexture();
    const isBackPass = passPhase === 'back';
    const isFrontPass = passPhase === 'front';

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    function emitAntiLightShaft(dx, dy, dz, worldLen, spreadHalfW, baseAlpha, env) {
      if (env < 0.02) return;
      const isBack = dz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) return;

      const occ = evalMysticismAntiLightOcclusion(dx, dy, dz, worldLen, occs);
      const startOff = isBack ? 3.5 : 6.2; // Keep front core droplet & goat eye crisp while carving surrounding mist!
      const p0 = projWorldPoint(dx * startOff * scaleR, dy * startOff * scaleR, dz * startOff * scaleR, cx, cy);
      const p1 = projWorldPoint(dx * worldLen, dy * worldLen, dz * worldLen, cx, cy);
      const screenLen = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);
      if (screenLen <= 5.0) return;

      const ang = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
      let clipFrac = 1.0;
      if (occ.occluded) {
        const pHit = projWorldPoint(dx * occ.hitS, dy * occ.hitS, dz * occ.hitS, cx, cy);
        clipFrac = clamp(Math.hypot(pHit.sx - p0.sx, pHit.sy - p0.sy) / screenLen, 0.06, 0.99);
      }
      const perspGain = isBack ? (0.76 + 0.24 * (1 + dz)) : (0.90 + 0.20 * dz);
      const halfW = spreadHalfW * (0.82 + 0.34 * p1.persp);
      const aUse = clamp(baseAlpha * env * perspGain, 0, 0.78);

      if (beamTex) {
        drawVolumetricGodrayBeam(ctx, beamTex, p0.sx, p0.sy, ang, screenLen, halfW, aUse, clipFrac, occ.trans);
      } else {
        const useLen = clipFrac < 0.985 ? screenLen * clipFrac : screenLen;
        ctx.save();
        ctx.translate(p0.sx, p0.sy);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(0, 0, useLen, 0);
        g.addColorStop(0, `rgba(4, 1, 9, ${aUse.toFixed(3)})`);
        g.addColorStop(0.6, `rgba(8, 2, 16, ${(aUse * 0.45).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -halfW * 0.16);
        ctx.lineTo(useLen, -halfW * 0.72);
        ctx.lineTo(useLen, halfW * 0.72);
        ctx.lineTo(0, halfW * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 1. 22 Wide layered atmospheric black Anti-Light shafts (smooth Restoration-style asynchronous breathing lifecycles)
    for (let i = 0; i < 22; i++) {
      const period = 3.1 + hash01(i * 23 + 7) * 3.5;
      const cyc = tSec / period + hash01(i * 37 + 13);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.6);
      if (env < 0.02) continue;
      const seed = gen * 107 + i * 41 + 19;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.88;
      const az = hash01(seed + 2) * Math.PI * 2 + (life - 0.5) * 0.24 * (i % 2 === 0 ? 1 : -1) - tSec * 0.022;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (62 + hash01(seed + 3) * 58) * scaleR * (0.88 + power * 0.16);
      const spreadHalfW = (7.2 + hash01(seed + 4) * 6.8) * scaleR;
      const baseAlpha = (0.20 + hash01(seed + 5) * 0.14) * (0.86 + power * 0.16);
      emitAntiLightShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env);
    }

    // 2. 16 Finer crisp dark Anti-Light filaments adding delicate eerie volumetric streaking
    for (let i = 0; i < 16; i++) {
      const period = 2.1 + hash01(i * 47 + 11) * 2.5;
      const cyc = tSec / period + hash01(i * 61 + 17);
      const gen = Math.floor(cyc);
      const life = cyc - gen;
      const env = Math.pow(Math.sin(life * Math.PI), 1.5);
      if (env < 0.02) continue;
      const seed = gen * 149 + i * 59 + 29;
      const uZ = (hash01(seed + 1) * 2 - 1) * 0.82;
      const az = hash01(seed + 2) * Math.PI * 2 - (life - 0.5) * 0.26;
      const rXY = Math.sqrt(Math.max(0.001, 1 - uZ * uZ));
      const worldLen = (44 + hash01(seed + 3) * 48) * scaleR * (0.88 + power * 0.16);
      const spreadHalfW = (3.2 + hash01(seed + 4) * 3.4) * scaleR;
      const baseAlpha = (0.24 + hash01(seed + 5) * 0.14) * (0.86 + power * 0.16);
      emitAntiLightShaft(Math.cos(az) * rXY, Math.sin(az) * rXY, uZ, worldLen, spreadHalfW, baseAlpha, env);
    }

    ctx.restore();
  }

  // Deterministic occasional yellow goat-eye state peeking out of Mysticism Slot 1's dark-purple droplet
  function computeMysticismGoatEyeState(tSec) {
    const PERIOD = 5.20;
    const SHOW_START = 0.75;
    const SHOW_END = 2.75;
    const raw = (tSec + 0.0) / PERIOD;
    const gen = Math.floor(raw);
    const localT = (raw - gen) * PERIOD;
    if (localT < SHOW_START || localT > SHOW_END) {
      return { visible: false, openFrac: 0, gen, ox: 0, oy: 0, tilt: 0, lookX: 0, lookY: 0 };
    }
    const u = (localT - SHOW_START) / (SHOW_END - SHOW_START); // 0..1 across 2.0s peek
    let openFrac = 1.0;
    if (u < 0.18) {
      openFrac = smoothstep(0, 0.18, u);
    } else if (u > 0.80) {
      openFrac = smoothstep(1.0, 0.80, u);
    }
    // Single uncanny quick blink around u = 0.56
    const blinkDist = Math.abs(u - 0.56);
    if (blinkDist < 0.055) {
      const bf = blinkDist / 0.055;
      openFrac *= (0.12 + 0.88 * bf * bf);
    }
    const seed = gen * 97 + 13;
    const ox = (hash01(seed + 1) - 0.5) * 4.4;
    const oy = (hash01(seed + 2) - 0.5) * 3.8;
    const tilt = (hash01(seed + 3) - 0.5) * 0.28;
    // Subtle unsettling horizontal micro-glance
    const lookX = Math.sin(u * Math.PI * 3.0 + hash01(seed + 4) * 6.28) * 0.24;
    const lookY = Math.cos(u * Math.PI * 2.0 + hash01(seed + 5) * 6.28) * 0.12;
    return {
      visible: openFrac > 0.04,
      openFrac: clamp(openFrac, 0, 1),
      gen,
      ox,
      oy,
      tilt,
      lookX,
      lookY,
    };
  }

  // Render the occasional yellow goat eye with horizontal black rectangular pupil emerging from the dark-purple droplet
  function drawMysticismGoatEye(ctx, scx, scy, scaleP, tSec) {
    const st = computeMysticismGoatEyeState(tSec);
    if (!st.visible) return;

    const ex = scx + st.ox * scaleP;
    const ey = scy + st.oy * scaleP;
    const eyeRx = 7.4 * scaleP;
    const eyeRy = 5.0 * scaleP * st.openFrac;
    if (eyeRy < 0.35) return;

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(st.tilt);

    // 1. Parted dark viscous violet eyelid pocket with soft lilac wet lip
    ctx.fillStyle = `rgba(10, 2, 20, ${(0.88 * st.openFrac).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(-eyeRx * 1.14, 0);
    ctx.quadraticCurveTo(0, -eyeRy * 1.30, eyeRx * 1.14, 0);
    ctx.quadraticCurveTo(0, eyeRy * 1.30, -eyeRx * 1.14, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(192, 132, 252, ${(0.56 * st.openFrac).toFixed(3)})`;
    ctx.lineWidth = 0.68 * scaleP;
    ctx.stroke();

    // 2. Clip to the open almond aperture of the goat eye
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-eyeRx, 0);
    ctx.quadraticCurveTo(0, -eyeRy * 1.16, eyeRx, 0);
    ctx.quadraticCurveTo(0, eyeRy * 1.16, -eyeRx, 0);
    ctx.closePath();
    ctx.clip();

    // 3. Vivid glowing golden-yellow goat iris (bright across full aperture so it pops unmistakably at 350x281!)
    const gx = st.lookX * eyeRx * 0.42;
    const gy = st.lookY * eyeRy * 0.34;
    const irisR = eyeRx * 1.06;
    const ig = ctx.createRadialGradient(gx, gy, irisR * 0.12, gx, gy, irisR);
    ig.addColorStop(0.0, '#fef9c3');
    ig.addColorStop(0.38, '#fde047');
    ig.addColorStop(0.78, '#facc15');
    ig.addColorStop(0.95, '#eab308');
    ig.addColorStop(1.0, '#ca8a04');
    ctx.fillStyle = ig;
    ctx.fillRect(-eyeRx * 1.1, -eyeRy * 1.25, eyeRx * 2.2, eyeRy * 2.5);

    // Subtle radial amber-gold iris fibers
    ctx.strokeStyle = 'rgba(161, 98, 7, 0.22)';
    ctx.lineWidth = 0.36 * scaleP;
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.moveTo(gx + Math.cos(a) * irisR * 0.36, gy + Math.sin(a) * irisR * 0.32);
      ctx.lineTo(gx + Math.cos(a) * irisR * 0.88, gy + Math.sin(a) * irisR * 0.84);
    }
    ctx.stroke();

    // 4. Unmistakable HORIZONTAL BLACK GOAT PUPIL (sleek caprine rectangular slit leaving bright yellow above & below!)
    const pW = eyeRx * 0.52;
    const pH = Math.max(0.70 * scaleP, eyeRx * 0.145);
    const pRad = pH * 0.45;
    ctx.fillStyle = '#050208';
    ctx.beginPath();
    ctx.moveTo(gx - pW + pRad, gy - pH);
    ctx.lineTo(gx + pW - pRad, gy - pH);
    ctx.quadraticCurveTo(gx + pW + pRad * 0.25, gy, gx + pW - pRad, gy + pH);
    ctx.lineTo(gx - pW + pRad, gy + pH);
    ctx.quadraticCurveTo(gx - pW - pRad * 0.25, gy, gx - pW + pRad, gy - pH);
    ctx.closePath();
    ctx.fill();

    // Gentle upper eyelid rim shadow (kept subtle so the yellow iris stays bright!)
    const shG = ctx.createLinearGradient(0, -eyeRy * 1.15, 0, -eyeRy * 0.22);
    shG.addColorStop(0, 'rgba(18, 5, 34, 0.24)');
    shG.addColorStop(1, 'rgba(18, 5, 34, 0)');
    ctx.fillStyle = shG;
    ctx.fillRect(-eyeRx, -eyeRy * 1.2, eyeRx * 2, eyeRy * 1.1);

    // Crisp wet catchlight gleam on upper-left iris
    ctx.fillStyle = 'rgba(255, 254, 240, 0.94)';
    ctx.beginPath();
    ctx.ellipse(-eyeRx * 0.30, -eyeRy * 0.34, 0.95 * scaleP, 0.48 * scaleP, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Crisp dark eyelid crease contour outlining the open eye
    ctx.strokeStyle = `rgba(21, 5, 38, ${(0.88 * st.openFrac).toFixed(3)})`;
    ctx.lineWidth = 0.72 * scaleP;
    ctx.beginPath();
    ctx.moveTo(-eyeRx, 0);
    ctx.quadraticCurveTo(0, -eyeRy * 1.16, eyeRx, 0);
    ctx.quadraticCurveTo(0, eyeRy * 1.16, -eyeRx, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // --- MYSTICISM SLOT 1: Dark-Purple Sticky Oblivion Droplet Lit Lilac Along Edges + Daedric Particles +
  //     Occasional Yellow Goat Eye + Pale-Lilac Mist (Stronger in Triad + Black Anti-Light Volumetric Godrays!) ---
  function drawMysticismSlot1DropCore(ctx, scx, scy, baseR, tSec, power, rotMult = 1, mistGain = 1.0, hasAntiLight = false, antiLightOccs = null) {
    const scaleP = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04);
    const baseRad = 11.4 * scaleP;
    const isStrongMist = mistGain > 1.5;

    // 1. Pale-lilac atmospheric mist surrounding the droplet (gentle normally; much stronger & wider in Triad so black Anti-Light rays carve through it!)
    ctx.save();
    const mistRadius = baseRad * (isStrongMist ? 3.55 : 2.35);
    const mistBaseA = isStrongMist ? 0.34 : 0.17;
    const mg = ctx.createRadialGradient(scx, scy, baseRad * 0.35, scx, scy, mistRadius);
    mg.addColorStop(0.0, `rgba(236, 218, 255, ${(mistBaseA * 1.15).toFixed(3)})`);
    mg.addColorStop(0.38, `rgba(216, 180, 254, ${(mistBaseA * 0.82).toFixed(3)})`);
    mg.addColorStop(0.72, `rgba(168, 85, 247, ${(mistBaseA * 0.32).toFixed(3)})`);
    mg.addColorStop(1.0, 'rgba(88, 28, 135, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(scx, scy, mistRadius, 0, Math.PI * 2);
    ctx.fill();

    // Swirling pale-lilac wispy FBM mist clouds drifting gently around the core (zero ctx.filter + strict zero border + 24Hz update!)
    const miRes = ensureMiasmaResources();
    if (miRes) {
      const { buf, ctx: mCtx, canvas: mCanvas } = miRes;
      const qTick = Math.floor(tSec * 24);
      const mKey = `myst|${isStrongMist ? 1 : 0}|${qTick}`;
      if (_miasmaCacheKey !== mKey) {
        _miasmaCacheKey = mKey;
        const qT = qTick / 24;
        const { w: mw, h: mh, buf32 } = buf;
        buf32.fill(0);
        const drift = qT * 0.95;
        const turb = qT * 0.65;
        for (let py = 2; py < mh - 2; py++) {
          const yS = (py / (mh - 1) - 0.5) * 2.0;
          const yS2 = yS * yS;
          for (let px = 2; px < mw - 2; px++) {
            const xS = (px / (mw - 1) - 0.5) * 2.0;
            const r2 = xS * xS + yS2;
            if (r2 >= 0.78) continue;
            const radEnv = Math.pow(1.0 - r2 / 0.78, 1.45);
            const wx = xS * 2.7 + Math.sin(yS * 2.4 + turb) * 0.42;
            const wy = yS * 2.7 + drift;
            const f1 = Math.sin(wx * 2.4 + Math.cos(wy * 1.9 + turb * 0.8)) * Math.cos(wy * 2.0 - wx * 1.5);
            const f2 = Math.sin(wx * 4.8 - wy * 3.4 - turb * 1.1) * 0.48;
            const density = clamp((0.42 + (f1 + f2) * 0.38) * radEnv, 0, 1);
            if (density < 0.035) continue;
            const al = clamp(Math.pow(density, 1.18) * (isStrongMist ? 202 : 114), 0, 220);
            const tint = clamp(f1 * 0.5 + 0.5, 0, 1);
            const r = lerp(192, 238, tint * density);
            const g = lerp(148, 216, density);
            const b = lerp(246, 255, tint * 0.8);
            buf32[py * mw + px] = packAbgrColor(r, g, b, al);
          }
        }
        smoothMiasmaAndUpload(mCtx, buf);
      }
      const drawW = (isStrongMist ? 108 : 72) * scaleP;
      const drawH = (isStrongMist ? 104 : 70) * scaleP;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mCanvas, scx - drawW * 0.5, scy - drawH * 0.52, drawW, drawH);
    }
    ctx.restore();

    // 2. Back-hemisphere black "Anti-Light" volumetric godrays (Triad only!) carving shadows behind the droplet
    if (hasAntiLight) {
      drawMysticismTriadAntiLightGodrays(ctx, scx, scy, baseR, tSec, power, 'back', antiLightOccs);
    }

    // 3. Asynchronous 3D sticky satellite droplets (same organic liquid physics as Destruction-Poison Slot 1, recolored dark-purple/lilac!)
    function randSphereDir(azSeed, zSeed) {
      const az = hash01(azSeed) * Math.PI * 2;
      const z = hash01(zSeed) * 1.88 - 0.94;
      const rXY = Math.sqrt(Math.max(0.06, 1 - z * z));
      return { x: Math.cos(az) * rXY, y: Math.sin(az) * rXY, z, az };
    }

    function drawSingleOblivionSatellite(ds) {
      if (ds.bridgeStrength > 0.05) {
        const ax = ds.anchorPx, ay = ds.anchorPy;
        const bx = ds.sx, by = ds.sy;
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const wA = (1.6 + ds.r * 0.42) * ds.bridgeStrength * ds.persp;
        const wB = (0.7 + ds.r * 0.25) * ds.bridgeStrength * ds.persp;
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        ctx.fillStyle = ds.isBack ? '#240944' : '#350e63';
        ctx.beginPath();
        ctx.moveTo(ax + nx * wA, ay + ny * wA);
        ctx.quadraticCurveTo(mx + nx * wB * 0.35, my + ny * wB * 0.35, bx + nx * wB, by + ny * wB);
        ctx.lineTo(bx - nx * wB, by - ny * wB);
        ctx.quadraticCurveTo(mx - nx * wB * 0.35, my - ny * wB * 0.35, ax - nx * wA, ay - ny * wA);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ds.isBack ? 'rgba(192, 132, 252, 0.34)' : 'rgba(216, 180, 254, 0.58)';
        ctx.lineWidth = 0.48 * ds.persp;
        ctx.stroke();
      }
      const appR = ds.r * ds.persp;
      const stretch = ds.isFrozen ? 1.0 : 1.18;
      const squash = ds.isFrozen ? 1.0 : 0.86;
      const rxD = appR * (ds.isFrozen ? (1 + 0.07 * Math.sin(tSec * 9.0 + ds.seed)) : stretch);
      const ryD = appR * (ds.isFrozen ? (1 - 0.07 * Math.sin(tSec * 9.0 + ds.seed)) : squash);
      drawWetOblivionDroplet(ctx, ds.sx, ds.sy, rxD, ryD, ds.velAng, Math.max(0.42, appR * 0.25), ds.isBack);
    }

    const NUM_CHANNELS = 7;
    const DURATIONS = [1.95, 2.38, 1.72, 2.62, 2.08, 2.48, 1.84];
    const PHASE_SEEDS = [0.11, 0.67, 0.35, 0.83, 0.21, 0.54, 0.07];
    const dropSpecs = [];
    for (let d = 0; d < NUM_CHANNELS; d++) {
      const dur = DURATIONS[d];
      const uT = tSec + PHASE_SEEDS[d] * dur;
      const cyc = Math.floor(uT / dur);
      const ph = (uT - cyc * dur) / dur;
      const phStart = 0.04 + hash01(cyc * 43 + d * 17) * 0.14;
      const phLen = 0.66 + hash01(cyc * 59 + d * 23) * 0.15;
      if (ph < phStart || ph >= phStart + phLen) continue;
      const aPh = (ph - phStart) / phLen;

      const dirOut = randSphereDir(cyc * 61 + d * 83 + 5, cyc * 97 + d * 41 + 9);
      const outR = baseRad * (0.68 + hash01(cyc * 19 + d * 37) * 0.26);
      const outX = dirOut.x * outR, outY = dirOut.y * outR, outZ = dirOut.z * outR;

      const inAz = dirOut.az + (hash01(cyc * 79 + d * 7) > 0.5 ? 1 : -1) * (0.75 + hash01(cyc * 89 + d * 29) * 1.55);
      const inZ = clamp(-dirOut.z * 0.35 + (hash01(cyc * 101 + d * 47) - 0.5) * 1.15, -0.92, 0.92);
      const inRxy = Math.sqrt(Math.max(0.06, 1 - inZ * inZ));
      const inR = baseRad * (0.68 + hash01(cyc * 67 + d * 3) * 0.26);
      const inX = Math.cos(inAz) * inRxy * inR, inY = Math.sin(inAz) * inRxy * inR, inZ3 = inZ * inR;

      const hoverAz = dirOut.az + (hash01(cyc * 29 + d * 53) - 0.5) * 1.45;
      const hoverZ = clamp(dirOut.z + (hash01(cyc * 73 + d * 11) - 0.5) * 1.05, -0.94, 0.94);
      const hoverRxy = Math.sqrt(Math.max(0.06, 1 - hoverZ * hoverZ));
      const flightDist = (13.2 + Math.pow(hash01(cyc * 31 + d * 13), 0.85) * 17.5) * scaleP;
      const hovX = Math.cos(hoverAz) * hoverRxy * flightDist;
      const hovY = Math.sin(hoverAz) * hoverRxy * flightDist;
      const hovZ = hoverZ * flightDist;

      const arcOutBendX = (hash01(cyc * 103 + d * 5) - 0.5) * 7.5 * scaleP;
      const arcOutBendY = (hash01(cyc * 107 + d * 9) - 0.5) * 7.5 * scaleP;
      const arcInBendX = (hash01(cyc * 109 + d * 15) - 0.5) * 9.0 * scaleP;
      const arcInBendY = (hash01(cyc * 113 + d * 21) - 0.5) * 9.0 * scaleP;
      const dropR = (1.30 + Math.pow(hash01(cyc * 13 + d * 71), 1.45) * 2.95) * scaleP;

      let x3 = 0, y3 = 0, z3 = 0, vx = 0, vy = 0, isFrozen = false, bridgeStrength = 0;
      let anchorPx = scx + outX, anchorPy = scy + outY;
      let anchorAng = Math.atan2(dirOut.y, dirOut.x);
      let silhouetteWeight = 1 - Math.abs(dirOut.z) * 0.72;

      if (aPh < 0.24) {
        const u = easeOutCubic(aPh / 0.24);
        x3 = quadVal(outX, (outX + hovX) * 0.5 + arcOutBendX, hovX, u);
        y3 = quadVal(outY, (outY + hovY) * 0.5 + arcOutBendY, hovY, u);
        z3 = quadVal(outZ, (outZ + hovZ) * 0.5, hovZ, u);
        vx = hovX - outX; vy = hovY - outY;
        bridgeStrength = clamp(1.0 - u * 1.25, 0, 1);
      } else if (aPh < 0.64) {
        x3 = hovX; y3 = hovY; z3 = hovZ;
        isFrozen = true;
      } else {
        const u = (aPh - 0.64) / 0.36;
        const easeBack = u * u;
        x3 = quadVal(hovX, (hovX + inX) * 0.5 + arcInBendX, inX, easeBack);
        y3 = quadVal(hovY, (hovY + inY) * 0.5 + arcInBendY, inY, easeBack);
        z3 = quadVal(hovZ, (hovZ + inZ3) * 0.5, inZ3, easeBack);
        vx = inX - hovX; vy = inY - hovY;
        anchorPx = scx + inX; anchorPy = scy + inY;
        anchorAng = Math.atan2(inY, inX);
        silhouetteWeight = 1 - Math.abs(inZ) * 0.72;
        bridgeStrength = clamp((easeBack - 0.32) * 1.48, 0, 1);
      }
      const persp = 1.0 / (1.0 - clamp(z3 / (46 * scaleP), -0.34, 0.36));
      dropSpecs.push({
        sx: scx + x3 * persp,
        sy: scy + y3 * persp,
        z3, persp,
        isBack: z3 < -1.8 * scaleP,
        r: dropR,
        isFrozen,
        bridgeStrength,
        anchorPx, anchorPy, anchorAng, silhouetteWeight,
        velAng: Math.atan2(vy, vx),
        seed: d * 13 + cyc,
      });
    }

    // Back-hemisphere satellites & emerging Daedric glyph particles behind droplet
    const backDrops = dropSpecs.filter((ds) => ds.isBack).sort((a, b) => a.z3 - b.z3);
    for (let i = 0; i < backDrops.length; i++) drawSingleOblivionSatellite(backDrops[i]);

    // Prepare 14 Daedric alphabet particles emerging from the droplet (split back vs front!)
    const daedricParts = [];
    const NUM_PARTS = 14;
    for (let i = 0; i < NUM_PARTS; i++) {
      const period = 2.4 + hash01(i * 31 + 5) * 1.8;
      const raw = tSec / period + hash01(i * 47 + 11);
      const gen = Math.floor(raw);
      const life = raw - gen;
      const al = Math.pow(Math.sin(life * Math.PI), 0.9);
      if (al < 0.04) continue;
      const seed = gen * 89 + i * 23 + 7;
      const az = hash01(seed + 1) * Math.PI * 2 + life * 0.35 * (i % 2 === 0 ? 1 : -1);
      const uZ = (hash01(seed + 2) * 1.72 - 0.86);
      const rXY = Math.sqrt(Math.max(0.06, 1 - uZ * uZ));
      const dist = lerp(baseRad * 0.92, baseRad * 2.55, Math.pow(life, 0.82));
      const wx = Math.cos(az) * rXY * dist;
      const wy = Math.sin(az) * rXY * dist - life * 5.2 * scaleP;
      const wz = uZ * dist;
      const pr = projWorldPoint(wx, wy, wz, scx, scy);
      const gIdx = Math.floor(hash01(seed + 3) * DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length;
      daedricParts.push({
        sx: pr.sx, sy: pr.sy, wz, persp: pr.persp,
        isBack: wz < 0,
        gIdx,
        halfH: (2.85 + hash01(seed + 4) * 1.55) * scaleP * pr.persp * (0.72 + 0.28 * Math.sin(life * Math.PI)),
        rot: (hash01(seed + 5) - 0.5) * 0.42 + (life - 0.5) * 0.25,
        al: al * (wz < 0 ? 0.54 : 0.94),
      });
    }
    daedricParts.sort((a, b) => a.wz - b.wz);
    for (let i = 0; i < daedricParts.length; i++) {
      const dp = daedricParts[i];
      if (!dp.isBack) continue;
      drawDaedricGlyph2D(ctx, dp.gIdx, dp.sx, dp.sy, dp.halfH, dp.rot, '#c084fc', 'rgba(147, 51, 234, 0.65)', dp.al);
    }

    // 4. Wobbling dark-purple sticky mother droplet contour + metaball pulls + bright lilac rim light!
    const N_PTS = 36;
    const globPts = [];
    for (let i = 0; i < N_PTS; i++) {
      const a = (i / N_PTS) * Math.PI * 2;
      let wob = 1.0
        + 0.082 * Math.sin(2 * a + tSec * 3.5)
        + 0.056 * Math.cos(3 * a - tSec * 2.6)
        + 0.030 * Math.sin(5 * a + tSec * 4.8);
      for (let d = 0; d < dropSpecs.length; d++) {
        const ds = dropSpecs[d];
        const pull = ds.bridgeStrength * 0.28 * ds.silhouetteWeight;
        if (pull <= 0.01) continue;
        let diffA = a - ds.anchorAng;
        while (diffA > Math.PI) diffA -= Math.PI * 2;
        while (diffA < -Math.PI) diffA += Math.PI * 2;
        wob += pull * Math.exp(-(diffA * diffA) / 0.22);
      }
      globPts.push({
        x: scx + Math.cos(a) * baseRad * wob,
        y: scy + Math.sin(a) * baseRad * wob,
      });
    }

    function traceMotherGlobPath() {
      ctx.beginPath();
      for (let i = 0; i < N_PTS; i++) {
        const p0 = globPts[i];
        const p1 = globPts[(i + 1) % N_PTS];
        const mx = (p0.x + p1.x) * 0.5;
        const my = (p0.y + p1.y) * 0.5;
        if (i === 0) {
          const pPrev = globPts[N_PTS - 1];
          ctx.moveTo((pPrev.x + p0.x) * 0.5, (pPrev.y + p0.y) * 0.5);
        }
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      ctx.closePath();
    }

    // Outer lilac backlit edge aura directly hugging the wobbling mother droplet
    ctx.save();
    traceMotherGlobPath();
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
    ctx.lineWidth = 3.2 * scaleP;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Deep dark-purple body with glowing lilac Fresnel rim ramp toward edges!
    traceMotherGlobPath();
    const mGrad = ctx.createRadialGradient(
      scx - 1.6 * scaleP, scy - 1.8 * scaleP, baseRad * 0.14,
      scx, scy, baseRad * 1.12
    );
    mGrad.addColorStop(0.0, '#100321');
    mGrad.addColorStop(0.46, '#230945');
    mGrad.addColorStop(0.76, '#4c148c');
    mGrad.addColorStop(0.92, '#a855f7');
    mGrad.addColorStop(1.0, '#e9d5ff');
    ctx.fillStyle = mGrad;
    ctx.fill();

    // Crisp luminous lilac contour highlight around the entire edge
    ctx.strokeStyle = 'rgba(233, 213, 255, 0.90)';
    ctx.lineWidth = 0.95 * scaleP;
    ctx.stroke();

    // Subtle churning dark-lilac internal eddies inside the sticky Oblivion ink
    ctx.save();
    ctx.clip();
    for (let b = 0; b < 3; b++) {
      const ba = tSec * 1.7 * rotMult + b * 2.09;
      const bx = scx + Math.cos(ba) * 4.2 * scaleP;
      const by = scy + Math.sin(ba * 1.25) * 3.8 * scaleP;
      const bg = ctx.createRadialGradient(bx, by, 0.3, bx, by, 3.6 * scaleP);
      bg.addColorStop(0, 'rgba(168, 85, 247, 0.36)');
      bg.addColorStop(1, 'rgba(46, 16, 101, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, 3.6 * scaleP, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Glossy pale-lilac wet crescent highlight on upper-left shoulder
    ctx.fillStyle = 'rgba(245, 232, 255, 0.72)';
    ctx.beginPath();
    ctx.ellipse(scx - 4.3 * scaleP, scy - 4.5 * scaleP, 2.9 * scaleP, 1.15 * scaleP, -0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. Occasional yellow goat eye with horizontal black pupil peeking out of the dark-purple droplet!
    drawMysticismGoatEye(ctx, scx, scy, scaleP, tSec);

    // 6. Front-hemisphere sticky satellite droplets & Daedric alphabet particles emerging in front of droplet
    const frontDrops = dropSpecs.filter((ds) => !ds.isBack).sort((a, b) => a.z3 - b.z3);
    for (let i = 0; i < frontDrops.length; i++) drawSingleOblivionSatellite(frontDrops[i]);

    for (let i = 0; i < daedricParts.length; i++) {
      const dp = daedricParts[i];
      if (dp.isBack) continue;
      drawDaedricGlyph2D(ctx, dp.gIdx, dp.sx, dp.sy, dp.halfH, dp.rot, '#f3e8ff', 'rgba(192, 132, 252, 0.85)', dp.al);
    }

    // 7. Front-hemisphere black "Anti-Light" volumetric godrays (Triad only!) slicing across foreground lilac mist
    if (hasAntiLight) {
      drawMysticismTriadAntiLightGodrays(ctx, scx, scy, baseR, tSec, power, 'front', antiLightOccs);
    }
  }

  // --- MYSTICISM SPHERICAL OCCULT SYMBOL PROJECTIONS (5 Eerie Daedric / Occult Seals Projected onto 3D Sphere) ---
  function drawMysticismOccultSpherePattern(ctx, sphPt, symbolIdx, unfoldFrac, alpha, persp) {
    if (alpha <= 0.02 || unfoldFrac <= 0.04) return;
    const lwMain = Math.max(0.55, 0.92 * persp);
    const lwFine = Math.max(0.35, 0.56 * persp);
    const idx = ((symbolIdx % 5) + 5) % 5;

    function traceSphCircle(cx0, cy0, r, segs = 28) {
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const pt = sphPt(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r);
        if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
      }
    }
    function traceSphArc(cx0, cy0, r, a0, a1, segs = 16) {
      for (let s = 0; s <= segs; s++) {
        const a = lerp(a0, a1, s / segs);
        const pt = sphPt(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r);
        if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
      }
    }
    function traceSphLine(x0, y0, x1, y1, steps = 5) {
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const pt = sphPt(lerp(x0, x1, f), lerp(y0, y1, f));
        if (s === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
      }
    }
    function fillSphDaedricGlyph(gIdx, cx0, cy0, scale, rot, fillCol) {
      const g = DAEDRIC_GLYPHS[((gIdx % DAEDRIC_GLYPHS.length) + DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length];
      const cR = Math.cos(rot || 0), sR = Math.sin(rot || 0);
      ctx.fillStyle = fillCol;
      ctx.beginPath();
      for (let p = 0; p < g.polys.length; p++) {
        const poly = g.polys[p];
        for (let i = 0; i < poly.length; i++) {
          const lx = poly[i][0] * scale * 0.68;
          const ly = poly[i][1] * scale;
          const rx = cx0 + lx * cR - ly * sR;
          const ry = cy0 + lx * sR + ly * cR;
          const pt = sphPt(rx, ry);
          if (i === 0) ctx.moveTo(pt.sx, pt.sy); else ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    // 1. Translucent dark-violet occult veil disc projected on the sphere
    ctx.fillStyle = `rgba(34, 9, 68, ${(0.28 * alpha).toFixed(3)})`;
    ctx.beginPath();
    traceSphCircle(0, 0, 1.0, 28);
    ctx.closePath();
    ctx.fill();

    // 2. Muted purple outer bloom pass + crisp luminous lavender-lilac ink pass
    function strokeOccultInk(drawFn, width) {
      ctx.strokeStyle = `rgba(147, 51, 234, ${(0.42 * alpha).toFixed(3)})`;
      ctx.lineWidth = width * 2.4;
      ctx.beginPath();
      drawFn();
      ctx.stroke();

      ctx.strokeStyle = `rgba(233, 213, 255, ${(0.92 * alpha).toFixed(3)})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      drawFn();
      ctx.stroke();
    }

    // Common outer double occult ring
    strokeOccultInk(() => {
      traceSphCircle(0, 0, 1.0, 28);
      traceSphCircle(0, 0, 0.86, 24);
    }, lwMain);

    if (idx === 0) {
      // Seal 0: Iconic Oblivion Gate OHT Seal encircled by 8 Daedric perimeter sigils & twin crescent arcs
      strokeOccultInk(() => {
        traceSphCircle(0, 0, 0.62, 22);
        traceSphArc(-0.18, 0, 0.56, -Math.PI * 0.42, Math.PI * 0.42, 12);
        traceSphArc(0.18, 0, 0.56, Math.PI * 0.58, Math.PI * 1.42, 12);
      }, lwFine);
      fillSphDaedricGlyph(13, 0, 0, 0.46, 0, `rgba(233, 213, 255, ${(0.90 * alpha).toFixed(3)})`); // OHT!
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        fillSphDaedricGlyph((k * 3 + 1) % 24, Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0.11, a + Math.PI * 0.5, `rgba(216, 180, 254, ${(0.82 * alpha).toFixed(3)})`);
      }
    } else if (idx === 1) {
      // Seal 1: Inverted Occult Pentagram + Inner Goat-Slit Eye + 5 Daedric vertex markers
      strokeOccultInk(() => {
        const pts = [];
        for (let k = 0; k < 5; k++) {
          const a = Math.PI * 0.5 + (k * Math.PI * 2) / 5; // Pointing downward (inverted pentagram!)
          pts.push([Math.cos(a) * 0.84, Math.sin(a) * 0.84]);
        }
        for (let k = 0; k < 5; k++) {
          const pA = pts[k];
          const pB = pts[(k + 2) % 5];
          traceSphLine(pA[0], pA[1], pB[0], pB[1], 6);
        }
        traceSphCircle(0, 0, 0.30, 16);
        traceSphLine(-0.19, 0, 0.19, 0, 3);
      }, lwFine);
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * 0.5 + (k * Math.PI * 2) / 5;
        fillSphDaedricGlyph((k * 5 + 2) % 24, Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.085, a - Math.PI * 0.5, `rgba(233, 213, 255, ${(0.85 * alpha).toFixed(3)})`);
      }
    } else if (idx === 2) {
      // Seal 2: All-Seeing Goat Eye Occult Crest + Twin Polar Crescents & Cardinal Daggers
      strokeOccultInk(() => {
        traceSphCircle(0, 0, 0.66, 20);
        // Almond eye contour across center
        traceSphArc(0, 0.38, 0.64, -Math.PI * 0.78, -Math.PI * 0.22, 14);
        traceSphArc(0, -0.38, 0.64, Math.PI * 0.22, Math.PI * 0.78, 14);
        traceSphCircle(0, 0, 0.22, 14);
        // Polar occult crescents
        traceSphArc(0, -0.68, 0.18, 0.15, Math.PI - 0.15, 10);
        traceSphArc(0, 0.68, 0.18, Math.PI + 0.15, Math.PI * 2 - 0.15, 10);
        // Radiating ritual ticks
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          traceSphLine(Math.cos(a) * 0.66, Math.sin(a) * 0.66, Math.cos(a) * 0.84, Math.sin(a) * 0.84, 2);
        }
      }, lwFine);
      // Horizontal dark goat slit inside the projected occult eye
      ctx.fillStyle = `rgba(250, 204, 21, ${(0.62 * alpha).toFixed(3)})`;
      ctx.beginPath();
      traceSphCircle(0, 0, 0.19, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(12, 3, 24, ${(0.95 * alpha).toFixed(3)})`;
      ctx.beginPath();
      const sL = sphPt(-0.14, -0.045), sR = sphPt(0.14, -0.045), sBR = sphPt(0.14, 0.045), sBL = sphPt(-0.14, 0.045);
      ctx.moveTo(sL.sx, sL.sy); ctx.lineTo(sR.sx, sR.sy); ctx.lineTo(sBR.sx, sBR.sy); ctx.lineTo(sBL.sx, sBL.sy);
      ctx.closePath();
      ctx.fill();
    } else if (idx === 3) {
      // Seal 3: Tri-Crescent Oblivion Void Mandala + 6 Daedric Runes
      strokeOccultInk(() => {
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI * 2) / 3 - Math.PI * 0.5;
          const cx0 = Math.cos(a) * 0.34;
          const cy0 = Math.sin(a) * 0.34;
          traceSphCircle(cx0, cy0, 0.36, 18);
        }
        traceSphCircle(0, 0, 0.20, 12);
      }, lwFine);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        fillSphDaedricGlyph((k * 4 + 9) % 24, Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0.11, a + Math.PI * 0.5, `rgba(233, 213, 255, ${(0.84 * alpha).toFixed(3)})`);
      }
    } else {
      // Seal 4: Forbidden Grimoire Hexagram + Central Daedric QUAM Crest
      strokeOccultInk(() => {
        for (let tri = 0; tri < 2; tri++) {
          const baseA = tri * Math.PI / 3 - Math.PI * 0.5;
          for (let k = 0; k < 3; k++) {
            const a0 = baseA + (k * Math.PI * 2) / 3;
            const a1 = baseA + ((k + 1) * Math.PI * 2) / 3;
            traceSphLine(Math.cos(a0) * 0.84, Math.sin(a0) * 0.84, Math.cos(a1) * 0.84, Math.sin(a1) * 0.84, 6);
          }
        }
        traceSphCircle(0, 0, 0.44, 18);
      }, lwFine);
      fillSphDaedricGlyph(15, 0, 0, 0.34, 0, `rgba(233, 213, 255, ${(0.90 * alpha).toFixed(3)})`); // QUAM!
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        fillSphDaedricGlyph((k * 3 + 11) % 24, Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0.095, a + Math.PI * 0.5, `rgba(216, 180, 254, ${(0.80 * alpha).toFixed(3)})`);
      }
    }
  }

  // --- MYSTICISM SLOT 2 (WHEN SLOT 1 == MYSTICISM):
  //     Sticky Droplet Ejects -> Freezes -> Unfolds Spherical Occult Symbol (3.00s Hold!) -> Collapses -> Returns,
  //     with Vertical Matrix-Style Daedric Alphabet Garlands Raining from Droplets AND Sparingly from Projections! ---
  function drawMysticismSlot2Projections(ctx, cx, cy, baseR, tSec, power, projSpec, passPhase) {
    if (!projSpec) return;
    const scaleR = (baseR / 17.5) * clamp(0.88 + power * 0.16, 0.88, 1.06);
    const coreSurfR = 10.6 * scaleR;
    const sphereR = baseR * projSpec.sphereRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const states = computeMysticismProjectionStates(tSec, projSpec.maxSimultaneous);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    // Helper: evaluate droplet radial fraction at any localT so Matrix garlands anchor cleanly where the droplet dripped!
    function evalDropRadialAt(lt) {
      if (lt < 0.55) return 1 - Math.pow(1 - clamp(lt / 0.55, 0, 1), 2.4);
      if (lt < 4.70) return 1.0;
      const u = clamp((lt - 4.70) / 0.55, 0, 1);
      return 1 - u * u;
    }

    const items = [];
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      const isBack = st.n.z < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      items.push({ st, isBack });
    }
    items.sort((a, b) => a.st.n.z - b.st.n.z);

    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const { st, isBack } = items[i];
      const wn = st.n, wu = st.u, wv = st.v;
      const depthDim = isBack ? 0.52 : 1.0;
      const curR = lerp(coreSurfR, sphereR, st.radialFrac);
      const pCur = projWorldPoint(wn.x * curR, wn.y * curR, wn.z * curR, cx, cy);

      // 1. Viscous sticky purple-lilac liquid bridge connecting the ejecting/returning droplet to the central mother glob
      if (st.bridgeStrength > 0.04 && st.dropScale > 0.15) {
        const pSurf = projWorldPoint(wn.x * coreSurfR, wn.y * coreSurfR, wn.z * coreSurfR, cx, cy);
        const dx = pCur.sx - pSurf.sx, dy = pCur.sy - pSurf.sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const wA = 2.6 * st.bridgeStrength * scaleR * pSurf.persp;
        const wB = 1.05 * st.bridgeStrength * scaleR * pCur.persp;
        const mx = (pSurf.sx + pCur.sx) * 0.5;
        const my = (pSurf.sy + pCur.sy) * 0.5;
        ctx.fillStyle = isBack ? 'rgba(42, 11, 78, 0.72)' : 'rgba(59, 15, 108, 0.90)';
        ctx.beginPath();
        ctx.moveTo(pSurf.sx + nx * wA, pSurf.sy + ny * wA);
        ctx.quadraticCurveTo(mx + nx * wB * 0.3, my + ny * wB * 0.3, pCur.sx + nx * wB, pCur.sy + ny * wB);
        ctx.lineTo(pCur.sx - nx * wB, pCur.sy - ny * wB);
        ctx.quadraticCurveTo(mx - nx * wB * 0.3, my - ny * wB * 0.3, pSurf.sx - nx * wA, pSurf.sy - ny * wA);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isBack ? 'rgba(192, 132, 252, 0.35)' : 'rgba(216, 180, 254, 0.65)';
        ctx.lineWidth = 0.52 * pCur.persp;
        ctx.stroke();
      }

      // 2. Curved Spherical Occult Symbol Projection (unfolds -> holds 3.00s -> collapses!)
      let sphPtFn = null;
      if (st.unfoldFrac > 0.04) {
        const alphaMax = 0.54 * st.unfoldFrac;
        const cS = Math.cos(st.spinAngle), sS = Math.sin(st.spinAngle);
        const pCenter = projWorldPoint(wn.x * sphereR, wn.y * sphereR, wn.z * sphereR, cx, cy);

        sphPtFn = function sphPt(px, py) {
          const rx = px * cS - py * sS;
          const ry = px * sS + py * cS;
          const r = Math.hypot(rx, ry);
          const ang = r * alphaMax;
          const sinA = Math.sin(ang);
          const cosA = Math.cos(ang);
          const dirU = r > 1e-5 ? rx / r : 0;
          const dirV = r > 1e-5 ? ry / r : 0;
          const wx = sphereR * (wn.x * cosA + (wu.x * dirU + wv.x * dirV) * sinA);
          const wy = sphereR * (wn.y * cosA + (wu.y * dirU + wv.y * dirV) * sinA);
          const wz = sphereR * (wn.z * cosA + (wu.z * dirU + wv.z * dirV) * sinA);
          return projWorldPoint(wx, wy, wz, cx, cy);
        };

        const limbSoft = 0.48 + 0.52 * Math.abs(wn.z);
        const projAlpha = depthDim * limbSoft * clamp(0.45 + 0.55 * st.unfoldFrac, 0, 1);
        drawMysticismOccultSpherePattern(ctx, sphPtFn, st.symbolIdx, st.unfoldFrac, projAlpha, pCenter.persp);

        // Sparing Matrix-style Daedric garlands trickling vertically down from the active occult projection!
        if (st.unfoldFrac > 0.32) {
          const anchors = [
            [-0.46, 0.62],
            [0.0, 0.84],
            [0.46, 0.62],
          ];
          for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
            const gPeriod = 1.45 + aIdx * 0.31;
            const gStart = st.localT - 1.05 + hash01(st.seed + aIdx * 17) * gPeriod;
            if (gStart < 0) continue;
            const gCycle = Math.floor(gStart / gPeriod);
            const gElapsed = gStart - gCycle * gPeriod;
            const ap = sphPtFn(anchors[aIdx][0], anchors[aIdx][1]);
            drawDaedricMatrixGarland(
              ctx, ap.sx, ap.sy + 1.5 * ap.persp, gElapsed,
              st.seed * 19 + aIdx * 43 + gCycle * 71,
              ap.persp,
              depthDim * st.unfoldFrac * 0.82,
              { stepRate: 5.0, stepDy: 4.8, maxSteps: 6, trailLife: 4.2, glyphHalfH: 2.20 }
            );
          }
        }
      }

      // 3. Matrix-style vertical Daedric alphabet garlands raining down throughout the droplet's existence!
      //    (Droplet exists in eject [0..0.55], freeze [0.55..0.90], unfold [0.90..1.30] AND collapse [4.30..4.70], return [4.70..5.25]!)
      const dropWindows = [
        { t0: 0.06, t1: 1.35, id: 1 }, // Outbound droplet + fading tail right after unfold
        { t0: 4.32, t1: 5.25, id: 2 }, // Returning droplet after collapse
      ];
      for (let wIdx = 0; wIdx < dropWindows.length; wIdx++) {
        const win = dropWindows[wIdx];
        // Allow trailing faded letters up to 0.85s after droplet disappears so garlands finish fading smoothly!
        if (st.localT < win.t0 || st.localT > win.t1 + 0.85) continue;
        // 3 staggered vertical garland releases during the droplet's flight/freeze
        for (let g = 0; g < 3; g++) {
          const releaseT = win.t0 + g * 0.32 + hash01(st.seed + wIdx * 31 + g * 13) * 0.08;
          if (releaseT > win.t1 || st.localT < releaseT) continue;
          const elapsed = st.localT - releaseT;
          const rAtRelease = lerp(coreSurfR, sphereR, evalDropRadialAt(releaseT));
          const pRel = projWorldPoint(wn.x * rAtRelease, wn.y * rAtRelease, wn.z * rAtRelease, cx, cy);
          const xJitter = (g - 1) * 2.4 * pRel.persp;
          drawDaedricMatrixGarland(
            ctx, pRel.sx + xJitter, pRel.sy + 2.2 * pRel.persp, elapsed,
            st.seed * 29 + wIdx * 53 + g * 17,
            pRel.persp,
            depthDim * 0.96,
            { stepRate: 6.4, stepDy: 5.2, maxSteps: 8, trailLife: 5.2, glyphHalfH: 2.45 }
          );
        }
      }

      // 4. The sticky dark-purple lilac-rimmed droplet itself (during eject, freeze, unfold, collapse & return!)
      if (st.dropScale > 0.06) {
        const dropR = (3.45 * st.dropScale) * scaleR * pCur.persp;
        const moving = (st.phase === 'eject' || st.phase === 'return');
        const ang = moving ? Math.atan2(pCur.sy - cy, pCur.sx - cx) : 0;
        const stretch = moving ? 1.18 : (1.0 + 0.06 * Math.sin(tSec * 12 + st.seed));
        const squash = moving ? 0.85 : (1.0 - 0.06 * Math.sin(tSec * 12 + st.seed));
        drawWetOblivionDroplet(ctx, pCur.sx, pCur.sy, dropR * stretch, dropR * squash, ang, Math.max(0.55, dropR * 0.26), isBack, clamp(st.dropScale * 1.15, 0, 1));
      }
    }
    ctx.restore();
  }

  // --- MYSTICISM SLOT 2 (WHEN SLOT 1 != MYSTICISM):
  //     Orbiting Cloud of Deep-Purple/Lilac Droplets (Recolored Destruction-Poison Slot 2) +
  //     Appearing & Disappearing Daedric Alphabet Symbols Embedded Inside the Cloud! ---
  function drawMysticismSlot2DropCloud(ctx, cx, cy, baseR, tSec, power, cloudSpec, passPhase, activeCount = 1) {
    const ringSlotIdx = (cloudSpec && cloudSpec.ringSlotIdx) || 1;
    const basis = computeSlot2OrbitBasis(baseR, tSec, power, ringSlotIdx, activeCount);
    const scaleP = (baseR / 17.5) * clamp(0.88 + power * 0.14, 0.88, 1.04);
    const items = [];

    // 1. Deep purple-lilac misty cloud puffs forming the 3D tumbling orbital cloud torus
    const NUM_PUFFS = 28;
    for (let p = 0; p < NUM_PUFFS; p++) {
      const baseAngle = (p / NUM_PUFFS) * Math.PI * 2 + (hash01(p * 19 + 5) - 0.5) * 0.28;
      const rOff = (hash01(p * 29 + 11) - 0.5) * 8.4 * scaleP;
      const aOff = (hash01(p * 37 + 13) - 0.5) * 3.1 * scaleP + Math.sin(tSec * Math.sqrt(basis.spinMult) * 1.7 + p * 1.4) * 0.9 * scaleP;
      const puffSizeNorm = hash01(p * 43 + 3) * 0.55;
      const proj = computeInertialRingPiece({
        baseR, tSec, power, ringSlotIdx, activeCount,
        baseAngle, angRate: 0.30, radOff: rOff, axOff: aOff,
        sizeNorm: puffSizeNorm, pieceSeed: p * 19 + 709,
        pieceKey: `myst_pf_${ringSlotIdx}_${p}`,
        swingGain: 0.35, basisNow: basis,
      });
      const isBack = proj.z < 0;
      if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;
      items.push({ kind: 'puff', z: proj.z, p, sx: cx + proj.dx, sy: cy + proj.dy, persp: proj.persp, isBack });
    }

    // 2. Sticky dark-purple lilac-rimmed droplets circulating inside the orbital cloud
    const NUM_DROPS = 13;
    for (let i = 0; i < NUM_DROPS; i++) {
      const dropSizeNorm = Math.pow(hash01(i * 61 + 23), 1.15);
      const dropR = (1.20 + dropSizeNorm * 1.85) * scaleP;
      const baseAngle = (i / NUM_DROPS) * Math.PI * 2 + (hash01(i * 41 + 11) - 0.5) * 0.30;
      const rOff = (hash01(i * 47 + 7) - 0.5) * 6.0 * scaleP;
      const aOff = (hash01(i * 53 + 17) - 0.5) * 2.5 * scaleP + Math.cos(tSec * Math.sqrt(basis.spinMult) * 1.5 + i * 2.1) * 0.8 * scaleP;
      const proj = computeInertialRingPiece({
        baseR, tSec, power, ringSlotIdx, activeCount,
        baseAngle, angRate: 0.36, radOff: rOff, axOff: aOff,
        sizeNorm: dropSizeNorm, pieceSeed: i * 41 + 811,
        pieceKey: `myst_drp_${ringSlotIdx}_${i}`,
        swingGain: 1.0, basisNow: basis,
      });
      const isBack = proj.z < 0;
      if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;
      items.push({
        kind: 'drop', z: proj.z, i,
        sx: cx + proj.dx, sy: cy + proj.dy, persp: proj.persp, isBack,
        r: dropR, velAng: proj.velAng, speedRatio: proj.speedRatio,
      });
    }

    // 3. Daedric alphabet particles appearing & disappearing right inside the orbiting purple cloud!
    const NUM_RUNES = 16;
    for (let r = 0; r < NUM_RUNES; r++) {
      const period = 1.95 + hash01(r * 37 + 19) * 1.65;
      const raw = tSec / period + hash01(r * 53 + 7);
      const gen = Math.floor(raw);
      const life = raw - gen;
      const fade = Math.pow(Math.sin(life * Math.PI), 1.2);
      if (fade < 0.04) continue;
      const seed = gen * 97 + r * 31 + 13;
      const baseAngle = (r / NUM_RUNES) * Math.PI * 2 + hash01(seed + 1) * 0.55;
      const rOff = (hash01(seed + 2) - 0.5) * 6.6 * scaleP;
      const aOff = (hash01(seed + 3) - 0.5) * 2.8 * scaleP;
      const proj = computeInertialRingPiece({
        baseR, tSec, power, ringSlotIdx, activeCount,
        baseAngle, angRate: 0.28, radOff: rOff, axOff: aOff,
        sizeNorm: 0.45, pieceSeed: r * 29 + 919,
        pieceKey: `myst_rn_${ringSlotIdx}_${r}`,
        swingGain: 0.5, basisNow: basis,
      });
      const isBack = proj.z < 0;
      if ((passPhase === 'back' && !isBack) || (passPhase === 'front' && isBack)) continue;
      const gIdx = Math.floor(hash01(seed + 4) * DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length;
      items.push({
        kind: 'rune', z: proj.z,
        sx: cx + proj.dx, sy: cy + proj.dy, persp: proj.persp, isBack,
        gIdx,
        halfH: (2.1 + hash01(seed + 5) * 1.25) * scaleP * proj.persp * (0.76 + 0.24 * fade),
        rot: (hash01(seed + 6) - 0.5) * 0.36,
        al: fade * (isBack ? 0.55 : 0.94),
      });
    }

    if (items.length === 0) return;
    items.sort((a, b) => a.z - b.z);

    ctx.save();
    const mystPuffSp = getPuffRadialSprite('myst_puff');
    const baseMystA = ctx.globalAlpha;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'puff') {
        const vr = (5.6 + 2.6 * hash01(it.p * 43 + 3)) * it.persp * scaleP;
        const waveA = 0.22 + 0.07 * Math.sin(tSec * 2.2 + it.p * 1.9);
        const a = clamp(waveA * (it.isBack ? 0.64 : 1.0), 0.08, 0.32);
        if (mystPuffSp) {
          ctx.globalAlpha = baseMystA * a;
          ctx.drawImage(mystPuffSp, it.sx - vr, it.sy - vr, vr * 2, vr * 2);
          ctx.globalAlpha = baseMystA;
        } else {
          const pg = ctx.createRadialGradient(it.sx, it.sy, 0.3, it.sx, it.sy, vr);
          pg.addColorStop(0.0, `rgba(216, 180, 254, ${(a * 0.88).toFixed(3)})`);
          pg.addColorStop(0.48, `rgba(147, 51, 234, ${(a * 0.65).toFixed(3)})`);
          pg.addColorStop(1.0, 'rgba(46, 16, 101, 0)');
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(it.sx, it.sy, vr, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (it.kind === 'drop') {
        const appR = it.r * it.persp;
        const stretch = clamp(1.04 + ((it.speedRatio || 1) - 0.85) * 0.14, 1.02, 1.30);
        const squash = clamp(1.0 / Math.sqrt(stretch), 0.82, 0.98);
        drawWetOblivionDroplet(ctx, it.sx, it.sy, appR * stretch, appR * squash, it.velAng, Math.max(0.38, appR * 0.25), it.isBack);
      } else {
        drawDaedricGlyph2D(
          ctx, it.gIdx, it.sx, it.sy, it.halfH, it.rot,
          it.isBack ? '#c084fc' : '#f3e8ff',
          'rgba(168, 85, 247, 0.80)',
          it.al
        );
      }
    }
    ctx.restore();
  }

  // --- MYSTICISM SLOT 3 DAEDRIC 3D HOOP:
  //     - Triad (`frameless: true`): 3 pure-letter hoops made SOLELY of large filled curved 3D Daedric glyphs with muted bloom (NO rails/borders/frames!)
  //     - Non-Triad (`frameless: false`): 1 standard bordered 3D hoop with drawn top/bottom edges & random filled Daedric glyphs! ---
  function drawMysticismDaedricHoop(ctx, cx, cy, baseR, tSec, power, hoopSpec, passPhase) {
    if (!hoopSpec) return;
    const scaleH = (baseR / 17.5) * clamp(0.90 + power * 0.12, 0.90, 1.05);
    const R = baseR * hoopSpec.ringRMult * clamp(0.92 + power * 0.10, 0.92, 1.04);
    const hH = hoopSpec.bandHalfH * scaleH;
    const isFrameless = Boolean(hoopSpec.frameless);
    const glyphSeq = Array.isArray(hoopSpec.glyphSeq) && hoopSpec.glyphSeq.length > 0
      ? hoopSpec.glyphSeq
      : [0, 2, 5, 9, 11, 13, 15, 18, 20, 21, 1, 7];
    const COUNT = glyphSeq.length;
    const ang = computeMysticismHoopAngles(tSec, hoopSpec.speedMult, hoopSpec.seed);
    const isFrontPass = passPhase === 'front';
    const isBackPass = passPhase === 'back';

    const uAx = rotateIllusionVec(1, 0, 0, ang.rx, ang.ry, ang.rz);
    const vAx = rotateIllusionVec(0, 1, 0, ang.rx, ang.ry, ang.rz);
    const nAx = rotateIllusionVec(0, 0, 1, ang.rx, ang.ry, ang.rz);

    function toWorld(phi, zVal, rOff = 0) {
      const rr = R + rOff;
      const lx = rr * Math.cos(phi);
      const ly = rr * Math.sin(phi);
      const wx = uAx.x * lx + vAx.x * ly + nAx.x * zVal;
      const wy = uAx.y * lx + vAx.y * ly + nAx.y * zVal;
      const wz = uAx.z * lx + vAx.z * ly + nAx.z * zVal;
      return projWorldPoint(wx, wy, wz, cx, cy);
    }

    const dPhi = (Math.PI * 2) / COUNT;
    const slots = [];
    for (let k = 0; k < COUNT; k++) {
      const phi0 = ang.spin + k * dPhi;
      const phi1 = phi0 + dPhi;
      const phiM = (phi0 + phi1) * 0.5;
      const midPt = toWorld(phiM, 0, 0);
      const isBack = midPt.wz < 0;
      if ((isBackPass && !isBack) || (isFrontPass && isBack)) continue;
      const radZ = Math.abs(uAx.z * Math.cos(phiM) + vAx.z * Math.sin(phiM));
      slots.push({
        k, phi0, phi1, phiM,
        wz: midPt.wz,
        sx: midPt.sx, sy: midPt.sy, persp: midPt.persp,
        isBack, radZ,
        gIdx: glyphSeq[k],
      });
    }
    slots.sort((a, b) => a.wz - b.wz);

    ctx.save();
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      const dim = p.isBack ? 0.44 : 1.0;
      const al = dim * (0.46 + 0.54 * p.radZ);

      // 1. Standard bordered hoop band & drawn top/bottom edges (ONLY when frameless === false!)
      if (!isFrameless) {
        const cTL = toWorld(p.phi0, hH), cTM = toWorld(p.phiM, hH), cTR = toWorld(p.phi1, hH);
        const cBL = toWorld(p.phi0, -hH), cBM = toWorld(p.phiM, -hH), cBR = toWorld(p.phi1, -hH);

        // Translucent deep-purple hoop body strip
        ctx.fillStyle = `rgba(38, 12, 78, ${(0.38 * al).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(cTL.sx, cTL.sy);
        ctx.lineTo(cTM.sx, cTM.sy);
        ctx.lineTo(cTR.sx, cTR.sy);
        ctx.lineTo(cBR.sx, cBR.sy);
        ctx.lineTo(cBM.sx, cBM.sy);
        ctx.lineTo(cBL.sx, cBL.sy);
        ctx.closePath();
        ctx.fill();

        // Drawn outer top & bottom borders (with soft lilac bevel lines just like standard hoops!)
        const lwEdge = Math.max(0.55, 0.92 * p.persp);
        ctx.strokeStyle = `rgba(147, 51, 234, ${(0.36 * al).toFixed(3)})`;
        ctx.lineWidth = lwEdge * 2.2;
        ctx.beginPath();
        ctx.moveTo(cTL.sx, cTL.sy); ctx.lineTo(cTM.sx, cTM.sy); ctx.lineTo(cTR.sx, cTR.sy);
        ctx.moveTo(cBL.sx, cBL.sy); ctx.lineTo(cBM.sx, cBM.sy); ctx.lineTo(cBR.sx, cBR.sy);
        ctx.stroke();

        ctx.strokeStyle = `rgba(216, 180, 254, ${(0.88 * al).toFixed(3)})`;
        ctx.lineWidth = lwEdge;
        ctx.beginPath();
        ctx.moveTo(cTL.sx, cTL.sy); ctx.lineTo(cTM.sx, cTM.sy); ctx.lineTo(cTR.sx, cTR.sy);
        ctx.moveTo(cBL.sx, cBL.sy); ctx.lineTo(cBM.sx, cBM.sy); ctx.lineTo(cBR.sx, cBR.sy);
        ctx.stroke();

        // Thin inner framing lines & tiny divider rivet at segment seam
        const inH = hH * 0.80;
        const iTL = toWorld(p.phi0, inH), iTM = toWorld(p.phiM, inH), iTR = toWorld(p.phi1, inH);
        const iBL = toWorld(p.phi0, -inH), iBM = toWorld(p.phiM, -inH), iBR = toWorld(p.phi1, -inH);
        ctx.strokeStyle = `rgba(192, 132, 252, ${(0.42 * al).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.32, 0.48 * p.persp);
        ctx.beginPath();
        ctx.moveTo(iTL.sx, iTL.sy); ctx.lineTo(iTM.sx, iTM.sy); ctx.lineTo(iTR.sx, iTR.sy);
        ctx.moveTo(iBL.sx, iBL.sy); ctx.lineTo(iBM.sx, iBM.sy); ctx.lineTo(iBR.sx, iBR.sy);
        ctx.stroke();

        const seamPt = toWorld(p.phi0, 0);
        ctx.fillStyle = `rgba(216, 180, 254, ${(0.62 * al).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(seamPt.sx, seamPt.sy, Math.max(0.45, 0.68 * p.persp), 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Curved 3D Filled Daedric Letter wrapped directly around the cylinder!
      const glyph = DAEDRIC_GLYPHS[((p.gIdx % DAEDRIC_GLYPHS.length) + DAEDRIC_GLYPHS.length) % DAEDRIC_GLYPHS.length];
      const glyphHalfH = isFrameless ? (hH * 0.98) : (hH * 0.68);
      const naturalHalfPhi = (glyphHalfH * 0.66) / Math.max(12, R);
      const glyphHalfPhi = Math.min(dPhi * (isFrameless ? 0.43 : 0.36), Math.max(dPhi * 0.24, naturalHalfPhi));

      function traceCurvedDaedricPath() {
        ctx.beginPath();
        for (let polyIdx = 0; polyIdx < glyph.polys.length; polyIdx++) {
          const poly = glyph.polys[polyIdx];
          for (let vi = 0; vi < poly.length; vi++) {
            const v0 = poly[vi];
            const v1 = poly[(vi + 1) % poly.length];
            const p0 = toWorld(p.phiM + v0[0] * glyphHalfPhi, -v0[1] * glyphHalfH);
            if (vi === 0) ctx.moveTo(p0.sx, p0.sy); else ctx.lineTo(p0.sx, p0.sy);
            // Midpoint subdivision along cylinder curvature so wide letters bend smoothly in 3D!
            if (Math.abs(v1[0] - v0[0]) > 0.38) {
              const pm = toWorld(p.phiM + (v0[0] + v1[0]) * 0.5 * glyphHalfPhi, -(v0[1] + v1[1]) * 0.5 * glyphHalfH);
              ctx.lineTo(pm.sx, pm.sy);
            }
          }
          ctx.closePath();
        }
      }

      // Soft muted lilac-violet bloom halo behind every filled Daedric letter (pre-baked sprite!)
      const bloomR = glyphHalfH * (isFrameless ? 1.48 : 1.18) * p.persp;
      const hoopBlSp = getPuffRadialSprite('myst_hoop_bloom');
      if (hoopBlSp) {
        ctx.globalAlpha = clamp((isFrameless ? 0.26 : 0.18) * al, 0, 1);
        ctx.drawImage(hoopBlSp, p.sx - bloomR, p.sy - bloomR, bloomR * 2, bloomR * 2);
        ctx.globalAlpha = 1;
      } else {
        const bg = ctx.createRadialGradient(p.sx, p.sy, glyphHalfH * 0.14 * p.persp, p.sx, p.sy, bloomR);
        bg.addColorStop(0.0, `rgba(192, 132, 252, ${((isFrameless ? 0.26 : 0.18) * al).toFixed(3)})`);
        bg.addColorStop(0.55, `rgba(147, 51, 234, ${((isFrameless ? 0.12 : 0.08) * al).toFixed(3)})`);
        bg.addColorStop(1.0, 'rgba(88, 28, 135, 0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, bloomR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trace curved 3D Daedric glyph ONCE and reuse path for bloom stroke, evenodd fill & serif contour!
      traceCurvedDaedricPath();
      ctx.strokeStyle = `rgba(168, 85, 247, ${((isFrameless ? 0.34 : 0.26) * al).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.2, (isFrameless ? 2.6 : 1.8) * p.persp);
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.fillStyle = p.isBack
        ? `rgba(168, 118, 232, ${(0.72 * al).toFixed(3)})`
        : `rgba(224, 194, 255, ${(0.92 * al).toFixed(3)})`;
      ctx.fill('evenodd');

      // Subtle deep-lilac sculptural contour so calligraphic serifs remain ultra-crisp against mist & overlapping hoops
      ctx.strokeStyle = p.isBack
        ? `rgba(76, 29, 149, ${(0.45 * al).toFixed(3)})`
        : `rgba(126, 34, 206, ${(0.52 * al).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.32, 0.52 * p.persp);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSchoolModule(ctx, school, layerIdx, cx, cy, baseR, tSec, power, shockFrameArg, extraOpts) {
    const id = school.id;
    const activeCount = (extraOpts && extraOpts.activeCount) || 1;
    const rotT = tSec * getGlobalRotMult(activeCount);
    const pScale = clamp(0.68 + power * 0.40, 0.68, 1.08);
    ctx.save();
    ctx.globalAlpha = clamp(0.65 + power * 0.35, 0.65, 1.0);

    if (id === 22) {
      if (layerIdx === 0) {
        const capArg = (extraOpts && (extraOpts.poisonCapture !== undefined ? extraOpts.poisonCapture : extraOpts.isDoublePoison)) || null;
        drawDestructionSlot1Core(ctx, school, cx, cy, baseR, tSec, power, shockFrameArg, capArg, activeCount);
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const ringSlotIdx = (extraOpts && extraOpts.ringSlotIdx) || (layerIdx === 2 ? 2 : 1);
        drawDestructionSlot2Orbit(ctx, school, cx, cy, baseR, tSec, power, passPhase, shockFrameArg, ringSlotIdx, activeCount);
      }
    } else if (id === 23) {
      ctx.globalAlpha = 1.0;
      const occluders = (extraOpts && extraOpts.occluders) || null;
      if (layerIdx === 0) {
        drawRestorationSlot1Core(ctx, cx, cy, baseR, tSec, power, getGlobalRotMult(activeCount), occluders);
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const hoopSpec = (extraOpts && extraOpts.hoopSpec) || computeRestorationConfig({
          slots: [null, layerIdx === 1 ? school : null, layerIdx === 2 ? school : null],
        })[layerIdx === 2 ? 'slot3' : 'slot2'];
        drawRestorationHoopBand(ctx, cx, cy, baseR, tSec, power, hoopSpec, passPhase, occluders);
      }
    } else if (id === 24) {
      ctx.globalAlpha = 1.0;
      if (layerIdx === 0) {
        drawIllusionSlot1Crystal(
          ctx, cx, cy, baseR, tSec, power,
          Boolean(extraOpts && extraOpts.triadGodrays),
          (extraOpts && extraOpts.illusionPolyOccs) || null
        );
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const shellSpec = (extraOpts && extraOpts.illusionShell) || computeIllusionConfig({
          slots: [null, layerIdx === 1 ? school : null, layerIdx === 2 ? school : null],
        })[layerIdx === 2 ? 'slot3' : 'slot2'];
        if (shellSpec && shellSpec.kind === 'dual_hoops' && shellSpec.hoops) {
          // Layer 3 manifestation when Slot 1 != Illusion & Slot 2 == Illusion:
          // Render BOTH polygonal hoops outside Slot 2's icosahedron in proper depth order!
          const [hInner, hOuter] = shellSpec.hoops;
          if (passPhase === 'back') {
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hOuter, 'back');
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hInner, 'back');
          } else if (passPhase === 'front') {
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hInner, 'front');
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hOuter, 'front');
          } else {
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hOuter, 'back');
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hInner, 'back');
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hInner, 'front');
            drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, hOuter, 'front');
          }
        } else if (shellSpec) {
          drawIllusionPolyhedralShell(ctx, cx, cy, baseR, tSec, power, shellSpec, passPhase);
        }
      }
    } else if (id === 25) {
      ctx.globalAlpha = 1.0;
      if (layerIdx === 0) {
        drawAlterationSlot1EarthCrystal(
          ctx, cx, cy, baseR, tSec, power,
          Boolean(extraOpts && extraOpts.altTriadGodrays),
          (extraOpts && extraOpts.altTriadOccs) || null
        );
      } else if (layerIdx === 1) {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const rings = (extraOpts && extraOpts.altSlot2Rings) || computeAlterationConfig({ slots: [null, school, null] }).slot2Rings;
        if (rings && rings.length > 0) {
          if (passPhase === 'back') {
            for (let i = rings.length - 1; i >= 0; i--) {
              drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, rings[i], 'back');
            }
          } else if (passPhase === 'front') {
            for (let i = 0; i < rings.length; i++) {
              drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, rings[i], 'front');
            }
          } else {
            for (let i = rings.length - 1; i >= 0; i--) drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, rings[i], 'back');
            for (let i = 0; i < rings.length; i++) drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, rings[i], 'front');
          }
        }
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const layerSpec = (extraOpts && extraOpts.altSlot3Layer) || computeAlterationConfig({ slots: [null, null, school] }).slot3Layer;
        if (layerSpec && layerSpec.kind === 'spine_cage') {
          drawAlterationSpineCage(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase);
        } else if (layerSpec) {
          drawAlterationCarapaceRing(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase);
        }
      }
    } else if (id === 26) {
      ctx.globalAlpha = 1.0;
      if (layerIdx === 0) {
        drawThaumaturgySlot1Dodecahedron(
          ctx, cx, cy, baseR, tSec, power,
          Boolean(extraOpts && extraOpts.thaumTriadGodrays),
          (extraOpts && extraOpts.thaumTriadOccs) || null
        );
      } else if (layerIdx === 1) {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const layerSpec = (extraOpts && extraOpts.thaumSlot2Layer) || computeThaumaturgyConfig({ slots: [null, school, null] }).slot2Layer;
        if (layerSpec && layerSpec.kind === 'sphere_projections') {
          drawThaumaturgySphereProjections(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase);
        } else if (layerSpec) {
          drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase);
        }
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const layers = (extraOpts && extraOpts.thaumSlot3Layers) || computeThaumaturgyConfig({ slots: [null, null, school] }).slot3Layers;
        if (layers && layers.length > 0) {
          if (passPhase === 'back') {
            for (let i = layers.length - 1; i >= 0; i--) {
              drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'back');
            }
          } else if (passPhase === 'front') {
            for (let i = 0; i < layers.length; i++) {
              drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'front');
            }
          } else {
            for (let i = layers.length - 1; i >= 0; i--) drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'back');
            for (let i = 0; i < layers.length; i++) drawThaumaturgySchematicHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'front');
          }
        }
      }
    } else if (id === 27) {
      ctx.globalAlpha = 1.0;
      if (layerIdx === 0) {
        drawMysticismSlot1DropCore(
          ctx, cx, cy, baseR, tSec, power,
          getGlobalRotMult(activeCount),
          (extraOpts && extraOpts.mystMistGain) || 1.0,
          Boolean(extraOpts && extraOpts.mystAntiLight),
          (extraOpts && extraOpts.mystTriadOccs) || null
        );
      } else if (layerIdx === 1) {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const layerSpec = (extraOpts && extraOpts.mystSlot2Layer) || computeMysticismConfig({ slots: [null, school, null] }).slot2Layer;
        if (layerSpec && layerSpec.kind === 'occult_projections') {
          drawMysticismSlot2Projections(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase);
        } else if (layerSpec) {
          drawMysticismSlot2DropCloud(ctx, cx, cy, baseR, tSec, power, layerSpec, passPhase, activeCount);
        }
      } else {
        const passPhase = (extraOpts && extraOpts.passPhase) || 'all';
        const layers = (extraOpts && extraOpts.mystSlot3Layers) || computeMysticismConfig({ slots: [null, null, school] }).slot3Layers;
        if (layers && layers.length > 0) {
          if (passPhase === 'back') {
            for (let i = layers.length - 1; i >= 0; i--) {
              drawMysticismDaedricHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'back');
            }
          } else if (passPhase === 'front') {
            for (let i = 0; i < layers.length; i++) {
              drawMysticismDaedricHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'front');
            }
          } else {
            for (let i = layers.length - 1; i >= 0; i--) drawMysticismDaedricHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'back');
            for (let i = 0; i < layers.length; i++) drawMysticismDaedricHoop(ctx, cx, cy, baseR, tSec, power, layers[i], 'front');
          }
        }
      }
    }

    ctx.restore();
  }

  function drawModularSpellManifestation(ctx, W, H, tSec, analysis, shockFrameArg) {
    const cx = W * 0.5;
    const cy = 125 + Math.sin(tSec * 1.8) * 2.2;
    const baseR = 17.5;
    const prof = analysis.powerProfile;

    if (analysis.activeCount === 0) {
      // Dark dormant chamber: tiny quiet dust motes floating barely visible above closed spell slot
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const frac = (tSec * 0.25 + i * 0.33) % 1;
        const mx = cx + Math.sin(tSec * 1.1 + i * 2.0) * 10;
        const my = 186 - frac * 46;
        const al = Math.sin(frac * Math.PI) * 0.16;
        ctx.fillStyle = `rgba(160, 174, 198, ${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(mx, my, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // Scaled primary luminous aura by active effect count (for Shock, wildly flickers & jerks with long erupting bolts)
    const auraSchool = analysis.slot1School || analysis.active[0].school;
    const lightMod = getSlot1LightProfile(analysis);
    const shockFrame = shockFrameArg !== undefined ? shockFrameArg : resolveShockFrame(analysis, tSec);
    const sFlash = shockFrame ? shockFrame.strikeFlash : 0;
    const baseAuraR = prof.auraR * (lightMod.spellGlowMult < 1 ? 0.84 : (lightMod.spellGlowMult > 1 ? 1.10 : 1.0));
    const auraR = shockFrame ? baseAuraR * (0.82 + sFlash * 0.56) : baseAuraR;
    const baseAuraAlpha = clamp(prof.auraAlpha * lightMod.spellGlowMult, 0, 0.95);
    const auraAlpha = shockFrame ? clamp(baseAuraAlpha * (0.76 + sFlash * 0.68), 0.10, 0.58) : baseAuraAlpha;
    const auraCx = shockFrame ? (cx + shockFrame.jitterX * 0.38) : cx;
    const auraCy = shockFrame ? (cy + shockFrame.jitterY * 0.38) : cy;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const auraGrad = ctx.createRadialGradient(auraCx, auraCy, 1, auraCx, auraCy, auraR);
    auraGrad.addColorStop(0, `rgba(${auraSchool.glowRgb}, ${auraAlpha.toFixed(3)})`);
    auraGrad.addColorStop(0.45, `rgba(${auraSchool.accentRgb}, ${(auraAlpha * 0.42).toFixed(3)})`);
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(auraCx, auraCy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // Directional strobe halo whipping out toward erupting long forked lightning bolts
    if (shockFrame && shockFrame.hasLongStrike) {
      const fx = cx + shockFrame.centroidX * 12 + shockFrame.jitterX * 0.45;
      const fy = cy + shockFrame.centroidY * 12 + shockFrame.jitterY * 0.45;
      const fr = 14 + sFlash * 20;
      const fGrad = ctx.createRadialGradient(fx, fy, 1, fx, fy, fr);
      fGrad.addColorStop(0, `rgba(224, 244, 255, ${clamp(sFlash * 0.16, 0, 0.22).toFixed(3)})`);
      fGrad.addColorStop(0.5, `rgba(125, 198, 255, ${clamp(sFlash * 0.08, 0, 0.12).toFixed(3)})`);
      fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const s0 = analysis.slots[0];
    const s1 = analysis.slots[1];
    const s2 = analysis.slots[2];
    const is3dRingSlot2 = Boolean(s1 && (s1.id === 22 || s1.id === 23 || s1.id === 24 || s1.id === 25 || s1.id === 26 || s1.id === 27));
    const is3dRingSlot3 = Boolean(s2 && (s2.id === 22 || s2.id === 23 || s2.id === 24 || s2.id === 25 || s2.id === 26 || s2.id === 27));
    const restoCfg = computeRestorationConfig(analysis);
    const illusionCfg = computeIllusionConfig(analysis);
    const altCfg = computeAlterationConfig(analysis);
    const thaumCfg = computeThaumaturgyConfig(analysis);
    const mystCfg = computeMysticismConfig(analysis);
    const illusionSlot2Shell = illusionCfg.slot2;
    const illusionSlot3Shell = illusionCfg.slot3;
    const illusionPolyOccs = illusionCfg.hasTriadGodrays ? buildIllusionLitPolyOccluders(illusionCfg, baseR, tSec, prof.power) : null;
    const altTriadOccs = altCfg.hasTriadGodrays ? buildAlterationTriadOccluders(altCfg, baseR, tSec, prof.power) : null;
    const thaumTriadOccs = thaumCfg.hasTriadGodrays ? buildThaumaturgyTriadOccluders(thaumCfg, baseR, tSec, prof.power) : null;
    const mystTriadOccs = mystCfg.hasAntiLightGodrays ? buildMysticismTriadOccluders(mystCfg, baseR, tSec, prof.power) : null;
    const hasAnyResto = Boolean(restoCfg.r0 || restoCfg.r1 || restoCfg.r2);
    const godrayOccluders = hasAnyResto ? buildSpellGodrayOccluders(analysis, restoCfg, baseR, tSec, prof.power) : null;
    const poisonCapture = (s0 && s0.id === 22 && s0.elementKey === 'poison' && (
      (s1 && s1.id === 22 && s1.elementKey === 'poison') ||
      (s2 && s2.id === 22 && s2.elementKey === 'poison')
    )) ? {
      ring2: Boolean(s1 && s1.id === 22 && s1.elementKey === 'poison'),
      ring3: Boolean(s2 && s2.id === 22 && s2.elementKey === 'poison'),
      activeCount: analysis.activeCount,
    } : null;

    if (is3dRingSlot3) {
      // Back hemisphere of outer Slot 3 orbital ring / Restoration hoop / Illusion shell / Alteration cage / Thaumaturgy hoops / Mysticism Daedric hoops
      drawSchoolModule(ctx, s2, 2, cx, cy, baseR, tSec, prof.power, shockFrame, {
        passPhase: 'back',
        ringSlotIdx: 2,
        activeCount: analysis.activeCount,
        hoopSpec: s2.id === 23 ? restoCfg.slot3 : null,
        illusionShell: s2.id === 24 ? illusionSlot3Shell : null,
        altSlot3Layer: s2.id === 25 ? altCfg.slot3Layer : null,
        thaumSlot3Layers: s2.id === 26 ? thaumCfg.slot3Layers : null,
        mystSlot3Layers: s2.id === 27 ? mystCfg.slot3Layers : null,
        occluders: godrayOccluders,
      });
    } else if (s2) {
      drawSchoolModule(ctx, s2, 2, cx, cy, baseR, tSec, prof.power, shockFrame, { activeCount: analysis.activeCount });
    }

    if (restoCfg.middle) {
      // Back hemisphere of middle Restoration hoop (spawned between Slot 2 & Slot 3 when all 3 effects are Restoration)
      drawRestorationHoopBand(ctx, cx, cy, baseR, tSec, prof.power, restoCfg.middle, 'back', godrayOccluders);
    }

    if (is3dRingSlot2) {
      // Back hemisphere of Slot 2 orbital ring / Restoration hoop / Illusion shell / Alteration ring(s) / Thaumaturgy / Mysticism projections or cloud
      drawSchoolModule(ctx, s1, 1, cx, cy, baseR, tSec, prof.power, shockFrame, {
        passPhase: 'back',
        ringSlotIdx: 1,
        activeCount: analysis.activeCount,
        hoopSpec: s1.id === 23 ? restoCfg.slot2 : null,
        illusionShell: s1.id === 24 ? illusionSlot2Shell : null,
        altSlot2Rings: s1.id === 25 ? altCfg.slot2Rings : null,
        thaumSlot2Layer: s1.id === 26 ? thaumCfg.slot2Layer : null,
        mystSlot2Layer: s1.id === 27 ? mystCfg.slot2Layer : null,
        occluders: godrayOccluders,
      });
    } else if (s1) {
      drawSchoolModule(ctx, s1, 1, cx, cy, baseR, tSec, prof.power, shockFrame, { activeCount: analysis.activeCount });
    }

    if (s0) {
      drawSchoolModule(ctx, s0, 0, cx, cy, baseR, tSec, prof.power, shockFrame, {
        poisonCapture,
        activeCount: analysis.activeCount,
        occluders: godrayOccluders,
        triadGodrays: illusionCfg.hasTriadGodrays,
        illusionPolyOccs,
        altTriadGodrays: altCfg.hasTriadGodrays,
        altTriadOccs,
        thaumTriadGodrays: thaumCfg.hasTriadGodrays,
        thaumTriadOccs,
        mystMistGain: mystCfg.mistGain,
        mystAntiLight: mystCfg.hasAntiLightGodrays,
        mystTriadOccs,
      });
    }

    if (is3dRingSlot2) {
      // Front hemisphere of Slot 2 orbital ring / Restoration hoop / Illusion shell / Alteration ring(s) / Thaumaturgy / Mysticism projections or cloud
      drawSchoolModule(ctx, s1, 1, cx, cy, baseR, tSec, prof.power, shockFrame, {
        passPhase: 'front',
        ringSlotIdx: 1,
        activeCount: analysis.activeCount,
        hoopSpec: s1.id === 23 ? restoCfg.slot2 : null,
        illusionShell: s1.id === 24 ? illusionSlot2Shell : null,
        altSlot2Rings: s1.id === 25 ? altCfg.slot2Rings : null,
        thaumSlot2Layer: s1.id === 26 ? thaumCfg.slot2Layer : null,
        mystSlot2Layer: s1.id === 27 ? mystCfg.slot2Layer : null,
        occluders: godrayOccluders,
      });
    }

    if (restoCfg.middle) {
      // Front hemisphere of middle Restoration hoop sweeps cleanly between Slot 2 & Slot 3 hoops
      drawRestorationHoopBand(ctx, cx, cy, baseR, tSec, prof.power, restoCfg.middle, 'front', godrayOccluders);
    }

    if (is3dRingSlot3) {
      // Front hemisphere of outer Slot 3 orbital ring / Restoration hoop / Illusion shell / Alteration cage / Thaumaturgy hoops / Mysticism Daedric hoops
      drawSchoolModule(ctx, s2, 2, cx, cy, baseR, tSec, prof.power, shockFrame, {
        passPhase: 'front',
        ringSlotIdx: 2,
        activeCount: analysis.activeCount,
        hoopSpec: s2.id === 23 ? restoCfg.slot3 : null,
        illusionShell: s2.id === 24 ? illusionSlot3Shell : null,
        altSlot3Layer: s2.id === 25 ? altCfg.slot3Layer : null,
        thaumSlot3Layers: s2.id === 26 ? thaumCfg.slot3Layers : null,
        mystSlot3Layers: s2.id === 27 ? mystCfg.slot3Layers : null,
        occluders: godrayOccluders,
      });
    }

    // Incandescent core glint scaling cleanly for 2 and especially 3 active effects
    // (Skip harsh white dot on Restoration, Illusion, Alteration, Thaumaturgy & Mysticism Slot 1 so their custom 3D centers remain crisp!)
    if (prof.sparkle > 0.35 && !(s0 && (s0.id === 23 || s0.id === 24 || s0.id === 25 || s0.id === 26 || s0.id === 27))) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const starR = 4.5 + prof.sparkle * 5.0;
      const gCore = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, starR);
      gCore.addColorStop(0, `rgba(255, 255, 255, ${(prof.sparkle * 0.65).toFixed(2)})`);
      gCore.addColorStop(0.5, `rgba(${auraSchool.glowRgb}, ${(prof.sparkle * 0.30).toFixed(2)})`);
      gCore.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gCore;
      ctx.beginPath();
      ctx.arc(cx, cy, starR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Main scene render pipeline with genuine dark-room lighting mask
  function renderScene(ctx, width, height, state = {}) {
    const W = Number(width) || DEFAULT_WIDTH;
    const H = Number(height) || DEFAULT_HEIGHT;
    const tSec = Number.isFinite(state.tSec) ? state.tSec : 0;
    const flipSnapshot = state.flipSnapshot || { inBurst: false, pageSeed: 0, leaves: [] };
    const analysis = state.analysis || analyzeSlots(state.slots, state.candlePairs);
    const spellTint = analysis.slot1School || (analysis.activeCount > 0 ? analysis.active[0].school : null);
    const spreadPair = resolveBookSpread(flipSnapshot, state);
    const openAmount = Number.isFinite(state.openAmount) ? state.openAmount : (analysis.activeCount > 0 ? 1 : 0);
    const shockFrame = resolveShockFrame(analysis, tSec);

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, W, H);
    }

    // === Layer Pass 1: Physical Chamber Materials (unlit/diffuse base + Shock wall/tapestry strobe relief) ===
    const cachedWall = getStaticWall(W, H);
    if (cachedWall) {
      ctx.drawImage(cachedWall, 0, 0);
    } else {
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(0, 0, W, H);
    }

    if (shockFrame) {
      drawShockBrickRelief(ctx, W, H, tSec, shockFrame);
    }
    drawAetheriusTapestry(ctx, W, H, tSec);
    drawRestorationWallShadows(ctx, W, H, tSec, analysis);
    if (shockFrame) {
      drawShockTapestryFlash(ctx, W, H, tSec, shockFrame);
    }
    drawStonePedestalAndCloth(ctx, W, H);
    const candleGeoms = CANDLE_LAYOUT.map((spec) => computeCandleGeometry(spec, tSec));
    drawRestorationAltarShadows(ctx, W, H, tSec, analysis, candleGeoms, openAmount);
    drawPedestalLedgerBook(ctx, W, H, tSec, flipSnapshot, spellTint, spreadPair, state, openAmount);

    const cachedCandles = getStaticCandleBodiesCanvas(W, H);
    if (cachedCandles) {
      ctx.drawImage(cachedCandles, 0, 0);
      ctx.strokeStyle = '#141210';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
        const sp = CANDLE_LAYOUT[i];
        const g = candleGeoms[i];
        ctx.moveTo(sp.x, sp.y + g.wickBaseY);
        ctx.lineTo(sp.x + g.sway * 0.25, sp.y + g.wickTopY);
      }
      ctx.stroke();
    } else {
      for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
        drawSingleCandleBody(ctx, CANDLE_LAYOUT[i], candleGeoms[i]);
      }
    }
    drawRestorationCandleRimShadows(ctx, W, H, tSec, analysis, candleGeoms);

    // === Layer Pass 2: Dark Chamber Shadow + Exclusive Light Carving (6 minor candles + primary spell) ===
    applyChamberLightingPass(ctx, W, H, tSec, analysis, candleGeoms, shockFrame);

    // === Layer Pass 3: Self-Luminous Emitters Above Darkness ===
    for (let i = 0; i < CANDLE_LAYOUT.length; i++) {
      const cAssign = analysis.candleAssignments && analysis.candleAssignments[i];
      const cSchool = cAssign ? cAssign.school : null;
      drawSingleCandleFlame(ctx, CANDLE_LAYOUT[i], candleGeoms[i], tSec, cSchool);
    }
    drawModularSpellManifestation(ctx, W, H, tSec, analysis, shockFrame);

    // === Layer Pass 4: Restoration Slot 1 Gentle Golden Screen Overexposure Veil ===
    drawRestorationScreenVeil(ctx, W, H, tSec, analysis);

    return { analysis, spreadPair };
  }

  const exported = {
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    SCHOOLS,
    SCHOOL_ORDER,
    DESTRUCTION_ELEMENTS,
    DESTRUCTION_ELEMENT_ORDER,
    SPELL_POWER_PROFILE,
    CANDLE_LAYOUT,
    SESSION_CANDLE_PAIR_BY_SLOT,
    createShuffledCandlePairs,
    getSessionCandlePairs: () => SESSION_CANDLE_PAIR_BY_SLOT.map((p) => p.slice()),
    BOOK_OCCULT_TEMPLATES,
    BOOK_TEXT_TEMPLATES,
    ALL_PAGE_TEMPLATES,
    BOOK_SPREAD_PRESETS,
    analyzeSlots,
    resolveBookSpread,
    createController,
    renderScene,
    getSchoolMeta,
    getElementMeta,
    getSlotResolvedMeta,
    getGlobalRotMult,
    computeShockStrikeFrame,
    computeSlot2OrbitBasis,
    computeInertialRingPiece,
    resetInertialRingCache,
    computeRestorationConfig,
    computeRestorationHoopTransform,
    buildSpellGodrayOccluders,
    computeRayRingOcclusion,
    computeIllusionConfig,
    computeIllusionWanderAngles,
    evalIllusionEntryAnim,
    evalIllusionExitAnim,
    computeIllusionChannelStates,
    getIllusionIcosahedronMesh,
    getIllusionIcosphere42Mesh,
    getIllusionPolygonalHoopMesh,
    computeAlterationConfig,
    computeAlterationWanderAngles,
    getAlterationCageGeometry,
    buildAlterationTriadOccluders,
    evalAlterationGodrayOcclusion,
    THAUM_HOOP_PATTERNS,
    computeThaumaturgyConfig,
    computeThaumaturgyDodecaAngles,
    computeThaumaturgyHoopAngles,
    getThaumaturgyRomanDodecahedronMesh,
    computeThaumaturgyProjectionStates,
    buildThaumaturgyTriadOccluders,
    evalThaumaturgyGodrayOcclusion,
    DAEDRIC_GLYPHS,
    computeMysticismConfig,
    computeMysticismHoopAngles,
    computeMysticismProjectionStates,
    computeMysticismGoatEyeState,
    buildMysticismTriadOccluders,
    evalMysticismAntiLightOcclusion,
  };

  return exported;
})();
export default renderer;
