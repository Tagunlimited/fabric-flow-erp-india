-- Check and fix storage policies for size-type-images bucket
-- Run this in Supabase SQL Editor

-- 1. First, check if the bucket exists
SELECT name, id, public FROM storage.buckets WHERE name = 'size-type-images';

-- 2. Check existing policies for the bucket
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- 3. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to upload size type images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access to view size type images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update size type images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete size type images" ON storage.objects;

-- 4. Create new policies for size-type-images bucket
CREATE POLICY "Allow authenticated users to upload size type images" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'size-type-images');

CREATE POLICY "Allow public access to view size type images" 
ON storage.objects 
FOR SELECT 
TO anon, authenticated 
USING (bucket_id = 'size-type-images');

CREATE POLICY "Allow authenticated users to update size type images" 
ON storage.objects 
FOR UPDATE 
TO authenticated 
USING (bucket_id = 'size-type-images')
WITH CHECK (bucket_id = 'size-type-images');

CREATE POLICY "Allow authenticated users to delete size type images" 
ON storage.objects 
FOR DELETE 
TO authenticated 
USING (bucket_id = 'size-type-images');

-- 5. Verify the policies were created
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage' 
AND policyname LIKE '%size type%';
