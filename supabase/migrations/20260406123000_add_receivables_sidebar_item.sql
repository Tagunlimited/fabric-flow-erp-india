-- Add Accounts → Receivables for DB-driven sidebar permissions.
-- Idempotent: skips if a child with this URL already exists under Accounts.

INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT 'Receivables', '/accounts/receivables', 'Wallet', p.id, 5
FROM sidebar_items p
WHERE p.title = 'Accounts'
  AND p.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sidebar_items c
    WHERE c.parent_id = p.id
      AND c.url = '/accounts/receivables'
  );

-- Grant the new item to every role that already has Receipts, mirroring view/edit flags.
INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT rsp.role_id, recv.id, rsp.can_view, rsp.can_edit
FROM role_sidebar_permissions rsp
JOIN sidebar_items rec ON rec.id = rsp.sidebar_item_id AND rec.url = '/accounts/receipts'
JOIN sidebar_items recv
  ON recv.url = '/accounts/receivables'
 AND recv.parent_id = rec.parent_id
WHERE NOT EXISTS (
  SELECT 1
  FROM role_sidebar_permissions x
  WHERE x.role_id = rsp.role_id
    AND x.sidebar_item_id = recv.id
);
