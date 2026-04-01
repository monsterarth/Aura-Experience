import { createBrowserClient } from '@supabase/ssr'

// Singleton Variable: Armazena a instância global de navegador.
// Garante que só haverá UM timer de Auth Refresh na memória da janela.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

/**
 * Custom lock com timeout de 2s.
 * O lock padrão do Supabase usa navigator.locks sem timeout — no F5, pode
 * aguardar até 10s para o lock da aba anterior liberar. Isso bloqueia tanto
 * a inicialização (INITIAL_SESSION) quanto queries de dados (from().select()).
 * Após 2s, desistimos do lock e prosseguimos sem ele.
 */
async function fastLock<R>(
    name: string,
    _acquireTimeout: number,
    fn: () => Promise<R>
): Promise<R> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return fn()
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    try {
        return await navigator.locks.request(name, { signal: controller.signal }, () => {
            clearTimeout(timer)
            return fn()
        }) as R
    } catch {
        clearTimeout(timer)
        // Lock não disponível em 2s — prossegue sem ele
        return fn()
    }
}

export function createClientBrowser() {
    if (browserClient) return browserClient

    browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                lock: fastLock,
            },
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
