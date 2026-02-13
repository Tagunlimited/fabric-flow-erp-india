-- Script to find and remove duplicate sidebar items
-- Run this in your Supabase SQL editor

-- 1. First, let's see the duplicates
SELECT 
  title, 
  url, 
  parent_id, 
  COUNT(*) as count,
  array_agg(id ORDER BY created_at) as ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM sidebar_items
WHERE is_active = true
GROUP BY title, url, parent_id
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 2. Delete duplicates, keeping only the oldest one for each unique combination
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY title, url, parent_id 
      ORDER BY created_at ASC
    ) as row_num
  FROM sidebar_items
  WHERE is_active = true
)
DELETE FROM sidebar_items
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- 3. Verify no more duplicates exist
SELECT 
  title, 
  url, 
  parent_id, 
  COUNT(*) as count
FROM sidebar_items
WHERE is_active = true
GROUP BY title, url, parent_id
HAVING COUNT(*) > 1;

-- 4. Show final count
SELECT COUNT(*) as total_items FROM sidebar_items WHERE is_active = true;
SELECT COUNT(*) as parent_items FROM sidebar_items WHERE is_active = true AND parent_id IS NULL;
SELECT COUNT(*) as child_items FROM sidebar_items WHERE is_active = true AND parent_id IS NOT NULL;

SELECT '✅ Duplicates removed successfully!' as status;
