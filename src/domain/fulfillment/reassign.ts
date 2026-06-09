import type { ExecutionFlow } from './types';

export type FlowAssignmentLine = {
  execution_flow?: ExecutionFlow | string | null;
  fulfillment_status?: string | null;
};

export function isLineAwaitingAssignment(line: FlowAssignmentLine): boolean {
  return line.fulfillment_status === 'pending_flow' || !line.execution_flow;
}

export function isLineReassignable(line: FlowAssignmentLine): boolean {
  return line.fulfillment_status === 'flow_assigned';
}

export const REASSIGN_BLOCK_LABELS: Record<string, string> = {
  'One or more lines are not in flow_assigned state':
    'One or more lines have moved past initial flow assignment (e.g. inventory procurement or dispatch prep).',
  'BOM already created for this order': 'A BOM exists for this order.',
  'Purchase order already linked to this order': 'A purchase order is linked to this sales order.',
  'Purchase order line linked to an order item': 'A purchase order line is linked to an order item.',
  'Dispatch already exists for a line on this order': 'Dispatch has started for a line on this order.',
  'Cutting assignments exist for this order': 'Cutting has been assigned for this order.',
  'Production batch assignments exist for this order': 'Production batch assignments exist for this order.',
};

export function reassignBlockMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REASSIGN_BLOCK_LABELS[reason] ?? reason;
}
