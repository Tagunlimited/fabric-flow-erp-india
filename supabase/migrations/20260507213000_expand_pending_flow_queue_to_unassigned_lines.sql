-- Queue should include receipt-linked orders with unassigned lines,
-- even when legacy data has fulfillment_status != pending_flow.

CREATE OR REPLACE VIEW public.v_orders_pending_flow_assignment AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.order_date,
  o.order_type,
  o.status AS order_status,
  o.customer_id,
  c.company_name AS customer_name,
  o.created_at,
  (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) AS line_count,
  (
    SELECT count(*)::int
    FROM public.order_items oi2
    WHERE oi2.order_id = o.id
      AND (
        oi2.fulfillment_status = 'pending_flow'
        OR oi2.execution_flow IS NULL
      )
  ) AS pending_line_count,
  o.expected_delivery_date,
  o.sales_manager,
  o.final_amount,
  o.balance_amount
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE coalesce(o.is_deleted, false) = false
  AND o.status <> 'cancelled'
  AND EXISTS (
    SELECT 1
    FROM public.company_settings cs
    WHERE cs.require_order_flow_assignment = true
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1
    FROM public.receipts r
    WHERE (
      lower(trim(coalesce(r.reference_type, ''))) = 'order'
      AND r.reference_id = o.id
    )
    OR (
      nullif(trim(coalesce(r.reference_number, '')), '') = o.order_number
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND (
        oi.fulfillment_status = 'pending_flow'
        OR oi.execution_flow IS NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_items oi_started
    WHERE oi_started.order_id = o.id
      AND (
        oi_started.execution_flow IS NOT NULL
        OR oi_started.fulfillment_status IN (
          'awaiting_procurement',
          'awaiting_production',
          'awaiting_dispatch_prep',
          'ready_for_dispatch',
          'dispatched'
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.bom_records br
    WHERE br.order_id = o.id
  );

GRANT SELECT ON public.v_orders_pending_flow_assignment TO authenticated, service_role;

COMMENT ON VIEW public.v_orders_pending_flow_assignment IS
  'Orders that need per-line execution flow assignment (when require_order_flow_assignment is enabled). Excludes any order where execution has already started (flow assigned / procurement / production / dispatch) or BOM exists.';

NOTIFY pgrst, 'reload schema';
