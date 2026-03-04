import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createClientBrowser } from './supabase-browser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Missing Supabase environment variables. Check .env.local");
}

const globalForSupabase = globalThis as unknown as {
    supabaseAdmin: SupabaseClient<any, "public", any> | undefined;
};

/**
 * Standard Browser Supabase Client using the Anon Key.
 * Replaces the old legacy static singleton.
 * Uses @supabase/ssr to manage cookies correctly.
 */
export const supabase = createClientBrowser();

/**
 * Admin Supabase client using the Service Role Key.
 * Bypasses Row Level Security (RLS).
 * MUST ONLY BE USED ON THE SERVER/API ROUTES.
 */
export const supabaseAdmin = globalForSupabase.supabaseAdmin ?? createClient<any, "public", any>(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey,
    {
        auth: {
            // Desabilita persistência e renovação de token no servidor (previne Memory Leak e Deadlocks no Next.js)
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: {
            fetch: (...args) => {
                const options = args[1] || {};
                options.cache = 'no-store';
                return fetch(args[0], options);
            }
        }
    }
);

if (process.env.NODE_ENV !== 'production') {
    globalForSupabase.supabaseAdmin = supabaseAdmin;
}
