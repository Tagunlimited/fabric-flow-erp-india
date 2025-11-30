-- Create colors table
CREATE TABLE IF NOT EXISTS colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color TEXT NOT NULL UNIQUE,
  hex TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on color name for faster lookups
CREATE INDEX IF NOT EXISTS idx_colors_color ON colors(color);

-- Create index on hex for faster lookups
CREATE INDEX IF NOT EXISTS idx_colors_hex ON colors(hex);

-- Enable Row Level Security
ALTER TABLE colors ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read colors
CREATE POLICY "Allow authenticated users to read colors"
  ON colors
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow authenticated users to insert colors
CREATE POLICY "Allow authenticated users to insert colors"
  ON colors
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy to allow authenticated users to update colors
CREATE POLICY "Allow authenticated users to update colors"
  ON colors
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy to allow authenticated users to delete colors
CREATE POLICY "Allow authenticated users to delete colors"
  ON colors
  FOR DELETE
  TO authenticated
  USING (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_colors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_colors_updated_at
  BEFORE UPDATE ON colors
  FOR EACH ROW
  EXECUTE FUNCTION update_colors_updated_at();

-- Add comment to table
COMMENT ON TABLE colors IS 'Master table for color definitions with hex codes';

