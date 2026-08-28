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
//    basta espalhar guardProps no painel do modal para que qualquer digitação
//    em inputs/selects/textareas descendentes conte como edição.
//
// Em ambos, requestClose() é o que deve ser ligado ao X, ao "Cancelar" e ao
// clique fora. O onClose() cru continua sendo usado depois de salvar.
//
// A confirmação usa o ConfirmDialog do kit (na identidade) quando há
// ConfirmProvider (admin); sem provider (portal, apps) cai no window.confirm.
// Por isso confirmDiscard é assíncrono: if (!(await confirmDiscard())) return;
// Com o Dialog do kit, passe escape: false — a pilha de overlays já cuida do Esc.
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useConfirm } from "@/components/aura/ConfirmDialog";

const DEFAULT_MESSAGE = "Descartar alterações não salvas?";
const DISCARD_DESC = "O que você digitou será perdido.";

export function useDiscardGuard<T>(form: T | null, close: () => void): () => void {
  const snapshot = useRef<string>("");
  const confirm = useConfirm();

  // Captura o estado inicial no momento da abertura; limpa ao fechar.
  useEffect(() => {
    if (form && !snapshot.current) snapshot.current = JSON.stringify(form);
    if (!form) snapshot.current = "";
  }, [form]);

  const requestClose = useCallback(() => {
    const dirty = !!form && JSON.stringify(form) !== snapshot.current;
    if (!dirty) { close(); return; }
    void confirm({ title: DEFAULT_MESSAGE, description: DISCARD_DESC, confirmLabel: "Descartar", cancelLabel: "Continuar editando", tone: "danger" })
      .then(ok => { if (ok) close(); });
  }, [form, close, confirm]);

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
  /** Tratar Esc como pedido de fechar (com guarda). Default: true. Com o Dialog do kit use false. */
  escape?: boolean;
}

interface CloseGuard {
  /** Ligar no X, no "Cancelar" e no clique fora. */
  requestClose: () => void;
  /**
   * Para outros pontos que descartam edição sem fechar o modal (ex.: cancelar
   * o formulário interno de uma lista). Resolve true quando pode seguir.
   */
  confirmDiscard: () => Promise<boolean>;
  /** Espalhar no painel do modal: capta digitação de qualquer campo dentro. */
  guardProps: {
    onInput: () => void;
    onChange: () => void;
  };
  /** Marcar edição manualmente (uploads, toggles, carrinho…). */
  markDirty: () => void;
  /** Esquecer as edições — usar após salvar, se o modal continuar aberto. */
  reset: () => void;
  /**
   * Há edição não salva no momento. É função, e não booleano, de propósito:
   * a sujeira mora num ref e NÃO re-renderiza (ver comentário em markDirty).
   * Para pintar tela conforme edição, derive do seu próprio estado.
   */
  isDirty: () => boolean;
}

export function useCloseGuard(close: () => void, options: CloseGuardOptions = {}): CloseGuard {
  const { open = true, dirty: externalDirty = false, message = DEFAULT_MESSAGE, escape = true } = options;
  // A marca de "sujo" mora num ref e nunca vira estado. Um <select> dispara
  // `input` ANTES de `change`; se o `input` provocasse re-render, o React
  // reescreveria o value do select de volta para o antigo no commit e
  // descartaria o `change` seguinte (o campo "só pegava na segunda vez").
  const touched = useRef(false);
  // Lidos dentro dos callbacks para não prendê-los a um render antigo.
  const latest = useRef({ open, externalDirty });
  latest.current = { open, externalDirty };
  const confirm = useConfirm();

  // Cada abertura começa limpa.
  useEffect(() => {
    if (!open) touched.current = false;
  }, [open]);

  const markDirty = useCallback(() => { touched.current = true; }, []);
  const reset = useCallback(() => { touched.current = false; }, []);
  const isDirty = useCallback(() => {
    const { open: isOpen, externalDirty: outside } = latest.current;
    return isOpen && (touched.current || outside);
  }, []);

  const confirmDiscard = useCallback(async () => {
    if (isDirty()) {
      const ok = await confirm({ title: message, description: DISCARD_DESC, confirmLabel: "Descartar", cancelLabel: "Continuar editando", tone: "danger" });
      if (!ok) return false;
    }
    touched.current = false;
    return true;
  }, [isDirty, message, confirm]);

  const requestClose = useCallback(() => {
    void confirmDiscard().then(ok => { if (ok) close(); });
  }, [confirmDiscard, close]);

  useEffect(() => {
    if (!open || !escape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, escape, requestClose]);

  // Identidade estável: o painel do modal não troca de handler a cada render.
  const guardProps = useMemo(() => ({ onInput: markDirty, onChange: markDirty }), [markDirty]);

  return { requestClose, confirmDiscard, guardProps, markDirty, reset, isDirty };
}
