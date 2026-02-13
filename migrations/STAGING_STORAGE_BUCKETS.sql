-- ============================================================================
-- STORAGE BUCKETS SETUP - For Staging Database
-- Generated: October 8, 2025
-- Description: Creates all storage buckets used by the application
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE STORAGE BUCKETS
-- ============================================================================

-- 1. Avatars Bucket (User/Employee/Tailor profile pictures)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Company Assets Bucket (Company logos, product images, item images, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'company-assets',
    'company-assets',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Order Images Bucket (Order reference and mockup images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'order-images',
    'order-images',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 4. Order Attachments Bucket (Order PDF, documents, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'order-attachments',
    'order-attachments',
    true,
    20971520, -- 20MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- 5. Order Mockups Bucket (Design mockups)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'order-mockups',
    'order-mockups',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 6. Fabric Images Bucket (Fabric catalog images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fabric-images',
    'fabric-images',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 2: STORAGE POLICIES (Allow authenticated users)
-- ============================================================================

-- Avatars Bucket Policies
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can read avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- Company Assets Bucket Policies
CREATE POLICY "Authenticated users can upload company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can read company assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can update company assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can delete company assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-assets');

-- Order Images Bucket Policies
CREATE POLICY "Authenticated users can upload order images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'order-images');

CREATE POLICY "Authenticated users can read order images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'order-images');

CREATE POLICY "Authenticated users can update order images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'order-images');

CREATE POLICY "Authenticated users can delete order images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'order-images');

-- Order Attachments Bucket Policies
CREATE POLICY "Authenticated users can upload order attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'order-attachments');

CREATE POLICY "Authenticated users can read order attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'order-attachments');

CREATE POLICY "Authenticated users can update order attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'order-attachments');

CREATE POLICY "Authenticated users can delete order attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'order-attachments');

-- Order Mockups Bucket Policies
CREATE POLICY "Authenticated users can upload order mockups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'order-mockups');

CREATE POLICY "Authenticated users can read order mockups"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'order-mockups');

CREATE POLICY "Authenticated users can update order mockups"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'order-mockups');

CREATE POLICY "Authenticated users can delete order mockups"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'order-mockups');

-- Fabric Images Bucket Policies
CREATE POLICY "Authenticated users can upload fabric images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fabric-images');

CREATE POLICY "Authenticated users can read fabric images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'fabric-images');

CREATE POLICY "Authenticated users can update fabric images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'fabric-images');

CREATE POLICY "Authenticated users can delete fabric images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fabric-images');

-- ============================================================================
-- PART 3: PUBLIC ACCESS POLICIES (For public viewing of images)
-- ============================================================================

-- Allow public read access to all buckets (images are public)
CREATE POLICY "Public users can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Public users can view company assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

CREATE POLICY "Public users can view order images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'order-images');

CREATE POLICY "Public users can view order mockups"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'order-mockups');

CREATE POLICY "Public users can view fabric images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'fabric-images');

-- Note: order-attachments might contain sensitive PDFs, so we don't allow public access

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Successfully created all 6 storage buckets!' as status;

SELECT 
    bucket_id,
    count(*) as policy_count
FROM storage.objects
GROUP BY bucket_id;

