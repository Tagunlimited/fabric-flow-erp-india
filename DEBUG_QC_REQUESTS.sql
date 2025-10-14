-- ============================================================================
-- DEBUG: QC Reviews Request Analysis
-- Generated: October 8, 2025
-- Description: Debug the exact QC POST request and identify the issue
-- ============================================================================

-- ============================================================================
-- PART 1: CHECK CURRENT QC_REVIEWS TABLE STATE
-- ============================================================================

SELECT 'Current qc_reviews table state:' as info;

-- Check if table exists
SELECT 'Table existence check:' as info;
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public';

-- Check table structure
SELECT 'Table structure:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check constraints
SELECT 'Constraints:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'qc_reviews' 
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_type, tc.constraint_name;

-- ============================================================================
-- PART 2: TEST THE EXACT ON_CONFLICT SCENARIO
-- ============================================================================

SELECT 'Testing exact on_conflict scenario:' as info;

-- Clear any existing test data
DELETE FROM qc_reviews WHERE order_batch_assignment_id = 'test-assignment-id';

-- Test 1: Simple insert
SELECT 'Test 1 - Simple insert:' as info;
INSERT INTO qc_reviews (order_batch_assignment_id, size_name, approved_quantity, rejected_quantity, remarks)
VALUES ('test-assignment-id', 'S', 5, 0, 'Test insert')
RETURNING id, order_batch_assignment_id, size_name, approved_quantity;

-- Test 2: Upsert with on_conflict (exact same as app)
SELECT 'Test 2 - Upsert with on_conflict:' as info;
INSERT INTO qc_reviews (order_batch_assignment_id, size_name, approved_quantity, rejected_quantity, remarks)
VALUES ('test-assignment-id', 'S', 3, 0, 'Test upsert')
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    updated_at = NOW()
RETURNING id, order_batch_assignment_id, size_name, approved_quantity, updated_at;

-- ============================================================================
-- PART 3: TEST WITH REAL ASSIGNMENT IDS FROM ERROR
-- ============================================================================

SELECT 'Testing with real assignment IDs:' as info;

-- Test with the actual assignment IDs from the error
INSERT INTO qc_reviews (order_batch_assignment_id, size_name, approved_quantity, rejected_quantity, remarks)
VALUES ('40aab0bf-7f3d-44e6-8cad-04e0295f1f52', 'S', 5, 0, 'Real assignment test')
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    updated_at = NOW()
RETURNING id, order_batch_assignment_id, size_name, approved_quantity;

-- ============================================================================
-- PART 4: CHECK RLS POLICIES
-- ============================================================================

SELECT 'RLS Policies check:' as info;
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'qc_reviews';

-- ============================================================================
-- PART 5: SIMULATE THE EXACT REQUEST
-- ============================================================================

SELECT 'Simulating exact app request:' as info;

-- This simulates what the app is trying to do
-- The URL shows: on_conflict=order_batch_assignment_id%2Csize_name
-- Which decodes to: on_conflict=order_batch_assignment_id,size_name

SELECT 'Testing upsert with exact column names:' as info;
INSERT INTO qc_reviews (
    order_batch_assignment_id, 
    size_name, 
    approved_quantity, 
    rejected_quantity, 
    remarks,
    reviewed_by,
    reviewed_by_name,
    status
)
VALUES (
    '1bbe6720-e9b0-4154-bea8-daeca11d9e1f', 
    'S', 
    2, 
    0, 
    'QC Approved by system',
    '00000000-0000-0000-0000-000000000000',
    'System',
    'approved'
)
ON CONFLICT (order_batch_assignment_id, size_name) 
DO UPDATE SET 
    approved_quantity = EXCLUDED.approved_quantity,
    rejected_quantity = EXCLUDED.rejected_quantity,
    remarks = EXCLUDED.remarks,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_by_name = EXCLUDED.reviewed_by_name,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING id, order_batch_assignment_id, size_name, approved_quantity, status;

-- ============================================================================
-- PART 6: FINAL VERIFICATION
-- ============================================================================

SELECT 'Final verification - All QC Reviews data:' as info;
SELECT 
    id,
    order_batch_assignment_id,
    size_name,
    approved_quantity,
    rejected_quantity,
    remarks,
    status,
    created_at,
    updated_at
FROM qc_reviews 
ORDER BY created_at DESC;
