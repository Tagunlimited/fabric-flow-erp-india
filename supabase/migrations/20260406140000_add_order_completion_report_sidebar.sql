-- Add Production → Order Completion Report for DB-driven sidebar permissions.
-- Idempotent: skips if a child with this URL already exists under Production.

INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT 'Order Completion Report', '/production/order-completion-report', 'ClipboardList', p.id, 5
FROM sidebar_items p
WHERE p.title = 'Production'
  AND p.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sidebar_items c
    WHERE c.parent_id = p.id
      AND c.url = '/production/order-completion-report'
  );

-- Grant the new item to every role that already has Tailor Management, mirroring view/edit flags.
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT rsp.role_id, report.id, rsp.can_view, rsp.can_edit
FROM role_sidebar_permissions rsp
JOIN sidebar_items tailor ON tailor.id = rsp.sidebar_item_id AND tailor.url = '/production/tailor-management'
JOIN sidebar_items report
  ON report.url = '/production/order-completion-report'
 AND report.parent_id = tailor.parent_id
WHERE NOT EXISTS (
  SELECT 1
  FROM role_sidebar_permissions x
  WHERE x.role_id = rsp.role_id
    AND x.sidebar_item_id = report.id
);
