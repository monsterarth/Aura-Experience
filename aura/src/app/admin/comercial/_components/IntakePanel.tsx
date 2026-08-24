// Cadastro do titular no drawer do lead: o que o CLIENTE preencheu na proposta
// pública ("para garantir sua reserva").
//
// Duas caras:
//  - sem cadastro → o botão que copia o link do formulário, para quem fechou
//    pelo WhatsApp ou aceitou antes de isto existir;
//  - com cadastro → os dados agrupados, com copiar tudo, o selo de divergência
//    onde o cliente informou algo diferente do lead, e edição pela recepção
//    (o link do cliente trava no primeiro envio — a correção é daqui).
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ClipboardList, Copy, Link2, Loader2, PawPrint, Pencil, Save, X,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { copyText } from "@/lib/clipboard";
import { CrmLead, QuoteIntake } from "@/types/aura";
import { S, fmtBR, pillS } from "./shared";

const drawerLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

const KIND_LABEL: Record<string, string> = { adult: "Adulto", child: "Criança", baby: "Bebê" };

/** Telefone salvo com DDI vira "+55 53 98116-9216" só para leitura. */
function prettyPhone(raw?: string | null): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "—";
  if (d.startsWith("55") && d.length >= 12) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, -4)}-${d.slice(-4)}`;
  }
  return `+${d}`;
}

function addressLine(a: QuoteIntake["holder"]["address"]): string {
  const parts = [
    [a.street, a.number].filter(Boolean).join(", "),
    a.complement,
    a.neighborhood,
    [a.city, a.state].filter(Boolean).join(" - "),
    a.zipCode,
    a.country && a.country !== "BR" ? a.country : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

/** O texto que a recepção cola no WhatsApp / na ficha. */
function intakeAsText(i: QuoteIntake): string {
  const lines = [
    `Titular: ${i.holder.fullName}`,
    `${i.holder.documentType}: ${i.holder.document}`,
    i.holder.birthDate ? `Nascimento: ${fmtBR(i.holder.birthDate)}` : null,
    `E-mail: ${i.holder.email}`,
    `Telefone: ${prettyPhone(i.holder.phone)}`,
    `Endereço: ${addressLine(i.holder.address)}`,
    i.companions.length
      ? `Acompanhantes: ${i.companions
          .map((c) => `${c.fullName || "(sem nome)"}${c.birthDate ? ` (${fmtBR(c.birthDate)})` : ""}`)
          .join("; ")}`
      : null,
    i.vehiclePlate ? `Placa: ${i.vehiclePlate}` : null,
    i.pets?.length
      ? `Pet: ${i.pets.map((p) => `${p.name || "(sem nome)"} · ${p.species}${p.weight ? ` · ${p.weight}kg` : ""}`).join("; ")}`
      : null,
    i.payment ? `Pagamento: ${i.payment.label}` : null,
    i.notes ? `Observações: ${i.notes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Dado do cliente ≠ dado do lead: quem decide é a recepção, não o formulário. */
function Divergence({ label, value, onAdopt, busy }: {
  label: string; value: string; onAdopt?: () => void; busy?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: T.amberBg, border: `1px solid ${T.amberBorder}`,
      borderRadius: 10, padding: "6px 10px", marginTop: 4,
    }}>
      <AlertTriangle size={11} style={{ color: T.amber, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: T.amber }}>
        No lead: <b>{label}</b>
      </span>
      {onAdopt && (
        <button onClick={onAdopt} disabled={busy}
          title={`Usar "${value}" no lead`}
          style={{
            marginLeft: "auto", padding: "3px 9px", borderRadius: 8, border: "none",
            background: T.amber, color: "#1c1c1c", fontSize: 10.5, fontWeight: 800,
            cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.5 : 1,
          }}>
          Usar o do cliente
        </button>
      )}
    </div>
  );
}

/** `value` ausente (undefined) = a linha está em edição e quem desenha é o
 *  `children`; `null` continua virando "—". */
function Line({ label, value, children }: {
  label: string; value?: string | null; children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ ...drawerLabel, marginBottom: 2 }}>{label}</p>
      {value !== undefined && (
        <p style={{ fontSize: 12.5, color: T.text, margin: 0, wordBreak: "break-word" }}>
          {value ?? "—"}
        </p>
      )}
      {children}
    </div>
  );
}

export function IntakePanel({ propertyId, lead, busy, onPatch, onChanged }: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  /** Adotar um dado do cliente no lead (mesmo PATCH do ClientPanel). */
  onPatch?: (patch: Record<string, unknown>) => Promise<void>;
  /** Cadastro corrigido — o drawer recarrega a timeline. */
  onChanged?: () => void;
}) {
  const [intake, setIntake] = useState<QuoteIntake | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuoteIntake | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead.intakeAt) { setIntake(null); return; }
    let alive = true;
    setLoading(true);
    setEditing(false);
    fetch(`/api/admin/tarifario/quotes/intake?propertyId=${propertyId}&id=${lead.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setIntake((d?.intake ?? null) as QuoteIntake | null); })
      .catch(() => { if (alive) setIntake(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, lead.id, lead.intakeAt]);

  const proposalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/cotacao/${lead.id}?cadastro=1`
    : "";

  // ── Sem cadastro: o link para pedir ──────────────────────────────────────
  if (!lead.intakeAt) {
    return (
      <div style={{ ...S.card, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <ClipboardList size={13} style={{ color: T.muted }} />
          <p style={drawerLabel}>Cadastro do titular</p>
        </div>
        <p style={{ fontSize: 11.5, color: T.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
          O cliente ainda não preencheu os dados na proposta. Este link abre direto no
          formulário — serve para quem fechou pelo WhatsApp.
        </p>
        <button onClick={async () => {
          if (await copyText(proposalUrl)) toast.success("Link do cadastro copiado!");
          else toast.error("Não foi possível copiar o link.");
        }}
          style={{ ...S.ghostBtn, fontSize: 11.5 }}>
          <Link2 size={12} /> Copiar link do cadastro
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...S.card, padding: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <Loader2 size={13} className="animate-spin" style={{ color: T.muted }} />
        <span style={{ fontSize: 12, color: T.muted }}>Carregando o cadastro…</span>
      </div>
    );
  }

  if (!intake) return null;

  const i = editing && draft ? draft : intake;
  const patchDraft = (patch: Partial<QuoteIntake>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const patchHolder = (patch: Partial<QuoteIntake["holder"]>) =>
    setDraft((d) => (d ? { ...d, holder: { ...d.holder, ...patch } } : d));
  const patchAddress = (patch: Partial<QuoteIntake["holder"]["address"]>) =>
    setDraft((d) => (d ? { ...d, holder: { ...d.holder, address: { ...d.holder.address, ...patch } } } : d));

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes/intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, id: lead.id, intake: draft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      setIntake(data.intake as QuoteIntake);
      setEditing(false);
      toast.success("Cadastro atualizado.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  };

  // Divergências: o cadastro NÃO sobrescreve o que o vendedor já tinha
  // digitado — mostra lado a lado e a recepção adota com um clique.
  const leadDoc = (lead.document || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const docDiverges = !!leadDoc && leadDoc !== i.holder.document;
  const emailDiverges = !!lead.email && lead.email.toLowerCase() !== i.holder.email;
  const phoneDiverges = !!lead.phone && lead.phone.replace(/\D/g, "") !== i.holder.phone;
  const nameDiverges = !!lead.title && lead.title !== "Sem nome"
    && lead.title.trim().toLowerCase() !== i.holder.fullName.trim().toLowerCase();

  const adopt = (patch: Record<string, unknown>) => async () => {
    if (!onPatch) return;
    await onPatch(patch);
    toast.success("Lead atualizado com o dado do cliente.");
  };

  const editInput = (value: string, onChange: (v: string) => void, extra?: React.CSSProperties) => (
    <input style={{ ...S.input, padding: "6px 9px", fontSize: 12, ...extra }}
      value={value} disabled={saving} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div style={{ ...S.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
        <ClipboardList size={13} style={{ color: T.g1 }} />
        <p style={drawerLabel}>Cadastro do titular</p>
        <span style={pillS(T.emeraldBg, T.emerald, T.emeraldBorder)}>
          {lead.intakeAt ? fmtBR(String(lead.intakeAt).slice(0, 10)) : "recebido"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {!editing && (
            <>
              <button onClick={async () => {
                if (await copyText(intakeAsText(intake))) toast.success("Dados copiados!");
                else toast.error("Não foi possível copiar.");
              }}
                title="Copiar tudo" style={{ ...S.ghostBtn, padding: "5px 9px", fontSize: 11 }}>
                <Copy size={11} /> Copiar
              </button>
              <button onClick={() => { setDraft(intake); setEditing(true); }} disabled={busy}
                title="Corrigir (o link do cliente já está travado)"
                style={{ ...S.ghostBtn, padding: "5px 9px", fontSize: 11 }}>
                <Pencil size={11} /> Corrigir
              </button>
            </>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditing(false); setDraft(null); }} disabled={saving}
                style={{ ...S.ghostBtn, padding: "5px 9px", fontSize: 11 }}>
                <X size={11} /> Cancelar
              </button>
              <button onClick={save} disabled={saving}
                style={{ ...S.gradBtn, padding: "5px 12px", fontSize: 11 }}>
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Salvar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pet fora da cotação: o preço muda, alguém precisa refazer a conta. */}
      {i.petsNotQuoted && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: T.amberBg, border: `1px solid ${T.amberBorder}`,
          borderRadius: 10, padding: "8px 10px", marginBottom: 10,
        }}>
          <PawPrint size={12} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: T.amber, lineHeight: 1.45 }}>
            O cliente informou pet e a cotação foi feita SEM pet — refaça o orçamento com a
            taxa antes de confirmar.
          </span>
        </div>
      )}

      {/* Titular */}
      <Line label="Nome completo">
        {editing
          ? editInput(i.holder.fullName, (v) => patchHolder({ fullName: v }))
          : <p style={{ fontSize: 12.5, color: T.text, margin: 0 }}>{i.holder.fullName}</p>}
        {!editing && nameDiverges && (
          <Divergence label={lead.title} value={i.holder.fullName} busy={busy}
            onAdopt={onPatch ? adopt({ clientName: i.holder.fullName }) : undefined} />
        )}
      </Line>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Line label={i.holder.documentType}>
          {editing
            ? editInput(i.holder.document, (v) => patchHolder({ document: v.toUpperCase() }))
            : <p style={{ fontSize: 12.5, color: T.text, margin: 0 }}>{i.holder.document}</p>}
          {!editing && docDiverges && (
            <Divergence label={lead.document ?? ""} value={i.holder.document} busy={busy}
              onAdopt={onPatch ? adopt({
                clientDocument: i.holder.document, clientDocumentType: i.holder.documentType,
              }) : undefined} />
          )}
        </Line>
        <Line label="Nascimento"
          value={editing ? undefined : (i.holder.birthDate ? fmtBR(i.holder.birthDate) : "—")}>
          {editing && editInput(i.holder.birthDate ?? "", (v) => patchHolder({ birthDate: v }))}
        </Line>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Line label="E-mail">
          {editing
            ? editInput(i.holder.email, (v) => patchHolder({ email: v }))
            : <p style={{ fontSize: 12.5, color: T.text, margin: 0, wordBreak: "break-all" }}>{i.holder.email}</p>}
          {!editing && emailDiverges && (
            <Divergence label={lead.email ?? ""} value={i.holder.email} busy={busy}
              onAdopt={onPatch ? adopt({ clientEmail: i.holder.email }) : undefined} />
          )}
        </Line>
        <Line label="Telefone">
          {editing
            ? editInput(i.holder.phone, (v) => patchHolder({ phone: v.replace(/\D/g, "") }))
            : <p style={{ fontSize: 12.5, color: T.text, margin: 0 }}>{prettyPhone(i.holder.phone)}</p>}
          {!editing && phoneDiverges && (
            <Divergence label={prettyPhone(lead.phone)} value={i.holder.phone} busy={busy}
              onAdopt={onPatch ? adopt({ clientPhone: i.holder.phone }) : undefined} />
          )}
        </Line>
      </div>

      {/* Endereço */}
      {editing ? (
        <div style={{ marginBottom: 8 }}>
          <p style={{ ...drawerLabel, marginBottom: 4 }}>Endereço</p>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, marginBottom: 6 }}>
            {editInput(i.holder.address.street, (v) => patchAddress({ street: v }))}
            {editInput(i.holder.address.number, (v) => patchAddress({ number: v }))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            {editInput(i.holder.address.complement ?? "", (v) => patchAddress({ complement: v }))}
            {editInput(i.holder.address.neighborhood, (v) => patchAddress({ neighborhood: v }))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
            {editInput(i.holder.address.city, (v) => patchAddress({ city: v }))}
            {editInput(i.holder.address.state, (v) => patchAddress({ state: v.toUpperCase() }))}
            {editInput(i.holder.address.zipCode, (v) => patchAddress({ zipCode: v }))}
          </div>
        </div>
      ) : (
        <Line label="Endereço" value={addressLine(i.holder.address)} />
      )}

      {/* Acompanhantes */}
      {i.companions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ ...drawerLabel, marginBottom: 4 }}>
            Acompanhantes ({i.companions.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {i.companions.map((c, k) => (
              <div key={k} style={{ ...S.row, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: T.text, flex: 1, minWidth: 0 }}>
                  {c.fullName || <em style={{ color: T.muted }}>sem nome</em>}
                </span>
                <span style={{ fontSize: 10.5, color: T.muted }}>
                  {KIND_LABEL[c.kind] ?? c.kind}
                  {c.birthDate ? ` · ${fmtBR(c.birthDate)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Line label="Placa do veículo">
          {editing
            ? editInput(i.vehiclePlate ?? "", (v) => patchDraft({ vehiclePlate: v.toUpperCase() }))
            : <p style={{ fontSize: 12.5, color: T.text, margin: 0 }}>{i.vehiclePlate || "—"}</p>}
        </Line>
        <Line label="Pagamento escolhido" value={i.payment?.label ?? "—"}>
          {i.payment && i.payment.discountPct > 0 && (
            <p style={{ fontSize: 11, color: T.emerald, margin: "2px 0 0" }}>
              −{i.payment.discountPct}% · R$ {i.payment.valueAtSubmit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          )}
        </Line>
      </div>

      {!!i.pets?.length && (
        <Line label="Pet"
          value={i.pets.map((p) => `${p.name || "sem nome"} · ${p.species}${p.weight ? ` · ${p.weight}kg` : ""}`).join(" · ")} />
      )}

      {i.notes && (
        editing
          ? (
            <div style={{ marginBottom: 8 }}>
              <p style={{ ...drawerLabel, marginBottom: 4 }}>Observações</p>
              <textarea style={{ ...S.input, padding: "6px 9px", fontSize: 12, minHeight: 60 }}
                value={i.notes} disabled={saving}
                onChange={(e) => patchDraft({ notes: e.target.value })} />
            </div>
          )
          : <Line label="Observações" value={i.notes} />
      )}

      {intake.editedBy && (
        <p style={{ fontSize: 10, color: T.muted2, margin: "6px 0 0" }}>
          Corrigido por {intake.editedBy.name} em {fmtBR(String(intake.editedBy.at).slice(0, 10))}.
        </p>
      )}
    </div>
  );
}
