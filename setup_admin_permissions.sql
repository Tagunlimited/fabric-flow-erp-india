-- Setup admin permissions for sidebar items
-- This script grants all sidebar permissions to the admin role

-- First, let's see what roles exist
SELECT id, name FROM roles;

-- Get the admin role ID (assuming it's the one with name containing 'admin' or similar)
-- Replace 'YOUR_ADMIN_ROLE_ID' with the actual admin role ID from the query above

-- Grant all sidebar permissions to admin role
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT 
  r.id as role_id,
  si.id as sidebar_item_id,
  true as can_view,
  true as can_edit
FROM roles r
CROSS JOIN sidebar_items si
WHERE r.name ILIKE '%admin%' OR r.name ILIKE '%mukesh%'  -- Adjust this condition based on your admin role name
ON CONFLICT (role_id, sidebar_item_id) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit;

-- Verify the permissions were created
SELECT 
  r.name as role_name,
  si.title as sidebar_item,
  rsp.can_view,
  rsp.can_edit
FROM role_sidebar_permissions rsp
JOIN roles r ON r.id = rsp.role_id
JOIN sidebar_items si ON si.id = rsp.sidebar_item_id
ORDER BY r.name, si.sort_order;
