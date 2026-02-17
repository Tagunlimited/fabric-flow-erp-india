# GitHub Actions workflows

## Keep Supabase alive (`keep-alive.yml`)

This workflow calls your Supabase **keep-alive** Edge Function every 24 hours so the project is not paused for inactivity.

### One-time setup

1. **Get your Supabase values**
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
   - **Project URL**: Settings → API → Project URL (e.g. `https://xxxxx.supabase.co`).
   - **Anon key**: Settings → API → Project API keys → `anon` public.

2. **Add GitHub repository secrets**
   - In your repo: **Settings** → **Secrets and variables** → **Actions**.
   - **New repository secret** for each:

   | Secret name           | Value                          |
   |-----------------------|---------------------------------|
   | `SUPABASE_URL`        | Your Project URL (no trailing `/`) |
   | `SUPABASE_ANON_KEY`   | Your `anon` public key          |

3. **Push the workflow**
   - Commit and push `.github/workflows/keep-alive.yml` (and this README if you want). The schedule will run daily at **00:00 UTC**.

### Manual run

- **Actions** → **Keep Supabase alive** → **Run workflow** → **Run workflow**.

### Changing the schedule

Edit the `cron` in `keep-alive.yml`. Examples:

- `0 0 * * *` – every day at 00:00 UTC  
- `0 */12 * * *` – every 12 hours  
- `0 8 * * *` – every day at 08:00 UTC  

[Cron format](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule): minute hour day-of-month month day-of-week.
