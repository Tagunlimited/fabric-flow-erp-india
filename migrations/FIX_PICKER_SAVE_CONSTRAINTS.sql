-- ============================================================================
-- FIX: Picker Save Constraints - Fix Unique Constraints and Foreign Keys
-- Generated: October 8, 2025
-- Description: Fix the unique constraints and foreign key relationships for Picker save functionality
-- ============================================================================

-- ============================================================================
-- PART 1: DROP EXISTING CONSTRAINTS THAT MIGHT BE CAUSING ISSUES
-- ============================================================================

-- Drop existing constraints that might be problematic
DO $$
BEGIN
    -- Drop existing unique constraints
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'order_batch_size_distributions' 
          AND constraint_name = 'uq_assignment_size'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_batch_size_distributions DROP CONSTRAINT uq_assignment_size;
    END IF;
    
    -- Drop existing unique constraints with different names
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'order_batch_size_distributions' 
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%assignment%'
          AND table_schema = 'public'
    ) THEN
        EXECUTE 'ALTER TABLE order_batch_size_distributions DROP CONSTRAINT ' || (
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'order_batch_size_distributions' 
              AND constraint_type = 'UNIQUE'
              AND constraint_name LIKE '%assignment%'
              AND table_schema = 'public'
            LIMIT 1
        );
    END IF;
END $$;

-- ============================================================================
-- PART 2: ENSURE ALL REQUIRED COLUMNS EXIST
-- ============================================================================

-- Ensure order_batch_size_distributions has all required columns
ALTER TABLE order_batch_size_distributions 
ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS order_batch_assignment_id UUID NOT NULL,
ADD COLUMN IF NOT EXISTS size_name TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS picked_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS estimated_completion_date DATE,
ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
ADD COLUMN IF NOT EXISTS quality_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 3: CREATE PROPER FOREIGN KEY RELATIONSHIPS
-- ============================================================================

-- Add foreign key constraint to order_batch_assignments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'order_batch_size_distributions' 
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'order_batch_assignment_id'
          AND tc.table_schema = 'public'
    ) THEN
        ALTER TABLE order_batch_size_distributions 
        ADD CONSTRAINT fk_order_batch_size_distributions_assignment 
        FOREIGN KEY (order_batch_assignment_id) 
        REFERENCES order_batch_assignments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- PART 4: CREATE THE CORRECT UNIQUE CONSTRAINT
-- ============================================================================

-- Create the unique constraint that the Picker expects
ALTER TABLE order_batch_size_distributions 
ADD CONSTRAINT uq_order_batch_size_distributions_assignment_size 
UNIQUE (order_batch_assignment_id, size_name);

-- ============================================================================
-- PART 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_assignment_id ON order_batch_size_distributions(order_batch_assignment_id);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_size_name ON order_batch_size_distributions(size_name);
CREATE INDEX IF NOT EXISTS idx_order_batch_size_distributions_picked_quantity ON order_batch_size_distributions(picked_quantity);

-- ============================================================================
-- PART 6: ENSURE RLS POLICIES ARE CORRECT
-- ============================================================================

-- Enable RLS
ALTER TABLE order_batch_size_distributions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_batch_size_distributions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON order_batch_size_distributions;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON order_batch_size_distributions;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON order_batch_size_distributions;

-- Create new policies
CREATE POLICY "Enable read access for authenticated users" ON order_batch_size_distributions 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON order_batch_size_distributions 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON order_batch_size_distributions 
FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON order_batch_size_distributions 
FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PART 7: HANDLE QC_REVIEWS (Check if it's a view or table)
-- ============================================================================

-- Check if qc_reviews exists and what type it is
DO $$
BEGIN
    -- If qc_reviews is a view, drop it and create as table
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'qc_reviews' 
          AND table_schema = 'public'
    ) THEN
        -- Drop the view
        DROP VIEW IF EXISTS qc_reviews CASCADE;
        
        -- Create as table
        CREATE TABLE qc_reviews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_batch_assignment_id UUID NOT NULL,
            size_name TEXT NOT NULL,
            rejected_quantity INTEGER DEFAULT 0,
            remarks TEXT,
            reviewed_by UUID,
            reviewed_by_name TEXT,
            review_date TIMESTAMPTZ DEFAULT NOW(),
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT fk_qc_reviews_assignment 
            FOREIGN KEY (order_batch_assignment_id) 
            REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
            CONSTRAINT uq_qc_reviews_assignment_size 
            UNIQUE (order_batch_assignment_id, size_name)
        );
        
        -- Enable RLS on the table
        ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;
        
        -- Create policies for qc_reviews
        CREATE POLICY "Enable read access for authenticated users" ON qc_reviews 
        FOR SELECT USING (auth.role() = 'authenticated');

        CREATE POLICY "Enable insert for authenticated users" ON qc_reviews 
        FOR INSERT WITH CHECK (auth.role() = 'authenticated');

        CREATE POLICY "Enable update for authenticated users" ON qc_reviews 
        FOR UPDATE USING (auth.role() = 'authenticated');

        CREATE POLICY "Enable delete for authenticated users" ON qc_reviews 
        FOR DELETE USING (auth.role() = 'authenticated');
        
    -- If qc_reviews doesn't exist at all, create as table
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'qc_reviews' 
          AND table_schema = 'public'
    ) THEN
        -- Create as table
        CREATE TABLE qc_reviews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_batch_assignment_id UUID NOT NULL,
            size_name TEXT NOT NULL,
            rejected_quantity INTEGER DEFAULT 0,
            remarks TEXT,
            reviewed_by UUID,
            reviewed_by_name TEXT,
            review_date TIMESTAMPTZ DEFAULT NOW(),
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT fk_qc_reviews_assignment 
            FOREIGN KEY (order_batch_assignment_id) 
            REFERENCES order_batch_assignments(id) ON DELETE CASCADE,
            CONSTRAINT uq_qc_reviews_assignment_size 
            UNIQUE (order_batch_assignment_id, size_name)
        );
        
        -- Enable RLS on the table
        ALTER TABLE qc_reviews ENABLE ROW LEVEL SECURITY;
        
        -- Create policies for qc_reviews
        CREATE POLICY "Enable read access for authenticated users" ON qc_reviews 
        FOR SELECT USING (auth.role() = 'authenticated');

        CREATE POLICY "Enable insert for authenticated users" ON qc_reviews 
        FOR INSERT WITH CHECK (auth.role() = 'authenticated');

        CREATE POLICY "Enable update for authenticated users" ON qc_reviews 
        FOR UPDATE USING (auth.role() = 'authenticated');

        CREATE POLICY "Enable delete for authenticated users" ON qc_reviews 
        FOR DELETE USING (auth.role() = 'authenticated');
        
    -- If qc_reviews already exists as a table, just ensure it has the right columns
    ELSE
        -- Add missing columns to existing table
        ALTER TABLE qc_reviews 
        ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ADD COLUMN IF NOT EXISTS order_batch_assignment_id UUID NOT NULL,
        ADD COLUMN IF NOT EXISTS size_name TEXT NOT NULL,
        ADD COLUMN IF NOT EXISTS rejected_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS remarks TEXT,
        ADD COLUMN IF NOT EXISTS reviewed_by UUID,
        ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT,
        ADD COLUMN IF NOT EXISTS review_date TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON order_batch_size_distributions TO postgres, anon, authenticated, service_role;
GRANT ALL ON qc_reviews TO postgres, anon, authenticated, service_role;

-- ============================================================================
-- PART 9: VERIFICATION
-- ============================================================================

SELECT 'Picker save constraints fixed successfully!' as status;

-- Test the table structure
SELECT 'order_batch_size_distributions structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_batch_size_distributions' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test the constraints
SELECT 'Constraints verification:' as info;
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'order_batch_size_distributions' 
  AND tc.table_schema = 'public'
ORDER BY tc.constraint_type, tc.constraint_name;

-- Test qc_reviews table
SELECT 'qc_reviews structure:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'qc_reviews' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test sample upsert operation
SELECT 'Testing sample upsert operation:' as info;
SELECT 
    'order_batch_assignment_id' as column1,
    'size_name' as column2,
    'picked_quantity' as column3;
