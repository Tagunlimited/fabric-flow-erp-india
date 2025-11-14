# Deploy Password Reset Edge Function

The password reset functionality requires the `reset-employee-password` edge function to be deployed to Supabase.

## Option 1: Deploy via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/functions
2. Click **"Create a new function"**
3. Name: `reset-employee-password`
4. Copy the code from: `supabase/functions/reset-employee-password/index.ts`
5. Click **"Deploy"**

## Option 2: Deploy via Supabase CLI

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
   supabase link --project-ref vwpseddaghxktpjtriaj
   ```

4. **Deploy the function:**
   ```bash
   supabase functions deploy reset-employee-password
   ```

## Verify Deployment

After deployment, test the function by:
1. Going to the Employee Access Management page
2. Clicking "Reset Password" on any employee
3. Entering a new password
4. The function should work without CORS errors

## Function Details

- **Function Name**: `reset-employee-password`
- **Method**: POST
- **Authentication**: Requires admin role
- **Location**: `supabase/functions/reset-employee-password/index.ts`

## Troubleshooting

If you still see CORS errors:
1. Verify the function is deployed in Supabase dashboard
2. Check that the function name matches exactly: `reset-employee-password`
3. Ensure your Supabase project has edge functions enabled
4. Check browser console for specific error messages

