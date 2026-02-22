-- Create storage bucket for tutorials
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tutorials',
  'tutorials',
  true,
  52428800, -- 50MB limit
  ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for tutorials bucket
-- Anyone can view tutorial videos and thumbnails
CREATE POLICY "Anyone can view tutorial files" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tutorials');

-- Only admins can upload tutorial files
CREATE POLICY "Only admins can upload tutorial files" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'tutorials'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
      )
      OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
    )
  );

-- Only admins can update tutorial files
CREATE POLICY "Only admins can update tutorial files" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'tutorials'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
      )
      OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
    )
  );

-- Only admins can delete tutorial files
CREATE POLICY "Only admins can delete tutorial files" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'tutorials'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
      )
      OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
    )
  );
