// "Promover a hóspede" deixou de ser um clique: é a decisão de QUEM é o
// titular. Duas saídas — vincular a uma ficha EXISTENTE (os matches por
// telefone/nome já vêm carregados e dá para buscar por nome ou CPF) ou abrir
// uma ficha NOVA com os dados conferidos. Criar duplicado é o erro caro aqui,
// então a busca vem primeiro e a aba de ficha nova avisa quando o CPF já tem
// ficha (o servidor vincula a existente em vez de duplicar).
// Visual: identidade do admin (dark glass — ver src/app/admin/CLAUDE.md).
"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, Search, UserPlus, X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmLead, Guest } from "@/types/aura";
import { S, pillS } from "./shared";

const fieldLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 4, display: "block",
};

export type PromotePayload =
  | { guestId: string }
  | { create: { document: string; fullName: string; phone: string | null; email: string | null } };

export function PromoteGuestModal({
  propertyId, lead, busy, onClose, onConfirm,
}: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  onClose: () => void;
  /** Erro do servidor (CPF inválido, ficha inexistente) volta como string. */
  onConfirm: (payload: PromotePayload) => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState(lead.title === "Sem nome" ? "" : lead.title);
  const [matches, setMatches] = useState<Guest[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Ficha nova: prefill com o que o vendedor já digitou na cotação.
  const [fullName, setFullName] = useState(lead.title === "Sem nome" ? "" : lead.title);
  const [document, setDocument] = useState(lead.document ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");

  // Busca combinada: telefone do lead + o que estiver no campo (nome ou CPF).
  // Debounce curto — o vendedor digita o nome inteiro antes de decidir.
  useEffect(() => {
    let alive = true;
    const q = query.trim();
    if (!lead.phone && q.length < 2) { setMatches([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ propertyId });
      if (lead.phone) qs.set("phone", lead.phone);
      if (q.length >= 2) qs.set("q", q);
      fetch(`/api/admin/comercial/client?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return;
          const phoneM: Guest[] = d?.phoneMatches ?? [];
          const nameM: Guest[] = d?.nameMatches ?? [];
          const seen = new Set(phoneM.map((g) => g.id));
          setMatches([...phoneM, ...nameM.filter((g) => !seen.has(g.id))]);
        })
        .catch(() => { if (alive) setMatches([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [propertyId, lead.phone, query]);

  const docDigits = document.replace(/\D/g, "");
  const newError = !fullName.trim() ? "Informe o nome completo."
    : docDigits.length < 11 ? "O CPF é obrigatório para abrir a ficha."
    : null;
  /** CPF já cadastrado: o servidor vincula, mas o vendedor precisa saber. */
  const docMatch = (matches ?? []).find((g) => g.id.replace(/\D/g, "") === docDigits);

  const confirmNew = () => {
    if (newError) return;
    onConfirm({
      create: {
        document: docDigits, fullName: fullName.trim(),
        phone: phone.replace(/\D/g, "") || null, email: email.trim() || null,
      },
    });
  };

  const tabBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 9, border: "none",
    fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: "inherit",
    background: on ? T.bg : "transparent", color: on ? "#fff" : T.muted,
  });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24,
      }}>
      <div style={{
        width: "100%", maxWidth: 520, maxHeight: "88vh", background: T.card,
        border: `1px solid ${T.border2}`, borderRadius: 20,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,.7)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>Promover a hóspede</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
              A ficha é obrigatória para marcar o orçamento como ganho.
            </div>
          </div>
          <button onClick={onClose}
            style={{ padding: 7, borderRadius: 10, background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <div style={{ display: "flex", gap: 4, background: T.glass, borderRadius: 11, padding: 3 }}>
            <button style={tabBtn(mode === "existing")} onClick={() => setMode("existing")}>
              Ficha existente
            </button>
            <button style={tabBtn(mode === "new")} onClick={() => setMode("new")}>
              Criar ficha nova
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "existing" ? (<>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 11, top: 11, color: T.muted }} />
              <input autoFocus style={{ ...S.input, paddingLeft: 32 }}
                placeholder="Buscar por nome ou CPF"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>

            {searching && matches === null ? (
              <p style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                <Loader2 size={12} className="animate-spin" /> Procurando na base de hóspedes…
              </p>
            ) : (matches ?? []).length === 0 ? (
              <div style={{ ...S.row, padding: "14px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
                  Nenhuma ficha encontrada
                  {query.trim() ? ` para "${query.trim()}"` : " com o telefone deste lead"}.
                </p>
                <button onClick={() => setMode("new")}
                  style={{
                    marginTop: 10, ...S.gradBtn, display: "inline-flex", padding: "7px 14px", fontSize: 12,
                  }}>
                  <UserPlus size={13} /> Criar ficha nova
                </button>
              </div>
            ) : (
              (matches ?? []).map((g) => {
                const samePhone = !!lead.phone && !!g.phone
                  && g.phone.replace(/\D/g, "").slice(-8) === lead.phone.replace(/\D/g, "").slice(-8);
                return (
                  <div key={g.id} style={{
                    ...S.row, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 800, color: T.text, margin: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {g.fullName}
                      </p>
                      <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0" }}>
                        CPF {g.id}{g.phone ? ` · ${g.phone}` : ""}
                      </p>
                    </div>
                    {samePhone && (
                      <span style={{ ...pillS("rgba(245,158,11,0.15)", T.amber, "rgba(245,158,11,0.3)"), flexShrink: 0 }}>
                        mesmo telefone
                      </span>
                    )}
                    <button disabled={busy} onClick={() => onConfirm({ guestId: g.id })}
                      style={{ ...S.gradBtn, padding: "6px 13px", fontSize: 11.5, boxShadow: "none", flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />}
                      Vincular
                    </button>
                  </div>
                );
              })
            )}
          </>) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLabel}>Nome completo *</label>
                <input autoFocus style={S.input} value={fullName}
                  onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>CPF *</label>
                <input style={S.input} inputMode="numeric" placeholder="Só números"
                  value={document} onChange={(e) => setDocument(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label style={fieldLabel}>Telefone</label>
                <input style={S.input} inputMode="numeric"
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLabel}>E-mail</label>
                <input style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            {docMatch && (
              <p style={{
                fontSize: 12, color: T.amber, background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12,
                padding: "9px 12px", margin: 0, lineHeight: 1.5,
              }}>
                Esse CPF já tem ficha (<b>{docMatch.fullName}</b>) — vamos vincular a existente
                em vez de criar outra.
              </p>
            )}
            <p style={{ fontSize: 11.5, color: T.muted, margin: 0, lineHeight: 1.5 }}>
              A ficha nasce com o básico; o restante (endereço, documento, preferências)
              é preenchido no check-in.
            </p>
          </>)}
        </div>

        <div style={{ padding: "13px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancelar</button>
          {mode === "new" && (
            <button onClick={confirmNew} disabled={busy || !!newError}
              title={newError ?? undefined}
              style={{ ...S.gradBtn, marginLeft: "auto", opacity: busy || newError ? 0.5 : 1 }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {docMatch ? "Vincular ficha existente" : "Criar e vincular"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
