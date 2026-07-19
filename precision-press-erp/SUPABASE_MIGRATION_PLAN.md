# Supabase Migration Plan & Status

## Overview

This document outlines the phased migration from Firebase/Firestore to Supabase for the Precision Press ERP system.

**Current Status**: PHASE 1 - Schema and Data Initialization

---

## PHASE 1: Supabase Initialization & Data Migration

### ✅ Completed Tasks

1. **Environment Setup**
   - Supabase project created: `arffwmwpimdmhgmylpzi`
   - Keys added to `.env.local`:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`

2. **Client/Server Wiring**
   - Created `src/lib/supabase.ts` (browser client)
   - Created `src/lib/supabase-server.ts` (server-side)
   - Created `src/lib/supabase-admin.ts` (admin operations)

3. **Migration Infrastructure**
   - Firestore → Supabase schema SQL: `supabase/migrations/0001_initial_schema.sql`
   - Data migration scripts: `scripts/init-and-migrate-supabase.ts`
   - Connection test script: `scripts/test-supabase-connection.ts`

4. **npm Commands Added**
   ```bash
   npm run supabase:test-connection      # Validate Supabase credentials
   npm run supabase:init-and-migrate     # Initialize & migrate data
   ```

### 📋 Next Steps (Required Manual Action)

#### Step 1: Create Supabase Tables

Tables do not exist in the Supabase instance yet. Create them using **one** of these methods:

**Option A: Supabase Dashboard (Recommended for beginners)**
1. Open: https://app.supabase.com
2. Select project: `press-523e2` (arffwmwpimdmhgmylpzi)
3. Click **SQL Editor** in left sidebar
4. Click **New query**
5. Open file: `supabase/migrations/0001_initial_schema.sql`
6. Copy entire content
7. Paste into SQL Editor in Supabase
8. Click **Run**
9. Wait for completion (tables + indexes will be created)

**Option B: Supabase CLI (For automation)**
```bash
# Install/verify Supabase CLI
npx supabase --version

# Link to your project
supabase link --project-ref arffwmwpimdmhgmylpzi

# Push migrations
supabase db push

# Verify
supabase db list
```

**Option C: Direct Database Connection (psql)**
```bash
# Get connection string from Supabase dashboard (Database > Connection Pooling > URI)
psql "postgresql://postgres:[PASSWORD]@db.arffwmwpimdmhgmylpzi.supabase.co:6543/postgres"

# Then paste contents of supabase/migrations/0001_initial_schema.sql
```

#### Step 2: Verify Tables Created

Run the connection test to verify:
```bash
npm run supabase:test-connection
```

Expected output:
```
ANON: url=https://arffwmwpimdmhgmylpzi.supabase.co
ANON: key=eyJhbGci...
ANON query success: []

SERVICE: url=https://arffwmwpimdmhgmylpzi.supabase.co
SERVICE: key=eyJhbGci...
SERVICE query success: []
```

If you see "Could not find the table 'public.profiles'" → Go back to Step 1

#### Step 3: Migrate Data from Firestore to Supabase

Run the migration script:
```bash
npm run supabase:init-and-migrate
```

This will:
- ✅ Check that all required tables exist
- 📦 Migrate all Firestore collections to Supabase tables
- 🔍 Validate that migration completed successfully
- 📊 Show row counts for each table

Expected output:
```
✅ Supabase initialization and migration completed successfully!

ℹ️  Next steps (PHASE 2: Dual-read implementation):
   1. Review data integrity in each table
   2. Implement fallback read layer in app/api and lib/services
   3. Keep Firestore writes active during testing
   4. Monitor logs for consistency issues
```

---

## PHASE 2: Dual-Read Fallback Implementation

**Status**: NOT STARTED

### Objective
Implement "dual-read" mode where the app:
1. **Tries Supabase first** (fastest, new source of truth)
2. **Falls back to Firestore** if data not found (safety net)
3. **Keeps Firestore writes active** (no data loss)

### Architecture

```
App Code (e.g., src/app/(dashboard)/admin/page.tsx)
         ↓
    trySupabase()
         ↓
    [SUCCESS] ✅ Return data from Supabase
    [FAIL] ↓
    tryFirestore()
         ↓
    [SUCCESS] ✅ Return data from Firestore
    [FAIL] ↓
    Error logged, show error to user
```

### Implementation Pattern

Example service function:
```typescript
// src/lib/fallback-read.ts
export async function readWithFallback(
  supabaseQuery: () => Promise<any>,
  firestoreQuery: () => Promise<any>,
  context: string
): Promise<any> {
  try {
    console.log(`[DUAL-READ] Attempting Supabase for: ${context}`);
    return await supabaseQuery();
  } catch (err) {
    console.warn(`[DUAL-READ] Supabase failed for ${context}, falling back to Firestore:`, err);
    try {
      return await firestoreQuery();
    } catch (firestoreErr) {
      console.error(`[DUAL-READ] Both Supabase and Firestore failed for ${context}:`, firestoreErr);
      throw firestoreErr;
    }
  }
}
```

Usage in components:
```typescript
// Before (Firestore only)
const { data } = await getDocs(query(collection(db, 'orders')));

// After (Dual-read)
const data = await readWithFallback(
  () => supabase.from('orders').select('*'),
  () => getDocs(query(collection(db, 'orders'))),
  'fetch-all-orders'
);
```

### Files to Update

Priority order for dual-read implementation:

**High Priority (Frequently Used)**
- [ ] `src/app/(dashboard)/admin/page.tsx` - Admin dashboard (main read source)
- [ ] `src/app/(dashboard)/admin/dispatch/page.tsx` - Dispatch view
- [ ] `src/app/(dashboard)/printer/page.tsx` - Printer queue
- [ ] `src/app/(dashboard)/customer/page.tsx` - Customer orders

**Medium Priority (Workflow Critical)**
- [ ] `src/services/db.ts` - Core database service
- [ ] `src/lib/workflow.ts` - Workflow state machine (reads)
- [ ] `src/lib/auth-context.tsx` - User profile reads

**Lower Priority (Infrequent Reads)**
- [ ] `src/lib/client-cart.ts` - Cart queries
- [ ] `src/lib/client-wishlist.ts` - Wishlist queries
- [ ] `src/components/acdema/GlobalOrdersPage.tsx` - Global panel

### Write Strategy (Keep Firestore for Now)

**Keep ALL writes going to Firestore** until dual-read is verified stable:

```typescript
// Write to BOTH (eventual consistency)
await Promise.all([
  firestore.doc(`orders/${id}`).update(updates),
  supabase.from('orders').update(updates).eq('id', id)
]);

// OR write to Firestore only (safest during transition)
await firestore.doc(`orders/${id}`).update(updates);
```

### Testing Strategy

1. **Unit Tests**: Test fallback logic
   ```bash
   # Create: src/lib/__tests__/fallback-read.test.ts
   ```

2. **Integration Tests**: Test with real Supabase/Firestore
   ```bash
   # Run with: npm test
   ```

3. **Manual Testing**: Use impersonation mode to test specific users
   - Change user role in Supabase `profiles` table
   - Verify app behavior with fallback

4. **Monitoring**: Log all fallback events
   ```typescript
   // Track: which queries fail, which fall back to Firestore
   // Use: Activity logs or structured logging
   ```

---

## PHASE 3: Selective Read Migration

**Status**: NOT STARTED

### Objective
Move read operations to Supabase exclusively once dual-read is stable.

### Implementation
1. Remove fallback for specific query paths
2. Update tests to only expect Supabase data
3. Monitor error rates for regressions
4. Gradually expand to all read paths

---

## PHASE 4: Write Migration

**Status**: NOT STARTED

### Objective
Move write operations from Firestore to Supabase exclusively.

### Approach
1. Implement dual-write (both Firestore + Supabase)
2. Verify consistency over 1 week
3. Remove Firestore writes
4. Verify no regressions

---

## PHASE 5: Decommission Firebase

**Status**: NOT STARTED

### Cleanup Tasks
- [ ] Remove Firebase imports from unused files
- [ ] Remove Firebase client initialization
- [ ] Remove Firestore security rules
- [ ] Backup Firestore data (for audit trail)
- [ ] Delete Firebase project (optional)

---

## Important Notes

### Data Integrity Considerations

1. **Nested Collections**: Order items are stored in Firestore subcollections (`orders/{id}/items`).
   - Flattened in Supabase as `order_items` table with `order_id` foreign key
   - Ensures relational integrity

2. **Firestore Timestamps**: Converted to ISO 8601 strings during migration
   - Example: `Timestamp(1704067200)` → `"2024-01-01T00:00:00.000Z"`

3. **Soft Deletes**: Supabase doesn't have Firestore-style document deletion
   - Use `is_deleted` boolean column where needed
   - Or enforce via Row Level Security (RLS) policies

### Rollback Plan

If migration fails at any phase:

1. **PHASE 1 Rollback**: Don't start PHASE 2 until confident
2. **PHASE 2 Rollback**: Keep Firestore as primary (revert to Firestore-only)
3. **PHASE 3+ Rollback**: Run data sync script in reverse

---

## Useful Commands

```bash
# Test Supabase connectivity
npm run supabase:test-connection

# Run data migration
npm run supabase:init-and-migrate

# Supabase CLI operations
supabase link --project-ref arffwmwpimdmhgmylpzi
supabase db list
supabase db diff
supabase db push
supabase status

# View Supabase logs
supabase logs --follow
```

---

## Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase Dashboard**: https://app.supabase.com
- **Migration Issues**: Check `.env.local` credentials and Supabase project settings
- **Data Sync Issues**: Check `scripts/init-and-migrate-supabase.ts` logs for failed collections

---

## Timeline Estimate

| Phase | Task | Effort | Timeline |
|-------|------|--------|----------|
| 1 | Schema + Data Migration | 1 hour | ✅ In Progress |
| 2 | Dual-Read Implementation | 2-3 days | Pending |
| 3 | Selective Read Migration | 1-2 days | Pending |
| 4 | Write Migration | 1-2 days | Pending |
| 5 | Decommission Firebase | 2-4 hours | Pending |
| **Total** | | **1-2 weeks** | |

---

**Last Updated**: 2024-01-01
**Maintained By**: Development Team
**Status**: PHASE 1 - Awaiting schema creation in Supabase
