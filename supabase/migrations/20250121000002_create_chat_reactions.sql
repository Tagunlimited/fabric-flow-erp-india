-- Create chat_message_reactions table for emoji reactions
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id ON chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user_id ON chat_message_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read all reactions
CREATE POLICY "Allow authenticated users to read chat reactions"
  ON chat_message_reactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert their own reactions
CREATE POLICY "Allow authenticated users to insert chat reactions"
  ON chat_message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own reactions
CREATE POLICY "Allow authenticated users to delete chat reactions"
  ON chat_message_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reactions;

