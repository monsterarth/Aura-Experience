// Formulário de criar/editar casamento (4 abas) — extraído do page.tsx.
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { toast } from "sonner";
import { Wedding, WeddingStatus, CrmChannel } from "@/types/aura";
import { X, Loader2, Save } from "lucide-react";
import { T, FInput, FSelect, FRow, FField, FToggle } from "./lib";

// ─── Wedding form modal ───────────────────────────────────────────────────────

type FormTab = 'casal' | 'evento' | 'hospedagem' | 'financeiro';

type WeddingFormData = {
  bride: string; brideShort: string; groom: string; groomShort: string; coupleWebsite: string;
  couplePhone: string; coupleEmail: string; source: string;
  weddingDate: string; status: WeddingStatus; guestCount: string;
  coordinator: string; ceremonyDetails: string; receptionDetails: string; notes: string;
  checkin: string; checkout: string; exclusivity: boolean; cabinsOccupied: string;
  contractTotal: string;
  followUpAt: string; expiresAt: string;
};

const EMPTY_FORM: WeddingFormData = {
  bride: '', brideShort: '', groom: '', groomShort: '', coupleWebsite: '',
  couplePhone: '', coupleEmail: '', source: '',
  weddingDate: '', status: 'tentative', guestCount: '',
  coordinator: '', ceremonyDetails: '', receptionDetails: '', notes: '',
  checkin: '', checkout: '', exclusivity: false, cabinsOccupied: '',
  contractTotal: '',
  followUpAt: '', expiresAt: '',
};

function weddingToForm(w: Wedding): WeddingFormData {
  return {
    bride: w.bride, brideShort: w.brideShort ?? '', groom: w.groom, groomShort: w.groomShort ?? '',
    coupleWebsite: w.coupleWebsite ?? '', couplePhone: w.couplePhone ?? '', coupleEmail: w.coupleEmail ?? '',
    source: w.source ?? '', weddingDate: w.weddingDate, status: w.status,
    guestCount: String(w.guestCount ?? ''), coordinator: w.coordinator ?? '',
    ceremonyDetails: w.ceremonyDetails ?? '', receptionDetails: w.receptionDetails ?? '',
    notes: w.notes ?? '', checkin: w.checkin, checkout: w.checkout,
    exclusivity: w.exclusivity, cabinsOccupied: w.cabinsOccupied != null ? String(w.cabinsOccupied) : '',
    contractTotal: w.contractTotal ? String(w.contractTotal) : '',
    followUpAt: w.followUpAt ?? '', expiresAt: w.expiresAt ?? '',
  };
}

export function WeddingFormModal({ open, initial, propertyId, onClose, onSaved }: {
  open: boolean; initial: Wedding | null; propertyId: string; onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<FormTab>('casal');
  const [form, setForm] = useState<WeddingFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open });

  // Carrega o formulário UMA vez por abertura. Antes o efeito dependia da
  // identidade de `initial`: qualquer re-render que trocasse essa referência
  // reexecutava o setForm e engolia a alteração recém-feita — era por isso que
  // a primeira mudança no dropdown "não pegava" e só a segunda valia.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { loadedFor.current = null; return; }
    const key = initial?.id ?? '__new__';
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setForm(initial ? weddingToForm(initial) : EMPTY_FORM);
    setTab('casal');
  }, [open, initial]);

  // Canais de origem (padrão + editáveis por propriedade)
  const [channels, setChannels] = useState<CrmChannel[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/admin/comercial/channels?propertyId=${propertyId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.channels) setChannels(d.channels); })
      .catch(() => {});
  }, [open, propertyId]);

  const set = (key: keyof WeddingFormData) => (val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.bride.trim() || !form.groom.trim() || !form.weddingDate) {
      toast.error('Preencha noiva, noivo e data do casamento.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        bride: form.bride.trim(), brideShort: form.brideShort.trim() || undefined,
        groom: form.groom.trim(), groomShort: form.groomShort.trim() || undefined,
        coupleWebsite: form.coupleWebsite.trim() || undefined,
        couplePhone: form.couplePhone.replace(/\D/g, '') || null,
        coupleEmail: form.coupleEmail.trim() || null,
        source: form.source || null,
        weddingDate: form.weddingDate, status: form.status,
        guestCount: parseInt(form.guestCount) || 0,
        coordinator: form.coordinator.trim() || undefined,
        ceremonyDetails: form.ceremonyDetails.trim() || undefined,
        receptionDetails: form.receptionDetails.trim() || undefined,
        notes: form.notes.trim() || undefined,
        checkin: form.checkin, checkout: form.checkout,
        exclusivity: form.exclusivity,
        cabinsOccupied: form.exclusivity && form.cabinsOccupied ? parseInt(form.cabinsOccupied) : undefined,
        contractTotal: parseFloat(form.contractTotal) || 0,
        // Prazos só fazem sentido em negociação; nos demais status vão nulos
        // para não deixar data órfã sinalizando follow-up de contrato fechado.
        followUpAt: form.status === 'tentative' ? (form.followUpAt || null) : null,
        expiresAt: form.status === 'tentative' ? (form.expiresAt || null) : null,
      };

      const res = initial
        ? await fetch(`/api/admin/weddings/${initial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/weddings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, propertyId }) });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar');
      }
      toast.success(initial ? 'Casamento atualizado!' : 'Casamento criado!');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const formTabs: { id: FormTab; label: string }[] = [
    { id: 'casal', label: 'Casal' }, { id: 'evento', label: 'Evento' },
    { id: 'hospedagem', label: 'Hospedagem' }, { id: 'financeiro', label: 'Financeiro' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={requestClose}>
      <div onClick={e => e.stopPropagation()} {...guardProps} style={{ width: '100%', maxWidth: 580, background: T.card, borderRadius: 20, border: `1px solid ${T.border2}`, display: 'flex', flexDirection: 'column', maxHeight: '90vh', animation: 'wedding-fade-in .2s ease', boxShadow: '0 32px 80px rgba(0,0,0,.7)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{initial ? 'Editar casamento' : 'Novo casamento'}</div>
              {initial && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{initial.bride} ♥ {initial.groom}</div>}
            </div>
            <button onClick={requestClose} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${T.border2}`, background: T.glass, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {formTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '9px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: 'transparent', color: tab === t.id ? T.text : T.muted, borderBottom: `2px solid ${tab === t.id ? T.g1 : 'transparent'}`, transition: 'all .15s' }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'casal' && (<>
            <FRow><FField label="Nome da noiva *"><FInput value={form.bride} onChange={set('bride')} placeholder="Ex: Ana Carolina" /></FField>
              <FField label="Abreviação (iniciais)"><FInput value={form.brideShort} onChange={set('brideShort')} placeholder="AC" /></FField></FRow>
            <FRow><FField label="Nome do noivo *"><FInput value={form.groom} onChange={set('groom')} placeholder="Ex: João Pedro" /></FField>
              <FField label="Abreviação (iniciais)"><FInput value={form.groomShort} onChange={set('groomShort')} placeholder="JP" /></FField></FRow>
            <FRow><FField label="WhatsApp do casal"><FInput value={form.couplePhone} onChange={v => set('couplePhone')(v.replace(/\D/g, ''))} placeholder="5548999999999" /></FField>
              <FField label="E-mail do casal"><FInput value={form.coupleEmail} onChange={set('coupleEmail')} type="email" placeholder="casal@email.com" /></FField></FRow>
            <FRow><FField label="Origem do lead"><FSelect value={form.source} onChange={set('source')} options={[{ value: '', label: '—' }, ...channels.map(c => ({ value: c.id, label: c.label }))]} /></FField>
              <FField label="Site dos noivos"><FInput value={form.coupleWebsite} onChange={set('coupleWebsite')} placeholder="https://anaejoo.casamento.com.br" /></FField></FRow>
          </>)}

          {tab === 'evento' && (<>
            <FRow><FField label="Data do casamento *"><FInput value={form.weddingDate} onChange={set('weddingDate')} type="date" /></FField>
              <FField label="Status"><FSelect value={form.status} onChange={set('status')} options={[
                { value: 'tentative', label: 'Em negociação' }, { value: 'confirmed', label: 'Confirmado' },
                { value: 'completed', label: 'Realizado' }, { value: 'cancelled', label: 'Cancelado' },
                // Sem esta option, editar um casamento perdido renderizava o
                // select vazio e QUALQUER salvamento reescrevia o status.
                ...(form.status === 'lost' ? [{ value: 'lost', label: 'Perdido' }] : []),
              ]} /></FField></FRow>
            <FRow><FField label="Nº de convidados"><FInput value={form.guestCount} onChange={set('guestCount')} type="number" placeholder="150" /></FField>
              <FField label="Cerimonialista"><FInput value={form.coordinator} onChange={set('coordinator')} placeholder="Nome" /></FField></FRow>
            {form.status === 'tentative' && (
              <FRow><FField label="Próximo follow-up"><FInput value={form.followUpAt} onChange={set('followUpAt')} type="date" /></FField>
                <FField label="Validade da negociação"><FInput value={form.expiresAt} onChange={set('expiresAt')} type="date" /></FField></FRow>
            )}
            <FField label="Detalhes da cerimônia"><FInput value={form.ceremonyDetails} onChange={set('ceremonyDetails')} placeholder="18h00 · Jardim das Oliveiras" /></FField>
            <FField label="Detalhes da recepção"><FInput value={form.receptionDetails} onChange={set('receptionDetails')} placeholder="20h00 · Salão principal" /></FField>
            <FField label="Observações">
              <textarea value={form.notes} onChange={e => set('notes')(e.target.value)} placeholder="Observações internas…" rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass, color: T.text, fontFamily: 'inherit', fontSize: 13, outline: 'none', resize: 'vertical' }} />
            </FField>
          </>)}

          {tab === 'hospedagem' && (<>
            <FRow><FField label="Check-in *"><FInput value={form.checkin} onChange={set('checkin')} type="date" /></FField>
              <FField label="Check-out *"><FInput value={form.checkout} onChange={set('checkout')} type="date" /></FField></FRow>
            <FToggle label="Pousada exclusiva" sub="O casal reserva todas as cabanas para os convidados" checked={form.exclusivity} onChange={set('exclusivity')} />
            {form.exclusivity && (
              <FField label="Cabanas ocupadas">
                <FInput value={form.cabinsOccupied} onChange={set('cabinsOccupied')} type="number" placeholder="Ex: 10" />
              </FField>
            )}
          </>)}

          {tab === 'financeiro' && (<>
            <FField label="Total do contrato (R$)"><FInput value={form.contractTotal} onChange={set('contractTotal')} type="number" placeholder="0,00" /></FField>
            {/* Parcelas saíram do formulário: agora são linhas reais com
                vencimento, no CRUD da aba financeiro do painel do casamento.
                Contrato novo já nasce com as 3 padrão (30/35/35). */}
            <div style={{ fontSize: 12, color: T.muted, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 14px', lineHeight: 1.5 }}>
              {initial
                ? 'As parcelas são gerenciadas na aba Financeiro do painel do casamento (com vencimento e cobrança automática).'
                : 'Ao criar com contrato preenchido, nascem 3 parcelas padrão (30/35/35) — edite depois na aba Financeiro do painel.'}
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={requestClose} style={{ flex: 1, padding: 10, borderRadius: 11, border: `1px solid ${T.border2}`, background: T.glass, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: T.muted }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 10, borderRadius: 11, border: 'none', background: T.grad, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: saving ? .7 : 1, boxShadow: '0 4px 14px rgba(155,109,255,.3)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando…' : (initial ? 'Salvar alterações' : 'Criar casamento')}
          </button>
        </div>
      </div>
    </div>
  );
}
