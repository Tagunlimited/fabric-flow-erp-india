export function normalizeIdentityValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildWarehouseIdentityKey(input: {
  itemType: string;
  itemId?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  binId?: string | null;
  status?: string | null;
  unit?: string | null;
  color?: string | null;
  gsm?: string | number | null;
}): string {
  const base = [
    normalizeIdentityValue(input.itemType),
    normalizeIdentityValue(input.binId),
    normalizeIdentityValue(input.status),
    normalizeIdentityValue(input.unit),
  ];

  if (normalizeIdentityValue(input.itemId)) {
    base.unshift(`id:${normalizeIdentityValue(input.itemId)}`);
  } else {
    base.unshift(
      `code:${normalizeIdentityValue(input.itemCode)}`,
      `name:${normalizeIdentityValue(input.itemName)}`
    );
  }

  if (normalizeIdentityValue(input.itemType) === 'fabric') {
    base.push(`color:${normalizeIdentityValue(input.color)}`);
    base.push(`gsm:${normalizeIdentityValue(input.gsm)}`);
  }

  return base.join('|');
}
