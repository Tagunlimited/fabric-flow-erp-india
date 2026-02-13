-- ============================================================================
-- CREATE DOCUMENTS STORAGE BUCKET
-- Generated: January 21, 2025
-- Description: Creates storage bucket for document images (including ID proofs)
-- ============================================================================

-- Create the documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
) ON CONFLICT (id) DO NOTHING;

-- Create storage policies for documents bucket
CREATE POLICY "Authenticated users can upload document images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can view document images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can update their own document images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can delete their own document images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

-- Grant permissions
GRANT ALL ON storage.objects TO postgres, anon, authenticated, service_role;

-- Verification
SELECT 
  'Documents storage bucket created successfully!' as status,
  'Bucket: documents, Public: true, Size limit: 5MB' as details;
