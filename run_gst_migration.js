// Run the GST rate migration script
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vwpseddaghxktpjtriaj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3cHNlZGRhZ2h4a3RwanRyaWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjgzNjQsImV4cCI6MjA3NTQ0NDM2NH0.b-TPhSHiEeqJOg81dgUv50UxVwHQWzGLcI2j1CwMBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runGSTMigration() {
  console.log('🚀 Starting GST rate migration...');

  try {
    // Add gst_rate column to order_items table
    console.log('📝 Adding gst_rate column to order_items table...');
    const { data: alterResult, error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'gst_rate') THEN
                ALTER TABLE order_items ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
                RAISE NOTICE 'Column gst_rate added to order_items table.';
            ELSE
                RAISE NOTICE 'Column gst_rate already exists in order_items table, skipping add.';
            END IF;
        END $$;
      `
    });

    if (alterError) {
      console.error('❌ Error adding gst_rate column:', alterError);
      return;
    }

    console.log('✅ gst_rate column added successfully');

    // Update existing order_items to extract gst_rate from specifications
    console.log('🔄 Updating existing order_items with gst_rate from specifications...');
    const { data: updateResult, error: updateError } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE order_items 
        SET gst_rate = COALESCE(
            (specifications->>'gst_rate')::DECIMAL(5,2),
            0
        )
        WHERE gst_rate = 0 
        AND specifications IS NOT NULL 
        AND specifications ? 'gst_rate';
      `
    });

    if (updateError) {
      console.error('❌ Error updating gst_rate:', updateError);
      return;
    }

    console.log('✅ Existing order_items updated with gst_rate');

    // Verify the table structure
    console.log('🔍 Verifying table structure...');
    const { data: verifyResult, error: verifyError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'order_items'
        ORDER BY ordinal_position;
      `
    });

    if (verifyError) {
      console.error('❌ Error verifying table structure:', verifyError);
      return;
    }

    console.log('📊 Table structure:', verifyResult);

    console.log('🎉 GST rate migration completed successfully!');

  } catch (error) {
    console.error('💥 Migration failed:', error);
  }
}

runGSTMigration();
