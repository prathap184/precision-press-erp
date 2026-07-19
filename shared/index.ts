// ─── @hindustan/shared ────────────────────────────────────────────────────────
// DO NOT add barrel exports here.
// Import from specific subpaths for better tree-shaking and build performance.
//
// Usage:
//   import { UserProfile } from '@hindustan/shared/types/auth';
//   import { StaffRole }   from '@hindustan/shared/types/roles';
//   import { supabase }    from '@hindustan/shared/lib/supabase-browser';
//   import { calculateSqft } from '@hindustan/shared/lib/pricing-engine';
//   import { formatCurrency } from '@hindustan/shared/utils/formatters';
//   import { COMPANY_DETAILS } from '@hindustan/shared/lib/company-config';
//   import { INDIAN_STATES } from '@hindustan/shared/lib/constants';
//   import { logger } from '@hindustan/shared/logging/logger';
//
// Never do: import { ... } from '@hindustan/shared'
// Always use the subpath above for explicit, fast imports.
