-- Create tutorials table
CREATE TABLE IF NOT EXISTS public.tutorials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  video_path TEXT, -- Path in storage bucket
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_tutorials_section_id ON public.tutorials(section_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_order_index ON public.tutorials(section_id, order_index);

-- Enable RLS
ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can read tutorials
CREATE POLICY "Anyone can view tutorials" ON public.tutorials
  FOR SELECT
  USING (true);

-- Only admins can insert tutorials
CREATE POLICY "Only admins can create tutorials" ON public.tutorials
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
  );

-- Only admins can update tutorials
CREATE POLICY "Only admins can update tutorials" ON public.tutorials
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
  );

-- Only admins can delete tutorials
CREATE POLICY "Only admins can delete tutorials" ON public.tutorials
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR auth.jwt() ->> 'email' = 'ecom@tagunlimitedclothing.com'
  );

-- Add comment
COMMENT ON TABLE public.tutorials IS 'Stores tutorial videos and information for different sections';
