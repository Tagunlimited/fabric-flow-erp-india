-- BOM & PO color diagnostic
-- Run in Supabase SQL Editor (run each numbered block separately, or all at once).
-- Edit params.po_number / bom_number / order_number in EACH section below.

-- =============================================================================
-- 1) Do the color columns exist?
-- =============================================================================
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('bom_record_items', 'purchase_order_items')
  AND column_name IN (
    'fabric_color',
    'fabric_gsm',
    'fabric_name',
    'selected_colors',
    'item_color'
  )
ORDER BY table_name, column_name;

-- =============================================================================
-- 2–3) BOM header for your PO / BOM / order
-- =============================================================================
WITH params AS (
  SELECT
    'TUC/PO/0135'::text AS po_number,   -- PO from screenshot
    NULL::text          AS bom_number,  -- e.g. 'BOM/...'
    NULL::text          AS order_number -- e.g. 'TUC/26-27/020'
),
po_ctx AS (
  SELECT
    po.id AS po_id,
    po.po_number,
    po.bom_id,
    br.bom_number,
    br.order_id,
    o.order_number AS linked_order_number
  FROM params p
  JOIN public.purchase_orders po ON po.is_deleted = false
  LEFT JOIN public.bom_records br ON br.id = po.bom_id
  LEFT JOIN public.orders o ON o.id = br.order_id
  WHERE
    (p.po_number IS NOT NULL AND po.po_number = p.po_number)
    OR (p.bom_number IS NOT NULL AND br.bom_number = p.bom_number)
    OR (p.order_number IS NOT NULL AND o.order_number = p.order_number)
  LIMIT 1
),
bom_ids AS (
  SELECT DISTINCT c.bom_id AS bom_id
  FROM po_ctx c
  WHERE c.bom_id IS NOT NULL
  UNION
  SELECT DISTINCT bpi.bom_id
  FROM po_ctx c
  JOIN public.bom_po_items bpi ON bpi.po_id = c.po_id
  WHERE bpi.bom_id IS NOT NULL
)
SELECT
  br.id AS bom_id,
  br.bom_number,
  o.order_number,
  br.product_name,
  br.created_at
FROM bom_ids bi
JOIN public.bom_records br ON br.id = bi.bom_id
LEFT JOIN public.orders o ON o.id = br.order_id;

-- =============================================================================
-- 4) BOM line items — color fields per row
-- =============================================================================
WITH params AS (
  SELECT
    'TUC/PO/0135'::text AS po_number,
    NULL::text          AS bom_number,
    NULL::text          AS order_number
),
po_ctx AS (
  SELECT
    po.id AS po_id,
    po.bom_id
  FROM params p
  JOIN public.purchase_orders po ON po.is_deleted = false
  LEFT JOIN public.bom_records br ON br.id = po.bom_id
  LEFT JOIN public.orders o ON o.id = br.order_id
  WHERE
    (p.po_number IS NOT NULL AND po.po_number = p.po_number)
    OR (p.bom_number IS NOT NULL AND br.bom_number = p.bom_number)
    OR (p.order_number IS NOT NULL AND o.order_number = p.order_number)
  LIMIT 1
),
bom_ids AS (
  SELECT DISTINCT c.bom_id AS bom_id
  FROM po_ctx c
  WHERE c.bom_id IS NOT NULL
  UNION
  SELECT DISTINCT bpi.bom_id
  FROM po_ctx c
  JOIN public.bom_po_items bpi ON bpi.po_id = c.po_id
  WHERE bpi.bom_id IS NOT NULL
)
SELECT
  br.bom_number,
  bri.id AS bom_item_id,
  bri.category,
  bri.item_name,
  bri.item_code,
  bri.fabric_name,
  bri.fabric_color,
  bri.fabric_gsm,
  bri.selected_colors,
  jsonb_array_length(COALESCE(bri.selected_colors, '[]'::jsonb)) AS selected_colors_count,
  bri.selected_colors->0->>'colorName' AS first_color_name,
  CASE
    WHEN lower(COALESCE(bri.category, '')) = 'fabric' THEN
      CASE
        WHEN bri.fabric_color IS NOT NULL AND trim(bri.fabric_color) NOT IN ('', 'N/A')
        THEN 'OK (fabric_color)'
        ELSE 'MISSING fabric_color'
      END
    ELSE
      CASE
        WHEN bri.selected_colors IS NOT NULL
          AND bri.selected_colors <> '[]'::jsonb
          AND jsonb_array_length(bri.selected_colors) > 0
        THEN 'OK (selected_colors)'
        WHEN bri.fabric_color IS NOT NULL AND trim(bri.fabric_color) NOT IN ('', 'N/A')
        THEN 'OK (legacy fabric_color on item row)'
        ELSE 'MISSING item colors'
      END
  END AS color_status
FROM bom_ids bi
JOIN public.bom_records br ON br.id = bi.bom_id
JOIN public.bom_record_items bri ON bri.bom_id = br.id
ORDER BY br.bom_number, bri.category, bri.item_name;

-- =============================================================================
-- 5) PO lines linked to BOM — compare PO vs BOM colors
-- =============================================================================
WITH params AS (
  SELECT
    'TUC/PO/0135'::text AS po_number,
    NULL::text          AS bom_number,
    NULL::text          AS order_number
),
po_ctx AS (
  SELECT
    po.id AS po_id,
    po.po_number
  FROM params p
  JOIN public.purchase_orders po ON po.is_deleted = false
  LEFT JOIN public.bom_records br ON br.id = po.bom_id
  LEFT JOIN public.orders o ON o.id = br.order_id
  WHERE
    (p.po_number IS NOT NULL AND po.po_number = p.po_number)
    OR (p.bom_number IS NOT NULL AND br.bom_number = p.bom_number)
    OR (p.order_number IS NOT NULL AND o.order_number = p.order_number)
  LIMIT 1
)
SELECT
  c.po_number,
  poi.id AS po_item_id,
  poi.item_type,
  poi.item_name,
  poi.fabric_color AS po_fabric_color,
  poi.item_color AS po_item_color,
  poi.selected_colors AS po_selected_colors,
  bpi.bom_item_id,
  bri.fabric_color AS bom_fabric_color,
  bri.selected_colors AS bom_selected_colors,
  CASE
    WHEN poi.item_type = 'fabric' THEN
      CASE
        WHEN poi.fabric_color IS NOT NULL AND trim(poi.fabric_color) NOT IN ('', 'N/A')
        THEN 'PO has fabric color'
        WHEN bri.fabric_color IS NOT NULL AND trim(bri.fabric_color) NOT IN ('', 'N/A')
        THEN 'BOM has color — PO missing (run backfill or re-save PO)'
        ELSE 'No color on PO or BOM'
      END
    ELSE
      CASE
        WHEN poi.selected_colors IS NOT NULL AND poi.selected_colors <> '[]'::jsonb
        THEN 'PO has selected_colors'
        WHEN poi.item_color IS NOT NULL AND trim(poi.item_color) <> ''
        THEN 'PO has item_color'
        WHEN bri.selected_colors IS NOT NULL AND bri.selected_colors <> '[]'::jsonb
        THEN 'BOM has selected_colors — PO missing (run backfill or re-save PO)'
        ELSE 'No color on PO or BOM'
      END
  END AS diagnosis
FROM po_ctx c
JOIN public.purchase_order_items poi ON poi.po_id = c.po_id
LEFT JOIN public.bom_po_items bpi ON bpi.po_item_id = poi.id
LEFT JOIN public.bom_record_items bri ON bri.id = bpi.bom_item_id
ORDER BY poi.item_name, poi.id;

-- =============================================================================
-- 6) Summary counts for this PO
-- =============================================================================
WITH params AS (
  SELECT
    'TUC/PO/0135'::text AS po_number,
    NULL::text          AS bom_number,
    NULL::text          AS order_number
),
po_ctx AS (
  SELECT
    po.id AS po_id,
    po.bom_id
  FROM params p
  JOIN public.purchase_orders po ON po.is_deleted = false
  LEFT JOIN public.bom_records br ON br.id = po.bom_id
  LEFT JOIN public.orders o ON o.id = br.order_id
  WHERE
    (p.po_number IS NOT NULL AND po.po_number = p.po_number)
    OR (p.bom_number IS NOT NULL AND br.bom_number = p.bom_number)
    OR (p.order_number IS NOT NULL AND o.order_number = p.order_number)
  LIMIT 1
),
bom_ids AS (
  SELECT DISTINCT c.bom_id AS bom_id
  FROM po_ctx c
  WHERE c.bom_id IS NOT NULL
  UNION
  SELECT DISTINCT bpi.bom_id
  FROM po_ctx c
  JOIN public.bom_po_items bpi ON bpi.po_id = c.po_id
  WHERE bpi.bom_id IS NOT NULL
)
SELECT
  'BOM lines' AS scope,
  count(*) AS total_lines,
  count(*) FILTER (
    WHERE lower(COALESCE(bri.category, '')) = 'fabric'
      AND bri.fabric_color IS NOT NULL AND trim(bri.fabric_color) NOT IN ('', 'N/A')
  ) AS fabric_with_color,
  count(*) FILTER (
    WHERE lower(COALESCE(bri.category, '')) <> 'fabric'
      AND bri.selected_colors IS NOT NULL
      AND bri.selected_colors <> '[]'::jsonb
  ) AS items_with_selected_colors,
  count(*) FILTER (
    WHERE (
      lower(COALESCE(bri.category, '')) = 'fabric'
      AND (bri.fabric_color IS NULL OR trim(bri.fabric_color) IN ('', 'N/A'))
    ) OR (
      lower(COALESCE(bri.category, '')) <> 'fabric'
      AND (bri.selected_colors IS NULL OR bri.selected_colors = '[]'::jsonb)
      AND (bri.fabric_color IS NULL OR trim(bri.fabric_color) IN ('', 'N/A'))
    )
  ) AS lines_missing_color
FROM bom_ids bi
JOIN public.bom_record_items bri ON bri.bom_id = bi.bom_id;
