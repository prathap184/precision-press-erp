const fs = require('fs');
const path = 'src/app/(dashboard)/admin/treasury/create/page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/import \{ supabaseBrowser \} from '@\/lib\/supabase-browser';/g, "import { supabase } from '@/lib/supabase';");
code = code.replace(/supabaseBrowser/g, 'supabase');

fs.writeFileSync(path, code);
console.log('Fixed supabase import');
