-- Create branding_types table
CREATE TABLE IF NOT EXISTS public.branding_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    scope VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_branding_types_name ON public.branding_types(name);
CREATE INDEX IF NOT EXISTS idx_branding_types_scope ON public.branding_types(scope);

-- Add RLS policies
ALTER TABLE public.branding_types ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read branding types
CREATE POLICY "Allow authenticated users to read branding types" 
ON public.branding_types 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy for authenticated users to insert branding types
CREATE POLICY "Allow authenticated users to insert branding types" 
ON public.branding_types 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Policy for authenticated users to update branding types
CREATE POLICY "Allow authenticated users to update branding types" 
ON public.branding_types 
FOR UPDATE 
TO authenticated 
USING (true);

-- Policy for authenticated users to delete branding types
CREATE POLICY "Allow authenticated users to delete branding types" 
ON public.branding_types 
FOR DELETE 
TO authenticated 
USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_branding_types_updated_at 
    BEFORE UPDATE ON public.branding_types 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
