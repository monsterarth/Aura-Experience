// src/components/admin/AssetLabelCard.tsx
// A etiqueta física do patrimônio, em três colunas: QR · informações · logo.
//
// A logo ganhou coluna própria porque logo de pousada costuma ser QUADRADA —
// espremida dentro da coluna de texto ela nunca passava de uns 40px de altura.
// Isolada, ela ocupa ~62% do lado do QR e vira o segundo elemento da peça.
//
// "PATRIMÔNIO" fica empilhado COLADO no número (sem divisória entre os dois):
// na mesma linha não cabe depois da terceira coluna, e etiquetas com prefixo
// (PAT-0042) estourariam a largura. Empilhado e junto, lê como uma unidade.
//
// REGRAS DE IMPRESSÃO (PrintReport injeta estas duas e elas mandam aqui):
//   • `#stk-report-root * { background: transparent !important }` → divisória
//     NUNCA pode ser um `bg-*`; usar borda, que a regra não alcança. A zona de
//     silêncio branca do QR também não pode vir de CSS — vem do bgColor do SVG
//     (ver AssetQr), senão a etiqueta sai preta sobre nada e falha na leitura.
//   • `#stk-report-root * { color: #000 !important }` → todo texto sai preto de
//     qualquer forma; `opacity` sobrevive e é o que dá a hierarquia do rodapé.
"use client";

import React from "react";
import { AssetLabel } from "@/types/aura";
import AssetQr from "./AssetQr";

/**
 * Lado da logo como fração do lado do QR. Menor na etiqueta pequena: ela tem
 * ~224px de largura impressa (A4 menos margens, dividido por 3), e a terceira
 * coluna comeria a largura do nome do ativo.
 */
const LOGO_RATIO = { large: 0.62, compact: 0.5 };

interface Props {
  label: AssetLabel;
  propertyName: string;
  logoUrl?: string;
  /** Lado do QR em px. */
  qrSize: number;
  /** Etiqueta pequena (3 colunas na folha): encolhe a tipografia. */
  compact?: boolean;
}

export default function AssetLabelCard({ label, propertyName, logoUrl, qrSize, compact = false }: Props) {
  const logoSide = Math.round(qrSize * (compact ? LOGO_RATIO.compact : LOGO_RATIO.large));

  return (
    <div
      style={{ breakInside: "avoid" }}
      className="flex flex-col justify-between rounded-lg border border-black/50 p-2.5"
    >
      <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
        {/* 1 · QR — é o que a pessoa aponta a câmera. */}
        <div className="shrink-0">
          <AssetQr url={label.url} size={qrSize} withMark />
        </div>

        {/* 2 · Informações */}
        <div className="min-w-0 flex-1">
          <p className={`font-bold uppercase leading-none tracking-[0.16em] ${compact ? "text-[7px]" : "text-[9px]"}`}>
            Patrimônio
          </p>
          <p className={`font-mono font-bold leading-none ${compact ? "mt-0.5 text-base" : "mt-1 text-xl"}`}>
            {label.assetTag || label.publicCode}
          </p>
          <p className={`leading-snug ${compact ? "mt-1 text-[8px]" : "mt-1.5 text-[10px]"}`}>
            {label.name}
          </p>
          {!logoUrl && (
            <p className={`mt-1 font-bold leading-tight ${compact ? "text-[8px]" : "text-[10px]"}`}>
              {propertyName}
            </p>
          )}
        </div>

        {/* 3 · Logo da pousada, em coluna própria e quadrada. */}
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={propertyName}
            style={{ width: logoSide, height: logoSide }}
            className="shrink-0 object-contain"
          />
        )}
      </div>

      <div className={`flex justify-end border-t border-black/20 ${compact ? "mt-1.5 pt-1" : "mt-2 pt-1.5"}`}>
        <span className={`tracking-[0.08em] opacity-40 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          Powered by Aura
        </span>
      </div>
    </div>
  );
}
