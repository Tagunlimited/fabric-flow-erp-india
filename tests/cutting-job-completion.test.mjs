import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors src/utils/batchAssignedQuantity.ts — update both if rules change.
 */
function resolveBatchLineAssignedQty(row) {
  const a = Math.max(0, Number(row?.assigned_quantity ?? row?.assignedQuantity) || 0);
  const q = Math.max(0, Number(row?.quantity) || 0);
  return Math.max(a, q);
}

function sumAssignedFromSizeDistributionRows(sizeDistributions) {
  if (!Array.isArray(sizeDistributions)) return 0;
  return sizeDistributions.reduce(
    (sum, row) => sum + resolveBatchLineAssignedQty(row),
    0
  );
}

/**
 * Mirrors src/utils/cuttingJobCompletion.ts — update both if rules change.
 */
function effectiveBatchSizeLinePieces(sd) {
  const fromExplicit = resolveBatchLineAssignedQty(sd);
  if (fromExplicit > 0) return fromExplicit;
  return Math.max(0, Number(sd?.picked_quantity) || 0);
}

function getTotalBatchAssignedQty(job) {
  return (job.batchAssignments || []).reduce((sum, assignment) => {
    const directQty = Number(assignment.total_quantity || 0);
    const fromSizes = (assignment.size_distributions || []).reduce(
      (sizeSum, row) => sizeSum + effectiveBatchSizeLinePieces(row),
      0
    );
    return sum + Math.max(directQty, fromSizes);
  }, 0);
}

function deriveCuttingJobStatus(job) {
  const requiredQty = Math.max(0, Number(job.quantity || 0));
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

test('resolveBatchLineAssignedQty uses legacy quantity when assigned_quantity is 0', () => {
  assert.equal(resolveBatchLineAssignedQty({ assigned_quantity: 0, quantity: 4 }), 4);
  assert.equal(resolveBatchLineAssignedQty({ assigned_quantity: 3, quantity: 4 }), 4);
});

test('sumAssignedFromSizeDistributionRows aggregates resolved rows', () => {
  const total = sumAssignedFromSizeDistributionRows([
    { assigned_quantity: 0, quantity: 2 },
    { assigned_quantity: 1, quantity: 1 },
  ]);
  assert.equal(total, 3);
});

test('deriveCuttingJobStatus: fully cut + batch qty covers cuts => completed', () => {
  const status = deriveCuttingJobStatus({
    quantity: 4,
    cutQuantity: 4,
    batchAssignments: [
      {
        total_quantity: 4,
        size_distributions: [{ assigned_quantity: 0, quantity: 4, size_name: 'XL' }],
      },
    ],
  });
  assert.equal(status, 'completed');
});

test('deriveCuttingJobStatus: fully cut + zero batch qty => in_progress', () => {
  const status = deriveCuttingJobStatus({
    quantity: 4,
    cutQuantity: 4,
    batchAssignments: [
      {
        total_quantity: 0,
        size_distributions: [{ assigned_quantity: 0, quantity: 0, size_name: 'XL' }],
      },
    ],
  });
  assert.equal(status, 'in_progress');
});

test('deriveCuttingJobStatus: partial batch assign => in_progress', () => {
  const status = deriveCuttingJobStatus({
    quantity: 4,
    cutQuantity: 4,
    batchAssignments: [
      {
        total_quantity: 2,
        size_distributions: [{ assigned_quantity: 2, quantity: 2, size_name: 'XL' }],
      },
    ],
  });
  assert.equal(status, 'in_progress');
});
