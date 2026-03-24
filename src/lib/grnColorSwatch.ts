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
};

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
  for (const p of parts) {
    if (NAMED_COLORS[p]) return NAMED_COLORS[p];
  }
  const keys = Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm.includes(key)) return NAMED_COLORS[key];
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
