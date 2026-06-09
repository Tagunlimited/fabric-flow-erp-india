import {
  normalizeSelectedColors,
  selectedColorNames,
  type BomSelectedColor,
} from '@/utils/bomSelectedColors';

export type PoColorLine = {
  item_type?: string | null;
  selected_colors?: unknown;
  fabric_color?: string | null;
  item_color?: string | null;
  fabric_gsm?: string | null;
  notes?: string | null;
};

function isFabricLine(line: PoColorLine): boolean {
  return String(line.item_type || '').toLowerCase() === 'fabric';
}

/** Parse legacy wizard notes like "desc | size | Red | material". */
export function parseColorFromNotes(notes?: string | null): string | null {
  if (!notes?.trim()) return null;
  const parts = notes.split('|').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^color:/i.test(part)) {
      return part.replace(/^color:\s*/i, '').trim() || null;
    }
  }
  const fabricIdx = parts.findIndex((p) => /^fabric:/i.test(p));
  if (fabricIdx >= 0) return null;
  if (parts.length >= 3) {
    const candidate = parts[2]?.trim();
    if (candidate && !/^fabric:/i.test(candidate)) return candidate;
  }
  return null;
}

function cleanScalar(value?: string | null): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === 'N/A') return null;
  return trimmed;
}

/** Resolve a single display color string (no empty label). */
export function resolvePoLineScalarColor(
  line: PoColorLine,
  itemMasterColor?: string | null
): string | null {
  const names = selectedColorNames(line.selected_colors);
  if (names.length > 0) return names.join(', ');

  const fabric = isFabricLine(line);
  const scalar = fabric
    ? cleanScalar(line.fabric_color)
    : cleanScalar(line.item_color) ||
      cleanScalar(itemMasterColor) ||
      cleanScalar(parseColorFromNotes(line.notes));

  return scalar;
}

/** Display color with fallback label (default N/A). */
export function resolvePoLineColor(
  line: PoColorLine,
  itemMasterColor?: string | null,
  emptyLabel = 'N/A'
): string {
  return resolvePoLineScalarColor(line, itemMasterColor) || emptyLabel;
}

/** Color + GSM subtitle for list/detail rows. */
export function poLineColorDetailText(
  line: PoColorLine,
  itemMasterColor?: string | null
): string {
  const parts: string[] = [];
  const color = resolvePoLineScalarColor(line, itemMasterColor);
  if (color) parts.push(color);
  if (isFabricLine(line) && line.fabric_gsm) {
    parts.push(`${line.fabric_gsm} GSM`);
  }
  return parts.join(', ');
}

/** Normalize color fields for purchase_order_items insert/update. */
export function poLineColorPayload(
  line: PoColorLine,
  itemMasterColor?: string | null
): {
  selected_colors: BomSelectedColor[];
  fabric_color: string | null;
  item_color: string | null;
} {
  const fabric = isFabricLine(line);
  let selected_colors = normalizeSelectedColors(line.selected_colors);

  let fabric_color = cleanScalar(line.fabric_color);
  let item_color = fabric
    ? null
    : cleanScalar(line.item_color) ||
      cleanScalar(itemMasterColor) ||
      cleanScalar(parseColorFromNotes(line.notes));

  if (!fabric && !item_color && selected_colors.length > 0) {
    item_color = cleanScalar(selected_colors[0].colorName);
  }

  if (fabric && !fabric_color && selected_colors.length > 0) {
    fabric_color = cleanScalar(selected_colors[0].colorName);
  }

  if (selected_colors.length === 0) {
    const scalar = fabric ? fabric_color : item_color;
    if (scalar) {
      selected_colors = [{ colorId: null, colorName: scalar, hex: null }];
    }
  }

  return {
    selected_colors,
    fabric_color: fabric ? fabric_color : null,
    item_color: fabric ? null : item_color,
  };
}
