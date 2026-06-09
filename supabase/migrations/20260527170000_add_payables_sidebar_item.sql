-- Accounts → Payables for DB-driven sidebar permissions.
-- Deactivates legacy "Payments" (/accounts/payments) when present.

UPDATE sidebar_items c
SET is_active = false
FROM sidebar_items p
WHERE c.parent_id = p.id
  AND p.title = 'Accounts'
  AND p.parent_id IS NULL
  AND c.url = '/accounts/payments';

INSERT INTO sidebar_items (title, url, icon, parent_id, sort_order)
SELECT 'Payables', '/accounts/payables', 'CreditCard', p.id, 6
FROM sidebar_items p
WHERE p.title = 'Accounts'
  AND p.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sidebar_items c
    WHERE c.parent_id = p.id
      AND c.url = '/accounts/payables'
  );

INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
SELECT rsp.role_id, pay.id, rsp.can_view, rsp.can_edit
FROM role_sidebar_permissions rsp
JOIN sidebar_items rec ON rec.id = rsp.sidebar_item_id AND rec.url = '/accounts/receipts'
JOIN sidebar_items pay
  ON pay.url = '/accounts/payables'
 AND pay.parent_id = rec.parent_id
WHERE NOT EXISTS (
  SELECT 1
  FROM role_sidebar_permissions x
  WHERE x.role_id = rsp.role_id
    AND x.sidebar_item_id = pay.id
);
