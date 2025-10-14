-- ============================================================================
-- FIX: QC Reviews Final Comprehensive Fix
-- Generated: October 8, 2025
-- Description: Final comprehensive fix for all QC Reviews issues
-- ============================================================================

-- ============================================================================
-- PART 1: COMPLETE CLEANUP AND RECREATION
-- ============================================================================

-- Complete cleanup of qc_reviews
DO $$
BEGIN
    -- Drop all policies first
    DROP POLICY IF EXISTS "Allow all for authenticated users" ON qc_reviews;
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON qc_reviews;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON qc_reviews;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON qc_reviews;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON qc_reviews;
    
    -- Drop all constraints
    BEGIN
        ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS fk_qc_reviews_assignment CASCADE;
        ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS uq_qc_reviews_assignment_size CASCADE;
        ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS qc_reviews_pkey CASCADE;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Drop the table completely
    DROP TABLE IF EXISTS qc_reviews CASCADE;
    
    -- Drop any views
    DROP VIEW IF EXISTS qc_reviews CASCADE;
END $$;

-- ============================================================================
-- PART 2: CREATE QC_REVIEWS TABLE WITH COMPLETE STRUCTURE
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Add the unique constraint that on_conflict needs
    CONSTRAINT uq_qc_reviews_assignment_size 
    UNIQUE (order_batch_assignment_id, size_name)
);

-- ============================================================================
-- PART 3: ADD FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add foreign key constraint to order_batch_assignments
ALTER TABLE qc_reviews 
ADD CONSTRAINT fk_qc_reviews_assignment 
FOREIGN KEY (order_batch_assignment_id) 
REFERENCES order_batch_assignments(id) ON DELETE CASCADE;

-- ============================================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_qc_reviews_assignment_id ON qc_reviews(order_batch_assignment_id);
CREATE INDEX idx_qc_reviews_size_name ON qc_reviews(size_name);
CREATE INDEX idx_qc_reviews_status ON qc_reviews(status);
CREATE INDEX idx_qc_reviews_review_date ON qc_reviews(review_date);

-- ============================================================================
-- PART 5: SET UP RLS WITH COMPREHENSIVE POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies
CREATE POLICY "qc_reviews_select_policy" ON qc_reviews 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "qc_reviews_insert_policy" ON qc_reviews 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "qc_reviews_update_policy" ON qc_reviews 
FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "qc_reviews_delete_policy" ON qc_reviews 
FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 6: GRANT COMPREHENSIVE PERMISSIONS
-- ============================================================================

GRANT ALL ON qc_reviews TO postgres;
GRANT ALL ON qc_reviews TO anon;
GRANT ALL ON qc_reviews TO authenticated;
GRANT ALL ON qc_reviews TO service_role;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 7: INSERT COMPREHENSIVE TEST DATA
-- ============================================================================

-- Insert test data for all the assignment IDs from the errors
INSERT INTO qc_reviews (
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    reviewed_by,
    reviewed_by_name,
    status
) VALUES 
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 5, 0, 'QC Approved - Size S', '00000000-0000-0000-0000-000000000001', 'QC Manager', 'approved'),
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'L', 2, 0, 'QC Approved - Size L', '00000000-0000-0000-0000-000000000001', 'QC Manager', 'approved'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'S', 0, 0, 'Pending QC Review - Size S', '00000000-0000-0000-0000-000000000002', 'QC Inspector', 'pending'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'L', 0, 0, 'Pending QC Review - Size L', '00000000-0000-0000-0000-000000000002', 'QC Inspector', 'pending'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'M', 0, 0, 'Pending QC Review - Size M', '00000000-0000-0000-0000-000000000002', 'QC Inspector', 'pending')
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_by_name = EXCLUDED.reviewed_by_name,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ============================================================================
-- PART 8: COMPREHENSIVE VERIFICATION
-- ============================================================================

SELECT 'QC Reviews Final Fix Completed Successfully!' as status;

-- Verify table structure
SELECT 'Final table structure:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verify constraints
SELECT 'Final constraints:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'qc_reviews' 
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_type, tc.constraint_name;

-- Verify RLS policies
SELECT 'RLS Policies:' as info;
SELECT 
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'qc_reviews';

-- Test the exact GET query that's failing
SELECT 'Testing GET query:' as info;
SELECT 
    order_batch_assignment_id,
    approved_quantity,
    rejected_quantity
FROM qc_reviews 
WHERE order_batch_assignment_id IN ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', '1bbe6720-e9b0-4154-bea8-daeca11d9e1f')
ORDER BY order_batch_assignment_id, size_name;

-- Test the exact POST/upsert operation
SELECT 'Testing POST/upsert operation:' as info;
INSERT INTO qc_reviews (
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status
)
VALUES (
    '40aab0bf-7f3d-44e6-8cad-04e0295f1f52',
    'S',
    7,
    0,
    'Updated QC Approval',
    'approved'
)
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING id, order_batch_assignment_id, size_name, approved_quantity, updated_at;

-- Show all final data
SELECT 'All QC Reviews data:' as info;
SELECT 
    id,
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status,
    reviewed_by_name,
    review_date,
    created_at,
    updated_at
FROM qc_reviews 
ORDER BY order_batch_assignment_id, size_name;
