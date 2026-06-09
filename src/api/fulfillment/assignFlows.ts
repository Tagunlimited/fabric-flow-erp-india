import { supabase } from '@/integrations/supabase/client';
import type { ExecutionFlow } from '@/domain/fulfillment/types';

export type InventoryCommitInput = {
  warehouse_inventory_id: string;
  quantity: number;
};

export type FlowAssignmentInput = {
  order_item_id: string;
  execution_flow: ExecutionFlow;
  inventory?: InventoryCommitInput[];
};

export type AssignOrderItemFlowsMode = 'assign' | 'reassign';

export async function assignOrderItemFlows(
  orderId: string,
  assignments: FlowAssignmentInput[],
  options?: { mode?: AssignOrderItemFlowsMode }
) {
  const { data, error } = await supabase.rpc('assign_order_item_flows' as any, {
    p_order_id: orderId,
    p_assignments: assignments,
    p_mode: options?.mode ?? 'assign',
  });
  if (error) throw error;
  return data;
}
