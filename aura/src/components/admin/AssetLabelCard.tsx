// src/components/admin/AssetLabelCard.tsx
// A etiqueta física do patrimônio, em três colunas: QR · identificação · logo.
// Todo o desenho é dirigido por AssetLabelOptions — o painel fica em
// admin/patrimonio/etiquetas.
//
// A logo tem coluna própria porque logo de pousada costuma ser QUADRADA:
// espremida dentro da coluna de texto ela não passava de ~40px de altura.
//
// REGRAS DE IMPRESSÃO (PrintReport injeta estas duas e elas mandam aqui):
//   • `#stk-report-root * { background: transparent !important }` → divisória e
//     moldura são BORDA, nunca `bg-*`. A zona de silêncio branca do QR também
//     não pode vir de CSS: vem do bgColor do SVG (ver AssetQr), senão a etiqueta
//     sai preta sobre nada e falha na leitura.
//   • `#stk-report-root * { color: #000 !important }` → todo texto sai preto de
//     qualquer forma; `opacity` sobrevive e é o que dá a hierarquia do rodapé.
//     Nenhuma das duas alcança `<img>`, então a logo imprime colorida — e o
//     modo preto-e-branco é um `filter`, que também escapa das regras.
"use client";

import React from "react";
import { AssetLabel, AssetLabelOptions } from "@/types/aura";
import AssetQr from "./AssetQr";

/** Lado da logo como fração do lado do QR. Menor na pequena: ~224px de largura. */
const LOGO_RATIO = { large: 0.62, compact: 0.5 };
/** Quanto a logo completa (marca + nome) pode se esticar além do quadrado. */
const FULL_LOGO_MAX_ASPECT = 2.2;

interface Props {
  label: AssetLabel;
  options: AssetLabelOptions;
  propertyName: string;
  /** Logo simplificada (marca). */
  logoUrl?: string;
  /** Logo completa (marca + nome escrito). */
  logoFullUrl?: string;
  /** Lado do QR em px. */
  qrSize: number;
}

export default function AssetLabelCard({
  label, options, propertyName, logoUrl, logoFullUrl, qrSize,
}: Props) {
  const compact = options.size === "small";

  // 'full' cai para a simplificada se a completa não estiver cadastrada.
  const usingFull = options.logoVariant === "full" && !!logoFullUrl;
  const logo = usingFull ? logoFullUrl : logoUrl;
  const showLogo = options.showLogo && !!logo;

  const logoSide = Math.round(qrSize * (compact ? LOGO_RATIO.compact : LOGO_RATIO.large));
  // Logo completa é larga; a simplificada é quadrada.
  const logoBox = usingFull
    ? { height: logoSide, maxWidth: Math.round(logoSide * FULL_LOGO_MAX_ASPECT) }
    : { width: logoSide, height: logoSide };

  return (
    <div
      style={{ breakInside: "avoid" }}
      className="flex flex-col justify-between rounded-lg border border-black/50 p-2.5"
    >
      <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
        {/* 1 · QR — é o que a pessoa aponta a câmera. */}
        <div className="shrink-0">
          <AssetQr url={label.url} size={qrSize} withMark={options.auraMark} />
        </div>

        {/* 2 · Identificação */}
        <div className="min-w-0 flex-1">
          <div
            className={
              options.framed
                ? `rounded border border-black/45 ${compact ? "px-1.5 py-1" : "px-2 py-1.5"}`
                : ""
            }
          >
            <p className={`font-bold uppercase leading-none tracking-[0.16em] ${compact ? "text-[7px]" : "text-[9px]"}`}>
              Patrimônio
            </p>
            <p className={`font-mono font-bold leading-none ${compact ? "mt-0.5 text-base" : "mt-1 text-xl"}`}>
              {label.assetTag || label.publicCode}
            </p>
          </div>

          {options.showName && (
            <p className={`leading-snug ${compact ? "mt-1 text-[8px]" : "mt-1.5 text-[10px]"}`}>
              {label.name}
            </p>
          )}
          {/* Sem logo, a etiqueta ficaria sem dono — o nome entra no lugar dela. */}
          {!showLogo && (
            <p className={`font-bold leading-tight ${compact ? "mt-1 text-[8px]" : "mt-1.5 text-[10px]"}`}>
              {propertyName}
            </p>
          )}
        </div>

        {/* 3 · Logo da pousada, em coluna própria. */}
        {showLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={propertyName}
            style={{
              ...logoBox,
              filter: options.monochrome ? "grayscale(1) contrast(1.15)" : undefined,
            }}
            className="shrink-0 object-contain"
          />
        )}
      </div>

      {options.poweredBy && (
        <div className={`flex justify-end border-t border-black/20 ${compact ? "mt-1.5 pt-1" : "mt-2 pt-1.5"}`}>
          <span className={`tracking-[0.08em] opacity-40 ${compact ? "text-[8px]" : "text-[9px]"}`}>
            Powered by Aura
          </span>
        </div>
      )}
    </div>
  );
}
