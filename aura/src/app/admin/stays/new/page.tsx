// src/app/admin/stays/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { GuestService } from "@/services/guest-service";
import { StayService } from "@/services/stay-service";
import { CabinService } from "@/services/cabin-service";
import { PropertyService } from "@/services/property-service";
import { Cabin, Guest, Property } from "@/types/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { 
  UserSearch, 
  Calendar, 
  Home, 
  Users, 
  MessageSquare, 
  Loader2, 
  Search, 
  PlusCircle, 
  Check, 
  Building2, 
  Trash2, 
  Key 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CabinSelection {
  cabinId: string;
  name: string;
  adults: number;
  children: number;
  babies: number;
}

export default function NewStayPage() {
  const { userData, isSuperAdmin } = useAuth();
  const { property: contextProperty } = useProperty();
  
  const [loading, setLoading] = useState(false);
  const [searchingGuest, setSearchingGuest] = useState(false);
  const [availableCabins, setAvailableCabins] = useState<Cabin[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
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

  useEffect(() => {
    if (isSuperAdmin) PropertyService.getAllProperties().then(setAllProperties);
    const pId = userData?.propertyId || contextProperty?.id;
    if (pId) setSelectedPropertyId(pId);
  }, [userData, contextProperty, isSuperAdmin]);

  useEffect(() => {
    if (selectedPropertyId) CabinService.getCabinsByProperty(selectedPropertyId).then(setAvailableCabins);
  }, [selectedPropertyId]);

  const handleSearchGuest = async () => {
    if (!docNumber || !selectedPropertyId) return;
    setSearchingGuest(true);
    try {
      const guest = await GuestService.findByDocument(selectedPropertyId, docNumber);
      if (guest) {
        setGuestData({ fullName: guest.fullName, email: guest.email || "", phone: guest.phone });
        toast.info("Hóspede encontrado!");
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
    if (!guestData.fullName || cabinSelections.length === 0 || !stayDates.checkIn) {
      return toast.error("Nome, Datas e Cabanas são obrigatórios.");
    }

    setLoading(true);
    try {
      const finalGuestId = docNumber || `GUEST-${Date.now()}`;
await GuestService.upsertGuest(selectedPropertyId, {
  id: finalGuestId,
  propertyId: selectedPropertyId,
  fullName: guestData.fullName,
  email: guestData.email,
  phone: guestData.phone,
  nationality: 'Brasil', // Adicionado para corrigir o erro TS
  document: { type: 'CPF', number: docNumber || 'N/A' },
  birthDate: "", gender: "Outro", occupation: "", allergies: [],
  address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" }
});

      const result = await StayService.createStayRecord({
        propertyId: selectedPropertyId,
        guestId: finalGuestId,
        cabinConfigs: cabinSelections,
        checkIn: new Date(stayDates.checkIn),
        checkOut: new Date(stayDates.checkOut),
        sendAutomations,
        actorId: userData!.id,
        actorName: userData!.fullName
      });

      setCreatedInfo({ code: result.accessCode });
      toast.success("Reserva Aura criada!");
    } catch (error) {
      toast.error("Erro ao salvar.");
    } finally { setLoading(false); }
  };

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
      <div className="p-8 max-w-6xl mx-auto space-y-8 pb-20">
        <header className="flex justify-between items-center">
          <h1 className="text-3xl font-black flex items-center gap-3 text-white"><PlusCircle className="text-primary"/> Nova Hospedagem</h1>
          {isSuperAdmin && (
            <select value={selectedPropertyId} onChange={e => setSelectedPropertyId(e.target.value)} className="bg-card border p-2 rounded-xl text-xs font-bold uppercase">
              <option value="">Trocar Propriedade</option>
              {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </header>

        <form onSubmit={handleCreate} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-6">
              <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4"><UserSearch size={18} className="text-primary"/> Identificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">CPF/Passaporte (Opcional)</label>
                  <div className="flex gap-2">
                    <input value={docNumber} onChange={e => setDocNumber(e.target.value)} onBlur={handleSearchGuest} className="flex-1 p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none"/>
                    <button type="button" onClick={handleSearchGuest} className="p-3 bg-primary/10 text-primary rounded-xl hover:bg-primary/20">
                      {searchingGuest ? <Loader2 className="animate-spin" size={20}/> : <Search size={20}/>}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">Nome do Titular *</label>
                  <input required value={guestData.fullName} onChange={e => setGuestData({...guestData, fullName: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">WhatsApp *</label>
                  <input required value={guestData.phone} onChange={e => setGuestData({...guestData, phone: e.target.value})} placeholder="+55..." className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-white/40">E-mail (Opcional)</label>
                  <input type="email" value={guestData.email} onChange={e => setGuestData({...guestData, email: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none"/>
                </div>
              </div>
            </div>

            {cabinSelections.length > 0 && (
              <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-6">
                <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4"><Users size={18} className="text-primary"/> Configuração ACF (Por Cabana)</h2>
                <div className="space-y-4">
                  {cabinSelections.map((sel, idx) => (
                    <div key={sel.cabinId} className="flex flex-col md:flex-row items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex-1 font-bold text-white">{sel.name}</div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <p className="text-[9px] font-bold uppercase text-white/30">Adultos</p>
                          <input type="number" value={sel.adults} onChange={e => updateCabinACF(idx, 'adults', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-primary outline-none" />
                        </div>
                        <div className="text-center border-x border-white/10 px-4">
                          <p className="text-[9px] font-bold uppercase text-white/30">Crianças</p>
                          <input type="number" value={sel.children} onChange={e => updateCabinACF(idx, 'children', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-white outline-none" />
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] font-bold uppercase text-white/30">Frees</p>
                          <input type="number" value={sel.babies} onChange={e => updateCabinACF(idx, 'babies', parseInt(e.target.value))} className="w-12 bg-transparent text-center font-bold text-white outline-none" />
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleCabin({id: sel.cabinId, name: sel.name} as any)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg"><Trash2 size={18}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-4">
              <h2 className="flex items-center gap-2 font-bold text-white/90 border-b border-white/5 pb-4"><Home size={18} className="text-primary"/> Unidades Disponíveis</h2>
              <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {availableCabins.map(cabin => (
                  <button
                    key={cabin.id}
                    type="button"
                    onClick={() => toggleCabin(cabin)}
                    className={cn("p-3 rounded-xl border text-[10px] font-bold uppercase transition-all", cabinSelections.find(s => s.cabinId === cabin.id) ? "border-primary bg-primary/10 text-primary" : "border-white/5 bg-white/5 text-white/40")}
                  >
                    {cabin.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#141414] border border-white/5 p-6 rounded-[24px] space-y-4">
              <div className="space-y-4">
                <input required type="date" value={stayDates.checkIn} onChange={e => setStayDates({...stayDates, checkIn: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white invert" />
                <input required type="date" value={stayDates.checkOut} onChange={e => setStayDates({...stayDates, checkOut: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white invert" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-2 bg-white/5 rounded-xl border border-white/5">
                <input type="checkbox" checked={sendAutomations} onChange={e => setSendAutomations(e.target.checked)} className="accent-primary" />
                <div className="flex flex-col"><span className="text-[10px] font-bold text-white uppercase tracking-tighter">Automação de WhatsApp</span><span className="text-[9px] text-white/30">48h e 24h pré-estadia</span></div>
              </label>
              <button type="submit" disabled={loading || cabinSelections.length === 0} className="w-full py-4 bg-primary text-primary-foreground font-black text-xl rounded-[24px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all">{loading ? <Loader2 className="animate-spin" /> : "Concluir"}</button>
            </div>
          </aside>
        </form>

        {createdInfo && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
            <div className="bg-[#141414] border border-white/10 p-10 rounded-[40px] max-w-sm w-full text-center space-y-8 shadow-2xl">
              <div className="w-20 h-20 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20"><Key size={40}/></div>
              <div><h3 className="text-3xl font-black text-white">Reserva Aura</h3><p className="text-muted-foreground mt-2">Hospedagem registrada com sucesso.</p></div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em]">Aura Access Code</span>
                <div className="text-5xl font-black text-primary tracking-tighter mt-2">{createdInfo.code}</div>
              </div>
              <button onClick={() => window.location.href = "/admin/stays"} className="w-full py-4 bg-white text-black font-black rounded-2xl">Voltar ao Painel</button>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}