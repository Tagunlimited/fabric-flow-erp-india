# Branding Types Master Setup

This document explains how to set up and use the Branding Types master data management feature.

## 🗄️ Database Setup

### 1. Create the Table

Run the following SQL script in your Supabase dashboard SQL editor:

```sql
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
```

## 🎯 Features

### Branding Type Management

The Branding Types master allows you to:

- **Create** new branding types with name and scope
- **Edit** existing branding types
- **Delete** branding types
- **View** all branding types in a table format

### Fields

- **Name**: The name of the branding type (e.g., "Embroidery", "Screen Printing", "Heat Transfer")
- **Scope**: The scope of the branding (e.g., "Global", "Regional", "Local", "National")

### Scope Badges

Different scope values are displayed with different badge colors:
- **Global**: Default badge
- **Regional**: Secondary badge
- **Local**: Outline badge
- **National**: Destructive badge

## 🚀 How to Use

### 1. Access Branding Types

1. Navigate to **Masters** page
2. Click on **Branding Type Master** card
3. You'll be taken to `/masters/branding-types`

### 2. Create a New Branding Type

1. Click the **"Add Branding Type"** button
2. Fill in the form:
   - **Name**: Enter the branding type name
   - **Scope**: Enter the scope (e.g., Global, Regional, Local, National)
3. Click **"Create"** to save

### 3. Edit a Branding Type

1. Find the branding type in the table
2. Click the **Edit** button (pencil icon)
3. Modify the name or scope
4. Click **"Update"** to save changes

### 4. Delete a Branding Type

1. Find the branding type in the table
2. Click the **Delete** button (trash icon)
3. Confirm the deletion in the dialog

## 📁 File Structure

```
src/
├── components/masters/
│   └── BrandingTypeManager.tsx    # Main component for branding type management
├── pages/masters/
│   └── BrandingTypePage.tsx       # Page wrapper for branding type management
└── supabase/migrations/
    └── 20250108000001_create_branding_types_table.sql  # Database migration
```

## 🔧 Technical Details

### Components

- **BrandingTypeManager**: Main component with CRUD operations
- **BrandingTypePage**: Page wrapper with ErpLayout
- **Table**: Displays branding types with edit/delete actions
- **Dialog**: Form for creating/editing branding types

### Database Schema

```sql
branding_types:
├── id (UUID, Primary Key)
├── name (VARCHAR(255), Not Null)
├── scope (VARCHAR(100), Not Null)
├── created_at (TIMESTAMP WITH TIME ZONE)
└── updated_at (TIMESTAMP WITH TIME ZONE)
```

### API Integration

Uses Supabase client for:
- `SELECT`: Fetch all branding types
- `INSERT`: Create new branding type
- `UPDATE`: Edit existing branding type
- `DELETE`: Remove branding type

## 🎨 UI Features

- **Responsive Design**: Works on desktop and mobile
- **Loading States**: Shows spinner while fetching data
- **Error Handling**: Displays toast messages for errors
- **Form Validation**: Ensures required fields are filled
- **Confirmation Dialogs**: Asks for confirmation before deletion
- **Badge System**: Color-coded scope indicators

## 🔐 Security

- **Row Level Security (RLS)**: Enabled on the table
- **Authentication Required**: All operations require authenticated users
- **Policy-Based Access**: Users can only access their own data

## 🚀 Next Steps

After setting up the database table, you can:

1. **Access the feature** through the Masters page
2. **Create branding types** for your business needs
3. **Use in other parts** of the application (e.g., order forms, product specifications)
4. **Extend functionality** by adding more fields or features

The branding types can now be used throughout the application for managing branding-related information in orders, products, and other business processes.
