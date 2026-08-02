// src/app/p/[code]/ReportForm.tsx
// Formulário público de relato de problema. O honeypot e o cronômetro são
// verificados no servidor (AssetPublicService) — aqui eles só são coletados.
"use client";

import React, { useState, useRef } from "react";
import { Loader2, Send, CheckCircle2, Camera, X } from "lucide-react";
import { reportAssetIssue } from "@/app/actions/asset-actions";

interface Props {
  code: string;
  assetName: string;
}

export default function ReportForm({ code, assetName }: Props) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [website, setWebsite] = useState("");        // honeypot
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const openedAt = useRef<number>(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  const start = () => { openedAt.current = Date.now(); setOpen(true); };

  // Upload sem sessão: o publicCode autoriza (ramo assetCode em /api/upload).
  // Caminho multipart simples — /api/upload/signed-url exige sessão.
  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Selecione uma imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("A imagem excede 5MB."); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("assetCode", code);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha ao enviar a foto.");
      const { url } = await res.json();
      setImageUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally { setUploading(false); }
  };

  const submit = async () => {
    setSending(true); setError("");
    const result = await reportAssetIssue(code, {
      description, reporterName, website, imageUrl,
      elapsedMs: Date.now() - openedAt.current,
    });
    setSending(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <CheckCircle2 className="mx-auto text-emerald-500" size={28} />
        <p className="mt-2 font-semibold text-[var(--fg)]">Relato enviado!</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A equipe de manutenção foi avisada. Obrigado por ajudar a cuidar da pousada.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={start}
        className="w-full rounded-2xl bg-[var(--brand)] px-5 py-4 text-base font-bold text-[var(--on-brand)] active:opacity-90"
      >
        Relatar um problema
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[var(--fg)]">Relatar um problema</h2>
          <p className="text-xs text-[var(--muted)]">{assetName}</p>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 text-[var(--muted)]"><X size={18} /></button>
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--muted)]">O que está acontecendo? *</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-[var(--fg)] outline-none focus:border-[var(--brand)]"
          rows={4}
          autoFocus
          maxLength={1000}
          placeholder="Ex.: o ar-condicionado está fazendo barulho alto e não gela"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-[var(--muted)]">Seu nome (opcional)</label>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-[var(--fg)] outline-none focus:border-[var(--brand)]"
          maxLength={80}
          value={reporterName}
          onChange={(e) => setReporterName(e.target.value)}
        />
      </div>

      {/* Honeypot: invisível para gente, irresistível para robô. */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={website} onChange={(e) => setWebsite(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />

      <div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
        {imageUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="foto do problema" className="h-16 w-16 rounded-xl object-cover" />
            <button onClick={() => setImageUrl("")} className="text-xs text-[var(--muted)] underline">remover foto</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--fg)] disabled:opacity-60"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            {uploading ? "Enviando…" : "Anexar foto"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={sending || description.trim().length < 15}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3.5 text-base font-bold text-[var(--on-brand)] disabled:opacity-50"
      >
        {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Enviar
      </button>
    </div>
  );
}
