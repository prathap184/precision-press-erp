const fs = require('fs');
const dotenv = require('dotenv');

// Parse .env.local
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'PRINTER');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log('Printer profiles:');
  profiles.forEach(p => {
    console.log(`- ID: ${p.id}, Email: ${p.email}, Name: ${p.name || p.displayName}, Role: ${p.role}, printerCategory: ${p.printerCategory}`);
  });
}

run().then(() => process.exit(0)).catch(console.error);
