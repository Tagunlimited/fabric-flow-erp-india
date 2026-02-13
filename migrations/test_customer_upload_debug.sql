-- Debug script to check customer upload issues

-- 1. Check if customer_types table exists and has data
SELECT '=== CUSTOMER_TYPES TABLE CHECK ===' as info;
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'customer_types'
) as table_exists;

SELECT 'Customer Types Data:' as info;
SELECT id, name, description, discount_percentage 
FROM customer_types 
ORDER BY id;

-- 2. Check if states table exists and has data
SELECT '=== STATES TABLE CHECK ===' as info;
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'states'
) as table_exists;

SELECT 'States Data (first 10):' as info;
SELECT id, name, code 
FROM states 
ORDER BY id 
LIMIT 10;

-- 3. Check customers table structure
SELECT '=== CUSTOMERS TABLE STRUCTURE ===' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'customers' 
AND column_name IN ('customer_type_id', 'state_id', 'company_name', 'city', 'state')
ORDER BY ordinal_position;

-- 4. Test the exact values from your Excel
SELECT '=== TESTING EXCEL VALUES ===' as info;

-- Test customer type lookup
SELECT 'Testing Customer Type "Wholesale":' as test;
SELECT id, name FROM customer_types WHERE LOWER(name) = 'wholesale';

-- Test state lookups
SELECT 'Testing State "Maharashtra":' as test;
SELECT id, name FROM states WHERE LOWER(name) = 'maharashtra';

SELECT 'Testing State "Delhi":' as test;
SELECT id, name FROM states WHERE LOWER(name) = 'delhi';

SELECT 'Testing State "Karnataka":' as test;
SELECT id, name FROM states WHERE LOWER(name) = 'karnataka';

-- 5. Test a sample insert
SELECT '=== TESTING SAMPLE INSERT ===' as info;

-- Get the IDs we need
WITH customer_type_id AS (
    SELECT id FROM customer_types WHERE LOWER(name) = 'wholesale' LIMIT 1
),
state_id AS (
    SELECT id FROM states WHERE LOWER(name) = 'maharashtra' LIMIT 1
)
SELECT 
    'Customer Type ID for Wholesale:' as info,
    (SELECT id FROM customer_type_id) as customer_type_id,
    'State ID for Maharashtra:' as info2,
    (SELECT id FROM state_id) as state_id;

-- 6. Show all valid customer types and states for reference
SELECT '=== VALID CUSTOMER TYPES ===' as info;
SELECT name FROM customer_types ORDER BY name;

SELECT '=== VALID STATES ===' as info;
SELECT name FROM states ORDER BY name;
