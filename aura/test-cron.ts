import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1); // Margem de segurança
    const timeLimit = now.toISOString();
    console.log("Time limit:", timeLimit);

    const { data, error } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('status', 'pending');

    console.log("Pending messages:", data);

    const { data: snapshot, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduledFor', timeLimit)
        .limit(15);

    console.log("Matched messages for CRON:", snapshot?.length);
    if (snapshot?.length > 0) {
        console.log("Sample:", snapshot[0]);
    }
}

main().catch(console.error);
