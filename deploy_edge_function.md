# Deploy the Edge Function for Password Reset

## Steps to Deploy:

1. **Install Supabase CLI** (if not already installed):
   ```bash
   brew install supabase/tap/supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link your project:**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Deploy the function:**
   ```bash
   supabase functions deploy reset-employee-password
   ```

## What this function does:

- Only allows admin users to reset passwords
- Uses Supabase service role to actually update the password
- Validates password length
- Returns success/error messages

After deploying, the password reset will work properly!
