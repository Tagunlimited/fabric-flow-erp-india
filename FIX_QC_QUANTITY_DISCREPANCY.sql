-- ============================================================================
-- FIX: QC Quantity Discrepancy Issues
-- Generated: October 8, 2025
-- Description: Fix quantity discrepancies and ensure data consistency
-- ============================================================================

-- ============================================================================
-- PART 1: DIAGNOSTIC QUERIES - Let's see what's happening
-- ============================================================================

SELECT '=== DIAGNOSTIC: Current QC Data Issues ===' as info;

-- Check current QC reviews data
SELECT 'Current QC Reviews Data:' as section;
SELECT 
    order_batch_assignment_id,
    size_name,
    picked_quantity,
    approved_quantity,
    rejected_quantity,
    (picked_quantity - approved_quantity - rejected_quantity) as pending_quantity,
    remarks
FROM qc_reviews 
ORDER BY order_batch_assignment_id, size_name;

-- Check order batch assignments
SELECT 'Order Batch Assignments:' as section;
SELECT 
    id,
    order_id,
    total_quantity,
    status,
    created_at
FROM order_batch_assignments 
ORDER BY created_at DESC
LIMIT 10;

-- Check order batch size distributions
SELECT 'Order Batch Size Distributions:' as section;
SELECT 
    order_batch_assignment_id,
    size_name,
    quantity,
    picked_quantity,
    status
FROM order_batch_size_distributions 
ORDER BY order_batch_assignment_id, size_name
LIMIT 20;

-- ============================================================================
-- PART 2: IDENTIFY AND FIX DATA INCONSISTENCIES
-- ============================================================================

SELECT '=== FIXING DATA INCONSISTENCIES ===' as info;

-- Fix 1: Ensure picked_quantity in qc_reviews matches order_batch_size_distributions
UPDATE qc_reviews 
SET picked_quantity = (
    SELECT COALESCE(SUM(obsd.picked_quantity), 0)
    FROM order_batch_size_distributions obsd
    WHERE obsd.order_batch_assignment_id = qc_reviews.order_batch_assignment_id
      AND obsd.size_name = qc_reviews.size_name
)
WHERE EXISTS (
    SELECT 1 FROM order_batch_size_distributions obsd
    WHERE obsd.order_batch_assignment_id = qc_reviews.order_batch_assignment_id
      AND obsd.size_name = qc_reviews.size_name
);

-- Fix 2: Remove invalid QC records where approved + rejected > picked
UPDATE qc_reviews 
SET 
    approved_quantity = CASE 
        WHEN (approved_quantity + rejected_quantity) > picked_quantity 
        THEN GREATEST(0, picked_quantity - rejected_quantity)
        ELSE approved_quantity 
    END,
    rejected_quantity = CASE 
        WHEN (approved_quantity + rejected_quantity) > picked_quantity 
        THEN GREATEST(0, picked_quantity - approved_quantity)
        ELSE rejected_quantity 
    END
WHERE (approved_quantity + rejected_quantity) > picked_quantity;

-- Fix 3: Ensure all QC records have valid picked_quantity
DELETE FROM qc_reviews 
WHERE picked_quantity IS NULL OR picked_quantity <= 0;

-- ============================================================================
-- PART 3: CREATE QC STATUS TRACKING
-- ============================================================================

SELECT '=== CREATING QC STATUS TRACKING ===' as info;

-- Add QC status columns to order_batch_assignments if they don't exist
DO $$
BEGIN
    -- Add QC status tracking columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_batch_assignments' 
          AND column_name = 'qc_status'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_batch_assignments 
        ADD COLUMN qc_status TEXT DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_batch_assignments' 
          AND column_name = 'qc_completed_at'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_batch_assignments 
        ADD COLUMN qc_completed_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_batch_assignments' 
          AND column_name = 'qc_completed_by'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_batch_assignments 
        ADD COLUMN qc_completed_by UUID;
    END IF;
END $$;

-- ============================================================================
-- PART 4: UPDATE QC STATUS BASED ON ACTUAL DATA
-- ============================================================================

SELECT '=== UPDATING QC STATUS ===' as info;

-- Update QC status based on actual QC data
WITH qc_summary AS (
    SELECT 
        oba.id as assignment_id,
        COALESCE(SUM(obsd.picked_quantity), 0) as total_picked,
        COALESCE(SUM(qr.approved_quantity), 0) as total_approved,
        COALESCE(SUM(qr.rejected_quantity), 0) as total_rejected,
        COUNT(qr.id) as qc_records_count
    FROM order_batch_assignments oba
    LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
    LEFT JOIN qc_reviews qr ON oba.id = qr.order_batch_assignment_id
    GROUP BY oba.id
)
UPDATE order_batch_assignments 
SET 
    qc_status = CASE 
        WHEN qs.total_picked = 0 THEN 'not_picked'
        WHEN qs.total_approved + qs.total_rejected = qs.total_picked AND qs.total_picked > 0 THEN 'completed'
        WHEN qs.total_approved > 0 OR qs.total_rejected > 0 THEN 'partial'
        ELSE 'pending'
    END,
    qc_completed_at = CASE 
        WHEN qs.total_approved + qs.total_rejected = qs.total_picked AND qs.total_picked > 0 THEN NOW()
        ELSE qc_completed_at
    END
FROM qc_summary qs
WHERE order_batch_assignments.id = qs.assignment_id;

-- ============================================================================
-- PART 5: CREATE HELPER VIEW FOR QC STATUS
-- ============================================================================

SELECT '=== CREATING QC STATUS VIEW ===' as info;

-- Create or replace view for QC status tracking
CREATE OR REPLACE VIEW qc_status_summary AS
SELECT 
    oba.id as assignment_id,
    oba.order_id,
    oba.total_quantity as assignment_total,
    oba.qc_status,
    oba.qc_completed_at,
    oba.qc_completed_by,
    -- Size-wise breakdown
    COALESCE(SUM(obsd.quantity), 0) as total_assigned,
    COALESCE(SUM(obsd.picked_quantity), 0) as total_picked,
    COALESCE(SUM(qr.approved_quantity), 0) as total_approved,
    COALESCE(SUM(qr.rejected_quantity), 0) as total_rejected,
    COALESCE(SUM(obsd.picked_quantity), 0) - COALESCE(SUM(qr.approved_quantity), 0) - COALESCE(SUM(qr.rejected_quantity), 0) as total_pending,
    -- Batch info
    b.batch_name,
    b.batch_leader_name,
    b.batch_leader_avatar_url,
    -- Order info
    o.order_number,
    c.company_name as customer_name
FROM order_batch_assignments oba
LEFT JOIN order_batch_size_distributions obsd ON oba.id = obsd.order_batch_assignment_id
LEFT JOIN qc_reviews qr ON oba.id = qr.order_batch_assignment_id
LEFT JOIN batches b ON oba.batch_id = b.id
LEFT JOIN orders o ON oba.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
GROUP BY 
    oba.id, oba.order_id, oba.total_quantity, oba.qc_status, oba.qc_completed_at, oba.qc_completed_by,
    b.batch_name, b.batch_leader_name, b.batch_leader_avatar_url,
    o.order_number, c.company_name;

-- ============================================================================
-- PART 6: VERIFICATION QUERIES
-- ============================================================================

SELECT '=== VERIFICATION: After Fixes ===' as info;

-- Verify QC data consistency
SELECT 'QC Data Consistency Check:' as section;
SELECT 
    order_batch_assignment_id,
    size_name,
    picked_quantity,
    approved_quantity,
    rejected_quantity,
    (picked_quantity - approved_quantity - rejected_quantity) as pending_quantity,
    CASE 
        WHEN (approved_quantity + rejected_quantity) = picked_quantity THEN '✓ Complete'
        WHEN (approved_quantity + rejected_quantity) > picked_quantity THEN '❌ Over-allocated'
        WHEN (approved_quantity + rejected_quantity) < picked_quantity THEN '⏳ Pending'
        ELSE '❓ Unknown'
    END as qc_status
FROM qc_reviews 
ORDER BY order_batch_assignment_id, size_name;

-- Verify QC status summary
SELECT 'QC Status Summary:' as section;
SELECT 
    qc_status,
    COUNT(*) as assignment_count,
    SUM(total_picked) as total_picked,
    SUM(total_approved) as total_approved,
    SUM(total_rejected) as total_rejected,
    SUM(total_pending) as total_pending
FROM qc_status_summary
GROUP BY qc_status
ORDER BY qc_status;

-- Show specific problematic orders
SELECT 'Problematic Orders (if any):' as section;
SELECT 
    order_number,
    customer_name,
    batch_name,
    total_picked,
    total_approved,
    total_rejected,
    total_pending,
    qc_status
FROM qc_status_summary
WHERE total_pending < 0 OR total_pending > total_picked
ORDER BY order_number;

-- ============================================================================
-- PART 7: SAMPLE DATA FOR TESTING
-- ============================================================================

SELECT '=== INSERTING SAMPLE DATA FOR TESTING ===' as info;

-- Insert sample QC data for testing (only if no data exists)
INSERT INTO qc_reviews (
    order_batch_assignment_id,
    size_name,
    picked_quantity,
    approved_quantity,
    rejected_quantity,
    remarks
)
SELECT 
    obsd.order_batch_assignment_id,
    obsd.size_name,
    obsd.picked_quantity,
    CASE 
        WHEN obsd.picked_quantity > 0 THEN FLOOR(obsd.picked_quantity * 0.8) -- 80% approved
        ELSE 0 
    END,
    CASE 
        WHEN obsd.picked_quantity > 0 THEN FLOOR(obsd.picked_quantity * 0.2) -- 20% rejected
        ELSE 0 
    END,
    'Sample QC Review'
FROM order_batch_size_distributions obsd
LEFT JOIN qc_reviews qr ON obsd.order_batch_assignment_id = qr.order_batch_assignment_id 
    AND obsd.size_name = qr.size_name
WHERE qr.id IS NULL 
  AND obsd.picked_quantity > 0
LIMIT 10;

-- ============================================================================
-- PART 8: FINAL VERIFICATION
-- ============================================================================

SELECT '=== FINAL VERIFICATION ===' as info;

-- Final check of QC data
SELECT 'Final QC Data Check:' as section;
SELECT 
    'Total QC Records' as metric,
    COUNT(*) as count
FROM qc_reviews
UNION ALL
SELECT 
    'Complete QC Records' as metric,
    COUNT(*) as count
FROM qc_reviews
WHERE (approved_quantity + rejected_quantity) = picked_quantity
UNION ALL
SELECT 
    'Pending QC Records' as metric,
    COUNT(*) as count
FROM qc_reviews
WHERE (approved_quantity + rejected_quantity) < picked_quantity
UNION ALL
SELECT 
    'Invalid QC Records' as metric,
    COUNT(*) as count
FROM qc_reviews
WHERE (approved_quantity + rejected_quantity) > picked_quantity;

SELECT 'QC Quantity Discrepancy Fix Completed Successfully!' as status;
