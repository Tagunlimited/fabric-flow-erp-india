-- Cutting availability: alias matching (fabric_for_supplier) + backfill manual fabric warehouse rows.

BEGIN;

-- 1) Server-side match rules aligned with client (fabric_for_supplier + linked row fabric_master).
CREATE OR REPLACE FUNCTION public.warehouse_row_matches_fabric_for_cutting(
  p_fabric_id uuid,
  p_wi public.warehouse_inventory
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fabric_master fm
    LEFT JOIN public.grn_items gi ON gi.id = p_wi.grn_item_id
    LEFT JOIN public.purchase_order_items poi ON poi.id = gi.po_item_id
    LEFT JOIN public.fabric_master fm_row ON fm_row.id = p_wi.item_id
    WHERE fm.id = p_fabric_id
      AND p_wi.item_type = 'FABRIC'
      AND (
        p_wi.item_id = p_fabric_id
        OR (gi.id IS NOT NULL AND poi.fabric_id = p_fabric_id)
        OR (
          lower(trim(COALESCE(gi.fabric_name, poi.fabric_name, split_part(p_wi.item_name, ' - ', 1), p_wi.item_name, ''))) IN (
            lower(trim(COALESCE(fm.fabric_name, ''))),
            lower(trim(COALESCE(fm.fabric_for_supplier, '')))
          )
          AND (
            trim(COALESCE(gi.fabric_color, gi.item_color, poi.fabric_color, '')) = ''
            OR trim(COALESCE(fm.color, '')) = ''
            OR lower(trim(COALESCE(gi.fabric_color, gi.item_color, poi.fabric_color, '')))
               = lower(trim(COALESCE(fm.color, '')))
          )
          AND (
            trim(COALESCE(gi.fabric_gsm::text, poi.fabric_gsm::text, '')) = ''
            OR trim(COALESCE(fm.gsm::text, '')) = ''
            OR lower(trim(COALESCE(gi.fabric_gsm::text, poi.fabric_gsm::text, '')))
               = lower(trim(COALESCE(fm.gsm::text, '')))
          )
        )
        OR (
          fm_row.id IS NOT NULL
          AND (
            lower(trim(COALESCE(fm_row.fabric_name, ''))) IN (
              lower(trim(COALESCE(fm.fabric_name, ''))),
              lower(trim(COALESCE(fm.fabric_for_supplier, '')))
            )
            OR lower(trim(COALESCE(fm_row.fabric_for_supplier, ''))) IN (
              lower(trim(COALESCE(fm.fabric_name, ''))),
              lower(trim(COALESCE(fm.fabric_for_supplier, '')))
            )
          )
          AND (
            trim(COALESCE(fm_row.color, '')) = ''
            OR trim(COALESCE(fm.color, '')) = ''
            OR lower(trim(COALESCE(fm_row.color, ''))) = lower(trim(COALESCE(fm.color, '')))
          )
          AND (
            trim(COALESCE(fm_row.gsm::text, '')) = ''
            OR trim(COALESCE(fm.gsm::text, '')) = ''
            OR lower(trim(COALESCE(fm_row.gsm::text, ''))) = lower(trim(COALESCE(fm.gsm::text, '')))
          )
        )
      )
  );
$$;

-- 2) Backfill item_id on manual / orphan FABRIC rows (no GRN) when identity is unique.
WITH orphan_rows AS (
  SELECT wi.id AS wi_id, wi.item_name
  FROM public.warehouse_inventory wi
  WHERE wi.item_type = 'FABRIC'
    AND wi.item_id IS NULL
    AND wi.grn_item_id IS NULL
    AND COALESCE(wi.quantity, 0) > 0
),
name_matches AS (
  SELECT
    o.wi_id,
    fm.id AS fabric_id,
    COUNT(*) OVER (PARTITION BY o.wi_id) AS match_count
  FROM orphan_rows o
  JOIN public.fabric_master fm ON (
    lower(trim(COALESCE(fm.fabric_name, ''))) = lower(trim(COALESCE(o.item_name, '')))
    OR lower(trim(COALESCE(fm.fabric_for_supplier, ''))) = lower(trim(COALESCE(o.item_name, '')))
    OR lower(trim(COALESCE(fm.fabric_name, ''))) = lower(trim(split_part(COALESCE(o.item_name, ''), ' - ', 1)))
  )
)
UPDATE public.warehouse_inventory wi
SET item_id = nm.fabric_id,
    updated_at = NOW()
FROM name_matches nm
WHERE wi.id = nm.wi_id
  AND nm.match_count = 1;

-- 3) Set fabric_for_supplier on order fabrics that have no warehouse stock but share color with a stocked fabric.
WITH stocked AS (
  SELECT DISTINCT fm.id AS stock_fabric_id, fm.fabric_name AS stock_name, fm.color AS stock_color
  FROM public.fabric_master fm
  JOIN public.warehouse_inventory wi ON wi.item_id = fm.id
  WHERE wi.item_type = 'FABRIC'
    AND COALESCE(wi.quantity, 0) > 0
    AND wi.status IN ('IN_STORAGE', 'READY_TO_DISPATCH')
),
order_fabrics AS (
  SELECT DISTINCT oi.fabric_id
  FROM public.order_items oi
  WHERE oi.fabric_id IS NOT NULL
),
needs_alias AS (
  SELECT
    of.fabric_id AS order_fabric_id,
    s.stock_fabric_id,
    s.stock_name,
    COUNT(*) OVER (PARTITION BY of.fabric_id) AS stock_match_count
  FROM order_fabrics of
  JOIN public.fabric_master fm_order ON fm_order.id = of.fabric_id
  JOIN stocked s ON s.stock_fabric_id <> fm_order.id
  WHERE (fm_order.fabric_for_supplier IS NULL OR trim(fm_order.fabric_for_supplier) = '')
    AND NOT EXISTS (
      SELECT 1 FROM public.warehouse_inventory wi2
      WHERE wi2.item_id = fm_order.id AND wi2.item_type = 'FABRIC' AND COALESCE(wi2.quantity, 0) > 0
    )
    AND (
      trim(COALESCE(fm_order.color, '')) = ''
      OR trim(COALESCE(s.stock_color, '')) = ''
      OR lower(trim(COALESCE(fm_order.color, ''))) = lower(trim(COALESCE(s.stock_color, '')))
    )
)
UPDATE public.fabric_master fm
SET fabric_for_supplier = na.stock_name
FROM needs_alias na
WHERE fm.id = na.order_fabric_id
  AND na.stock_match_count = 1;

COMMIT;
