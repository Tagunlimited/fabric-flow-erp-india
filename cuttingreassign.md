# Cutting Master Reassignment Functionality

## Overview
Add functionality to reassign cutting masters for orders in the "Assigned Orders" tab. This allows reassigning left quantities (not yet cut) from one cutting master to another, with options for full or partial reassignment.

## Current System Understanding

### Data Structure
1. **`order_cutting_assignments` table**:
   - `id` (UUID)
   - `order_id` (UUID) - References orders
   - `cutting_master_id` (UUID) - References employees
   - `cutting_master_name` (TEXT)
   - `cutting_master_avatar_url` (TEXT)
   - `assigned_date` (DATE)
   - `assigned_by_id` (UUID)
   - `assigned_by_name` (TEXT)
   - `assigned_quantity` (INTEGER) - Total quantity assigned to this cutting master
   - `completed_quantity` (INTEGER) - Quantity already cut (default 0)
   - `status` (TEXT) - 'assigned', 'in_progress', 'completed'
   - `notes` (TEXT)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **Left Quantity Calculation**:
   - Left Quantity = `assigned_quantity - completed_quantity`
   - If `assigned_quantity` is NULL or 0, it should be calculated from BOM `total_order_qty`

3. **Assigned Orders Tab**:
   - Shows orders where `isOrderFullyAssigned()` returns true
   - Condition: Has cutting master AND stitching rates are set
   - Located in `src/pages/production/AssignOrdersPage.tsx` (TabsContent value="assigned")

### Current Assignment Flow
- When assigning cutting master, records are created in `order_cutting_assignments`
- `assigned_quantity` may be NULL initially and calculated from BOM if needed
- Multiple cutting masters can be assigned to the same order
- Each cutting master has their own `assigned_quantity` and `completed_quantity`

## Requirements

### 1. UI Changes in Assigned Orders Tab
- **Location**: `src/pages/production/AssignOrdersPage.tsx` - Assigned Orders table (around line 1204-1287)
- **Add Button**: "Reassign Cutting Master" button next to "Edit Rate" button
- **Button State**:
  - **Enabled**: When there is at least one cutting master with left quantity > 0
  - **Disabled**: When all cutting masters have `completed_quantity >= assigned_quantity` (all cutting done)
- **Button Placement**: In the Actions column, between "Edit Rate" and "View" buttons

### 2. Reassignment Dialog
- **Component**: Create new dialog component or add to existing dialog structure
- **Dialog Fields**:
  1. **Select Cutting Master to Reassign From** (if multiple cutting masters exist):
     - Dropdown showing all cutting masters assigned to the order
     - Display: Name, Assigned Qty, Completed Qty, Left Qty
     - If only one cutting master, show as read-only info
  2. **Select New Cutting Master**:
     - Dropdown of available cutting masters (exclude the one being reassigned from)
     - Filter to show only "Cutting Master" or "Cutting Manager" designation
  3. **Reassignment Type**:
     - Radio buttons or toggle: "All Left Quantity" / "Partial Quantity"
  4. **Quantity Input** (shown only if "Partial Quantity" selected):
     - Number input with validation
     - Max value = Left Quantity of selected cutting master
     - Min value = 1
  5. **Summary Display**:
     - Show: Current assignment details
     - Show: What will happen after reassignment
     - Example: "Old Master: 100 assigned, 30 completed, 70 left → 50 left (20 reassigned)"
     - Example: "New Master: 0 assigned → 20 assigned"

### 3. Reassignment Logic

#### Step 1: Validate Reassignment
- Check if selected cutting master has left quantity > 0
- If partial: Validate that reassigned quantity <= left quantity
- If all: Use all left quantity

#### Step 2: Calculate Quantities
- **Left Quantity** = `assigned_quantity - completed_quantity` (for old cutting master)
- **Reassigned Quantity** = User input (if partial) OR left quantity (if all)
- **Remaining with Old Master** = `assigned_quantity - reassigned_quantity`
- **New Master Assigned Quantity** = `reassigned_quantity`

#### Step 3: Update Database

**For Old Cutting Master**:
```sql
UPDATE order_cutting_assignments
SET 
  assigned_quantity = assigned_quantity - :reassigned_quantity,
  notes = COALESCE(notes || E'\n', '') || 
    'Reassigned ' || :reassigned_quantity || ' qty to ' || :new_master_name || ' on ' || NOW()::DATE,
  updated_at = NOW()
WHERE id = :old_assignment_id
```

**For New Cutting Master**:
- Check if assignment already exists for this order + new cutting master
- If exists: Update `assigned_quantity` by adding reassigned quantity
- If not exists: Insert new record with:
  - `order_id` = order ID
  - `cutting_master_id` = new cutting master ID
  - `cutting_master_name` = new cutting master name
  - `assigned_quantity` = reassigned quantity
  - `completed_quantity` = 0
  - `assigned_date` = current date
  - `assigned_by_id` = current user ID
  - `assigned_by_name` = current user name
  - `status` = 'assigned'
  - `notes` = 'Reassigned from [old master name] on [date]'

#### Step 4: Handle Edge Cases
- If old master's `assigned_quantity` becomes 0 or less after reassignment:
  - Option A: Keep the record with `assigned_quantity = 0` (for audit trail)
  - Option B: Delete the record (if all quantity reassigned)
  - **Recommendation**: Keep with `assigned_quantity = 0` and update `status = 'completed'` or 'reassigned'
- If new master already has an assignment for this order:
  - Update existing record instead of creating duplicate
  - Add to existing `assigned_quantity`
  - Update notes to include reassignment info

### 4. Display Updates

#### In Assigned Orders Tab
- After reassignment, refresh the assignments list
- Show updated cutting master information
- If old master still has quantity, show both masters
- If old master has 0 quantity, optionally hide or show as "Reassigned"

#### In Cutting Manager Page (for Old Cutting Master)
- Old cutting master should see:
  - Their remaining assigned quantity
  - A note/indicator showing how much was reassigned
  - Example: "Assigned: 50, Completed: 30, Left: 20 (20 reassigned to [New Master Name])"
- This can be displayed in the cutting job details or in a separate "Reassigned Quantities" section

### 5. Data Loading Updates

#### Update `loadAssignments` function
- Currently loads `order_id, cutting_master_id, cutting_master_name, cutting_master_avatar_url, assigned_date`
- **Add**: `assigned_quantity`, `completed_quantity`, `status`, `notes`
- Calculate left quantity for each cutting master
- Store in `OrderAssignment` interface

#### Update `OrderAssignment` interface
```typescript
interface OrderAssignment {
  // ... existing fields ...
  cuttingMasters?: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
    assignedDate: string;
    assignedBy?: string;
    assignedQuantity?: number;      // NEW
    completedQuantity?: number;     // NEW
    leftQuantity?: number;           // NEW (calculated)
    status?: string;                 // NEW
  }>;
}
```

### 6. Button Disable Logic

```typescript
const canReassign = (assignment: OrderAssignment): boolean => {
  if (!assignment.cuttingMasters || assignment.cuttingMasters.length === 0) {
    return false; // No cutting master assigned
  }
  
  // Check if any cutting master has left quantity > 0
  return assignment.cuttingMasters.some(master => {
    const leftQty = (master.assignedQuantity || 0) - (master.completedQuantity || 0);
    return leftQty > 0;
  });
};
```

## Implementation Plan

### Phase 1: Data Loading & Interface Updates
1. **Update `loadAssignments` function** in `AssignOrdersPage.tsx`:
   - Fetch `assigned_quantity`, `completed_quantity`, `status` from `order_cutting_assignments`
   - Calculate `leftQuantity` for each cutting master
   - If `assigned_quantity` is NULL/0, fetch from BOM and update the record

2. **Update `OrderAssignment` interface**:
   - Add `assignedQuantity`, `completedQuantity`, `leftQuantity`, `status` to `cuttingMasters` array items

3. **Update Assigned Orders table display**:
   - Show cutting master details with quantities (Assigned/Completed/Left)
   - Format: "Master Name (Assigned: X, Completed: Y, Left: Z)"

### Phase 2: Reassignment Dialog Component
1. **Create `ReassignCuttingMasterDialog` component**:
   - File: `src/components/production/ReassignCuttingMasterDialog.tsx`
   - Props: `isOpen`, `onClose`, `onSuccess`, `assignment: OrderAssignment`, `workers: Worker[]`
   - State:
     - `selectedOldMasterId`: string | null
     - `selectedNewMasterId`: string | null
     - `reassignmentType`: 'all' | 'partial'
     - `partialQuantity`: number
     - `loading`: boolean

2. **Dialog UI**:
   - Section 1: Current Assignment Info
     - List all cutting masters with their quantities
     - Highlight selected master to reassign from
   - Section 2: Select New Cutting Master
     - Dropdown filtered to cutting masters/managers
     - Exclude the old master
   - Section 3: Reassignment Options
     - Radio: "Reassign All Left Quantity" / "Reassign Partial Quantity"
     - Quantity input (conditional)
   - Section 4: Summary Preview
     - Show before/after state
   - Actions: Cancel, Confirm Reassignment

### Phase 3: Reassignment Handler Function
1. **Create `handleReassignCuttingMaster` function**:
   - Validate inputs
   - Calculate quantities
   - Update old cutting master's record
   - Create/update new cutting master's record
   - Handle edge cases (0 quantity, existing assignment)
   - Show success/error toasts
   - Refresh assignments list

2. **Database Operations**:
   - Use Supabase transactions or sequential updates
   - Ensure data consistency
   - Add proper error handling

### Phase 4: UI Integration
1. **Add "Reassign Cutting Master" button** in Assigned Orders table
2. **Wire up dialog** to button click
3. **Update button disable state** based on `canReassign` logic
4. **Refresh data** after successful reassignment

### Phase 5: Display Updates for Cutting Managers
1. **Update CuttingManagerPage** (if needed):
   - Show reassigned quantities in cutting job details
   - Display notes about reassignments
   - Show remaining quantities clearly

## Files to Modify

1. **`src/pages/production/AssignOrdersPage.tsx`**:
   - Update `loadAssignments` to fetch quantity fields
   - Update `OrderAssignment` interface
   - Add `canReassign` helper function
   - Add "Reassign Cutting Master" button in Assigned Orders table
   - Add `handleReassignCuttingMaster` function
   - Add state for reassignment dialog

2. **`src/components/production/ReassignCuttingMasterDialog.tsx`** (NEW):
   - Create new dialog component for reassignment
   - Handle form state and validation
   - Display current assignments and preview

3. **`src/pages/production/CuttingManagerPage.tsx`** (OPTIONAL):
   - Update to show reassigned quantities if needed
   - Display notes about reassignments

## Database Considerations

### No Schema Changes Required
- All necessary fields already exist in `order_cutting_assignments` table
- `assigned_quantity` and `completed_quantity` fields are available
- `notes` field can store reassignment history

### Data Integrity
- Ensure `assigned_quantity >= completed_quantity` always
- Ensure sum of all `assigned_quantity` for an order doesn't exceed total order quantity (optional validation)
- Handle NULL values gracefully (treat as 0)

## Testing Scenarios

1. **Single Cutting Master - Full Reassignment**:
   - Order has 1 cutting master with 100 assigned, 30 completed (70 left)
   - Reassign all 70 to new master
   - Verify: Old master has 30 assigned (30 completed), New master has 70 assigned

2. **Single Cutting Master - Partial Reassignment**:
   - Order has 1 cutting master with 100 assigned, 30 completed (70 left)
   - Reassign 40 to new master
   - Verify: Old master has 60 assigned (30 completed, 30 left), New master has 40 assigned

3. **Multiple Cutting Masters - Reassign from One**:
   - Order has 2 cutting masters: Master A (100 assigned, 50 completed), Master B (50 assigned, 20 completed)
   - Reassign 30 from Master A to Master C
   - Verify: Master A has 70 assigned (50 completed), Master C has 30 assigned, Master B unchanged

4. **All Cutting Done - Button Disabled**:
   - Order has cutting master with 100 assigned, 100 completed (0 left)
   - Verify: Reassign button is disabled

5. **New Master Already Has Assignment**:
   - Order has Master A with 50 left
   - Master B already has 30 assigned for this order
   - Reassign 20 from Master A to Master B
   - Verify: Master A has 30 left, Master B has 50 assigned (30 + 20)

6. **Edge Case - Reassign All, Old Master Becomes 0**:
   - Order has Master A with 50 assigned, 30 completed (20 left)
   - Reassign all 20 to Master B
   - Verify: Master A has 30 assigned (30 completed, 0 left), Master B has 20 assigned

## Notes

- **No Breaking Changes**: All existing functionality remains intact
- **Backward Compatibility**: Works with both single and multiple cutting master assignments
- **Audit Trail**: Reassignment history stored in `notes` field
- **User Experience**: Clear preview before confirming reassignment
- **Error Handling**: Validate all inputs, handle edge cases gracefully
- **Performance**: Efficient database queries, minimal data fetching

## Success Criteria

1. ✅ Reassign button appears in Assigned Orders tab
2. ✅ Button is disabled when all cutting is done
3. ✅ Dialog allows selecting old master (if multiple), new master, and quantity
4. ✅ Full and partial reassignment options work correctly
5. ✅ Database updates correctly (old master reduced, new master assigned)
6. ✅ Old cutting master can see reassigned quantities
7. ✅ All calculations are accurate
8. ✅ No existing functionality is broken
9. ✅ UI is intuitive and user-friendly
10. ✅ Error handling is robust

