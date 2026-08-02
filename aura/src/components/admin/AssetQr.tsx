// src/components/admin/AssetQr.tsx
// QR da plaqueta de patrimônio, opcionalmente com a marca da Aura no centro.
//
// CUIDADO COM A IMPRESSÃO: PrintReport força `#stk-report-root * { background:
// transparent !important }`. A zona de silêncio branca do QR TEM que vir do
// próprio SVG (bgColor), nunca de um background CSS no wrapper — senão a
// etiqueta sai preta sobre nada e falha na leitura. `fgColor` sobrevive porque
// o QRCodeSVG pinta com `fill`, que a regra de `color` não alcança.
//
// SOBRE A MARCA NO CENTRO: cobrir módulos só é seguro porque o nível de
// correção de erro sobe de M (~15% de recuperação) para H (~30%) quando o logo
// entra. A marca ocupa ~24% da largura, então sobra mais margem de erro do que
// havia antes SEM logo — a plaqueta fica mais tolerante a risco e sujeira, não
// menos. `excavate` limpa os módulos sob a arte, deixando branco onde o PNG é
// transparente: o resultado é o camaleão preto sobre branco, alto contraste.
"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * Camaleão da Aura em preto sobre fundo transparente — a silhueta sólida é
 * justamente o que um centro de QR pede. Serve de public/, mesma origem.
 */
const AURA_MARK = "/logo_flat.png";

/** Fração da largura do QR ocupada pela marca. Acima de ~0.25 a leitura sofre. */
const MARK_RATIO = 0.24;
/** Proporção da arte (2248 × 1888) — sem isto o camaleão sai achatado. */
const MARK_ASPECT = 1888 / 2248;

interface Props {
  /** URL completa da plaqueta (ex.: https://aura.fazendadorosa.com.br/p/K7M4XQ2R). */
  url: string;
  size?: number;
  className?: string;
  /** Marca da Aura no centro. Sobe a correção de erro para H automaticamente. */
  withMark?: boolean;
}

export default function AssetQr({ url, size = 96, className, withMark = false }: Props) {
  if (!url) return null;
  const markW = Math.round(size * MARK_RATIO);
  const markH = Math.round(markW * MARK_ASPECT);

  return (
    <QRCodeSVG
      value={url}
      size={size}
      level={withMark ? "H" : "M"}
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#000000"
      className={className}
      imageSettings={
        withMark
          ? { src: AURA_MARK, height: markH, width: markW, excavate: true }
          : undefined
      }
    />
  );
}
