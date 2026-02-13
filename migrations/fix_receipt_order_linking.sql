-- Fix receipt-order linking and balance calculation issues
-- This script ensures receipts are properly linked to orders and balance amounts are correct

-- First, let's check the current state of receipts and their linking
DO $$
DECLARE
    receipt_record RECORD;
    order_record RECORD;
BEGIN
    RAISE NOTICE '=== ANALYZING RECEIPT-ORDER LINKING ===';
    
    -- Check receipts that might have linking issues
    FOR receipt_record IN 
        SELECT 
            r.id,
            r.receipt_number,
            r.reference_id,
            r.reference_number,
            r.reference_type,
            r.amount,
            o.id as order_id,
            o.order_number,
            o.final_amount,
            o.balance_amount
        FROM receipts r
        LEFT JOIN orders o ON (
            (r.reference_id = o.id) OR 
            (r.reference_number = o.order_number)
        )
        WHERE r.reference_type = 'order'
        ORDER BY r.created_at DESC
        LIMIT 10
    LOOP
        RAISE NOTICE 'Receipt: % | Ref ID: % | Ref Number: % | Amount: % | Order ID: % | Order Number: % | Final Amount: % | Balance: %',
            receipt_record.receipt_number,
            receipt_record.reference_id,
            receipt_record.reference_number,
            receipt_record.amount,
            receipt_record.order_id,
            receipt_record.order_number,
            receipt_record.final_amount,
            receipt_record.balance_amount;
    END LOOP;
    
    RAISE NOTICE '=== ANALYSIS COMPLETE ===';
END $$;

-- Fix receipts that have reference_id but missing reference_number
UPDATE receipts 
SET reference_number = (
    SELECT o.order_number 
    FROM orders o 
    WHERE o.id = receipts.reference_id
)
WHERE reference_type = 'order' 
AND reference_id IS NOT NULL 
AND reference_number IS NULL;

-- Fix receipts that have reference_number but missing reference_id
UPDATE receipts 
SET reference_id = (
    SELECT o.id 
    FROM orders o 
    WHERE o.order_number = receipts.reference_number
)
WHERE reference_type = 'order' 
AND reference_number IS NOT NULL 
AND reference_id IS NULL;

-- Now recalculate all order balances based on receipts
UPDATE orders 
SET 
    advance_amount = COALESCE((
        SELECT SUM(r.amount)
        FROM receipts r
        WHERE (r.reference_id = orders.id OR r.reference_number = orders.order_number)
        AND r.reference_type = 'order'
    ), 0),
    balance_amount = final_amount - COALESCE((
        SELECT SUM(r.amount)
        FROM receipts r
        WHERE (r.reference_id = orders.id OR r.reference_number = orders.order_number)
        AND r.reference_type = 'order'
    ), 0),
    updated_at = NOW()
WHERE final_amount > 0;

-- Ensure balance_amount is never negative
UPDATE orders 
SET balance_amount = 0, updated_at = NOW()
WHERE balance_amount < 0;

-- For completed orders, if balance_amount is 0, ensure advance_amount equals final_amount
UPDATE orders 
SET 
    advance_amount = final_amount,
    updated_at = NOW()
WHERE status = 'completed' 
AND balance_amount = 0 
AND advance_amount != final_amount;

-- Show summary of orders and their payment status
SELECT 
    'Orders with receipts' as category,
    COUNT(*) as count,
    SUM(final_amount) as total_final_amount,
    SUM(advance_amount) as total_advance_amount,
    SUM(balance_amount) as total_balance_amount
FROM orders 
WHERE id IN (
    SELECT DISTINCT o.id
    FROM orders o
    JOIN receipts r ON (
        (r.reference_id = o.id OR r.reference_number = o.order_number)
        AND r.reference_type = 'order'
    )
)

UNION ALL

SELECT 
    'Completed orders' as category,
    COUNT(*) as count,
    SUM(final_amount) as total_final_amount,
    SUM(advance_amount) as total_advance_amount,
    SUM(balance_amount) as total_balance_amount
FROM orders 
WHERE status = 'completed'

UNION ALL

SELECT 
    'All orders' as category,
    COUNT(*) as count,
    SUM(final_amount) as total_final_amount,
    SUM(advance_amount) as total_advance_amount,
    SUM(balance_amount) as total_balance_amount
FROM orders;

-- Create the refresh_customer_pending function if it doesn't exist
CREATE OR REPLACE FUNCTION public.refresh_customer_pending(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.customers c
  SET pending_amount = COALESCE((
    SELECT SUM(o.balance_amount::numeric)
    FROM public.orders o
    WHERE o.customer_id = p_customer_id
  ), 0)
  WHERE c.id = p_customer_id;
END;
$$;

-- Refresh customer pending amounts
SELECT refresh_customer_pending(c.id)
FROM customers c
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.customer_id = c.id
);

-- Final completion message
DO $$
BEGIN
    RAISE NOTICE 'Receipt-order linking fix completed successfully!';
END $$;
