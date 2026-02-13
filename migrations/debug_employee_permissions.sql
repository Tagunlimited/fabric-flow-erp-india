-- Check user-specific sidebar permissions
-- Replace 'EMPLOYEE_USER_ID' with the actual employee user ID

SELECT 
  usp.user_id,
  usp.sidebar_item_id,
  usp.can_view,
  usp.can_edit,
  usp.is_override,
  si.title,
  si.url,
  si.icon
FROM user_sidebar_permissions usp
JOIN sidebar_items si ON usp.sidebar_item_id = si.id
WHERE usp.user_id = 'EMPLOYEE_USER_ID'  -- Replace with actual user ID
ORDER BY si.sort_order;