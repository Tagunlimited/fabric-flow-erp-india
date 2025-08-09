# Receipt Number Generation Fix

## Problem
The application was experiencing "duplicate key value violates unique constraint 'receipts_receipt_number_key'" errors when creating receipts. This happened due to a race condition in the receipt number generation logic.

## Root Cause
1. **Race Condition**: Multiple receipts could be created simultaneously
2. **Non-atomic Sequence Generation**: The JavaScript code was fetching the last receipt number, extracting the sequence, and incrementing it, but this wasn't atomic
3. **Unique Constraint Violation**: The database enforces uniqueness on `receipt_number`, causing failures when duplicate numbers were generated

## Solution
Implemented a database-level solution using PostgreSQL triggers and functions:

### 1. Database Trigger
- **Function**: `generate_receipt_number()` - Automatically generates receipt numbers in format `RCP/YY-YY/MON/SEQ`
- **Trigger**: `receipts_generate_number` - Fires before INSERT when `receipt_number` is NULL
- **Atomic Operation**: Database-level generation ensures no race conditions

### 2. Application Changes
- Removed manual receipt number generation from JavaScript
- Added retry logic with exponential backoff for edge cases
- Added fallback receipt number generation using timestamp

### 3. Migration File
- `20250101000005_fix_receipt_number_generation.sql` - Contains the database changes

## How to Apply the Fix

### Step 1: Apply Database Migration
```bash
# Run the migration in your Supabase project
supabase db push
```

### Step 2: Verify the Fix
Run the test script to ensure everything works:
```bash
# Execute the test script in your database
psql -d your_database -f test_receipt_fix.sql
```

### Step 3: Test in Application
1. Create multiple receipts simultaneously
2. Verify no duplicate key errors occur
3. Check that receipt numbers are generated correctly

## Benefits
1. **Eliminates Race Conditions**: Database-level generation is atomic
2. **Improved Reliability**: No more duplicate key constraint violations
3. **Better Performance**: No need to query for sequence numbers in application
4. **Maintainable**: Logic centralized in database

## Fallback Mechanism
If the database trigger fails for any reason, the application includes:
- Retry logic with exponential backoff
- Fallback receipt number generation using timestamp
- Comprehensive error handling

## Receipt Number Format
- **Format**: `RCP/YY-YY/MON/SEQ`
- **Example**: `RCP/24-25/Jan/001`
- **Financial Year**: April to March (Indian financial year)
- **Sequence**: 3-digit padded sequence number per month

## Testing
The fix has been tested with:
- Multiple simultaneous receipt creations
- Edge cases and error conditions
- Database constraint validation
- Application error handling

## Monitoring
Monitor the application logs for:
- Retry attempts (should be minimal)
- Fallback receipt number usage (should be rare)
- Any remaining constraint violations (should be eliminated)
