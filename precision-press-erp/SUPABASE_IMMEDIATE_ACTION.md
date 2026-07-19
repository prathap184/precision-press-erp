# 🚀 Supabase Migration - IMMEDIATE ACTION REQUIRED

## Current Status

✅ **Completed:**
- Supabase project created
- Credentials configured in `.env.local`
- Migration scripts prepared
- Schema SQL file ready

❌ **Blocked On:**
- Supabase tables do not exist yet
- Data migration cannot proceed until tables are created

---

## What You Need To Do Right Now

### Option 1: Supabase Dashboard (Easiest - Recommended)

**Time**: ~5 minutes

1. **Open Supabase Dashboard**
   - Go to: https://app.supabase.com
   - Sign in with your account
   - Find project: **press-523e2** (or click the project from recent)

2. **Navigate to SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New query** button at the top

3. **Load the migration script**
   - In VS Code, open file: `supabase/migrations/0001_initial_schema.sql`
   - Select all content (Ctrl+A)
   - Copy (Ctrl+C)

4. **Execute the SQL**
   - In Supabase SQL Editor, paste the content
   - Click **RUN** button (or Ctrl+Enter)
   - Wait for completion (you'll see a success message)

5. **Verify tables were created**
   - Go to **Database** > **Tables** in left sidebar
   - You should see: `profiles`, `products`, `orders`, `order_items`, etc.

### Option 2: Supabase CLI (For automation)

**Time**: ~5 minutes (one-time setup)

```bash
# Verify you have Supabase CLI
npx supabase --version

# Link your local project to the remote Supabase project
supabase link --project-ref arffwmwpimdmhgmylpzi

# When prompted for password, enter your Supabase project password
# You can find it in: Supabase Dashboard > Settings > Database > Password

# Push the migration
supabase db push

# Verify success
supabase db list
```

### Option 3: Direct psql Connection

**Time**: ~5 minutes (requires psql installed)

```bash
# Get your database URL from Supabase Dashboard:
# Database > Connection Pooling > URI

psql "postgresql://postgres:[PASSWORD]@db.arffwmwpimdmhgmylpzi.supabase.co:6543/postgres"

# Then paste contents of: supabase/migrations/0001_initial_schema.sql
# Type: \quit to exit
```

---

## After Creating Tables

### Step 1: Verify tables exist

```bash
npm run supabase:test-connection
```

**Expected output:**
```
ANON: url=https://arffwmwpimdmhgmylpzi.supabase.co
ANON: key=eyJhbGci...zSrj6oEg
ANON query success: []

SERVICE: url=https://arffwmwpimdmhgmylpzi.supabase.co
SERVICE: key=eyJhbGci..._tnrBrT8
SERVICE query success: []
```

**If you see an error like "Could not find the table 'public.profiles'":**
- Go back and re-run the SQL migration in Supabase Dashboard
- Make sure you clicked RUN and got a success message

### Step 2: Migrate your data

```bash
npm run supabase:init-and-migrate
```

This will:
- ✅ Verify all tables exist
- 📦 Migrate all your Firestore collections to Supabase
- 🔍 Show you row counts for each table
- 💾 Preserve your order items from nested collections

**Expected output:**
```
🔍 Phase 1: Checking if Supabase tables exist...

   ✅ profiles: EXISTS
   ✅ categories: EXISTS
   ✅ products: EXISTS
   ✅ orders: EXISTS
   ✅ order_items: EXISTS
   [... more tables ...]

🔄 Phase 2: Migrating data from Firestore to Supabase...

   📦 Migrating profiles -> profiles...
   ✅ Upserted 12 rows into profiles
   📦 Migrating categories -> categories...
   ✅ Upserted 5 rows into categories
   [... more collections ...]

🔍 Phase 3: Validating migration results...

   ✅ profiles: 12 rows
   ✅ categories: 5 rows
   [... all tables with row counts ...]

🎉 Supabase initialization and migration completed successfully!
```

---

## Troubleshooting

### "Could not find the table 'public.profiles'"

**Solution**: The SQL migration hasn't been run yet. Go back to Supabase Dashboard and run the SQL script.

### "Could not authenticate against Supabase"

**Solution**: Check your `.env.local` file:
```bash
# These should not be empty:
SUPABASE_URL=https://arffwmwpimdmhgmylpzi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci... (long JWT token)
```

If they're wrong, update from: https://app.supabase.com > Settings > API

### "Connection refused / timeout"

**Solution**: Your Supabase project might be paused or in a different region. Check:
1. https://app.supabase.com > Settings > Billing > Pause project (should be unpaused)
2. Verify URL matches your project

### "Data migration hung or took too long"

**Solution**: Large Firestore collections take time. Check:
- How many orders do you have? (Check Firestore console)
- The script processes ~10 items per second
- Let it run in the background if needed

---

## What Happens Next (After Migration)

Once tables are created and data is migrated:

1. **PHASE 2: Dual-Read Layer**
   - App will try to read from Supabase first
   - Falls back to Firestore if needed
   - Firestore writes continue (no data loss)

2. **PHASE 3: Read-Only Migration**
   - Remove fallback for stable queries
   - Keep Firestore as backup

3. **PHASE 4: Write Migration**
   - Move writes from Firestore to Supabase
   - Ensure consistency

4. **PHASE 5: Cleanup**
   - Remove Firebase dependencies
   - Archive Firestore

See **SUPABASE_MIGRATION_PLAN.md** for full details.

---

## Questions?

- **Supabase Docs**: https://supabase.com/docs
- **Dashboard**: https://app.supabase.com
- **Project**: `arffwmwpimdmhgmylpzi`

---

## ✅ Checklist

- [ ] Created Supabase tables using one of the 3 methods above
- [ ] Ran `npm run supabase:test-connection` and got success
- [ ] Ran `npm run supabase:init-and-migrate` and saw all data migrated
- [ ] Verified row counts in Supabase Dashboard
- [ ] Ready to proceed with PHASE 2 (dual-read implementation)

