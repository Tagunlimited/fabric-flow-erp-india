/** Minimal row shape for Order-form-style fabric picking (unique name → color variants → GSM). */

export type FabricMasterPickerRow = {
  id: string;
  fabric_name: string;
  fabric_code?: string | null;
  color?: string | null;
  gsm?: string | null;
  hex?: string | null;
  status?: string | null;
  fabric_for_supplier?: string | null;
  image?: string | null;
  image_url?: string | null;
  rate?: number | null;
};

/** Select value when `fabric_master.gsm` is blank (Radix Select dislikes empty string values). */
export const FABRIC_GSM_EMPTY_SELECT_VALUE = '__fabric_gsm_empty__';

export function fabricGsmFromSelectValue(v: string): string {
  return v === FABRIC_GSM_EMPTY_SELECT_VALUE ? '' : v;
}

export function isActiveFabricRow(row: FabricMasterPickerRow): boolean {
  const raw = row.status;
  const s = (raw == null || String(raw).trim() === ''
    ? 'active'
    : String(raw)
  ).toLowerCase();
  return s === 'active';
}

/** One representative row per distinct fabric name (active only), sorted by name — Order form “Product” list. */
export function uniqueFabricNameBases(rows: FabricMasterPickerRow[]): FabricMasterPickerRow[] {
  const map = new Map<string, FabricMasterPickerRow>();
  for (const r of rows) {
    if (!isActiveFabricRow(r)) continue;
    const name = String(r.fabric_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.fabric_name || '').localeCompare(String(b.fabric_name || ''))
  );
}

/** Variants sharing the base row’s fabric_name, deduped by color + hex (same idea as OrderForm getAvailableColors). */
export function dedupedColorVariants(
  rows: FabricMasterPickerRow[],
  baseFabricId: string
): FabricMasterPickerRow[] {
  const base = rows.find((r) => r.id === baseFabricId);
  if (!base) return [];
  const name = String(base.fabric_name || '').trim();
  if (!name) return [];
  const nameKey = name.toLowerCase();
  const same = rows.filter(
    (r) => String(r.fabric_name || '').trim().toLowerCase() === nameKey
  );
  const seen = new Set<string>();
  return same
    .filter((f) => {
      const colorKey = String(f.color || '').trim().toLowerCase();
      const hexKey = String(f.hex || '').trim().toLowerCase();
      const key = `${colorKey}|${hexKey}`;
      if (!colorKey) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.color || '').localeCompare(String(b.color || '')));
}

/** Distinct GSM values for an active fabric name (Add raw inventory: pick fabric → GSM → color). */
export function gsmValuesForFabricName(
  rows: FabricMasterPickerRow[],
  fabricName: string
): string[] {
  const n = fabricName.trim().toLowerCase();
  const gsmSet = new Set<string>();
  let hasEmptyGsm = false;
  for (const r of rows) {
    if (!isActiveFabricRow(r)) continue;
    if (String(r.fabric_name || '').trim().toLowerCase() !== n) continue;
    const gsm = String(r.gsm || '').trim();
    if (gsm) gsmSet.add(gsm);
    else hasEmptyGsm = true;
  }
  const sorted = Array.from(gsmSet).sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
  if (hasEmptyGsm) {
    return [FABRIC_GSM_EMPTY_SELECT_VALUE, ...sorted];
  }
  return sorted;
}

/** Active variants for fabric name + GSM, deduped by color + hex (one row id per color). */
export function colorVariantsForFabricNameAndGsm(
  rows: FabricMasterPickerRow[],
  fabricName: string,
  gsmSelectValue: string
): FabricMasterPickerRow[] {
  const n = fabricName.trim().toLowerCase();
  const gsmNorm = fabricGsmFromSelectValue(gsmSelectValue).toLowerCase();
  const same = rows.filter((r) => {
    if (!isActiveFabricRow(r)) return false;
    if (String(r.fabric_name || '').trim().toLowerCase() !== n) return false;
    const rowGsm = String(r.gsm || '').trim().toLowerCase();
    return rowGsm === gsmNorm;
  });
  const seen = new Set<string>();
  return same
    .filter((f) => {
      const colorKey = String(f.color || '').trim().toLowerCase();
      const hexKey = String(f.hex || '').trim().toLowerCase();
      const key = `${colorKey}|${hexKey}`;
      if (!colorKey) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.color || '').localeCompare(String(b.color || '')));
}

export function gsmValuesForNameAndColor(
  rows: FabricMasterPickerRow[],
  fabricName: string,
  color: string
): string[] {
  const n = fabricName.trim().toLowerCase();
  const c = color.trim().toLowerCase();
  const gsmSet = new Set<string>();
  rows
    .filter(
      (r) =>
        String(r.fabric_name || '').trim().toLowerCase() === n &&
        String(r.color || '').trim().toLowerCase() === c
    )
    .forEach((r) => {
      const gsm = String(r.gsm || '').trim();
      if (gsm) gsmSet.add(gsm);
    });
  return Array.from(gsmSet).sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
}

export function findFabricVariantRow(
  rows: FabricMasterPickerRow[],
  fabricName: string,
  color: string,
  gsm: string
): FabricMasterPickerRow | undefined {
  const n = fabricName.trim().toLowerCase();
  const c = color.trim().toLowerCase();
  const g = gsm.trim().toLowerCase();
  return rows.find(
    (r) =>
      String(r.fabric_name || '').trim().toLowerCase() === n &&
      String(r.color || '').trim().toLowerCase() === c &&
      String(r.gsm || '').trim().toLowerCase() === g
  );
}

/** Pick the same “base” id {@link uniqueFabricNameBases} would use for this fabric name. */
export function baseFabricIdForFabricName(
  rows: FabricMasterPickerRow[],
  fabricName: string
): string | undefined {
  const bases = uniqueFabricNameBases(rows);
  const key = fabricName.trim().toLowerCase();
  return bases.find((b) => String(b.fabric_name || '').trim().toLowerCase() === key)?.id;
}

export function deriveBaseFabricIdFromVariantId(
  rows: FabricMasterPickerRow[],
  variantId: string
): string | undefined {
  const variant = rows.find((r) => r.id === variantId);
  if (!variant) return undefined;
  return baseFabricIdForFabricName(rows, variant.fabric_name);
}
