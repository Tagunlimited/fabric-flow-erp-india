-- Check role-based permissions (if any)

SELECT 
  rsp.role_id,
  rsp.sidebar_item_id,
  rsp.can_view,
  rsp.can_edit,
  si.title,
  si.url,
  si.icon
FROM role_sidebar_permissions rsp
JOIN sidebar_items si ON rsp.sidebar_item_id = si.id
WHERE rsp.role_id = 'employee'  -- or whatever role the employee has
ORDER BY si.sort_order;
