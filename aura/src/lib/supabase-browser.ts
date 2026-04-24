import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | undefined
let iframeClient: ReturnType<typeof createBrowserClient> | undefined

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
            return await navigator.locks.request(
                name,
                { mode: 'exclusive', steal: true },
                () => fn()
            ) as R
        }
        throw e
    }
}

function isInIframe(): boolean {
    if (typeof window === 'undefined') return false
    try { return window.self !== window.top } catch { return true }
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
                    options.cache = 'no-store';
                    return fetch(args[0], options);
                }
            }
        }
    )

    browserClient.auth.getSession().catch(() => {})

    return browserClient
}

/**
 * Cliente sem lock para uso dentro de iframes do mesmo domínio.
 *
 * Iframes no mesmo domínio compartilham o namespace de navigator.locks com a
 * janela pai. Se o iframe criasse um cliente com lockWithStealRecovery, após
 * 3s ele roubaria o lock do admin — abortando todas as requisições Supabase
 * em curso na janela principal. Sem lock, o iframe lê a sessão dos cookies
 * normalmente (via /api/admin/auth/me) sem competir pelo lock de refresh.
 */
export function createClientBrowserIframe() {
    if (iframeClient) return iframeClient

    iframeClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                lock: async (_name, _timeout, fn) => fn(),
            },
            global: {
                fetch: (...args) => {
                    const options = args[1] || {};
                    options.cache = 'no-store';
                    return fetch(args[0], options);
                }
            }
        }
    )

    return iframeClient
}

export function createClientBrowserAuto() {
    return isInIframe() ? createClientBrowserIframe() : createClientBrowser()
}
