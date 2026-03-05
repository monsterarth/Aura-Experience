import { createBrowserClient } from '@supabase/ssr'

// Singleton Variable: Armazena a instância global de navegador.
// Garante que só haverá UM timer de Auth Refresh na memória da janela.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClientBrowser() {
    if (browserClient) return browserClient

    browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                fetch: (...args) => {
                    const options = args[1] || {};
                    options.cache = 'no-store'; // Bypass Next.js cache para Auth Seguro
                    return fetch(args[0], options);
                }
            }
        }
    )

    return browserClient
}
