-- Create storage bucket for order images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-images',
  'order-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload
CREATE POLICY "Users can upload order images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'order-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to view
CREATE POLICY "Users can view order images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'order-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to update
CREATE POLICY "Users can update order images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'order-images' 
    AND auth.role() = 'authenticated'
  );

-- Create storage policy for authenticated users to delete
CREATE POLICY "Users can delete order images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'order-images' 
    AND auth.role() = 'authenticated'
  );
