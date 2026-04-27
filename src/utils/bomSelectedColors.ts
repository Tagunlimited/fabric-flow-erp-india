export type BomSelectedColor = {
  colorId?: string | null;
  colorName?: string | null;
  hex?: string | null;
};

export const normalizeSelectedColors = (value: unknown): BomSelectedColor[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const idCandidate =
        row.colorId ?? row.color_id ?? row.id ?? row.colorID ?? row.colourId ?? row.colour_id;
      const nameCandidate =
        row.colorName ?? row.color_name ?? row.name ?? row.label ?? row.colourName ?? row.colour_name;
      const colorId = typeof idCandidate === 'string' ? idCandidate : null;
      const colorName = typeof nameCandidate === 'string' ? nameCandidate.trim() : '';
      const hex = typeof row.hex === 'string' ? row.hex.trim() : '';
      if (!colorId && !colorName) return null;
      return {
        colorId,
        colorName: colorName || null,
        hex: hex || null,
      } satisfies BomSelectedColor;
    })
    .filter((v): v is BomSelectedColor => Boolean(v));
};

export const selectedColorNames = (selectedColors: unknown): string[] => {
  return normalizeSelectedColors(selectedColors)
    .map((c) => c.colorName?.trim())
    .filter((name): name is string => Boolean(name));
};

export const selectedColorsDisplayText = (
  selectedColors: unknown,
  fallbackColor?: string | null
): string => {
  const names = selectedColorNames(selectedColors);
  if (names.length > 0) return names.join(', ');
  return (fallbackColor || '').trim() || 'N/A';
};

export const selectedColorsGroupingKey = (
  selectedColors: unknown,
  fallbackColor?: string | null
): string => {
  const normalized = normalizeSelectedColors(selectedColors);
  if (normalized.length === 0) return (fallbackColor || '').trim().toLowerCase();
  return normalized
    .map((c) => (c.colorId || c.colorName || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
};
