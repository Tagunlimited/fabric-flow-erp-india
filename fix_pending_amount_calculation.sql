-- Fix pending amount calculation issues in orders table
-- This script addresses the inconsistencies where completed orders show pending amounts

-- First, let's check the current state of orders and their receipt totals
DO $$
DECLARE
    order_record RECORD;
    receipt_total DECIMAL(12,2);
    calculated_balance DECIMAL(12,2);
BEGIN
    RAISE NOTICE '=== ANALYZING ORDER PAYMENT STATUS ===';
    
    -- Check orders with potential issues
    FOR order_record IN 
        SELECT 
            o.id,
            o.order_number,
            o.status,
            o.final_amount,
            o.advance_amount,
            o.balance_amount,
            COALESCE(SUM(r.amount), 0) as total_receipts
        FROM orders o
        LEFT JOIN receipts r ON (
            (r.reference_id = o.id AND r.reference_type = 'order') OR
            (r.reference_number = o.order_number AND r.reference_type = 'order')
        )
        WHERE o.status = 'completed' AND o.balance_amount > 0
        GROUP BY o.id, o.order_number, o.status, o.final_amount, o.advance_amount, o.balance_amount
        ORDER BY o.order_number
    LOOP
        calculated_balance = order_record.final_amount - order_record.total_receipts;
        
        RAISE NOTICE 'Order: % | Status: % | Final Amount: % | Receipts: % | Current Balance: % | Calculated Balance: %',
            order_record.order_number,
            order_record.status,
            order_record.final_amount,
            order_record.total_receipts,
            order_record.balance_amount,
            calculated_balance;
            
        -- If there's a discrepancy, update the order
        IF ABS(order_record.balance_amount - calculated_balance) > 0.01 THEN
            RAISE NOTICE '  -> UPDATING: Setting balance_amount to % and advance_amount to %',
                calculated_balance,
                order_record.total_receipts;
                
            UPDATE orders 
            SET 
                balance_amount = calculated_balance,
                advance_amount = order_record.total_receipts,
                updated_at = NOW()
            WHERE id = order_record.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE '=== ANALYSIS COMPLETE ===';
END $$;

-- Update all orders to ensure balance_amount and advance_amount are consistent
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

-- Show summary of the fix
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
    RAISE NOTICE 'Pending amount calculation fix completed successfully!';
END $$;
