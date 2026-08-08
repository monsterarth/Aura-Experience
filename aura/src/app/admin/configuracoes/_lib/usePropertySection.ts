"use client";

// src/app/admin/configuracoes/_lib/usePropertySection.ts
//
// Rascunho local de uma seção de configuração.
//
// Cada seção edita um recorte da propriedade e salva SÓ as chaves que são dela —
// é o que faz o merge no banco valer alguma coisa: duas seções abertas ao mesmo
// tempo não se atropelam. O rascunho é re-semeado quando a propriedade muda
// (inclusive depois de salvar), então "sujo" volta a ser falso sozinho.
import { useCallback, useEffect, useRef, useState } from "react";
import { useProperty } from "@/context/PropertyContext";
import { PropertySettingsClient } from "@/lib/property-settings-client";
import { Property } from "@/types/aura";
import { toast } from "sonner";

export interface SectionState<T> {
  property: Property | null;
  draft: T | null;
  /** Valor salvo, para a seção mandar só o que mudou quando isso importa. */
  baseline: T | null;
  setDraft: React.Dispatch<React.SetStateAction<T | null>>;
  patch: (partial: Partial<T>) => void;
  dirty: boolean;
  saving: boolean;
  reset: () => void;
  /** Salva o recorte; `columns` para colunas reais (name, logoUrl, theme). */
  save: (
    build: (draft: T) => { patch?: Record<string, unknown>; columns?: Record<string, unknown> },
    opts?: { after?: (updated: Property) => Promise<void> | void },
  ) => Promise<void>;
}

export function usePropertySection<T>(pick: (p: Property) => T): SectionState<T> {
  const { currentProperty, setProperty } = useProperty();
  const pickRef = useRef(pick);
  pickRef.current = pick;

  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-semeia a cada propriedade nova E a cada save (setProperty troca a referência).
  useEffect(() => {
    setDraft(currentProperty ? pickRef.current(currentProperty) : null);
  }, [currentProperty]);

  const baseline = currentProperty ? pickRef.current(currentProperty) : null;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);

  const patch = useCallback((partial: Partial<T>) => {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }, []);

  const reset = useCallback(() => {
    setDraft(currentProperty ? pickRef.current(currentProperty) : null);
  }, [currentProperty]);

  const save: SectionState<T>["save"] = useCallback(async (build, opts) => {
    if (!currentProperty || !draft) return;
    setSaving(true);
    try {
      const { patch: p = {}, columns } = build(draft);
      const updated = await PropertySettingsClient.patch(currentProperty.id, p, columns);
      setProperty(updated);
      if (opts?.after) await opts.after(updated);
      toast.success("Configurações salvas.");
    } catch (e) {
      // A rota devolve não-2xx em erro: a falha silenciosa da escrita antiga acabou.
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [currentProperty, draft, setProperty]);

  return { property: currentProperty, draft, baseline, setDraft, patch, dirty, saving, reset, save };
}

/**
 * Só as chaves que mudaram. A rota valida cargo por CHAVE PRESENTE no patch, então
 * mandar um campo intocado que exige super_admin faria o save de um admin virar 403.
 */
export function changedOnly<T extends Record<string, unknown>>(draft: T, baseline: T | null, keys: (keyof T)[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (JSON.stringify(draft[k]) !== JSON.stringify(baseline?.[k])) out[k as string] = draft[k];
  }
  return out;
}
