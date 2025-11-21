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

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  user_mentions JSONB DEFAULT '[]'::jsonb,
  order_mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_mentions ON chat_messages USING GIN(user_mentions);
CREATE INDEX IF NOT EXISTS idx_chat_messages_order_mentions ON chat_messages USING GIN(order_mentions);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read all messages
CREATE POLICY "Allow authenticated users to read chat messages"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert their own messages
CREATE POLICY "Allow authenticated users to insert chat messages"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

