-- Add the missing Reports item to sidebar_items table
-- First check if it already exists
DO $$
BEGIN
    -- Check if Reports item already exists
    IF NOT EXISTS (SELECT 1 FROM sidebar_items WHERE title = 'Reports') THEN
        -- Insert the Reports item
        INSERT INTO sidebar_items (title, url, icon, sort_order, is_active) 
        VALUES ('Reports', '/reports', 'FileText', 14, true);
        
        RAISE NOTICE 'Reports item added successfully';
    ELSE
        -- Update existing Reports item
        UPDATE sidebar_items 
        SET url = '/reports', 
            icon = 'FileText', 
            sort_order = 14, 
            is_active = true
        WHERE title = 'Reports';
        
        RAISE NOTICE 'Reports item updated successfully';
    END IF;
END $$;

-- Verify it was added/updated
SELECT title, url, icon, sort_order, is_active 
FROM sidebar_items 
WHERE title = 'Reports';
