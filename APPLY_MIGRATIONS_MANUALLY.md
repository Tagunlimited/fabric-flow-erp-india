# Manual Migration Application Guide

Your production database has a complex migration history that's out of sync with local files. 

## Recommended Approach: Use Supabase Dashboard

Since the CLI migration history is out of sync, the **easiest and safest** way is to apply via Supabase Dashboard:

### Step-by-Step Instructions:

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/tqqhqxfvxgrxxqtcjacl
   - Navigate to: **SQL Editor**

2. **Apply Migration 1: Ensure Fabrics Table**
   - Open file: `supabase/migrations/20251007235959_ensure_fabrics_table.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click **Run**
   - Wait for "Fabrics tables ensured!" message

3. **Apply Migration 2: Add All Missing Tables**
   - Open file: `supabase/migrations/20251008000000_add_all_missing_tables.sql`
   - Copy entire contents  
   - Paste into SQL Editor
   - Click **Run**
   - Wait for "Successfully added all 35 missing tables" message
   - **This will take 30-60 seconds** (it's a large migration)

4. **Apply Migration 3: Create Views**
   - Open file: `supabase/migrations/20251008000001_create_views.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click **Run**
   - Wait for "Successfully created all views!" message

5. **Generate New Types**
   ```bash
   supabase gen types typescript --project-id tqqhqxfvxgrxxqtcjacl > src/integrations/supabase/types.ts
   ```

6. **Verify**
   ```sql
   -- Run this in SQL Editor to verify
   SELECT count(*) as table_count 
   FROM information_schema.tables 
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
   -- Should return ~74
   
   SELECT count(*) as view_count 
   FROM information_schema.views 
   WHERE table_schema = 'public';
   -- Should return 9
   ```

## Why This Approach?

- ✅ Avoids migration history conflicts
- ✅ Direct and immediate
- ✅ You can see exactly what's being executed
- ✅ Easy to rollback if needed (just restore from backup)
- ✅ No risk of CLI sync issues

## Alternative: Fix Migration History (Advanced)

If you want to use CLI in the future, you'd need to:
1. Pull all remote migrations as files
2. Reconcile with local migrations
3. Create a clean migration baseline

But for now, the dashboard approach is **faster and safer**.

---

**Ready to apply?** The migrations are in:
- `supabase/migrations/20251007235959_ensure_fabrics_table.sql` (40 lines)
- `supabase/migrations/20251008000000_add_all_missing_tables.sql` (1,500 lines)
- `supabase/migrations/20251008000001_create_views.sql` (400 lines)

Total: ~1,940 lines of SQL to add 35 tables + 9 views

