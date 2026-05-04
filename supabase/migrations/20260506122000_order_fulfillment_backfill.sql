-- Backfill: lines without a chosen flow default to stitching (legacy behaviour).

UPDATE public.order_items oi
SET execution_flow = 'stitching'
WHERE oi.execution_flow IS NULL;
