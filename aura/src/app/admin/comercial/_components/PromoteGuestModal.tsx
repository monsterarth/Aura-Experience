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
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { GuestService } from "@/services/guest-service";
import { S, pillS } from "./shared";
import { Dialog } from "@/components/aura";

const fieldLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 4, display: "block",
};

export type PromotePayload =
  | { guestId: string }
  | {
      create: {
        document: string; documentType: string; fullName: string;
        phone: string | null; email: string | null;
      };
    };

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
  const [docTypes, setDocTypes] = useState<FnrhDomain[]>([]);
  useEffect(() => { FnrhService.getTiposDocumento().then(setDocTypes); }, []);

  // Ficha nova: prefill com o que o vendedor já digitou na cotação.
  const [fullName, setFullName] = useState(lead.title === "Sem nome" ? "" : lead.title);
  const [document, setDocument] = useState(lead.document ?? "");
  const [documentType, setDocumentType] = useState(lead.documentType ?? "CPF");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const docLabel = docTypes.find((d) => d.id === documentType)?.label ?? documentType;

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

  // CPF é sempre só dígitos (11); outros documentos (passaporte, DNI, RG…)
  // podem ter letras — mesma normalização alfanumérica do servidor
  // (GuestService.normalizeDocument), só o tamanho mínimo é CPF-específico.
  const docNorm = documentType === "CPF"
    ? document.replace(/\D/g, "")
    : GuestService.normalizeDocument(document);
  const newError = !fullName.trim() ? "Informe o nome completo."
    : documentType === "CPF" && docNorm.length < 11 ? "O CPF é obrigatório para abrir a ficha."
    : !docNorm ? `Informe um ${docLabel.toLowerCase()} válido para abrir a ficha.`
    : null;
  /** Documento já cadastrado: o servidor vincula, mas o vendedor precisa saber. */
  const docMatch = (matches ?? []).find((g) => GuestService.normalizeDocument(g.id) === docNorm);

  const confirmNew = () => {
    if (newError) return;
    onConfirm({
      create: {
        document: docNorm, documentType, fullName: fullName.trim(),
        phone: phone.replace(/\D/g, "") || null, email: email.trim() || null,
      },
    });
  };

  const tabBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 9, border: "none",
    fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: "inherit",
    background: on ? T.card : "transparent", color: on ? T.text : T.muted, boxShadow: on ? "0 1px 2px rgba(0,0,0,.08)" : "none",
  });

  return (
    <Dialog open onClose={onClose} presentation="auto" size="md" rawBody title="Promover a hóspede" subtitle="A ficha é obrigatória para marcar o orçamento como ganho." ariaLabel="Promover a hóspede">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

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
                placeholder="Buscar por nome ou documento"
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
                        {g.document?.type || "Doc."} {g.id}{g.phone ? ` · ${g.phone}` : ""}
                      </p>
                    </div>
                    {samePhone && (
                      <span style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), flexShrink: 0 }}>
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
                <label style={fieldLabel}>Tipo de documento</label>
                <select style={{ ...S.input, background: T.card }}
                  value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                  {docTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Telefone</label>
                <input style={S.input} inputMode="numeric"
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLabel}>{docLabel} *</label>
                <input style={S.input}
                  inputMode={documentType === "CPF" ? "numeric" : "text"}
                  placeholder={documentType === "CPF" ? "Só números" : undefined}
                  value={document}
                  onChange={(e) => setDocument(
                    documentType === "CPF" ? e.target.value.replace(/\D/g, "") : e.target.value
                  )} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLabel}>E-mail</label>
                <input style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            {docMatch && (
              <p style={{
                fontSize: 12, color: T.amber, background: T.amberBg,
                border: `1px solid ${T.amberBorder}`, borderRadius: 12,
                padding: "9px 12px", margin: 0, lineHeight: 1.5,
              }}>
                Esse documento já tem ficha (<b>{docMatch.fullName}</b>) — vamos vincular a
                existente em vez de criar outra.
              </p>
            )}
            <p style={{ fontSize: 11.5, color: T.muted, margin: 0, lineHeight: 1.5 }}>
              A ficha nasce com o básico; o restante (endereço, documento, preferências)
              é preenchido no check-in.
            </p>
          </>)}
        </div>

        <div className="ak-dialog__footer" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
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
    </Dialog>
  );
}
