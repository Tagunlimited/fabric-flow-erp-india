-- Simple fix for existing BOM fabric details
-- This script extracts fabric name, color, and GSM from item_name

-- Show current state
SELECT 'Current BOM Items with NULL fabric details:' as info;
SELECT 
  id,
  item_name,
  fabric_name,
  fabric_color,
  fabric_gsm,
  category
FROM public.bom_record_items 
WHERE category = 'Fabric' 
  AND (fabric_name IS NULL OR fabric_color IS NULL OR fabric_gsm IS NULL)
ORDER BY created_at DESC;

-- Update fabric_name (everything before the first " - ")
UPDATE public.bom_record_items 
SET fabric_name = TRIM(SPLIT_PART(item_name, ' - ', 1))
WHERE category = 'Fabric' 
  AND fabric_name IS NULL 
  AND item_name IS NOT NULL
  AND item_name LIKE '% - %';

-- Update fabric_color (everything between first and second " - ")
UPDATE public.bom_record_items 
SET fabric_color = TRIM(SPLIT_PART(SPLIT_PART(item_name, ' - ', 2), ' - ', 1))
WHERE category = 'Fabric' 
  AND fabric_color IS NULL 
  AND item_name IS NOT NULL
  AND item_name LIKE '% - % - %';

-- Update fabric_gsm (extract number before " GSM")
UPDATE public.bom_record_items 
SET fabric_gsm = TRIM(REGEXP_REPLACE(
  REGEXP_REPLACE(item_name, '.* - ', ''), 
  '\s+GSM.*', ''
))
WHERE category = 'Fabric' 
  AND fabric_gsm IS NULL 
  AND item_name IS NOT NULL
  AND item_name LIKE '% GSM';

-- Show updated results
SELECT 'Updated BOM Items:' as info;
SELECT 
  id,
  item_name,
  fabric_name,
  fabric_color,
  fabric_gsm,
  category
FROM public.bom_record_items 
WHERE category = 'Fabric'
ORDER BY created_at DESC;

-- Show summary
SELECT 'Summary:' as info;
SELECT 
  COUNT(*) as total_fabric_items,
  COUNT(fabric_name) as items_with_fabric_name,
  COUNT(fabric_color) as items_with_fabric_color,
  COUNT(fabric_gsm) as items_with_fabric_gsm
FROM public.bom_record_items 
WHERE category = 'Fabric';
