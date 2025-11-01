-- Fix for Size Types Image Storage
-- This script sets up the storage bucket and RLS policies for size type images

-- 1. Add image_url column to size_types table (if not already added)
ALTER TABLE size_types 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create the size-type-images storage bucket (run this in Supabase Storage section)
-- Note: You need to create this bucket manually in Supabase Dashboard > Storage
-- Bucket name: size-type-images
-- Public: true (recommended for easier access)

-- 3. Create RLS policies for the size-type-images bucket
-- Run these in Supabase SQL Editor after creating the bucket

-- Policy 1: Allow authenticated users to upload size type images
CREATE POLICY "Allow authenticated users to upload size type images" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'size-type-images');

-- Policy 2: Allow public access to view size type images
CREATE POLICY "Allow public access to view size type images" 
ON storage.objects 
FOR SELECT 
TO anon, authenticated 
USING (bucket_id = 'size-type-images');

-- Policy 3: Allow authenticated users to update size type images
CREATE POLICY "Allow authenticated users to update size type images" 
ON storage.objects 
FOR UPDATE 
TO authenticated 
USING (bucket_id = 'size-type-images')
WITH CHECK (bucket_id = 'size-type-images');

-- Policy 4: Allow authenticated users to delete size type images
CREATE POLICY "Allow authenticated users to delete size type images" 
ON storage.objects 
FOR DELETE 
TO authenticated 
USING (bucket_id = 'size-type-images');

-- Instructions:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket named 'size-type-images'
-- 3. Make it public (recommended)
-- 4. Go to SQL Editor and run the above RLS policies
-- 5. The image upload should now work properly

-- Alternative: If you want to make the bucket private, remove the "TO anon" from Policy 2
-- and ensure users are authenticated to view images
