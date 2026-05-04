import type { ExecutionFlow, FulfillmentStatus } from './types';

/** Allowed execution flows for new assignment (UI + API validation). */
export function isExecutionFlow(v: string): v is ExecutionFlow {
  return v === 'stitching' || v === 'outsource' || v === 'inventory';
}

/** Whether BOM creation is allowed for this line (DB trigger is authoritative). */
export function bomAllowedForLine(flow: ExecutionFlow | null, fulfillment: FulfillmentStatus): boolean {
  if (fulfillment === 'pending_flow') return false;
  if (flow === 'outsource' || flow === 'inventory') return false;
  return flow === 'stitching' || flow === null;
}
