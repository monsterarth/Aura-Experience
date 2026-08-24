"use client";

// src/components/admin/EnvBadge.tsx
//
// Aviso de ambiente. Como o DEV é um espelho de produção — os mesmos hóspedes, as mesmas
// estadias, os mesmos nomes —, as duas telas são indistinguíveis a olho nu. Sem um sinal
// explícito, é questão de tempo até alguém alterar uma reserva de verdade achando que
// está testando (ou o contrário: testar e achar que salvou).
//
// Em produção não renderiza nada: aviso que aparece sempre vira decoração e para de ser
// lido. Ele só existe quando há algo a avisar.

import React from "react";
import { FlaskConical } from "lucide-react";
import { Pill } from "@/components/aura/Pill";
import { T } from "@/lib/admin-tokens";
import { environmentName } from "@/lib/safe-mode";

export type EnvBadgeVariant =
  /** Etiqueta ao lado do nome da propriedade. */
  | "pill"
  /** Só as três letras, para a sidebar recolhida. */
  | "compact"
  /** Bloco do rodapé, com a explicação do que muda neste ambiente. */
  | "footer";

export function EnvBadge({ variant = "pill" }: { variant?: EnvBadgeVariant }) {
  if (environmentName() === "producao") return null;

  if (variant === "compact") {
    return (
      <span
        title="Ambiente DEV — banco espelho de produção"
        style={{
          fontSize: 9, fontWeight: 900, letterSpacing: ".08em",
          color: T.amber, background: T.amberBg,
          border: `1px solid ${T.amberBorder}`,
          borderRadius: 999, padding: "1px 5px", lineHeight: 1.5,
        }}
      >
        DEV
      </span>
    );
  }

  if (variant === "footer") {
    return (
      <div
        role="status"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 10,
          background: T.amberBg, border: `1px solid ${T.amberBorder}`,
        }}
      >
        <FlaskConical size={15} color={T.amber} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".06em", color: T.amber }}>
            AMBIENTE DEV
          </div>
          <div style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.35 }}>
            Cópia de produção. Envios viram log.
          </div>
        </div>
      </div>
    );
  }

  return <Pill tone="amber" icon={FlaskConical} label="DEV" title="Ambiente DEV — banco espelho de produção" />;
}
