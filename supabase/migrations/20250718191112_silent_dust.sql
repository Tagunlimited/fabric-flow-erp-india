@@ .. @@
 -- Insert the superadmin profile
 INSERT INTO profiles (user_id, full_name, email, role, status)
 VALUES (
   (SELECT id FROM auth.users WHERE email = 'ecom@tagunlimitedclothing.com'),
   'Super Admin',
   'ecom@tagunlimitedclothing.com',
   'admin',
   'approved'
-);