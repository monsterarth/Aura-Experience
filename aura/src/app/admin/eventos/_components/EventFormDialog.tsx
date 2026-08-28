"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Globe, Star, CheckCircle2 } from "lucide-react";
import type { Event, EventCategory, EventStatus, EventType } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, SegmentedTabs, FilterChips, Field, FieldRow, Input, Select, Textarea, Switch, Button, useIsMobile } from "@/components/aura";
import { CATEGORY_ICONS, CATEGORY_LABELS, FORM_CATEGORIES, TYPE_LABELS } from "./eventos-utils";

type Lang = "pt" | "en" | "es";

export function EventFormDialog({ open, editing, form, setForm, saving, onClose, onSave }: {
  open: boolean;
  editing: Event | null;
  form: Partial<Event>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Event>>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const isMobile = useIsMobile();
  const [lang, setLang] = useState<Lang>("pt");
  const snapshot = useRef<string>("");
  const wasOpen = useRef(false);
  // O snapshot é tirado no próprio render da abertura, não em effect: em effect
  // o primeiro render já comparava o formulário contra "" e o modal nascia sujo
  // — fechar sem tocar em nada sempre caía no "Descartar alterações?".
  if (open !== wasOpen.current) {
    wasOpen.current = open;
    if (open) snapshot.current = JSON.stringify(form);
  }
  const dirty = open && JSON.stringify(form) !== snapshot.current;
  useEffect(() => { if (open) setLang("pt"); }, [open]);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty, escape: false });

  const set = <K extends keyof Event>(key: K, value: Event[K] | undefined) => setForm(f => ({ ...f, [key]: value }));
  const categoryItems = useMemo(() => FORM_CATEGORIES.map(c => ({ id: c, label: CATEGORY_LABELS[c], icon: CATEGORY_ICONS[c] })), []);

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      presentation={isMobile ? "fullscreen" : "drawer"}
      size="md"
      side="right"
      title={editing ? "Editar evento" : "Novo evento"}
      subtitle={editing ? editing.title : "Aparece na agenda do hóspede quando publicado"}
      panelProps={guardProps}
      footer={(
        <>
          <Button variant="secondary" onClick={requestClose} style={{ flex: 1 }}>Cancelar</Button>
          <Button variant="primary" icon={CheckCircle2} loading={saving} loadingText="Salvando…" onClick={onSave} style={{ flex: 2 }}>{editing ? "Salvar" : "Criar evento"}</Button>
        </>
      )}
      footerRow
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Imagem do evento">
          <div style={{ width: "100%", height: 180, borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, background: T.glass }}>
            <ImageUpload value={form.imageUrl || ""} onUploadSuccess={url => set("imageUrl", url)} path="events" />
          </div>
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SegmentedTabs<Lang> items={[{ id: "pt", label: "PT" }, { id: "en", label: "EN" }, { id: "es", label: "ES" }]} value={lang} onChange={setLang} size="sm" ariaLabel="Idioma" style={{ alignSelf: "flex-start" }} />
          {lang === "pt" && (
            <>
              <Field label="Título (PT)" required><Input value={form.title || ""} onChange={e => set("title", e.target.value)} placeholder="Ex: Show de Rock ao Vivo" /></Field>
              <Field label="Descrição (PT)"><Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} autoGrow placeholder="Descreva o evento..." /></Field>
            </>
          )}
          {lang === "en" && (
            <>
              <Field label="Title (EN)"><Input value={form.titleEn || ""} onChange={e => set("titleEn", e.target.value)} placeholder="Event title in English" /></Field>
              <Field label="Description (EN)"><Textarea value={form.descriptionEn || ""} onChange={e => set("descriptionEn", e.target.value)} rows={3} autoGrow placeholder="Describe the event..." /></Field>
            </>
          )}
          {lang === "es" && (
            <>
              <Field label="Título (ES)"><Input value={form.titleEs || ""} onChange={e => set("titleEs", e.target.value)} placeholder="Título del evento en español" /></Field>
              <Field label="Descripción (ES)"><Textarea value={form.descriptionEs || ""} onChange={e => set("descriptionEs", e.target.value)} rows={3} autoGrow placeholder="Describe el evento..." /></Field>
            </>
          )}
        </div>

        <Field label="Tipo de evento">
          <FilterChips<EventType> items={[{ id: "local", label: TYPE_LABELS.local, icon: Building2 }, { id: "external", label: TYPE_LABELS.external, icon: Globe }]} value={(form.type as EventType) || "local"} onChange={v => set("type", v)} scroll={false} ariaLabel="Tipo de evento" />
        </Field>
        <Field label="Categoria">
          <FilterChips<EventCategory> items={categoryItems} value={(form.category as EventCategory) || "entertainment"} onChange={v => set("category", v)} scroll={false} ariaLabel="Categoria" />
        </Field>

        <FieldRow cols={2}>
          <Field label="Status">
            {/* "Cancelado" precisa estar aqui: cancelar um evento grava esse status
                e, sem a opção, o campo abria em branco ao editá-lo de novo. */}
            <Select value={form.status || "draft"} onChange={e => set("status", e.target.value as EventStatus)}>
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="finished">Encerrado</option>
              <option value="cancelled">Cancelado</option>
            </Select>
          </Field>
          <Field label="Destaque">
            <div style={{ minHeight: 44, display: "flex", alignItems: "center", padding: "0 12px", borderRadius: 10, border: `1px solid ${form.featured ? T.amberBorder : T.border}`, background: form.featured ? T.amberBg : T.glass }}>
              <Switch checked={!!form.featured} onChange={v => set("featured", v)} label={form.featured ? "Em destaque" : "Normal"} />
              <Star size={14} color={T.amber} fill={form.featured ? T.amber : "none"} style={{ marginLeft: "auto" }} />
            </div>
          </Field>
        </FieldRow>

        <FieldRow cols={2}>
          <Field label="Data de início" required><Input type="date" value={form.startDate || ""} onChange={e => set("startDate", e.target.value)} /></Field>
          <Field label="Data de fim" hint="opcional"><Input type="date" value={form.endDate || ""} onChange={e => set("endDate", e.target.value || undefined)} /></Field>
        </FieldRow>
        <FieldRow cols={2}>
          <Field label="Horário de início"><Input type="time" value={form.startTime || ""} onChange={e => set("startTime", e.target.value || undefined)} /></Field>
          <Field label="Horário de fim"><Input type="time" value={form.endTime || ""} onChange={e => set("endTime", e.target.value || undefined)} /></Field>
        </FieldRow>

        <Field label="Local"><Input value={form.location || ""} onChange={e => set("location", e.target.value)} placeholder="Ex: Palco Central, Bar da Praia..." /></Field>
        <Field label="Link do local (Maps)"><Input value={form.locationUrl || ""} onChange={e => set("locationUrl", e.target.value)} placeholder="https://maps.google.com/..." inputMode="url" /></Field>

        <FieldRow cols={2}>
          <Field label="Preço (R$)"><Input type="number" min="0" step="0.01" value={form.price ?? ""} onChange={e => set("price", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="0 = gratuito" inputMode="decimal" /></Field>
          <Field label="Descrição do preço"><Input value={form.priceDescription || ""} onChange={e => set("priceDescription", e.target.value)} placeholder="Ex: R$ 80/pessoa" /></Field>
        </FieldRow>
        <FieldRow cols={2}>
          <Field label="Link externo (ingressos)"><Input value={form.externalUrl || ""} onChange={e => set("externalUrl", e.target.value)} placeholder="https://..." inputMode="url" /></Field>
          <Field label="Capacidade máxima"><Input type="number" min="1" value={form.maxCapacity ?? ""} onChange={e => set("maxCapacity", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="Ilimitado" inputMode="numeric" /></Field>
        </FieldRow>
      </div>
    </Dialog>
  );
}
