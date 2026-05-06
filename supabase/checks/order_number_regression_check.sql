-- Order-number regression check
-- Expectation: every row returns legacy_count = 0
-- Safe before/after hardening migration.

DO $$
BEGIN
  IF to_regclass('public.v_order_number_legacy_audit') IS NOT NULL THEN
    RAISE NOTICE 'Using view public.v_order_number_legacy_audit';
  ELSE
    RAISE NOTICE 'View public.v_order_number_legacy_audit not found; using direct fallback checks';
  END IF;
END $$;

-- Direct check (always works; no dependency on the view)
SELECT 'orders.order_number'::text AS source, COUNT(*)::bigint AS legacy_count
FROM public.orders
WHERE order_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$'
UNION ALL
SELECT 'receipts.reference_number', COUNT(*)::bigint
FROM public.receipts
WHERE lower(coalesce(reference_type, '')) = 'order'
  AND reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$'
UNION ALL
SELECT 'inventory_logs.reference_number', COUNT(*)::bigint
FROM public.inventory_logs
WHERE lower(coalesce(reference_type, '')) = 'order'
  AND reference_number ~ '^(TUC|RMO)/[0-9]{2}-[0-9]{2}/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/[0-9]+$';
