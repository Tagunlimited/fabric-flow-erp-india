-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-images',
  'item-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload item images
CREATE POLICY "Users can upload item images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to view item images
CREATE POLICY "Users can view item images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to update item images
CREATE POLICY "Users can update item images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to delete item images
CREATE POLICY "Users can delete item images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'item-images' 
    AND auth.role() = 'authenticated'
  );
