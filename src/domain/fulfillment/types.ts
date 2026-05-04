export type ExecutionFlow = 'stitching' | 'outsource' | 'inventory';

export type FulfillmentStatus =
  | 'pending_flow'
  | 'flow_assigned'
  | 'awaiting_procurement'
  | 'awaiting_production'
  | 'awaiting_dispatch_prep'
  | 'ready_for_dispatch'
  | 'dispatched'
  | 'cancelled';

export const EXECUTION_FLOWS: ExecutionFlow[] = ['stitching', 'outsource', 'inventory'];

export function executionFlowLabel(flow: ExecutionFlow | null | undefined): string {
  if (!flow) return 'Not assigned';
  switch (flow) {
    case 'stitching':
      return 'Stitching';
    case 'outsource':
      return 'Outsource';
    case 'inventory':
      return 'Inventory';
    default:
      return String(flow);
  }
}

export function fulfillmentStatusLabel(status: FulfillmentStatus | null | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}
