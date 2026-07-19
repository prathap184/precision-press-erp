require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function list() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, roles');

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  console.log('All user profiles:');
  profiles.forEach(p => {
    console.log(`ID: ${p.id}, Email: ${p.email}, Name: ${p.name}, Role: ${p.role}, Roles: ${JSON.stringify(p.roles)}`);
  });
}

list().catch(console.error);
