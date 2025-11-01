-- Simple script to add Reports item
-- This will work even if the item already exists

-- Try to insert the Reports item
INSERT INTO sidebar_items (title, url, icon, sort_order, is_active) 
VALUES ('Reports', '/reports', 'FileText', 14, true);

-- If the above fails because the item exists, run this update instead:
-- UPDATE sidebar_items 
-- SET url = '/reports', icon = 'FileText', sort_order = 14, is_active = true
-- WHERE title = 'Reports';

-- Verify the result
SELECT title, url, icon, sort_order, is_active 
FROM sidebar_items 
WHERE title = 'Reports'
ORDER BY sort_order;
