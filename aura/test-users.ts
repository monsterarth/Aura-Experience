import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
    try {
        const { data: users, error: ue } = await supabase.from('users').select('*');
        console.log('USERS:', users, 'ERR:', ue);
    } catch (e) { console.error('UE', e) }
    try {
        const { data: staff, error: se } = await supabase.from('staff').select('*');
        console.log('STAFF:', staff, 'ERR', se);
    } catch (e) { console.error('SE', e) }
}
main();
