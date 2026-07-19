const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://arffwmwpimdmhgmylpzi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyZmZ3bXdwaW1kbWhnbXlscHppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDE0MjY0NywiZXhwIjoyMDk1NzE4NjQ3fQ.IH_qMkLpAMz-elc9nZSaUPH4G-7tWieWpRg_tnrBrT8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Adding columns to payments table...");
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata jsonb not null default '{}'::jsonb;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS itemBreakdown jsonb;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS baseOrderId text;
    `
  });
  
  if (error) {
    console.log("RPC exec_sql failed. Trying REST API directly or maybe it's not supported.");
    console.log(error);
  } else {
    console.log("Success!");
  }
}

run();
