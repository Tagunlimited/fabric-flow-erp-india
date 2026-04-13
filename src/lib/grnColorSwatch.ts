/**
 * GRN item color label + swatch: fabric uses fabric_color + fabric_hex from master;
 * non-fabric uses item_color only (never fabric_hex). No swatch when we cannot resolve a real color.
 */

const PLACEHOLDER_LABELS = new Set([
  '-',
  '—',
  '–',
  'n/a',
  'na',
  'none',
  'nil',
  'null',
  'undefined',
  'no color',
  'nocolor',
  'tbd',
  'same as picture',
]);

/** Common color names → hex (lowercase keys). Extend as needed for your catalog. */
const NAMED_COLORS: Record<string, string> = {
  peach: '#FFCBA4',
  blank: '#E8E8E8',
  white: '#FFFFFF',
  'off white': '#FAFAFA',
  offwhite: '#FAFAFA',
  ivory: '#FFFFF0',
  cream: '#FFFDD0',
  bone: '#E3DAC9',
  ecru: '#C2B280',
  natural: '#D4C4A8',
  black: '#1a1a1a',
  grey: '#9ca3af',
  gray: '#9ca3af',
  charcoal: '#36454F',
  silver: '#C0C0C0',
  red: '#dc2626',
  maroon: '#800000',
  burgundy: '#800020',
  wine: '#722F37',
  pink: '#ec4899',
  rose: '#f43f5e',
  coral: '#FF7F50',
  salmon: '#FA8072',
  orange: '#ea580c',
  yellow: '#eab308',
  gold: '#D4AF37',
  mustard: '#FFDB58',
  green: '#16a34a',
  olive: '#808000',
  mint: '#98FF98',
  teal: '#0d9488',
  turquoise: '#40E0D0',
  cyan: '#06b6d4',
  blue: '#2563eb',
  navy: '#1e3a8a',
  'navy blue': '#1e3a8a',
  'royal blue': '#4169E1',
  'sky blue': '#87CEEB',
  'light blue': '#ADD8E6',
  indigo: '#4f46e5',
  purple: '#9333ea',
  violet: '#8b5cf6',
  lavender: '#E6E6FA',
  brown: '#92400e',
  tan: '#D2B48C',
  khaki: '#C3B091',
  beige: '#F5F5DC',
  melange: '#9ca3af',
  cotton: '#fafafa',
  rust: '#B7410E',
  apple: '#8DB600',
  'apple green': '#8DB600',
  /* Multi-word fabric / catalog colors (must win over generic last words like "blue") */
  'peacock blue': '#0d6570',
  'ice blue': '#a8d4e6',
  'powder blue': '#b0e0e6',
  'steel blue': '#4682b4',
  'slate blue': '#6a5acd',
  'cobalt blue': '#0047ab',
  'sapphire blue': '#0f52ba',
  'midnight blue': '#191970',
  'electric blue': '#7df9ff',
  'denim blue': '#1560bd',
  'baby blue': '#89cff0',
  'pastel blue': '#aec6cf',
  'ocean blue': '#4f97a3',
  'petrol blue': '#31646c',
  'air force blue': '#5d8aa8',
  'turquoise blue': '#00c5cd',
  'duck egg blue': '#c3fbf8',
  'french blue': '#0072bb',
  'crystal blue': '#a7d8de',
  'horizon blue': '#6d8e9d',
  'china blue': '#546f8b',
  'colonial blue': '#364f6b',
  'ink blue': '#1b2a41',
  'marine blue': '#042e60',
  'mazarine blue': '#273c75',
  'moonlight blue': '#9bb7d4',
  'pigeon blue': '#7285a5',
  'pool blue': '#81d4fa',
  'surf blue': '#7eb6d9',
  'ultramarine blue': '#120a8f',
  'aegean blue': '#1f6680',
  'aegean': '#1f6680',
  'bottle green': '#006a4e',
  'forest green': '#228b22',
  'hunter green': '#355e3b',
  'lime green': '#32cd32',
  'emerald green': '#50c878',
  'jade green': '#00a86b',
  'kelly green': '#4cbb17',
  'sage green': '#9dc183',
  'sea green': '#2e8b57',
  'pine green': '#01796f',
  'olive green': '#556b2f',
  'moss green': '#8a9a5b',
  'grass green': '#7cb518',
  'neon green': '#39ff14',
  'pastel green': '#77dd77',
  'spring green': '#00ff7f',
  'army green': '#4b5320',
  'camouflage green': '#78866b',
  'charcoal grey': '#36454f',
  'charcoal gray': '#36454f',
  'slate grey': '#708090',
  'slate gray': '#708090',
  'stone grey': '#928e85',
  'warm grey': '#9f8f86',
  'cool grey': '#8c92ac',
  'blood red': '#660000',
  'cherry red': '#de3163',
  'wine red': '#722f37',
  'brick red': '#cb4154',
  'ruby red': '#9b111e',
  'sunset orange': '#fd5e53',
  'burnt orange': '#cc5500',
  'pastel pink': '#ffd1dc',
  'hot pink': '#ff69b4',
  'dusty pink': '#d8a9a9',
  'blush pink': '#de5d83',
  'rose gold': '#b76e79',
  'champagne': '#f7e7ce',
  'sand': '#c2b280',
  'camel': '#c19a6b',
  'coffee': '#6f4e37',
  'chocolate': '#7b3f00',
  'plum': '#8e4585',
  'eggplant': '#614051',
  'aubergine': '#614051',
  'mauve': '#e0b0ff',
  'taupe': '#483c32',
  'graphite': '#251f1f',
  'anthracite': '#2e2e2e',
  'steel grey': '#666666',
  'steel gray': '#666666',
};

/** One-word keys that are too ambiguous as the last token of a multi-word color (e.g. "Ice Blue" → generic blue). */
const GENERIC_COLOR_TOKENS = new Set([
  'blue',
  'green',
  'red',
  'pink',
  'orange',
  'yellow',
  'purple',
  'brown',
  'black',
  'white',
  'grey',
  'gray',
  'gold',
  'silver',
  'navy',
  'teal',
  'tan',
  'cyan',
  'magenta',
  'lime',
  'olive',
  'maroon',
  'coral',
  'salmon',
  'mint',
  'ivory',
  'cream',
  'beige',
  'khaki',
  'wine',
  'rose',
  'peach',
  'rust',
  'natural',
  'melange',
  'cotton',
  'blank',
  'bone',
  'ecru',
  'charcoal',
  'indigo',
  'violet',
  'lavender',
  'turquoise',
  'burgundy',
  'mustard',
  'apple',
]);

export function hasMeaningfulColorLabel(raw?: string | null): boolean {
  if (raw == null) return false;
  const t = String(raw).trim();
  if (!t) return false;
  if (PLACEHOLDER_LABELS.has(t.toLowerCase())) return false;
  return true;
}

export function normalizeHexForCss(hex: string | null | undefined): string | null {
  if (hex == null) return null;
  const t = String(hex).trim().replace(/^#/, '');
  if (!t) return null;
  if (/^[0-9A-Fa-f]{3}$/.test(t)) {
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(t)) {
    return `#${t.toLowerCase()}`;
  }
  if (/^[0-9A-Fa-f]{8}$/.test(t)) {
    return `#${t.slice(0, 6).toLowerCase()}`;
  }
  return null;
}

function lookupNameToHex(colorName: string): string | null {
  const norm = colorName.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!norm) return null;
  if (NAMED_COLORS[norm]) return NAMED_COLORS[norm];
  const parts = norm.split(/[\s/-]+/).filter(Boolean);
  const multiWord = parts.length > 1;

  // Longest multi-word phrases first so "royal blue" / "ice blue" beat the token "blue".
  for (let len = parts.length; len >= 2; len--) {
    for (let start = 0; start + len <= parts.length; start++) {
      const phrase = parts.slice(start, start + len).join(' ');
      if (NAMED_COLORS[phrase]) return NAMED_COLORS[phrase];
    }
  }

  const keys = Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (!norm.includes(key)) continue;
    if (multiWord && !key.includes(' ') && GENERIC_COLOR_TOKENS.has(key)) continue;
    return NAMED_COLORS[key];
  }

  for (const p of parts) {
    if (multiWord && GENERIC_COLOR_TOKENS.has(p)) continue;
    if (NAMED_COLORS[p]) return NAMED_COLORS[p];
  }
  return null;
}

/**
 * Prefer validated master hex; otherwise map color name. Returns null if no reliable swatch.
 */
export function resolveSwatchHex(colorName: string, hexFromMaster?: string | null): string | null {
  const fromMaster = normalizeHexForCss(hexFromMaster);
  if (fromMaster) return fromMaster;
  if (!hasMeaningfulColorLabel(colorName)) return null;
  return lookupNameToHex(colorName);
}

/**
 * Warehouse / receiving inventory: `fabric_master.hex` is often one default per SKU, while each GRN line
 * has its own `fabric_color`. Using master hex with a line-specific color label produces wrong swatches
 * (e.g. "Apple Green" with a blue hex). When the line has a fabric color, resolve from the name only.
 */
export function resolveWarehouseFabricSwatch(
  displayColor: string,
  fabricHexFromMaster: string | null | undefined,
  lineFabricColorFromGrn: string | null | undefined
): string | null {
  if (!hasMeaningfulColorLabel(displayColor)) return null;
  if (hasMeaningfulColorLabel(lineFabricColorFromGrn)) {
    return resolveSwatchHex(displayColor.trim(), null);
  }
  return resolveSwatchHex(displayColor.trim(), fabricHexFromMaster);
}

export function getGrnItemColorDisplay(item: {
  item_type?: string;
  fabric_color?: string | null;
  item_color?: string | null;
  fabric_hex?: string | null;
}): { label: string; swatchHex: string | null } {
  const isFabric = String(item.item_type || '').toLowerCase() === 'fabric';

  const rawLabel = isFabric
    ? item.fabric_color || item.item_color || ''
    : item.item_color || '';

  if (!hasMeaningfulColorLabel(rawLabel)) {
    return { label: '-', swatchHex: null };
  }

  const label = String(rawLabel).trim();
  const swatchHex = isFabric
    ? resolveWarehouseFabricSwatch(label, item.fabric_hex, item.fabric_color || item.item_color || null)
    : resolveSwatchHex(label, null);

  return { label, swatchHex };
}
