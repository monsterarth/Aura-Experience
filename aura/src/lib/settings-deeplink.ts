"use client";

// src/lib/settings-deeplink.ts
//
// Links profundos para configuração.
//
// Metade das configurações do sistema mora atrás de um botão que abre modal
// (regras de governança, regras de manutenção, prazos de casamento). Mandar a
// pessoa para a tela e deixá-la caçar o botão não resolve nada — o link precisa
// abrir o modal. Estes hooks são o contrato: `?config=<chave>` abre, `?tab=<id>`
// seleciona a aba.
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Abre o que `?config=` pedir. Roda uma vez por valor do parâmetro — se a pessoa
 * fechar o modal, ele não reabre sozinho.
 */
export function useConfigDeepLink(handlers: Record<string, () => void>) {
  const param = useSearchParams().get("config");
  const ref = useRef(handlers);
  ref.current = handlers;
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (!param || fired.current === param) return;
    const fn = ref.current[param];
    if (!fn) return;
    fired.current = param;
    fn();
  }, [param]);
}

/** Aba inicial vinda de `?tab=`, validada contra a lista de abas reais. */
export function useTabParam<T extends string>(valid: readonly T[], fallback: T): T {
  const param = useSearchParams().get("tab") as T | null;
  return param && valid.includes(param) ? param : fallback;
}
