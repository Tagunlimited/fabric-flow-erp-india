-- Order duplicate diagnostic (twin creates: e.g. TUC/26-27/392 + /393 from one submit)
-- Run in Supabase SQL editor. Change order numbers in section 1 as needed.
--
-- If duplicate-prevention fix is not deployed yet, apply:
--   supabase/migrations/20260601120000_order_create_idempotency.sql
-- then reload PostgREST schema (Project Settings → Data API).

-- =============================================================================
-- 0) Schema — duplicate-prevention migration applied?
-- =============================================================================
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'orders'
    AND column_name = 'create_idempotency_key'
) AS idempotency_column_present,
EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'allocate_order_number'
) AS allocate_order_number_rpc_present;

-- =============================================================================
-- 1) Target orders — side-by-side
-- =============================================================================
SELECT
  o.id,
  o.order_number,
  o.created_at,
  o.customer_id,
  c.company_name AS customer_name,
  o.sales_manager,
  o.status,
  o.final_amount,
  o.is_deleted,
  (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) AS line_count,
  (SELECT count(*)::int FROM public.receipts r
   WHERE lower(coalesce(r.reference_type, '')) = 'order'
     AND (r.reference_id = o.id OR r.reference_number = o.order_number)) AS receipt_count,
  (SELECT count(*)::int FROM public.bom_records br WHERE br.order_id = o.id) AS bom_count
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.order_number IN ('TUC/26-27/392', 'TUC/26-27/393')
ORDER BY o.created_at;

-- =============================================================================
-- 1b) Idempotency keys (only after migration 20260601120000 — skip if section 0 is false)
-- =============================================================================
-- SELECT o.order_number, o.create_idempotency_key, o.created_at
-- FROM public.orders o
-- WHERE o.order_number IN ('TUC/26-27/392', 'TUC/26-27/393')
-- ORDER BY o.created_at;

-- =============================================================================
-- 2) Twin signature — same customer, created within 5 minutes
-- =============================================================================
SELECT
  a.order_number AS first_no,
  b.order_number AS second_no,
  a.created_at AS first_at,
  b.created_at AS second_at,
  EXTRACT(EPOCH FROM (b.created_at - a.created_at)) AS seconds_apart,
  a.customer_id = b.customer_id AS same_customer,
  a.final_amount AS first_amount,
  b.final_amount AS second_amount
FROM public.orders a
JOIN public.orders b
  ON b.customer_id = a.customer_id
 AND b.order_number = 'TUC/26-27/393'
 AND a.order_number = 'TUC/26-27/392'
 AND b.created_at > a.created_at
 AND b.created_at < a.created_at + interval '5 minutes';

-- =============================================================================
-- 3) Orphan headers (order row with zero line items)
-- =============================================================================
SELECT
  o.order_number,
  o.id,
  o.created_at,
  o.is_deleted,
  (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS items
FROM public.orders o
WHERE o.order_number IN ('TUC/26-27/392', 'TUC/26-27/393');

-- =============================================================================
-- 4) UNIQUE constraints on orders
-- =============================================================================
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND contype IN ('u', 'p');

-- =============================================================================
-- 5) Ongoing monitor — possible twins in last 7 days (same customer, < 2 min apart)
-- =============================================================================
SELECT
  a.order_number AS first_no,
  b.order_number AS second_no,
  a.created_at AS first_at,
  b.created_at AS second_at,
  EXTRACT(EPOCH FROM (b.created_at - a.created_at)) AS seconds_apart,
  c.company_name AS customer_name
FROM public.orders a
JOIN public.orders b
  ON b.customer_id = a.customer_id
 AND b.id <> a.id
 AND b.created_at > a.created_at
 AND b.created_at < a.created_at + interval '2 minutes'
 AND coalesce(a.is_deleted, false) = false
 AND coalesce(b.is_deleted, false) = false
LEFT JOIN public.customers c ON c.id = a.customer_id
WHERE a.created_at > now() - interval '7 days'
  AND a.order_number ~ '^TUC/[0-9]{2}-[0-9]{2}/[0-9]+$'
ORDER BY b.created_at DESC
LIMIT 50;

-- =============================================================================
-- 6) Manual cleanup guidance (ops — do not run blindly)
-- =============================================================================
-- If 392 has line_count = 0, no receipts, no BOM:
--   Use existing soft-delete cascade for that order id (Orders page or RPC).
-- If both have lines: keep the complete order; soft-delete the duplicate after ops review.
-- If either has receipt/BOM/PO: do NOT delete — mark notes on duplicate only.
