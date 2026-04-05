-- Master list of branding placement labels (used on custom order form + reusable across orders)
CREATE TABLE IF NOT EXISTS public.branding_placements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive uniqueness on trimmed name
CREATE UNIQUE INDEX IF NOT EXISTS branding_placements_name_lower_unique
    ON public.branding_placements (lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_branding_placements_name ON public.branding_placements(name);

ALTER TABLE public.branding_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read branding placements"
ON public.branding_placements
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert branding placements"
ON public.branding_placements
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update branding placements"
ON public.branding_placements
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to delete branding placements"
ON public.branding_placements
FOR DELETE
TO authenticated
USING (true);

DROP TRIGGER IF EXISTS update_branding_placements_updated_at ON public.branding_placements;
CREATE TRIGGER update_branding_placements_updated_at
    BEFORE UPDATE ON public.branding_placements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
