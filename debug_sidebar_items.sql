-- Check all sidebar items available

SELECT 
  id,
  title,
  url,
  icon,
  sort_order,
  is_active
FROM sidebar_items
WHERE is_active = true
ORDER BY sort_order;
