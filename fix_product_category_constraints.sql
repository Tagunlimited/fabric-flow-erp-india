-- ============================================================================
-- PRODUCT CATEGORY DELETION FIX
-- Created: January 2025
-- Description: Fixes foreign key constraints that prevent product category deletion
-- ============================================================================

-- 1. CHECK CURRENT DEPENDENCIES
-- Run this query to see what's preventing deletion of a specific category
-- Replace 'CATEGORY_ID_HERE' with the actual category ID you want to delete

SELECT 
    'order_items' as table_name,
    COUNT(*) as reference_count
FROM order_items 
WHERE product_category_id = 'CATEGORY_ID_HERE'

UNION ALL

SELECT 
    'fabrics' as table_name,
    COUNT(*) as reference_count
FROM fabrics 
WHERE category_id = 'CATEGORY_ID_HERE'

UNION ALL

SELECT 
    'child_categories' as table_name,
    COUNT(*) as reference_count
FROM product_categories 
WHERE parent_category_id = 'CATEGORY_ID_HERE';

-- 2. OPTION A: UPDATE FOREIGN KEY CONSTRAINTS TO CASCADE DELETE
-- This will automatically delete related records when a category is deleted
-- WARNING: This will delete all order items and fabrics associated with the category

-- Update order_items foreign key to CASCADE
ALTER TABLE order_items 
DROP CONSTRAINT IF EXISTS order_items_product_category_id_fkey;

ALTER TABLE order_items 
ADD CONSTRAINT order_items_product_category_id_fkey 
FOREIGN KEY (product_category_id) 
REFERENCES product_categories(id) 
ON DELETE CASCADE;

-- Update fabrics foreign key to CASCADE  
ALTER TABLE fabrics 
DROP CONSTRAINT IF EXISTS fabrics_category_id_fkey;

ALTER TABLE fabrics 
ADD CONSTRAINT fabrics_category_id_fkey 
FOREIGN KEY (category_id) 
REFERENCES product_categories(id) 
ON DELETE CASCADE;

-- Update self-referencing foreign key to SET NULL
ALTER TABLE product_categories 
DROP CONSTRAINT IF EXISTS product_categories_parent_category_id_fkey;

ALTER TABLE product_categories 
ADD CONSTRAINT product_categories_parent_category_id_fkey 
FOREIGN KEY (parent_category_id) 
REFERENCES product_categories(id) 
ON DELETE SET NULL;

-- 3. OPTION B: UPDATE FOREIGN KEY CONSTRAINTS TO SET NULL
-- This will set the category references to NULL instead of deleting records
-- SAFER option - preserves data but may leave orphaned references

-- Uncomment these lines if you prefer SET NULL instead of CASCADE:

-- ALTER TABLE order_items 
-- DROP CONSTRAINT IF EXISTS order_items_product_category_id_fkey;
-- 
-- ALTER TABLE order_items 
-- ADD CONSTRAINT order_items_product_category_id_fkey 
-- FOREIGN KEY (product_category_id) 
-- REFERENCES product_categories(id) 
-- ON DELETE SET NULL;
-- 
-- ALTER TABLE fabrics 
-- DROP CONSTRAINT IF EXISTS fabrics_category_id_fkey;
-- 
-- ALTER TABLE fabrics 
-- ADD CONSTRAINT fabrics_category_id_fkey 
-- FOREIGN KEY (category_id) 
-- REFERENCES product_categories(id) 
-- ON DELETE SET NULL;

-- 4. CHECK CURRENT CONSTRAINTS
-- Run this to see current foreign key constraints
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND (tc.table_name IN ('order_items', 'fabrics', 'product_categories')
       OR ccu.table_name = 'product_categories')
ORDER BY tc.table_name, tc.constraint_name;

-- 5. TEST DELETION AFTER APPLYING FIXES
-- After running the constraint updates above, try deleting the category again
-- DELETE FROM product_categories WHERE id = 'CATEGORY_ID_HERE';
