-- Ensure company-assets bucket exists and is configured for product images
-- This migration ensures the bucket has proper configuration for product images (up to 10MB)

-- Create or update the company-assets bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'company-assets',
    'company-assets',
    true,
    10485760, -- 10MB limit (increased from 5MB for product images)
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
ON CONFLICT (id) 
DO UPDATE SET
    file_size_limit = 10485760, -- Update to 10MB if bucket exists
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];

-- Ensure storage policies exist for company-assets bucket
-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Company assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload company assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete company assets" ON storage.objects;
DROP POLICY IF EXISTS "Public users can view company assets" ON storage.objects;

-- Create storage policies for company-assets bucket
-- Public read access (images need to be publicly accessible)
CREATE POLICY "Company assets are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'company-assets');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload company assets" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

-- Authenticated users can update
CREATE POLICY "Authenticated users can update company assets" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete company assets" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

-- Public read access (for viewing images without authentication)
CREATE POLICY "Public users can view company assets" 
ON storage.objects FOR SELECT 
TO public
USING (bucket_id = 'company-assets');

-- Verify bucket creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'company-assets'
    ) THEN
        RAISE EXCEPTION 'Failed to create company-assets bucket';
    END IF;
    
    RAISE NOTICE 'company-assets bucket verified and configured successfully';
END $$;

-- Return confirmation
SELECT 
    id as bucket_id,
    name as bucket_name,
    public as is_public,
    file_size_limit / 1024 / 1024 as file_size_limit_mb,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'company-assets';

