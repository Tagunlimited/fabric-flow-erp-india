#!/bin/bash

# Setup Sidebar Permissions System
# This script sets up the complete sidebar permissions system

echo "Setting up Sidebar Permissions System..."

# Run the SQL script to create tables and permissions
echo "Creating database tables and permissions..."
psql -h localhost -U postgres -d fabric_flow_erp -f fix_sidebar_permissions_system.sql

if [ $? -eq 0 ]; then
    echo "✅ Database setup completed successfully!"
else
    echo "❌ Database setup failed. Please check the error messages above."
    exit 1
fi

echo "Sidebar permissions system setup complete!"
echo ""
echo "Next steps:"
echo "1. Run the SetupAdminPermissions component in the UI"
echo "2. Assign roles to users through the Employee Access Management"
echo "3. Customize individual user permissions as needed"
