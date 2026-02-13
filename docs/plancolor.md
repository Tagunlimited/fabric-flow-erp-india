# Color Master Implementation Plan

## Overview
Create a centralized Color Master system to manage all colors used across the application (fabrics, items, products, etc.). This will provide a single source of truth for colors and their hex codes, with automatic synchronization when new colors are created.

## Objectives
1. Create `color_master` table in database
2. Build Color Master management page in Masters section
3. Migrate existing colors from all sources (fabric_master, item_master, products, etc.)
4. Auto-sync new colors when created in fabrics/items/products
5. Provide color picker/selector UI with visual color swatches

---

## Phase 1: Database Setup

### 1.1 Create `color_master` Table
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_color_master.sql`

**Schema:**
```sql
CREATE TABLE color_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_name TEXT NOT NULL UNIQUE,
  hex_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX idx_color_master_name ON color_master(color_name);
CREATE INDEX idx_color_master_hex ON color_master(hex_code);
CREATE INDEX idx_color_master_active ON color_master(is_active);

-- RLS Policies
ALTER TABLE color_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all colors"
  ON color_master FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage colors"
  ON color_master FOR ALL
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_color_master_updated_at
  BEFORE UPDATE ON color_master
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 1.2 Create Function to Auto-Add Colors
**File:** Same migration file

**Function:**
```sql
-- Function to ensure color exists in color_master
CREATE OR REPLACE FUNCTION ensure_color_in_master(
  p_color_name TEXT,
  p_hex_code TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_color_id UUID;
  v_hex TEXT;
BEGIN
  -- Normalize color name (trim, capitalize first letter)
  p_color_name := TRIM(INITCAP(p_color_name));
  
  -- Generate hex if not provided (simple hash-based color)
  IF p_hex_code IS NULL OR p_hex_code = '' THEN
    v_hex := generate_hex_from_name(p_color_name);
  ELSE
    v_hex := UPPER(REPLACE(TRIM(p_hex_code), '#', ''));
    -- Validate hex format
    IF LENGTH(v_hex) != 6 OR NOT (v_hex ~ '^[0-9A-F]{6}$') THEN
      v_hex := generate_hex_from_name(p_color_name);
    END IF;
  END IF;
  
  -- Check if color exists
  SELECT id INTO v_color_id
  FROM color_master
  WHERE LOWER(color_name) = LOWER(p_color_name);
  
  -- Insert if doesn't exist
  IF v_color_id IS NULL THEN
    INSERT INTO color_master (color_name, hex_code, created_by)
    VALUES (p_color_name, '#' || v_hex, auth.uid())
    RETURNING id INTO v_color_id;
  ELSE
    -- Update hex if provided and different
    IF p_hex_code IS NOT NULL AND p_hex_code != '' THEN
      UPDATE color_master
      SET hex_code = '#' || v_hex,
          updated_at = NOW()
      WHERE id = v_color_id;
    END IF;
  END IF;
  
  RETURN v_color_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function to generate hex from color name (fallback)
CREATE OR REPLACE FUNCTION generate_hex_from_name(color_name TEXT)
RETURNS TEXT AS $$
DECLARE
  hash INTEGER := 0;
  i INTEGER;
  char_code INTEGER;
BEGIN
  -- Simple hash function to generate consistent color from name
  FOR i IN 1..LENGTH(color_name) LOOP
    char_code := ASCII(SUBSTRING(color_name, i, 1));
    hash := (hash * 31 + char_code) % 16777216; -- 0xFFFFFF
  END LOOP;
  
  RETURN LPAD(TO_HEX(hash), 6, '0');
END;
$$ LANGUAGE plpgsql;
```

### 1.3 Migrate Existing Colors
**File:** Same migration file

**Migration Script:**
```sql
-- Migrate colors from fabric_master
INSERT INTO color_master (color_name, hex_code)
SELECT DISTINCT 
  INITCAP(TRIM(color)) as color_name,
  COALESCE('#' || UPPER(REPLACE(TRIM(hex), '#', '')), generate_hex_from_name(TRIM(color))) as hex_code
FROM fabric_master
WHERE color IS NOT NULL 
  AND TRIM(color) != ''
  AND TRIM(color) != 'N/A'
ON CONFLICT (color_name) DO NOTHING;

-- Migrate colors from item_master (if color column exists)
INSERT INTO color_master (color_name, hex_code)
SELECT DISTINCT 
  INITCAP(TRIM(color)) as color_name,
  generate_hex_from_name(TRIM(color)) as hex_code
FROM item_master
WHERE color IS NOT NULL 
  AND TRIM(color) != ''
  AND TRIM(color) != 'N/A'
ON CONFLICT (color_name) DO NOTHING;

-- Migrate from product_master (if color column exists)
INSERT INTO color_master (color_name, hex_code)
SELECT DISTINCT 
  INITCAP(TRIM(color)) as color_name,
  generate_hex_from_name(TRIM(color)) as hex_code
FROM product_master
WHERE color IS NOT NULL 
  AND TRIM(color) != ''
  AND TRIM(color) != 'N/A'
ON CONFLICT (color_name) DO NOTHING;
```

---

## Phase 2: Frontend Components

### 2.1 Color Master Page
**File:** `src/pages/masters/ColorMasterPage.tsx`

**Features:**
- Table view of all colors with:
  - Color name
  - Hex code
  - Visual color swatch
  - Usage count (how many fabrics/items use this color)
  - Created date
  - Active status
- Add/Edit/Delete colors
- Color picker for hex code selection
- Search and filter functionality
- Bulk import/export (optional)

### 2.2 Color Master Form Component
**File:** `src/components/masters/ColorMasterForm.tsx`

**Features:**
- Form fields:
  - Color Name (text input, required)
  - Hex Code (color picker + text input, required)
  - Active status (toggle)
- Validation:
  - Color name must be unique
  - Hex code must be valid format (#RRGGBB)
- Visual color preview

### 2.3 Color Selector Component (Reusable)
**File:** `src/components/ui/ColorSelector.tsx`

**Features:**
- Dropdown with color swatches
- Search functionality
- "Add new color" option (opens color master form)
- Shows color name + hex + visual swatch
- Returns selected color name and hex

### 2.4 Add to Masters Page
**File:** `src/pages/masters/MastersPage.tsx`

Add new card:
```typescript
{
  title: "Color Master",
  description: "Manage colors and hex codes",
  icon: Palette,
  path: "/masters/colors"
}
```

### 2.5 Add Route
**File:** `src/App.tsx`

Add route:
```typescript
<Route path="/masters/colors" element={
  <ProtectedRouteWithCompanySettings>
    <ColorMasterPage />
  </ProtectedRouteWithCompanySettings>
} />
```

### 2.6 Add to Sidebar
**File:** `src/components/ErpSidebar.tsx`

Add menu item under Masters section (if exists) or create Masters section.

---

## Phase 3: Auto-Sync Integration

### 3.1 Update Fabric Forms
**Files to Update:**
- `src/components/inventory/FabricManagerNew.tsx`
- Any other fabric creation forms

**Changes:**
- When saving fabric with color, call `ensure_color_in_master()` function
- Use ColorSelector component instead of plain text input
- Auto-add color to color_master if it doesn't exist

### 3.2 Update Item Forms
**Files to Update:**
- `src/components/masters/ItemMaster.tsx`
- Any other item creation forms

**Changes:**
- Use ColorSelector component
- Auto-sync colors to color_master

### 3.3 Update Product Forms
**Files to Update:**
- `src/components/masters/ProductMaster.tsx`
- Any other product creation forms

**Changes:**
- Use ColorSelector component
- Auto-sync colors to color_master

### 3.4 Update Order Forms
**Files to Update:**
- `src/components/orders/OrderForm.tsx`
- `src/components/purchase-orders/BomForm.tsx`
- `src/components/purchase-orders/PurchaseOrderForm.tsx`

**Changes:**
- Replace color selection with ColorSelector
- Auto-sync new colors

### 3.5 Database Triggers (Optional)
**File:** Migration file

**Triggers:**
```sql
-- Trigger on fabric_master to auto-add colors
CREATE OR REPLACE FUNCTION sync_fabric_color_to_master()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.color IS NOT NULL AND TRIM(NEW.color) != '' THEN
    PERFORM ensure_color_in_master(NEW.color, NEW.hex);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fabric_color_sync_trigger
  AFTER INSERT OR UPDATE OF color, hex ON fabric_master
  FOR EACH ROW
  WHEN (NEW.color IS NOT NULL)
  EXECUTE FUNCTION sync_fabric_color_to_master();
```

---

## Phase 4: Utility Functions

### 4.1 Color Utilities
**File:** `src/utils/colorUtils.ts`

**Functions:**
- `normalizeColorName(name: string): string` - Normalize color names
- `validateHexCode(hex: string): boolean` - Validate hex format
- `generateHexFromName(name: string): string` - Generate hex from name
- `ensureColorInMaster(colorName: string, hexCode?: string): Promise<void>` - Call DB function
- `getAllColors(): Promise<Color[]>` - Fetch all colors
- `getColorUsageCount(colorId: string): Promise<number>` - Count usage

### 4.2 Database Functions
**File:** `src/lib/database.ts` or create `src/lib/colors.ts`

**Functions:**
- `fetchColors()` - Get all colors from color_master
- `createColor(colorName, hexCode)` - Create new color
- `updateColor(id, colorName, hexCode)` - Update color
- `deleteColor(id)` - Delete color (with usage check)
- `ensureColorExists(colorName, hexCode?)` - Auto-add if missing

---

## Phase 5: UI/UX Enhancements

### 5.1 Color Swatch Display
- Show color swatch in all color dropdowns
- Visual preview in forms
- Color picker integration

### 5.2 Usage Statistics
- Show how many fabrics/items/products use each color
- Prevent deletion if color is in use (or show warning)
- Link to items using the color

### 5.3 Search & Filter
- Search by color name
- Filter by hex code range
- Sort by name, usage count, date

---

## Implementation Steps

### Step 1: Database Migration
1. Create migration file with `color_master` table
2. Create helper functions (`ensure_color_in_master`, `generate_hex_from_name`)
3. Run migration to create table
4. Run data migration to import existing colors
5. Test in Supabase SQL editor

### Step 2: Basic Color Master Page
1. Create `ColorMasterPage.tsx`
2. Create `ColorMasterForm.tsx`
3. Add route in `App.tsx`
4. Add card in `MastersPage.tsx`
5. Test CRUD operations

### Step 3: Color Selector Component
1. Create reusable `ColorSelector.tsx`
2. Integrate with Color Master
3. Add "Add new color" functionality
4. Test in isolation

### Step 4: Auto-Sync Integration
1. Update fabric forms to use ColorSelector
2. Update item forms to use ColorSelector
3. Update product forms to use ColorSelector
4. Test auto-sync when creating new items

### Step 5: Database Triggers (Optional)
1. Add triggers for automatic sync
2. Test trigger functionality
3. Verify no duplicate colors

### Step 6: Testing & Refinement
1. Test all forms with color selection
2. Verify existing colors are preserved
3. Test color creation from various forms
4. Verify color master shows all colors
5. Test edge cases (empty colors, invalid hex, etc.)

---

## Database Schema Details

### color_master Table
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier |
| color_name | TEXT | NOT NULL, UNIQUE | Color name (e.g., "Red", "Navy Blue") |
| hex_code | TEXT | NOT NULL | Hex color code (e.g., "#FF0000") |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |
| created_by | UUID | REFERENCES auth.users(id) | User who created the color |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |

### Indexes
- `idx_color_master_name` on `color_name` (for fast lookups)
- `idx_color_master_hex` on `hex_code` (for hex-based searches)
- `idx_color_master_active` on `is_active` (for filtering active colors)

---

## Files to Create/Modify

### New Files
1. `supabase/migrations/YYYYMMDDHHMMSS_create_color_master.sql`
2. `src/pages/masters/ColorMasterPage.tsx`
3. `src/components/masters/ColorMasterForm.tsx`
4. `src/components/ui/ColorSelector.tsx`
5. `src/utils/colorUtils.ts`
6. `src/lib/colors.ts` (optional)

### Files to Modify
1. `src/pages/masters/MastersPage.tsx` - Add Color Master card
2. `src/App.tsx` - Add route
3. `src/components/ErpSidebar.tsx` - Add menu item (if needed)
4. `src/components/inventory/FabricManagerNew.tsx` - Use ColorSelector
5. `src/components/masters/ItemMaster.tsx` - Use ColorSelector
6. `src/components/masters/ProductMaster.tsx` - Use ColorSelector
7. `src/components/orders/OrderForm.tsx` - Use ColorSelector
8. `src/components/purchase-orders/BomForm.tsx` - Use ColorSelector
9. `src/components/purchase-orders/PurchaseOrderForm.tsx` - Use ColorSelector
10. `src/components/goods-receipt-notes/GRNForm.tsx` - Use ColorSelector (if applicable)

---

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Existing colors are migrated correctly
- [ ] Color Master page loads and displays colors
- [ ] Can create new color with name and hex
- [ ] Can edit existing color
- [ ] Can delete color (with proper checks)
- [ ] ColorSelector component works in forms
- [ ] Creating fabric with new color auto-adds to color_master
- [ ] Creating item with new color auto-adds to color_master
- [ ] Creating product with new color auto-adds to color_master
- [ ] Color validation works (unique names, valid hex)
- [ ] Color swatches display correctly
- [ ] Search and filter work in Color Master page
- [ ] Usage count displays correctly
- [ ] No duplicate colors created

---

## Future Enhancements (Optional)

1. **Color Groups/Categories** - Group colors (e.g., "Blues", "Reds", "Neutrals")
2. **Color Variations** - Light/Dark variations of same color
3. **Bulk Import** - Import colors from CSV/Excel
4. **Color History** - Track when colors were added/used
5. **Color Suggestions** - Suggest similar colors
6. **Pantone Integration** - Link to Pantone color codes
7. **Color Analytics** - Most used colors, color trends

---

## Notes

- Color names will be normalized (trimmed, capitalized first letter)
- Hex codes will be validated and normalized (uppercase, with # prefix)
- If hex code is missing, a consistent color will be generated from the color name
- Colors can be soft-deleted (is_active = false) to preserve history
- All authenticated users can view/manage colors (RLS policies)

---

## Approval

Please review this plan and approve to begin implementation. Any changes or additions needed?

