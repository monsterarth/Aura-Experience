// src/app/admin/stays/new/page.tsx
"use client";

import React, { Suspense } from "react";
import { Calendar as CalendarIcon, Check, Home, Key, Map, PlusCircle, Search, Trash2, Users, UserSearch } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { T } from "@/lib/admin-tokens";
import {
  PageShell, PageHeader, Card, Field, FieldRow, Input, Select, Button, IconButton, Switch, Pill, FilterChips,
  SectionLabel, EmptyState, Dialog, BottomActionBar, PageSkeleton, Skeleton,
} from "@/components/aura";
import { useNewStay, type Lang } from "./_components/useNewStay";

const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português (PT)" },
  { id: "en", label: "English (EN)" },
  { id: "es", label: "Español (ES)" },
];

function NewStayContent() {
  const s = useNewStay();
  const { property, internalUse, guestData, setGuestData } = s;
  const nights = s.dateRange?.from && s.dateRange?.to ? Math.max(0, Math.round((s.dateRange.to.getTime() - s.dateRange.from.getTime()) / 86400000)) : 0;
  const submit = <Button variant="primary" size="lg" icon={Check} onClick={() => void s.handleCreate()} loading={s.loading} loadingText="Criando…" disabled={!property?.id} fullWidth>Confirmar reserva</Button>;

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/admin/stays", label: "Estadias" }}
        icon={PlusCircle}
        title="Nova hospedagem"
        subtitle={property?.name ?? "Carregando…"}
      />

      <form onSubmit={e => void s.handleCreate(e)} className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
          {/* Identificação */}
          <Card header={{ icon: UserSearch, tone: "brand", title: "Identificação", sub: internalUse ? "uso da casa: hóspede opcional" : "titular da reserva" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Documento" hint="Opcional — ao sair do campo buscamos o cadastro">
                <div style={{ display: "flex", gap: 8 }}>
                  <Select value={s.docType} onChange={e => s.setDocType(e.target.value)} wrapStyle={{ width: 130, flexShrink: 0 }}>
                    <option value="CPF">CPF</option>
                    <option value="PASSAPORTE">Passaporte</option>
                    <option value="RG">RG</option>
                    <option value="CNH">CNH</option>
                    <option value="OUTRO">Outro</option>
                  </Select>
                  <Input value={s.docNumber} onChange={e => s.setDocNumber(e.target.value)} onBlur={() => void s.handleSearchGuest()} placeholder="Nº do documento…" inputMode="numeric" />
                  <IconButton icon={Search} label="Buscar cadastro" variant="soft" tone="brand" onClick={() => void s.handleSearchGuest()} loading={s.searchingGuest} />
                </div>
              </Field>
              <FieldRow cols={2}>
                <Field label={`Nome do titular${internalUse ? " (opcional)" : ""}`} required={!internalUse}>
                  <Input required={!internalUse} value={guestData.fullName} onChange={e => setGuestData({ ...guestData, fullName: e.target.value.toUpperCase() })} placeholder="NOME COMPLETO" autoComplete="off" />
                </Field>
                <Field label={`WhatsApp${internalUse ? " (opcional)" : ""}`} required={!internalUse} hint="DDI + DDD + número (Brasil = 55)">
                  <div style={{ display: "flex", alignItems: "stretch" }}>
                    <span style={{ display: "flex", alignItems: "center", padding: "0 0 0 12px", borderRadius: "10px 0 0 10px", border: `1px solid ${T.border2}`, borderRight: "none", background: T.glass2, color: T.muted, fontWeight: 800, fontSize: 14 }}>+</span>
                    <Input type="tel" inputMode="numeric" aria-label="Código do país (DDI)" required={!internalUse} value={s.phoneCountry.replace(/\D/g, "")} onChange={e => s.setPhoneCountry(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="55" title="Código do país (DDI). Brasil = 55." style={{ width: 64, borderRadius: 0, textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
                    <Input type="tel" inputMode="tel" autoComplete="tel" aria-label="Número do WhatsApp (com DDD)" required={!internalUse} value={(guestData.phone ?? "").replace(/\D/g, "")} onChange={e => setGuestData({ ...guestData, phone: e.target.value.replace(/\D/g, "") })} placeholder="53 98116-9216" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "none", fontVariantNumeric: "tabular-nums" }} />
                  </div>
                </Field>
                <Field label="E-mail (opcional)">
                  <Input type="email" inputMode="email" value={guestData.email} onChange={e => setGuestData({ ...guestData, email: e.target.value })} autoComplete="off" />
                </Field>
                <Field label="Idioma de comunicação">
                  <Select value={guestData.preferredLanguage} onChange={e => setGuestData({ ...guestData, preferredLanguage: e.target.value as Lang })}>
                    {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </Select>
                </Field>
              </FieldRow>
            </div>
          </Card>

          {/* ACF por cabana */}
          {s.cabinSelections.length > 0 && (
            <Card header={{ icon: Users, tone: "blue", title: "Configuração ACF", sub: "adultos, crianças e bebês por cabana", aside: <Pill tone="blue" label={`${s.cabinSelections.length} cabana${s.cabinSelections.length > 1 ? "s" : ""}`} /> }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.cabinSelections.map((sel, idx) => (
                  <div key={sel.cabinId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                    <span style={{ flex: "1 1 140px", minWidth: 0, fontSize: 14, fontWeight: 800, color: T.text }}>{sel.name}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      {([["adults", "Adultos", 1], ["children", "Crianças", 0], ["babies", "Bebês", 0]] as ["adults" | "children" | "babies", string, number][]).map(([key, lbl, min]) => (
                        <label key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: T.muted }}>
                          <Input type="number" min={min} inputMode="numeric" value={sel[key]} onChange={e => s.updateCabinACF(idx, key, Math.max(min, parseInt(e.target.value) || min))} fieldSize="sm" style={{ width: 60, textAlign: "center", fontWeight: 800, color: key === "adults" ? T.brandText : T.text }} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    <IconButton icon={Trash2} label={`Remover ${sel.name}`} variant="ghost" tone="red" onClick={() => s.toggleCabin({ id: sel.cabinId, name: sel.name })} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-4 min-w-0">
          {/* Cabanas */}
          <Card header={{ icon: Home, tone: "green", title: "Unidades", sub: "toque para selecionar uma ou mais" }}>
            {s.loadingCabins ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} w={96} h={34} radius={9} />)}</div>
            ) : s.availableCabins.length === 0 ? (
              <EmptyState compact icon={Home} title="Nenhuma cabana nesta propriedade" />
            ) : (
              <FilterChips
                multiple
                scroll={false}
                ariaLabel="Cabanas"
                items={s.availableCabins.map(c => ({ id: c.id, label: c.name }))}
                values={s.cabinSelections.map(c => c.cabinId)}
                onChange={ids => s.setSelectedCabinIds(ids)}
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}
              />
            )}
            {s.availableCabins.length > 0 && s.cabinSelections.length === 0 && (
              <p style={{ margin: "12px 0 0", fontSize: 12, color: T.amber, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 10, padding: "8px 10px", lineHeight: 1.45 }}>
                Nenhuma cabana selecionada: a reserva nasce sem acomodação e pode ser atribuída depois no mapa.
              </p>
            )}
          </Card>

          {/* Período e opções */}
          <Card header={{ icon: CalendarIcon, tone: "brand", title: "Período", sub: nights > 0 ? `${nights} noite${nights > 1 ? "s" : ""}` : "selecione entrada e saída", aside: undefined }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="ak-press ak-focus" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: `1px solid ${T.border2}`, background: T.glass, color: T.text, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <CalendarIcon size={20} color={T.brandText} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 800 }}><span style={{ display: "inline-block", width: 60, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted }}>Entrada</span>{s.dateRange?.from ? format(s.dateRange.from, "dd/MM/yy", { locale: ptBR }) : "—"}</span>
                      <span style={{ fontSize: 13, fontWeight: 800 }}><span style={{ display: "inline-block", width: 60, fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted }}>Saída</span>{s.dateRange?.to ? format(s.dateRange.to, "dd/MM/yy", { locale: ptBR }) : "—"}</span>
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center" style={{ background: T.elev, borderColor: T.border2, borderRadius: 16 }}>
                  <Calendar
                    initialFocus mode="range" numberOfMonths={1} locale={ptBR}
                    defaultMonth={s.dateRange?.from || new Date()} selected={s.dateRange} onSelect={s.setDateRange}
                    disabled={(date: Date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: internalUse ? T.amberBg : T.glass, border: `1px solid ${internalUse ? T.amberBorder : T.border}` }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.text }}>Reserva de uso da casa</span>
                    <span style={{ display: "block", fontSize: 10, color: T.muted, lineHeight: 1.4 }}>Ocupação interna — não é cliente, hóspede opcional, sem comunicação automática</span>
                  </span>
                  <Switch checked={internalUse} onChange={s.toggleInternalUse} label="Reserva de uso da casa" />
                </div>
                {internalUse && (
                  <Field label="Identificação interna (opcional)">
                    <Input value={s.internalLabel} onChange={e => s.setInternalLabel(e.target.value)} placeholder="Ex.: manutenção cabana 5, família, bloqueio" />
                  </Field>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: T.glass, border: `1px solid ${T.border}` }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.text }}>Comunicação automática de WhatsApp</span>
                    <span style={{ display: "block", fontSize: 10, color: T.muted, lineHeight: 1.4 }}>Interruptor mestre — desligado, nenhuma mensagem automática é enviada</span>
                  </span>
                  <Switch checked={s.sendAutomations} onChange={s.setSendAutomations} label="Comunicação automática" />
                </div>
              </div>

              <div className="ak-hide-mobile">{submit}</div>
            </div>
          </Card>
        </aside>
        <div className="ak-only-mobile"><BottomActionBar note={nights > 0 ? `${nights} noite${nights > 1 ? "s" : ""} · ${s.cabinSelections.length} cabana${s.cabinSelections.length === 1 ? "" : "s"}` : undefined}>{submit}</BottomActionBar></div>
      </form>

      {/* Sucesso */}
      <Dialog open={!!s.createdInfo} onClose={() => s.router.push("/admin/stays")} presentation="auto" size="sm" hideClose dismissible={false} closeOnEscape={false} ariaLabel="Reserva criada"
        footer={(
          <>
            <Button variant="secondary" onClick={() => s.router.push("/admin/stays")}>Estadias</Button>
            <Button variant="primary" icon={Map} onClick={() => s.router.push("/admin/reservation-map")}>Mapa</Button>
          </>
        )}
      >
        <div className="ak-empty" data-compact style={{ padding: "12px 0 4px" }}>
          <span className="ak-empty__icon" style={{ width: 64, height: 64, background: T.greenBg, borderColor: T.greenBorder, color: T.green }}><Key size={28} /></span>
          <div className="ak-empty__title" style={{ fontSize: 20 }}>Reserva criada!</div>
          <div className="ak-empty__desc">Hospedagem registrada no Aura. Este é o código de acesso do hóspede:</div>
          <div style={{ marginTop: 14, padding: "16px 24px", borderRadius: 16, background: T.glass, border: `1px solid ${T.border}`, width: "100%" }}>
            <SectionLabel style={{ textAlign: "center", letterSpacing: ".3em" }}>Aura access code</SectionLabel>
            <div style={{ fontSize: 40, fontWeight: 900, color: T.brandText, letterSpacing: "-.02em", textAlign: "center", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{s.createdInfo?.code}</div>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}

export default function NewStayPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "manager"]}>
      <Suspense fallback={<PageShell><PageSkeleton kpis={0} rows={4} /></PageShell>}>
        <NewStayContent />
      </Suspense>
    </RoleGuard>
  );
}
