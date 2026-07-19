import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMigrations() {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('*');

  if (error) {
    console.error('Error fetching migrations:', error.message);
  } else {
    console.log('Applied migrations in database:', data);
  }
}

checkMigrations().catch(console.error);
