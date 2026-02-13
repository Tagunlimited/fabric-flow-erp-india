-- Check sidebar items in database
SELECT 
  id, 
  title, 
  url, 
  parent_id, 
  sort_order,
  is_active
FROM sidebar_items
WHERE is_active = true
ORDER BY 
  CASE WHEN parent_id IS NULL THEN sort_order ELSE 999 END,
  parent_id,
  sort_order;
