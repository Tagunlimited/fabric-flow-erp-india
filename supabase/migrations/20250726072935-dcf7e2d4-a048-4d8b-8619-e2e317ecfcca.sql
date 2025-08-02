-- Create storage policies for avatar uploads
-- Allow users to upload their own avatars and admins to manage all avatars

-- Policy for viewing avatars (public access since bucket is public)
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'avatars');

-- Policy for uploading avatars (authenticated users)
CREATE POLICY "Users can upload avatars" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Policy for updating avatars (users can update their own, admins can update any)
CREATE POLICY "Users can update their own avatars, admins can update any" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'avatars' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1] 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  )
);

-- Policy for deleting avatars (users can delete their own, admins can delete any)
CREATE POLICY "Users can delete their own avatars, admins can delete any" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'avatars' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1] 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  )
);