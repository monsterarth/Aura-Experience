// src/app/admin/guests/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Guest } from "@/types/aura";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserSearch, Search, MapPin, Phone, Mail, FileText,
  Edit2, Save, X, Plus, Loader2, ChevronLeft,
  Users, Merge, Calendar, Home, AlertTriangle, Globe, Cake, User, UserPlus
} from "lucide-react";

// ==========================================
// HELPERS
// ==========================================

const LANG_LABELS: Record<string, string> = { pt: "PT", en: "EN", es: "ES" };
const LANG_COLORS: Record<string, string> = {
  pt: "bg-green-500/10 text-green-500",
  en: "bg-blue-500/10 text-blue-500",
  es: "bg-yellow-500/10 text-yellow-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  pending: "Prevista",
  pre_checkin_done: "Pré-checkin",
  finished: "Encerrada",
  cancelled: "Cancelada",
  archived: "Arquivada",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  pending: "bg-blue-500/10 text-blue-500",
  pre_checkin_done: "bg-cyan-500/10 text-cyan-400",
  finished: "bg-foreground/10 text-foreground/50",
  cancelled: "bg-red-500/10 text-red-400",
  archived: "bg-foreground/10 text-foreground/30",
};

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ==========================================
// TIPOS
// ==========================================

interface StayRow {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  cabinName: string;
}

type PanelTab = "dados" | "estadias";

// ==========================================
// COMPONENTES INTERNOS
// ==========================================

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] font-bold text-foreground/30 uppercase tracking-widest mb-1">{children}</p>;
}

function FieldInput({
  value, onChange, disabled, placeholder, type = "text"
}: {
  value: string; onChange?: (v: string) => void; disabled: boolean;
  placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={e => onChange?.(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(
        "w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-all",
        disabled ? "opacity-60 cursor-default" : "focus:border-primary/50 focus:bg-secondary/80"
      )}
    />
  );
}

// ==========================================
// MERGE MODAL
// ==========================================

function MergeModal({
  primary,
  propertyId,
  onClose,
  onSuccess,
  actorId,
  actorName,
}: {
  primary: Guest;
  propertyId: string;
  onClose: () => void;
  onSuccess: () => void;
  actorId: string;
  actorName: string;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Guest[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [secondary, setSecondary] = useState<Guest | null>(null);
  const [secondaryStays, setSecondaryStays] = useState(0);
  const [merging, setMerging] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSearch(true);
      const data = await GuestService.listGuests(propertyId, search);
      // Exclude the primary guest from results
      setResults(data.filter(g => g.id !== primary.id));
      setLoadingSearch(false);
    }, 300);
  }, [search, propertyId, primary.id]);

  const selectSecondary = async (g: Guest) => {
    setSecondary(g);
    const stays = await GuestService.getGuestStays(propertyId, g.id);
    setSecondaryStays(stays.length);
    setResults([]);
    setSearch("");
  };

  const handleMerge = async () => {
    if (!secondary) return;
    setMerging(true);
    try {
      const count = await GuestService.mergeGuests(propertyId, primary.id, secondary.id, actorId, actorName);
      toast.success(`Cadastros unificados. ${count} estadia(s) transferida(s).`);
      onSuccess();
    } catch {
      toast.error("Erro ao unificar cadastros.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Merge className="text-primary" size={20} />
            </div>
            <div>
              <h2 className="font-black text-foreground">Unificar Cadastros</h2>
              <p className="text-xs text-foreground/40">Manter: <span className="font-bold text-foreground">{primary.fullName}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-foreground/40 hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Search for secondary */}
          {!secondary && (
            <>
              <p className="text-sm text-foreground/60">Busque o cadastro <strong>duplicado</strong> a ser removido:</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nome, documento, email..."
                  className="w-full pl-9 pr-4 py-2.5 bg-secondary border border-border rounded-xl text-sm outline-none focus:border-primary/50 text-foreground"
                  autoFocus
                />
                {loadingSearch && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-foreground/30" />}
              </div>
              {results.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {results.map(g => (
                    <button
                      key={g.id}
                      onClick={() => selectSecondary(g)}
                      className="w-full text-left p-3 bg-secondary hover:bg-white/5 border border-border rounded-xl transition-colors"
                    >
                      <p className="font-bold text-sm text-foreground">{g.fullName}</p>
                      <p className="text-[11px] text-foreground/40">{g.document?.type} · {g.document?.number} · {g.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Comparison */}
          {secondary && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {/* Primary */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-2">Manter</p>
                  <p className="font-black text-foreground text-sm leading-tight">{primary.fullName}</p>
                  <p className="text-[11px] text-foreground/50 mt-1">{primary.document?.type} · {primary.document?.number}</p>
                  {primary.email && <p className="text-[11px] text-foreground/40 truncate">{primary.email}</p>}
                  {primary.phone && <p className="text-[11px] text-foreground/40">{primary.phone}</p>}
                </div>
                {/* Secondary */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Remover</p>
                    <button onClick={() => setSecondary(null)} className="text-foreground/30 hover:text-foreground transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                  <p className="font-black text-foreground text-sm leading-tight">{secondary.fullName}</p>
                  <p className="text-[11px] text-foreground/50 mt-1">{secondary.document?.type} · {secondary.document?.number}</p>
                  {secondary.email && <p className="text-[11px] text-foreground/40 truncate">{secondary.email}</p>}
                  {secondary.phone && <p className="text-[11px] text-foreground/40">{secondary.phone}</p>}
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4">
                <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/70">
                  O cadastro <strong className="text-red-400">{secondary.fullName}</strong> será <strong>apagado permanentemente</strong>.
                  {secondaryStays > 0 && <> As <strong>{secondaryStays} estadia(s)</strong> serão transferidas para o cadastro principal.</>}
                  {secondaryStays === 0 && " Este cadastro não possui estadias."}
                </p>
              </div>

              <button
                onClick={handleMerge}
                disabled={merging}
                className="w-full py-3 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                {merging ? "Unificando..." : "Confirmar Unificação"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAINEL DE DETALHES
// ==========================================

function GuestDetailPanel({
  guest,
  propertyId,
  onBack,
  onUpdated,
  actorId,
  actorName,
}: {
  guest: Guest;
  propertyId: string;
  onBack: () => void;
  onUpdated: (updated: Guest) => void;
  actorId: string;
  actorName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PanelTab>("dados");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Guest>(guest);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [loadingStays, setLoadingStays] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [fnrhDomains, setFnrhDomains] = useState<{
    tiposDocumento: FnrhDomain[];
    generos: FnrhDomain[];
    nacionalidades: FnrhDomain[];
    racas: FnrhDomain[];
  } | null>(null);

  // Load FNRH domains once
  useEffect(() => {
    Promise.all([
      FnrhService.getTiposDocumento(),
      FnrhService.getGeneros(),
      FnrhService.getNacionalidades(),
      FnrhService.getRacas(),
    ]).then(([tiposDocumento, generos, nacionalidades, racas]) => {
      setFnrhDomains({ tiposDocumento, generos, nacionalidades, racas });
    });
  }, []);

  // Sync form when guest prop changes
  useEffect(() => {
    setFormData(guest);
    setIsEditing(false);
  }, [guest.id]);

  // Load stays when tab changes
  useEffect(() => {
    if (tab === "estadias") {
      setLoadingStays(true);
      GuestService.getGuestStays(propertyId, guest.id)
        .then(setStays)
        .finally(() => setLoadingStays(false));
    }
  }, [tab, guest.id, propertyId]);

  const set = (field: keyof Guest, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const setAddress = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));

  const setDoc = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, document: { ...prev.document, [field]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await GuestService.upsertGuest(propertyId, formData as any);
      setIsEditing(false);
      onUpdated(formData);
      toast.success("Dados do hóspede atualizados.");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(guest);
    setIsEditing(false);
  };

  const disabled = !isEditing;

  return (
    <div className="flex flex-col h-full">

      {/* Panel Header */}
      <div className="p-6 border-b border-white/5 flex items-start gap-4">
        {/* Mobile back button */}
        <button
          onClick={onBack}
          className="lg:hidden p-2 hover:bg-white/5 rounded-xl transition-colors text-foreground/40 hover:text-foreground shrink-0 mt-1"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xl font-black text-primary">{getInitials(guest.fullName)}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-foreground tracking-tight truncate">{guest.fullName}</h2>
          <p className="text-xs text-foreground/40 mt-0.5">
            {guest.document?.type} · {guest.document?.number}
          </p>
          {guest.preferredLanguage && (
            <span className={cn("inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full uppercase", LANG_COLORS[guest.preferredLanguage])}>
              {LANG_LABELS[guest.preferredLanguage]}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isEditing ? (
            <>
              <button
                onClick={() => setMergeOpen(true)}
                title="Unificar cadastros"
                className="p-2.5 bg-white/5 hover:bg-white/10 text-foreground/50 hover:text-foreground rounded-xl transition-all"
              >
                <Merge size={15} />
              </button>
              <button
                onClick={() => router.push(`/admin/stays/new?guestId=${guest.id}`)}
                title="Nova Reserva"
                className="p-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-all"
              >
                <Plus size={15} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
              >
                <Edit2 size={12} /> Editar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="px-3 py-2.5 text-foreground/40 hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Salvar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-6">
        {(["dados", "estadias"] as PanelTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "py-3 px-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all",
              tab === t ? "border-primary text-primary" : "border-transparent text-foreground/30 hover:text-foreground/60"
            )}
          >
            {t === "dados" ? "Dados Pessoais" : "Histórico de Estadias"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* === ABA DADOS === */}
        {tab === "dados" && (
          <div className="space-y-6">

            {/* Identificação */}
            <section className="space-y-3">
              <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Identificação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <FieldLabel>Nome Completo</FieldLabel>
                  <FieldInput value={formData.fullName} onChange={v => set("fullName", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Tipo de Documento</FieldLabel>
                  <select
                    value={formData.document?.type ?? ""}
                    onChange={e => setDoc("type", e.target.value)}
                    disabled={disabled}
                    className={cn("w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-all", disabled ? "opacity-60 cursor-default" : "focus:border-primary/50")}
                  >
                    <option value="" disabled>Selecione...</option>
                    {fnrhDomains?.tiposDocumento.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Número do Documento</FieldLabel>
                  <FieldInput value={formData.document?.number} onChange={v => setDoc("number", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Nascimento</FieldLabel>
                  <FieldInput value={formData.birthDate} onChange={v => set("birthDate", v)} disabled={disabled} type="date" />
                </div>
                <div>
                  <FieldLabel>Gênero</FieldLabel>
                  <select
                    value={formData.gender ?? ""}
                    onChange={e => set("gender", e.target.value)}
                    disabled={disabled}
                    className={cn("w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-all", disabled ? "opacity-60 cursor-default" : "focus:border-primary/50")}
                  >
                    <option value="" disabled>Selecione...</option>
                    {fnrhDomains?.generos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </div>
                {/* Raça/Cor */}
                <div>
                  <FieldLabel>Raça / Cor</FieldLabel>
                  <select
                    value={formData.raca ?? "NAO_DECLARADO"}
                    onChange={e => set("raca", e.target.value)}
                    disabled={disabled}
                    className={cn("w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-all", disabled ? "opacity-60 cursor-default" : "focus:border-primary/50")}
                  >
                    {fnrhDomains?.racas.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                {/* Profissão */}
                <div>
                  <FieldLabel>Profissão</FieldLabel>
                  <FieldInput value={formData.occupation ?? ""} onChange={v => set("occupation", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Nacionalidade</FieldLabel>
                  <select
                    value={formData.nationality ?? ""}
                    onChange={e => set("nationality", e.target.value)}
                    disabled={disabled}
                    className={cn("w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-all", disabled ? "opacity-60 cursor-default" : "focus:border-primary/50")}
                  >
                    <option value="" disabled>Selecione...</option>
                    {fnrhDomains?.nacionalidades.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Idioma Preferido</FieldLabel>
                  {disabled ? (
                    <div className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground opacity-60">
                      {LANG_LABELS[formData.preferredLanguage ?? "pt"] ?? "PT"}
                    </div>
                  ) : (
                    <select
                      value={formData.preferredLanguage ?? "pt"}
                      onChange={e => set("preferredLanguage", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  )}
                </div>
              </div>
            </section>

            {/* Contato */}
            <section className="space-y-3">
              <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Contato</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <FieldInput value={formData.email} onChange={v => set("email", v)} disabled={disabled} type="email" />
                </div>
                <div>
                  <FieldLabel>Telefone</FieldLabel>
                  <FieldInput value={formData.phone} onChange={v => set("phone", v)} disabled={disabled} placeholder="+55 (00) 00000-0000" />
                </div>
              </div>
            </section>

            {/* Endereço */}
            <section className="space-y-3">
              <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <FieldLabel>Rua</FieldLabel>
                  <FieldInput value={formData.address?.street} onChange={v => setAddress("street", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Número</FieldLabel>
                  <FieldInput value={formData.address?.number} onChange={v => setAddress("number", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Bairro</FieldLabel>
                  <FieldInput value={formData.address?.neighborhood} onChange={v => setAddress("neighborhood", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Cidade</FieldLabel>
                  <FieldInput value={formData.address?.city} onChange={v => setAddress("city", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Estado</FieldLabel>
                  <FieldInput value={formData.address?.state} onChange={v => setAddress("state", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>CEP</FieldLabel>
                  <FieldInput value={formData.address?.zipCode} onChange={v => setAddress("zipCode", v)} disabled={disabled} />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>País</FieldLabel>
                  <FieldInput value={formData.address?.country} onChange={v => setAddress("country", v)} disabled={disabled} />
                </div>
                <div>
                  <FieldLabel>Cód. IBGE (FNRH)</FieldLabel>
                  <FieldInput value={formData.address?.ibgeCityId ?? ""} onChange={v => setAddress("ibgeCityId", v)} disabled={disabled} />
                </div>
              </div>
            </section>

            {/* Alergias */}
            <section className="space-y-3">
              <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Alergias / Restrições</h3>
              {formData.allergies?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {formData.allergies.map((a, i) => (
                    <div key={i} className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full">
                      {a}
                      {!disabled && (
                        <button onClick={() => set("allergies", formData.allergies.filter((_, j) => j !== i))}>
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-foreground/30">Nenhuma alergia registrada.</p>
              )}
              {!disabled && (
                <AllergyInput
                  onAdd={v => set("allergies", [...(formData.allergies ?? []), v])}
                />
              )}
            </section>

          </div>
        )}

        {/* === ABA ESTADIAS === */}
        {tab === "estadias" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground/40">{stays.length} estadia(s) encontrada(s)</p>
              <button
                onClick={() => router.push(`/admin/stays/new?guestId=${guest.id}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
              >
                <Plus size={12} /> Nova Reserva
              </button>
            </div>

            {loadingStays ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-foreground/30" size={24} />
              </div>
            ) : stays.length === 0 ? (
              <div className="text-center py-12 text-foreground/20">
                <Calendar size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">Nenhuma estadia registrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stays.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 p-4 bg-secondary border border-white/5 rounded-2xl hover:border-white/10 transition-all"
                  >
                    <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                      <Home size={15} className="text-foreground/30" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-foreground">{s.cabinName}</p>
                      <p className="text-[11px] text-foreground/40">
                        {format(new Date(s.checkIn), "dd/MM/yy", { locale: ptBR })} →{" "}
                        {format(new Date(s.checkOut), "dd/MM/yy", { locale: ptBR })}
                      </p>
                    </div>
                    <span className={cn("text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider", STATUS_COLORS[s.status])}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <button
                      onClick={() => router.push(`/admin/stays/${s.id}`)}
                      className="p-2 hover:bg-white/10 text-foreground/30 hover:text-foreground rounded-xl transition-all"
                      title="Ver Ficha da Estadia"
                    >
                      <FileText size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Merge Modal */}
      {mergeOpen && (
        <MergeModal
          primary={guest}
          propertyId={propertyId}
          actorId={actorId}
          actorName={actorName}
          onClose={() => setMergeOpen(false)}
          onSuccess={() => { setMergeOpen(false); onUpdated(guest); }}
        />
      )}
    </div>
  );
}

// Mini-input para adicionar alergia
function AllergyInput({ onAdd }: { onAdd: (v: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }}
        placeholder="Ex: Glúten, amendoim..."
        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
      />
      <button
        onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}
        className="px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-all"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

// ==========================================
// NEW GUEST PANEL
// ==========================================

const EMPTY_GUEST: Omit<Guest, 'updatedAt'> = {
  id: '',
  propertyId: '',
  fullName: '',
  email: '',
  phone: '',
  nationality: 'Brasileira',
  birthDate: '',
  gender: 'NAO_INFORMADO',
  occupation: '',
  document: { type: 'CPF', number: '' },
  address: { street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '', country: 'Brasil' },
  allergies: [],
  preferredLanguage: 'pt',
};

function NewGuestPanel({
  propertyId,
  onBack,
  onCreated,
  actorId,
  actorName,
}: {
  propertyId: string;
  onBack: () => void;
  onCreated: (g: Guest) => void;
  actorId: string;
  actorName: string;
}) {
  const [formData, setFormData] = useState<Omit<Guest, 'updatedAt'>>({ ...EMPTY_GUEST, propertyId });
  const [saving, setSaving] = useState(false);
  const [fnrhDomains, setFnrhDomains] = useState<{
    tiposDocumento: FnrhDomain[];
    generos: FnrhDomain[];
    nacionalidades: FnrhDomain[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      FnrhService.getTiposDocumento(),
      FnrhService.getGeneros(),
      FnrhService.getNacionalidades(),
    ]).then(([tiposDocumento, generos, nacionalidades]) => {
      setFnrhDomains({ tiposDocumento, generos, nacionalidades });
    });
  }, []);

  const set = (field: keyof Guest, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }));
  const setAddress = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
  const setDoc = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, document: { ...prev.document, [field]: value } }));

  const handleSave = async () => {
    if (!formData.fullName.trim()) return toast.error("Nome é obrigatório.");
    if (!formData.document.number.trim()) return toast.error("Número do documento é obrigatório.");
    setSaving(true);
    try {
      const guestPayload = { ...formData, id: GuestService.normalizeDocument(formData.document.number) };
      const id = await GuestService.upsertGuest(propertyId, guestPayload as any);
      const created = { ...formData, id, updatedAt: new Date().toISOString() } as Guest;
      toast.success("Hóspede criado com sucesso.");
      onCreated(created);
    } catch {
      toast.error("Erro ao criar hóspede.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center gap-4">
        <button onClick={onBack} className="lg:hidden p-2 hover:bg-white/5 rounded-xl transition-colors text-foreground/40 hover:text-foreground">
          <ChevronLeft size={18} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <UserPlus size={22} className="text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-foreground tracking-tight">Novo Hóspede</h2>
          <p className="text-xs text-foreground/40 mt-0.5">Preencha os dados do cadastro</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onBack} className="px-3 py-2.5 text-foreground/40 hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Criar
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        <section className="space-y-3">
          <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <FieldLabel>Nome Completo *</FieldLabel>
              <FieldInput value={formData.fullName} onChange={v => set("fullName", v)} disabled={false} placeholder="Nome completo" />
            </div>
            <div>
              <FieldLabel>Tipo de Documento *</FieldLabel>
              <select
                value={formData.document.type}
                onChange={e => setDoc("type", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="" disabled>Selecione...</option>
                {fnrhDomains?.tiposDocumento.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Número do Documento *</FieldLabel>
              <FieldInput value={formData.document.number} onChange={v => setDoc("number", v)} disabled={false} placeholder="000.000.000-00" />
            </div>
            <div>
              <FieldLabel>Nascimento</FieldLabel>
              <FieldInput value={formData.birthDate} onChange={v => set("birthDate", v)} disabled={false} type="date" />
            </div>
            <div>
              <FieldLabel>Gênero</FieldLabel>
              <select
                value={formData.gender ?? ""}
                onChange={e => set("gender", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="" disabled>Selecione...</option>
                {fnrhDomains?.generos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Nacionalidade</FieldLabel>
              <select
                value={formData.nationality ?? ""}
                onChange={e => set("nationality", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="" disabled>Selecione...</option>
                {fnrhDomains?.nacionalidades.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Idioma Preferido</FieldLabel>
              <select
                value={formData.preferredLanguage ?? "pt"}
                onChange={e => set("preferredLanguage", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Contato</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Email</FieldLabel>
              <FieldInput value={formData.email} onChange={v => set("email", v)} disabled={false} type="email" />
            </div>
            <div>
              <FieldLabel>Telefone / WhatsApp</FieldLabel>
              <FieldInput value={formData.phone} onChange={v => set("phone", v)} disabled={false} placeholder="+55 (00) 00000-0000" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[9px] font-black text-foreground/20 uppercase tracking-widest border-b border-white/5 pb-2">Endereço</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <FieldLabel>Rua</FieldLabel>
              <FieldInput value={formData.address?.street} onChange={v => setAddress("street", v)} disabled={false} />
            </div>
            <div>
              <FieldLabel>Número</FieldLabel>
              <FieldInput value={formData.address?.number} onChange={v => setAddress("number", v)} disabled={false} />
            </div>
            <div>
              <FieldLabel>Cidade</FieldLabel>
              <FieldInput value={formData.address?.city} onChange={v => setAddress("city", v)} disabled={false} />
            </div>
            <div>
              <FieldLabel>Estado</FieldLabel>
              <FieldInput value={formData.address?.state} onChange={v => setAddress("state", v)} disabled={false} />
            </div>
            <div>
              <FieldLabel>País</FieldLabel>
              <FieldInput value={formData.address?.country} onChange={v => setAddress("country", v)} disabled={false} />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

function GuestsPageInner() {
  const { userData } = useAuth();
  const { currentProperty: contextProperty } = useProperty();
  const searchParams = useSearchParams();
  const preSelectId = searchParams.get("id");

  const [search, setSearch] = useState("");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Guest | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showPanel, setShowPanel] = useState(false); // mobile state

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGuests = useCallback(async (term?: string) => {
    if (!contextProperty?.id) return;
    setLoading(true);
    try {
      const data = await GuestService.listGuests(contextProperty.id, term);
      setGuests(data);
      if (preSelectId) {
        const found = data.find((g: any) => g.id === preSelectId);
        if (found) { setSelected(found); setShowPanel(true); }
      }
    } finally {
      setLoading(false);
    }
  }, [contextProperty?.id, preSelectId]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadGuests(search || undefined), 300);
  }, [search, loadGuests]);

  const handleSelect = (g: Guest) => {
    setCreatingNew(false);
    setSelected(g);
    setShowPanel(true);
  };

  const handleUpdated = (updated: Guest) => {
    setSelected(updated);
    setGuests(prev => prev.map(g => g.id === updated.id ? updated : g));
  };

  const handleMergeSuccess = () => {
    setSelected(null);
    setShowPanel(false);
    loadGuests(search || undefined);
  };

  const handleNewGuest = () => {
    setSelected(null);
    setCreatingNew(true);
    setShowPanel(true);
  };

  const handleCreated = (g: Guest) => {
    setCreatingNew(false);
    setSelected(g);
    loadGuests(search || undefined);
  };

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">

        {/* ===== LEFT: Guest List ===== */}
        <div className={cn(
          "flex flex-col border-r border-white/5 bg-background",
          "w-full lg:w-[380px] xl:w-[420px] shrink-0",
          showPanel && "hidden lg:flex"
        )}>
          {/* Header */}
          <div className="p-6 border-b border-white/5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2 text-foreground">
                  <UserSearch className="text-primary" size={24} /> Hóspedes
                </h1>
                <p className="text-xs text-foreground/40 mt-0.5 flex items-center gap-1">
                  <MapPin size={11} /> {contextProperty?.name ?? "Carregando..."}
                </p>
              </div>
              <button
                onClick={handleNewGuest}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all"
              >
                <UserPlus size={13} /> Novo
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nome, CPF, email, telefone..."
                className="w-full pl-9 pr-4 py-2.5 bg-secondary border border-border rounded-2xl text-sm outline-none focus:border-primary/50 text-foreground placeholder:text-foreground/30 transition-all"
              />
              {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-foreground/30" />}
            </div>
          </div>

          {/* Guest List */}
          <div className="flex-1 overflow-y-auto">
            {!loading && guests.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-foreground/20 gap-3 p-8">
                <Users size={40} className="opacity-30" />
                <p className="text-sm font-bold text-center">
                  {search ? `Nenhum hóspede encontrado para "${search}"` : "Nenhum hóspede cadastrado"}
                </p>
              </div>
            )}

            {guests.map(g => (
              <button
                key={g.id}
                onClick={() => handleSelect(g)}
                className={cn(
                  "w-full text-left px-4 py-3.5 border-b border-white/5 hover:bg-white/[0.03] transition-all",
                  selected?.id === g.id && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-sm font-black text-foreground/60">
                    {getInitials(g.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-foreground truncate">{g.fullName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-foreground/30 truncate">
                        {g.document?.type} · {g.document?.number}
                      </span>
                      {g.preferredLanguage && (
                        <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0", LANG_COLORS[g.preferredLanguage])}>
                          {LANG_LABELS[g.preferredLanguage]}
                        </span>
                      )}
                    </div>
                    {g.email && (
                      <p className="text-[10px] text-foreground/25 truncate mt-0.5">{g.email}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer count */}
          {guests.length > 0 && (
            <div className="p-4 border-t border-white/5 text-center">
              <p className="text-[10px] text-foreground/20 uppercase tracking-widest font-bold">
                {guests.length} hóspede{guests.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>

        {/* ===== RIGHT: Detail Panel ===== */}
        <div className={cn(
          "flex-1 bg-card overflow-hidden",
          !showPanel && "hidden lg:flex lg:flex-col",
          showPanel && "flex flex-col"
        )}>
          {creatingNew && contextProperty?.id ? (
            <NewGuestPanel
              propertyId={contextProperty.id}
              onBack={() => { setCreatingNew(false); setShowPanel(false); }}
              onCreated={handleCreated}
              actorId={userData?.id ?? "ADMIN"}
              actorName={userData?.fullName ?? "Recepção"}
            />
          ) : selected && contextProperty?.id ? (
            <GuestDetailPanel
              key={selected.id}
              guest={selected}
              propertyId={contextProperty.id}
              onBack={() => setShowPanel(false)}
              onUpdated={handleUpdated}
              actorId={userData?.id ?? "ADMIN"}
              actorName={userData?.fullName ?? "Recepção"}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-foreground/20 gap-4">
              <div className="w-20 h-20 bg-white/[0.03] rounded-[28px] flex items-center justify-center">
                <UserSearch size={36} className="opacity-30" />
              </div>
              <div className="text-center">
                <p className="font-black text-foreground/30">Selecione um hóspede</p>
                <p className="text-xs text-foreground/20 mt-1">Clique em um nome na lista para ver os detalhes</p>
              </div>
              <button
                onClick={handleNewGuest}
                className="flex items-center gap-2 px-5 py-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-black uppercase tracking-widest rounded-2xl transition-all"
              >
                <UserPlus size={14} /> Criar Novo Hóspede
              </button>
            </div>
          )}
        </div>

      </div>
    </RoleGuard>
  );
}

export default function GuestsPage() {
  return (
    <React.Suspense fallback={null}>
      <GuestsPageInner />
    </React.Suspense>
  );
}
