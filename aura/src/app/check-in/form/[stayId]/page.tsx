"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { fetchCEP } from "@/lib/utils-checkin";
import { 
  Loader2, CheckCircle2, User, MapPin, Car, 
  Calendar, Dog, ArrowRight, Edit3, ChevronDown, 
  Users, Plane, HeartPulse, Info, Globe2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const countries = [
  { name: "Brasil", flag: "🇧🇷", ddi: "+55" },
  { name: "Estados Unidos", flag: "🇺🇸", ddi: "+1" },
  { name: "Argentina", flag: "🇦🇷", ddi: "+54" },
  { name: "Portugal", flag: "🇵🇹", ddi: "+351" },
  { name: "Uruguai", flag: "🇺🇾", ddi: "+598" },
  { name: "Chile", flag: "🇨🇱", ddi: "+56" },
  { name: "Paraguai", flag: "🇵🇾", ddi: "+595" },
];

export default function UnifiedPreCheckin() {
  const { stayId } = useParams();
  const router = useRouter();
  
  // Controle de Fluxo
  const [step, setStep] = useState<'group_manager' | 'form'>('form');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Estados de Dados
  const [guest, setGuest] = useState<any>({ address: {}, document: {}, nationality: "Brasil" });
  const [stay, setStay] = useState<any>({ transportation: 'Carro', petDetails: { species: 'Cachorro', weight: 5 } });
  const [cabin, setCabin] = useState<any>(null);
  const [groupStays, setGroupStays] = useState<any[]>([]);

  // Estados de UI
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCountrySelect, setShowCountrySelect] = useState(false);
  const [searchCountry, setSearchCountry] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        // Buscamos primeiro o grupo para identificar a propriedade correta
const allStays = await StayService.getGroupStays(""); // O Portal usa o AccessCode no login, aqui usaremos o stayId para filtrar
const data = await StayService.getStayWithGuestAndCabin(stay?.propertyId || "", stayId as string);
        if (!data) return router.push("/check-in/login");

        setGuest(data.guest);
        setStay(data.stay);
        setCabin(data.cabin);

        // Lógica de Grupo
        if (data.stay.groupId) {
          const allStays = await StayService.getGroupStays(data.stay.accessCode);
          if (allStays.length > 1) {
            setGroupStays(allStays);
            setStep('group_manager');
          }
        }
      } catch (error) {
        toast.error("Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [stayId]);

  const handleCEPChange = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8 && guest.nationality === "Brasil") {
      const data = await fetchCEP(cleanCep);
      if (data && !data.erro) {
        setGuest((prev: any) => ({
          ...prev,
          address: { 
            ...prev.address, 
            street: data.logradouro, 
            neighborhood: data.bairro, 
            city: data.localidade, 
            state: data.uf, 
            zipCode: cleanCep,
            country: "Brasil"
          }
        }));
        toast.success("Endereço localizado!");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await StayService.completePreCheckin(stay.propertyId, stayId as string, stay, guest);
      setIsSuccess(true);
    } catch (error) {
      toast.error("Erro ao salvar dados.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={40}/></div>;

  if (isSuccess) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-6 animate-in zoom-in duration-300">
        <CheckCircle2 size={80} className="mx-auto text-green-500" />
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Concluído!</h1>
        <p className="text-muted-foreground">Sua recepção digital foi finalizada. Aguardamos você!</p>
      </div>
    </div>
  );

  // --- VIEW: GESTÃO DE GRUPO ---
  if (step === 'group_manager') {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white p-6 flex flex-col items-center justify-center space-y-8">
        <div className="text-center space-y-2">
          <Users size={48} className="mx-auto text-primary mb-2" />
          <h1 className="text-3xl font-black uppercase tracking-tighter">Reserva de Grupo</h1>
          <p className="text-white/40 italic">Identificamos {groupStays.length} acomodações. Qual delas você ocupará?</p>
        </div>
        <div className="grid gap-4 w-full max-w-md">
          {groupStays.map((s) => (
            <button 
              key={s.id} 
              onClick={() => {
                if (s.id !== stayId) {
                   window.location.href = `/check-in/form/${s.id}`;
                } else {
                   setStep('form');
                }
              }}
              className={cn(
                "p-6 rounded-[32px] border text-left transition-all flex justify-between items-center",
                s.id === stayId ? "border-primary bg-primary/10" : "border-white/5 bg-white/5 hover:bg-white/10"
              )}
            >
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase">Unidade</p>
                <p className="text-xl font-black">{s.cabinName || "Acomodação"}</p>
              </div>
              <ArrowRight size={20} className={s.id === stayId ? "text-primary" : "text-white/20"} />
            </button>
          ))}
        </div>
      </main>
    );
  }

  // --- VIEW: FORMULÁRIO DETALHADO ---
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6 pb-24 font-sans">
      <form onSubmit={handleSave} className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-700">
        
        {/* 1. Nacionalidade & Identidade (FNRH) */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <User size={20} className="text-primary"/> 1. Identidade
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="text-[10px] font-bold text-white/40 uppercase mb-2 block">Nacionalidade</label>
              <button 
                type="button"
                onClick={() => setShowCountrySelect(!showCountrySelect)}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  {countries.find(c => c.name === guest.nationality)?.flag || "🏳️"} {guest.nationality || "Selecione..."}
                </span>
                <ChevronDown size={16} />
              </button>

              {showCountrySelect && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl z-50 shadow-2xl overflow-hidden animate-in slide-in-from-top-2">
                  <input 
                    className="w-full p-4 bg-white/5 border-b border-white/10 outline-none text-sm"
                    placeholder="Pesquisar país..."
                    value={searchCountry}
                    onChange={e => setSearchCountry(e.target.value)}
                  />
                  <div className="max-h-60 overflow-y-auto">
                    {countries.filter(c => c.name.toLowerCase().includes(searchCountry.toLowerCase())).map(c => (
                      <button 
                        key={c.name} type="button"
                        onClick={() => { setGuest({...guest, nationality: c.name}); setShowCountrySelect(false); }}
                        className="w-full p-4 text-left hover:bg-primary/10 flex items-center gap-3"
                      >
                        <span>{c.flag}</span> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">
                 {guest.nationality === "Brasil" ? "CPF" : "Passaporte / ID"}
              </label>
              <input 
                required
                value={guest.document?.number || ""} 
                onChange={e => setGuest({...guest, document: { ...guest.document, number: e.target.value }})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/40 uppercase">Nome Completo</label>
            <div className="flex gap-2">
              <input 
                readOnly={!isEditingName}
                value={guest.fullName || ""}
                onChange={e => setGuest({...guest, fullName: e.target.value})}
                className={cn("flex-1 bg-white/5 p-4 rounded-2xl outline-none", isEditingName ? "border-primary/40 ring-1 ring-primary/40" : "opacity-50")}
              />
              <button type="button" onClick={() => setIsEditingName(!isEditingName)} className="p-4 bg-white/5 rounded-2xl text-primary border border-white/5"><Edit3 size={18}/></button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Nascimento</label>
                <input type="date" 
                required 
                value={guest.birthDate || ""}
                onChange={e => setGuest({...guest, birthDate: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none invert" 
                />
                </div>
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Gênero</label>
                <select 
                value={guest.gender || ""}
                onChange={e => setGuest({...guest, gender: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none"
                >
                <option value="">Selecione...</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
                <option value="O">Outro</option>
                </select>
             </div>
          </div>
        </section>

        {/* 2. Residência Completa (FNRH) */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <MapPin size={20} className="text-primary"/> 2. Residência
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">CEP / Zip</label>
              <input onChange={e => handleCEPChange(e.target.value)} className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" />
            </div>
            <div className="md:col-span-3">
              <label className="text-[10px] font-bold text-white/40 uppercase">Logradouro (Rua/Av)</label>
              <input value={guest.address?.street || ""} className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" />
            </div>
            <div className="md:col-span-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Número</label>
              <input value={guest.address?.number || ""} onChange={e => setGuest({...guest, address: {...guest.address, number: e.target.value}})} className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" />
            </div>
            <div className="md:col-span-3">
              <label className="text-[10px] font-bold text-white/40 uppercase">Complemento (Opcional)</label>
              <input value={guest.address?.complement || ""} onChange={e => setGuest({...guest, address: {...guest.address, complement: e.target.value}})} className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" />
            </div>
          </div>
        </section>

        {/* 3. Logística & Montagem (Regressão Evitada) */}
        <section className="bg-primary/5 border border-primary/10 p-8 rounded-[40px] space-y-8 shadow-2xl shadow-primary/5">
          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-primary">Meio de Transporte</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {['Carro', 'Onibus', 'Avião', 'Navio', 'Outro'].map(m => (
                <button 
                  key={m} type="button"
                  onClick={() => setStay({...stay, transportation: m})}
                  className={cn("p-3 rounded-xl border text-[9px] font-black uppercase transition-all", stay.transportation === m ? "bg-primary text-black border-primary" : "bg-black/40 border-white/5 text-white/40")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {stay.transportation === 'Carro' && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-[10px] font-bold uppercase text-white/40">Placa do Veículo</label>
              <input value={stay.vehiclePlate || ""} onChange={e => setStay({...stay, vehiclePlate: e.target.value.toUpperCase()})} placeholder="ABC1D23" className="w-full bg-black/40 border border-white/10 p-5 rounded-3xl font-mono text-2xl tracking-widest text-primary text-center" />
            </div>
          )}

          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-white/60">Montagem da Unidade: {cabin?.name}</p>
            <div className="grid grid-cols-1 gap-3">
              {(cabin?.allowedSetups || ["Casal Padrão"]).map((setup: string) => (
                <button 
                  key={setup} type="button"
                  onClick={() => setStay({...stay, roomSetupNotes: setup})}
                  className={cn("p-4 rounded-2xl border text-left text-sm font-bold transition-all", stay.roomSetupNotes === setup ? "bg-white text-black border-white" : "bg-black/20 border-white/10 text-white/40")}
                >
                  {setup}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Itinerário FNRH (Nova Inteligência) */}
        <section className="space-y-6">
           <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <Plane size={20} className="text-primary"/> 3. Itinerário
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
            placeholder="Cidade de Origem" 
            value={stay.lastCity || ""}
            onChange={e => setStay({...stay, lastCity: e.target.value})}
            className="bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" 
            />
            <input 
            placeholder="Próximo Destino" 
            value={stay.nextCity || ""}
            onChange={e => setStay({...stay, nextCity: e.target.value})}
            className="bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" 
            />
            </div>
        </section>

        {/* 5. Pets (Customizado conforme solicitado) */}
        <section className="bg-orange-500/5 border border-orange-500/10 p-8 rounded-[40px] space-y-6">
          <label className="flex items-center gap-4 cursor-pointer group">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-colors", stay.hasPet ? "bg-orange-500 text-black" : "bg-white/5 text-orange-500")}>
              <Dog size={24} />
            </div>
            <div className="flex-1">
              <p className="font-black text-lg">Viajando com Pet?</p>
              <p className="text-[10px] text-white/30 uppercase">Até 15kg</p>
            </div>
            <input type="checkbox" checked={stay.hasPet} onChange={e => setStay({...stay, hasPet: e.target.checked})} className="w-6 h-6 accent-orange-500 rounded-lg" />
          </label>

          {stay.hasPet && (
            <div className="space-y-6 animate-in zoom-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input 
                placeholder="Nome" 
                value={stay.petDetails?.name || ""}
                onChange={e => setStay({...stay, petDetails: {...stay.petDetails, name: e.target.value}})}
                className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm" 
                />
                <input 
                placeholder="Raça" 
                value={stay.petDetails?.breed || ""}
                onChange={e => setStay({...stay, petDetails: {...stay.petDetails, breed: e.target.value}})}
                className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm" 
                />
                <select className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm outline-none">
                  <option>Cachorro</option>
                  <option>Gato</option>
                  <option>Outro</option>
                </select>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold uppercase text-orange-500">
                  <span>Peso: {stay.petDetails?.weight || 5}kg</span>
                  <span>Máx: 15kg</span>
                </div>
                <input 
                  type="range" min="1" max="15" 
                  value={stay.petDetails?.weight || 5} 
                  onChange={e => setStay({...stay, petDetails: {...stay.petDetails, weight: parseInt(e.target.value)}})}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
          )}
        </section>

        <button 
          type="submit" 
          disabled={isSaving}
          className="w-full py-8 bg-primary text-black font-black text-2xl rounded-[32px] shadow-[0_10px_40px_rgba(var(--primary),0.2)] hover:scale-[1.01] transition-all flex items-center justify-center gap-3"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : "Finalizar Pré-Check-in"}
        </button>

      </form>
    </main>
  );
}