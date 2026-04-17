// src/app/admin/stays/[stayId]/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Edit2, Save, Calendar, User,
  MapPin, Phone, Mail, Car, FileText,
  Users, CheckCircle, Clock, Plane,
  Briefcase, PawPrint, Trash2, Plus,
  LogOut, RotateCcw, Sparkles, Receipt, RefreshCw, ShoppingCart, Coffee,
  Loader2, Printer, ArrowLeft, BedDouble, ExternalLink,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StayService } from "@/services/stay-service";
import { GuestService } from "@/services/guest-service";
import { CabinService } from "@/services/cabin-service";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import { sanitizeDocumentForFnrh, validateCPF } from "@/lib/utils-checkin";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Stay, Guest, Cabin, FolioItem } from "@/types/aura";

// ─── Primitivos de display ────────────────────────────────────────────────

const formatDateForInput = (ts: any) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parseDateFromInput = (dateStr: string, orig: any): string | null => {
  if (!dateStr) return null;
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = orig ? new Date(orig) : new Date();
  d.setFullYear(y, m - 1, day);
  return d.toISOString();
};

// Pill de label de campo
const FL = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
    <Icon size={10} className="text-primary/70 shrink-0" /> {children}
  </label>
);

// Input de campo
const FI = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      "w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground text-xs outline-none focus:border-primary/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:light] dark:[color-scheme:dark]",
      props.className,
    )}
  />
);

// Select de campo
const FS = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground text-xs outline-none focus:border-primary/60 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </select>
);

// Valor readonly elegante
const RV = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <p className={cn("text-sm text-foreground min-h-[32px] flex items-center", mono && "font-mono")}>
    {children || <span className="text-muted-foreground/50 italic text-xs">—</span>}
  </p>
);

// Card de seção
const Card = ({ title, icon: Icon, iconColor = "text-primary", children, className, action }: {
  title: string; icon: any; iconColor?: string; children: React.ReactNode; className?: string; action?: React.ReactNode;
}) => (
  <div className={cn("bg-card border border-border rounded-2xl overflow-hidden", className)}>
    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/40">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-foreground">
        <Icon size={13} className={iconColor} /> {title}
      </span>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending:          { label: "Pendente",       bg: "bg-yellow-500/10", text: "text-yellow-600" },
  pre_checkin_done: { label: "Pré Check-in",   bg: "bg-blue-500/10",   text: "text-blue-600"   },
  active:           { label: "Hospedado",       bg: "bg-green-500/10",  text: "text-green-600"  },
  finished:         { label: "Encerrado",       bg: "bg-zinc-500/10",   text: "text-zinc-500"   },
  cancelled:        { label: "Cancelado",       bg: "bg-red-500/10",    text: "text-red-500"    },
};

// ─── Page ─────────────────────────────────────────────────────────────────

export default function StayDetailPage() {
  const { stayId } = useParams();
  const { userData } = useAuth();
  const { currentProperty } = useProperty();

  const isGovOnly = userData?.role === "governance";

  const [loading,    setLoading]    = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);
  const [isEditing,  setIsEditing]  = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const [stay,  setStay]  = useState<any>(null);
  const [guest, setGuest] = useState<any>(null);

  const [formData,  setFormData]  = useState<any>({});
  const [guestData, setGuestData] = useState<any>({});
  const [cabins,    setCabins]    = useState<Cabin[]>([]);
  const [fnrhDomains, setFnrhDomains] = useState<{
    generos: FnrhDomain[]; racas: FnrhDomain[];
    transportes: FnrhDomain[]; motivos: FnrhDomain[]; tiposDocumento: FnrhDomain[];
  } | null>(null);

  const [checkInStr,  setCheckInStr]  = useState("");
  const [checkOutStr, setCheckOutStr] = useState("");

  const [folioItems,    setFolioItems]    = useState<FolioItem[]>([]);
  const [loadingFolio,  setLoadingFolio]  = useState(false);
  const [newFolioItem,  setNewFolioItem]  = useState({ description: "", quantity: 1, unitPrice: 0 });

  const [transferDialogOpen,    setTransferDialogOpen]    = useState(false);
  const [pendingTransferCabinId, setPendingTransferCabinId] = useState<string | null>(null);

  const propertyId = currentProperty?.id;

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadFolio = useCallback(async () => {
    if (!propertyId || !stayId) return;
    setLoadingFolio(true);
    try {
      setFolioItems(await StayService.getStayFolio(propertyId, stayId as string));
    } catch { toast.error("Erro ao carregar extrato."); }
    finally { setLoadingFolio(false); }
  }, [propertyId, stayId]);

  const initData = useCallback((s: any, g: any) => {
    if (!s) return;
    setCheckInStr(formatDateForInput(s.checkIn));
    setCheckOutStr(formatDateForInput(s.checkOut));
    setFormData({
      cabinId:              s.cabinId,
      expectedArrivalTime:  s.expectedArrivalTime || "",
      roomSetup:            s.roomSetup || "double",
      roomSetupNotes:       s.roomSetupNotes || "",
      areaConfigs:          s.areaConfigs || [],
      counts:               s.counts || { adults: 1, children: 0, babies: 0 },
      vehiclePlate:         s.vehiclePlate || "",
      travelReason:         s.travelReason || "TURISMO",
      transportation:       s.transportation || "CARRO",
      lastCity:             s.lastCity || "",
      nextCity:             s.nextCity || "",
      hasPet:               s.hasPet || false,
      petDetails:           s.petDetails || { name: "", species: "Cachorro", weight: 0, breed: "" },
      additionalGuests:     s.additionalGuests || [],
      housekeepingItems:    s.housekeepingItems || [],
      cestaBreakfastEnabled: s.cestaBreakfastEnabled || false,
    });
    const gg = g || {};
    setGuestData({
      fullName:    gg.fullName    || "",
      nationality: gg.nationality || "Brasil",
      document:    gg.document    || { type: "CPF", number: "" },
      birthDate:   gg.birthDate   || "",
      gender:      gg.gender      || "",
      raca:        gg.raca        || "NAO_DECLARADO",
      occupation:  gg.occupation  || "",
      email:       gg.email       || "",
      phone:       gg.phone       || "",
      address:     gg.address     || { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil", ibgeCityId: "" },
    });
  }, []);

  useEffect(() => {
    if (!propertyId || !stayId) return;
    (async () => {
      setLoading(true);
      try {
        const [result, cabinsData, generos, racas, transportes, motivos, tiposDocumento] = await Promise.all([
          StayService.getStayWithGuestAndCabinAdmin(propertyId, stayId as string),
          CabinService.getCabinsByProperty(propertyId),
          FnrhService.getGeneros(), FnrhService.getRacas(),
          FnrhService.getMeiosTransporte(), FnrhService.getMotivosViagem(), FnrhService.getTiposDocumento(),
        ]);
        if (!result) return;
        setStay(result.stay); setGuest(result.guest);
        setCabins(cabinsData);
        setFnrhDomains({ generos, racas, transportes, motivos, tiposDocumento });
        initData(result.stay, result.guest);
        loadFolio();
      } finally { setLoading(false); }
    })();
  }, [propertyId, stayId, initData, loadFolio]);

  useEffect(() => {
    if (!stayId) return;
    const ch = supabase.channel(`folio_page_${stayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "folio_items", filter: `stayId=eq.${stayId}` }, loadFolio)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [stayId, loadFolio]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const fetchAddressByCep = async (cep?: string) => {
    const clean = (cep || "").replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado."); return; }
      setGuestData((p: any) => ({
        ...p,
        address: { ...p.address, street: data.logradouro || p.address?.street || "", neighborhood: data.bairro || p.address?.neighborhood || "",
          city: data.localidade || p.address?.city || "", state: data.uf || p.address?.state || "",
          country: "Brasil", zipCode: data.cep || p.address?.zipCode || "", ibgeCityId: data.ibge || p.address?.ibgeCityId || "" },
      }));
      toast.success("Endereço preenchido!");
    } catch { /* silent */ }
  };

  const handleCancel = () => { initData(stay, guest); setIsEditing(false); setExpandedArea(null); };

  const doSave = async (newCabinId: string | null, disposition: "cleaning" | "available" | null) => {
    setIsSaving(true);
    try {
      const cleanHk  = (formData.housekeepingItems || []).filter((i: any) => i.label.trim() !== "");
      const { cabinId: _ci, ...rest } = formData;
      const stayPayload: Partial<Stay> = {
        ...rest, housekeepingItems: cleanHk,
        checkIn:  parseDateFromInput(checkInStr,  stay.checkIn)  || stay.checkIn,
        checkOut: parseDateFromInput(checkOutStr, stay.checkOut) || stay.checkOut,
        additionalGuests: (formData.additionalGuests || []).map((ag: any) => ({ ...ag, document: ag.document ? sanitizeDocumentForFnrh(ag.document) : "" })),
      };
      const guestPayload: Partial<Guest> = {
        id: guest?.id, ...guestData,
        document: { ...guestData.document, number: sanitizeDocumentForFnrh(guestData.document?.number) },
      };
      const ops: Promise<any>[] = [
        StayService.updateStayData(propertyId!, stay.id, stayPayload, userData?.id || "ADMIN", userData?.fullName || "Recepção"),
        GuestService.upsertGuest(propertyId!, guestPayload as Guest),
      ];
      if (newCabinId && disposition)               ops.push(StayService.transferCabin(propertyId!, stay.id, newCabinId, disposition, userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      else if (newCabinId && stay.status !== "active") ops.push(StayService.transferCabin(propertyId!, stay.id, newCabinId, "available", userData?.id || "ADMIN", userData?.fullName || "Recepção"));
      await Promise.all(ops);
      toast.success("Ficha atualizada!");
      setIsEditing(false); setExpandedArea(null);
      const upd = await StayService.getStayWithGuestAndCabinAdmin(propertyId!, stay.id);
      if (upd) { setStay(upd.stay); setGuest(upd.guest); initData(upd.stay, upd.guest); }
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.startsWith("CABIN_NOT_AVAILABLE")) toast.error(`Transferência bloqueada: acomodação ${msg.split(":")[2] ?? "indisponível"}.`);
      else toast.error("Erro ao salvar.");
    } finally { setIsSaving(false); }
  };

  const handleSave = async () => {
    if (guestData.document?.type === "CPF" && guestData.document.number && !validateCPF(guestData.document.number)) { toast.error("CPF Inválido."); return; }
    if ((formData.additionalGuests || []).some((ag: any) => ag.document && sanitizeDocumentForFnrh(ag.document).length === 11 && !validateCPF(ag.document))) { toast.error("CPF de acompanhante inválido."); return; }
    const cabinChanged = formData.cabinId && formData.cabinId !== stay.cabinId;
    if (cabinChanged && stay.status === "active") { setPendingTransferCabinId(formData.cabinId); setTransferDialogOpen(true); return; }
    await doSave(cabinChanged ? formData.cabinId : null, null);
  };

  const handleToggleCheckOut = async () => {
    const fin = stay.status === "active";
    if (!window.confirm(`Tem certeza que deseja ${fin ? "realizar Check-out" : "reativar esta estadia"}?`)) return;
    setIsSaving(true);
    try {
      if (fin) { await StayService.performCheckOut(propertyId!, stay.id, userData?.id || "ADMIN", userData?.fullName || "Recepção"); toast.success("Check-out realizado!"); }
      else      { await StayService.undoCheckOut(propertyId!, stay.id, stay.cabinId, userData?.id || "ADMIN", userData?.fullName || "Recepção"); toast.success("Estadia reativada!"); }
      const upd = await StayService.getStayWithGuestAndCabinAdmin(propertyId!, stay.id);
      if (upd) { setStay(upd.stay); setGuest(upd.guest); }
    } catch { toast.error("Erro na operação."); } finally { setIsSaving(false); }
  };

  const handleAddFolioItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolioItem.description || newFolioItem.quantity <= 0 || newFolioItem.unitPrice < 0) { toast.error("Preencha corretamente."); return; }
    setLoadingFolio(true);
    try {
      await StayService.addFolioItemManual(propertyId!, stay.id,
        { description: newFolioItem.description, quantity: newFolioItem.quantity, unitPrice: newFolioItem.unitPrice, totalPrice: newFolioItem.quantity * newFolioItem.unitPrice, category: "other", addedBy: userData?.id || "SYSTEM" },
        userData?.id || "unknown", userData?.fullName || "Recepção");
      toast.success("Item adicionado."); setNewFolioItem({ description: "", quantity: 1, unitPrice: 0 }); loadFolio();
    } catch { toast.error("Erro ao adicionar."); } finally { setLoadingFolio(false); }
  };

  const handleDeleteFolioItem = async (id: string, desc: string) => {
    if (!confirm(`Estornar "${desc}"?`)) return;
    setLoadingFolio(true);
    try { await StayService.deleteFolioItem(propertyId!, stay.id, id, desc, userData?.id || "unknown", userData?.fullName || "Recepção"); toast.success("Item estornado."); loadFolio(); }
    catch { toast.error("Erro."); } finally { setLoadingFolio(false); }
  };

  const handleToggleFolioStatus = async (id: string, cur: string) => {
    const next = cur === "paid" ? "pending" : "paid";
    setLoadingFolio(true);
    try { await StayService.toggleFolioItemStatus(propertyId!, stay.id, id, next as any, userData?.id || "unknown", userData?.fullName || "Recepção"); toast.success(next === "paid" ? "Baixado!" : "Reaberto."); loadFolio(); }
    catch { toast.error("Erro."); } finally { setLoadingFolio(false); }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const locked        = !isEditing || isGovOnly;
  const totalFolio    = folioItems.reduce((a, i) => a + i.totalPrice, 0);
  const selectedCabin = cabins.find((c) => c.id === (formData.cabinId || stay?.cabinId));

  const currentAdults   = 1 + ((formData.additionalGuests || []).filter((g: any) => g.type === "adult").length);
  const bookedAdults    = formData.counts?.adults || 1;
  const currentChildren = (formData.additionalGuests || []).filter((g: any) => g.type === "child").length;
  const bookedChildren  = formData.counts?.children || 0;
  const currentBabies   = (formData.additionalGuests || []).filter((g: any) => g.type === "baby").length;

  // ACF divergence: compares recorded counts (formData.counts) vs actual derived from guest list
  const actualCounts  = { adults: currentAdults, children: currentChildren, babies: currentBabies };
  const acfDiverges   = currentAdults   !== (formData.counts?.adults   ?? 1)
                     || currentChildren !== (formData.counts?.children ?? 0)
                     || currentBabies   !== (formData.counts?.babies   ?? 0);

  const nights = stay ? differenceInCalendarDays(new Date(stay.checkOut), new Date(stay.checkIn)) : 0;

  // ── Area Configs component ────────────────────────────────────────────────

  const AreaSection = () => {
    if (!selectedCabin?.layout?.length) return null;
    const bedLabel = (b: any) => ({ single: "Solteiro", double: "Casal", sofa_bed: "Sofá-Cama" }[b.type as string] ?? b.label ?? "Extra") as string;
    return (
      <div className="space-y-2 pt-1">
        <FL icon={BedDouble}>Montagem</FL>
        {selectedCabin.layout.map((area: any) => {
          const configs: any[][] = area.configs ?? (area.beds ? [area.beds] : [[]]);
          const fixed = configs.length <= 1;
          const selIdx = (formData.areaConfigs || []).find((ac: any) => ac.areaId === area.id)?.configIndex ?? 0;
          return (
            <div key={area.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-secondary/50">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{area.name || area.type}</span>
                {fixed && <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">Padrão</span>}
              </div>
              {fixed ? (
                <div className="px-3 py-2.5 flex flex-wrap gap-1.5">
                  {(configs[0] || []).map((b: any) => (
                    <span key={b.id} className="flex items-center gap-1 bg-background border border-border px-2.5 py-1 rounded-lg text-xs font-semibold">🛏 {bedLabel(b)}</span>
                  ))}
                </div>
              ) : expandedArea === area.id ? (
                <div className="p-2 flex flex-col gap-1.5">
                  {configs.map((cfg, idx) => {
                    const lbl = cfg.length ? cfg.map(bedLabel).join(" + ") : `Opção ${String.fromCharCode(65 + idx)}`;
                    const sel = selIdx === idx;
                    return (
                      <button key={idx} type="button"
                        onClick={() => { setFormData((p: any) => ({ ...p, areaConfigs: [...(p.areaConfigs || []).filter((ac: any) => ac.areaId !== area.id), { areaId: area.id, configIndex: idx }] })); setExpandedArea(null); }}
                        className={cn("w-full px-3 py-2 rounded-lg border text-left text-xs font-bold transition-all flex items-center gap-2",
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50")}>
                        <span className={cn("w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center", sel ? "border-primary-foreground" : "border-border")}>
                          {sel && <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                        </span>
                        🛏 {lbl}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(configs[selIdx] || configs[0] || []).map((b: any) => (
                      <span key={b.id} className="flex items-center gap-1 bg-background border border-border px-2.5 py-1 rounded-lg text-xs font-semibold">🛏 {bedLabel(b)}</span>
                    ))}
                  </div>
                  {isEditing && <button type="button" onClick={() => setExpandedArea(area.id)} className="shrink-0 px-2.5 py-1 bg-secondary border border-border rounded-lg text-xs font-bold uppercase text-primary hover:bg-accent transition-colors">Alterar</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Early returns ─────────────────────────────────────────────────────────

  if (!currentProperty || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={40} />
    </div>
  );

  if (!stay) return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "governance"]}>
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">Estadia não encontrada.</p>
        <Link href="/admin/stays" className="text-primary text-sm font-bold hover:underline">← Voltar para Estadias</Link>
      </div>
    </RoleGuard>
  );

  const st = statusConfig[stay.status] ?? { label: stay.status, bg: "bg-secondary", text: "text-muted-foreground" };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "governance"]}>
      <style>{`@media print{.no-print{display:none!important}body{background:#fff}}`}</style>

      <div className="min-h-screen bg-background text-foreground">

        {/* ═══ ACTION BAR ════════════════════════════════════════════════════ */}
        <header className="no-print sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border">
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">

            {/* Left: breadcrumb + identity */}
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/admin/stays" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0">
                <ArrowLeft size={16} />
              </Link>
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-sm shrink-0">
                {guest?.fullName?.charAt(0) || "G"}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground truncate">{guest?.fullName || "—"}</span>
                  <span className={cn("hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-widest", st.bg, st.text)}>
                    {st.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono leading-none mt-0.5">{stay.accessCode}</p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isEditing ? (
                <>
                  {stay.status === "active" && (
                    <button onClick={handleToggleCheckOut} disabled={isSaving}
                      className="px-3 py-1.5 bg-orange-500/10 text-orange-600 hover:bg-orange-500 hover:text-white rounded-xl text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 disabled:opacity-50">
                      <LogOut size={13} /> Check-out
                    </button>
                  )}
                  {stay.status === "finished" && (
                    <button onClick={handleToggleCheckOut} disabled={isSaving}
                      className="px-3 py-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-xl text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 disabled:opacity-50">
                      <RotateCcw size={13} /> Reativar
                    </button>
                  )}
                  <button onClick={() => setIsEditing(true)}
                    className="px-3 py-1.5 hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 text-[11px] font-bold uppercase">
                    <Edit2 size={13} /> Editar
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleCancel} className="px-3 py-1.5 hover:bg-secondary rounded-xl text-muted-foreground text-[11px] font-bold uppercase transition-all">
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={isSaving}
                    className="px-4 py-1.5 bg-primary text-primary-foreground rounded-xl text-[11px] font-bold uppercase flex items-center gap-1.5 transition-all shadow-sm hover:opacity-90 disabled:opacity-50">
                    {isSaving ? <><Loader2 size={12} className="animate-spin" /> Salvando</> : <><Save size={12} /> Salvar</>}
                  </button>
                </>
              )}
              <button onClick={() => window.print()}
                className="px-3 py-1.5 bg-secondary hover:bg-accent rounded-xl text-[11px] font-bold uppercase flex items-center gap-1.5 transition-all">
                <Printer size={13} /> Imprimir
              </button>
            </div>
          </div>
        </header>

        {/* ═══ MAIN ═══════════════════════════════════════════════════════════ */}
        <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-4">

          {/* ── HERO: resumo visual ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
              {[
                {
                  label: "Check-in",
                  value: isEditing && !isGovOnly
                    ? <FI type="date" value={checkInStr} onChange={(e) => setCheckInStr(e.target.value)} className="mt-1" />
                    : <span className="text-lg font-black font-mono text-foreground">{stay.checkIn ? format(new Date(stay.checkIn), "dd/MM/yy") : "—"}</span>,
                  sub: stay.checkIn ? format(new Date(stay.checkIn), "EEEE") : "",
                  icon: Calendar,
                },
                {
                  label: "Check-out",
                  value: isEditing && !isGovOnly
                    ? <FI type="date" value={checkOutStr} onChange={(e) => setCheckOutStr(e.target.value)} className="mt-1" />
                    : <span className="text-lg font-black font-mono text-foreground">{stay.checkOut ? format(new Date(stay.checkOut), "dd/MM/yy") : "—"}</span>,
                  sub: `${nights} noite${nights !== 1 ? "s" : ""}`,
                  icon: Calendar,
                },
                {
                  label: "Ocupação (ACF)",
                  icon: Users,
                  value: isEditing ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex items-end gap-1.5">
                        {([ ["adults", "Ad", 1], ["children", "Cr", 0], ["babies", "Bb", 0] ] as [string, string, number][]).map(([key, lbl, min]) => (
                          <div key={key} className="flex flex-col items-center gap-0.5">
                            <input type="number" min={min} value={formData.counts?.[key] ?? min}
                              onChange={(e) => setFormData((p: any) => ({ ...p, counts: { ...p.counts, [key]: Math.max(min, +e.target.value) } }))}
                              className="w-10 bg-background border border-border rounded-lg px-1 py-1 text-xs text-center font-bold outline-none focus:border-primary/60" />
                            <span className="text-[8px] font-bold uppercase text-muted-foreground">{lbl}</span>
                          </div>
                        ))}
                        {acfDiverges && (
                          <button type="button"
                            onClick={() => setFormData((p: any) => ({ ...p, counts: actualCounts }))}
                            className="mb-4 ml-0.5 text-[8px] font-black uppercase text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg hover:bg-amber-500/20 transition-colors leading-tight whitespace-nowrap">
                            ↑ Ajustar
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-base font-black text-foreground">
                        {formData.counts?.adults ?? 1}A · {formData.counts?.children ?? 0}C{(formData.counts?.babies ?? 0) > 0 ? ` · ${formData.counts?.babies}B` : ""}
                      </span>
                      {acfDiverges && (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">⚠ Divergência</span>
                      )}
                    </div>
                  ),
                  sub: (() => {
                    const bA = stay.counts?.adults ?? 1;
                    const bC = stay.counts?.children ?? 0;
                    const bB = stay.counts?.babies ?? 0;
                    return `reserva: ${bA} ad${bC > 0 ? ` · ${bC} cr` : ""}${bB > 0 ? ` · ${bB} bb` : ""}`;
                  })(),
                },
                {
                  label: "Acomodação",
                  value: isEditing && !isGovOnly
                    ? <FS value={formData.cabinId} onChange={(e) => setFormData({ ...formData, cabinId: e.target.value })} className="mt-1">
                        {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </FS>
                    : <span className="text-base font-black text-foreground">{stay.cabinName || selectedCabin?.name || "—"}</span>,
                  sub: "",
                  icon: BedDouble,
                },
              ].map(({ label, value, sub, icon: Icon }) => (
                <div key={label} className="flex flex-col gap-0.5 p-4">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Icon size={10} className="text-primary/60" /> {label}
                  </span>
                  {value}
                  {sub && <span className="text-[10px] text-muted-foreground capitalize">{sub}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* ── CONTA & CONSUMO (full width) ─────────────────────────────────── */}
          <Card title="Conta & Consumo" icon={Receipt} iconColor="text-primary"
            action={
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Total</p>
                  <p className="text-base font-black text-primary leading-none">R$ {totalFolio.toFixed(2)}</p>
                </div>
                <button onClick={loadFolio} disabled={loadingFolio} className="p-1.5 rounded-lg bg-secondary hover:bg-accent transition-all disabled:opacity-50">
                  <RefreshCw size={13} className={loadingFolio ? "animate-spin" : ""} />
                </button>
              </div>
            }>
            <div className="flex gap-4 items-start flex-col xl:flex-row">

              {/* Table */}
              <div className="flex-1 min-w-0 border border-border rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-secondary/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-muted-foreground">Item / Descrição</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-center w-14">Qtd</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-right w-20">Unit.</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-muted-foreground text-right w-24">Total</th>
                      {!isGovOnly && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {folioItems.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">Nenhum consumo registrado nesta estadia.</td></tr>
                    ) : folioItems.map(item => (
                      <tr key={item.id} className={cn("hover:bg-muted/20 transition-colors text-sm", item.status === "paid" && "opacity-50")}>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          <div className="flex items-center gap-2.5">
                            {!isGovOnly && (
                              <button onClick={() => handleToggleFolioStatus(item.id, item.status || "pending")}
                                className={cn("w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0",
                                  item.status === "paid" ? "bg-green-500 border-green-500 text-white" : "border-border hover:border-primary")}>
                                {item.status === "paid" && <CheckCircle size={12} strokeWidth={3} />}
                              </button>
                            )}
                            <div>
                              <span className={item.status === "paid" ? "line-through text-muted-foreground" : ""}>{item.description}</span>
                              <p className="text-[10px] text-muted-foreground font-normal mt-0.5 flex items-center gap-1">
                                <Clock size={9} /> {item.createdAt ? format(new Date(item.createdAt), "dd/MM HH:mm") : "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-muted-foreground font-medium">{item.quantity}×</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">R$ {item.unitPrice.toFixed(2)}</td>
                        <td className="px-3 py-3 text-right font-black">R$ {item.totalPrice.toFixed(2)}</td>
                        {!isGovOnly && (
                          <td className="pr-3 py-3 text-right">
                            <button onClick={() => handleDeleteFolioItem(item.id, item.description)} className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add form */}
              {!isGovOnly && (
                <form onSubmit={handleAddFolioItem} className="xl:w-60 w-full bg-secondary/50 border border-border p-4 rounded-xl space-y-3 shrink-0">
                  <h4 className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-primary"><ShoppingCart size={13} /> Lançamento</h4>
                  <div>
                    <label className="text-[9px] font-bold uppercase text-muted-foreground">Produto / Serviço</label>
                    <input required value={newFolioItem.description} onChange={e => setNewFolioItem({ ...newFolioItem, description: e.target.value })}
                      placeholder="Ex: Lenha extra" className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold uppercase text-muted-foreground">Qtd</label>
                      <input type="number" min="1" required value={newFolioItem.quantity} onChange={e => setNewFolioItem({ ...newFolioItem, quantity: Number(e.target.value) })}
                        className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase text-muted-foreground">R$ Unit.</label>
                      <input type="number" step="0.01" min="0" required value={newFolioItem.unitPrice || ""} onChange={e => setNewFolioItem({ ...newFolioItem, unitPrice: Number(e.target.value) })}
                        className="mt-0.5 w-full bg-background border border-border px-3 py-2 rounded-xl text-xs outline-none focus:border-primary text-foreground" />
                    </div>
                  </div>
                  <button type="submit" disabled={loadingFolio} className="w-full py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-90 disabled:opacity-50">
                    Adicionar à Conta
                  </button>
                </form>
              )}
            </div>
          </Card>

          {/* ── 3-COL GRID: Hóspedes, Hospedagem, Viagem ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Card 1 — Hóspedes & Acompanhantes */}
            <Card title="Hóspedes & Acompanhantes" icon={Users}>
              <div className="space-y-3">

                {/* Titular section */}
                <div>
                  <FL icon={User}>Nome Completo</FL>
                  {locked ? <RV>{guestData.fullName}</RV> : <FI value={guestData.fullName} onChange={(e) => setGuestData({ ...guestData, fullName: e.target.value })} />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FL icon={FileText}>Nascimento</FL>
                    {locked ? <RV>{guestData.birthDate ? format(new Date(guestData.birthDate + "T12:00"), "dd/MM/yyyy") : ""}</RV>
                      : <FI type="date" value={guestData.birthDate} onChange={(e) => setGuestData({ ...guestData, birthDate: e.target.value })} />}
                  </div>
                  <div>
                    <FL icon={User}>Gênero</FL>
                    {locked ? <RV>{fnrhDomains?.generos.find(g => g.id === guestData.gender)?.label || guestData.gender}</RV>
                      : <FS value={guestData.gender} onChange={(e) => setGuestData({ ...guestData, gender: e.target.value })}>
                          <option value="" disabled>Selecione...</option>
                          {fnrhDomains?.generos.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                        </FS>}
                  </div>
                </div>
                <div>
                  <FL icon={FileText}>Documento</FL>
                  {locked ? (
                    <RV>{guestData.document?.type} · {guestData.document?.number}</RV>
                  ) : (
                    <div className="flex gap-2">
                      <FS className="w-[90px] shrink-0" value={guestData.document?.type} onChange={(e) => setGuestData({ ...guestData, document: { ...guestData.document, type: e.target.value } })}>
                        {fnrhDomains?.tiposDocumento.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
                      </FS>
                      <FI value={guestData.document?.number}
                        onBlur={() => { if (guestData.document?.type === "CPF" && guestData.document?.number && !validateCPF(guestData.document.number)) toast.error("CPF Inválido"); }}
                        onChange={(e) => setGuestData({ ...guestData, document: { ...guestData.document, number: e.target.value } })} />
                    </div>
                  )}
                </div>
                <div>
                  <FL icon={Phone}>WhatsApp / Contato</FL>
                  {locked ? <RV>{guestData.phone}</RV> : <FI value={guestData.phone} onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })} />}
                </div>
                <div>
                  <FL icon={MapPin}>CEP</FL>
                  {locked ? <RV mono>{guestData.address?.zipCode}</RV>
                    : <FI placeholder="00000-000" value={guestData.address?.zipCode}
                        onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, zipCode: e.target.value } })}
                        onBlur={(e) => fetchAddressByCep(e.target.value)} />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FL icon={MapPin}>Rua / Logradouro</FL>
                    {locked ? <RV>{guestData.address?.street}</RV> : <FI value={guestData.address?.street} onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, street: e.target.value } })} />}
                  </div>
                  <div>
                    <FL icon={MapPin}>Nº</FL>
                    {locked ? <RV>{guestData.address?.number}</RV> : <FI value={guestData.address?.number} onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, number: e.target.value } })} />}
                  </div>
                </div>
                <div>
                  <FL icon={MapPin}>Bairro</FL>
                  {locked ? <RV>{guestData.address?.neighborhood}</RV> : <FI value={guestData.address?.neighborhood} onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, neighborhood: e.target.value } })} />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FL icon={MapPin}>Cidade</FL>
                    {locked ? <RV>{guestData.address?.city}</RV> : <FI value={guestData.address?.city} onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, city: e.target.value } })} />}
                  </div>
                  <div>
                    <FL icon={MapPin}>UF</FL>
                    {locked ? <RV>{guestData.address?.state}</RV> : <FI maxLength={2} value={guestData.address?.state} onChange={(e) => setGuestData({ ...guestData, address: { ...guestData.address, state: e.target.value } })} />}
                  </div>
                </div>
                {guest?.id && (
                  <Link href={`/admin/guests?id=${guest.id}`} target="_blank"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline mt-1">
                    Ver no Cadastro <ExternalLink size={10} />
                  </Link>
                )}

                {/* Divider */}
                <hr className="border-border my-4" />

                {/* Acompanhantes section */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acompanhantes</span>
                  {isEditing && !isGovOnly && (
                    <div className="flex gap-1">
                      {(["adult", "child", "free"] as const).map(type => (
                        <button key={type} type="button"
                          onClick={() => setFormData({ ...formData, additionalGuests: [...(formData.additionalGuests || []), { id: Date.now().toString(), type, fullName: "", document: "" }] })}
                          className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[9px] font-black uppercase hover:bg-primary/20 transition-colors">
                          + {type === "adult" ? "Adulto" : type === "child" ? "Criança" : "Bebê"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {(formData.additionalGuests || []).length === 0 ? (
                  <div className="py-4 text-center border border-dashed border-border rounded-xl text-muted-foreground text-[11px] uppercase font-bold">
                    Sem acompanhantes
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(formData.additionalGuests || []).map((g: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 bg-secondary/40 border border-border p-2.5 rounded-xl">
                        <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded-lg shrink-0 border",
                          g.type === "adult" ? "bg-primary/10 text-primary border-primary/20" : g.type === "child" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-orange-500/10 text-orange-600 border-orange-500/20")}>
                          {g.type === "adult" ? "Adulto" : g.type === "child" ? "Criança" : "Bebê"}
                        </span>
                        <div className="flex-1 min-w-0">
                          {locked ? (
                            <p className="text-xs font-semibold text-foreground">{g.fullName || "—"} {g.document ? <span className="text-muted-foreground">· {g.document}</span> : null}</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                              <FI disabled={locked} value={g.fullName} placeholder="Nome" onChange={(e) => { const u = [...(formData.additionalGuests || [])]; u[idx] = { ...u[idx], fullName: e.target.value }; setFormData({ ...formData, additionalGuests: u }); }} />
                              <FI disabled={locked} value={g.document} placeholder="Doc." onChange={(e) => { const u = [...(formData.additionalGuests || [])]; u[idx] = { ...u[idx], document: e.target.value }; setFormData({ ...formData, additionalGuests: u }); }} />
                            </div>
                          )}
                        </div>
                        {isEditing && !isGovOnly && (
                          <button onClick={() => setFormData({ ...formData, additionalGuests: (formData.additionalGuests || []).filter((_: any, i: number) => i !== idx) })}
                            className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"><Trash2 size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Card 2 — Hospedagem */}
            <Card title="Hospedagem" icon={BedDouble} iconColor="text-amber-500">
              <div className="space-y-3">
                <AreaSection />
                <div>
                  <FL icon={FileText}>Notas de Montagem</FL>
                  {locked ? <RV>{formData.roomSetupNotes}</RV>
                    : <FI value={formData.roomSetupNotes} onChange={(e) => setFormData({ ...formData, roomSetupNotes: e.target.value })} placeholder="Ex: Berço extra, travesseiro pena..." />}
                </div>

                {/* Pedidos de Governança */}
                <div className="flex items-center justify-between">
                  <FL icon={Sparkles}>Pedidos de Governança</FL>
                  {isEditing && (
                    <button type="button" onClick={() => setFormData({ ...formData, housekeepingItems: [...(formData.housekeepingItems || []), { id: Date.now().toString(), label: "" }] })}
                      className="text-[9px] font-black uppercase bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20">
                      + Pedido
                    </button>
                  )}
                </div>
                {(formData.housekeepingItems || []).length === 0 && !isEditing ? (
                  <p className="text-xs text-muted-foreground italic text-center py-1">Nenhum pedido especial.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(formData.housekeepingItems || []).map((item: any) => (
                      <div key={item.id} className="flex gap-2 items-center">
                        <FI disabled={!isEditing} value={item.label} placeholder="Ex: Alérgico a pó..."
                          onChange={(e) => setFormData({ ...formData, housekeepingItems: (formData.housekeepingItems || []).map((i: any) => i.id === item.id ? { ...i, label: e.target.value } : i) })} />
                        {isEditing && <button type="button" onClick={() => setFormData({ ...formData, housekeepingItems: (formData.housekeepingItems || []).filter((i: any) => i.id !== item.id) })} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"><Trash2 size={13} /></button>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cesta Café */}
                <div className={cn("mt-2 flex items-center justify-between rounded-xl px-3 py-2.5 border",
                  formData.cestaBreakfastEnabled ? "bg-amber-500/10 border-amber-500/30" : "bg-secondary/40 border-border")}>
                  <div className="flex items-center gap-2">
                    <Coffee size={13} className={formData.cestaBreakfastEnabled ? "text-amber-500" : "text-muted-foreground"} />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Cesta Café da Manhã</p>
                      <p className="text-[9px] text-muted-foreground">{formData.cestaBreakfastEnabled ? "Habilitada via portal" : "Padrão da propriedade"}</p>
                    </div>
                  </div>
                  <button type="button" disabled={locked || isGovOnly}
                    onClick={() => setFormData({ ...formData, cestaBreakfastEnabled: !formData.cestaBreakfastEnabled })}
                    className={cn("relative w-10 h-5 rounded-full transition-all disabled:opacity-50 shrink-0", formData.cestaBreakfastEnabled ? "bg-amber-500" : "bg-border")}>
                    <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", formData.cestaBreakfastEnabled && "translate-x-5")} />
                  </button>
                </div>

                {/* Pet */}
                <div className="flex items-center justify-between pt-1">
                  <FL icon={PawPrint}>Pet</FL>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium">Com pet?</span>
                    <button type="button" disabled={locked}
                      onClick={() => setFormData({ ...formData, hasPet: !formData.hasPet })}
                      className={cn("relative w-10 h-5 rounded-full transition-all disabled:opacity-50", formData.hasPet ? "bg-orange-500" : "bg-border")}>
                      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", formData.hasPet && "translate-x-5")} />
                    </button>
                  </div>
                </div>
                {formData.hasPet && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <FL icon={PawPrint}>Nome do Pet</FL>
                      {locked ? <RV>{formData.petDetails?.name}</RV> : <FI value={formData.petDetails?.name} onChange={(e) => setFormData({ ...formData, petDetails: { ...formData.petDetails, name: e.target.value } })} />}
                    </div>
                    <div>
                      <FL icon={PawPrint}>Espécie</FL>
                      {locked ? <RV>{formData.petDetails?.species}</RV>
                        : <FS value={formData.petDetails?.species} onChange={(e) => setFormData({ ...formData, petDetails: { ...formData.petDetails, species: e.target.value } })}>
                            <option>Cachorro</option><option>Gato</option><option>Outro</option>
                          </FS>}
                    </div>
                    <div>
                      <FL icon={PawPrint}>Peso (kg)</FL>
                      {locked ? <RV>{formData.petDetails?.weight}kg</RV>
                        : <FI type="number" value={formData.petDetails?.weight || ""} onChange={(e) => setFormData({ ...formData, petDetails: { ...formData.petDetails, weight: Number(e.target.value) } })} />}
                    </div>
                    <div className="col-span-2">
                      <FL icon={PawPrint}>Raça</FL>
                      {locked ? <RV>{formData.petDetails?.breed}</RV> : <FI value={formData.petDetails?.breed} onChange={(e) => setFormData({ ...formData, petDetails: { ...formData.petDetails, breed: e.target.value } })} />}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Card 3 — Viagem & Carro */}
            <Card title="Viagem & Carro" icon={Plane} iconColor="text-violet-500">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FL icon={Plane}>Motivo da Viagem</FL>
                    {locked ? <RV>{fnrhDomains?.motivos.find(m => m.id === formData.travelReason)?.label || formData.travelReason}</RV>
                      : <FS value={formData.travelReason} onChange={(e) => setFormData({ ...formData, travelReason: e.target.value })}>
                          <option value="" disabled>Selecione...</option>
                          {fnrhDomains?.motivos.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </FS>}
                  </div>
                  <div>
                    <FL icon={Car}>Transporte</FL>
                    {locked ? <RV>{fnrhDomains?.transportes.find(t => t.id === formData.transportation)?.label || formData.transportation}</RV>
                      : <FS value={formData.transportation} onChange={(e) => setFormData({ ...formData, transportation: e.target.value })}>
                          <option value="" disabled>Selecione...</option>
                          {fnrhDomains?.transportes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </FS>}
                  </div>
                </div>
                {["CARRO", "MOTO"].includes(formData.transportation || "") && (
                  <div>
                    <FL icon={Car}>Placa do Veículo</FL>
                    {locked ? <RV mono>{formData.vehiclePlate}</RV>
                      : <FI value={formData.vehiclePlate} onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC1D23" />}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FL icon={MapPin}>Origem</FL>
                    {locked ? <RV>{formData.lastCity}</RV>
                      : <FI value={formData.lastCity} onChange={(e) => setFormData({ ...formData, lastCity: e.target.value })} placeholder="Cidade/UF" />}
                  </div>
                  <div>
                    <FL icon={MapPin}>Próximo Destino</FL>
                    {locked ? <RV>{formData.nextCity}</RV>
                      : <FI value={formData.nextCity} onChange={(e) => setFormData({ ...formData, nextCity: e.target.value })} placeholder="Cidade/UF" />}
                  </div>
                </div>
              </div>
            </Card>

          </div>

        </main>
      </div>

      {/* ── Transfer Dialog ─────────────────────────────────────────────────── */}
      {transferDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-background w-full max-w-sm rounded-[24px] shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><Sparkles className="text-amber-500" size={28} /></div>
            <h2 className="text-lg font-bold mb-1">Mudança de Acomodação</h2>
            <p className="text-sm text-muted-foreground mb-5">O hóspede já fez check-in. A cabana anterior precisa de faxina de troca?</p>
            <div className="flex flex-col gap-2">
              <button onClick={async () => { setTransferDialogOpen(false); await doSave(pendingTransferCabinId, "cleaning"); setPendingTransferCabinId(null); }}
                className="w-full py-2.5 bg-amber-500/10 border border-amber-500 text-amber-600 font-bold uppercase text-xs rounded-xl hover:bg-amber-500 hover:text-white transition-all">
                Sim, Gerar Faxina de Troca
              </button>
              <button onClick={async () => { setTransferDialogOpen(false); await doSave(pendingTransferCabinId, "available"); setPendingTransferCabinId(null); }}
                className="w-full py-2.5 bg-secondary text-foreground font-bold uppercase text-xs rounded-xl border border-border hover:bg-muted transition-all">
                Não, Apenas Liberar
              </button>
              <button onClick={() => { setTransferDialogOpen(false); setPendingTransferCabinId(null); }}
                className="w-full py-2.5 text-muted-foreground font-bold uppercase text-xs rounded-xl hover:bg-secondary/50 transition-all">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
