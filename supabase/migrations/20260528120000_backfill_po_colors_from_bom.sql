-- Backfill missing purchase order line colors from linked BOM rows.
-- Ensures required columns exist (idempotent if earlier migrations were skipped).

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS item_color VARCHAR(100);

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS selected_colors JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.purchase_order_items poi
SET fabric_color = bri.fabric_color
FROM public.bom_po_items bpi
JOIN public.bom_record_items bri ON bri.id = bpi.bom_item_id
WHERE bpi.po_item_id = poi.id
  AND poi.item_type = 'fabric'
  AND (poi.fabric_color IS NULL OR trim(poi.fabric_color) = '' OR poi.fabric_color = 'N/A')
  AND bri.fabric_color IS NOT NULL
  AND trim(bri.fabric_color) <> '';

UPDATE public.purchase_order_items poi
SET
  selected_colors = COALESCE(bri.selected_colors, '[]'::jsonb),
  item_color = COALESCE(
    NULLIF(trim(poi.item_color), ''),
    NULLIF(trim(bri.selected_colors->0->>'colorName'), '')
  )
FROM public.bom_po_items bpi
JOIN public.bom_record_items bri ON bri.id = bpi.bom_item_id
WHERE bpi.po_item_id = poi.id
  AND poi.item_type <> 'fabric'
  AND (
    poi.selected_colors IS NULL
    OR poi.selected_colors = '[]'::jsonb
    OR poi.item_color IS NULL
    OR trim(poi.item_color) = ''
  )
  AND (
    (bri.selected_colors IS NOT NULL AND bri.selected_colors <> '[]'::jsonb)
    OR NULLIF(trim(bri.fabric_color), '') IS NOT NULL
  );

-- Item lines that only have fabric_color on BOM (legacy rows): copy to item_color.
UPDATE public.purchase_order_items poi
SET item_color = bri.fabric_color
FROM public.bom_po_items bpi
JOIN public.bom_record_items bri ON bri.id = bpi.bom_item_id
WHERE bpi.po_item_id = poi.id
  AND poi.item_type <> 'fabric'
  AND (poi.item_color IS NULL OR trim(poi.item_color) = '')
  AND (poi.selected_colors IS NULL OR poi.selected_colors = '[]'::jsonb)
  AND bri.fabric_color IS NOT NULL
  AND trim(bri.fabric_color) <> '';
