"use client";

import React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  BedDouble, Calendar, Car, CheckCircle, Clock, Coffee, ExternalLink, FileText, Mail, MapPin, PawPrint, Phone, Plane,
  Plus, Receipt, RefreshCw, RotateCcw, ShoppingCart, Sparkles, Trash2, User, Users,
} from "lucide-react";
import type { FolioItem } from "@/types/aura";
import { PET_HARD_CAP } from "@/lib/pets";
import { validateCPF } from "@/lib/utils-checkin";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import {
  Card, Field, FieldRow, Input, Select, Button, IconButton, Pill, Switch, SectionLabel, DataList, EmptyState,
  type Column, type RowAction,
} from "@/components/aura";
import { renderIcon, type IconLike } from "@/components/aura/icon";
import { bedLabel, COMPANION_LABEL, COMPANION_TONE } from "./stay-detail-utils";
import type { StayDetailState } from "./useStayDetail";


// ── Primitivos locais ─────────────────────────────────────────────────────

/** Valor somente leitura com a mesma altura do input. */
function ReadValue({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div style={{ minHeight: 38, display: "flex", alignItems: "center", fontSize: 14, color: empty ? T.muted2 : T.text, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined, fontStyle: empty ? "italic" : undefined, fontWeight: mono ? 600 : 500 }}>
      {empty ? "—" : children}
    </div>
  );
}

/** Campo com ícone no rótulo; mostra valor fixo quando travado. */
function F({ icon, label, locked, value, mono, children, style }: { icon?: IconLike; label: string; locked: boolean; value?: React.ReactNode; mono?: boolean; children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{icon && renderIcon(icon, 10, { style: { color: T.brandText, opacity: .8 } })}{label}</span>} style={style}>
      {locked ? <ReadValue mono={mono}>{value}</ReadValue> : children}
    </Field>
  );
}

// ── Faixa-resumo ──────────────────────────────────────────────────────────

export function HeroStrip({ s }: { s: StayDetailState }) {
  const { stay, isEditing, isGovOnly, formData, setFormData, cabins, checkInStr, setCheckInStr, checkOutStr, setCheckOutStr, nights, acfDiverges, actualCounts, selectedCabin } = s;
  const bA = stay.counts?.adults ?? 1, bC = stay.counts?.children ?? 0, bB = stay.counts?.babies ?? 0;
  const cell = (icon: IconLike, label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", minWidth: 0 }}>
      <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{renderIcon(icon, 10, { style: { color: T.brandText, opacity: .8 } })}{label}</SectionLabel>
      <div style={{ minWidth: 0 }}>{value}</div>
      {sub && <span style={{ fontSize: 11, color: T.muted, textTransform: "capitalize" }}>{sub}</span>}
    </div>
  );
  const big = (txt: React.ReactNode, mono?: boolean) => <span style={{ fontSize: 18, fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}>{txt}</span>;
  const editDates = isEditing && !isGovOnly;
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 1, background: T.border }}>
        {[
          cell(Calendar, "Check-in", editDates ? <Input type="date" value={checkInStr} onChange={e => setCheckInStr(e.target.value)} fieldSize="sm" /> : big(stay.checkIn ? format(new Date(stay.checkIn), "dd/MM/yy") : "—", true), stay.checkIn ? format(new Date(stay.checkIn), "EEEE", { locale: ptBR }) : ""),
          cell(Calendar, "Check-out", editDates ? <Input type="date" value={checkOutStr} onChange={e => setCheckOutStr(e.target.value)} fieldSize="sm" /> : big(stay.checkOut ? format(new Date(stay.checkOut), "dd/MM/yy") : "—", true), `${nights} noite${nights !== 1 ? "s" : ""}`),
          cell(Users, "Ocupação (ACF)", isEditing ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexWrap: "wrap" }}>
              {([["adults", "Ad", 1], ["children", "Cr", 0], ["babies", "Bb", 0]] as [string, string, number][]).map(([key, lbl, min]) => (
                <label key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: T.muted }}>
                  <Input type="number" min={min} value={formData.counts?.[key] ?? min} onChange={e => setFormData((p: any) => ({ ...p, counts: { ...p.counts, [key]: Math.max(min, +e.target.value) } }))} fieldSize="sm" style={{ width: 52, textAlign: "center" }} />
                  {lbl}
                </label>
              ))}
              {acfDiverges && <Button size="sm" variant="soft" tone="amber" onClick={() => setFormData((p: any) => ({ ...p, counts: actualCounts }))}>↑ Ajustar</Button>}
            </div>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {big(`${formData.counts?.adults ?? 1}A · ${formData.counts?.children ?? 0}C${(formData.counts?.babies ?? 0) > 0 ? ` · ${formData.counts?.babies}B` : ""}`)}
              {acfDiverges && <Pill tone="amber" label="Divergência" />}
            </span>
          ), `reserva: ${bA} ad${bC > 0 ? ` · ${bC} cr` : ""}${bB > 0 ? ` · ${bB} bb` : ""}`),
          cell(BedDouble, "Acomodação", editDates ? (
            <Select value={formData.cabinId ?? ""} onChange={e => setFormData({ ...formData, cabinId: e.target.value })} fieldSize="sm">
              {cabins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          ) : big(stay.cabinName || selectedCabin?.name || "—")),
        ].map((node, i) => <div key={i} style={{ background: T.card }}>{node}</div>)}
      </div>
    </Card>
  );
}

// ── Conta & consumo ───────────────────────────────────────────────────────

export function FolioCard({ s }: { s: StayDetailState }) {
  const { folioItems, loadingFolio, loadFolio, totalFolio, isGovOnly, newFolioItem, setNewFolioItem, handleAddFolioItem, handleDeleteFolioItem, handleToggleFolioStatus } = s;
  const columns: Column<FolioItem>[] = [
    {
      id: "desc", header: "Item / descrição", mobile: "title", priority: 1,
      cell: i => (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: i.status === "paid" ? T.muted : T.text, textDecoration: i.status === "paid" ? "line-through" : "none" }}>{i.description}</span>
          <span style={{ fontSize: 10, color: T.muted, display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={9} /> {i.createdAt ? format(new Date(i.createdAt), "dd/MM HH:mm") : "—"}{i.status === "paid" ? " · pago" : ""}</span>
        </span>
      ),
    },
    { id: "qty", header: "Qtd", align: "center", width: 64, mobile: "meta", nowrap: true, cell: i => <span style={{ color: T.muted, fontWeight: 600 }}>{i.quantity}×</span> },
    { id: "unit", header: "Unit.", align: "right", width: 100, mobile: "meta", nowrap: true, cell: i => <span style={{ color: T.muted, fontVariantNumeric: "tabular-nums" }}>R$ {i.unitPrice.toFixed(2)}</span> },
    { id: "total", header: "Total", align: "right", width: 110, mobile: "trailing", nowrap: true, cell: i => <span style={{ fontWeight: 900, color: T.text, fontVariantNumeric: "tabular-nums" }}>R$ {i.totalPrice.toFixed(2)}</span> },
  ];
  const actions = isGovOnly ? undefined : (i: FolioItem): RowAction<FolioItem>[] => [
    { id: "toggle", label: i.status === "paid" ? "Reabrir" : "Marcar como pago", icon: i.status === "paid" ? RotateCcw : CheckCircle, onClick: r => void handleToggleFolioStatus(r.id, r.status || "pending"), tone: "green" },
    { id: "delete", label: "Estornar", icon: Trash2, danger: true, onClick: r => void handleDeleteFolioItem(r.id, r.description) },
  ];
  return (
    <Card
      pad={0}
      header={{
        icon: Receipt, tone: "brand", title: "Conta & consumo", sub: `${folioItems.length} lançamento${folioItems.length === 1 ? "" : "s"}`,
        aside: (
          <>
            <span style={{ textAlign: "right", lineHeight: 1.1 }}>
              <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>Total</span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 900, color: T.brandText, fontVariantNumeric: "tabular-nums" }}>R$ {totalFolio.toFixed(2)}</span>
            </span>
            <IconButton icon={RefreshCw} label="Atualizar extrato" size="sm" onClick={() => void loadFolio()} loading={loadingFolio} />
          </>
        ),
      }}
    >
      <div className="flex flex-col xl:flex-row gap-4 items-start" style={{ padding: "0 16px 16px" }}>
        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
          <DataList<FolioItem>
            rows={folioItems}
            columns={columns}
            rowKey={i => i.id}
            rowActions={actions}
            density="compact"
            loading={loadingFolio && folioItems.length === 0}
            empty={<EmptyState compact icon={Receipt} title="Nenhum consumo registrado" description="Lançamentos de frigobar, restaurante e extras aparecem aqui." />}
          />
        </div>
        {!isGovOnly && (
          <form onSubmit={e => void handleAddFolioItem(e)} className="w-full xl:w-64 shrink-0" style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.brandText }}><ShoppingCart size={12} /> Lançamento manual</SectionLabel>
            <Field label="Produto / serviço">
              <Input required value={newFolioItem.description} onChange={e => setNewFolioItem({ ...newFolioItem, description: e.target.value })} placeholder="Ex.: lenha extra" />
            </Field>
            <FieldRow cols={2}>
              <Field label="Qtd">
                <Input type="number" min={1} required value={newFolioItem.quantity} onChange={e => setNewFolioItem({ ...newFolioItem, quantity: Number(e.target.value) })} inputMode="numeric" />
              </Field>
              <Field label="R$ unit.">
                <Input type="number" step="0.01" min={0} required value={newFolioItem.unitPrice || ""} onChange={e => setNewFolioItem({ ...newFolioItem, unitPrice: Number(e.target.value) })} inputMode="decimal" />
              </Field>
            </FieldRow>
            <Button type="submit" variant="primary" fullWidth loading={loadingFolio} icon={Plus}>Adicionar à conta</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

// ── Hóspedes & acompanhantes ──────────────────────────────────────────────

export function GuestCard({ s }: { s: StayDetailState }) {
  const { locked, isEditing, isGovOnly, guestData, setGuestData, formData, setFormData, fnrhDomains, fetchAddressByCep, guestId } = s;
  const g = guestData;
  const setG = (patch: any) => setGuestData({ ...g, ...patch });
  const setAddr = (patch: any) => setGuestData({ ...g, address: { ...g.address, ...patch } });
  const companions: any[] = formData.additionalGuests || [];
  const setCompanions = (list: any[]) => setFormData({ ...formData, additionalGuests: list });

  return (
    <Card header={{ icon: Users, tone: "brand", title: "Hóspedes & acompanhantes" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <F icon={User} label="Nome completo" locked={locked} value={g.fullName}>
          <Input value={g.fullName ?? ""} onChange={e => setG({ fullName: e.target.value })} />
        </F>
        <FieldRow cols={2}>
          <F icon={FileText} label="Nascimento" locked={locked} value={g.birthDate ? format(new Date(g.birthDate + "T12:00"), "dd/MM/yyyy") : ""}>
            <Input type="date" value={g.birthDate ?? ""} onChange={e => setG({ birthDate: e.target.value })} />
          </F>
          <F icon={User} label="Gênero" locked={locked} value={fnrhDomains?.generos.find(x => x.id === g.gender)?.label || g.gender}>
            <Select value={g.gender ?? ""} onChange={e => setG({ gender: e.target.value })}>
              <option value="" disabled>Selecione…</option>
              {fnrhDomains?.generos.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </Select>
          </F>
        </FieldRow>
        <F icon={FileText} label="Documento" locked={locked} value={g.document ? `${g.document.type} · ${g.document.number}` : ""}>
          <div style={{ display: "flex", gap: 8 }}>
            <Select value={g.document?.type ?? ""} onChange={e => setG({ document: { ...g.document, type: e.target.value } })} wrapStyle={{ width: 110, flexShrink: 0 }}>
              {fnrhDomains?.tiposDocumento.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
            </Select>
            <Input value={g.document?.number ?? ""} onChange={e => setG({ document: { ...g.document, number: e.target.value } })}
              onBlur={() => { if (g.document?.type === "CPF" && g.document?.number && !validateCPF(g.document.number)) toast.error("CPF inválido"); }} />
          </div>
        </F>
        <FieldRow cols={2}>
          <F icon={Phone} label="WhatsApp / contato" locked={locked} value={g.phone} mono>
            <Input value={g.phone ?? ""} onChange={e => setG({ phone: e.target.value })} inputMode="tel" />
          </F>
          <F icon={Mail} label="E-mail" locked={locked} value={g.email}>
            <Input type="email" value={g.email ?? ""} onChange={e => setG({ email: e.target.value })} />
          </F>
        </FieldRow>
        <FieldRow cols={3}>
          <F icon={MapPin} label="CEP" locked={locked} value={g.address?.zipCode} mono>
            <Input placeholder="00000-000" value={g.address?.zipCode ?? ""} onChange={e => setAddr({ zipCode: e.target.value })} onBlur={e => void fetchAddressByCep(e.target.value)} inputMode="numeric" />
          </F>
          <F icon={MapPin} label="Rua / logradouro" locked={locked} value={g.address?.street} style={{ gridColumn: "span 2" }}>
            <Input value={g.address?.street ?? ""} onChange={e => setAddr({ street: e.target.value })} />
          </F>
          <F icon={MapPin} label="Nº" locked={locked} value={g.address?.number}>
            <Input value={g.address?.number ?? ""} onChange={e => setAddr({ number: e.target.value })} />
          </F>
          <F icon={MapPin} label="Bairro" locked={locked} value={g.address?.neighborhood} style={{ gridColumn: "span 2" }}>
            <Input value={g.address?.neighborhood ?? ""} onChange={e => setAddr({ neighborhood: e.target.value })} />
          </F>
          <F icon={MapPin} label="Cidade" locked={locked} value={g.address?.city} style={{ gridColumn: "span 2" }}>
            <Input value={g.address?.city ?? ""} onChange={e => setAddr({ city: e.target.value })} />
          </F>
          <F icon={MapPin} label="UF" locked={locked} value={g.address?.state}>
            <Input maxLength={2} value={g.address?.state ?? ""} onChange={e => setAddr({ state: e.target.value.toUpperCase() })} />
          </F>
        </FieldRow>
        {guestId && (
          <Link href={`/admin/guests?id=${guestId}`} target="_blank" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: T.brandText, textDecoration: "none" }}>
            Ver no cadastro <ExternalLink size={11} />
          </Link>
        )}

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <SectionLabel>Acompanhantes</SectionLabel>
          {isEditing && !isGovOnly && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["adult", "child", "free"] as const).map(type => (
                <Button key={type} size="sm" variant="soft" tone={COMPANION_TONE[type]} icon={Plus} onClick={() => setCompanions([...companions, { id: Date.now().toString(), type, fullName: "", document: "" }])}>
                  {COMPANION_LABEL[type]}
                </Button>
              ))}
            </div>
          )}
        </div>
        {companions.length === 0 ? (
          <div style={{ padding: "14px", textAlign: "center", border: `1px dashed ${T.border2}`, borderRadius: 12, color: T.muted2, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Sem acompanhantes</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {companions.map((c: any, idx: number) => (
              <div key={c.id ?? idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                <Pill tone={COMPANION_TONE[c.type] ?? "neutral"} label={COMPANION_LABEL[c.type] ?? c.type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {locked ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.fullName || "—"} {c.document && <span style={{ color: T.muted }}>· {c.document}</span>}</span>
                  ) : (
                    <FieldRow cols={2} style={{ gap: 6 }}>
                      <Input value={c.fullName ?? ""} placeholder="Nome" fieldSize="sm" onChange={e => { const u = [...companions]; u[idx] = { ...u[idx], fullName: e.target.value }; setCompanions(u); }} />
                      <Input value={c.document ?? ""} placeholder="Documento" fieldSize="sm" onChange={e => { const u = [...companions]; u[idx] = { ...u[idx], document: e.target.value }; setCompanions(u); }} />
                    </FieldRow>
                  )}
                </div>
                {isEditing && !isGovOnly && <IconButton icon={Trash2} label="Remover acompanhante" size="sm" variant="ghost" tone="red" onClick={() => setCompanions(companions.filter((_: any, i: number) => i !== idx))} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Hospedagem ────────────────────────────────────────────────────────────

function AreaConfigs({ s }: { s: StayDetailState }) {
  const { selectedCabin, formData, setFormData, isEditing, expandedArea, setExpandedArea } = s;
  if (!selectedCabin?.layout?.length) return null;
  const chip = (b: any) => <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.text }}>🛏 {bedLabel(b)}</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><BedDouble size={10} color={T.brandText} /> Montagem</SectionLabel>
      {selectedCabin.layout.map((area: any) => {
        const configs: any[][] = area.configs ?? (area.beds ? [area.beds] : [[]]);
        const fixed = configs.length <= 1;
        const selIdx = (formData.areaConfigs || []).find((ac: any) => ac.areaId === area.id)?.configIndex ?? 0;
        return (
          <div key={area.id} style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: T.glass }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: T.brandText }}>{area.name || area.type}</span>
              {fixed && <Pill tone="brand" label="Padrão" />}
            </div>
            {fixed ? (
              <div style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>{(configs[0] || []).map(chip)}</div>
            ) : expandedArea === area.id ? (
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {configs.map((cfg, idx) => {
                  const lbl = cfg.length ? cfg.map(bedLabel).join(" + ") : `Opção ${String.fromCharCode(65 + idx)}`;
                  const sel = selIdx === idx;
                  const t = toneOf("brand");
                  return (
                    <button key={idx} type="button" className="ak-press ak-focus"
                      onClick={() => { setFormData((p: any) => ({ ...p, areaConfigs: [...(p.areaConfigs || []).filter((ac: any) => ac.areaId !== area.id), { areaId: area.id, configIndex: idx }] })); setExpandedArea(null); }}
                      style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: sel ? t.bg : T.card, border: `1px solid ${sel ? t.border : T.border}`, color: sel ? t.color : T.muted }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${sel ? t.color : T.border2}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sel && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color }} />}</span>
                      🛏 {lbl}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(configs[selIdx] || configs[0] || []).map(chip)}</div>
                {isEditing && <Button size="sm" variant="secondary" onClick={() => setExpandedArea(area.id)}>Alterar</Button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LodgingCard({ s }: { s: StayDetailState }) {
  const { locked, isEditing, isGovOnly, formData, setFormData, petList, maxPets, patchPet, addPet, removePet, togglePet } = s;
  const hk: any[] = formData.housekeepingItems || [];
  return (
    <Card header={{ icon: BedDouble, tone: "amber", title: "Hospedagem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <AreaConfigs s={s} />
        <F icon={FileText} label="Notas de montagem" locked={locked} value={formData.roomSetupNotes}>
          <Input value={formData.roomSetupNotes ?? ""} onChange={e => setFormData({ ...formData, roomSetupNotes: e.target.value })} placeholder="Ex.: berço extra, travesseiro de pena…" />
        </F>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Sparkles size={10} color={T.brandText} /> Pedidos de governança</SectionLabel>
          {isEditing && <Button size="sm" variant="soft" icon={Plus} onClick={() => setFormData({ ...formData, housekeepingItems: [...hk, { id: Date.now().toString(), label: "" }] })}>Pedido</Button>}
        </div>
        {hk.length === 0 && !isEditing ? (
          <p style={{ margin: 0, fontSize: 12, color: T.muted2, fontStyle: "italic", textAlign: "center" }}>Nenhum pedido especial.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hk.map((item: any) => (
              <div key={item.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Input disabled={!isEditing} value={item.label ?? ""} placeholder="Ex.: alérgico a pó…" fieldSize="sm"
                  onChange={e => setFormData({ ...formData, housekeepingItems: hk.map((i: any) => (i.id === item.id ? { ...i, label: e.target.value } : i)) })} />
                {isEditing && <IconButton icon={Trash2} label="Remover pedido" size="sm" variant="ghost" tone="red" onClick={() => setFormData({ ...formData, housekeepingItems: hk.filter((i: any) => i.id !== item.id) })} />}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: formData.cestaBreakfastEnabled ? T.amberBg : T.glass, border: `1px solid ${formData.cestaBreakfastEnabled ? T.amberBorder : T.border}` }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Coffee size={14} color={formData.cestaBreakfastEnabled ? T.amber : T.muted} />
            <span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.text }}>Cesta café da manhã</span>
              <span style={{ display: "block", fontSize: 10, color: T.muted }}>{formData.cestaBreakfastEnabled ? "Habilitada via portal" : "Padrão da propriedade"}</span>
            </span>
          </span>
          <Switch checked={!!formData.cestaBreakfastEnabled} disabled={locked || isGovOnly} onChange={v => setFormData({ ...formData, cestaBreakfastEnabled: v })} label="Cesta café da manhã" />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <SectionLabel style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><PawPrint size={10} color={T.brandText} /> Pet{petList.length > 1 ? `s (${petList.length})` : ""}</SectionLabel>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {petList.length > maxPets && <Pill tone="amber" label={`Acima do limite (${maxPets})`} />}
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>Com pet?</span>
            <Switch checked={!!formData.hasPet} disabled={locked} onChange={() => togglePet()} label="Com pet" />
          </span>
        </div>
        {formData.hasPet && petList.map((pet: any, idx: number) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: idx > 0 ? 10 : 0, borderTop: idx > 0 ? `1px solid ${T.border}` : "none" }}>
            {petList.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: T.orange }}>Pet {idx + 1}</span>
                {isEditing && !isGovOnly && <IconButton icon={Trash2} label="Remover pet" size="sm" variant="ghost" tone="red" onClick={() => removePet(idx)} />}
              </div>
            )}
            <F icon={PawPrint} label="Nome do pet" locked={locked} value={pet.name}>
              <Input value={pet.name || ""} onChange={e => patchPet(idx, { name: e.target.value })} />
            </F>
            <FieldRow cols={2}>
              <F icon={PawPrint} label="Espécie" locked={locked} value={pet.species}>
                <Select value={pet.species || "Cachorro"} onChange={e => patchPet(idx, { species: e.target.value })}>
                  <option>Cachorro</option><option>Gato</option><option>Outro</option>
                </Select>
              </F>
              <F icon={PawPrint} label="Peso (kg)" locked={locked} value={pet.weight ? `${pet.weight} kg` : ""}>
                <Input type="number" value={pet.weight || ""} onChange={e => patchPet(idx, { weight: Number(e.target.value) })} inputMode="decimal" />
              </F>
            </FieldRow>
            <F icon={PawPrint} label="Raça" locked={locked} value={pet.breed}>
              <Input value={pet.breed || ""} onChange={e => patchPet(idx, { breed: e.target.value })} />
            </F>
          </div>
        ))}
        {formData.hasPet && isEditing && !isGovOnly && petList.length < PET_HARD_CAP && (
          <Button variant="outline" tone="orange" icon={Plus} fullWidth onClick={addPet}>Pet</Button>
        )}
      </div>
    </Card>
  );
}

// ── Viagem & carro ────────────────────────────────────────────────────────

export function TravelCard({ s }: { s: StayDetailState }) {
  const { locked, formData, setFormData, fnrhDomains } = s;
  return (
    <Card header={{ icon: Plane, tone: "violet", title: "Viagem & carro" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FieldRow cols={2}>
          <F icon={Plane} label="Motivo da viagem" locked={locked} value={fnrhDomains?.motivos.find(m => m.id === formData.travelReason)?.label || formData.travelReason}>
            <Select value={formData.travelReason ?? ""} onChange={e => setFormData({ ...formData, travelReason: e.target.value })}>
              <option value="" disabled>Selecione…</option>
              {fnrhDomains?.motivos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </F>
          <F icon={Car} label="Transporte" locked={locked} value={fnrhDomains?.transportes.find(t => t.id === formData.transportation)?.label || formData.transportation}>
            <Select value={formData.transportation ?? ""} onChange={e => setFormData({ ...formData, transportation: e.target.value })}>
              <option value="" disabled>Selecione…</option>
              {fnrhDomains?.transportes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </F>
        </FieldRow>
        {["CARRO", "MOTO"].includes(formData.transportation || "") && (
          <F icon={Car} label="Placa do veículo" locked={locked} value={formData.vehiclePlate} mono>
            <Input value={formData.vehiclePlate ?? ""} onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
          </F>
        )}
        <FieldRow cols={2}>
          <F icon={MapPin} label="Origem" locked={locked} value={formData.lastCity}>
            <Input value={formData.lastCity ?? ""} onChange={e => setFormData({ ...formData, lastCity: e.target.value })} placeholder="Cidade/UF" />
          </F>
          <F icon={MapPin} label="Próximo destino" locked={locked} value={formData.nextCity}>
            <Input value={formData.nextCity ?? ""} onChange={e => setFormData({ ...formData, nextCity: e.target.value })} placeholder="Cidade/UF" />
          </F>
        </FieldRow>
      </div>
    </Card>
  );
}
