-- Create typing_indicators table for real-time typing status
CREATE TABLE IF NOT EXISTS typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  is_typing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_typing_indicators_user_id ON typing_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_is_typing ON typing_indicators(is_typing);

-- Enable Row Level Security
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read all typing indicators
CREATE POLICY "Allow authenticated users to read typing indicators"
  ON typing_indicators
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own typing indicator
CREATE POLICY "Allow users to update their own typing indicator"
  ON typing_indicators
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to insert their own typing indicator
CREATE POLICY "Allow users to insert their own typing indicator"
  ON typing_indicators
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE typing_indicators;

