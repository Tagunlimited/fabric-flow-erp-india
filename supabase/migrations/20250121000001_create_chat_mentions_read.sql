-- Ensure profiles.user_id has UNIQUE constraint (required for foreign key)
DO $$
BEGIN
  -- Check if any unique constraint exists on user_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'profiles'
    AND a.attname = 'user_id'
    AND c.contype = 'u'
  ) THEN
    -- Add unique constraint if it doesn't exist
    ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Create chat_mentions_read table to track read status
CREATE TABLE IF NOT EXISTS chat_mentions_read (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_mentions_read_message_id ON chat_mentions_read(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_mentions_read_user_id ON chat_mentions_read(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_mentions_read_composite ON chat_mentions_read(message_id, user_id);

-- Enable Row Level Security
ALTER TABLE chat_mentions_read ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow users to read their own mention read status
CREATE POLICY "Allow users to read their own mention read status"
  ON chat_mentions_read
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to insert their own mention read status
CREATE POLICY "Allow users to insert their own mention read status"
  ON chat_mentions_read
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own mention read status
CREATE POLICY "Allow users to update their own mention read status"
  ON chat_mentions_read
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

