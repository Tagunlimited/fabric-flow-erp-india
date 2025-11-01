#!/bin/bash

# ============================================================================
# ROLE-BASED ACCESS CONTROL SYSTEM SETUP SCRIPT
# ============================================================================

echo "🚀 Setting up Role-Based Access Control System..."
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "Please install it from: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "✅ Supabase CLI found"

# Check if we're logged in to Supabase
if ! supabase projects list &> /dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Please run: supabase login"
    exit 1
fi

echo "✅ Logged in to Supabase"

# Run the database migration
echo "📊 Running database migration..."
if supabase db push --file create_sidebar_permissions_system.sql; then
    echo "✅ Database migration completed successfully"
else
    echo "❌ Database migration failed"
    echo "Please check your Supabase connection and try again"
    exit 1
fi

# Verify the migration
echo "🔍 Verifying migration..."
if supabase db diff --schema public | grep -q "sidebar_items\|role_sidebar_permissions\|user_sidebar_permissions"; then
    echo "✅ Migration verification successful"
else
    echo "⚠️  Warning: Could not verify migration. Please check manually in Supabase dashboard"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Go to your Supabase dashboard"
echo "2. Navigate to the SQL editor"
echo "3. Run the create_sidebar_permissions_system.sql script if not already done"
echo "4. Start your development server: npm run dev"
echo "5. Navigate to User & Roles → Sidebar Permissions to manage permissions"
echo ""
echo "For more information, see: ROLE_BASED_ACCESS_CONTROL_GUIDE.md"
