import type { ExecutionFlow, FulfillmentStatus } from './types';
import { bomAllowedForLine } from './transitions';

export const FulfillmentPolicy = {
  bomAllowedForLine,
  /** Outsource PO should set sales_order_item_id on PO lines. */
  outsourceRequiresSalesOrderItemLink(): boolean {
    return true;
  },
  describeNextStep(flow: ExecutionFlow | null, fulfillment: FulfillmentStatus): string {
    if (fulfillment === 'pending_flow') return 'Assign execution path';
    if (flow === 'stitching' && fulfillment === 'flow_assigned') return 'Create BOM & raise PO';
    if (flow === 'outsource' && fulfillment === 'flow_assigned') return 'Create purchase order for this line';
    if (flow === 'inventory' && fulfillment === 'awaiting_procurement') return 'Reserve remaining stock';
    if (flow === 'inventory' && fulfillment === 'ready_for_dispatch') return 'Ready for dispatch';
    return fulfillment.replace(/_/g, ' ');
  },
};
