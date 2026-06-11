// src/components/admin/FileUpload.tsx
// Upload de documento (PDF ou imagem) via /api/upload. Diferente do ImageUpload,
// mostra link/ícone (não <img>) — serve para nota fiscal e documentos.
"use client";

import React, { useState, useRef } from "react";
import { Loader2, UploadCloud, FileText, ImageIcon, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

interface FileUploadProps {
  value?: string;
  onChange: (url: string) => void;   // passa "" para remover
  label?: string;
  maxSizeMb?: number;
}

export function FileUpload({ value, onChange, label = "Enviar PDF ou imagem", maxSizeMb = 5 }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPdf = !!value && value.toLowerCase().includes(".pdf");

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!okType) { toast.error("Envie um PDF ou uma imagem."); return; }
    if (file.size > maxSizeMb * 1024 * 1024) { toast.error(`Arquivo excede ${maxSizeMb}MB.`); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Falha no upload.");
      const { url } = await res.json();
      onChange(url);
      toast.success("Arquivo enviado.");
    } catch (err) { toast.error((err as Error).message); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div>
      <input type="file" ref={inputRef} onChange={handle} accept="application/pdf,image/*" className="hidden" />
      {value ? (
        <div className="flex items-center gap-2 bg-secondary/50 border border-border rounded-xl px-3 py-2">
          {isPdf ? <FileText size={16} className="text-red-400 shrink-0" /> : <ImageIcon size={16} className="text-blue-400 shrink-0" />}
          <a href={value} target="_blank" rel="noopener noreferrer"
            className="flex-1 min-w-0 truncate text-sm text-foreground hover:underline flex items-center gap-1">
            Ver documento <ExternalLink size={12} className="shrink-0" />
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-bold text-primary hover:underline">Trocar</button>
          <button type="button" onClick={() => onChange("")} className="p-1 text-muted-foreground hover:text-destructive"><X size={14} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 w-full justify-center px-3 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors text-sm font-semibold">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {label}
        </button>
      )}
    </div>
  );
}
