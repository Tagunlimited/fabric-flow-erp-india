# Logo Size Configuration Feature

## Overview
The Logo Size Configuration feature allows administrators to customize the size of all logos displayed throughout the ERP application from a single location in the Company Configuration page.

## Features

### 1. Database Schema
- Added `logo_sizes` JSONB field to `company_settings` table
- Stores size configurations for all logo types:
  - `sidebar_logo_height` - Height of sidebar logo
  - `sidebar_logo_width` - Width of sidebar logo  
  - `header_logo_height` - Height of header logo
  - `header_logo_width` - Width of header logo
  - `company_logo_height` - Height of company logo
  - `company_logo_width` - Width of company logo
  - `favicon_size` - Size of favicon

### 2. User Interface
- **Quick Preset Selector**: Apply common sizes (16px, 24px, 32px, 40px, 48px) to all logos
- **Individual Controls**: Fine-tune each logo type separately
- **Live Preview**: See changes in real-time as you configure sizes
- **Responsive Design**: Works on desktop and mobile devices

### 3. Implementation Details

#### Database Migration
```sql
-- File: supabase/migrations/20250108000000_add_logo_size_configuration.sql
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS logo_sizes JSONB DEFAULT '{
  "sidebar_logo_height": "32px",
  "sidebar_logo_width": "auto",
  "header_logo_height": "32px", 
  "header_logo_width": "auto",
  "company_logo_height": "48px",
  "company_logo_width": "auto",
  "favicon_size": "16px"
}'::jsonb;
```

#### TypeScript Interface
```typescript
interface CompanyConfig {
  // ... existing fields
  logo_sizes?: {
    sidebar_logo_height: string;
    sidebar_logo_width: string;
    header_logo_height: string;
    header_logo_width: string;
    company_logo_height: string;
    company_logo_width: string;
    favicon_size: string;
  };
}
```

#### Component Updates
- **ErpSidebar.tsx**: Uses `config.logo_sizes?.sidebar_logo_height` and `config.logo_sizes?.sidebar_logo_width`
- **ErpLayout.tsx**: Uses `config.logo_sizes?.header_logo_height` and `config.logo_sizes?.header_logo_width`
- **CompanyConfigPage.tsx**: Provides UI controls for configuration

## How to Use

### 1. Access Configuration
1. Navigate to **Admin** → **Company Configuration**
2. Scroll to the **Branding Assets** section
3. Find the **Logo Size Configuration** panel

### 2. Quick Setup
1. Use the **Quick Preset Sizes** dropdown
2. Select a common size (16px, 24px, 32px, 40px, 48px)
3. This applies the size to all logos automatically

### 3. Custom Configuration
1. Use individual height/width controls for each logo type
2. Enter values like "32px", "2rem", "auto", etc.
3. View live preview of changes
4. Click **Save Configuration** to apply changes

### 4. Supported Size Values
- **Pixel values**: "16px", "24px", "32px", etc.
- **Relative units**: "2rem", "1.5em", etc.
- **Auto**: "auto" (maintains aspect ratio)
- **Percentage**: "100%", "50%", etc.

## Benefits

1. **Centralized Control**: Manage all logo sizes from one location
2. **Consistent Branding**: Ensure logos look consistent across the application
3. **Responsive Design**: Logos adapt to different screen sizes
4. **Easy Maintenance**: No need to edit multiple components
5. **User-Friendly**: Intuitive interface with presets and live preview

## Technical Notes

- Changes are saved to the `company_settings` table
- All logo components automatically use the configured sizes
- Fallback to default sizes if configuration is missing
- Supports both collapsed and expanded sidebar states
- Maintains aspect ratio when width is set to "auto"

## Files Modified

1. `supabase/migrations/20250108000000_add_logo_size_configuration.sql`
2. `src/hooks/CompanySettingsContext.tsx`
3. `src/pages/admin/CompanyConfigPage.tsx`
4. `src/components/ErpSidebar.tsx`
5. `src/components/ErpLayout.tsx`

## Testing

To test the functionality:
1. Apply the database migration
2. Navigate to Company Configuration
3. Change logo sizes using presets or custom values
4. Verify changes appear in sidebar and header
5. Test with different logo images and sizes
