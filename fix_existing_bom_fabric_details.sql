-- Fix existing BOM items with NULL fabric details by parsing from item_name
-- This script updates the fabric_name, fabric_color, and fabric_gsm columns
-- by extracting the information from the item_name field

-- Update fabric items where fabric details are NULL
UPDATE public.bom_record_items 
SET 
  fabric_name = CASE 
    WHEN item_name ~ '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' THEN 
      TRIM(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$'))
    ELSE 
      item_name
  END,
  fabric_color = CASE 
    WHEN item_name ~ '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' THEN 
      TRIM(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' FOR 1 OFFSET LENGTH(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$')) + 3))
    ELSE 
      NULL
  END,
  fabric_gsm = CASE 
    WHEN item_name ~ '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' THEN 
      TRIM(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' FOR 1 OFFSET LENGTH(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$')) + LENGTH(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' FOR 1 OFFSET LENGTH(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$')) + 3)) + 3))
    ELSE 
      NULL
  END
WHERE 
  category = 'Fabric' 
  AND (fabric_name IS NULL OR fabric_color IS NULL OR fabric_gsm IS NULL)
  AND item_name IS NOT NULL;

-- Alternative approach using a more robust regex pattern
-- First, let's create a function to extract fabric details
CREATE OR REPLACE FUNCTION extract_fabric_details(item_name TEXT)
RETURNS TABLE(fabric_name TEXT, fabric_color TEXT, fabric_gsm TEXT) AS $$
BEGIN
  -- Pattern: "Name - Color - Number GSM"
  IF item_name ~ '^(.+?)\s*-\s*(.+?)\s*-\s*(\d+)\s+GSM$' THEN
    RETURN QUERY SELECT 
      TRIM(SUBSTRING(item_name FROM '^(.+?)\s*-\s*')),
      TRIM(SUBSTRING(item_name FROM '^(.+?)\s*-\s*(.+?)\s*-\s*' FOR 1 OFFSET LENGTH(SUBSTRING(item_name FROM '^(.+?)\s*-\s*')) + 3)),
      TRIM(SUBSTRING(item_name FROM '\s*-\s*(\d+)\s+GSM$' FOR 1 OFFSET 3))
    ;
  ELSE
    RETURN QUERY SELECT item_name, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Now update using the function
UPDATE public.bom_record_items 
SET 
  fabric_name = details.fabric_name,
  fabric_color = details.fabric_color,
  fabric_gsm = details.fabric_gsm
FROM (
  SELECT 
    id,
    (extract_fabric_details(item_name)).fabric_name,
    (extract_fabric_details(item_name)).fabric_color,
    (extract_fabric_details(item_name)).fabric_gsm
  FROM public.bom_record_items 
  WHERE category = 'Fabric' 
    AND (fabric_name IS NULL OR fabric_color IS NULL OR fabric_gsm IS NULL)
    AND item_name IS NOT NULL
) details
WHERE public.bom_record_items.id = details.id;

-- Check the results
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

-- Drop the temporary function
DROP FUNCTION IF EXISTS extract_fabric_details(TEXT);
