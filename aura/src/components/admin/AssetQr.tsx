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
// entra. A marca ocupa ~22% da largura, então sobra mais margem de erro do que
// havia antes SEM logo — a plaqueta fica mais tolerante a risco e sujeira, não
// menos. `excavate` limpa os módulos sob a arte para não confundir o leitor.
//
// A marca é desenhada aqui em preto e branco puro, em vez de usar
// public/logo_transp.PNG (o camaleão): a 26px o camaleão vira borrão, e os
// tons pastel dele somem contra o branco do QR e viram cinza na impressora
// monocromática. Centro de QR pede forma sólida e alto contraste.
"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

/** Quadrado preto com o "A" vazado — data URI para não depender de arquivo. */
const AURA_MARK =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="7" fill="#000000"/>' +
    '<path fill="#ffffff" fill-rule="evenodd" d="M16 5 L28.5 27.5 L3.5 27.5 Z M16 13.8 L10.8 22.2 L21.2 22.2 Z"/>' +
    "</svg>",
  );

/** Fração da largura do QR ocupada pela marca. Acima de ~0.25 a leitura sofre. */
const MARK_RATIO = 0.22;

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
  const mark = Math.round(size * MARK_RATIO);

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
          ? { src: AURA_MARK, height: mark, width: mark, excavate: true }
          : undefined
      }
    />
  );
}
