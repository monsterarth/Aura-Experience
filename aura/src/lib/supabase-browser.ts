import { createBrowserClient } from '@supabase/ssr'

// Singleton Variable: Armazena a instância global de navegador.
// Garante que só haverá UM timer de Auth Refresh na memória da janela.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

/**
 * Lock com timeout de 3s + steal para recuperação.
 *
 * O @supabase/auth-js usa navigator.locks sem timeout por padrão.
 * No F5, o lock da aba anterior pode ficar retido por até 10s, bloqueando
 * INITIAL_SESSION e todas as queries (que internamente chamam getSession()).
 *
 * Esta implementação segue o mesmo padrão do @supabase/auth-js ≥2.98:
 * após 3s sem adquirir o lock, usa { steal: true } para forçar a aquisição,
 * preemptando o holder anterior. O holder anterior continua executando até
 * terminar, mas perde exclusividade — comportamento seguro para o nosso caso
 * (a aba anterior está sendo destruída pelo F5 de qualquer forma).
 */
async function lockWithStealRecovery<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return fn()
    }

    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), 3000)

    try {
        return await navigator.locks.request(
            name,
            { mode: 'exclusive', signal: abortController.signal },
            async () => { clearTimeout(timer); return fn() }
        ) as R
    } catch (e: any) {
        clearTimeout(timer)
        if (e?.name === 'AbortError') {
            // Timeout expirou — rouba o lock da aba anterior (F5 race condition)
            return await navigator.locks.request(
                name,
                { mode: 'exclusive', steal: true },
                () => fn()
            ) as R
        }
        throw e
    }
}

export function createClientBrowser() {
    if (browserClient) return browserClient

    browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                lock: lockWithStealRecovery,
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

    // Pre-aquece o cache de sessão assim que o singleton é criado.
    // No F5, o lock da aba anterior pode bloquear getSession() por até 3s.
    // Iniciando uma chamada aqui, o lock é resolvido (ou roubado) antes que
    // qualquer página monte e dispare queries paralelas — que do contrário
    // competiriam pelo mesmo lock ao mesmo tempo.
    browserClient.auth.getSession().catch(() => {})

    return browserClient
}
