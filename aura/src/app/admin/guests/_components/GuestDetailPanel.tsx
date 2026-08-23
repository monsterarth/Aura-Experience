"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Calendar, ChevronLeft, Edit2, FileText, Home, Merge, Plus, Save } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type { Guest, RateQuoteRecord } from "@/types/aura";
import { GuestService } from "@/services/guest-service";
import { ContactService } from "@/services/contact-service";
import { chatwootSyncOnStayCreated } from "@/app/actions/chatwoot-actions";
import { resolveQuoteValue } from "@/lib/rate-engine";
import { T } from "@/lib/admin-tokens";
import { Button, IconButton, Pill, SegmentedTabs, SkeletonList, EmptyState } from "@/components/aura";
import { GuestFormFields, useFnrhDomains } from "./GuestFormFields";
import { MergeModal } from "./MergeModal";
import { getInitials, LANG_LABELS, LANG_TONE, QUOTE_STATUS, STAY_STATUS, type GuestStayRow, type PanelTab } from "./guest-utils";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "dados", label: "Dados" },
  { id: "estadias", label: "Estadias" },
  { id: "orcamentos", label: "Orçamentos" },
];

export interface GuestDetailPanelProps {
  guest: Guest;
  propertyId: string;
  /** Celular: volta para a lista. */
  onBack: () => void;
  onUpdated: (updated: Guest) => void;
  onMerged: () => void;
  onEditingChange?: (editing: boolean) => void;
  actorId: string;
  actorName: string;
  /** true = dentro do Dialog de tela cheia (celular). */
  embedded?: boolean;
}

/** Ficha do hóspede: dados (ver/editar), histórico de estadias e orçamentos. */
export function GuestDetailPanel({ guest, propertyId, onBack, onUpdated, onMerged, onEditingChange, actorId, actorName, embedded }: GuestDetailPanelProps) {
  const router = useRouter();
  const domains = useFnrhDomains();
  const [tab, setTab] = useState<PanelTab>("dados");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Guest>(guest);
  const [stays, setStays] = useState<GuestStayRow[]>([]);
  const [loadingStays, setLoadingStays] = useState(false);
  const [quotes, setQuotes] = useState<RateQuoteRecord[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => { setFormData(guest); setIsEditing(false); }, [guest]);
  useEffect(() => { onEditingChange?.(isEditing); }, [isEditing, onEditingChange]);

  useEffect(() => {
    if (tab !== "estadias") return;
    let alive = true;
    setLoadingStays(true);
    GuestService.getGuestStays(propertyId, guest.id)
      .then(d => { if (alive) setStays(d); })
      .finally(() => { if (alive) setLoadingStays(false); });
    return () => { alive = false; };
  }, [tab, guest.id, propertyId]);

  // Cotações por vínculo (guestId) E por telefone (leads que ainda não viraram ficha).
  useEffect(() => {
    if (tab !== "orcamentos") return;
    let alive = true;
    setLoadingQuotes(true);
    const qs = new URLSearchParams({ propertyId, guestId: guest.id });
    if (guest.phone) qs.set("phone", guest.phone);
    fetch(`/api/admin/tarifario/quotes?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setQuotes(d?.quotes || []); })
      .catch(() => { if (alive) setQuotes([]); })
      .finally(() => { if (alive) setLoadingQuotes(false); });
    return () => { alive = false; };
  }, [tab, guest.id, guest.phone, propertyId]);

  const set = (field: keyof Guest, value: any) => setFormData(prev => ({ ...prev, [field]: value }));
  const setAddress = (field: string, value: string) => setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
  const setDoc = (field: string, value: string) => setFormData(prev => ({ ...prev, document: { ...prev.document, [field]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const oldPhone = guest.phone;
      const newPhone = formData.phone;
      const phoneChanged = !!oldPhone && !!newPhone && ContactService.formatPhoneId(newPhone) !== ContactService.formatPhoneId(oldPhone);
      // O id pode MUDAR no salvamento: `guests.id` é o documento, e informar o documento
      // numa ficha provisória promove a chave (ou a unifica com a ficha que já tinha esse
      // documento). Daqui para baixo tudo usa o id devolvido — o da tela ficou velho.
      const savedId = await GuestService.upsertGuest(propertyId, formData as any, actorId, actorName);
      if (phoneChanged) {
        const existing = await ContactService.findByPhone(propertyId, newPhone);
        if (existing?.isGuest && existing.guestId && existing.guestId !== savedId) {
          toast.warning(`Este número já está cadastrado para "${existing.name}". Ambos os hóspedes ficarão vinculados a este número.`, { duration: 6000 });
        }
        await ContactService.migrateContactPhone(propertyId, oldPhone, newPhone, formData.fullName, savedId);
      }
      setIsEditing(false);
      onUpdated({ ...formData, id: savedId });
      if (savedId !== guest.id) {
        toast.success("Ficha atualizada e vinculada ao documento.", { description: "O cadastro provisório foi unificado; estadias e contatos acompanharam." });
      } else {
        toast.success("Dados do hóspede atualizados.");
      }
      chatwootSyncOnStayCreated(propertyId, savedId).catch(() => {});
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setFormData(guest); setIsEditing(false); };
  const newStayHref = `/admin/stays/new?guestId=${guest.id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: embedded ? "100%" : undefined, minHeight: 0 }}>
      {/* Cabeçalho */}
      <div style={{ padding: 16, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
        {embedded && <IconButton icon={ChevronLeft} label="Voltar para a lista" size="lg" onClick={onBack} style={{ marginLeft: -6 }} />}
        <span style={{ width: 48, height: 48, borderRadius: 14, background: T.glass2, border: `1px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: T.brandText, flexShrink: 0 }}>
          {getInitials(guest.fullName)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: "-.3px", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guest.fullName}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.muted }}>{guest.document?.type} · {guest.document?.number}</span>
            {guest.preferredLanguage && <Pill tone={LANG_TONE[guest.preferredLanguage] ?? "neutral"} label={LANG_LABELS[guest.preferredLanguage] ?? guest.preferredLanguage} />}
          </div>
        </div>
      </div>

      {/* Ações + abas */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <SegmentedTabs<PanelTab> items={TABS} value={tab} onChange={setTab} size="sm" ariaLabel="Seções da ficha" />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {!isEditing ? (
            <>
              <IconButton icon={Merge} label="Unificar cadastros" variant="secondary" onClick={() => setMergeOpen(true)} />
              <IconButton icon={Plus} label="Nova reserva" variant="soft" tone="brand" onClick={() => router.push(newStayHref)} />
              {tab === "dados" && <Button variant="secondary" size="sm" icon={Edit2} onClick={() => setIsEditing(true)}>Editar</Button>}
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>Cancelar</Button>
              <Button variant="primary" size="sm" icon={Save} onClick={handleSave} loading={saving} loadingText="Salvando…">Salvar</Button>
            </>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, minHeight: 0, overflowY: embedded ? "auto" : "visible", padding: 16, WebkitOverflowScrolling: "touch" }}>
        {tab === "dados" && (
          <GuestFormFields data={formData} disabled={!isEditing} onField={set} onDoc={setDoc} onAddress={setAddress} domains={domains} extended />
        )}

        {tab === "estadias" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: T.muted }}>{stays.length} estadia{stays.length === 1 ? "" : "s"}</span>
              <Button variant="soft" size="sm" icon={Plus} href={newStayHref}>Nova reserva</Button>
            </div>
            {loadingStays ? <SkeletonList rows={3} avatar={false} /> : stays.length === 0 ? (
              <EmptyState compact icon={Calendar} title="Nenhuma estadia registrada" action={{ label: "Nova reserva", icon: Plus, href: newStayHref }} />
            ) : stays.map(s => {
              const st = STAY_STATUS[s.status] ?? { label: s.status, tone: "neutral" as const };
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: T.glass2, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}><Home size={15} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.cabinName}</div>
                    <div style={{ fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums" }}>{format(new Date(s.checkIn), "dd/MM/yy", { locale: ptBR })} → {format(new Date(s.checkOut), "dd/MM/yy", { locale: ptBR })}</div>
                  </div>
                  <Pill tone={st.tone} label={st.label} />
                  <IconButton icon={FileText} label="Ver ficha da estadia" size="sm" href={`/admin/stays/${s.id}`} />
                </div>
              );
            })}
          </div>
        )}

        {tab === "orcamentos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: T.muted }}>{quotes.length} orçamento{quotes.length === 1 ? "" : "s"}</span>
              {/* Wizard do pipeline já semeado com este hóspede (?new=1&guestId=). */}
              <Button variant="soft" size="sm" icon={Plus} href={`/admin/comercial/reservas?new=1&guestId=${guest.id}`}>Novo orçamento</Button>
            </div>
            {loadingQuotes ? <SkeletonList rows={3} avatar={false} /> : quotes.length === 0 ? (
              <EmptyState compact icon={Calculator} title="Nenhum orçamento para este cliente" />
            ) : quotes.map(q => {
              const v = resolveQuoteValue(q);
              const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "neutral" as const };
              return (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: T.glass2, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, flexShrink: 0 }}><Calculator size={15} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                      {format(new Date(`${q.checkIn}T12:00:00`), "dd/MM/yy", { locale: ptBR })} → {format(new Date(`${q.checkOut}T12:00:00`), "dd/MM/yy", { locale: ptBR })}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      {v.value > 0 ? `${v.approximate ? "a partir de " : ""}R$ ${v.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "sem valor calculado"}
                      {q.negotiatedValue != null ? " · negociado" : ""}
                    </div>
                  </div>
                  <Pill tone={st.tone} label={st.label} />
                  <IconButton icon={FileText} label="Abrir no pipeline" size="sm" href={`/admin/comercial/reservas?quoteId=${q.id}`} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MergeModal
        open={mergeOpen}
        primary={guest}
        propertyId={propertyId}
        actorId={actorId}
        actorName={actorName}
        onClose={() => setMergeOpen(false)}
        // A ficha secundária deixou de existir: recarregar a lista, não só a selecionada.
        onSuccess={() => { setMergeOpen(false); onMerged(); }}
      />
    </div>
  );
}
