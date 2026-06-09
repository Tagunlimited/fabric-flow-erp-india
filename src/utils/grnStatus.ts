/** GRN header statuses treated as closed on the GRN list "Completed" tab. */
export const GRN_WORKFLOW_COMPLETE_STATUSES = new Set(['approved', 'rejected']);

/** Line-level QC values that count as received-in for PO closure. */
export const GRN_LINE_APPROVED_STATUSES = new Set(['approved', 'passed']);

export type GrnLineForReceipt = {
  quality_status?: string | null;
  approved_quantity?: number | null;
  received_quantity?: number | null;
};

export function isGrnLineApprovedQuality(status: string | null | undefined): boolean {
  return GRN_LINE_APPROVED_STATUSES.has(String(status || '').toLowerCase());
}

/** Count qty toward PO receipt; over-receipt uses received when it exceeds approved. */
export function effectiveReceivedQtyForGrnLine(line: GrnLineForReceipt): number {
  if (!isGrnLineApprovedQuality(line.quality_status)) return 0;
  const approved = Number(line.approved_quantity) || 0;
  const received = Number(line.received_quantity) || 0;
  return Math.max(approved, received);
}

export function allGrnLinesApproved(lines: Array<{ quality_status?: string | null }>): boolean {
  return lines.length > 0 && lines.every((l) => isGrnLineApprovedQuality(l.quality_status));
}

export function deriveGrnHeaderStatusFromLines(
  lines: Array<{ quality_status?: string | null }>,
  fallback = 'under_inspection'
): string {
  if (lines.length === 0) return fallback;
  const approved = lines.filter((l) => isGrnLineApprovedQuality(l.quality_status)).length;
  const rejected = lines.filter((l) => {
    const s = String(l.quality_status || '').toLowerCase();
    return s === 'rejected' || s === 'damaged' || s === 'failed';
  }).length;
  const pending = lines.filter((l) => String(l.quality_status || '').toLowerCase() === 'pending').length;
  if (approved === lines.length) return 'approved';
  if (rejected === lines.length) return 'rejected';
  if (approved > 0 && (pending > 0 || rejected > 0)) return 'partially_approved';
  return fallback;
}

export function isGrnWorkflowComplete(
  status: string | null | undefined,
  lines?: Array<{ quality_status?: string | null }>
): boolean {
  if (status && GRN_WORKFLOW_COMPLETE_STATUSES.has(status.toLowerCase())) return true;
  if (lines && lines.length > 0 && allGrnLinesApproved(lines)) return true;
  return false;
}
