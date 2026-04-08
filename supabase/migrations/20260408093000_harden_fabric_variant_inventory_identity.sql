-- Prevent cross-variant merges by enforcing variant-safe uniqueness for active warehouse rows.
-- For fabrics, identity must be keyed by item_id (fabric_id) + bin/status/unit.
-- For non-fabric rows, preserve existing item_id-based uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS ux_wh_fabric_variant_active
ON public.warehouse_inventory (item_id, bin_id, status, unit)
WHERE item_type = 'FABRIC' AND item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wh_non_fabric_item_active
ON public.warehouse_inventory (item_id, bin_id, status, unit)
WHERE item_type <> 'FABRIC' AND item_id IS NOT NULL;

-- Diagnostics: fabric rows that still rely on name-only identity (missing item_id).
CREATE OR REPLACE VIEW public.v_warehouse_fabric_rows_missing_item_id AS
SELECT
  wi.id,
  wi.item_name,
  wi.item_code,
  wi.bin_id,
  wi.status,
  wi.unit,
  wi.quantity,
  wi.received_date,
  wi.created_at,
  wi.updated_at
FROM public.warehouse_inventory wi
WHERE wi.item_type = 'FABRIC'
  AND wi.item_id IS NULL;

-- Diagnostics: suspicious name collisions where one normalized name maps to multiple fabric IDs.
CREATE OR REPLACE VIEW public.v_warehouse_fabric_name_id_collisions AS
WITH base AS (
  SELECT
    lower(trim(item_name)) AS norm_item_name,
    item_id
  FROM public.warehouse_inventory
  WHERE item_type = 'FABRIC'
    AND item_id IS NOT NULL
)
SELECT
  norm_item_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT item_id) AS distinct_fabric_ids
FROM base
GROUP BY norm_item_name
HAVING COUNT(DISTINCT item_id) > 1;
