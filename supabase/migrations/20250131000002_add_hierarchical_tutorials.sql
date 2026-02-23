-- Add hierarchical tutorial support
-- Main tutorials can have multiple options (e.g., "Bulk Upload", "Manual")

-- Add new columns to tutorials table
ALTER TABLE public.tutorials
ADD COLUMN IF NOT EXISTS parent_tutorial_id UUID REFERENCES public.tutorials(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS option_name TEXT,
ADD COLUMN IF NOT EXISTS written_steps TEXT,
ADD COLUMN IF NOT EXISTS is_main_tutorial BOOLEAN DEFAULT true;

-- Create index for parent relationships
CREATE INDEX IF NOT EXISTS idx_tutorials_parent_id ON public.tutorials(parent_tutorial_id);

-- Update existing tutorials to be main tutorials
UPDATE public.tutorials
SET is_main_tutorial = true
WHERE is_main_tutorial IS NULL;

-- Add comment
COMMENT ON COLUMN public.tutorials.parent_tutorial_id IS 'Reference to parent tutorial. NULL for main tutorials.';
COMMENT ON COLUMN public.tutorials.option_name IS 'Name of the option (e.g., "Bulk Upload", "Manual"). Only set for option tutorials.';
COMMENT ON COLUMN public.tutorials.written_steps IS 'Written step-by-step instructions for the tutorial option.';
COMMENT ON COLUMN public.tutorials.is_main_tutorial IS 'True for main tutorials, false for options under main tutorials.';
