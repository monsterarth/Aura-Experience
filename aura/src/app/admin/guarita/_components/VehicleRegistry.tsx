"use client";

// Cadastro de placas — a tela que faltava.
//
// A ideia que organiza o módulo inteiro é "a placa é CADASTRO, não anotação do
// dia": quando o guarita digita, o sistema responde de quem é o carro. Só que o
// cadastro não tinha onde ser visto nem corrigido — o painel mostrava apenas as
// placas MARCADAS. Um dono digitado errado ficava errado para sempre, e ninguém
// conseguia responder "por que este carro é isento?".
//
// A maior parte das linhas nasce sozinha no portão. Aqui se corrige, se vincula
// (a pessoa da equipe, o fornecedor do cadastro de Compras) e se marca.
import React, { useCallback, useEffect, useState } from "react";
import { Car, Pencil, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  T, Card, Button, Dialog, Field, FieldRow, Input, Pill,
  SearchInput, FilterChips, EmptyState, SkeletonList,
} from "@/components/aura";
import type { Vehicle, VehicleKind, VehicleStatus } from "@/types/aura";

interface Targets {
  staff: { id: string; name: string; role: string; plate: string | null }[];
  suppliers: { id: string; name: string }[];
}

const KIND_LABEL: Record<VehicleKind, string> = {
  guest: "Hóspede", visitor: "Visita", supplier: "Fornecedor", staff: "Equipe", customer: "Cliente",
};
const KIND_TONE: Record<VehicleKind, "brand" | "green" | "amber" | "neutral" | "red"> = {
  guest: "brand", visitor: "brand", supplier: "amber", staff: "neutral", customer: "green",
};
const STATUS_LABEL: Record<VehicleStatus, string> = {
  normal: "Normal", whitelist: "Sempre liberado", blacklist: "Atenção",
};

const displayPlate = (p: string) => (p?.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p ?? "");
const normalize = (p: string) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Draft = Partial<Vehicle> & { plate: string };

export function VehicleRegistry({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<Vehicle[] | null>(null);
  const [total, setTotal] = useState(0);
  const [targets, setTargets] = useState<Targets>({ staff: [], suppliers: [] });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<VehicleKind | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ propertyId, section: "vehicles", kind });
    if (search.trim()) qs.set("search", search.trim());
    try {
      const res = await fetch(`/api/admin/guarita?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao carregar o cadastro.");
      setRows(json.vehicles ?? []);
      setTotal(json.total ?? 0);
      setTargets(json.targets ?? { staff: [], suppliers: [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o cadastro.");
      setRows([]);
    }
  }, [propertyId, search, kind]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    const plate = normalize(draft.plate);
    if (plate.length < 6) { toast.error("Placa incompleta."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guarita", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action: "upsert_vehicle", ...draft, plate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao salvar.");
      toast.success("Cadastro salvo.");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  // O vínculo é o que faz o carro se identificar sozinho na próxima entrada.
  const linkOf = (v: Vehicle) => {
    if (v.staffId) return targets.staff.find(s => s.id === v.staffId)?.name ?? null;
    if (v.supplierId) return targets.suppliers.find(s => s.id === v.supplierId)?.name ?? null;
    return null;
  };

  return (
    <>
      <Card
        header={{
          icon: Car, tone: "brand", title: "Cadastro de placas",
          sub: rows ? `${total} placa${total === 1 ? "" : "s"} · a maioria nasce sozinha no portão` : "carregando",
          aside: (
            <Button size="sm" icon={Plus} onClick={() => setDraft({ plate: "", kind: "customer" })}>
              Nova placa
            </Button>
          ),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SearchInput
            value={search} onChange={setSearch} debounce={300} fullWidth
            placeholder="Placa, dono ou modelo"
          />
          <FilterChips
            value={kind} onChange={setKind}
            items={[
              { id: "all", label: "Todas" },
              ...(Object.keys(KIND_LABEL) as VehicleKind[]).map(k => ({ id: k, label: KIND_LABEL[k] })),
            ]}
          />

          {!rows ? (
            <SkeletonList rows={4} avatar={false} />
          ) : rows.length === 0 ? (
            <EmptyState
              compact icon={Car}
              title={search || kind !== "all" ? "Nada com esse filtro" : "Nenhuma placa cadastrada"}
              description={
                search || kind !== "all"
                  ? "Tente outra busca ou volte para todas."
                  : "As placas aparecem aqui conforme entram pela guarita — ou cadastre uma agora."
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map(v => {
                const link = linkOf(v);
                return (
                  <button
                    key={v.id} onClick={() => setDraft({ ...v })}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
                      borderRadius: 12, background: T.glass, border: `1px solid ${T.border}`,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%",
                      color: T.text, minHeight: 56,
                    }}
                  >
                    <span style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 14.5, fontWeight: 700,
                      letterSpacing: ".08em", flexShrink: 0, minWidth: 96,
                    }}>{displayPlate(v.plate)}</span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {link ?? v.ownerName ?? <span style={{ color: T.muted2, fontStyle: "italic" }}>sem dono</span>}
                      </span>
                      {(v.model || v.color) && (
                        <span style={{ display: "block", fontSize: 11.5, color: T.muted }}>
                          {[v.model, v.color].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>

                    {v.status !== "normal" && (
                      <Pill tone={v.status === "blacklist" ? "amber" : "green"} size="sm" icon={ShieldAlert}>
                        {STATUS_LABEL[v.status as VehicleStatus]}
                      </Pill>
                    )}
                    <Pill tone={KIND_TONE[v.kind as VehicleKind]} size="sm">{KIND_LABEL[v.kind as VehicleKind]}</Pill>
                    <Pencil size={14} style={{ color: T.muted2, flexShrink: 0 }} />
                  </button>
                );
              })}
              {total > rows.length && (
                <div style={{ fontSize: 11.5, color: T.muted2, textAlign: "center", padding: "6px 0" }}>
                  Mostrando {rows.length} de {total} — use a busca para chegar ao resto.
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.id ? displayPlate(draft.plate) : "Nova placa"}
        subtitle={draft?.id ? "Corrigir o cadastro" : "Cadastrar antes de o carro chegar"}
        icon={Car} size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={save} loading={saving}>Salvar</Button>
          </>
        }
      >
        {draft && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!draft.id && (
              <Field label="Placa" required>
                <Input
                  value={draft.plate}
                  onChange={e => setDraft({ ...draft, plate: normalize(e.target.value).slice(0, 7) })}
                  placeholder="ABC1D23" style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".1em" }}
                />
              </Field>
            )}

            <Field label="Tipo" hint="O tipo não decide cobrança — quem dispensa é o guarita, na hora.">
              <FilterChips
                value={(draft.kind as VehicleKind) ?? "customer"}
                onChange={k => setDraft({ ...draft, kind: k, staffId: null, supplierId: null })}
                items={(Object.keys(KIND_LABEL) as VehicleKind[]).map(k => ({ id: k, label: KIND_LABEL[k] }))}
              />
            </Field>

            {draft.kind === "staff" && (
              <Field label="Quem da equipe" hint="Vinculado, o carro é reconhecido sozinho na portaria.">
                <select
                  className="field-input"
                  value={draft.staffId ?? ""}
                  onChange={e => setDraft({ ...draft, staffId: e.target.value || null })}
                >
                  <option value="">— sem vínculo —</option>
                  {targets.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}

            {draft.kind === "supplier" && (
              <Field
                label="Qual fornecedor"
                hint={targets.suppliers.length === 0
                  ? "Sem cadastro de fornecedores nesta pousada — use o nome do dono abaixo."
                  : "Do cadastro de Compras."}
              >
                <select
                  className="field-input"
                  value={draft.supplierId ?? ""}
                  onChange={e => setDraft({ ...draft, supplierId: e.target.value || null })}
                  disabled={targets.suppliers.length === 0}
                >
                  <option value="">— sem vínculo —</option>
                  {targets.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}

            <FieldRow>
              <Field label="Dono">
                <Input
                  value={draft.ownerName ?? ""}
                  onChange={e => setDraft({ ...draft, ownerName: e.target.value })}
                  placeholder="Nome de quem dirige"
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={draft.ownerPhone ?? ""}
                  onChange={e => setDraft({ ...draft, ownerPhone: e.target.value })}
                  placeholder="55489…"
                />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Modelo">
                <Input
                  value={draft.model ?? ""}
                  onChange={e => setDraft({ ...draft, model: e.target.value })}
                  placeholder="Onix, Hilux…"
                />
              </Field>
              <Field label="Cor">
                <Input
                  value={draft.color ?? ""}
                  onChange={e => setDraft({ ...draft, color: e.target.value })}
                  placeholder="Prata"
                />
              </Field>
            </FieldRow>

            <Field label="Observações" hint="Aparece para o guarita na entrada.">
              <Input
                value={draft.notes ?? ""}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Ex.: entrega toda terça de manhã"
              />
            </Field>

            {draft.id && draft.status !== "normal" && (
              <div style={{
                display: "flex", gap: 10, padding: "11px 13px", borderRadius: 12,
                background: draft.status === "blacklist" ? T.amberBg : T.greenBg,
                border: `1px solid ${draft.status === "blacklist" ? T.amberBorder : T.greenBorder}`,
                fontSize: 12.5, lineHeight: 1.5,
              }}>
                <ShieldAlert size={16} style={{ color: draft.status === "blacklist" ? T.amber : T.green, flexShrink: 0 }} />
                <span>
                  <b>{STATUS_LABEL[draft.status as VehicleStatus]}</b>
                  {draft.statusReason ? ` — ${draft.statusReason}` : ""}
                  <span style={{ color: T.muted }}> · a marcação é alterada no card de placas marcadas.</span>
                </span>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
