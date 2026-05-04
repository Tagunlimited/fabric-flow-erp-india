import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors src/domain/fulfillment/transitions.ts — update both if rules change.
 */
function bomAllowedForLine(flow, fulfillment) {
  if (fulfillment === 'pending_flow') return false;
  if (flow === 'outsource' || flow === 'inventory') return false;
  return flow === 'stitching' || flow === null;
}

/**
 * Mirrors FulfillmentPolicy.describeNextStep in src/domain/fulfillment/policy.ts.
 */
function describeNextStep(flow, fulfillment) {
  if (fulfillment === 'pending_flow') return 'Assign execution path';
  if (flow === 'stitching' && fulfillment === 'flow_assigned') return 'Create BOM & raise PO';
  if (flow === 'outsource' && fulfillment === 'flow_assigned') return 'Create purchase order for this line';
  if (flow === 'inventory' && fulfillment === 'awaiting_procurement') return 'Reserve remaining stock';
  if (flow === 'inventory' && fulfillment === 'ready_for_dispatch') return 'Ready for dispatch';
  return fulfillment.replace(/_/g, ' ');
}

test('bomAllowedForLine: rejects pending_flow', () => {
  assert.equal(bomAllowedForLine('stitching', 'pending_flow'), false);
  assert.equal(bomAllowedForLine(null, 'pending_flow'), false);
});

test('bomAllowedForLine: rejects outsource and inventory paths', () => {
  assert.equal(bomAllowedForLine('outsource', 'flow_assigned'), false);
  assert.equal(bomAllowedForLine('inventory', 'flow_assigned'), false);
});

test('bomAllowedForLine: allows stitching and legacy null flow when not pending', () => {
  assert.equal(bomAllowedForLine('stitching', 'flow_assigned'), true);
  assert.equal(bomAllowedForLine(null, 'flow_assigned'), true);
});

test('describeNextStep: pending_flow', () => {
  assert.match(describeNextStep(null, 'pending_flow'), /assign/i);
});

test('describeNextStep: outsource line', () => {
  assert.match(describeNextStep('outsource', 'flow_assigned'), /purchase order/i);
});
