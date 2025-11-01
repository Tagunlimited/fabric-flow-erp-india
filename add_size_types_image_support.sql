-- Add image support to size_types table
-- This script adds an image_url field to the size_types table and creates a storage bucket for size type images

-- 1. Add image_url column to size_types table
ALTER TABLE size_types 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create storage bucket for size type images
-- Note: This needs to be run in Supabase Storage section or via Supabase CLI
-- INSERT INTO storage.buckets (id, name, public) VALUES ('size-type-images', 'size-type-images', true);

-- 3. Create RLS policies for the size-type-images bucket
-- Note: These policies need to be created in Supabase after the bucket is created

-- Allow authenticated users to upload size type images
-- CREATE POLICY "Allow authenticated users to upload size type images" ON storage.objects
-- FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'size-type-images');

-- Allow authenticated users to view size type images
-- CREATE POLICY "Allow authenticated users to view size type images" ON storage.objects
-- FOR SELECT TO authenticated
-- USING (bucket_id = 'size-type-images');

-- Allow authenticated users to update size type images
-- CREATE POLICY "Allow authenticated users to update size type images" ON storage.objects
-- FOR UPDATE TO authenticated
-- USING (bucket_id = 'size-type-images');

-- Allow authenticated users to delete size type images
-- CREATE POLICY "Allow authenticated users to delete size type images" ON storage.objects
-- FOR DELETE TO authenticated
-- USING (bucket_id = 'size-type-images');

-- 4. Update existing size types with placeholder images (optional)
-- You can add default images for existing size types here if needed
-- UPDATE size_types SET image_url = 'https://example.com/placeholder-size-image.jpg' WHERE image_url IS NULL;

-- Instructions for manual setup in Supabase Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket named 'size-type-images'
-- 3. Make it public if you want images to be accessible without authentication
-- 4. Set up the RLS policies mentioned above
-- 5. Run this SQL script to add the image_url column
