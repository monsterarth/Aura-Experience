// src/app/check-in/form/[stayId]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { fetchCEP } from "@/lib/utils-checkin";
import { 
  Loader2, CheckCircle2, User, MapPin, 
  Dog, ArrowRight, Edit3, ChevronDown, 
  Users, Plane, AlertCircle, Plus, Trash2, Clock, Info
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
  { name: "Outro", flag: "🌍", ddi: "" },
];

export default function UnifiedPreCheckin() {
  const { stayId } = useParams();
  const router = useRouter();
  
  // Controle de Fluxo
  const [step, setStep] = useState<'group_manager' | 'form'>('form');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  
  // Estados de Dados
  const [guest, setGuest] = useState<any>({ 
    address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", complement: "" }, 
    document: { number: "" }, 
    nationality: "Brasil",
    fullName: "",
    birthDate: "",
    gender: "",
    phone: "",
    email: ""
  });
  
  const [stay, setStay] = useState<any>({ 
    transportation: 'Carro', 
    petDetails: { species: 'Cachorro', weight: 5, name: "", breed: "" },
    lastCity: "",
    nextCity: "",
    vehiclePlate: "",
    expectedArrivalTime: "",
    additionalGuests: [],
    counts: { adults: 1, children: 0, babies: 0 }
  });
  
  const [cabin, setCabin] = useState<any>(null);
  const [groupStays, setGroupStays] = useState<any[]>([]);

  // Estados de UI
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCountrySelect, setShowCountrySelect] = useState(false);
  const [searchCountry, setSearchCountry] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        if (!stayId) return;

        // Modificado: Não depende mais do estado 'stay' anterior para evitar loops
        // Busca o PropertyId diretamente pelo serviço se necessário
        const targetPropertyId = await StayService.findPropertyIdByStayId(stayId as string);

        if (!targetPropertyId) {
            toast.error("Hospedagem não encontrada.");
            return;
        }

        const data = await StayService.getStayWithGuestAndCabin(targetPropertyId, stayId as string);
        
        if (data) {
            setGuest((prev: any) => ({
                ...prev,
                ...data.guest,
                address: { ...prev.address, ...(data.guest?.address || {}) },
                document: { ...prev.document, ...(data.guest?.document || {}) }
            }));
            
            setStay((prev: any) => ({
                ...prev,
                ...data.stay,
                propertyId: targetPropertyId, 
                petDetails: { ...prev.petDetails, ...(data.stay?.petDetails || {}) },
                additionalGuests: data.stay.additionalGuests || [],
                counts: data.stay.counts || { adults: 1, children: 0, babies: 0 }
            }));
            
            setCabin(data.cabin);

            if (data.stay.groupId) {
                const allStays = await StayService.getGroupStays(data.stay.accessCode);
                if (allStays.length > 1) {
                    setGroupStays(allStays);
                    setStep('group_manager');
                }
            }
        }
      } catch (error) {
        console.error("Erro no loadData:", error);
        toast.error("Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [stayId]);

  const handleCEPChange = async (cep: string) => {
    setGuest((prev: any) => ({
        ...prev,
        address: { ...prev.address, zipCode: cep }
    }));

    const cleanCep = cep.replace(/\D/g, "");
    
    if (cleanCep.length === 8 && guest.nationality === "Brasil") {
      setLoadingCep(true);
      try {
          const data = await fetchCEP(cleanCep);
          if (data && !data.erro) {
            setGuest((prev: any) => ({
              ...prev,
              address: { 
                ...prev.address, 
                street: data.logradouro || "", 
                neighborhood: data.bairro || "", 
                city: data.localidade || "", 
                state: data.uf || "", 
                zipCode: cleanCep,
                country: "Brasil"
              }
            }));
            toast.success("Endereço localizado!");
          }
      } catch (err) {
          console.error("Erro CEP", err);
      } finally {
          setLoadingCep(false);
      }
    }
  };

  // --- LÓGICA DE ACOMPANHANTES (ATUALIZADA) ---

  const addGuest = (type: 'adult' | 'child' | 'free') => {
    const currentTotalGuests = 1 + (stay.additionalGuests?.length || 0);
    const maxCapacity = cabin?.capacity || 10; 

    if (currentTotalGuests >= maxCapacity) {
        return toast.error(`A capacidade máxima desta unidade é de ${maxCapacity} pessoas.`);
    }

    const currentTypeCount = stay.additionalGuests?.filter((g: any) => g.type === type).length || 0;
    
    let contractedLimit = 0;
    if (type === 'adult') contractedLimit = (stay.counts?.adults || 1) - 1; 
    else if (type === 'child') contractedLimit = stay.counts?.children || 0;
    else contractedLimit = stay.counts?.babies || 0;

    if (currentTypeCount >= contractedLimit) {
        toast.info("Hóspede extra adicionado.", {
            description: "Atenção: A quantidade excede sua reserva original. Taxas adicionais poderão ser aplicadas no check-in.",
            duration: 5000,
            icon: <Info className="text-blue-400" />
        });
    }

    setStay((prev: any) => ({
        ...prev,
        additionalGuests: [...(prev.additionalGuests || []), { 
            id: Date.now().toString(), 
            type, 
            fullName: "", 
            document: "" 
        }]
    }));
  };

  const removeGuest = (index: number) => {
    setStay((prev: any) => ({
        ...prev,
        additionalGuests: prev.additionalGuests.filter((_: any, i: number) => i !== index)
    }));
  };

  const updateGuest = (index: number, field: string, value: string) => {
    const newGuests = [...(stay.additionalGuests || [])];
    newGuests[index][field] = value;
    setStay({ ...stay, additionalGuests: newGuests });
  };

  const validateForm = () => {
    const errors = [];

    // 1. Identidade Titular
    if (!guest.fullName) errors.push("Nome Completo (Titular)");
    if (!guest.document?.number) errors.push("Documento (Titular)");
    if (!guest.birthDate) errors.push("Nascimento (Titular)");
    if (!guest.gender) errors.push("Gênero (Titular)");

    // 2. Endereço
    if (!guest.address?.zipCode) errors.push("CEP");
    if (!guest.address?.street) errors.push("Logradouro");
    if (!guest.address?.number) errors.push("Número (Endereço)");
    if (!guest.address?.neighborhood) errors.push("Bairro");
    if (!guest.address?.city) errors.push("Cidade");
    if (!guest.address?.state) errors.push("Estado");

    // 3. Viagem
    if (!stay.lastCity) errors.push("Cidade de Origem");
    if (!stay.nextCity) errors.push("Próximo Destino");
    if (!stay.expectedArrivalTime) errors.push("Horário Previsto de Chegada");

    // 4. Acompanhantes
    stay.additionalGuests?.forEach((g: any, index: number) => {
        if (!g.fullName) errors.push(`Nome do Acompanhante #${index + 1}`);
        if (!g.document && g.type === 'adult') errors.push(`Documento do Acompanhante #${index + 1}`);
    });

    return errors;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação de Campos Vazios (Obrigatória)
    const emptyErrors = validateForm();
    if (emptyErrors.length > 0) {
        alert(`Faltam os seguintes campos:\n\n- ${emptyErrors.join("\n- ")}`);
        return;
    }

    setIsSaving(true);
    try {
      if (!stay.propertyId) throw new Error("Erro de identificação da propriedade.");
      
      await StayService.completePreCheckin(stay.propertyId, stayId as string, stay, guest);
      setIsSuccess(true);
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculos para exibição e estilização dos badges
  const bookedAdults = stay.counts?.adults || 1;
  const bookedChildren = stay.counts?.children || 0;
  const bookedBabies = stay.counts?.babies || 0;

  const currentAdults = 1 + (stay.additionalGuests?.filter((g: any) => g.type === 'adult').length || 0);
  const currentChildren = stay.additionalGuests?.filter((g: any) => g.type === 'child').length || 0;
  const currentBabies = stay.additionalGuests?.filter((g: any) => g.type === 'free').length || 0;

  // Função auxiliar para cor do badge
  const getBadgeStyle = (current: number, booked: number) => {
      if (current === booked) return "bg-green-500/10 border-green-500/50 text-green-500";
      if (current > booked) return "bg-orange-500/10 border-orange-500/50 text-orange-500"; // Excedente
      return "bg-white/5 border-white/10 text-white/40"; // Incompleto
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={40}/></div>;

  if (isSuccess) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-6 animate-in zoom-in duration-300">
        <CheckCircle2 size={80} className="mx-auto text-green-500" />
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Tudo Pronto!</h1>
        <p className="text-white/60">Seu pré-check-in foi realizado com sucesso.</p>
        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-sm font-bold text-white">Código de Acesso</p>
            <p className="text-3xl font-black text-primary tracking-widest mt-2">{stay.accessCode}</p>
        </div>
        <div className="space-y-2">
            <button onClick={() => router.push(`/check-in/${stay.accessCode}`)} className="w-full py-4 bg-primary text-black font-bold rounded-xl">
                Acessar Portal do Hóspede
            </button>
        </div>
      </div>
    </div>
  );

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

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6 pb-24 font-sans">
      <form onSubmit={handleSave} className="max-w-2xl mx-auto space-y-12 animate-in fade-in duration-700">
        
        {/* 1. Identidade Titular */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <User size={20} className="text-primary"/> 1. Titular da Reserva
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="text-[10px] font-bold text-white/40 uppercase mb-2 block">Nacionalidade *</label>
              <button 
                type="button"
                onClick={() => setShowCountrySelect(!showCountrySelect)}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between hover:border-primary/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {countries.find(c => c.name === guest.nationality)?.flag || "🏳️"} {guest.nationality || "Selecione..."}
                </span>
                <ChevronDown size={16} />
              </button>

              {showCountrySelect && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl z-50 shadow-2xl overflow-hidden animate-in slide-in-from-top-2">
                  <input 
                    className="w-full p-4 bg-white/5 border-b border-white/10 outline-none text-sm text-white placeholder:text-white/20"
                    placeholder="Pesquisar país..."
                    value={searchCountry}
                    onChange={e => setSearchCountry(e.target.value)}
                    autoFocus
                  />
                  <div className="max-h-60 overflow-y-auto">
                    {countries.filter(c => c.name.toLowerCase().includes(searchCountry.toLowerCase())).map(c => (
                      <button 
                        key={c.name} type="button"
                        onClick={() => { setGuest({...guest, nationality: c.name}); setShowCountrySelect(false); }}
                        className="w-full p-4 text-left hover:bg-primary/10 flex items-center gap-3 text-white"
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
                 {guest.nationality === "Brasil" ? "CPF *" : "Passaporte / ID *"}
              </label>
              <input 
                value={guest.document?.number || ""} 
                onChange={e => setGuest({...guest, document: { ...guest.document, number: e.target.value }})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors"
                placeholder={guest.nationality === "Brasil" ? "000.000.000-00" : "Documento"}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/40 uppercase">Nome Completo *</label>
            <div className="flex gap-2">
              <input 
                readOnly={!isEditingName}
                value={guest.fullName || ""}
                onChange={e => setGuest({...guest, fullName: e.target.value})}
                className={cn(
                    "flex-1 bg-white/5 p-4 rounded-2xl outline-none transition-all", 
                    isEditingName ? "border border-primary/40 focus:border-primary" : "border border-white/5 opacity-80"
                )}
              />
              <button 
                type="button" 
                onClick={() => setIsEditingName(!isEditingName)} 
                className="p-4 bg-white/5 rounded-2xl text-primary border border-white/5 hover:bg-white/10 transition-colors"
                title="Editar Nome"
              >
                <Edit3 size={18}/>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Nascimento *</label>
                <input type="date" 
                value={guest.birthDate || ""}
                onChange={e => setGuest({...guest, birthDate: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none invert-0 text-white placeholder-gray-500 focus:border-primary/50 transition-colors" 
                />
             </div>
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Gênero *</label>
                <select 
                value={guest.gender || ""}
                onChange={e => setGuest({...guest, gender: e.target.value})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors"
                >
                <option value="" disabled>Selecione...</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
                <option value="O">Outro</option>
                </select>
             </div>
          </div>
        </section>

        {/* 2. Acompanhantes (FLEXÍVEL) */}
        <section className="space-y-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
                <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
                    <Users size={20} className="text-primary"/> 2. Acompanhantes
                </h3>
            </div>

            {/* Resumo da Reserva com Feedback Visual */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className={cn("p-2 rounded-xl border transition-colors", getBadgeStyle(currentAdults, bookedAdults))}>
                    <p className="font-bold">Adultos</p>
                    <p>{currentAdults} de {bookedAdults} {currentAdults > bookedAdults && "(Extra)"}</p>
                </div>
                <div className={cn("p-2 rounded-xl border transition-colors", getBadgeStyle(currentChildren, bookedChildren))}>
                    <p className="font-bold">Crianças</p>
                    <p>{currentChildren} de {bookedChildren} {currentChildren > bookedChildren && "(Extra)"}</p>
                </div>
                <div className={cn("p-2 rounded-xl border transition-colors", getBadgeStyle(currentBabies, bookedBabies))}>
                    <p className="font-bold">Bebês</p>
                    <p>{currentBabies} de {bookedBabies} {currentBabies > bookedBabies && "(Extra)"}</p>
                </div>
            </div>
            
            <div className="space-y-4">
                {stay.additionalGuests?.map((g: any, idx: number) => (
                    <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4 animate-in slide-in-from-left">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold uppercase text-primary bg-primary/10 px-2 py-1 rounded">
                                {g.type === 'adult' ? "Adulto" : g.type === 'child' ? "Criança" : "Free (Bebê)"}
                            </span>
                            <button type="button" onClick={() => removeGuest(idx)} className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg"><Trash2 size={16}/></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-white/40">Nome Completo *</label>
                                <input 
                                    value={g.fullName} 
                                    onChange={e => updateGuest(idx, 'fullName', e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl outline-none text-sm focus:border-primary/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-white/40">Documento {g.type === 'adult' ? '*' : '(Opcional)'}</label>
                                <input 
                                    value={g.document} 
                                    onChange={e => updateGuest(idx, 'document', e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl outline-none text-sm focus:border-primary/50"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <div className="flex gap-2 overflow-x-auto pb-2">
                    <button 
                        type="button" 
                        onClick={() => addGuest('adult')} 
                        className="flex-1 min-w-[120px] py-3 bg-white/5 border border-white/10 hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase hover:text-primary transition-all active:scale-95"
                    >
                        <Plus size={14}/> Add Adulto
                    </button>
                    <button 
                        type="button" 
                        onClick={() => addGuest('child')} 
                        className="flex-1 min-w-[120px] py-3 bg-white/5 border border-white/10 hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase hover:text-primary transition-all active:scale-95"
                    >
                        <Plus size={14}/> Add Criança
                    </button>
                    <button 
                        type="button" 
                        onClick={() => addGuest('free')} 
                        className="flex-1 min-w-[120px] py-3 bg-white/5 border border-white/10 hover:border-primary/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase hover:text-primary transition-all active:scale-95"
                    >
                        <Plus size={14}/> Add Bebê
                    </button>
                </div>
            </div>
        </section>

        {/* 3. Residência Completa */}
        <section className="space-y-6">
          <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
             <MapPin size={20} className="text-primary"/> 3. Residência
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">CEP / Zip *</label>
              <div className="relative">
                <input 
                    value={guest.address?.zipCode || ""}
                    onChange={e => handleCEPChange(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors"
                    placeholder="00000-000"
                />
                {loadingCep && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
              </div>
            </div>
            
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Logradouro (Rua/Av) *</label>
              <input 
                value={guest.address?.street || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, street: e.target.value}})}
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
              />
            </div>
            
            <div className="md:col-span-1 space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Número *</label>
              <input 
                value={guest.address?.number || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, number: e.target.value}})} 
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                placeholder="S/N"
              />
            </div>
            
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Complemento</label>
              <input 
                value={guest.address?.complement || ""} 
                onChange={e => setGuest({...guest, address: {...guest.address, complement: e.target.value}})} 
                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
              />
            </div>

            <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Bairro *</label>
                <input 
                    value={guest.address?.neighborhood || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, neighborhood: e.target.value}})} 
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                />
            </div>
            <div className="md:col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Cidade *</label>
                <input 
                    value={guest.address?.city || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, city: e.target.value}})} 
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                />
            </div>
            <div className="md:col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Estado (UF) *</label>
                <input 
                    value={guest.address?.state || ""} 
                    onChange={e => setGuest({...guest, address: {...guest.address, state: e.target.value}})} 
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                    maxLength={2}
                />
            </div>
          </div>
        </section>

        {/* 4. Viagem & Logística */}
        <section className="bg-primary/5 border border-primary/10 p-8 rounded-[40px] space-y-8 shadow-2xl shadow-primary/5">
          <div className="space-y-6">
             <h3 className="text-xl font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-2">
                <Plane size={20} className="text-primary"/> 4. Viagem
             </h3>
             
             {/* Previsão de Chegada */}
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Horário Previsto de Chegada *</label>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-4 rounded-2xl">
                    <Clock size={18} className="text-primary"/>
                    <input 
                        type="time"
                        value={stay.expectedArrivalTime || ""}
                        onChange={e => setStay({...stay, expectedArrivalTime: e.target.value})}
                        className="bg-transparent outline-none text-white font-bold w-full"
                    />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase">Origem (Cidade/UF) *</label>
                    <input 
                    placeholder="Ex: São Paulo/SP" 
                    value={stay.lastCity || ""}
                    onChange={e => setStay({...stay, lastCity: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/40 uppercase">Destino (Cidade/UF) *</label>
                    <input 
                    placeholder="Ex: Florianópolis/SC" 
                    value={stay.nextCity || ""}
                    onChange={e => setStay({...stay, nextCity: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 p-4 rounded-2xl outline-none focus:border-primary/50 transition-colors" 
                    />
                </div>
             </div>
          </div>

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
              <input value={stay.vehiclePlate || ""} onChange={e => setStay({...stay, vehiclePlate: e.target.value.toUpperCase()})} placeholder="ABC1D23" className="w-full bg-black/40 border border-white/10 p-5 rounded-3xl font-mono text-2xl tracking-widest text-primary text-center focus:border-primary/50 outline-none" />
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

        {/* 5. Pets */}
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
                className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors" 
                />
                <input 
                placeholder="Raça" 
                value={stay.petDetails?.breed || ""}
                onChange={e => setStay({...stay, petDetails: {...stay.petDetails, breed: e.target.value}})}
                className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm focus:border-orange-500/50 outline-none transition-colors" 
                />
                <select className="bg-black/40 border border-white/10 p-4 rounded-2xl text-sm outline-none focus:border-orange-500/50 transition-colors text-white">
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

        {/* Warning de obrigatoriedade */}
        <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-500 text-xs">
            <AlertCircle size={16} />
            <p>Todos os campos marcados com <strong>*</strong> são obrigatórios.</p>
        </div>

        <button 
          type="submit" 
          disabled={isSaving}
          className="w-full py-8 bg-primary text-black font-black text-2xl rounded-[32px] shadow-[0_10px_40px_rgba(var(--primary),0.2)] hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : "Finalizar Pré-Check-in"}
        </button>

      </form>
    </main>
  );
}