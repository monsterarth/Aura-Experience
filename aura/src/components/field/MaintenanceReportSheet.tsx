"use client";

// Sheet "Reportar manutenção" — usado pelos apps de campo (camareira, garçom, houseman)
// e pela recepção. Qualquer colaborador abre uma demanda com foto; ela cai no pool do
// /maintenance-ops. Autossuficiente: carrega cabanas/estruturas pelas rotas de campo e
// cria via POST /api/field/maintenance-tasks (action 'create') — nunca pelo client do
// browser (lock frio). O ator e a propriedade vêm da sessão no servidor.

import React, { useEffect, useRef, useState } from "react";
import { postFieldAction } from "@/lib/field-api";
import { I, T } from "@/components/maid/MinibarSheet";

type Option = { id: string; name: string };
type Priority = "low" | "medium" | "high" | "urgent";
type LocType = "cabin" | "structure" | "custom";

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "low",    label: "Baixa",   color: T.muted },
  { value: "medium", label: "Média",   color: T.blue },
  { value: "high",   label: "Alta",    color: T.amber },
  { value: "urgent", label: "Urgente", color: T.red },
];

const fetchOptions = async (route: string): Promise<Option[]> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(route, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: string; name?: string; number?: string }[];
    return rows.map(r => ({ id: r.id, name: r.name || r.number || r.id }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

const compressImage = (file: File, maxPx = 1280, quality = 0.82): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("compress_failed"))), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = url;
  });

/** Botão + sheet autocontidos — integração de uma linha nos apps de campo e na recepção. */
export function MaintenanceReportButton({ variant = "field" }: { variant?: "field" | "admin" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "admin" ? (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-2"
        >
          🔧 Reportar Manutenção
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%", padding: 15, marginBottom: 12,
            background: T.amberBg, color: T.amber,
            fontFamily: "inherit", fontSize: 14, fontWeight: 700,
            letterSpacing: "0.02em", textTransform: "uppercase" as const,
            border: `1px solid ${T.amberBorder}`, borderRadius: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          🔧 Reportar Manutenção
        </button>
      )}
      {open && <MaintenanceReportSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function MaintenanceReportSheet({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [locType, setLocType] = useState<LocType>("custom");
  const [cabinId, setCabinId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cabins, setCabins] = useState<Option[]>([]);
  const [structures, setStructures] = useState<Option[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOptions("/api/field/cabins").then(setCabins);
    fetchOptions("/api/field/structures").then(setStructures);
  }, []);

  const canSubmit =
    title.trim().length > 0 &&
    (locType === "cabin" ? !!cabinId : locType === "structure" ? !!structureId : customLocation.trim().length > 0);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", new File([compressed], "maintenance-report.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const { url } = await res.json();
      setPhotoUrl(url);
    } catch {
      setError("Erro ao enviar a foto. Tente de novo (o chamado pode ser aberto sem foto).");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const r = await postFieldAction("/api/field/maintenance-tasks", {
      action: "create",
      task: {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        cabinId: locType === "cabin" ? cabinId : undefined,
        structureId: locType === "structure" ? structureId : undefined,
        customLocation: locType === "custom" ? customLocation.trim() : undefined,
        status: "pending",
        assignedTo: [],
        checklist: [],
        isRecurring: false,
        // Mesmo formato do report do hóspede (issue-actions): a foto de abertura vive em
        // imageUrl; completion.photoUrl é onde as telas atuais a exibem.
        imageUrl: photoUrl || undefined,
        completion: photoUrl ? { resolved: false, needsCleaning: false, photoUrl } : undefined,
      },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Não foi possível abrir o chamado. Tente novamente.");
      return;
    }
    setSent(true);
  };

  const label = (txt: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>{txt}</div>
  );
  const inputStyle: React.CSSProperties = {
    width: "100%", background: T.glass2, border: `1px solid ${T.border}`,
    borderRadius: 12, padding: "11px 14px", color: T.text, fontSize: 13,
    fontFamily: "inherit", outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0d1020", border: `1px solid ${T.border2}`, borderBottom: "none",
        borderRadius: "28px 28px 0 0", maxHeight: "92dvh", display: "flex", flexDirection: "column",
        color: T.text, fontFamily: "inherit", margin: "0 auto", width: "100%", maxWidth: 560,
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />

        {sent ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.greenBg, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <I n="check" s={24} c={T.green} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Chamado aberto!</div>
            <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>A equipe de manutenção foi notificada.</div>
            <button onClick={onClose} style={{ marginTop: 8, padding: "12px 32px", background: T.greenG, color: "#021a17", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800 }}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: "8px 20px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>Reportar Manutenção</span>
              <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
                <I n="x" s={16} />
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "12px 20px 0" }}>
              {label("Problema *")}
              <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
                placeholder="Ex: Torneira vazando, lâmpada queimada..."
                style={{ ...inputStyle, marginBottom: 14, borderColor: title ? T.border2 : T.border }} />

              {label("Local *")}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {([["cabin", "Cabana"], ["structure", "Estrutura"], ["custom", "Outro"]] as [LocType, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => setLocType(v)} style={{
                    flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
                    background: locType === v ? T.gradSoft : T.glass,
                    border: `1.5px solid ${locType === v ? "rgba(155,109,255,0.4)" : T.border}`,
                    color: locType === v ? T.g1 : T.muted,
                  }}>{l}</button>
                ))}
              </div>
              {locType === "cabin" && (
                <select value={cabinId} onChange={e => setCabinId(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
                  <option value="">Selecione a cabana...</option>
                  {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {locType === "structure" && (
                <select value={structureId} onChange={e => setStructureId(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
                  <option value="">Selecione a estrutura...</option>
                  {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {locType === "custom" && (
                <input value={customLocation} onChange={e => setCustomLocation(e.target.value)}
                  placeholder="Ex: Recepção, estacionamento, trilha..."
                  style={{ ...inputStyle, marginBottom: 14 }} />
              )}

              {label("Detalhes (opcional)")}
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Descreva o que observou..."
                style={{ ...inputStyle, resize: "none", marginBottom: 14 }} />

              {label("Prioridade")}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {PRIORITIES.map(p => (
                  <button key={p.value} onClick={() => setPriority(p.value)} style={{
                    flex: 1, padding: "9px 4px", borderRadius: 12, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
                    background: priority === p.value ? `${p.color}18` : T.glass,
                    border: `1.5px solid ${priority === p.value ? p.color : T.border}`,
                    color: priority === p.value ? p.color : T.muted,
                  }}>{p.label}</button>
                ))}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
                width: "100%", padding: "13px 16px", background: photoUrl ? "rgba(96,165,250,0.12)" : T.glass,
                border: `1px solid ${photoUrl ? T.blueBorder : T.border}`, borderRadius: 14,
                cursor: uploading ? "wait" : "pointer", fontFamily: "inherit", color: photoUrl ? T.blue : T.muted,
                display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, marginBottom: 10,
              }}>
                {uploading
                  ? <><span style={{ display: "inline-flex", animation: "spin 1s linear infinite" }}><I n="loader" s={17} c={T.blue} /></span> Enviando foto...</>
                  : photoUrl
                    ? <><I n="check" s={17} c={T.blue} /> Foto anexada — trocar</>
                    : <><I n="camera" s={17} c={T.muted} /> Tirar foto do problema (opcional)</>}
              </button>
              {photoUrl && (
                <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${T.blueBorder}`, marginBottom: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="Problema reportado" style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
                </div>
              )}
              <div style={{ height: 4 }} />
            </div>

            <div style={{ padding: "12px 20px 24px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
              {error && (
                <div style={{ marginBottom: 10, padding: "10px 14px", background: T.redBg, border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, color: T.red, fontSize: 12, fontWeight: 600 }}>
                  {error}
                </div>
              )}
              <button disabled={!canSubmit || busy} onClick={submit} style={{
                width: "100%", padding: "15px 0", background: canSubmit ? T.grad : T.glass,
                color: canSubmit ? "#fff" : T.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 800,
                letterSpacing: "0.03em", textTransform: "uppercase" as const, border: "none", borderRadius: 16,
                cursor: canSubmit && !busy ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {busy ? <I n="loader" s={17} c="#fff" /> : <><I n="send" s={16} /> Abrir Chamado</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
