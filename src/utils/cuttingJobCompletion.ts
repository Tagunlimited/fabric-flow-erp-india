import { resolveBatchLineAssignedQty } from '@/utils/batchAssignedQuantity';

export type CuttingJobStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold' | 'quality_check';

export type CuttingJobBatchAssignment = {
  total_quantity?: number;
  size_distributions?: Array<{
    size_name?: string;
    quantity?: number;
    assigned_quantity?: number;
    picked_quantity?: number;
    left_quantity?: number;
  }>;
};

export type CuttingJobForCompletion = {
  quantity: number;
  cutQuantity: number;
  batchAssignments?: CuttingJobBatchAssignment[];
};

function effectiveBatchSizeLinePieces(sd: {
  assigned_quantity?: unknown;
  quantity?: unknown;
  picked_quantity?: unknown;
}): number {
  const fromExplicit = resolveBatchLineAssignedQty(sd);
  if (fromExplicit > 0) return fromExplicit;
  return Math.max(0, Number(sd?.picked_quantity) || 0);
}

export function getRequiredCuttingQuantity(job: CuttingJobForCompletion): number {
  return Math.max(0, Number(job.quantity || 0));
}

export function getTotalBatchAssignedQty(job: CuttingJobForCompletion): number {
  return (job.batchAssignments || []).reduce((sum, assignment) => {
    const directQty = Number(assignment.total_quantity || 0);
    const fromSizes = (assignment.size_distributions || []).reduce(
      (sizeSum, row) => sizeSum + effectiveBatchSizeLinePieces(row),
      0
    );
    return sum + Math.max(directQty, fromSizes);
  }, 0);
}

export function getCutCompletionPercentage(job: CuttingJobForCompletion): number {
  const required = getRequiredCuttingQuantity(job);
  if (!required) return 0;
  const cutQty = Math.max(0, Number(job.cutQuantity || 0));
  return Math.min(100, Math.round((cutQty / required) * 100));
}

export function getBatchAssignmentPercentage(job: CuttingJobForCompletion): number {
  const cutQty = Math.max(0, Number(job.cutQuantity || 0));
  if (!cutQty) return 0;
  const assignedQty = getTotalBatchAssignedQty(job);
  return Math.min(100, Math.round((assignedQty / cutQty) * 100));
}

export function deriveCuttingJobStatus(job: CuttingJobForCompletion): CuttingJobStatus {
  const requiredQty = getRequiredCuttingQuantity(job);
  const cutQty = Math.max(0, Number(job.cutQuantity || 0));
  const assignedQty = getTotalBatchAssignedQty(job);
  const isFullyCut = requiredQty > 0 && cutQty >= requiredQty;
  const hasBatchAssignments = (job.batchAssignments || []).length > 0;
  const allCutPiecesAssignedToTailors =
    hasBatchAssignments && cutQty > 0 && assignedQty + 1e-6 >= cutQty;

  if (isFullyCut && allCutPiecesAssignedToTailors) return 'completed';
  if (cutQty > 0 || assignedQty > 0) return 'in_progress';
  return 'pending';
}

export function isCuttingJobCompleted(job: CuttingJobForCompletion): boolean {
  return deriveCuttingJobStatus(job) === 'completed';
}
