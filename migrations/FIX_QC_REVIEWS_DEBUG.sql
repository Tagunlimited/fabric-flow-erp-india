-- ============================================================================
-- FIX: QC Reviews Debug and Complete Fix
-- Generated: October 8, 2025
-- Description: Debug and fix qc_reviews table issues step by step
-- ============================================================================

-- ============================================================================
-- PART 1: DEBUG CURRENT STATE
-- ============================================================================

-- Check if qc_reviews exists and what type it is
SELECT 'Checking qc_reviews existence:' as info;
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public';

-- Check if it's a view
SELECT 'Checking if qc_reviews is a view:' as info;
SELECT 
    table_name,
    view_definition
FROM information_schema.views 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public';

-- ============================================================================
-- PART 2: SAFELY REMOVE EXISTING QC_REVIEWS
-- ============================================================================

-- Remove existing qc_reviews completely
DO $$
BEGIN
    -- Drop any existing constraints first
    BEGIN
        ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS fk_qc_reviews_assignment CASCADE;
        ALTER TABLE qc_reviews DROP CONSTRAINT IF EXISTS uq_qc_reviews_assignment_size CASCADE;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Drop the table completely
    BEGIN
        DROP TABLE qc_reviews CASCADE;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    -- Drop any view
    BEGIN
        DROP VIEW qc_reviews CASCADE;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- ============================================================================
-- PART 3: CREATE QC_REVIEWS TABLE FROM SCRATCH
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
-- PART 4: ADD FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add foreign key constraint
ALTER TABLE qc_reviews 
ADD CONSTRAINT fk_qc_reviews_assignment 
FOREIGN KEY (order_batch_assignment_id) 
REFERENCES order_batch_assignments(id) ON DELETE CASCADE;

-- Add unique constraint for on_conflict parameter
ALTER TABLE qc_reviews 
ADD CONSTRAINT uq_qc_reviews_assignment_size 
UNIQUE (order_batch_assignment_id, size_name);

-- ============================================================================
-- PART 5: CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_qc_reviews_assignment_id ON qc_reviews(order_batch_assignment_id);
CREATE INDEX idx_qc_reviews_size_name ON qc_reviews(size_name);
CREATE INDEX idx_qc_reviews_status ON qc_reviews(status);

-- ============================================================================
-- PART 6: SET UP RLS
-- ============================================================================

-- Enable RLS
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON qc_reviews;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON qc_reviews;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON qc_reviews;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON qc_reviews;

-- Create new policies
CREATE POLICY "Enable read access for authenticated users" ON qc_reviews 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON qc_reviews 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON qc_reviews 
FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON qc_reviews 
FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON qc_reviews TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 8: INSERT TEST DATA
-- ============================================================================

-- Insert test data for the assignment IDs from the error
INSERT INTO qc_reviews (
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status
) VALUES 
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 5, 0, 'Test QC Approved', 'approved'),
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'L', 2, 0, 'Test QC Approved', 'approved'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'S', 0, 0, 'Test Pending QC', 'pending'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'L', 0, 0, 'Test Pending QC', 'pending')
ON CONFLICT (order_batch_assignment_id, size_name) DO UPDATE SET
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ============================================================================
-- PART 9: VERIFICATION AND TESTING
-- ============================================================================

SELECT 'QC Reviews table created and configured successfully!' as status;

-- Test table structure
SELECT 'Final table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test constraints
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

-- Test the exact GET query that's failing
SELECT 'Testing GET query:' as info;
SELECT 
    order_batch_assignment_id,
    approved_quantity,
    rejected_quantity
FROM qc_reviews 
WHERE order_batch_assignment_id IN ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', '1bbe6720-e9b0-4154-bea8-daeca11d9e1f');

-- Test upsert operation (simulating the POST request)
SELECT 'Testing upsert operation:' as info;
SELECT 
    'Simulating upsert with on_conflict=order_batch_assignment_id,size_name' as test_description;

-- Show all test data
SELECT 'All QC Reviews data:' as info;
SELECT 
    id,
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status,
    review_date
FROM qc_reviews 
ORDER BY order_batch_assignment_id, size_name;
