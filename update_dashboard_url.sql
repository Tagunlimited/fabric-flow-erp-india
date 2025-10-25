-- Update Dashboard URL from / to /dashboard
-- Run this in your Supabase SQL editor

UPDATE sidebar_items 
SET url = '/dashboard' 
WHERE title = 'Dashboard' AND url = '/';

-- Verify the update
SELECT title, url, icon, sort_order 
FROM sidebar_items 
WHERE title = 'Dashboard';
