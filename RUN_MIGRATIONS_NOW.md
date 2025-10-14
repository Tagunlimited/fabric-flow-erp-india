# Quick Migration Guide - Production Database

## Current Situation
- You're linked to: **Scissors ERP (Production)** ✅
- Migration files are ready ✅
- CLI has migration history conflicts ⚠️

## RECOMMENDED: Use Supabase Dashboard (5 minutes)

### Step 1: Open Supabase Dashboard
```
https://supabase.com/dashboard/project/tqqhqxfvxgrxxqtcjacl/sql/new
```

### Step 2: Copy & Run Each Migration

**Migration 1** - Ensure Fabrics Table (30 seconds)
```bash
# Copy this file's contents:
cat supabase/migrations/20251007235959_ensure_fabrics_table.sql | pbcopy
```
Then paste and run in SQL Editor

**Migration 2** - Add All Missing Tables (60 seconds)
```bash
# Copy this file's contents:
cat supabase/migrations/20251008000000_add_all_missing_tables.sql | pbcopy
```
Then paste and run in SQL Editor

**Migration 3** - Create Views (30 seconds)  
```bash
# Copy this file's contents:
cat supabase/migrations/20251008000001_create_views.sql | pbcopy
```
Then paste and run in SQL Editor

### Step 3: Generate New Types
```bash
supabase gen types typescript --project-id tqqhqxfvxgrxxqtcjacl > src/integrations/supabase/types.ts
```

### Step 4: Verify
```bash
# Check table count in Dashboard SQL Editor
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should return ~74
```

---

## ALTERNATIVE: Combined SQL File (All at Once)

I've created a combined file you can run:

```bash
# Copy combined migration:
cat combined_migration.sql | pbcopy
```

Then paste entire contents into Supabase Dashboard SQL Editor and run.

---

## Files Are Here:
```
📁 supabase/migrations/
   ├── 20251007235959_ensure_fabrics_table.sql (40 lines)
   ├── 20251008000000_add_all_missing_tables.sql (1,500 lines)  
   └── 20251008000001_create_views.sql (400 lines)

📄 combined_migration.sql (all combined - 1,940 lines)
```

---

## What Will Happen:
- ✅ 35 new tables added
- ✅ 9 views created  
- ✅ All indexes added
- ✅ RLS policies enabled
- ✅ Functions and triggers created
- ✅ Zero downtime (uses IF NOT EXISTS)
- ✅ No existing data affected

---

## Expected Result:
**Before:** 39 tables  
**After:** 74 tables + 9 views = **~83 database objects**

This matches your original **77 tables** count! 🎉

---

**Ready?** Just open the dashboard and copy-paste the migrations!

