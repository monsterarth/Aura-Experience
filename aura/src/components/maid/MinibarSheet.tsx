"use client";

import React, { useState, useRef } from "react";

// Itens exibidos no passo de frigobar (origem: itens de Concierge do grupo "Frigobar").
type FrigobarItem = { id: string; name: string; price: number };

// ─── Design tokens (mesmos do /maid) ─────────────────────────────────────────

export const T = {
  bg: "#06080f",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  glass3: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.42)",
  muted2: "rgba(238,240,248,0.22)",
  g1: "#9b6dff",
  g2: "#4ec9d4",
  grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.18) 0%,rgba(78,201,212,0.18) 100%)",
  gradBorder: "linear-gradient(135deg,rgba(155,109,255,0.45),rgba(78,201,212,0.45))",
  green: "#2dd4bf",
  greenG: "linear-gradient(135deg,#059669,#2dd4bf)",
  greenBg: "rgba(45,212,191,0.1)",
  greenBorder: "rgba(45,212,191,0.25)",
  led: "#00d4ff",
  ledGlow: "rgba(0,212,255,0.5)",
  ledBg: "rgba(0,212,255,0.08)",
  ledBorder: "rgba(0,212,255,0.25)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.28)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.1)",
  blueBorder: "rgba(96,165,250,0.25)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.1)",
};

// ─── Icon component ───────────────────────────────────────────────────────────

type IName = "home"|"coffee"|"sparkles"|"user"|"key"|"check"|"arrow"|"plus"|"minus"|"x"|"pkg"|"info"|"send"|"logout"|"edit"|"sun"|"clock"|"list"|"chevr"|"loader"|"camera"|"inbox"|"search";

export function I({ n, s = 20, c = "currentColor", w = 1.8 }: { n: IName; s?: number; c?: string; w?: number }) {
  const d: Record<IName, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></>,
    coffee: <><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    sparkles: <><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z"/><path d="M5 17l.8 1.8L7.5 19.5l-1.7.7L5 22l-.8-1.7L2.5 19.5l1.7-.7L5 17z"/></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    key: <><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L21 8l-3-3"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    pkg: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    list: <><rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="17" width="12" height="2" rx="1"/></>,
    chevr: <polyline points="9 18 15 12 9 6"/>,
    loader: <><path d="M21 12a9 9 0 11-6.219-8.56"/></>,
    camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d[n]}
    </svg>
  );
}

// ─── Bottom Sheet wrapper ─────────────────────────────────────────────────────

export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.75)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        animation: "maid-fadein .2s ease", backdropFilter: "blur(4px)",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0d1020", border: `1px solid ${T.border2}`,
        borderRadius: "28px 28px 0 0", borderBottom: "none",
        maxHeight: "92dvh", display: "flex", flexDirection: "column",
        animation: "maid-slideup .28s cubic-bezier(.32,.72,0,1)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border2, margin: "12px auto 4px", flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

// ─── Finalização via rota de campo ────────────────────────────────────────────
// Tira os writes de finalização (frigobar; chave; stays: objetos esquecidos/emprestados;
// housekeeping_tasks: cabinChecked) do client do browser, que penduravam no lock/token frio do
// Supabase no app de campo (spinner travado / botão sem resposta). Timeout defensivo: nunca
// trava o fluxo. keepalive: o request sobrevive se o celular bloquear logo após o toque.
export async function postCabinConference(payload: {
  stayId?: string;
  taskId?: string;
  lostItems?: { description: string; photo: string | null };
  loanedReturned?: boolean;
  cabinChecked?: boolean;
  frigobar?: { cabinId?: string; cart: Record<string, number> };
  keyNotFound?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch("/api/field/cabin-conference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      keepalive: true,
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({} as any));
    return { ok: false, error: typeof body?.error === "string" ? body.error : undefined };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// ─── MinibarSheet ─────────────────────────────────────────────────────────────

export function MinibarSheet({
  cabinName, items, onClose, onSend,
  keyLocation, stayId, showToast,
  loanedItems, taskId,
}: {
  cabinName: string;
  items: FrigobarItem[];
  onClose: () => void;
  onSend: (cart: Record<string, number>) => Promise<void>;
  keyLocation?: "reception" | "cabin" | "unknown";
  stayId?: string;
  propertyId?: string;
  userId?: string;
  userName?: string;
  showToast?: (msg: string, color?: string) => void;
  loanedItems?: string;
  taskId?: string;
  actorLabel?: string;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"cart" | "key" | "lost" | "loaned" | "fin">("cart");
  const [lostDesc, setLostDesc] = useState("");
  const [lostPhoto, setLostPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingLost, setSavingLost] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedLoaned = loanedItems
    ? loanedItems.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map((label, i) => ({ id: String(i), label, checked: false }))
    : [];
  const [loanedChecks, setLoanedChecks] = useState<{ id: string; label: string; checked: boolean }[]>(parsedLoaned);
  const [savingLoaned, setSavingLoaned] = useState(false);

  const adj = (id: string, d: number) =>
    setCart(p => { const n = { ...p }, v = Math.max(0, (p[id] ?? 0) + d); if (!v) delete n[id]; else n[id] = v; return n; });

  const total = Object.entries(cart).reduce((s, [id, q]) => s + (items.find(m => m.id === id)?.price ?? 0) * q, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const submitCart = async () => {
    setBusy(true);
    try {
      await onSend(cart);
      setBusy(false);
      if (keyLocation === "cabin") { setPhase("key"); } else { setPhase("lost"); }
    } catch { setBusy(false); }
  };

  const confirmKey = async (found: boolean) => {
    if (!found && stayId) {
      // Via rota de campo (server-side): addFolioItemManual pelo browser pendurava no lock frio.
      // Fire-and-forget: o registro é best-effort e não pode travar o fluxo da conferência.
      void postCabinConference({ stayId, keyNotFound: true }).then(r => {
        if (r.ok) showToast?.("Chave não encontrada registrada no fólio.", T.amber);
      });
    }
    setPhase("lost");
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
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress_failed")), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = url;
    });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", new File([compressed], "lost-item.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload_failed");
      const { url } = await res.json();
      setLostPhoto(url);
    } catch {
      showToast?.("Erro ao enviar foto.", T.red);
    } finally { setUploadingPhoto(false); }
  };

  const finishAll = async () => {
    // Marca a cabana como conferida via rota de campo, em BACKGROUND (fire-and-forget): aguardar
    // o write pendurava a finalização no lock/token frio do app — o botão "Não encontrei" parecia
    // não-responsivo. O fluxo conclui na hora; a rota (server-side) persiste sozinha.
    if (taskId) void postCabinConference({ taskId, cabinChecked: true });
    setPhase("fin");
    showToast?.("Conferência concluída!");
    setTimeout(onClose, 700);
  };

  const submitLost = async (hasItems: boolean) => {
    if (!hasItems) {
      if (parsedLoaned.length > 0) { setPhase("loaned"); return; }
      await finishAll();
      return;
    }
    if (!lostDesc.trim()) return;
    setSavingLost(true);
    // Persiste via rota de campo (server-side). Antes era write direto no Supabase do browser,
    // que pendurava no lock frio — o spinner do "Registrar" travava e o fluxo não concluía.
    const r = await postCabinConference({
      stayId: stayId ?? "",
      lostItems: { description: lostDesc.trim(), photo: lostPhoto },
    });
    setSavingLost(false);
    if (!r.ok) { showToast?.("Erro ao registrar. Tente novamente.", T.red); return; }
    showToast?.("Objetos esquecidos registrados!", T.amber);
    if (parsedLoaned.length > 0) { setPhase("loaned"); } else { await finishAll(); }
  };

  const submitLoaned = async () => {
    setSavingLoaned(true);
    await postCabinConference({ stayId: stayId ?? "", loanedReturned: true });
    setSavingLoaned(false);
    await finishAll();
  };

  // ── Key step ─────────────────────────────────────────────────────────────────
  if (phase === "key") {
    return (
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="key" s={22} c={T.amber} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Confirmar Chave</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cabinName}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>
            A chave estava na acomodação?
          </div>
        </div>
        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <button onClick={() => confirmKey(true)} style={{ padding: "20px 16px", background: T.greenBg, border: `2px solid ${T.greenBorder}`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", color: T.green, textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(45,212,191,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="check" s={22} c={T.green} w={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Sim, estava lá</div>
                <div style={{ fontSize: 12, color: T.green, opacity: 0.7, marginTop: 2 }}>Chave encontrada na acomodação</div>
              </div>
            </button>
            <button onClick={() => confirmKey(false)} style={{ padding: "20px 16px", background: T.redBg, border: `2px solid rgba(248,113,113,0.3)`, borderRadius: 18, cursor: "pointer", fontFamily: "inherit", color: T.red, textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <I n="x" s={22} c={T.red} w={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Não encontramos</div>
                <div style={{ fontSize: 12, color: T.red, opacity: 0.7, marginTop: 2 }}>Será registrado no fólio da estadia</div>
              </div>
            </button>
          </div>
          <div style={{ height: 40 }} />
        </div>
      </Sheet>
    );
  }

  // ── Loaned items step ─────────────────────────────────────────────────────────
  if (phase === "loaned") {
    const allChecked = loanedChecks.every(i => i.checked);
    return (
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.amberBg, border: `1px solid ${T.amberBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="pkg" s={22} c={T.amber} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Objetos Emprestados</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cabinName}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>
            Confirme a devolução de cada item:
          </div>
        </div>
        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {loanedChecks.map(item => (
              <div
                key={item.id}
                onClick={() => setLoanedChecks(p => p.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 14,
                  border: `1px solid ${item.checked ? T.greenBorder : T.border}`,
                  background: item.checked ? T.greenBg : T.glass,
                  cursor: "pointer", transition: "all .15s", userSelect: "none",
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${item.checked ? T.green : "rgba(255,255,255,0.15)"}`,
                  background: item.checked ? T.green : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
                }}>
                  {item.checked && <I n="check" s={12} c="white" w={3} />}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1, textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.45 : 1, color: item.checked ? T.green : T.text }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <div style={{ height: 40 }} />
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
          <button
            onClick={submitLoaned}
            disabled={!allChecked || savingLoaned}
            style={{
              width: "100%", padding: 16,
              background: allChecked ? T.greenG : T.glass,
              color: allChecked ? "#021a17" : T.muted,
              fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const,
              border: "none", borderRadius: 16, cursor: allChecked && !savingLoaned ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: allChecked ? 1 : 0.4,
              boxShadow: allChecked ? "0 4px 20px rgba(45,212,191,0.3)" : "none",
            }}
          >
            {savingLoaned ? <I n="loader" s={17} c="#021a17" w={2} /> : <><I n="check" s={17} />Confirmar Devolução</>}
          </button>
        </div>
      </Sheet>
    );
  }

  // ── Lost items step ───────────────────────────────────────────────────────────
  if (phase === "lost") {
    return (
      <Sheet onClose={onClose}>
        <div style={{ padding: "0 20px 14px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.blueBg, border: `1px solid ${T.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <I n="search" s={22} c={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Objetos Esquecidos</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cabinName}</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginTop: 16, lineHeight: 1.5 }}>
            Encontrou algum objeto esquecido?
          </div>
        </div>
        <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <textarea
              placeholder="Descreva os objetos encontrados... (ex: óculos de sol, carregador, livro)"
              value={lostDesc}
              onChange={e => setLostDesc(e.target.value)}
              rows={4}
              style={{
                width: "100%", background: T.glass2, border: `1px solid ${lostDesc ? T.blueBorder : T.border}`,
                borderRadius: 16, padding: "14px 16px", color: T.text, fontSize: 14, fontFamily: "inherit",
                resize: "none", outline: "none", lineHeight: 1.6, transition: "border-color .15s",
              }}
            />
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                width: "100%", padding: "14px 16px", background: lostPhoto ? "rgba(96,165,250,0.12)" : T.glass,
                border: `1px solid ${lostPhoto ? T.blueBorder : T.border}`, borderRadius: 16,
                cursor: uploadingPhoto ? "wait" : "pointer", fontFamily: "inherit", color: lostPhoto ? T.blue : T.muted,
                display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 600,
              }}
            >
              {uploadingPhoto ? (
                <><span style={{ display: "inline-flex", animation: "maid-spin 1s linear infinite" }}><I n="loader" s={18} c={T.blue} w={2} /></span> Enviando foto...</>
              ) : lostPhoto ? (
                <><I n="check" s={18} c={T.blue} /> Foto anexada — trocar</>
              ) : (
                <><I n="camera" s={18} c={T.muted} /> Tirar foto dos objetos</>
              )}
            </button>
            {lostPhoto && (
              <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${T.blueBorder}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lostPhoto} alt="Objetos esquecidos" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => submitLost(false)}
                style={{ padding: "16px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", color: T.muted, fontSize: 14, fontWeight: 700 }}
              >
                Não encontrei
              </button>
              <button
                onClick={() => submitLost(true)}
                disabled={!lostDesc.trim() || savingLost}
                style={{
                  padding: "16px 12px", background: lostDesc.trim() ? T.grad : T.glass,
                  border: `1px solid ${lostDesc.trim() ? "transparent" : T.border}`, borderRadius: 16,
                  cursor: lostDesc.trim() && !savingLost ? "pointer" : "not-allowed", fontFamily: "inherit",
                  color: lostDesc.trim() ? "#fff" : T.muted, fontSize: 14, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: lostDesc.trim() ? 1 : 0.4,
                }}
              >
                {savingLost ? <I n="loader" s={16} c="#fff" w={2} /> : <><I n="send" s={16} />Registrar</>}
              </button>
            </div>
          </div>
          <div style={{ height: 32 }} />
        </div>
      </Sheet>
    );
  }

  // ── Cart step ─────────────────────────────────────────────────────────────────
  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{cabinName}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3, fontWeight: 500 }}>Conferência da cabana</div>
        </div>
        <button onClick={onClose} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, cursor: "pointer", color: T.muted }}>
          <I n="x" s={15} />
        </button>
      </div>

      {/* Steps indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 20px 14px", flexShrink: 0 }}>
        {[
          { label: "Frigobar", active: true },
          { label: keyLocation === "cabin" ? "Chave" : null },
          { label: "Achados" },
          { label: parsedLoaned.length > 0 ? "Empréstimos" : null },
        ].filter(s => s.label).map((s, i, arr) => (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: s.active ? T.g1 : "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: s.active ? "#fff" : T.muted }}>{i + 1}</div>
              <span style={{ fontSize: 11, fontWeight: s.active ? 700 : 500, color: s.active ? T.text : T.muted }}>{s.label}</span>
            </div>
            {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: T.border }} />}
          </React.Fragment>
        ))}
      </div>

      <div className="maid-sheet-body" style={{ padding: "0 16px" }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: T.muted }}>
            <I n="inbox" s={36} c={T.muted} />
            <div style={{ fontSize: 13, marginTop: 10 }}>Nenhum item no frigobar</div>
          </div>
        ) : items.map(item => {
          const q = cart[item.id] ?? 0;
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px",
              borderRadius: 14, borderBottom: `1px solid ${T.border}`,
              background: q > 0 ? "rgba(155,109,255,0.08)" : "transparent", transition: "background .15s",
            }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: q > 0 ? 700 : 400, color: q > 0 ? T.g1 : T.text }}>{item.name}</span>
              <span style={{ fontSize: 11, color: T.muted, marginRight: 6 }}>R${item.price}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => adj(item.id, -1)} disabled={!q} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.glass2, cursor: q ? "pointer" : "not-allowed", opacity: q ? 1 : 0.3, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}>
                  <I n="minus" s={13} />
                </button>
                <span style={{ width: 18, textAlign: "center", fontWeight: 900, fontSize: 14 }}>{q}</span>
                <button onClick={() => adj(item.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,rgba(155,109,255,0.3),rgba(78,201,212,0.3))", border: "1px solid rgba(155,109,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.g1 }}>
                  <I n="plus" s={13} />
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ height: 100 }} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: "#0d1020", flexShrink: 0 }}>
        {count > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{count} item(s)</span>
            <span style={{ fontSize: 14, fontWeight: 900, background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>R$ {total.toFixed(2)}</span>
          </div>
        )}
        <button
          onClick={submitCart}
          disabled={busy}
          style={{
            width: "100%", padding: 16, background: T.grad, color: "#fff",
            fontFamily: "inherit", fontSize: 14, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase" as const,
            border: "none", borderRadius: 16, cursor: busy ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 4px 20px rgba(155,109,255,0.35)",
          }}
        >
          {busy ? <I n="loader" s={17} c="#fff" w={2} /> : count > 0 ? <><I n="send" s={17} />Lançar e continuar</> : <><I n="arrow" s={17} />Sem consumo · Continuar</>}
        </button>
      </div>
    </Sheet>
  );
}
