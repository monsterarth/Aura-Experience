// src/app/admin/stays/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { StayService } from "@/services/stay-service";
import { CabinService } from "@/services/cabin-service";
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
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CabinSelection {
  cabinId: string;
  name: string;
  adults: number;
  children: number;
  babies: number;
}

export default function NewStayPage() {
  const router = useRouter();
  const { userData } = useAuth();
  const { property: contextProperty } = useProperty();
  
  const [loading, setLoading] = useState(false);
  const [searchingGuest, setSearchingGuest] = useState(false);
  const [availableCabins, setAvailableCabins] = useState<Cabin[]>([]);
  
  const [docNumber, setDocNumber] = useState("");
  const [guestData, setGuestData] = useState({
    fullName: "",
    email: "",
    phone: ""
  });

  const [cabinSelections, setCabinSelections] = useState<CabinSelection[]>([]);
  const [stayDates, setStayDates] = useState({ checkIn: "", checkOut: "" });
  const [sendAutomations, setSendAutomations] = useState(true);

  const [createdInfo, setCreatedInfo] = useState<{code: string} | null>(null);

  // Carrega as cabanas assim que a propriedade do contexto estiver disponível
  useEffect(() => {
    if (contextProperty?.id) {
        CabinService.getCabinsByProperty(contextProperty.id).then(setAvailableCabins);
    }
  }, [contextProperty?.id]);

  const handleSearchGuest = async () => {
    if (!docNumber || !contextProperty?.id) return;
    setSearchingGuest(true);
    try {
      const guest = await GuestService.findByDocument(contextProperty.id, docNumber);
      if (guest) {
        setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: guest.phone });
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

    if (!guestData.fullName || cabinSelections.length === 0 || !stayDates.checkIn) {
      return toast.error("Nome, Datas e Cabanas são obrigatórios.");
    }

    setLoading(true);
    try {
      const finalGuestId = docNumber ? `GUEST-${docNumber.replace(/\D/g, '')}` : `GUEST-${Date.now()}`;
      
      await GuestService.upsertGuest(contextProperty.id, {
        id: finalGuestId,
        propertyId: contextProperty.id,
        fullName: guestData.fullName,
        email: guestData.email,
        phone: guestData.phone,
        nationality: 'Brasil', 
        document: { type: 'CPF', number: docNumber || 'N/A' },
        birthDate: "", gender: "Outro", occupation: "", allergies: [],
        address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" }
      });

      const result = await StayService.createStayRecord({
        propertyId: contextProperty.id,
        guestId: finalGuestId,
        cabinConfigs: cabinSelections,
        checkIn: new Date(stayDates.checkIn),
        checkOut: new Date(stayDates.checkOut),
        sendAutomations,
        actorId: userData.id,
        actorName: userData.fullName
      });

      setCreatedInfo({ code: result.accessCode });
      toast.success("Reserva Aura criada!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar.");
    } finally { setLoading(false); }
  };

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="p-8 max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
        
        {/* Header Simplificado */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="space-y-1">
                <Link href="/admin/stays" className="text-white/40 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors mb-2">
                    <ArrowLeft size={14} /> Voltar
                </Link>
                <h1 className="text-3xl font-black flex items-center gap-3 text-white">
                    <PlusCircle className="text-primary" size={32}/> Nova Hospedagem
                </h1>
            </div>

            {/* Indicador de Propriedade Ativa */}
            <div className="flex items-center gap-3 bg-[#141414] border border-white/10 px-6 py-3 rounded-2xl">
                <div className="p-2 bg-white/5 rounded-full">
                    <Building2 size={16} className="text-primary"/>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Propriedade Ativa</span>
                    <span className="text-sm font-bold text-white">{contextProperty?.name || "Carregando..."}</span>
                </div>
            </div>
        </header>

        <form onSubmit={handleCreate} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Seção de Hóspede */}
            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-6">
              <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4">
                <UserSearch size={18} className="text-primary"/> Identificação
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">CPF/Passaporte (Opcional)</label>
                  <div className="flex gap-2">
                    <input 
                        value={docNumber} 
                        onChange={e => setDocNumber(e.target.value)} 
                        onBlur={handleSearchGuest} 
                        className="flex-1 p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors"
                        placeholder="Digite para buscar..."
                    />
                    <button type="button" onClick={handleSearchGuest} className="p-3 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors">
                      {searchingGuest ? <Loader2 className="animate-spin" size={20}/> : <Search size={20}/>}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">Nome do Titular *</label>
                  <input required value={guestData.fullName} onChange={e => setGuestData({...guestData, fullName: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">WhatsApp *</label>
                  <input required value={guestData.phone} onChange={e => setGuestData({...guestData, phone: e.target.value})} placeholder="+55..." className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">E-mail (Opcional)</label>
                  <input type="email" value={guestData.email} onChange={e => setGuestData({...guestData, email: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-primary/50 transition-colors"/>
                </div>
              </div>
            </div>

            {/* Configuração das Cabanas Selecionadas */}
            {cabinSelections.length > 0 && (
              <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4">
                    <Users size={18} className="text-primary"/> Configuração ACF (Por Cabana)
                </h2>
                <div className="space-y-4">
                  {cabinSelections.map((sel, idx) => (
                    <div key={sel.cabinId} className="flex flex-col md:flex-row items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex-1 font-bold text-white text-lg">{sel.name}</div>
                      <div className="flex gap-4 bg-black/20 p-2 rounded-xl">
                        <div className="text-center px-2">
                          <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Adultos</p>
                          <input type="number" min={1} value={sel.adults} onChange={e => updateCabinACF(idx, 'adults', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-primary outline-none border-b border-primary/20 focus:border-primary" />
                        </div>
                        <div className="text-center border-x border-white/10 px-4">
                          <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Crianças</p>
                          <input type="number" min={0} value={sel.children} onChange={e => updateCabinACF(idx, 'children', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-white outline-none border-b border-white/10 focus:border-white" />
                        </div>
                        <div className="text-center px-2">
                          <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Bebês</p>
                          <input type="number" min={0} value={sel.babies} onChange={e => updateCabinACF(idx, 'babies', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-white outline-none border-b border-white/10 focus:border-white" />
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleCabin({id: sel.cabinId, name: sel.name} as any)} className="text-destructive p-3 hover:bg-destructive/10 rounded-xl transition-colors">
                        <Trash2 size={20}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            {/* Seletor de Cabanas */}
            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-4">
              <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4">
                <Home size={18} className="text-primary"/> Unidades Disponíveis
              </h2>
              {availableCabins.length === 0 ? (
                 <p className="text-center text-white/30 text-xs py-8">Nenhuma cabana encontrada nesta propriedade.</p>
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
                                : "border-white/5 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        {cabin.name}
                    </button>
                    ))}
                </div>
              )}
            </div>

            {/* Controle de Datas e Submit */}
            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-4 sticky top-6">
              <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-white/40">Check-in</label>
                    <input required type="date" value={stayDates.checkIn} onChange={e => setStayDates({...stayDates, checkIn: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white invert focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-white/40">Check-out</label>
                    <input required type="date" value={stayDates.checkOut} onChange={e => setStayDates({...stayDates, checkOut: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white invert focus:outline-none focus:border-primary/50" />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                <input type="checkbox" checked={sendAutomations} onChange={e => setSendAutomations(e.target.checked)} className="accent-primary w-4 h-4" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter">Automação de WhatsApp</span>
                    <span className="text-[9px] text-white/30">48h e 24h pré-estadia</span>
                </div>
              </label>
              
              <button 
                type="submit" 
                disabled={loading || cabinSelections.length === 0 || !contextProperty?.id} 
                className="w-full py-4 bg-primary text-black font-black text-lg uppercase tracking-wider rounded-[20px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-all active:scale-95"
            >
                {loading ? <Loader2 className="animate-spin" /> : "Confirmar Reserva"}
              </button>
            </div>
          </aside>
        </form>

        {/* Modal de Sucesso */}
        {createdInfo && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
            <div className="bg-[#141414] border border-white/10 p-10 rounded-[40px] max-w-sm w-full text-center space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
              
              <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
                <Key size={48}/>
              </div>
              
              <div>
                <h3 className="text-3xl font-black text-white tracking-tighter">Reserva Criada!</h3>
                <p className="text-white/40 mt-2 text-sm font-medium">Hospedagem registrada com sucesso no sistema Aura.</p>
              </div>
              
              <div className="bg-white/5 p-8 rounded-3xl border border-white/5 relative group">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">Aura Access Code</span>
                <div className="text-5xl font-black text-primary tracking-tighter mt-2 group-hover:scale-110 transition-transform duration-300">
                    {createdInfo.code}
                </div>
              </div>
              
              <button 
                onClick={() => router.push("/admin/stays")} 
                className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-colors"
              >
                Voltar ao Painel
              </button>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}