# ✅ Profile Fix - Run This Now!

## 🎯 Since All Tables Are Already Created

You only need to run the **profile fix** to resolve the loading issue.

---

## 📄 **File to Run**

**`FIX_PROFILE_LOADING_ISSUE.sql`** ✅ (Already Fixed!)

The file already has the UNIQUE constraint:
```sql
user_id UUID UNIQUE NOT NULL  ← Line 12 ✅
```

---

## 🚀 **How to Run**

### Step 1: Open Dashboard
```
https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/sql/new
```
(Or your production dashboard if needed)

### Step 2: Copy & Run
```bash
cat FIX_PROFILE_LOADING_ISSUE.sql
```

Copy the output → Paste in SQL Editor → Click **Run**

---

## ✅ **What This Does**

### 1. Ensures Profiles Table Structure
- ✅ Creates table if missing
- ✅ Adds UNIQUE constraint on `user_id`

### 2. Fixes RLS Policies
- ✅ Removes problematic recursive policies
- ✅ Adds simple, safe policies
- ✅ Allows all authenticated users to view profiles
- ✅ Users can only update their own profile
- ✅ Admins can update any profile

### 3. Auto-Create Trigger (Key Fix!)
- ✅ Creates `handle_new_user()` function
- ✅ Adds trigger on `auth.users` INSERT
- ✅ **Automatically creates profile when user signs up**
- ✅ Uses `ON CONFLICT (user_id)` to handle duplicates

### 4. Backfills Existing Users
- ✅ Creates profiles for any auth users without profiles
- ✅ Sets default role: 'sales manager'
- ✅ Sets default status: 'approved'

### 5. Adds Indexes
- ✅ `idx_profiles_user_id`
- ✅ `idx_profiles_email`
- ✅ `idx_profiles_role`

---

## 📊 **Expected Results**

After running the file, you should see:

```
status: "Profile fix applied successfully!"
profiles_created: [number of profiles]

Followed by a list of all profiles with:
- id
- email
- full_name
- role
- status
- created_at
```

---

## ✅ **Verification**

### Check 1: Profiles exist
```sql
SELECT count(*) FROM profiles;
-- Should match number of auth users
```

### Check 2: All users have profiles
```sql
SELECT 
    (SELECT count(*) FROM auth.users) as total_users,
    (SELECT count(*) FROM profiles) as total_profiles;
-- Numbers should be equal
```

### Check 3: Trigger exists
```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'users' 
  AND trigger_name = 'on_auth_user_created';
-- Should return: on_auth_user_created
```

### Check 4: UNIQUE constraint exists
```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'profiles' 
  AND constraint_type = 'UNIQUE';
-- Should show constraint on user_id
```

---

## 🎯 **Test the Fix**

### Option A: Login Test
1. Log out of your app
2. Log back in
3. ✅ **No profile warning!**
4. Dashboard loads normally

### Option B: Signup Test
1. Create new test user
2. Sign up
3. Login
4. ✅ **Profile auto-created!**
5. ✅ **No warnings!**

---

## 🔧 **If Issue Persists**

Run this to manually check your user's profile:

```sql
-- Replace with your email
SELECT 
    au.id as auth_user_id,
    au.email as auth_email,
    p.id as profile_id,
    p.email as profile_email,
    p.user_id as profile_user_id,
    p.role,
    p.status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.user_id
WHERE au.email = 'YOUR_EMAIL_HERE';
```

If `profile_id` is NULL, manually create:

```sql
-- Replace YOUR_USER_ID and YOUR_EMAIL
INSERT INTO profiles (user_id, email, full_name, role, status)
VALUES (
    'YOUR_USER_ID',
    'YOUR_EMAIL',
    'Your Name',
    'admin',
    'approved'
);
```

---

## 📋 **Summary**

**File:** `FIX_PROFILE_LOADING_ISSUE.sql` ✅ **Ready to run!**

**What it fixes:**
1. ✅ Profile table structure
2. ✅ UNIQUE constraint on user_id
3. ✅ RLS policies (no recursion)
4. ✅ Auto-create trigger
5. ✅ Backfills existing users

**Time:** 10 seconds  
**Risk:** None (uses IF NOT EXISTS)  
**Result:** No more profile loading warnings!

---

## 🎉 **Ready!**

Just run the file:

```bash
cat FIX_PROFILE_LOADING_ISSUE.sql
```

**Dashboard:** https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/sql/new

**This will fix the profile loading issue!** 🚀

