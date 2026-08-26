// src/lib/image-compress.ts
//
// Compressão de imagem NO NAVEGADOR, antes do upload.
//
// Por quê: o bucket `images` tinha 178 fotos somando 477 MB (média 2,7 MB, picos
// de 14 MB) — originais de câmera subidos sem tratamento e servidos crus em
// <img> para cada sessão. Storage = ~metade do egress do Supabase, que estourou
// o plano free em ago/2026. Redimensionar para o que a tela realmente usa
// derruba cada foto para ~200–500 KB sem perda visível.
//
// Regras:
//  • Redimensiona para caber em `maxDim` (lado maior) e reencoda em WebP.
//  • GIF (animação) e SVG passam intactos — reencodar destruiria o formato.
//  • Se o navegador não decodificar (ex.: HEIC antigo) ou o resultado sair
//    MAIOR que o original, devolve o arquivo original — comprimir é otimização,
//    nunca pode virar bloqueio de upload.
export interface CompressOptions {
  /** Lado maior máximo, em px (padrão 1920 — cobre tela cheia com folga). */
  maxDim?: number;
  /** Qualidade WebP 0–1 (padrão 0.82). */
  quality?: number;
}

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

function toWebpName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") + ".webp";
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1920;
  const quality = opts.quality ?? 0.82;

  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob || blob.size === 0) return file;

    // Sem escala e sem ganho de peso → manter o original.
    if (scale === 1 && blob.size >= file.size) return file;

    return new File([blob], toWebpName(file.name), { type: "image/webp" });
  } catch {
    return file;
  }
}
