// src/lib/use-discard-guard.ts
// Protege modais de formulário contra perda acidental de dados.
//
// Dois sabores, mesma ideia — nunca fechar em cima de edição não salva:
//
//  • useDiscardGuard(form, close)  — quando o modal guarda TODO o formulário em
//    um único estado. Compara o estado atual com o snapshot da abertura.
//
//  • useCloseGuard(close, opts)    — quando o estado está espalhado em vários
//    useState (a maioria dos modais). Marca "sujo" pela interação do usuário:
//    basta espalhar `guardProps` no painel do modal para que qualquer digitação
//    em inputs/selects/textareas descendentes conte como edição.
//
// Em ambos, requestClose() é o que deve ser ligado ao X, ao "Cancelar" e ao
// clique fora. O onClose() cru continua sendo usado depois de salvar.
import { useEffect, useRef, useCallback, useState } from "react";

const DEFAULT_MESSAGE = "Descartar alterações não salvas?";

export function useDiscardGuard<T>(form: T | null, close: () => void): () => void {
  const snapshot = useRef<string>("");

  // Captura o estado inicial no momento da abertura; limpa ao fechar.
  useEffect(() => {
    if (form && !snapshot.current) snapshot.current = JSON.stringify(form);
    if (!form) snapshot.current = "";
  }, [form]);

  const requestClose = useCallback(() => {
    const dirty = !!form && JSON.stringify(form) !== snapshot.current;
    if (!dirty || window.confirm(DEFAULT_MESSAGE)) close();
  }, [form, close]);

  // Esc fecha (com a mesma guarda) quando o modal está aberto.
  useEffect(() => {
    if (!form) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, requestClose]);

  return requestClose;
}

interface CloseGuardOptions {
  /** Modal aberto? Ao abrir de novo o guarda zera. Default: true. */
  open?: boolean;
  /**
   * Sujeira vinda de fora — para o que não passa por input nativo
   * (carrinho montado a botão, upload de foto, checklist de toggles).
   */
  dirty?: boolean;
  /** Texto do confirm. */
  message?: string;
  /** Tratar Esc como pedido de fechar (com guarda). Default: true. */
  escape?: boolean;
}

interface CloseGuard {
  /** Ligar no X, no "Cancelar" e no clique fora. */
  requestClose: () => void;
  /**
   * Para outros pontos que descartam edição sem fechar o modal (ex.: cancelar
   * o formulário interno de uma lista). Retorna true quando pode seguir.
   */
  confirmDiscard: () => boolean;
  /** Espalhar no painel do modal: capta digitação de qualquer campo dentro. */
  guardProps: {
    onInput: () => void;
    onChange: () => void;
  };
  /** Marcar edição manualmente (uploads, toggles, carrinho…). */
  markDirty: () => void;
  /** Esquecer as edições — usar após salvar, se o modal continuar aberto. */
  reset: () => void;
  /** Há edição não salva no momento. */
  isDirty: boolean;
}

export function useCloseGuard(close: () => void, options: CloseGuardOptions = {}): CloseGuard {
  const { open = true, dirty: externalDirty = false, message = DEFAULT_MESSAGE, escape = true } = options;
  const [touched, setTouched] = useState(false);
  const isDirty = open && (touched || externalDirty);

  // Cada abertura começa limpa.
  useEffect(() => {
    if (!open) setTouched(false);
  }, [open]);

  const markDirty = useCallback(() => setTouched(true), []);
  const reset = useCallback(() => setTouched(false), []);

  const confirmDiscard = useCallback(() => {
    if (isDirty && !window.confirm(message)) return false;
    setTouched(false);
    return true;
  }, [isDirty, message]);

  const requestClose = useCallback(() => {
    if (confirmDiscard()) close();
  }, [confirmDiscard, close]);

  useEffect(() => {
    if (!open || !escape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, escape, requestClose]);

  return {
    requestClose,
    confirmDiscard,
    guardProps: { onInput: markDirty, onChange: markDirty },
    markDirty,
    reset,
    isDirty,
  };
}
