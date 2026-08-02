// src/components/admin/AssetQr.tsx
// QR da plaqueta de patrimônio.
//
// CUIDADO COM A IMPRESSÃO: PrintReport força `#stk-report-root * { background:
// transparent !important }`. A zona de silêncio branca do QR TEM que vir do
// próprio SVG (bgColor), nunca de um background CSS no wrapper — senão a etiqueta
// sai preta sobre nada e a leitura falha. `fgColor` sobrevive porque o QRCodeSVG
// pinta com `fill`, que a regra de `color` não alcança.
"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  /** URL completa da plaqueta (ex.: https://aaura.app.br/p/K7M4XQ2R). */
  url: string;
  size?: number;
  className?: string;
}

export default function AssetQr({ url, size = 96, className }: Props) {
  if (!url) return null;
  return (
    <QRCodeSVG
      value={url}
      size={size}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#000000"
      className={className}
    />
  );
}
