-- Check if employee has a profile
-- Replace 'EMPLOYEE_EMAIL' with the actual employee email
-- Replace 'EMPLOYEE_USER_ID' with the actual employee user ID

SELECT 
  p.user_id,
  p.full_name,
  p.email,
  p.role,
  p.status
FROM profiles p 
WHERE p.email = 'EMPLOYEE_EMAIL'  -- Replace with actual email
   OR p.user_id = 'EMPLOYEE_USER_ID';  -- Replace with actual user ID
