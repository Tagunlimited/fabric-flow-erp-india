/** Resolve assigned pieces from a size row; max(assigned_quantity, quantity) handles legacy quantity-only rows. */
export function resolveBatchLineAssignedQty(row: {
  assigned_quantity?: unknown;
  quantity?: unknown;
  assignedQuantity?: unknown;
}): number {
  const a = Math.max(0, Number(row?.assigned_quantity ?? row?.assignedQuantity) || 0);
  const q = Math.max(0, Number(row?.quantity) || 0);
  return Math.max(a, q);
}

/** Sum assigned pieces from size distribution rows (view JSON or DB rows). */
export function sumAssignedFromSizeDistributionRows(sizeDistributions: unknown): number {
  if (!Array.isArray(sizeDistributions)) return 0;
  return sizeDistributions.reduce(
    (sum, row) => sum + resolveBatchLineAssignedQty(row as Record<string, unknown>),
    0
  );
}
