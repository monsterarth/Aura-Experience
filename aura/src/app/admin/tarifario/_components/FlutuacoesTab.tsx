// Aba Flutuações — atribui um PRESET de flutuação (Configurações → Comercial)
// a um intervalo de datas. É o que alimenta o modo "Automática" da cotação:
// cada noite flutua pelo % da regra que a cobre, e a média aparece pro
// vendedor. RECEPÇÃO PODE editar aqui — toda escrita é auditada no servidor.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Percent, Plus, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/aura";
import { T } from "@/lib/admin-tokens";
import type { RateBundle } from "@/services/rate-service";
import { formatDateBR } from "@/lib/rate-engine";
import { S, pillS } from "@/app/admin/comercial/_components/shared";

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

const EMPTY = { id: undefined as string | undefined, presetId: "", startDate: "", endDate: "" };

export function FlutuacoesTab({ propertyId, bundle, onRefresh }: {
  propertyId: string;
  bundle: RateBundle;
  onRefresh: () => Promise<void> | void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ name: string; startDate: string; endDate: string }[] | null>(null);

  // Sempre por %: mesma ordem do editor em Configurações e do select da cotação.
  const presets = useMemo(
    () => [...(bundle.settings.fluctuations || [])].sort((a, b) => a.pct - b.pct),
    [bundle.settings.fluctuations]
  );
  const rules = useMemo(
    () => [...(bundle.fluctuations ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [bundle.fluctuations]
  );
  const today = new Date().toISOString().slice(0, 10);

  // Migration pendente: a aba explica em vez de quebrar.
  if (bundle.fluctuations === null) {
    return (
      <div style={{
        border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "48px 24px",
        textAlign: "center", color: T.muted, fontSize: 13, maxWidth: 560, margin: "0 auto",
      }}>
        <Percent size={22} style={{ margin: "0 auto 10px", display: "block", color: T.muted }} />
        Flutuações por período ainda não estão disponíveis — aplique a migration
        <code style={{ color: T.text }}> tarifario_phase4_flutuacoes_arquivo.sql</code> no
        SQL Editor do Supabase.
      </div>
    );
  }

  const save = async (mode: "strict" | "overwrite" | "fill") => {
    if (!form.presetId) return toast.error("Escolha a flutuação.");
    if (!form.startDate || !form.endDate) return toast.error("Preencha o período.");
    if (form.startDate > form.endDate) return toast.error("Data inicial maior que a final.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/fluctuations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, mode, rule: form }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      if (data?.conflict?.length) { setConflicts(data.conflict); return; }
      if (mode === "fill" && data?.created === 0) {
        toast.info("Não há dias vazios para preencher neste período.");
        setConflicts(null);
        return;
      }
      toast.success(data?.created > 1 ? `Flutuação aplicada em ${data.created} trechos livres.` : "Flutuação aplicada ao período.");
      setForm(EMPTY);
      setConflicts(null);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/admin/tarifario/fluctuations?id=${id}&propertyId=${propertyId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success("Flutuação removida do período.");
      await onRefresh();
    } catch {
      toast.error("Erro ao remover.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <p style={{ fontSize: 12.5, color: T.muted, margin: 0, lineHeight: 1.6 }}>
        Atribua uma flutuação de ocupação a um intervalo de datas — a cotação em modo{" "}
        <b style={{ color: T.text }}>Automática</b> aplica o % de cada noite sozinha e mostra a média
        ao vendedor. Noite sem regra = 0%. O % fica <b style={{ color: T.text }}>congelado</b> na
        atribuição: editar o preset depois não muda períodos já atribuídos.
      </p>

      {/* Form: preset + período (sem % livre — o sinal vive no preset) */}
      <div style={{ ...S.card, padding: 16 }}>
        {presets.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
            Nenhuma flutuação cadastrada ainda — cadastre as opções (nome e %) em{" "}
            <Link href="/admin/configuracoes/comercial" style={{ color: T.g1, textDecoration: "underline", textUnderlineOffset: 2 }}>
              Configurações → Comercial
            </Link>.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={fieldLabel}>Flutuação</label>
              <select style={{ ...S.input, background: T.card }} value={form.presetId}
                onChange={(e) => setForm({ ...form, presetId: e.target.value })}>
                <option value="">Selecione…</option>
                {presets.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.pct > 0 ? "+" : ""}{f.pct}%)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Primeira noite</label>
              <input type="date" style={{ ...S.input, width: 150 }} value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label style={fieldLabel}>Última noite</label>
              <input type="date" style={{ ...S.input, width: 150 }} value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <button disabled={saving} onClick={() => save("strict")}
              style={{ ...S.gradBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {form.id ? "Atualizar" : "Aplicar"}
            </button>
            {form.id && (
              <button onClick={() => setForm(EMPTY)} style={{ ...S.ghostBtn, padding: "8px 11px" }}>
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rules.length === 0 && presets.length > 0 && (
          <p style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "14px 0", margin: 0 }}>
            Nenhum período com flutuação — a cotação Automática usa 0% em tudo.
          </p>
        )}
        {rules.map((f) => {
          const past = f.endDate < today;
          const busy = busyId === f.id;
          return (
            <div key={f.id} style={{
              ...S.row, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10,
              opacity: past ? 0.55 : 1,
            }}>
              <span style={pillS(
                f.pct > 0 ? T.amberBg : T.emeraldBg,
                f.pct > 0 ? T.amber : T.emerald,
                f.pct > 0 ? T.amberBorder : T.emeraldBorder
              )}>
                {f.pct > 0 ? "+" : ""}{f.pct}%
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {f.name || "Flutuação"}
                </p>
                <p style={{ fontSize: 10.5, color: T.muted, margin: "2px 0 0" }}>
                  {formatDateBR(f.startDate)} a {formatDateBR(f.endDate)}
                  {f.createdByName ? ` · por ${f.createdByName}` : ""}
                </p>
              </div>
              <button onClick={() => setForm({ id: f.id, presetId: f.presetId || "", startDate: f.startDate, endDate: f.endDate })}
                title="Reatribuir este período" disabled={busy}
                style={{ ...S.ghostBtn, padding: "6px 10px", fontSize: 10.5 }}>
                Editar
              </button>
              <button onClick={() => remove(f.id)} disabled={busy} title="Remover"
                style={{ padding: 5, borderRadius: 8, background: "none", border: "none", color: T.red, cursor: "pointer", display: "flex", flexShrink: 0 }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          );
        })}
      </div>

      {/* Conflito — mesmos modos das regras de calendário */}
      <Dialog open={!!conflicts} onClose={() => setConflicts(null)} presentation="auto" size="sm" title="Período já tem flutuação" iconTone="red">
        {conflicts && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 140, overflowY: "auto" }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ ...S.row, padding: "7px 11px", fontSize: 12, color: T.text }}>
                  <b>{c.name}</b> · {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => save("overwrite")}
                style={{
                  border: `1px solid ${T.redBorder}`, background: T.redBg, borderRadius: 13,
                  padding: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                }}>
                <p style={{ fontSize: 12.5, fontWeight: 900, color: T.red, margin: 0 }}>Sobrepor</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "3px 0 0" }}>
                  Apara as antigas nessas datas e impõe a nova.
                </p>
              </button>
              <button onClick={() => save("fill")}
                style={{
                  border: `1px solid ${T.blueBorder}`, background: T.blueBg, borderRadius: 13,
                  padding: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                }}>
                <p style={{ fontSize: 12.5, fontWeight: 900, color: T.blue, margin: 0 }}>Preencher vazios</p>
                <p style={{ fontSize: 11, color: T.muted, margin: "3px 0 0" }}>
                  Mantém o que existe e aplica só nos dias livres.
                </p>
              </button>
            </div>
            $1          </div>)}
      </Dialog>
    </div>
  );
}
