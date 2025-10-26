-- Check the actual order information for the BOM
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  br.order_id,
  o.order_number,
  o.created_at as order_created_at,
  c.company_name as customer_name
FROM bom_records br
LEFT JOIN orders o ON br.order_id = o.id
LEFT JOIN customers c ON o.customer_id = c.id
WHERE br.id = '02af6467-460e-4ee8-bc95-b43b87c6420d';

-- Check all orders to see what order numbers exist
SELECT 
  order_number,
  created_at,
  id
FROM orders 
WHERE order_number LIKE '%007%' OR order_number LIKE '%01%' OR order_number LIKE '%02%'
ORDER BY created_at DESC;

-- Check if there are multiple BOMs for different orders
SELECT 
  br.id as bom_id,
  br.bom_number,
  br.product_name,
  o.order_number,
  br.created_at as bom_created_at
FROM bom_records br
LEFT JOIN orders o ON br.order_id = o.id
WHERE br.product_name = 'cap' OR br.bom_number LIKE '%BOM-1761412452902%'
ORDER BY br.created_at DESC;
