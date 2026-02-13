-- Fix NULL URLs in sidebar_items table
-- Run this in your Supabase SQL editor

-- Update Dashboard URL (if it's still /)
UPDATE sidebar_items 
SET url = '/dashboard' 
WHERE title = 'Dashboard' AND (url = '/' OR url IS NULL);

-- Update other items with correct URLs
UPDATE sidebar_items 
SET url = '/orders' 
WHERE title = 'Orders' AND url IS NULL;

UPDATE sidebar_items 
SET url = '/design' 
WHERE title = 'Design & Printing' AND url IS NULL;

UPDATE sidebar_items 
SET url = '/quality' 
WHERE title = 'Quality Check' AND url IS NULL;

UPDATE sidebar_items 
SET url = '/configuration' 
WHERE title = 'Configuration' AND url IS NULL;

UPDATE sidebar_items 
SET url = '/reports' 
WHERE title = 'Reports' AND url IS NULL;

-- Verify the updates
SELECT title, url, icon, sort_order 
FROM sidebar_items 
WHERE is_active = true 
ORDER BY sort_order;
