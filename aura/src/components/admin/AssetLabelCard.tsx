// src/components/admin/AssetLabelCard.tsx
// A etiqueta física do patrimônio: QR em destaque à esquerda, identidade da
// pousada à direita, rodapé discreto.
//
// REGRAS DE IMPRESSÃO (PrintReport injeta estas duas e elas mandam aqui):
//   • `#stk-report-root * { background: transparent !important }` → divisória
//     NUNCA pode ser um `bg-*`; usar borda, que a regra não alcança. A zona de
//     silêncio branca do QR também não pode vir de CSS — vem do bgColor do SVG
//     (ver AssetQr), senão a etiqueta sai preta sobre nada e falha na leitura.
//   • `#stk-report-root * { color: #000 !important }` → todo texto sai preto de
//     qualquer forma; `opacity` sobrevive e é o que dá a hierarquia do rodapé.
//
// O `publicCode` aparece no rodapé de propósito: se o QR for riscado ou sujar,
// ele é o único caminho de volta para a ficha — dá para digitar à mão.
"use client";

import React from "react";
import { AssetLabel } from "@/types/aura";
import AssetQr from "./AssetQr";

interface Props {
  label: AssetLabel;
  propertyName: string;
  logoUrl?: string;
  /** Lado do QR em px. */
  qrSize: number;
  /** Etiqueta pequena (3 colunas): encolhe tipografia e logo. */
  compact?: boolean;
}

export default function AssetLabelCard({ label, propertyName, logoUrl, qrSize, compact = false }: Props) {
  return (
    <div
      style={{ breakInside: "avoid" }}
      className="flex flex-col justify-between rounded-lg border border-black/50 p-2.5"
    >
      <div className="flex items-center gap-3">
        {/* QR em destaque — é o que a pessoa aponta a câmera. */}
        <div className="shrink-0">
          <AssetQr url={label.url} size={qrSize} />
        </div>

        {/* Identidade: PATRIMÔNIO · logo · nº · nome */}
        <div className="min-w-0 flex-1">
          <p className={`font-bold uppercase leading-none tracking-[0.28em] ${compact ? "text-[7px]" : "text-[9px]"}`}>
            Patrimônio
          </p>

          {logoUrl ? (
            // Logo quadrada (marca sem wordmark) encolhe demais a 24px — daí a
            // altura um pouco maior. `object-left` mantém o alinhamento da coluna.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={propertyName}
              className={`mt-1.5 object-contain object-left ${compact ? "h-5" : "h-7"}`}
            />
          ) : (
            <p className={`mt-1 font-bold leading-tight ${compact ? "text-[9px]" : "text-[11px]"}`}>
              {propertyName}
            </p>
          )}

          {/* Divisória por BORDA — um bg-* não sobrevive à impressão. */}
          <div className={`border-t border-black/30 ${compact ? "my-1" : "my-1.5"}`} />

          <p className={`font-mono font-bold leading-none ${compact ? "text-sm" : "text-lg"}`}>
            {label.assetTag || label.publicCode}
          </p>
          <p className={`mt-1 leading-snug ${compact ? "text-[8px]" : "text-[10px]"}`}>
            {label.name}
          </p>
        </div>
      </div>

      {/* Rodapé: código de resgate à esquerda, assinatura discreta à direita. */}
      <div className={`flex items-end justify-between gap-2 border-t border-black/20 ${compact ? "mt-1.5 pt-1" : "mt-2 pt-1.5"}`}>
        <span className={`font-mono tracking-[0.18em] opacity-70 ${compact ? "text-[6px]" : "text-[8px]"}`}>
          {label.publicCode}
        </span>
        <span className={`tracking-[0.08em] opacity-30 ${compact ? "text-[5px]" : "text-[6px]"}`}>
          Powered by Aura
        </span>
      </div>
    </div>
  );
}
