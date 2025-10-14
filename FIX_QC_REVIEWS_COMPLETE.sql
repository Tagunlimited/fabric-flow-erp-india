-- ============================================================================
-- FIX: QC Reviews Complete Fix
-- Generated: October 8, 2025
-- Description: Complete fix for qc_reviews table to support QC approval functionality
-- ============================================================================

-- ============================================================================
-- PART 1: ENSURE QC_REVIEWS TABLE EXISTS WITH ALL REQUIRED COLUMNS
-- ============================================================================

-- Drop existing qc_reviews if it exists (whether view or table)
DO $$
BEGIN
    -- Try to drop as view first
    BEGIN
        DROP VIEW IF EXISTS qc_reviews CASCADE;
    EXCEPTION WHEN OTHERS THEN
        -- If it fails, it's probably a table, so drop as table
        NULL;
    END;
    
    -- Try to drop as table
    BEGIN
        DROP TABLE IF EXISTS qc_reviews CASCADE;
    EXCEPTION WHEN OTHERS THEN
        -- If it fails, continue anyway
        NULL;
    END;
END $$;

-- Create qc_reviews table with all required columns for QC functionality
CREATE TABLE qc_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_batch_assignment_id UUID NOT NULL,
    size_name TEXT NOT NULL,
    approved_quantity INTEGER DEFAULT 0,  -- Required by QC GET request
    rejected_quantity INTEGER DEFAULT 0,
    remarks TEXT,
    reviewed_by UUID,
    reviewed_by_name TEXT,
    review_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_qc_reviews_assignment 
    FOREIGN KEY (order_batch_assignment_id) 
    REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
    CONSTRAINT uq_qc_reviews_assignment_size 
    UNIQUE (order_batch_assignment_id, size_name)
);

-- ============================================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_qc_reviews_assignment_id ON qc_reviews(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_size_name ON qc_reviews(size_name);
CREATE INDEX IF NOT EXISTS idx_qc_reviews_status ON qc_reviews(status);

-- ============================================================================
-- PART 3: SET UP RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;

-- Create policies for qc_reviews
CREATE POLICY "Enable read access for authenticated users" ON qc_reviews 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON qc_reviews 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON qc_reviews 
FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON qc_reviews 
FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 4: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON qc_reviews TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 5: INSERT SAMPLE QC REVIEW DATA FOR TESTING
-- ============================================================================

-- Insert sample QC review data for the assignment IDs mentioned in the error
INSERT INTO qc_reviews (
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status
) VALUES 
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 5, 0, 'QC Approved', 'approved'),
    ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'L', 2, 0, 'QC Approved', 'approved'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'S', 0, 0, 'Pending QC Review', 'pending'),
    ('1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 'L', 0, 0, 'Pending QC Review', 'pending')
ON CONFLICT (order_batch_assignment_id, size_name) DO UPDATE SET
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ============================================================================
-- PART 6: VERIFICATION
-- ============================================================================

SELECT 'QC Reviews table created successfully!' as status;

-- Test the table structure
SELECT 'QC Reviews table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the constraints
SELECT 'QC Reviews constraints:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'qc_reviews' 
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_type, tc.constraint_name;

-- Test the exact query that QC uses
SELECT 'Testing QC GET query:' as info;
SELECT 
    order_batch_assignment_id,
    approved_quantity,
    rejected_quantity
FROM qc_reviews 
WHERE order_batch_assignment_id IN ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', '1bbe6720-e9b0-4154-bea8-daeca11d9e1f');

-- Test sample upsert operation
SELECT 'Testing QC POST query (upsert):' as info;
SELECT 
    'order_batch_assignment_id' as column1,
    'size_name' as column2,
    'approved_quantity' as column3,
    'rejected_quantity' as column4;

-- Show sample data
SELECT 'Sample QC Reviews data:' as info;
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
