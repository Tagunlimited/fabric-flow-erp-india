/**
 * Physical pieces left to gather for an assignment (`assigned_quantity` unchanged).
 * After QC rejects rows, picked_quantity is lowered in DB — gaps show here without inflating totals.
 */
export function assignmentLeftToPick(assignedTotal: number, pickedTotal: number): number {
  const t = Math.max(0, assignedTotal);
  const p = Math.max(0, pickedTotal);
  return Math.max(0, t - p);
}

/**
 * Fallback when rejects exist but legacy DB still has picked === assigned (rejections not deducted yet).
 * Does not increase org-wide total — replaces bad units only.
 */
export function assignmentLeftToPickWithLegacyRejected(
  assignedTotal: number,
  pickedTotal: number,
  qcRejectedTotal: number
): number {
  const gap = assignmentLeftToPick(assignedTotal, pickedTotal);
  const t = Math.max(0, assignedTotal);
  const p = Math.max(0, pickedTotal);
  const r = Math.max(0, qcRejectedTotal || 0);
  if (gap > 0) return gap;
  // QC reject logged but no assigned tally on assignment (missing size rows)
  if (r > 0 && t === 0) return r;
  if (t > 0 && p >= t && r > 0) return r;
  return 0;
}

/** Sum assigned pieces from view JSON or legacy row shapes. */
export function sumAssignedFromSizeDistributions(sizeDistributions: unknown): number {
  if (!Array.isArray(sizeDistributions)) return 0;
  return sizeDistributions.reduce((sum, d: any) => {
    const n = d?.assigned_quantity ?? d?.quantity ?? d?.assignedQuantity;
    return sum + Math.max(0, Number(n) || 0);
  }, 0);
}

/**
 * When picked already fills assigned but QC failed pieces (DB may still show gross picked),
 * "left to pick" includes replacement work. This is the portion of `leftToPick` not explained by assign−picked gap.
 */
export function pickerQcReplacementOwed(
  assignedTotal: number,
  pickedTotal: number,
  leftToPickInclusive: number
): number {
  const gap = Math.max(0, assignedTotal - pickedTotal);
  return Math.max(0, leftToPickInclusive - gap);
}

/** Picked count for badges: gross picked minus QC replacement slots not yet re-picked. */
export function pickerDisplayPicked(
  assignedTotal: number,
  pickedTotal: number,
  leftToPickInclusive: number
): number {
  const owed = pickerQcReplacementOwed(assignedTotal, pickedTotal, leftToPickInclusive);
  return Math.max(0, pickedTotal - owed);
}

/**
 * Picker "add now" delta: QC may have already lowered `picked_quantity` by rejects (`p + r <= assigned`),
 * or legacy rows still show gross picked (`p + r > assigned`). Do not subtract `r` twice.
 */
export function computePickedAfterPickerDelta(
  assigned: number,
  currentPicked: number,
  rejectedFromQc: number,
  newPicks: number
): number {
  const t = Math.max(0, Number(assigned) || 0);
  const p = Math.max(0, Number(currentPicked) || 0);
  const r = Math.max(0, Number(rejectedFromQc) || 0);
  const add = Math.max(0, Number(newPicks) || 0);
  const next = r > 0 && p + r > t ? p - r + add : p + add;
  return Math.max(0, Math.min(t, next));
}
