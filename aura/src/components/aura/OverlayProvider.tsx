"use client";

// Camada de overlays do admin: raiz do portal (#aura-overlay-root), pilha de
// overlays (o do topo é dono do Esc), scroll-lock do container do shell
// (`data-overlay-open` na raiz) e `inert` no app enquanto há overlay aberto.
// Fica DENTRO de `.aura-admin-root` para os portais herdarem os tokens de tema.
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

interface Entry {
  id: string;
  getOnClose: () => (() => void) | undefined;
  getCloseOnEscape: () => boolean;
}

interface OverlayCtx {
  register: (entry: Entry) => void;
  unregister: (id: string) => void;
  stack: string[];
  root: HTMLElement | null;
}

const Ctx = createContext<OverlayCtx | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const rootRef = useCallback((el: HTMLDivElement | null) => setRoot(el), []);

  const register = useCallback((entry: Entry) => {
    setEntries(prev => (prev.some(e => e.id === entry.id) ? prev : [...prev, entry]));
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  // Esc fecha só o overlay do topo.
  useEffect(() => {
    if (entries.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = entries[entries.length - 1];
      if (!top.getCloseOnEscape()) return;
      const close = top.getOnClose();
      if (close) { e.stopPropagation(); e.preventDefault(); close(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [entries]);

  // Scroll-lock + inert enquanto houver overlay.
  useEffect(() => {
    const appRoot = root?.closest<HTMLElement>(".aura-admin-root") ?? null;
    if (!appRoot) return;
    const open = entries.length > 0;
    if (open) appRoot.setAttribute("data-overlay-open", "true");
    else appRoot.removeAttribute("data-overlay-open");
    const targets = appRoot.querySelectorAll<HTMLElement>("[data-inert-when-overlay]");
    targets.forEach(t => { (t as HTMLElement & { inert: boolean }).inert = open; });
    return () => {
      appRoot.removeAttribute("data-overlay-open");
      targets.forEach(t => { (t as HTMLElement & { inert: boolean }).inert = false; });
    };
  }, [entries, root]);

  const stack = useMemo(() => entries.map(e => e.id), [entries]);
  const value = useMemo<OverlayCtx>(() => ({ register, unregister, stack, root }), [register, unregister, stack, root]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="aura-overlay-root" ref={rootRef} />
    </Ctx.Provider>
  );
}

/** Elemento onde os Dialogs fazem portal (null fora do admin / antes de montar). */
export function useOverlayRoot(): HTMLElement | null {
  return useContext(Ctx)?.root ?? null;
}

export function useHasOverlayProvider(): boolean {
  return useContext(Ctx) !== null;
}

/**
 * Registra um overlay na pilha enquanto `open`. Devolve se ele é o do topo.
 * Use em qualquer overlay que não seja o `Dialog` (drawer da sidebar, por ex.).
 */
export function useOverlay({ open, onClose, closeOnEscape = true }: { open: boolean; onClose?: () => void; closeOnEscape?: boolean }): { id: string; isTop: boolean } {
  const id = useId();
  const ctx = useContext(Ctx);
  const onCloseRef = useRef(onClose);
  const escRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  escRef.current = closeOnEscape;

  useEffect(() => {
    if (!open || !ctx) return;
    ctx.register({ id, getOnClose: () => onCloseRef.current, getCloseOnEscape: () => escRef.current });
    return () => ctx.unregister(id);
    // ctx.register/unregister são estáveis; só re-registra quando abre/fecha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, ctx?.register, ctx?.unregister]);

  const isTop = !!ctx && ctx.stack.length > 0 && ctx.stack[ctx.stack.length - 1] === id;
  return { id, isTop };
}
