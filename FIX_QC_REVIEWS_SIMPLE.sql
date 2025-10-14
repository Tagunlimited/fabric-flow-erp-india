-- ============================================================================
-- FIX: QC Reviews Simple Fix
-- Generated: October 8, 2025
-- Description: Simple, direct fix for qc_reviews table to work with on_conflict
-- ============================================================================

-- ============================================================================
-- PART 1: FORCE REMOVE AND RECREATE QC_REVIEWS
-- ============================================================================

-- Force remove everything related to qc_reviews
DO $$
BEGIN
    -- Drop all constraints first
    BEGIN
        EXECUTE 'ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS fk_qc_reviews_assignment CASCADE';
        EXECUTE 'ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS uq_qc_reviews_assignment_size CASCADE';
        EXECUTE 'ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS qc_reviews_pkey CASCADE';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Drop the table
    BEGIN
        EXECUTE 'DROP TABLE IF EXISTS qc_reviews CASCADE';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Drop any views
    BEGIN
        EXECUTE 'DROP VIEW IF EXISTS qc_reviews CASCADE';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- ============================================================================
-- PART 2: CREATE SIMPLE QC_REVIEWS TABLE
-- ============================================================================

CREATE TABLE qc_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL,
    size_name TEXT NOT NULL,
    approved_quantity INTEGER DEFAULT 0,
    rejected_quantity INTEGER DEFAULT 0,
    remarks TEXT,
    reviewed_by UUID,
    reviewed_by_name TEXT,
    review_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: ADD ONLY THE ESSENTIAL CONSTRAINTS
-- ============================================================================

-- Add the unique constraint that on_conflict needs
ALTER TABLE qc_reviews 
ADD CONSTRAINT uq_qc_reviews_assignment_size 
UNIQUE (order_batch_assignment_id, size_name);

-- ============================================================================
-- PART 4: MINIMAL RLS SETUP
-- ============================================================================

-- Enable RLS
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;

-- Create simple policy that allows everything for authenticated users
CREATE POLICY "Allow all for authenticated users" ON qc_reviews 
FOR ALL USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- PART 5: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON qc_reviews TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 6: TEST THE SETUP
-- ============================================================================

SELECT 'QC Reviews table created successfully!' as status;

-- Test the unique constraint exists
SELECT 'Testing unique constraint:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'qc_reviews' 
  AND tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public';

-- Test inserting and upserting data
SELECT 'Testing insert and upsert:' as info;

-- Insert test data
INSERT INTO qc_reviews (order_batch_assignment_id, size_name, approved_quantity, rejected_quantity, remarks)
VALUES ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 5, 0, 'Test QC Approved');

-- Test upsert (this simulates what the app is trying to do)
INSERT INTO qc_reviews (order_batch_assignment_id, size_name, approved_quantity, rejected_quantity, remarks)
VALUES ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 3, 0, 'Updated QC')
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    updated_at = NOW();

-- Show the result
SELECT 'Final test data:' as info;
SELECT 
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    created_at,
    updated_at
FROM qc_reviews 
WHERE order_batch_assignment_id = '40aab0bf-7f3d-44e6-8cad-04e0295f1f52';
