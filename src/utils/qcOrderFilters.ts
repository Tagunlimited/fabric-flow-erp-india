/** Picked units on bench not yet recorded as approved in qc_reviews (includes replacement picks after partial QC). */
export function orderNeedsQcVerification(order: {
  picked_quantity: number;
  approved_quantity: number;
  rejected_quantity?: number;
}): boolean {
  const p = Number(order.picked_quantity) || 0;
  const a = Number(order.approved_quantity) || 0;
  const r = Number(order.rejected_quantity) || 0;
  if (p <= 0) return false;
  if (r > 0) return true;
  return p > a;
}

/** True when this batch assignment still needs QC action (bench units or open rejects). */
export function assignmentNeedsQcVerification(assignment: {
  picked_quantity: number;
  approved_quantity: number;
  rejected_quantity?: number;
}): boolean {
  const picked = Number(assignment.picked_quantity) || 0;
  const approved = Number(assignment.approved_quantity) || 0;
  const rejected = Number(assignment.rejected_quantity) || 0;
  if (picked <= 0) return false;
  if (rejected > 0) return true;
  return picked > approved;
}

export type QcAssignmentMeta = {
  order_id: string;
  order_number: string;
  batch_name?: string;
  picked: number;
  approved?: number;
  rejected?: number;
  batch_leader_name?: string;
  batch_leader_avatar?: string | null;
};

export type QcAssignmentOption = {
  assignment_id: string;
  batch_name?: string;
  picked: number;
  batch_leader_name?: string;
  batch_leader_avatar?: string | null;
};

/** Batch picker options — only assignments that still need QC (excludes fully approved tailors). */
export function buildPendingQcAssignmentOptions(
  assignmentIds: string[],
  meta: Record<string, QcAssignmentMeta> | undefined
): QcAssignmentOption[] {
  return assignmentIds
    .map((id) => {
      const m = meta?.[id];
      if (!m) return null;
      if (
        !assignmentNeedsQcVerification({
          picked_quantity: m.picked,
          approved_quantity: m.approved ?? 0,
          rejected_quantity: m.rejected ?? 0,
        })
      ) {
        return null;
      }
      return {
        assignment_id: id,
        batch_name: m.batch_name,
        picked: m.picked || 0,
        batch_leader_name: m.batch_leader_name,
        batch_leader_avatar: m.batch_leader_avatar,
      };
    })
    .filter((opt): opt is QcAssignmentOption => opt != null);
}
