-- Ensures procurement queue view exists (PostgREST 404 if missing).
-- Depends on: order_items.fulfillment_status, company_settings.require_order_flow_assignment,
-- receipts, orders, customers (from 20260506120000_order_item_execution_flow.sql or equivalent).

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
  (SELECT count(*)::int
   FROM public.order_items oi2
   WHERE oi2.order_id = o.id
     AND oi2.fulfillment_status = 'pending_flow') AS pending_line_count
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE coalesce(o.is_deleted, false) = false
  AND o.status <> 'cancelled'
  AND EXISTS (SELECT 1 FROM public.company_settings cs WHERE cs.require_order_flow_assignment = true LIMIT 1)
  AND EXISTS (
    SELECT 1
    FROM public.receipts r
    WHERE (
      lower(coalesce(r.reference_type, '')) = 'order' AND r.reference_id = o.id
    )
    OR (
      r.reference_number IS NOT NULL AND r.reference_number = o.order_number
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND oi.fulfillment_status = 'pending_flow'
  );

GRANT SELECT ON public.v_orders_pending_flow_assignment TO authenticated, service_role;

COMMENT ON VIEW public.v_orders_pending_flow_assignment IS
  'Orders that need per-line execution flow assignment (when require_order_flow_assignment is enabled).';

NOTIFY pgrst, 'reload schema';
