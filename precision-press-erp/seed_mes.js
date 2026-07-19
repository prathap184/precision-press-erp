require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Seeding departments...');
  
  const departments = [
    { name: 'Manager', display_order: 1, color: '#64748b', icon: 'ShieldCheck', sla_minutes: 120, active: true },
    { name: 'Designer', display_order: 2, color: '#8b5cf6', icon: 'Palette', sla_minutes: 240, active: true },
    { name: 'Printer', display_order: 3, color: '#3b82f6', icon: 'Printer', sla_minutes: 120, active: true },
    { name: 'Pasting', display_order: 4, color: '#f59e0b', icon: 'Layers', sla_minutes: 180, active: true },
    { name: 'Finishing', display_order: 5, color: '#10b981', icon: 'CheckSquare', sla_minutes: 120, active: true },
    { name: 'Dispatch', display_order: 6, color: '#f97316', icon: 'Truck', sla_minutes: 120, active: true },
    { name: 'Delivery', display_order: 7, color: '#ec4899', icon: 'MapPin', sla_minutes: 240, active: true },
    { name: 'Accountant', display_order: 8, color: '#06b6d4', icon: 'Calculator', sla_minutes: 120, active: true }
  ];

  for (const dept of departments) {
    const { data, error } = await supabase
      .from('workflow_departments')
      .upsert(dept, { onConflict: 'name' })
      .select('id')
      .single();
      
    if (error) {
      console.error(`Failed to insert ${dept.name}:`, error);
    } else {
      console.log(`Inserted/Updated ${dept.name} (ID: ${data.id})`);
      
      // If it's Printer, add the settings
      if (dept.name === 'Printer') {
        const settings = {
          department_id: data.id,
          max_queue: 40,
          capacity: '3 Operators',
          working_hours: '9-6',
          auto_assign: false,
          allowed_roles: ["Admin", "Printer", "Manager"],
          metadata: { machineId: "HP-Latex-02" }
        };
        const { error: settingsError } = await supabase
          .from('workflow_department_settings')
          .upsert(settings, { onConflict: 'department_id' });
          
        if (settingsError) {
          console.error(`Failed to insert settings for Printer:`, settingsError);
        } else {
          console.log(`Added default settings for Printer`);
        }
      }
    }
  }
  
  console.log('Seeding complete! Check your browser.');
}

run().catch(console.error);
