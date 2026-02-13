# 🔧 Designations Debug Guide

## 🎯 **Still Getting "column name does not exist" Error**

Let's debug this step by step to find the exact issue.

---

## 🔍 **Step 1: Run Diagnostic Query**

First, let's see what your actual table structure looks like:

```bash
cat CHECK_DEPARTMENTS_TABLE.sql
```

**Run this in your Supabase dashboard** to see:
- ✅ What columns exist in `departments` table
- ✅ What columns exist in `designations` table  
- ✅ What columns exist in `designation_departments` table
- ✅ Whether the view exists

---

## 🔧 **Step 2: Run Safe Version**

After seeing the diagnostic results, run the safe version:

```bash
cat FIX_DESIGNATIONS_VIEW_SAFE.sql
```

**This version uses `COALESCE` to handle different column names:**
```sql
'name', COALESCE(dept.name, dept.department_name, dept.department_code, 'Unknown')
```

---

## 📊 **Expected Diagnostic Results**

You should see something like:

```
✅ departments table exists
departments table columns:
- id (uuid)
- name (text) OR department_name (varchar) OR department_code (varchar)
- description (text)
- created_at (timestamptz)
- updated_at (timestamptz)

✅ designations table exists  
✅ designation_departments table exists
✅ designations_with_departments view exists
```

---

## 🔧 **Common Issues & Fixes**

### Issue 1: departments table has `department_name` column
**Fix:** The safe version handles this with `COALESCE`

### Issue 2: departments table has `department_code` column  
**Fix:** The safe version handles this with `COALESCE`

### Issue 3: departments table doesn't exist
**Fix:** Run your main migration files first

### Issue 4: designations table doesn't exist
**Fix:** The safe version creates it

---

## 🚀 **Quick Fix Process**

### Step 1: Diagnostic
```bash
cat CHECK_DEPARTMENTS_TABLE.sql
```
Copy → Paste in Supabase → Run → Check results

### Step 2: Safe Fix
```bash
cat FIX_DESIGNATIONS_VIEW_SAFE.sql  
```
Copy → Paste in Supabase → Run → Should work!

### Step 3: Test
Go to your app's Designations page → Should load without errors

---

## 📋 **If Still Not Working**

### Check 1: Verify departments table
```sql
SELECT * FROM departments LIMIT 1;
```

### Check 2: Verify designations table
```sql
SELECT * FROM designations LIMIT 1;
```

### Check 3: Verify view
```sql
SELECT * FROM designations_with_departments LIMIT 1;
```

---

## 🎉 **The Safe Version Should Work!**

The `FIX_DESIGNATIONS_VIEW_SAFE.sql` uses `COALESCE` to handle any column name:
- `dept.name` (if it exists)
- `dept.department_name` (if it exists)  
- `dept.department_code` (if it exists)
- `'Unknown'` (fallback)

**This should fix the column name issue regardless of your table structure!** 🚀
