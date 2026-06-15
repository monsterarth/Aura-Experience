// src/lib/use-discard-guard.ts
// Protege modais de formulário contra perda acidental de dados.
// Tira um "snapshot" do form ao abrir; requestClose() só fecha direto se nada
// mudou — havendo edição não salva, pede confirmação "Descartar alterações?".
// Também trata a tecla Esc com a mesma guarda.
import { useEffect, useRef, useCallback } from "react";

export function useDiscardGuard<T>(form: T | null, close: () => void): () => void {
  const snapshot = useRef<string>("");

  // Captura o estado inicial no momento da abertura; limpa ao fechar.
  useEffect(() => {
    if (form && !snapshot.current) snapshot.current = JSON.stringify(form);
    if (!form) snapshot.current = "";
  }, [form]);

  const requestClose = useCallback(() => {
    const dirty = !!form && JSON.stringify(form) !== snapshot.current;
    if (!dirty || window.confirm("Descartar alterações não salvas?")) close();
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
