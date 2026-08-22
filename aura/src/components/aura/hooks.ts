"use client";

// Hooks do kit. `useMediaQuery` é SSR-safe (useSyncExternalStore): no servidor e
// na hidratação devolve `serverDefault`; use `useViewport().ready` quando o
// layout depender do viewport (DataList mostra skeleton até saber).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { T_HEX, type ThemeName } from "@/lib/admin-tokens";

export { useReducedMotion } from "motion/react";

const noop = () => {};

export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return noop;
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverDefault, [serverDefault]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** true depois da primeira pintura no cliente. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export type Breakpoint = "mobile" | "tablet" | "desktop";

export function useViewport(): { ready: boolean; isMobile: boolean; isTablet: boolean; isDesktop: boolean; breakpoint: Breakpoint } {
  const ready = useMounted();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const breakpoint: Breakpoint = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";
  return { ready, isMobile, isTablet, isDesktop: !isMobile && !isTablet, breakpoint };
}

/** < 768px (abaixo do `md`). false no SSR/hidratação. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** Dedo, não mouse. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/**
 * Evita flash de skeleton: só mostra se `active` durar mais que `delay`, e uma
 * vez mostrado fica pelo menos `min` ms (não pisca em loads de 150ms).
 */
export function useDelayedFlag(active: boolean, { delay = 120, min = 300 }: { delay?: number; min?: number } = {}): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (active) {
      if (!shown) t = setTimeout(() => { shownAt.current = Date.now(); setShown(true); }, delay);
    } else if (shown) {
      const elapsed = Date.now() - (shownAt.current ?? 0);
      t = setTimeout(() => { shownAt.current = null; setShown(false); }, Math.max(0, min - elapsed));
    }
    return () => { if (t) clearTimeout(t); };
  }, [active, shown, delay, min]);
  return shown;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Prende o Tab dentro de `ref` enquanto `active`; foca `initialFocus` (ou o
 * próprio painel — sem abrir teclado por surpresa) e devolve o foco ao fechar.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, initialFocus?: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement);
    const raf = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? el;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active, initialFocus]);
}

/** Aba sincronizada com `?key=` na URL (replace, sem scroll). */
export function useTabParam<T extends string>(key: string, fallback: T, valid?: readonly T[]): [T, (v: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get(key);
  const value = (raw && (!valid || (valid as readonly string[]).includes(raw)) ? raw : fallback) as T;
  const set = useCallback((v: T) => {
    const p = new URLSearchParams(sp.toString());
    if (v === fallback) p.delete(key); else p.set(key, v);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [router, pathname, sp, key, fallback]);
  return [value, set];
}

function getAdminRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".aura-admin-root");
}

/** "dark" | "light" — lê o data-theme do shell e reage à troca. */
export function useThemeName(): ThemeName {
  const subscribe = useCallback((cb: () => void) => {
    const root = getAdminRoot();
    if (!root) return noop;
    const mo = new MutationObserver(cb);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  const get = () => (getAdminRoot()?.getAttribute("data-theme") === "light" ? "light" : "dark");
  return useSyncExternalStore(subscribe, get, () => "dark");
}

/** Hex cru do tema atual — só para SVG/canvas/recharts (em DOM use `T.*`). */
export function useThemeHex() {
  const name = useThemeName();
  return T_HEX[name];
}

/** Teclado virtual aberto (viewport visual encolheu > 25%). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const check = () => setOpen(vv.height < window.innerHeight * 0.75);
    check();
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);
  return open;
}
