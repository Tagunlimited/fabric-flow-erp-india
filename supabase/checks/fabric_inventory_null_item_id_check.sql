-- Spot-check for migration 20260507240000_backfill_fabric_inventory_item_id_by_identity.sql
-- Run BEFORE applying the migration, apply migration, then run AFTER.
-- Expect: fabric_rows_missing_item_id drops (often to 0).

SELECT COUNT(*) AS fabric_rows_missing_item_id
FROM public.warehouse_inventory wi
WHERE wi.item_type = 'FABRIC'
  AND wi.item_id IS NULL;

-- Sample remaining orphans (manual cleanup / data fix if count > 0)
-- SELECT wi.id, wi.quantity, wi.unit, wi.status, wi.bin_id, wi.grn_item_id, wi.item_name, wi.item_code
-- FROM public.warehouse_inventory wi
-- WHERE wi.item_type = 'FABRIC' AND wi.item_id IS NULL
-- LIMIT 50;

-- Manual UI verify (dev): open Cutting dialog for the affected fabric; console should show
-- [CuttingAvailabilityDebug] gross ≈ warehouse Inventory Total, allocated per allocations,
-- and fabricAvailability diagnostic rows with excluded_reason='included' for all warehouse rows.
