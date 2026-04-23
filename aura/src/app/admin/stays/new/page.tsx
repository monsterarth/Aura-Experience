// src/app/admin/stays/new/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { StayService } from "@/services/stay-service";
import { CabinService } from "@/services/cabin-service";
import { ContactService } from "@/services/contact-service"; // NOVO: Para já inserir na agenda
import { chatwootSyncOnStayCreated } from "@/app/actions/chatwoot-actions";
import { validateCPF } from "@/lib/utils-checkin";
import { Cabin } from "@/types/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  UserSearch,
  Home,
  Users,
  Loader2,
  Search,
  PlusCircle,
  Building2,
  Trash2,
  Key,
  ArrowLeft,
  Calendar as CalendarIcon,
  Map
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// Importações do Calendário
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CabinSelection {
  cabinId: string;
  name: string;
  adults: number;
  children: number;
  babies: number;
}

function NewStayPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userData } = useAuth();
  const { currentProperty: contextProperty } = useProperty();

  // Query params from reservation map drag-to-create and guests page
  const prefilledCabinId = searchParams.get('cabinId');
  const prefilledCheckIn = searchParams.get('checkIn');
  const prefilledCheckOut = searchParams.get('checkOut');
  const prefilledGuestId = searchParams.get('guestId');

  const [loading, setLoading] = useState(false);
  const [searchingGuest, setSearchingGuest] = useState(false);
  const [availableCabins, setAvailableCabins] = useState<Cabin[]>([]);

  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [guestData, setGuestData] = useState({
    fullName: "",
    email: "",
    phone: "",
    preferredLanguage: "pt" as "pt" | "en" | "es"
  });

  const [cabinSelections, setCabinSelections] = useState<CabinSelection[]>([]);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (prefilledCheckIn && prefilledCheckOut) {
      return {
        from: new Date(prefilledCheckIn + 'T12:00:00'),
        to: new Date(prefilledCheckOut + 'T12:00:00'),
      };
    }
    return { from: addDays(new Date(), 1), to: addDays(new Date(), 3) };
  });

  const [sendAutomations, setSendAutomations] = useState(true);
  const [createdInfo, setCreatedInfo] = useState<{ code: string } | null>(null);

  useEffect(() => {
    if (!contextProperty?.id) return;

    CabinService.getCabinsByProperty(contextProperty.id).then((cabinsData) => {
      setAvailableCabins(cabinsData);
      if (prefilledCabinId && cabinSelections.length === 0) {
        const match = cabinsData.find(c => c.id === prefilledCabinId);
        if (match) {
          setCabinSelections([{ cabinId: match.id, name: match.name, adults: 2, children: 0, babies: 0 }]);
        }
      }
    });

    // Pre-fill guest from guestId query param (comes from /admin/guests)
    if (prefilledGuestId) {
      GuestService.findByDocument(contextProperty.id, prefilledGuestId).then(guest => {
        if (guest) {
          setDocNumber(guest.id);
          setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: guest.phone ? guest.phone.replace(/\D/g, '') : "", preferredLanguage: (guest.preferredLanguage as "pt" | "en" | "es") || "pt" });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextProperty?.id]);

  const handleSearchGuest = async () => {
    if (!docNumber || !contextProperty?.id) return;
    setSearchingGuest(true);
    try {
      const guest = await GuestService.findByDocument(contextProperty.id, docNumber);
      if (guest) {
        setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: guest.phone ? guest.phone.replace(/\D/g, '') : "", preferredLanguage: (guest.preferredLanguage as "pt" | "en" | "es") || "pt" });
        toast.info("Hóspede encontrado!");
      } else {
        toast.info("Hóspede novo. Preencha os dados.");
      }
    } finally { setSearchingGuest(false); }
  };

  const toggleCabin = (cabin: Cabin) => {
    setCabinSelections(prev => {
      const exists = prev.find(s => s.cabinId === cabin.id);
      if (exists) return prev.filter(s => s.cabinId !== cabin.id);
      return [...prev, { cabinId: cabin.id, name: cabin.name, adults: 2, children: 0, babies: 0 }];
    });
  };

  const updateCabinACF = (idx: number, field: string, val: number) => {
    const newSels = [...cabinSelections];
    (newSels[idx] as any)[field] = val;
    setCabinSelections(newSels);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextProperty?.id || !userData?.id) return;

    if (!guestData.fullName || cabinSelections.length === 0 || !dateRange?.from || !dateRange?.to) {
      return toast.error("Nome, Cabanas e Período completo são obrigatórios.");
    }

    if (docType === "CPF" && docNumber && !validateCPF(docNumber)) {
      return toast.error("CPF inválido. Verifique o número digitado.");
    }

    const cleanedPhone = guestData.phone.replace(/\D/g, '');

    if (cleanedPhone.length < 10) {
      return toast.error("O número de WhatsApp digitado é muito curto.");
    }

    setLoading(true);
    const toastId = toast.loading("Validando número na Meta (WhatsApp)...");

    try {
      // 1. O PORTÃO DE SEGURANÇA: Validar o WhatsApp antes de sujar o banco
      const whatsRes = await fetch('/api/whatsapp/check-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanedPhone, propertyId: contextProperty.id })
      });

      const whatsData = await whatsRes.json();

      if (!whatsRes.ok || !whatsData.exists) {
        // Avisa mas não bloqueia — falsos negativos ocorrem com DDIs internacionais (ex: Uruguai +598)
        toast.warning("WhatsApp não confirmado pela API, mas prosseguindo com a reserva.", { id: toastId });
      } else {
        toast.success("WhatsApp Validado! Criando registros...", { id: toastId });
      }

      // Usa sempre o número já limpo pelo frontend (o validNumber da API não é confiável)
      const finalPhone = cleanedPhone;

      // 2. VERIFICA SE O NÚMERO JÁ PERTENCE A OUTRO HÓSPEDE
      const existingContact = await ContactService.findByPhone(contextProperty.id, finalPhone);
      if (existingContact?.isGuest && existingContact.guestId) {
        const cleanDoc = docNumber.replace(/\D/g, '');
        const isConflict = cleanDoc
          ? existingContact.guestId !== cleanDoc
          : existingContact.name.toLowerCase() !== guestData.fullName.toLowerCase();

        if (isConflict) {
          toast.warning(
            `Atenção: este número já está cadastrado para "${existingContact.name}". Prosseguindo com a reserva.`,
            { duration: 6000 }
          );
        }
      }

      // 3. CRIA O HÓSPEDE FÍSICO
      const cleanDoc = docNumber.replace(/\D/g, '');
      const initialGuestId = cleanDoc.length > 0 ? cleanDoc : `GUEST-${Date.now()}`;

      const savedGuestId = await GuestService.upsertGuest(contextProperty.id, {
        id: initialGuestId,
        propertyId: contextProperty.id,
        fullName: guestData.fullName,
        email: guestData.email,
        phone: finalPhone,
        nationality: 'Brasil',
        document: { type: docType, number: docNumber || 'N/A' },
        preferredLanguage: guestData.preferredLanguage,
        birthDate: "", gender: "Outro", occupation: "", allergies: [],
        address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" }
      });

      // 4. INJETA NA AGENDA IMEDIATAMENTE (Para a Central de Comunicação)
      await ContactService.upsertContact(
        contextProperty.id,
        guestData.fullName,
        finalPhone,
        true, // isGuest
        savedGuestId
      );

      // 5. FINALMENTE, CRIA A ESTADIA
      const result = await StayService.createStayRecord({
        propertyId: contextProperty.id,
        guestId: savedGuestId,
        cabinConfigs: cabinSelections,
        checkIn: dateRange.from,
        checkOut: dateRange.to,
        sendAutomations,
        actorId: userData.id,
        actorName: userData.fullName
      });

      chatwootSyncOnStayCreated(contextProperty.id, savedGuestId, result.stayId).catch(() => {});

      setCreatedInfo({ code: result.accessCode });
    } catch (error: any) {
      console.error(error);
      if (error?.message?.startsWith('CABIN_OVERLAP:')) {
        const conflictingCabinId = error.message.split(':')[1];
        const sel = cabinSelections.find(s => s.cabinId === conflictingCabinId);
        const cabinName = sel?.name || conflictingCabinId;
        toast.error(`Conflito de datas: ${cabinName} já possui uma reserva neste período.`, { id: toastId, duration: 6000 });
      } else {
        toast.error("Erro interno ao processar hospedagem.", { id: toastId });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4 md:space-y-8 pb-20 animate-in fade-in duration-500">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="space-y-1">
            <Link href="/admin/stays" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors mb-2">
              <ArrowLeft size={14} /> Voltar
            </Link>
            <h1 className="text-3xl font-black flex items-center gap-3 text-foreground">
              <PlusCircle className="text-primary" size={32} /> Nova Hospedagem
            </h1>
          </div>

          <div className="flex items-center gap-3 bg-card border border-border px-6 py-3 rounded-2xl">
            <div className="p-2 bg-secondary rounded-full">
              <Building2 size={16} className="text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Propriedade Ativa</span>
              <span className="text-sm font-bold text-foreground">{contextProperty?.name || "Carregando..."}</span>
            </div>
          </div>
        </header>

        <form onSubmit={handleCreate} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Seção de Hóspede */}
            <div className="bg-card border border-border p-6 rounded-[24px] space-y-6">
              <h2 className="flex items-center gap-2 font-bold text-foreground border-b border-border pb-4">
                <UserSearch size={18} className="text-primary" /> Identificação
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Documento (Opcional)</label>
                  <div className="flex gap-2">
                    <select
                      value={docType}
                      onChange={e => setDocType(e.target.value)}
                      className="p-3 bg-secondary border border-border rounded-xl text-foreground outline-none focus:border-primary/50 transition-colors text-sm w-32 shrink-0"
                    >
                      <option value="CPF">CPF</option>
                      <option value="PASSAPORTE">Passaporte</option>
                      <option value="RG">RG</option>
                      <option value="CNH">CNH</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                    <input
                      value={docNumber}
                      onChange={e => setDocNumber(e.target.value)}
                      onBlur={handleSearchGuest}
                      className="flex-1 p-3 bg-secondary border border-border rounded-xl text-foreground outline-none focus:border-primary/50 transition-colors"
                      placeholder="Nº do documento..."
                    />
                    <button type="button" onClick={handleSearchGuest} className="p-3 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors shrink-0">
                      {searchingGuest ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Nome do Titular *</label>
                  <input required value={guestData.fullName} onChange={e => setGuestData({ ...guestData, fullName: e.target.value.toUpperCase() })} className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">WhatsApp *</label>
                  <div className="flex">
                    <span className="flex items-center px-3 bg-secondary border border-r-0 border-border rounded-l-xl text-sm font-bold text-foreground">+</span>
                    <input
                      required
                      type="tel"
                      autoComplete="tel"
                      value={(guestData.phone ?? "").replace(/\D/g, "")}
                      onChange={e => setGuestData({ ...guestData, phone: e.target.value.replace(/\D/g, "") })}
                      placeholder="55 53 98116-9216"
                      className="flex-1 p-3 bg-secondary border border-border rounded-r-xl text-foreground font-mono outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">E-mail (Opcional)</label>
                  <input type="email" value={guestData.email} onChange={e => setGuestData({ ...guestData, email: e.target.value })} className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Idioma de Comunicação</label>
                  <select
                    value={guestData.preferredLanguage}
                    onChange={e => setGuestData({ ...guestData, preferredLanguage: e.target.value as "pt" | "en" | "es" })}
                    className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground outline-none focus:border-primary/50 transition-colors"
                  >
                    <option value="pt">🇧🇷 Português</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="es">🇦🇷 Español</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Configuração das Cabanas */}
            {cabinSelections.length > 0 && (
              <div className="bg-card border border-border p-6 rounded-[24px] space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <h2 className="flex items-center gap-2 font-bold text-foreground border-b border-border pb-4">
                  <Users size={18} className="text-primary" /> Configuração ACF (Por Cabana)
                </h2>
                <div className="space-y-4">
                  {cabinSelections.map((sel, idx) => (
                    <div key={sel.cabinId} className="flex flex-col md:flex-row items-center gap-4 bg-secondary border border-border p-4 rounded-2xl">
                      <div className="flex-1 font-bold text-foreground text-lg">{sel.name}</div>
                      <div className="flex gap-4 bg-background border border-border p-2 rounded-xl">
                        <div className="text-center px-2">
                          <p className="text-[9px] font-bold uppercase text-muted-foreground mb-1">Adultos</p>
                          <input type="number" min={1} value={sel.adults} onChange={e => updateCabinACF(idx, 'adults', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-primary outline-none border-b border-primary/20 focus:border-primary" />
                        </div>
                        <div className="text-center border-x border-border px-4">
                          <p className="text-[9px] font-bold uppercase text-muted-foreground mb-1">Crianças</p>
                          <input type="number" min={0} value={sel.children} onChange={e => updateCabinACF(idx, 'children', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-foreground outline-none border-b border-border focus:border-primary/50" />
                        </div>
                        <div className="text-center px-2">
                          <p className="text-[9px] font-bold uppercase text-muted-foreground mb-1">Bebês</p>
                          <input type="number" min={0} value={sel.babies} onChange={e => updateCabinACF(idx, 'babies', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-foreground outline-none border-b border-border focus:border-primary/50" />
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleCabin({ id: sel.cabinId, name: sel.name } as any)} className="text-destructive p-3 hover:bg-destructive/10 rounded-xl transition-colors">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            {/* Seletor de Cabanas */}
            <div className="bg-card border border-border p-6 rounded-[24px] space-y-4">
              <h2 className="flex items-center gap-2 font-bold text-foreground border-b border-border pb-4">
                <Home size={18} className="text-primary" /> Unidades Disponíveis
              </h2>
              {availableCabins.length === 0 ? (
                <p className="text-center text-muted-foreground text-xs py-8">Nenhuma cabana encontrada nesta propriedade.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {availableCabins.map(cabin => (
                    <button
                      key={cabin.id}
                      type="button"
                      onClick={() => toggleCabin(cabin)}
                      className={cn(
                        "p-3 rounded-xl border text-[10px] font-bold uppercase transition-all hover:scale-[1.02]",
                        cabinSelections.find(s => s.cabinId === cabin.id)
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                          : "border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {cabin.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Controle de Datas */}
            <div className="bg-card border border-border p-6 rounded-[24px] space-y-4 sticky top-6">

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Período da Hospedagem *</label>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-4 p-3 bg-secondary border border-border rounded-xl hover:border-primary/50 focus:border-primary/50 transition-colors text-left",
                        !dateRange && "text-muted-foreground",
                        dateRange ? "text-foreground" : ""
                      )}
                    >
                      <CalendarIcon className="text-primary shrink-0 ml-1" size={24} />
                      <div className="flex flex-col flex-1 gap-1">
                        {dateRange?.from ? (
                          <>
                            <div className="text-sm font-bold flex items-center gap-1">
                              <span className="text-muted-foreground font-normal uppercase text-[10px] w-14">Entrada:</span>
                              {format(dateRange.from, "dd/MM/yy", { locale: ptBR })}
                            </div>
                            <div className="text-sm font-bold flex items-center gap-1">
                              <span className="text-muted-foreground font-normal uppercase text-[10px] w-14">Saída:</span>
                              {dateRange.to ? format(dateRange.to, "dd/MM/yy", { locale: ptBR }) : "--/--/--"}
                            </div>
                          </>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">Selecione o período</span>
                        )}
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-border bg-card shadow-2xl rounded-2xl" align="center">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from || new Date()}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={1}
                      locale={ptBR}
                      disabled={(date: Date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="bg-card text-foreground"
                    />
                  </PopoverContent>
                </Popover>

              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-secondary rounded-xl border border-border hover:bg-accent transition-colors mt-4">
                <input type="checkbox" checked={sendAutomations} onChange={e => setSendAutomations(e.target.checked)} className="accent-primary w-4 h-4" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-tighter">Automação de WhatsApp</span>
                  <span className="text-[9px] text-muted-foreground">48h e 24h pré-estadia</span>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading || cabinSelections.length === 0 || !contextProperty?.id}
                className="w-full py-4 bg-primary text-primary-foreground font-black text-lg uppercase tracking-wider rounded-[20px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all active:scale-95 mt-4"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Confirmar Reserva"}
              </button>
            </div>
          </aside>
        </form>

        {/* Modal de Sucesso */}
        {createdInfo && (
          <div className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
            <div className="bg-card border border-border p-10 rounded-[40px] max-w-sm w-full text-center space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

              <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
                <Key size={48} />
              </div>

              <div>
                <h3 className="text-3xl font-black text-foreground tracking-tighter">Reserva Criada!</h3>
                <p className="text-muted-foreground mt-2 text-sm font-medium">Hospedagem registrada com sucesso no sistema Aura.</p>
              </div>

              <div className="bg-secondary p-8 rounded-3xl border border-border relative group">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Aura Access Code</span>
                <div className="text-5xl font-black text-primary tracking-tighter mt-2 group-hover:scale-110 transition-transform duration-300">
                  {createdInfo.code}
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => router.push("/admin/stays")}
                  className="flex-1 py-4 bg-foreground text-background font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-colors text-sm"
                >
                  Estadias
                </button>
                <button
                  onClick={() => router.push("/admin/reservation-map")}
                  className="flex-1 py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Map size={18} /> Mapa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

export default function NewStayPage() {
  return (
    <Suspense fallback={<div className="p-8 flex items-center justify-center"><span className="text-muted-foreground">Carregando...</span></div>}>
      <NewStayPageContent />
    </Suspense>
  );
}
