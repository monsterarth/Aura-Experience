import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Missing Supabase environment variables. Check .env.local");
}

const globalForSupabase = globalThis as unknown as {
    supabase: SupabaseClient<any, "public", any> | undefined;
};

/**
 * Standard Supabase client using the Anon Key.
 * Subject to Row Level Security (RLS).
 */
export const supabase = globalForSupabase.supabase ?? createClient<any, "public", any>(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
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

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;

/**
 * Admin Supabase client using the Service Role Key.
 * Bypasses Row Level Security (RLS).
 * MUST ONLY BE USED ON THE SERVER/API ROUTES.
 */
export const supabaseAdmin = createClient<any, "public", any>(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);
