# Chat Feature Migration Instructions

You need to run the following migration files to create the chat tables in your Supabase database.

## Migration Files to Run

Run these files in order:

1. **`supabase/migrations/20250121000000_create_chat_messages.sql`**
   - Creates the `chat_messages` table
   - Sets up indexes and RLS policies
   - Enables realtime subscriptions

2. **`supabase/migrations/20250121000001_create_chat_mentions_read.sql`**
   - Creates the `chat_mentions_read` table
   - Tracks which users have read which mentions
   - Sets up indexes and RLS policies

## How to Run Migrations

### Option 1: Using Supabase CLI (Recommended)

```bash
# Make sure you're in the project root directory
cd /Users/mukeshayudh/Documents/V2/fabric-flow-erp-india

# Run the migrations
supabase db push
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of each migration file
4. Run them in order:
   - First: `20250121000000_create_chat_messages.sql`
   - Second: `20250121000001_create_chat_mentions_read.sql`

### Option 3: Using psql (if you have direct database access)

```bash
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/20250121000000_create_chat_messages.sql
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/20250121000001_create_chat_mentions_read.sql
```

## Verification

After running the migrations, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('chat_messages', 'chat_mentions_read');

-- Check if realtime is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages';
```

## Notes

- The migrations use `CREATE TABLE IF NOT EXISTS`, so they're safe to run multiple times
- RLS policies are set up to allow authenticated users to read all messages and insert their own
- The realtime publication is automatically added to the `chat_messages` table

